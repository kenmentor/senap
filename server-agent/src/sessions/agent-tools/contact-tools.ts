import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid } from "./store.js";

function digitsOf(jid: string): string {
  return jid.split("@")[0].replace(/\D/g, "");
}

function matchesContact(jid: string, name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (name.toLowerCase().includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  return qDigits.length >= 4 && digitsOf(jid).includes(qDigits);
}

export const contactTools: ToolDefinition[] = [
  {
    name: "resolve_contact",
    description:
      "Find a contact by name or phone number from chats seen on this WhatsApp account. Returns their JID and known name. If they never chatted here, verifies the number exists on WhatsApp. OWNER ONLY — the contact list belongs to the shop, customers may never browse it.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or phone number, e.g. 'Adaeze' or '+234 801 234 5678'." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const query = toolArgs.asString(args.query).trim();
      if (!query) return { error: "Empty query." };
      const hits: { jid: string; name: string; lastSeen: number }[] = [];
      for (const [jid, c] of ctx.contacts) {
        if (matchesContact(jid, c.name, query)) hits.push({ jid, ...c });
      }
      if (hits.length > 0) return { contacts: hits.slice(0, 5) };
      // Unknown here — check the number really exists on WhatsApp.
      let jid: string;
      try {
        jid = normalizeJid(query);
      } catch {
        return { contacts: [], note: `"${query}" is not a known contact nor a valid phone number.` };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const results = await ctx.sock.onWhatsApp(jid);
        const result = results?.[0];
        return {
          contacts: result?.exists ? [{ jid: result.jid, name: "unknown", lastSeen: 0 }] : [],
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Lookup failed." };
      }
    },
  },
  {
    name: "get_contact_name",
    description:       "Get the display name for a WhatsApp JID or phone number, as seen in chats here. Returns 'unknown' if never seen. OWNER ONLY.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        jid: { type: "string", description: "JID like '2348012345678@s.whatsapp.net' or a phone number." },
      },
      required: ["jid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const raw = toolArgs.asString(args.jid).trim();
      if (!raw) return { error: "Empty JID." };
      const key = raw.includes("@") ? raw : (() => { try { return normalizeJid(raw); } catch { return raw; } })();
      return { jid: key, name: ctx.contacts.get(key)?.name ?? "unknown" };
    },
  },
  {
    name: "get_avatar_url",
    description:       "Get the WhatsApp profile picture URL for a JID or phone number. Null when they have none or it cannot be fetched. OWNER ONLY.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        jid: { type: "string", description: "JID or phone number." },
      },
      required: ["jid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const raw = toolArgs.asString(args.jid).trim();
      if (!raw) return { error: "Empty JID." };
      let jid: string;
      try {
        jid = normalizeJid(raw);
      } catch {
        return { error: `"${raw}" is not a valid phone number or JID.` };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const url = await ctx.sock.profilePictureUrl(jid);
        return { jid, url: url ?? null };
      } catch {
        return { jid, url: null };
      }
    },
  },
  {
    name: "list_recent_chats",
    description:       "List recent chats on this account with the last message preview and time. OWNER ONLY — chats belong to other customers, never reveal them.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max chats (1-20, default 10)." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const limit = Math.min(Math.max(toolArgs.asNumber(args.limit, 10), 1), 20);
      const chats = [...ctx.messageLog.entries()]
        .map(([jid, messages]) => {
          const last = messages[messages.length - 1];
          return {
            jid,
            name: ctx.contacts.get(jid)?.name ?? "unknown",
            lastText: last?.text ?? "",
            lastFromMe: last?.fromMe ?? false,
            lastAt: last ? new Date(last.ts).toISOString() : null,
            messageCount: messages.length,
          };
        })
        .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
        .slice(0, limit);
      return { chats };
    },
  },
];
