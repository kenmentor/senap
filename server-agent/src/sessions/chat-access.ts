import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "./mongo.js";

interface ChatSettingsRow {
  userId: string;
  mode: "open" | "exclusive";
}

interface ContactRuleRow {
  userId: string;
  jid: string;
  name: string;
  list: "black" | "white";
}

const ChatSettingsView =
  mongoose.models.AgentChatSettings ??
  mongoose.model<ChatSettingsRow>(
    "AgentChatSettings",
    new Schema<ChatSettingsRow>(
      { userId: String, mode: String },
      { collection: "chatsettings" },
    ),
  );

const ContactRuleView =
  mongoose.models.AgentContactRule ??
  mongoose.model<ContactRuleRow>(
    "AgentContactRule",
    new Schema<ContactRuleRow>(
      { userId: String, jid: String, name: String, list: String },
      { collection: "contactrules" },
    ),
  );

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

interface CachedAccess {
  mode: "open" | "exclusive";
  black: Set<string>;
  white: Set<string>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, CachedAccess>();

export function invalidateChatAccess(userId: string): void {
  cache.delete(userId);
}

async function loadAccess(userId: string): Promise<CachedAccess> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit;
  await ensureConn();
  const [settings, rules] = await Promise.all([
    ChatSettingsView.findOne({ userId }).lean(),
    ContactRuleView.find({ userId }).lean(),
  ]);
  const access: CachedAccess = {
    mode: settings?.mode === "exclusive" ? "exclusive" : "open",
    black: new Set(),
    white: new Set(),
    fetchedAt: Date.now(),
  };
  for (const r of rules ?? []) {
    if (r.list === "black") access.black.add(r.jid);
    else access.white.add(r.jid);
  }
  cache.set(userId, access);
  return access;
}

/** True when this chat sits on the block list (opt-outs land here). */
export async function isBlacklisted(userId: string, remoteJid: string): Promise<boolean> {
  try {
    const access = await loadAccess(userId);
    return access.black.has(remoteJid);
  } catch {
    return false;
  }
}

/** STOP / opt-out: block future broadcasts + agent replies for this chat. */
export async function addToBlacklist(userId: string, remoteJid: string, name?: string): Promise<void> {
  await ensureConn();
  await ContactRuleView.updateOne(
    { userId, jid: remoteJid },
    { $set: { name: (name ?? "unknown").slice(0, 120), list: "black" } },
    { upsert: true },
  );
  invalidateChatAccess(userId);
}

/** START / re-opt-in: lift the block so broadcasts + replies resume. */
export async function removeFromBlacklist(userId: string, remoteJid: string): Promise<boolean> {
  await ensureConn();
  const res = await ContactRuleView.deleteOne({ userId, jid: remoteJid, list: "black" });
  invalidateChatAccess(userId);
  return res.deletedCount > 0;
}

/**
 * Hard gate: blacklisted chats are always dropped; in exclusive mode only
 * whitelisted chats get through. Fails CLOSED on DB error — a session that
 * cannot verify access stays silent rather than risk answering someone
 * who must never be peeked into.
 */
export async function isChatAllowed(userId: string, remoteJid: string): Promise<boolean> {
  let access: CachedAccess;
  try {
    access = await loadAccess(userId);
  } catch (e) {
    console.error(`Chat access check failed for ${userId}, dropping message (DB unreachable):`, e);
    return false;
  }
  if (access.black.has(remoteJid)) return false;
  if (access.mode === "exclusive" && !access.white.has(remoteJid)) return false;
  return true;
}
