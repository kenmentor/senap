import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import type { Contact } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import type { WAMessage } from "@whiskeysockets/baileys";
import sendWithTyping from "./whatsapp-sender.js";
import { prepareCustomerMessage } from "./message-skill.js";
import { useMongoAuthState } from "./mongo-auth-state.js";
import ConversationHistory from "./conversation-history.js";
import { isChatAllowed } from "./chat-access.js";
import { isSelfJid } from "./agent-tools/store.js";
import { handleCustomerMessage } from "../assistant/agent-runner.js";
import type {
  BufferedMessage,
  GroupContext,
  KnownContact,
} from "./agent-tools/tool-types.js";

const MAX_LOGGED_PER_CHAT = 100;

/** Baileys is extremely chatty at info level — keep warnings/errors only. */
const waLogger = pino({ level: process.env.WA_LOG_LEVEL ?? "warn" });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Split a reply into natural chat bubbles (max 3): paragraph breaks first,
 * then sentence boundaries for anything still long. Short answers stay whole;
 * overflow merges into the last bubble.
 */
function splitReply(text: string, max = 3, soft = 320): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const base = paras.length > 0 ? paras : [text.trim()];
  const out: string[] = [];
  const pushChunk = (c: string) => {
    const t = c.trim();
    if (!t) return;
    if (out.length < max) out.push(t);
    else out[out.length - 1] = `${out[out.length - 1]} ${t}`;
  };
  for (const p of base) {
    if (p.length <= soft) {
      pushChunk(p);
      continue;
    }
    const sentences = p.match(/[^.!?…]+[.!?…]+["”']?\s*/g) ?? [p];
    let buf = "";
    for (const s of sentences) {
      if (buf && buf.length + s.length > soft) {
        pushChunk(buf);
        buf = s;
      } else {
        buf += s;
      }
    }
    pushChunk(buf);
  }
  return out.length > 0 ? out : [text.trim()];
}

import { wasProcessed, markProcessed } from "./processed.js";

/**
 * Keyword fallback when the legitimacy probe is down: a price figure or
 * selling words in the caption. Conservative — plain vibes never list.
 */
const SELL_WORDS = /(price|stock|available|sizes?|colou?rs?|\bdm\b|order|buy|sell|wholesale|retail|promo|discount|deliver|pick\s?up|call\s|new arrival|uk used|for sale|₦|NGN|₵|GHS|KSh|\$|\d[\d,]*\s*k\b|\d[\d,]{3,})/i;

/**
 * Draft a product from a status caption. Name = first line; price sniffs
 * "150k", "₦155,000", "$200", "₵500" style figures (k-suffix = thousands).
 */
function parseStatusCaption(caption: string): { name: string; price: number } {
  const lines = caption
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const name = (lines[0] ?? "").slice(0, 120) || "New arrival";
  let price = 0;
  const k = caption.match(/(\d[\d,]*)\s*k\b/i);
  if (k) {
    price = Math.round(parseFloat(k[1].replace(/,/g, "")) * 1000);
  } else {
    const n = caption.match(/(?:₦|NGN|₵|GHS|KSh|Ksh|USD|\$)\s*([\d,]+(?:\.\d+)?)/i);
    if (n) price = Math.round(parseFloat(n[1].replace(/,/g, "")));
  }
  return { name, price: Math.max(0, price) };
}

export type SessionStatus =
  | "idle"
  | "starting"
  | "qr"
  | "open"
  | "closed"
  | "logged_out";

export type IncomingKind = "text" | "photo" | "video" | "document" | "audio" | "sticker";

/**
 * Pull usable content out of any incoming message. Text (or a media
 * caption) becomes the reply basis; media without words still gets an
 * honest acknowledgement instead of silence. Returns null only for
 * truly empty/protocol messages.
 */
function extractIncoming(
  m: WAMessage,
): { text: string; kind: IncomingKind; mentioned: string[]; quotedParticipant: string | null; quotedText: string } | null {
  const msg = m.message;
  if (!msg) return null;
  // Mentions + quotes live in contextInfo — needed to know when the bot is
  // actually being addressed in a group (vs. background chatter).
  const ctxOf = (c: unknown): { mentionedJid?: unknown; participant?: unknown; quotedMessage?: unknown } =>
    (c as { contextInfo?: { mentionedJid?: unknown; participant?: unknown; quotedMessage?: unknown } } | null | undefined)?.contextInfo ?? {};
  const asJids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const asJid = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  /** Pull the highlighted (replied-to) message's text so the model sees WHAT was quoted, not just who. */
  const quotedTextOf = (qm: unknown): string => {
    if (!qm || typeof qm !== "object") return "";
    const q = qm as Record<string, unknown>;
    if (typeof q.conversation === "string" && q.conversation.trim()) return q.conversation.trim();
    const ext = q.extendedTextMessage as { text?: unknown } | undefined;
    if (ext && typeof ext.text === "string" && ext.text.trim()) return ext.text.trim();
    const media: [string, string][] = [
      ["imageMessage", "photo"],
      ["videoMessage", "video"],
      ["documentMessage", "document"],
      ["audioMessage", "voice note"],
      ["stickerMessage", "sticker"],
    ];
    for (const [field, label] of media) {
      const part = q[field] as { caption?: unknown } | undefined;
      if (part && typeof part === "object") {
        const cap = typeof part.caption === "string" ? part.caption.trim() : "";
        return cap ? `[${label}] ${cap}` : `[${label}]`;
      }
    }
    return "";
  };
  const direct = msg.conversation || msg.extendedTextMessage?.text;
  if (direct) {
    const ctx = ctxOf(msg.extendedTextMessage);
    return { text: direct, kind: "text", mentioned: asJids(ctx.mentionedJid), quotedParticipant: asJid(ctx.participant), quotedText: quotedTextOf(ctx.quotedMessage) };
  }
  if (msg.imageMessage) {
    const ctx = ctxOf(msg.imageMessage);
    return {
      text: msg.imageMessage.caption ?? "",
      kind: "photo",
      mentioned: asJids(ctx.mentionedJid),
      quotedParticipant: asJid(ctx.participant),
      quotedText: quotedTextOf(ctx.quotedMessage),
    };
  }
  if (msg.videoMessage) {
    const ctx = ctxOf(msg.videoMessage);
    return {
      text: msg.videoMessage.caption ?? "",
      kind: "video",
      mentioned: asJids(ctx.mentionedJid),
      quotedParticipant: asJid(ctx.participant),
      quotedText: quotedTextOf(ctx.quotedMessage),
    };
  }
  if (msg.documentMessage) {
    const ctx = ctxOf(msg.documentMessage);
    return {
      text: msg.documentMessage.caption ?? "",
      kind: "document",
      mentioned: asJids(ctx.mentionedJid),
      quotedParticipant: asJid(ctx.participant),
      quotedText: quotedTextOf(ctx.quotedMessage),
    };
  }
  if (msg.audioMessage) {
    const ctx = ctxOf(msg.audioMessage);
    return { text: "", kind: "audio", mentioned: [], quotedParticipant: null, quotedText: quotedTextOf(ctx.quotedMessage) };
  }
  if (msg.stickerMessage) {
    const ctx = ctxOf(msg.stickerMessage);
    return { text: "", kind: "sticker", mentioned: [], quotedParticipant: null, quotedText: quotedTextOf(ctx.quotedMessage) };
  }
  return null;
}

export class WhatsappSession {
  userId: string;
  sock: ReturnType<typeof makeWASocket> | null = null;
  status: SessionStatus = "idle";
  qr: string | null = null;
  /** 8-char code from requestPairingCode (typed into WhatsApp on the phone). */
  pairingCode: string | null = null;
  lastError: string | null = null;
  private histories = new Map<string, ConversationHistory>();
  private contacts = new Map<string, KnownContact>();
  private messageLog = new Map<string, BufferedMessage[]>();
  private clearAuth: (() => Promise<void>) | null = null;
  /**
   * Low-RAM guards: per-chat serialization chains + last-activity stamps.
   * Chains are tiny promises freed on completion; activity drives LRU eviction
   * of idle chats so an always-on session doesn't grow without bound.
   */
  private chatChains = new Map<string, Promise<void>>();
  private chatActivity = new Map<string, number>();
  /** Watermark: newest messageLog ts already mirrored into LLM history (per chat). Stops backdrop re-injection. */
  private backdropTs = new Map<string, number>();
  private static readonly MAX_CHATS = 200;
  private static readonly IDLE_EVICT_MS = 30 * 60_000;
  private static readonly MAX_INCOMING = 2000;

  /**
   * IDs already answered (in-memory). Offline backlog can arrive twice
   * (history sync + live upsert, or notify + append) — this stops double
   * replies after a restart/disconnect.
   */
  private seenMessageIds = new Set<string>();

  /** True if this message was already handled. Bounded LRU-ish (cap 2000). */
  private markSeen(id: string): boolean {
    if (this.seenMessageIds.has(id)) return true;
    this.seenMessageIds.add(id);
    if (this.seenMessageIds.size > 2000) {
      const oldest = this.seenMessageIds.values().next().value;
      if (oldest !== undefined) this.seenMessageIds.delete(oldest);
    }
    return false;
  }

  private stopped = false;

  /** Last meaningful session activity (start, qr, open, close) — drives the abandoned-session sweep. */
  private lastTouchAt = Date.now();
  private touchSession(): void {
    this.lastTouchAt = Date.now();
  }
  /** Milliseconds timestamp of last activity (for SessionManager.sweepAbandoned). */
  lastTouchedAt(): number {
    return this.lastTouchAt;
  }

  /** Consecutive failed (re)connects — drives the backoff so a dead network
   *  or WhatsApp outage retries patiently instead of spinning hot. */
  private reconnectFailures = 0;

  /**
   * Generation counter: every physical (re)connect bumps it. Stale sockets
   * and timers from a previous generation are ignored, so two sockets for
   * the same account can never fight (the "replaced/conflict" loop).
   */
  private epoch = 0;
  /** Generation of the in-flight dial (stale dials are never shared). */
  private connectEpoch = 0;
  /** In-flight connect — concurrent callers share it instead of dialling twice. */
  private connectPromise: Promise<void> | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Serialize work per chat: a live customer message and a scheduled task
   * interrupt for the SAME chat never run concurrently, so history can't
   * interleave (last-write-wins). Different chats run in parallel.
   * Chain entries are deleted when idle — no memory growth.
   */
  private runExclusive<T>(chatJid: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chatChains.get(chatJid) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((r) => (release = r));
    const next = prev.then(() => tail.catch(() => {}));
    this.chatChains.set(chatJid, next);
    const out = prev.then(fn);
    return out.finally(() => {
      release();
      if (this.chatChains.get(chatJid) === next) this.chatChains.delete(chatJid);
    });
  }

  /**
   * One account, one voice at a time. Every socket write for this session
   * funnels through a single chain with a human-like gap between DIFFERENT
   * chats (same-chat bubbles stay fast). Parallel replies from one number are
   * a classic ban signal — this makes them impossible by construction.
   * Costs nothing when quiet: zero waits unless two chats send back-to-back.
   */
  private sendChain: Promise<void> = Promise.resolve();
  private lastSendAt = 0;
  private lastSendChat = "";
  private sockProxy: { raw: unknown; proxy: ReturnType<typeof makeWASocket> } | null = null;
  private static readonly CROSS_CHAT_GAP_MS = 2500;
  private static readonly CROSS_CHAT_JITTER_MS = 1500;

  /** Proxied socket: only sendMessage is serialized+gapped, everything else passes through bound. */
  private liveSock(): ReturnType<typeof makeWASocket> | null {
    const raw = this.sock;
    if (!raw) return null;
    if (!this.sockProxy || this.sockProxy.raw !== raw) {
      const session = this;
      const proxy = new Proxy(raw, {
        get(target, prop) {
          if (prop === "sendMessage") {
            return (jid: string, content: unknown, options?: unknown) =>
              session.enqueueSend(String(jid), async () => {
                const t = target as unknown as {
                  sendMessage: (j: string, c: unknown, o?: unknown) => Promise<unknown>;
                };
                const sent = await t.sendMessage(jid, content, options);
                // Ledger our own sends: their server echoes return via upsert
                // as fromMe — matched here so we never answer ourselves.
                try {
                  const id = (sent as { key?: { id?: string } } | null | undefined)?.key?.id;
                  if (id) session.rememberOutId(id);
                } catch {
                  /* ledger is best-effort */
                }
                return sent as never;
              });
          }
          const value = (target as unknown as Record<string | symbol, unknown>)[prop];
          return typeof value === "function"
            ? (value as (...a: never[]) => unknown).bind(target)
            : value;
        },
      }) as unknown as ReturnType<typeof makeWASocket>;
      this.sockProxy = { raw, proxy };
    }
    return this.sockProxy.proxy;
  }

  /**
   * IDs of messages WE sent (recorded off every socket write). Their server
   * echoes come back through messages.upsert as fromMe — without this ledger
   * the bot would answer its own replies, especially in its self-chat.
   */
  private echoIds = new Map<string, number>();
  private static readonly ECHO_TTL_MS = 5 * 60_000;
  private static readonly ECHO_CAP = 500;
  /** Consecutive self-chat echoes of identical text (loop-breaker signal). */
  private echoStreak = 0;
  private lastEchoText: string | null = null;

  private rememberOutId(id: string): void {
    if (!id) return;
    const now = Date.now();
    for (const [k, at] of this.echoIds) {
      if (now - at > WhatsappSession.ECHO_TTL_MS) this.echoIds.delete(k);
      else break; // insertion-ordered: rest are newer
      if (this.echoIds.size < WhatsappSession.ECHO_CAP) break;
    }
    if (this.echoIds.size >= WhatsappSession.ECHO_CAP) {
      const oldest = this.echoIds.keys().next().value;
      if (oldest !== undefined) this.echoIds.delete(oldest);
    }
    this.echoIds.set(id, now);
  }

  /**
   * Newest message WE sent to this chat (or any namespace twin of it).
   * Form-agnostic on purpose: Baileys v7 mixes PN and LID JIDs, so the log
   * key we sent under can differ from the echo's remoteJid — comparing only
   * the exact key lets echoes slip through and loop forever.
   */
  private lastOutgoingText(remoteJid: string): { text: string; ts: number } | null {
    let best: { text: string; ts: number } | null = null;
    for (const [jid, log] of this.messageLog) {
      if (jid !== remoteJid && !isSelfJid(jid, remoteJid)) continue;
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.fromMe && e.text) {
          if (!best || e.ts > best.ts) best = { text: e.text, ts: e.ts };
          break;
        }
      }
    }
    return best;
  }

  /**
   * Is this chat the line's own "Message yourself" chat? Compares every known
   * form on both sides (PN vs LID, remoteJid vs remoteJidAlt) because Baileys
   * v7 mixes @s.whatsapp.net and @lid forms — a single digit-tail match
   * cannot work across those namespaces. Includes id + lid + phoneNumber
   * because `user.id` alone is often only one side of the pair.
   */
  private isOwnChatId(
    sock: ReturnType<typeof makeWASocket> | null,
    remoteJid: string,
    altJid?: string | null,
  ): boolean {
    const me = sock?.user as unknown as { id?: string; lid?: string; phoneNumber?: string } | null | undefined;
    const mine = [me?.id, me?.lid, me?.phoneNumber].filter((x): x is string => !!x);
    if (mine.length === 0 || !remoteJid) return false;
    const theirs = [remoteJid, altJid].filter((x): x is string => !!x);
    return theirs.some((t) => mine.some((s) => t === s || isSelfJid(t, s)));
  }

  /**
   * Async counterpart to isOwnChatId: resolves PN<->LID via Baileys'
   * signalRepository mapping so a PN session still recognises its LID
   * self-chat (and vice versa) even when `sock.user` only carries one side
   * and no remoteJidAlt arrived on the stanza.
   */
  private async resolveOwnChatId(
    sock: ReturnType<typeof makeWASocket> | null,
    remoteJid: string,
    altJid?: string | null,
  ): Promise<boolean> {
    if (!sock || !remoteJid) return false;
    if (this.isOwnChatId(sock, remoteJid, altJid)) return true;
    try {
      const repo = (sock as unknown as { signalRepository?: { lidMapping?: {
        getPNForLID: (lid: string) => Promise<string | null>;
        getLIDForPN: (pn: string) => Promise<string | null>;
      } } }).signalRepository?.lidMapping;
      if (!repo) return false;
      const me = sock?.user as unknown as { id?: string; lid?: string; phoneNumber?: string } | null | undefined;
      const mine = [me?.id, me?.lid, me?.phoneNumber].filter((x): x is string => !!x);
      const theirs = [remoteJid, altJid].filter((x): x is string => !!x);
      const isLid = (j: string) => j.toLowerCase().endsWith("@lid") || j.toLowerCase().endsWith("@hosted.lid");
      const isPn = (j: string) => {
        const s = j.toLowerCase().split("@")[1] ?? "";
        return s === "s.whatsapp.net" || s === "c.us" || s === "hosted";
      };
      for (const t of theirs) {
        if (isLid(t)) {
          const pn = await repo.getPNForLID(t).catch(() => null);
          if (pn && mine.some((s) => isSelfJid(pn, s) || isSelfJid(t, s))) return true;
        } else if (isPn(t)) {
          const lid = await repo.getLIDForPN(t).catch(() => null);
          if (lid && mine.some((s) => isSelfJid(lid, s))) return true;
        }
      }
      for (const s of mine) {
        if (isPn(s)) {
          const lid = await repo.getLIDForPN(s).catch(() => null);
          if (lid && theirs.some((t) => isSelfJid(t, lid))) return true;
        } else if (isLid(s)) {
          const pn = await repo.getPNForLID(s).catch(() => null);
          if (pn && theirs.some((t) => isSelfJid(t, pn))) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Append a socket write to the session-wide chain with a cross-chat human gap. */
  private enqueueSend<T>(jid: string, fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const gap =
        jid === this.lastSendChat
          ? 0
          : WhatsappSession.CROSS_CHAT_GAP_MS +
            Math.random() * WhatsappSession.CROSS_CHAT_JITTER_MS;
      const wait = Math.max(0, this.lastSendAt + gap - Date.now());
      if (wait > 0) await sleep(wait);
      // Ceiling: one hung socket write must never wedge the whole account —
      // the chain moves on and the failure surfaces to normal retry logic.
      const ceiling = new Promise<T>((_, reject) => {
        const t = setTimeout(() => reject(new Error("Send timed out (45s ceiling).")), 45_000);
        (t as unknown as { unref?: () => void }).unref?.();
      });
      try {
        return await Promise.race([fn(), ceiling]);
      } finally {
        this.lastSendAt = Date.now();
        this.lastSendChat = jid;
      }
    };
    const out = this.sendChain.then(run);
    this.sendChain = out.then(
      () => undefined,
      () => undefined,
    );
    return out;
  }

  private touch(chatJid: string): void {
    this.chatActivity.set(chatJid, Date.now());
    if (this.chatActivity.size % 25 === 0) this.trimMemory();
  }

  /**
   * Free RAM when idle without costing hot-path speed: evict chats past
   * MAX_CHATS (least-recently-active first) and any chat idle > 30min.
   * Contacts for evicted chats are dropped too — they reseed from WhatsApp
   * sync on next activity. Runs amortized (every 25 touches), O(n log n) worst.
   */
  trimMemory(): void {
    const now = Date.now();
    const chats = [...this.chatActivity.entries()].sort((a, b) => a[1] - b[1]);
    const over = this.chatActivity.size - WhatsappSession.MAX_CHATS;
    const evict = new Set<string>();
    for (const [jid, at] of chats) {
      if (now - at > WhatsappSession.IDLE_EVICT_MS) evict.add(jid);
    }
    if (over > 0) {
      for (let i = 0; i < over && i < chats.length; i++) evict.add(chats[i][0]);
    }
    for (const jid of evict) {
      this.histories.delete(jid);
      this.messageLog.delete(jid);
      this.contacts.delete(jid);
      this.chatActivity.delete(jid);
      this.chatChains.delete(jid);
      this.groupCtxCache.delete(jid);
      this.backdropTs.delete(jid);
    }
  }

  /**
   * Build a strictly scoped tool context for ONE chat: the agent only sees
   * this chat's log slice + its own contact row. Even a buggy tool cannot
   * enumerate another customer's messages through this view, because other
   * chats are simply not present in the Map.
   */
  private scopedContext(
    chatJid: string,
    sendText: (to: string, text: string) => Promise<void>,
    isOwner: boolean,
    sock: ReturnType<typeof makeWASocket> | null,
  ): {
    customerJid: string;
    isOwner: boolean;
    sendText: (to: string, text: string) => Promise<void>;
    sock: ReturnType<typeof makeWASocket> | null;
    contacts: Map<string, KnownContact>;
    messageLog: Map<string, BufferedMessage[]>;
  } {
    const scopedLog = new Map<string, BufferedMessage[]>();
    const log = this.messageLog.get(chatJid);
    if (log) scopedLog.set(chatJid, log);
    const scopedContacts = new Map<string, KnownContact>();
    const c = this.contacts.get(chatJid);
    if (c) scopedContacts.set(chatJid, c);
    return { customerJid: chatJid, isOwner, sendText, sock, contacts: scopedContacts, messageLog: scopedLog };
  }

  /** Group-context cache (subject/role/style, 10min TTL) — avoids a metadata fetch per message. */
  private groupCtxCache = new Map<string, { at: number; ctx: GroupContext }>();
  private static readonly GROUP_CTX_TTL_MS = 10 * 60_000;

  /**
   * Who the agent is in a group + how the group talks. Null for 1:1 chats.
   * Metadata failures degrade to a minimal context (never blocks the reply);
   * managed config comes from the durable store, style from live memory.
   */
  async groupContext(chatJid: string): Promise<GroupContext | null> {
    if (!chatJid.endsWith("@g.us")) return null;
    const hit = this.groupCtxCache.get(chatJid);
    if (hit && Date.now() - hit.at < WhatsappSession.GROUP_CTX_TTL_MS) return hit.ctx;

    let subject = this.contacts.get(chatJid)?.name;
    if (!subject || subject === "unknown") subject = "this group";
    let members = 0;
    let ownRole: GroupContext["ownRole"] = "member";
    try {
      if (this.sock && this.status === "open") {
        const meta = await this.sock.groupMetadata(chatJid);
        subject = meta.subject || subject;
        members = meta.participants?.length ?? 0;
        const own = this.ownForms();
        const me = (meta.participants ?? []).find((p) => own.some((s) => this.isSelfParticipant(p.id, s)));
        const flag = (me as { admin?: string | null } | undefined)?.admin;
        if (flag === "admin" || flag === "superadmin") ownRole = "admin";
      }
    } catch {
      /* offline metadata — minimal context still helps */
    }

    let managed: GroupContext["managed"] = null;
    let threshold = 0.3;
    try {
      const { getGroupAgent } = await import("./agent-tools/group-agent-store.js");
      const cfg = await getGroupAgent(this.userId, chatJid);
      if (cfg?.enabled) {
        managed = {
          name: cfg.name,
          role: cfg.role,
          personality: cfg.personality,
          duty: cfg.duty,
          maxPerDay: cfg.maxPerDay,
          styleExamples: cfg.styleExamples.length > 0 ? cfg.styleExamples : this.recentUserTexts(chatJid, 12),
        };
        threshold =
          typeof cfg.replyThreshold === "number"
            ? Math.min(1, Math.max(0, cfg.replyThreshold))
            : 0.35;
      }
    } catch {
      /* proceed unmanaged */
    }

    // Names that address the bot (persona, shop short name) for text matching.
    const names: string[] = [];
    let aimRole = "";
    try {
      const { loadPersona, loadBusiness } = await import("./agent-tools/store.js");
      const [persona, business] = await Promise.all([
        loadPersona(this.userId).catch(() => null),
        loadBusiness(this.userId).catch(() => null),
      ]);
      for (const n of [managed?.name, persona?.name, (business?.name ?? "").split(/\s+/)[0]]) {
        const t = (n ?? "").trim().toLowerCase();
        if (t.length >= 3 && !names.includes(t)) names.push(t);
      }
    } catch {
      /* name matching is best-effort */
    }
    try {
      const { loadPersona } = await import("./agent-tools/store.js");
      const personaForAim = await loadPersona(this.userId).catch(() => null);
      aimRole = `${managed?.role ?? ""} ${managed?.duty ?? ""} ${personaForAim?.role ?? ""}`.trim();
    } catch {
      aimRole = `${managed?.role ?? ""} ${managed?.duty ?? ""}`.trim();
    }
    const aim = this.deriveAimText(aimRole, !!managed);

    const ctx: GroupContext = { subject, members, ownRole, addressed: false, names, aim, threshold, managed };
    this.groupCtxCache.set(chatJid, { at: Date.now(), ctx });
    if (this.groupCtxCache.size > 200) {
      const oldest = [...this.groupCtxCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.groupCtxCache.delete(oldest[0]);
    }
    return ctx;
  }

  /** Last user texts in a chat (style learning + setup analysis), newest last. */
  recentUserTexts(chatJid: string, limit = 15): string[] {
    const log = this.messageLog.get(chatJid);
    if (!log) return [];
    const out: string[] = [];
    for (let i = log.length - 1; i >= 0 && out.length < limit; i--) {
      const t = (log[i]?.text ?? "").trim();
      if (!t || log[i].fromMe || /^\[.*\]$/.test(t) || t.length < 3) continue;
      const short = t.length > 160 ? `${t.slice(0, 160)}…` : t;
      if (!out.includes(short)) out.push(short);
    }
    return out.reverse();
  }

  /**
   * Aim of the assistant in a group, derived from its configured role — never
   * a hardcoded sales bias. The intent probe weighs messages against this aim,
   * so a support bot, a sales bot, and a vibe moderator each care about
   * different things.
   */
  private deriveAimText(roleText: string, managed: boolean): string {
    const t = roleText.toLowerCase();
    if (/(sell|sales?\b|promo|deal|market|vendor|\brep\b|marketer|shop|business)/.test(t)) {
      return "COMMERCIAL (sales): prices, offers, stock/availability, 'how much', and buying signals are top priority — never ignore a potential deal. Do not hard-sell outside commercial moments.";
    }
    if (/(support|help\b|customer care|service|care\b|complaint)/.test(t)) {
      return "SUPPORT: questions, complaints, and problems are top priority — a member in distress always gets an answer. Do not pitch products unprompted.";
    }
    if (/(vibe|mod\b|moderator|community|engag|hype|admin|fun)/.test(t)) {
      return "COMMUNITY (moderation + vibes): addressed messages, disputes needing a calm word, and hype moments deserve replies; keep order lightly. Never hard-sell.";
    }
    return managed
      ? "GENERAL group assistant: reply when addressed, asked something it can answer, or clearly useful — stay brief and human."
      : "GENERAL shop assistant: reply when addressed, asked something it can answer, or clearly useful — stay brief and human.";
  }

  /**
   * Confidence score: should the bot reply to THIS group message? Structural
   * signals only (addressing, questions) — intent comes from the aim-aware
   * probe, not keyword lists. Active by default: base 0.55, reply >= 0.45,
   * silent < 0.15, middle goes to the probe. Anti-flood stays but is light
   * so the bot feels present, not numb.
   */
  private groupReplyScore(input: {
    text: string;
    mentionedMe: boolean;
    quotedMe: boolean;
    nameHit: boolean;
    isOwner: boolean;
    managed: boolean;
    recentOurs: number;
  }): { score: number; reasons: string[] } {
    const { text, mentionedMe, quotedMe, nameHit, isOwner, managed, recentOurs } = input;
    if (isOwner) return { score: 1, reasons: ["owner"] };
    const trimmed = text.trim();
    const isQuestion = /\?\s*$/.test(trimmed);
    const addressed = mentionedMe || quotedMe || nameHit;
    // A bare figure ("150k", "120k last") is never small talk — it may be an
    // offer, a quote, or an answer. The probe (with context) decides.
    const hasFigure = /[\d₦$€£]/.test(trimmed) && /\d/.test(trimmed);
    let score = 0.55;
    const reasons: string[] = ["base"];
    if (mentionedMe) {
      score += 0.45;
      reasons.push("mentioned");
    }
    if (quotedMe) {
      score += 0.4;
      reasons.push("quoted-me");
    }
    if (nameHit) {
      score += 0.35;
      reasons.push("name");
    }
    if (isQuestion) {
      score += 0.3;
      reasons.push("question");
    }
    if (hasFigure) {
      score += 0.15;
      reasons.push("figure");
    }
    if (managed) {
      score += 0.15;
      reasons.push("managed");
    }
    if (recentOurs >= 2) {
      score -= 0.3;
      reasons.push("dominating");
    } else if (recentOurs === 1) {
      score -= 0.15;
      reasons.push("just-spoke");
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (!addressed && !isQuestion && !hasFigure && words.length <= 8 && trimmed.length < 60) {
      score -= 0.2;
      reasons.push("smalltalk");
    }
    return { score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), reasons };
  }

  private historyFor(remoteJid: string): ConversationHistory {
    let history = this.histories.get(remoteJid);
    if (!history) {
      history = new ConversationHistory();
      this.histories.set(remoteJid, history);
    }
    return history;
  }

  /** Remember who we talked to (name shown in their WhatsApp profile). */
  private rememberContact(
    remoteJid: string,
    pushName: string | null | undefined,
  ): void {
    // Group names come from group metadata (see listGroups) — a member's
    // pushName must never overwrite the group subject.
    if (remoteJid.endsWith("@g.us")) return;
    const prev = this.contacts.get(remoteJid);
    if (pushName) {
      this.contacts.set(remoteJid, {
        name: pushName,
        lastSeen: Date.now(),
        imgUrl: prev?.imgUrl ?? null,
        about: prev?.about,
      });
    } else if (!prev) {
      this.contacts.set(remoteJid, { name: "unknown", lastSeen: Date.now() });
    }
  }

  /** Merge one roster contact synced from WhatsApp (full address book). */
  private upsertSyncedContact(c: Contact): void {
    if (!c.id || c.id === "status@broadcast") return;
    const prev = this.contacts.get(c.id);
    const name = c.name || c.notify || c.verifiedName || prev?.name || "unknown";
    const imgUrl =
      typeof c.imgUrl === "string" && c.imgUrl !== "changed" ? c.imgUrl : (prev?.imgUrl ?? null);
    this.contacts.set(c.id, {
      name,
      lastSeen: prev?.lastSeen ?? 0,
      imgUrl,
      about: c.status ?? prev?.about,
    });
  }

  /** Seed one synced message into the log (deduped by id). Captions are
   *  kept as text; media without words is kept as a placeholder so the
   *  catch-up pass can still acknowledge it. */
  private ingestSyncedMessage(remoteJid: string, m: WAMessage): void {
    if (!remoteJid || remoteJid === "status@broadcast") return;
    const got = extractIncoming(m);
    if (!got) return;
    const text = got.text || (got.kind === "audio" ? "[voice note]" : `[${got.kind}]`);
    const id = m.key.id ?? `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let log = this.messageLog.get(remoteJid);
    if (!log) {
      log = [];
      this.messageLog.set(remoteJid, log);
    }
    if (log.some((e) => e.id === id)) return;
    const ts = m.messageTimestamp;
    log.push({
      id,
      fromMe: m.key.fromMe ?? false,
      text,
      ts: typeof ts === "number" ? ts * 1000 : Number(ts ?? Date.now()),
      kind: got.kind,
      key: {
        remoteJid,
        id: m.key.id,
        fromMe: m.key.fromMe,
        participant: m.key.participant,
      },
    });
    if (log.length > MAX_LOGGED_PER_CHAT) {
      log.splice(0, log.length - MAX_LOGGED_PER_CHAT);
    }
  }

  /**
   * Refill the LLM conversation memory from pulled history. Called on the
   * first live message after a restart: recent synced messages become context
   * again without storing anyone's messages in our database. Media-only
   * placeholders are skipped — they carry no usable context.
   */
  private seedHistoryFromLog(remoteJid: string): void {
    const existing = this.histories.get(remoteJid);
    if (existing && existing.all().length > 0) return;
    const log = this.messageLog.get(remoteJid) ?? [];
    if (log.length === 0) return;
    const history = this.historyFor(remoteJid);
    for (const m of log.slice(-20)) {
      if ((m.kind ?? "text") !== "text") continue;
      history.append(m.fromMe ? "assistant" : "user", m.text);
    }
    // Whatever the seed covered must not be re-injected as backdrop later.
    this.backdropTs.set(remoteJid, log[log.length - 1].ts);
  }

  /**
   * Cold-start refill: in-memory log slice first (zero cost), then durable
   * Mongo memory (one capped read, only when local history is empty).
   * Keeps RAM at zero while surviving restarts + idle eviction.
   */
  private async ensureHistory(remoteJid: string): Promise<void> {
    const existing = this.histories.get(remoteJid);
    if (existing && existing.all().length > 0) return;
    this.seedHistoryFromLog(remoteJid);
    if ((this.histories.get(remoteJid)?.all().length ?? 0) > 0) return;
    try {
      const { loadChatMemory } = await import("./chat-memory.js");
      const recent = await loadChatMemory(this.userId, remoteJid, 20);
      if (recent.length === 0) return;
      const history = this.historyFor(remoteJid);
      for (const m of recent) history.append(m.role, m.content);
    } catch {
      /* best effort */
    }
  }

private persistOutgoing(remoteJid: string, text: string): void {
    if (!text.trim()) return;
    void import("./chat-memory.js").then((m) =>
      m.appendChatMemory(this.userId, remoteJid, "assistant", text),
    ).catch(() => {});
  }

private pushToLog(remoteJid: string, entry: BufferedMessage): void {
    const log = this.messageLog.get(remoteJid) ?? [];
    log.push(entry);
    if (log.length > MAX_LOGGED_PER_CHAT) {
      log.splice(0, log.length - MAX_LOGGED_PER_CHAT);
    }
    this.messageLog.set(remoteJid, log);
  }

  private logIncoming(remoteJid: string, m: WAMessage, text: string, kind: IncomingKind = "text"): void {
    if (kind === "text" && text.trim()) {
      void import("./chat-memory.js").then((mm) =>
        mm.appendChatMemory(this.userId, remoteJid, m.key.fromMe === true ? "assistant" : "user", text),
      ).catch(() => {});
    }
    const ts = m.messageTimestamp;
    this.pushToLog(remoteJid, {
      id: m.key.id ?? `in-${Date.now()}`,
      fromMe: m.key.fromMe ?? false,
      text,
      ts: typeof ts === "number" ? ts * 1000 : Number(ts ?? Date.now()),
      kind,
      key: {
        remoteJid,
        id: m.key.id,
        fromMe: m.key.fromMe,
        participant: m.key.participant,
      },
    });
  }

  private logOutgoing(remoteJid: string, text: string): void {
    this.persistOutgoing(remoteJid, text);
    this.pushToLog(remoteJid, {
      id: `out-${Date.now()}`,
      fromMe: true,
      text,
      ts: Date.now(),
      key: null,
    });
  }

  /**
   * Start the session and wait until it is genuinely usable (open, or qr
   * when a scan is needed). Never resolves "success" on a dead socket —
   * callers (boot, reconciler, dashboard) can trust a resolved promise.
   */
  async start(timeoutMs = 90_000): Promise<void> {
    this.stopped = false;
    this.touchSession();
    const dialling = !!this.connectPromise && this.connectEpoch === this.epoch;
    if (this.status !== "open" && this.status !== "qr" && !dialling) {
      this.status = "starting";
      this.lastError = null;
      try {
        await this.connectToWhatsApp(this.userId);
      } catch (err) {
        this.status = "closed";
        this.lastError = err instanceof Error ? err.message : String(err);
        throw err;
      }
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.stopped) return;
      if (this.status === "open" || this.status === "qr") return;
      if (this.status === "logged_out") {
        throw new Error(`Session ${this.userId} logged out — scan again on the Link page.`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Session ${this.userId} did not connect in time.`);
      }
      await sleep(500);
    }
  }

  /**
   * Pairing-code linking for phones that can't scan their own screen (the
   * dashboard is open on the same phone as WhatsApp). The user types the
   * returned 8-char code into WhatsApp via: Settings → Linked devices →
   * Link a device → "Link with phone number instead".
   *
   * The socket must be dialled but NOT yet registered — call after /start,
   * before the account connects. Throws when already connected/registered.
   */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new Error("Enter the full phone number in international format (e.g. 2348012345678).");
    }
    if (this.status === "open" || this.isConnected()) {
      throw new Error("This line is already connected — no code needed.");
    }
    // Ensure a live (unregistered) socket exists to ask for the code.
    if (!this.sock || this.status === "idle" || this.status === "closed") {
      await this.connectToWhatsApp(this.userId);
    }
    // Wait briefly for the socket to exist (start returns on qr/open).
    const deadline = Date.now() + 30_000;
    while (!this.sock && Date.now() < deadline) {
      if (this.stopped) throw new Error("Session was stopped.");
      await sleep(300);
    }
    const sock = this.sock;
    if (!sock) throw new Error("Could not open a session — try again.");
    try {
      const code = await sock.requestPairingCode(digits);
      this.pairingCode = code;
      return code;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already|registered|exists/i.test(msg)) {
        throw new Error("This number is already registered — scan the QR instead, or delete and re-link.");
      }
      throw new Error(`WhatsApp rejected the number (${msg}). Check the country code and try again.`);
    }
  }

  async stop(): Promise<void> {
    // Bump the generation first: any in-flight connect or pending reconnect
    // timer from before this stop is now stale and must stand down.
    this.epoch += 1;
    this.stopped = true;
    this.qr = null;
    this.pairingCode = null;
    this.touchSession();
    // Free RAM when not in use: drop all per-chat state. It reseeds from
    // WhatsApp sync + Mongo on next start, so stopping is a real memory reset.
    this.histories.clear();
    this.messageLog.clear();
    this.contacts.clear();
    this.seenMessageIds.clear();
    this.chatChains.clear();
    this.chatActivity.clear();
    this.backdropTs.clear();
    this.groupCtxCache.clear();
    this.echoIds.clear();
    this.echoStreak = 0;
    this.lastEchoText = null;
    if (global.gc) {
      try {
        global.gc();
      } catch {
        /* gc hint only */
      }
    }
    if (this.status !== "logged_out") this.status = "closed";
    if (!this.sock) return;

    const sock = this.sock;
    this.sock = null;
    try {
      await sock.end(undefined);
    } catch (err) {
      console.error(`Session ${this.userId} error while closing:`, err);
    }

    this.sockProxy = null;
    console.log(`Session ${this.userId} stopped`);
  }

  /** Full delete: stop the session and wipe its auth from Mongo. */
  async destroy(): Promise<void> {
    this.stopped = true;
    await this.stop().catch(() => {});
    this.status = "closed";
    try {
      await this.clearAuth?.();
    } catch (err) {
      console.error(`Session ${this.userId} error wiping auth:`, err);
    }
    this.clearAuth = null;
    console.log(`Session ${this.userId} destroyed`);
  }

  isConnected(): boolean {
    return this.sock !== null && this.status === "open";
  }

  getState() {
    return {
      userId: this.userId,
      status: this.status,
      connected: this.isConnected(),
      hasQr: this.qr !== null,
      pairingCode: this.pairingCode,
      lastError: this.lastError,
      me: this.sock?.user?.id ?? null,
    };
  }

  async getAvatarUrl(jid: string): Promise<string | null> {
    if (!this.sock) return null;
    try {
      return (await this.sock.profilePictureUrl(jid)) ?? null;
    } catch {
      return null;
    }
  }

  /** Full roster from WhatsApp sync (every contact + group) plus anyone seen
   *  since boot — so the dashboard allow/block list shows ALL contacts,
   *  even before anyone messages. */
  async listKnownChats(): Promise<{
    jid: string;
    name: string;
    lastSeen: number;
    messages: number;
    imgUrl: string | null;
    about: string;
  }[]> {
    const rows: {
      jid: string;
      name: string;
      lastSeen: number;
      messages: number;
      imgUrl: string | null;
      about: string;
    }[] = [];
    const seen = new Set<string>();
    const jids = new Set([...this.contacts.keys(), ...this.messageLog.keys()]);
    for (const jid of jids) {
      if (jid === "status@broadcast") continue;
      seen.add(jid);
      rows.push({
        jid,
        name: this.contacts.get(jid)?.name ?? "unknown",
        lastSeen: this.contacts.get(jid)?.lastSeen ?? 0,
        messages: this.messageLog.get(jid)?.length ?? 0,
        imgUrl: this.contacts.get(jid)?.imgUrl ?? null,
        about: this.contacts.get(jid)?.about ?? "",
      });
    }
    // All groups this account participates in (best effort — needs connection).
    try {
      if (this.sock && this.status === "open") {
        const groups = await this.sock.groupFetchAllParticipating();
        for (const [jid, meta] of Object.entries(groups)) {
          if (seen.has(jid)) {
            const row = rows.find((r) => r.jid === jid);
            if (row && (!row.name || row.name === "unknown")) {
              row.name = meta.subject || "Group";
            }
            continue;
          }
          rows.push({ jid, name: meta.subject || "Group", lastSeen: 0, messages: 0, imgUrl: null, about: "" });
        }
      }
    } catch {
      /* offline or fetch failed — seen chats still returned */
    }
    // Active chats first, then the rest alphabetically — like a contact list.
    return rows.sort((a, b) => {
      if ((a.lastSeen > 0) !== (b.lastSeen > 0)) return a.lastSeen > 0 ? -1 : 1;
      if (b.lastSeen !== a.lastSeen) return b.lastSeen - a.lastSeen;
      return a.name.localeCompare(b.name);
    });
  }

  /** Own id as participants see it (handles LID vs phone-number id forms). */
  private isSelfParticipant(participantId: string, selfId: string): boolean {
    return isSelfJid(participantId, selfId);
  }

  /** Last holding line per chat, so slow replies never repeat themselves. */
  private lastHoldingLine = new Map<string, string>();

  /**
   * When the answer is taking a while (tool calls, slow model), act like a
   * human who was seen reading: blue ticks + ONE short contextual bubble
   * drafted from the customer's actual message (see draftHoldingLine), then
   * the real answer lands on top like a follow-up message. 1:1 chats only —
   * groups stay quiet unless the reply gate already decided to answer.
   */
  private async sendHoldingLine(
    remoteJid: string,
    opts: { isOwner: boolean; keyId?: string | null; participant?: string | null; text: string },
  ): Promise<string | null> {
    const sock = this.liveSock();
    if (!sock || !opts.keyId) return null;
    const { draftHoldingLine } = await import("../assistant/agent-runner.js");
    let line = await draftHoldingLine(opts.text).catch(() => null);
    if (!line) return null;
    if (this.lastHoldingLine.get(remoteJid) === line) {
      line = "Please give me one more moment.";
    }
    this.lastHoldingLine.set(remoteJid, line);
    if (opts.isOwner && !remoteJid.endsWith("@g.us")) line = `[agent] ${line}`;
    try {
      await sock.readMessages([
        { remoteJid, id: opts.keyId, fromMe: false, participant: opts.participant ?? null },
      ]);
    } catch {
      /* receipts are cosmetic — never block the holding line */
    }
    await this.sendNaturalReply(
      remoteJid,
      line,
      { id: opts.keyId, participant: opts.participant ?? null, text: opts.text },
    );
    return line;
  }

  /** All known own forms (PN + LID + phoneNumber) for participant matching. */
  private ownForms(): string[] {
    const me = this.sock?.user as unknown as { id?: string; lid?: string; phoneNumber?: string } | null | undefined;
    return [me?.id, me?.lid, me?.phoneNumber].filter((x): x is string => !!x);
  }

  /**
   * Every group this account is in, with whether it is an admin there.
   * Admins first, then most-recently-active, then alphabetical. Lightweight:
   * one cached fetch, no message content, no participant rosters.
   */
  async listGroups(): Promise<
    {
      jid: string;
      subject: string;
      members: number;
      isAdmin: boolean;
      lastActive: number;
    }[]
  > {
    if (!this.sock || this.status !== "open") {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    const groups = await this.sock.groupFetchAllParticipating();
    const rows = Object.entries(groups).map(([jid, meta]) => {
      const participants = meta.participants ?? [];
      const own = this.ownForms();
      const me = participants.find((p) => own.some((s) => this.isSelfParticipant(p.id, s)));
      const adminFlag = (me as { admin?: string | null } | undefined)?.admin;
      const log = this.messageLog.get(jid);
      return {
        jid,
        subject: meta.subject || "Group",
        members: participants.length,
        isAdmin: adminFlag === "admin" || adminFlag === "superadmin",
        lastActive: log && log.length > 0 ? log[log.length - 1].ts : 0,
      };
    });
    const sorted = rows.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      if (b.lastActive !== a.lastActive) return b.lastActive - a.lastActive;
      return a.subject.localeCompare(b.subject);
    });
    // Seed group subjects into the roster so chats/members never show a
    // member's pushName as the group name (rememberContact skips groups).
    for (const r of sorted) {
      const prev = this.contacts.get(r.jid);
      this.contacts.set(r.jid, {
        name: r.subject,
        lastSeen: prev?.lastSeen ?? 0,
        imgUrl: prev?.imgUrl ?? null,
        about: prev?.about,
      });
    }
    return sorted;
  }

  /**
   * Full roster for ONE group (on demand — keeps the list endpoint light).
   * Names resolve from the synced contact roster; unknown numbers stay raw.
   */
  async groupDetails(jid: string): Promise<{
    jid: string;
    subject: string;
    desc: string;
    members: number;
    isAdmin: boolean;
    avatar: string | null;
    participants: { jid: string; name: string; admin: boolean }[];
  }> {
    if (!this.sock || this.status !== "open") {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    if (!jid.endsWith("@g.us")) throw new Error("That is not a group chat.");
    const ownDetails = this.ownForms();
    const meta = await this.sock.groupMetadata(jid);
    const participants = (meta.participants ?? []).map((p) => {
      const adminFlag = (p as { admin?: string | null }).admin;
      return {
        jid: p.id,
        name: this.contacts.get(p.id)?.name ?? p.id.split("@")[0],
        admin: adminFlag === "admin" || adminFlag === "superadmin",
      };
    });
    const me = (meta.participants ?? []).find((p) => ownDetails.some((s) => this.isSelfParticipant(p.id, s)));
    const meAdmin = (me as { admin?: string | null } | undefined)?.admin;
    const avatar = await this.getAvatarUrl(jid).catch(() => null);
    return {
      jid,
      subject: meta.subject || "Group",
      desc: meta.desc ?? "",
      members: participants.length,
      isAdmin: meAdmin === "admin" || meAdmin === "superadmin",
      avatar,
      participants: participants.sort((a, b) => {
        if (a.admin !== b.admin) return a.admin ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    };
  }

  async send(to: string, text: string): Promise<void> {
    const sock = this.liveSock();
    if (!sock) {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    await sendWithTyping(sock, to, text);
  }

  /**
   * Status → product auto-import. When the OWNER posts a photo/video status
   * from their phone, the linked device receives it on `status@broadcast`.
   * The caption is judged first: only genuine product posts become listings
   * (anything else is dropped). Media goes to Cloudinary when configured
   * (public URL the store, dashboard and agent-photo sends all share),
   * else an embedded data URL. The owner's own chat gets a confirm or a
   * one-line skip note. Anyone else's status is dropped silently (never
   * replied to, never logged as a chat). Text-only statuses are skipped.
   */
  private async handleStatusPost(
    m: WAMessage,
    sock: ReturnType<typeof makeWASocket>,
    epoch: number,
  ): Promise<void> {
    if (this.stopped || epoch !== this.epoch || this.sock !== sock) return;
    const mid = m.key?.id ?? "";
    if (!mid || this.markSeen(mid)) return;

    // Own post? fromMe, or the participant resolves to one of our own forms
    // (PN vs LID namespaces — same dance as the self-chat check).
    let mine = m.key?.fromMe === true;
    const participant = m.key?.participant ?? null;
    if (!mine && participant) {
      mine = this.isOwnChatId(sock, participant, null);
      if (!mine) mine = await this.resolveOwnChatId(sock, participant, null).catch(() => false);
    }
    if (!mine) return;

    const msg = m.message;
    const img = msg?.imageMessage ?? null;
    const vid = msg?.videoMessage ?? null;
    if (!img && !vid) return; // text status — nothing to list
    const already = await wasProcessed(this.userId, "status@broadcast", mid).catch(() => false);
    if (already) return;

    const caption = ((img?.caption ?? vid?.caption ?? "") as string).trim();
    const kind = vid ? ("video" as const) : ("photo" as const);

    // Legitimacy gate: caption must read as a genuine product post.
    const { classifyStatusPost } = await import("../assistant/agent-runner.js");
    const verdict = await classifyStatusPost(caption, kind).catch(() => null);
    let name: string;
    let price: number;
    let condition: "New" | "UK Used" | "Used";
    if (verdict) {
      if (!verdict.isProduct) {
        await this.noteStatusSkip(sock, mid, m, `Noted — skipped (didn't read as a product: ${verdict.reason || "no offer found"}). Add a name + price in the caption to list it.`);
        return;
      }
      name = verdict.name || parseStatusCaption(caption).name;
      price = verdict.price;
      condition = verdict.condition;
    } else {
      // Classifier down — keyword fallback: price figure or selling words.
      const parsed = parseStatusCaption(caption);
      const looksSellish = parsed.price > 0 || SELL_WORDS.test(caption);
      if (!looksSellish) {
        await this.noteStatusSkip(sock, mid, m, `Noted — skipped (couldn't confirm it's a product). Add a name + price in the caption to list it.`);
        return;
      }
      name = parsed.name;
      price = parsed.price;
      condition = /uk\s*used/i.test(caption) ? "UK Used" : "New";
    }

    const { createShopProduct, ownerIdForLine, currencySymbol, loadBusiness } = await import(
      "./agent-tools/store.js"
    );
    const owner = await ownerIdForLine(this.userId).catch(() => null);

    // Media bytes for the listing: Cloudinary URL when configured (shared
    // everywhere), else an embedded data URL. Oversized media still lists,
    // just without a photo for now.
    let photoUrl = "";
    let tooBig = false;
    try {
      const buf = (await downloadMediaMessage(
        m,
        "buffer",
        {},
        { reuploadRequest: sock.updateMediaMessage, logger: waLogger },
      )) as Buffer;
      const mime = (img?.mimetype ?? vid?.mimetype ?? "") as string;
      if (buf && buf.length > 0 && /^(image|video)\//.test(mime)) {
        if (buf.length <= 12_000_000) {
          const { uploadProductMedia } = await import("./media-store.js");
          photoUrl = (await uploadProductMedia(buf, mime, owner).catch(() => null)) ?? "";
          if (!photoUrl && buf.length <= 4_000_000) {
            photoUrl = `data:${mime};base64,${buf.toString("base64")}`;
          } else if (!photoUrl) {
            tooBig = true;
          }
        } else {
          tooBig = true;
        }
      }
    } catch {
      /* photo is a bonus — the listing goes up regardless */
    }

    const business = await loadBusiness(this.userId).catch(() => null);
    const created = await createShopProduct({
      ownerId: owner,
      name,
      description: caption.slice(0, 1000),
      unitPrice: price,
      quantity: 1,
      condition,
      image: photoUrl,
    });
    const ts = m.messageTimestamp;
    await markProcessed(
      this.userId,
      "status@broadcast",
      mid,
      new Date(typeof ts === "number" ? ts * 1000 : Number(ts ?? Date.now())),
    );
    if (!created) return;

    // Confirm on the owner's own chat (private owner channel).
    const meJid = (sock.user as unknown as { id?: string } | null | undefined)?.id ?? null;
    if (!meJid) return;
    const symbol = currencySymbol(business?.currency);
    const priceLine = price > 0 ? `${symbol}${price.toLocaleString("en-NG")}` : "no price set";
    const lines = [
      `Saved to your store ✅`,
      `${created.name} — ${priceLine} (qty 1)`,
      tooBig
        ? `The video was too large to attach — send a photo here and I'll add it.`
        : !photoUrl
          ? `No photo attached — send one here and I'll add it.`
          : price <= 0
            ? `No price found in the caption — set it in Products.`
            : `Tweak price or qty any time in Products.`,
    ];
    try {
      await this.sendNaturalReply(meJid, lines.join("\n"));
    } catch {
      /* listing is saved; the ping is best-effort */
    }
  }

  /**
   * One quiet owner-chat note for a skipped status post (media only — text
   * statuses die silently). Marks the id processed so a restart never
   * re-pings, and never throws: skips must be invisible on failure too.
   */
  private async noteStatusSkip(
    sock: ReturnType<typeof makeWASocket>,
    mid: string,
    m: WAMessage,
    text: string,
  ): Promise<void> {
    try {
      const ts = m.messageTimestamp;
      await markProcessed(
        this.userId,
        "status@broadcast",
        mid,
        new Date(typeof ts === "number" ? ts * 1000 : Number(ts ?? Date.now())),
      );
      const meJid = (sock.user as unknown as { id?: string } | null | undefined)?.id ?? null;
      if (!meJid) return;
      await this.sendNaturalReply(meJid, text);
    } catch {
      /* skips stay silent on any failure */
    }
  }

  /**
   * Latest message per chat (for the dashboard's WhatsApp-style recent list).
   * Text only, capped — no media blobs, no full history.
   */
  recentChats(limit = 20): {
    jid: string;
    name: string;
    imgUrl: string | null;
    text: string;
    fromMe: boolean;
    ts: number;
    messages: number;
  }[] {
    const rows: {
      jid: string;
      name: string;
      imgUrl: string | null;
      text: string;
      fromMe: boolean;
      ts: number;
      messages: number;
    }[] = [];
    for (const [jid, log] of this.messageLog) {
      if (jid === "status@broadcast" || log.length === 0) continue;
      const last = log[log.length - 1];
      rows.push({
        jid,
        name: this.contacts.get(jid)?.name ?? "unknown",
        imgUrl: this.contacts.get(jid)?.imgUrl ?? null,
        text: last.text.length > 120 ? `${last.text.slice(0, 120)}…` : last.text,
        fromMe: last.fromMe,
        ts: last.ts,
        messages: log.length,
      });
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, Math.max(1, Math.min(limit, 50)));
  }

  /**
   * Deliver a reply like a busy human: ONE message by default — a second
   * bubble only when the answer is genuinely long and multi-part (max 2).
   * The customer's message is quoted only on short answers; quoting every
   * long reply looks mechanical. A short pause + typing shows between bubbles.
   */
  async sendNaturalReply(
    remoteJid: string,
    text: string,
    quoted?: { id?: string | null; participant?: string | null; text: string },
  ): Promise<void> {
    const sock = this.liveSock();
    if (!sock) {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    const clean = prepareCustomerMessage(text);
    const bubbles = clean.length <= 450 ? [clean] : splitReply(clean, 2, 320);
    const useQuote = bubbles.length === 1 && clean.length <= 200 && !!quoted?.id;
    for (let i = 0; i < bubbles.length; i++) {
      if (i > 0) await sleep(700);
      if (i === 0 && useQuote) {
        await sock.sendMessage(remoteJid, {
          text: bubbles[i],
          contextInfo: {
            stanzaId: quoted!.id as string,
            participant: quoted!.participant || remoteJid,
            quotedMessage: { conversation: quoted!.text.slice(0, 200) },
          },
        });
      } else {
        await sendWithTyping(sock, remoteJid, bubbles[i]);
      }
    }
    this.logOutgoing(remoteJid, text);
  }

  /**
   * Run a scheduled job: interrupt the owning session's agent with the stored
   * instructions and deliver its answer — no incoming customer message needed.
   * Isolation: the agent receives ONLY this chat's history + a scoped
   * single-chat view (no other customer's logs/contacts). Serialized per chat
   * via runExclusive so a live message can't interleave history. History is
   * left untouched; only the composed reply is logged as outgoing.
   */
  async performScheduledTask(
    chatJid: string,
    instruction: string,
    opts?: { taskId?: string; executorIsOwner?: boolean },
  ): Promise<string> {
    if (!this.sock) {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    const current = this.sock;
    // Serialized socket: scheduled interrupts join the same one-voice-at-a-time
    // chain as live replies (ban-safe). Null only when disconnected (guarded below).
    const psock = this.liveSock() ?? current;
    const safeInstruction = instruction.slice(0, 2000);
    // Scheduler privilege travels with the job (stored at enqueue time).
    // Customer-scheduled tasks run as non-owner even in their own chat;
    // only owner-scheduled tasks get the owner tool gate + full view.
    const executorIsOwner = opts?.executorIsOwner === true;
    const taskId = opts?.taskId ?? `adhoc-${Date.now()}`;
    return this.runExclusive(chatJid, async () => {
      try {
        this.touch(chatJid);
        await this.ensureHistory(chatJid);
        const sendText = async (to: string, message: string) => {
          await sendWithTyping(psock, to, message);
          this.logOutgoing(to, message);
        };
        // Owner-scheduled tasks get the full session view (cross-chat reports,
        // promo blasts); customer tasks stay scoped to their own chat only.
        const view = executorIsOwner
          ? {
              customerJid: chatJid,
              isOwner: true as boolean,
              sendText,
              sock: psock,
              contacts: this.contacts,
              messageLog: this.messageLog,
            }
          : this.scopedContext(chatJid, sendText, false, psock);
        const reply = await handleCustomerMessage({
          userId: this.userId,
          customerJid: view.customerJid,
          // Neutral user text: the REAL instruction travels out-of-band as a
          // system-role message (see agent-runner), so customer text claiming
          // to be a scheduled task can never forge it.
          incomingText: "Scheduled check-in - see the scheduler task and act.",
          history: this.historyFor(chatJid).all(),
          sendText: view.sendText,
          sock: view.sock,
          contacts: view.contacts,
          messageLog: view.messageLog,
          scheduledTask: { id: taskId, instruction: safeInstruction },
          group: await this.groupContext(chatJid).catch(() => null),
        });
        await this.sendNaturalReply(chatJid, reply);
        return reply;
      } catch (error) {
        console.error("Scheduled task failed:", error);
        throw error;
      }
    });
  }

  /**
   * Post a WhatsApp Status (story) from this account.
   * Text-only, or a photo/video URL with an optional caption.
   */
  async postStatus(input: {
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    backgroundColor?: string;
  }): Promise<{ kind: "text" | "image" | "video"; line: string; audience: number; messageId: string | null }> {
    if (!this.sock) {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    const text = (input.text ?? "").trim().slice(0, 700);
    const imageUrl = (input.imageUrl ?? "").trim();
    const videoUrl = (input.videoUrl ?? "").trim();
    if (!text && !imageUrl && !videoUrl) {
      throw new Error("`text` or an `imageUrl`/`videoUrl` is required.");
    }
    const line = (this.sock.user as unknown as { id?: string } | null | undefined)?.id ?? "";
    // Baileys only delivers status to statusJidList — without an audience the
    // send resolves but reaches zero devices (invisible everywhere).
    const { buildStatusAudience } = await import("./agent-tools/status-tools.js");
    const audience = buildStatusAudience(this.contacts, line || undefined);
    if (audience.length === 0) {
      throw new Error("Nobody to show the status to yet — this line has no chats.");
    }
    const proof = (kind: "text" | "image" | "video", sent: unknown) => {
      const key = (sent as { key?: { id?: string } } | null | undefined)?.key;
      const out = { kind, line, audience: audience.length, messageId: key?.id ?? null };
      try {
        console.log(`Status posted: ${kind} to ${audience.length} recipient(s) (id ${out.messageId ?? "?"}, line ${line || "?"})`);
      } catch {
        /* logging never blocks the post */
      }
      return out;
    };
    const STATUS_JID = "status@broadcast";
    if (videoUrl) {
      if (!/^https?:\/\//i.test(videoUrl)) throw new Error("Only http(s) URLs are allowed.");
      const sent = await this.sock.sendMessage(
        STATUS_JID,
        {
          video: { url: videoUrl },
          caption: text || undefined,
        },
        { statusJidList: audience, broadcast: true },
      );
      return proof("video", sent);
    }
    if (imageUrl) {
      if (!/^https?:\/\//i.test(imageUrl)) throw new Error("Only http(s) URLs are allowed.");
      const sent = await this.sock.sendMessage(
        STATUS_JID,
        {
          image: { url: imageUrl },
          caption: text || undefined,
        },
        { statusJidList: audience, broadcast: true },
      );
      return proof("image", sent);
    }
    const bg = (input.backgroundColor ?? "#00a884").trim();
    const sent = await this.sock.sendMessage(
      STATUS_JID,
      { text },
      {
        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : "#00a884",
        font: 0,
        statusJidList: audience,
        broadcast: true,
      },
    );
    return proof("text", sent);
  }

  async connectToWhatsApp(userId: string): Promise<void> {
    // Single flight: concurrent callers (boot + reconciler + dashboard +
    // reconnect timer) share one dial instead of opening duplicate sockets
    // that WhatsApp would kick with a "replaced/conflict" error. A dial from
    // a previous generation (after stop/start) is ignored, never shared.
    if (this.connectPromise && this.connectEpoch === this.epoch) return this.connectPromise;
    const epoch = ++this.epoch;
    this.connectEpoch = epoch;
    const run = this.dial(userId, epoch);
    this.connectPromise = run;
    try {
      await run;
    } finally {
      if (this.connectPromise === run) this.connectPromise = null;
    }
  }

  private async dial(userId: string, epoch: number): Promise<void> {
    const { state, saveCreds, clearState } = await useMongoAuthState(userId);
    if (this.stopped || epoch !== this.epoch) return; // superseded while loading auth
    this.clearAuth = clearState;

    const sock = makeWASocket({
      logger: waLogger,
      auth: {
        creds: state.creds,
        // In-memory cache over Mongo (official Baileys perf pattern);
        // every keys.set still writes through to Mongo before returning
        keys: makeCacheableSignalKeyStore(state.keys),
      },
    });
    if (this.stopped || epoch !== this.epoch) {
      try {
        await sock.end(undefined);
      } catch {
        /* already dead */
      }
      return;
    }
    this.sock = sock;
    this.touchSession();

    // Stale-dial guard: if WhatsApp never answers (no qr/open/close), the
    // session would sit in "starting" forever — an invisible dead bot the
    // dashboard shows as "Starting…". After 45s with no progress, kill the
    // socket so the normal closed/backoff path (and the dashboard) sees a
    // real state instead of limbo.
    const stallTimer = setTimeout(() => {
      if (this.stopped || epoch !== this.epoch || this.sock !== sock) return;
      if (this.status === "starting") {
        console.log(`Session ${this.userId} dial stalled — closing stale socket`);
        this.status = "closed";
        this.touchSession();
        const dead = this.sock;
        this.sock = null;
        dead?.end(undefined).catch(() => {});
      }
    }, 45_000);
    (stallTimer as unknown as { unref?: () => void }).unref?.();

    // Pull previous context from WhatsApp itself on every connect: the full
    // contact roster plus recent messages. Nothing is written to our database
    // — it lives in memory only, so restarts forget nothing the phone still has.
    sock.ev.on("messaging-history.set", ({ contacts, messages }) => {
      try {
        for (const c of contacts ?? []) this.upsertSyncedContact(c);
        for (const m of messages ?? []) {
          const jid = m.key.remoteJid;
          if (jid) this.ingestSyncedMessage(jid, m);
        }
      } catch (err) {
        console.error(`Session ${this.userId} history ingest failed:`, err);
      }
    });
    sock.ev.on("contacts.upsert", (list) => {
      try {
        for (const c of list ?? []) this.upsertSyncedContact(c);
      } catch {
        /* keep old roster on bad payloads */
      }
    });
    sock.ev.on("contacts.update", (list) => {
      try {
        for (const c of list ?? []) {
          const upd = c as Partial<Contact>;
          const prev = upd.id ? this.contacts.get(upd.id) : undefined;
          if (!upd.id || !prev) continue;
          this.contacts.set(upd.id, {
            name: upd.name || prev.name,
            lastSeen: prev.lastSeen,
            imgUrl:
              typeof upd.imgUrl === "string" && upd.imgUrl !== "changed"
                ? upd.imgUrl
                : prev.imgUrl,
            about: upd.status ?? prev.about,
          });
        }
      } catch {
        /* keep old roster on bad payloads */
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        if (epoch !== this.epoch || this.stopped || this.sock !== sock) return;
        this.qr = qr;
        this.status = "qr";
        this.touchSession();
        qrcode.generate(qr, { small: true });
      }
      if (connection === "close") {
        // Only the current generation owns this event — a stale socket
        // closing must never kill its replacement or schedule rogue retries.
        const mine = epoch === this.epoch && this.sock === sock;
        const loggedOut =
          (lastDisconnect?.error as Boom)?.output?.statusCode ===
          DisconnectReason.loggedOut;
        if (loggedOut) {
          // Auth is dead — wipe it from Mongo so the next start pairs fresh.
          // Everything else just reconnects (syncs) on its own.
          if (mine) {
            this.status = "logged_out";
            this.qr = null;
            this.pairingCode = null;
            this.sock = null;
            this.histories.clear();
            this.touchSession();
          }
          try {
            await this.clearAuth?.();
          } catch {
            /* best effort */
          }
          this.clearAuth = null;
          console.log(`Session ${this.userId} logged out — needs re-scan`);
          return;
        }
        if (mine) this.sock = null;
        this.status = mine ? "closed" : this.status;
        if (mine) this.touchSession();
        const reason = lastDisconnect?.error;
        const reasonMsg = reason instanceof Error ? reason.message : String(reason ?? "unknown");
        const offline =
          /ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|network|timeout/i.test(reasonMsg);
        const conflicted = /conflict|replaced/i.test(reasonMsg);
        if (!mine) {
          console.log(`Session ${this.userId} stale socket closed (${reasonMsg}) — ignoring`);
        } else if (!this.stopped) {
          if (conflicted) {
            // Another client with the same credentials took over — usually a
            // duplicate agent process (dev server + built server running at
            // once). Hammering reconnect just prolongs the fight: wait it out.
            this.reconnectFailures += 1;
            console.log(
              `Session ${this.userId} was REPLACED by another client — possible duplicate agent process running. Backing off 60s before retry ${this.reconnectFailures}.`,
            );
            setTimeout(() => {
              if (this.stopped || epoch !== this.epoch) return;
              this.connectToWhatsApp(this.userId).catch((err) => {
                this.status = "closed";
                this.lastError = err instanceof Error ? err.message : String(err);
                console.error(`Session ${this.userId} reconnect failed:`, err);
              });
            }, 60_000);
          } else {
            // Backoff: 3s, 6s, 12s… capped at 60s. No internet (DNS) or a
            // WhatsApp outage just waits quietly and recovers on its own.
            this.reconnectFailures += 1;
            const wait = Math.min(3000 * 2 ** (this.reconnectFailures - 1), 60_000);
            console.log(
              `Session ${this.userId} closed (${offline ? "no internet/WhatsApp unreachable" : reasonMsg}) — retry ${this.reconnectFailures} in ${Math.round(wait / 1000)}s`,
            );
            setTimeout(() => {
              if (this.stopped || epoch !== this.epoch) return;
              this.connectToWhatsApp(this.userId).catch((err) => {
                this.status = "closed";
                this.lastError = err instanceof Error ? err.message : String(err);
                console.error(`Session ${this.userId} reconnect failed:`, err);
              });
            }, wait);
          }
        } else {
          console.log(`Session ${this.userId} closed (${reasonMsg}), not reconnecting (stopped)`);
        }
      } else if (connection === "open") {
        if (epoch !== this.epoch || this.sock !== sock) return;
        this.qr = null;
        this.pairingCode = null;
        this.status = "open";
        this.reconnectFailures = 0;
        this.touchSession();
        console.log(`Session ${this.userId} opened connection`);
        // Pick up anything that arrived while we were down.
        this.scheduleCatchUp(epoch);
      }
    });

    sock.ev.on("messages.upsert", async (event) => {
      // notify = live/just-arrived, append = backlog caught up after downtime.
      // Both are answered (deduped by id) so a restart never drops messages
      // that arrived while the agent was down.
      if (event.type !== "notify" && event.type !== "append") return;
      const current = this.sock;
      if (!current || current !== sock || epoch !== this.epoch) return;
      // The line's own chat ("Message yourself") is the owner's private
      // command line: messages the owner sends there MUST be heard, so
      // fromMe is only skipped for everyone else. Group self-sends stay
      // skipped (never reply to yourself in a group).
      for (const m of event.messages) {
        // One malformed/poison message must never break the loop or become an
        // unhandled rejection that takes down the session.
        try {
          if (!m?.key) continue;

          const remoteJid = m.key.remoteJid;
          if (!remoteJid) continue;
          // Status posts never enter the reply pipeline (they used to fall
          // through and confuse it). The owner's own posts become products;
          // everyone else's are dropped silently.
          if (remoteJid === "status@broadcast") {
            await this.handleStatusPost(m, current, epoch).catch((err) =>
              console.error(
                `Session ${this.userId} status ingest failed:`,
                err instanceof Error ? err.message : err,
              ),
            );
            continue;
          }
          const altJid = (m.key as { remoteJidAlt?: string }).remoteJidAlt ?? null;
          // The line's own chat ("Message yourself") is the owner's private
          // command line: heard, not skipped. Group self-sends stay skipped
          // (never reply to yourself in a group).
          // Sync check first (cheap); fall back to LID-mapping lookup so a
          // PN session still recognises its LID self-chat and vice versa.
          let selfChat = this.isOwnChatId(current, remoteJid, altJid);
          if (m.key.fromMe && !selfChat && !remoteJid.endsWith("@g.us")) {
            selfChat = await this.resolveOwnChatId(current, remoteJid, altJid).catch(() => false);
          }
          if (m.key.fromMe && !selfChat) continue;

          const mid = m.key.id ?? "";
          if (!mid || this.markSeen(mid)) continue;

          const got = extractIncoming(m);
          if (!got) continue;

          if (m.key.fromMe && selfChat) {
            // Our own sends echo back as fromMe. ID match = definitely ours.
            if (mid && this.echoIds.delete(mid)) {
              this.echoStreak = 0;
              continue;
            }
            // Fast echo (arrived before our send promise resolved): identical
            // text to what we just sent = ours, not owner typing. The lookup
            // is JID-form-agnostic (PN vs LID namespaces) so a form mismatch
            // can never turn an echo into a "new owner message" — that hole
            // is what caused runaway self-reply loops (e.g. endless greetings
            // after scheduling several tasks at once).
            const lastOut = this.lastOutgoingText(remoteJid);
            if (lastOut && got.text !== "" && lastOut.text === got.text && Date.now() - lastOut.ts < 60_000) {
              if (this.lastEchoText === got.text) this.echoStreak += 1;
              else this.echoStreak = 1;
              this.lastEchoText = got.text;
              if (this.echoStreak === 3) {
                console.warn(
                  `[self-chat] echo-loop breaker engaged on ${this.userId} — same own text ${this.echoStreak}x, dropping echoes`,
                );
              }
              continue;
            }
            this.echoStreak = 0;
            this.lastEchoText = null;
            console.log(`[self-chat] heard owner message in own chat (${got.kind})`);
          }

        const ts = m.messageTimestamp;
        await this.handleIncoming({
          remoteJid,
          remoteJidAlt: altJid,
          key: { remoteJid, id: m.key.id, fromMe: m.key.fromMe, participant: m.key.participant },
          text: got.text,
          kind: got.kind,
          mentioned: got.mentioned,
          quotedParticipant: got.quotedParticipant,
          quotedText: got.quotedText,
          sentAt: typeof ts === "number" ? ts * 1000 : Number(ts ?? Date.now()),
          pushName: m.pushName ?? undefined,
          sock: current,
          alreadyLogged: false,
          rawForLog: m,
        });
        } catch (err) {
          console.error(`Session ${this.userId} inbound loop: skipping one message:`, err instanceof Error ? err.message : err);
        }
      }
    });

    // Save credentials whenever they are updated
    sock.ev.on("creds.update", saveCreds);
  }

  /**
   * One shared pipeline for every inbound customer message — live or
   * backlog. Answers text/captioned media via the agent; acknowledges
   * media-without-words and stickers honestly instead of ignoring them;
   * records the id so neither a restart nor a duplicate delivery can
   * cause a second reply or a dropped message.
   */
  private async handleIncoming(args: {
    remoteJid: string;
    remoteJidAlt?: string | null;
    key: { remoteJid?: string | null; id?: string | null; fromMe?: boolean | null; participant?: string | null };
    text: string;
    kind: IncomingKind;
    sentAt: number;
    pushName?: string | null;
    sock: ReturnType<typeof makeWASocket>;
    alreadyLogged: boolean;
    rawForLog?: WAMessage;
    mentioned?: string[];
    quotedParticipant?: string | null;
    quotedText?: string | null;
  }): Promise<void> {
    const { remoteJid, key, text, kind, sentAt, pushName, sock, alreadyLogged, rawForLog } = args;
    const mentioned = args.mentioned ?? [];
    const quotedParticipant = args.quotedParticipant ?? null;
    const quotedText = (args.quotedText ?? "").trim().slice(0, 300);
    const remoteJidAlt = args.remoteJidAlt ?? null;
    const mid = key.id ?? "";
    if (!mid) return;
    const ageMin = Math.max(0, (Date.now() - sentAt) / 60000);
    if (ageMin > 60 * 48) return; // ancient — never blast a reply days late.

    // The line's own chat ("Message yourself") is the owner's private line.
    // Computed once, used by the STOP check, the access gate, and owner gating.
    // Sync check first, then LID-mapping lookup (PN session vs LID self-chat).
    let selfChat = this.isOwnChatId(sock, remoteJid, remoteJidAlt);
    if (!selfChat && !remoteJid.endsWith("@g.us")) {
      selfChat = await this.resolveOwnChatId(sock, remoteJid, remoteJidAlt).catch(() => false);
    }
    // Fallback: the shop number from settings IS this line. If the socket
    // hasn't learned its LID yet, the self-chat still matches the shop phone.
    if (!selfChat) {
      try {
        const { isOwnerJid, loadBusiness } = await import("./agent-tools/store.js");
        const b = await loadBusiness(this.userId).catch(() => null);
        if (b?.phone && isOwnerJid(remoteJid, b.phone)) selfChat = true;
      } catch {
        /* mapping already failed — gate below stays fail-closed except self */
      }
    }

    // WhatsApp-guideline opt-out handling. START is checked BEFORE the access
    // gate (blocked chats are dropped below, so an opt-in would never be heard
    // otherwise); STOP is checked after it. Keyword match only — one cheap
    // string test; DB calls happen solely on a match.
    const keyword = text.trim().toLowerCase().replace(/[.!…\s]+$/, "");
    const isOptOut =
      /^(stop|unsubscribe|opt[\s-]?out|please stop|stop please|do not (message|text|contact) me|remove me)$/.test(
        keyword,
      );
    const isOptIn = /^(start|subscribe|opt[\s-]?in|resume|unstop)$/.test(keyword);
    if (isOptIn && kind === "text") {
      try {
        const { removeFromBlacklist } = await import("./chat-access.js");
        if (await removeFromBlacklist(this.userId, remoteJid)) {
          this.rememberContact(remoteJid, pushName ?? undefined);
          await this.send(
            remoteJid,
            "Welcome back — broadcasts and replies are on again. Reply STOP anytime to opt out.",
          ).catch(() => {});
          await markProcessed(this.userId, remoteJid, mid, new Date(sentAt));
          return;
        }
      } catch {
        /* fall through to normal handling */
      }
    }

    // The line's own chat is always open, even if the DB is down
    // (fail-closed gates must never lock the owner out).
    // Access gate FIRST: blacklisted / non-whitelisted chats are dropped
    // entirely — no history, no log, no AI, no reply. Just dropped.
    if (!selfChat && !(await isChatAllowed(this.userId, remoteJid))) {
      // Groups get a visible log line: a silent access drop looks exactly
      // like "the bot is numb", and this tells us which list blocked it.
      if (remoteJid.endsWith("@g.us")) {
        const why = await import("./chat-access.js").then((m) => m.accessWhy(this.userId, remoteJid)).catch(() => null);
        const detail =
          why?.reason === "blacklisted"
            ? "it is on the BLOCK list (remove it on the Link page, or someone typed STOP here)"
            : why?.reason === "not-whitelisted"
              ? "the line is in EXCLUSIVE (allow-list) mode and this group is not whitelisted"
              : "the access check hit a DB error (fail-closed)";
        console.log(`[group-gate] "${remoteJid}" dropped by access gate: ${detail} — no reply attempted.`);
      }
      return;
    }

    if (isOptOut && kind === "text") {
      try {
          const { isOwnerJid, loadBusiness } = await import("./agent-tools/store.js");
          const b = await loadBusiness(this.userId).catch(() => null);
          const senderIsOwner =
          selfChat ||
          isOwnerJid(remoteJid, b?.phone) ||
          (b?.adminVerified === true && !!b?.adminPhone ? isOwnerJid(remoteJid, b.adminPhone) : false);
        if (!senderIsOwner) {
          const { addToBlacklist } = await import("./chat-access.js");
          await addToBlacklist(this.userId, remoteJid, pushName ?? undefined);
          this.rememberContact(remoteJid, pushName ?? undefined);
          await this.send(
            remoteJid,
            "Noted — you won't receive broadcasts from us again. Reply START anytime to opt back in.",
          ).catch(() => {});
          await markProcessed(this.userId, remoteJid, mid, new Date(sentAt));
          return;
        }
      } catch {
        /* fall through; the access gate above already fails closed */
      }
    }

    // Media without words: acknowledge like a human, don't ghost them.
    // NOTE: no read receipt yet. Single ticks stay while she thinks; the
    // blue ticks land together with typing + reply, so the customer never
    // watches "seen" sit with no answer coming.
    if (!text || (kind !== "text" && /^\[.*\]$/.test(text))) {
      const reply =
        kind === "audio"
          ? "Voice note received — my network no gree play am right now, abeg type am for me?"
          : kind === "sticker"
            ? "😄"
            : "I see am — wetin you want make I check on am? Type am for me.";
      try {
        if (!alreadyLogged && rawForLog) this.logIncoming(remoteJid, rawForLog, `[${kind}]`, kind);
        this.rememberContact(remoteJid, pushName ?? undefined);
        try {
          await sock.readMessages([{ ...key, fromMe: false }]);
        } catch {
          /* receipts are cosmetic — never block the reply */
        }
        await this.sendNaturalReply(remoteJid, reply, { id: key.id, participant: key.participant, text: reply });
        await markProcessed(this.userId, remoteJid, mid, new Date(sentAt));
      } catch (error) {
        console.error("Message processing failed:", error);
      }
      return;
    }

    const incomingText = (kind === "text" ? text : `${text}\n[Sent with a ${kind} — you cannot view media, reply to the caption and never claim to see the photo.]`).slice(
      0,
      WhatsappSession.MAX_INCOMING,
    );

    // Serialize per chat + scope the tool context to THIS chat only, so a
    // scheduled interrupt and a live message can't interleave or leak.
    await this.runExclusive(remoteJid, async () => {
      try {
      this.touch(remoteJid);
      if (remoteJid.endsWith("@g.us")) {
        // Groups don't go through rememberContact (name comes from metadata),
        // but still track liveness for sorting.
        const prev = this.contacts.get(remoteJid);
        if (prev) this.contacts.set(remoteJid, { ...prev, lastSeen: Date.now() });
      }
      await this.ensureHistory(remoteJid);
      const history = this.historyFor(remoteJid);
      const isGroupChat = remoteJid.endsWith("@g.us");
      // Owner resolution BEFORE history so the model sees WHO is talking.
      // selfChat (Message yourself) is always owner; admin line + shop
      // number are owners too. Customers stay unmarked.
      const { isOwnerJid: isOwnerJidEarly, loadBusiness: loadBusinessEarly } = await import("./agent-tools/store.js");
      let isOwnerEarly = selfChat;
      try {
        const bEarly = await loadBusinessEarly().catch(() => null);
        if (!isOwnerEarly) {
          isOwnerEarly =
            isOwnerJidEarly(remoteJid, bEarly?.phone) ||
            (bEarly?.adminVerified === true && !!bEarly?.adminPhone
              ? isOwnerJidEarly(remoteJid, bEarly.adminPhone)
              : false);
        }
      } catch {
        /* selfChat alone still counts when DB is down */
      }
      // Tag group messages with the sender so the model knows WHO said what.
      // 1:1 owner messages carry [OWNER] so "recap", promos and stock
      // changes are acted on — the model never confuses owner for customer.
      // A highlighted (replied-to) message rides along as quoted context so
      // the model answers THAT message, not just the new line under it.
      const senderName = (pushName ?? "").trim();
      let quotedPrefix = "";
      if (quotedText) {
        const meU = sock.user as unknown as { id?: string; lid?: string; phoneNumber?: string } | null | undefined;
        const ownIds = [meU?.id, meU?.lid, meU?.phoneNumber].filter((x): x is string => !!x);
        const who = quotedParticipant
          ? ownIds.includes(quotedParticipant)
            ? "you"
            : (this.contacts.get(quotedParticipant)?.name ?? quotedParticipant.split("@")[0])
          : "";
        quotedPrefix = who ? `[Quoting ${who}: "${quotedText}"] ` : `[Quoting: "${quotedText}"] `;
      }
      const baseText =
        isGroupChat && senderName ? `[${senderName.slice(0, 40)}] ${quotedPrefix}${incomingText}` : `${quotedPrefix}${incomingText}`;
      const displayText = !isGroupChat && isOwnerEarly ? `[OWNER] ${baseText}` : baseText;
      if (isGroupChat) {
        // Backdrop: the model otherwise only remembers turns it replied to.
        // Inject surrounding chatter (newest-last, deduped via watermark) so it
        // actually knows what's happening in the group.
        const wm = this.backdropTs.get(remoteJid) ?? 0;
        const log = this.messageLog.get(remoteJid) ?? [];
        const fresh = log.filter((e) => e.ts > wm && e.id !== mid).slice(-12);
        for (const e of fresh) {
          const t = e.text.length > 220 ? `${e.text.slice(0, 220)}…` : e.text;
          history.append(e.fromMe ? "assistant" : "user", t);
        }
        if (log.length > 0) this.backdropTs.set(remoteJid, log[log.length - 1].ts);
      }
      history.append("user", displayText);
      // Voice cloning: observe this line and mirror the customer's own style
      // (1:1 customers only — groups follow the group persona, the owner gets
      // direct [agent] efficiency). Cold profiles return null = house voice.
      let style: string | null = null;
      if (!isGroupChat && !isOwnerEarly) {
        try {
          const { styleDirectiveFor } = await import("./style-profile.js");
          style = await styleDirectiveFor(
            this.userId,
            remoteJid,
            text,
            history.all().length > 1,
          ).catch(() => null);
        } catch {
          /* default voice on any failure */
        }
      }
      // Saved manner notes: standing instructions for this chat + line
      // (owner-taught rules and per-person preferences). Null = none yet.
      // Groups and owner chats get them too — a group can have its own rules.
      let promptNotes: string | null = null;
      try {
        const { getPromptNotesBlock } = await import("./agent-tools/prompt-note-tools.js");
        promptNotes = await getPromptNotesBlock(this.userId, remoteJid).catch(() => null);
      } catch {
        /* proceed without notes */
      }
      this.rememberContact(remoteJid, pushName ?? undefined);
      if (!alreadyLogged && rawForLog) this.logIncoming(remoteJid, rawForLog, displayText, kind);
      // All socket writes go through the session-wide serializer: one account,
      // one voice at a time (ban-safe). Receipts below still use the raw sock.
      const psock = this.liveSock() ?? sock;
      const scoped = this.scopedContext(
        remoteJid,
        async (to, message) => {
          await sendWithTyping(psock, to, message);
          this.logOutgoing(to, message);
        },
        false,
        psock,
      );
      // isOwner was resolved above (owner gate needs full business info);
      // scoped maps still guarantee no cross-chat leakage.
      // Reuse the early result — same value, no second DB read.
      const isOwner = isOwnerEarly;
      scoped.isOwner = isOwner;
      // Owner chats keep the full session view (broadcast audience, cross-chat
      // reports). Customers stay scoped to their own chat — no leakage.
      if (isOwner) {
        scoped.contacts = this.contacts;
        scoped.messageLog = this.messageLog;
      }
      // Group reply gate: confidence-scored, so the bot doesn't answer every
      // message like a bot would. 1:1 chats always reply (unchanged).
      let group: GroupContext | null = null;
      if (remoteJid.endsWith("@g.us")) {
        group = await this.groupContext(remoteJid).catch(() => null);
        if (group) {
          const me = sock.user as unknown as { id?: string; lid?: string; phoneNumber?: string } | null | undefined;
          const selfIds = [me?.id, me?.lid, me?.phoneNumber].filter((x): x is string => !!x);
          const { isSelfJid: matchSelf } = await import("./agent-tools/store.js");
          const mentionedMe = mentioned.some((j) => selfIds.some((s) => matchSelf(j, s)));
          const quotedMe = !!quotedParticipant && selfIds.some((s) => matchSelf(quotedParticipant, s));
          const lower = incomingText.toLowerCase();
          const nameHit = group.names.some((n) => n.length >= 3 && lower.includes(n));
          const log = this.messageLog.get(remoteJid) ?? [];
          let recentOurs = 0;
          for (let i = log.length - 1; i >= 0 && recentOurs < 3; i--) {
            if (log[i]?.fromMe) recentOurs++;
            else break;
          }
          const { score, reasons } = this.groupReplyScore({
            text: incomingText,
            mentionedMe,
            quotedMe,
            nameHit,
            isOwner,
            managed: !!group.managed,
            recentOurs,
          });
          const addressed = mentionedMe || quotedMe || nameHit;
          group = { ...group, addressed };
          // Bands: clearly relevant (>= 0.45 and past the group's threshold)
          // replies now; background noise (< 0.15) stays silent; the ambiguous
          // middle goes to the aim-aware intent probe instead of a keyword list.
          const REPLY_AT = 0.45;
          const SILENT_BELOW = 0.15;
          let decision: "reply" | "silent" = score >= Math.max(REPLY_AT, group.threshold) || isOwner ? "reply" : "silent";
          if (decision === "silent" && !isOwner && score >= SILENT_BELOW) {
            const recent = (this.messageLog.get(remoteJid) ?? [])
              .slice(-4, -1)
              .map((e) => (e.text.length > 160 ? `${e.text.slice(0, 160)}…` : e.text));
            const { probeGroupIntent } = await import("../assistant/agent-runner.js");
            const probe = await probeGroupIntent({
              aim: group.aim,
              subject: group.subject,
              recent,
              sender: senderName || remoteJid.split("@")[0],
              text: incomingText,
            }).catch(() => null);
            if (probe && probe.reply && probe.confidence >= group.threshold) {
              decision = "reply";
              reasons.push(`probe-yes(${probe.confidence})`);
            } else if (probe) {
              reasons.push(`probe-no(${probe.confidence})`);
            } else {
              // Probe down (model/timeout) — fall back to the raw score so a
              // broken probe never mutes the group entirely.
              reasons.push("probe-failed");
              if (score >= group.threshold) {
                decision = "reply";
                reasons.push("fallback-score");
              }
            }
          }
          console.log(
            `[group-gate] "${group.subject}" score=${score} threshold=${group.threshold} -> ${decision} (${reasons.join("+")})`,
          );
          if (decision === "silent") {
            // Truly background chatter: stay silent. No random emoji spam —
            // only a rare acknowledgement so the bot doesn't look numb.
            // Most energy goes into actual replies (thresholds lowered above).
            await markProcessed(this.userId, remoteJid, mid, new Date(sentAt));
            if (Math.random() < 0.15 && mid) {
              const picks = ["👍", "❤️"];
              const emoji = picks[Math.floor(Math.random() * picks.length)];
              try {
                await psock.sendMessage(remoteJid, {
                  react: {
                    text: emoji,
                    key: { remoteJid, id: mid, fromMe: false, participant: key.participant ?? null },
                  },
                });
              } catch {
                /* reactions are cosmetic */
              }
            }
            return;
          }
        }
      }
      // Never go silent: if the agent run itself throws (model down, tool
      // loop blew up), the customer still gets an honest fallback and the
      // message is ledgered — a task may stumble, it never just dies.
      let reply: string;
      try {
        reply = await (async () => {
        // Slow answer? Act human while the tools work: after 8s with no
        // reply yet, blue-tick + ONE short holding bubble (1:1 only), then
        // the real answer lands on top like a follow-up message.
        let settled = false;
        let holdingTimer: ReturnType<typeof setTimeout> | null = null;
        if (!isGroupChat && key?.id) {
          holdingTimer = setTimeout(() => {
            if (settled) return;
            void this
              .sendHoldingLine(remoteJid, {
                isOwner,
                keyId: key.id ?? null,
                participant: key.participant ?? null,
                text,
              })
              .then((said) => {
                if (said) history.append("assistant", said);
              })
              .catch(() => {});
          }, 8000);
        }
      try {
        return await handleCustomerMessage({
          userId: this.userId,
          customerJid: remoteJid,
          incomingText: displayText,
          history: history.all(),
          sendText: scoped.sendText,
          sock: scoped.sock,
          contacts: scoped.contacts,
          messageLog: scoped.messageLog,
          group,
          style,
          promptNotes,
        });
        } finally {
          settled = true;
          if (holdingTimer) clearTimeout(holdingTimer);
        }
        })();
      } catch (error) {
        console.error(`Session ${this.userId} agent run failed, sending fallback:`, error);
        reply =
          "Sorry about that — that hiccuped on my end. Please say that again and I'll sort it out.";
      }
      history.append("assistant", reply);

      console.log("User:", displayText);
      console.log("AI:", reply);

      // Now that the answer is ready: blue ticks, typing, reply — back to back, like a human.
      try {
        await sock.readMessages([{ ...key, fromMe: false }]);
      } catch {
        /* receipts are cosmetic — never block the reply */
      }
      // Caught-up backlog gets an honest human opener, not silence.
      // Owner chats get an [agent] tag so the owner instantly sees who sent
      // what in self-chat (both sides are fromMe in WhatsApp's UI).
      // Customer chats stay human — no tag, never smell like a bot.
      const agedReply = ageMin > 10 ? `Sorry for the slow reply — ${reply}` : reply;
      const finalReply =
        isOwner && !remoteJid.endsWith("@g.us") && !agedReply.startsWith("[agent]")
          ? `[agent] ${agedReply}`
          : agedReply;
      try {
        await this.sendNaturalReply(remoteJid, finalReply, {
          id: key.id,
          participant: key.participant,
          text,
        });
        await markProcessed(this.userId, remoteJid, mid, new Date(sentAt));
      } catch (error) {
        // Delivery itself failed (line dropped mid-reply): do NOT ledger it —
        // catch-up / the next message will retry instead of losing the task.
        console.error(`Session ${this.userId} reply delivery failed, will retry:`, error);
      }
      } catch (error) {
        console.error("Message processing failed:", error);
      }
    });
  }

  /** Sweep chats for incoming messages that arrived while we were down and
   *  were never answered (not in the processed ledger). Runs shortly after
   *  every (re)connect; answers only the latest per chat so nobody gets
   *  spammed, with full pulled history as context. */
  private scheduleCatchUp(epoch: number): void {
    setTimeout(() => {
      if (this.stopped || epoch !== this.epoch || !this.isConnected()) return;
      void this.runCatchUp(epoch).catch((e) => console.error(`Session ${this.userId} catch-up failed:`, e));
    }, 25_000);
  }

  private async runCatchUp(epoch: number): Promise<void> {
    if (!this.sock) return;
    const sock = this.sock;
    let answered = 0;
    for (const [jid, log] of this.messageLog) {
      if (epoch !== this.epoch || !this.isConnected()) return;
      if (jid === "status@broadcast") continue;
      const pending = log.filter((e) => !e.fromMe && e.id && !this.seenMessageIds.has(e.id));
      if (pending.length === 0) continue;
      // Newest first, stop at the first one already handled.
      let target = null;
      for (let i = pending.length - 1; i >= 0; i--) {
        const e = pending[i];
        if (Date.now() - e.ts > 24 * 60 * 60_000) break;
        if (await wasProcessed(this.userId, jid, e.id)) break;
        target = e;
        break;
      }
      if (!target) {
        // Everything recent was already answered — just remember the ids.
        for (const e of pending) if (e.id) this.markSeen(e.id);
        continue;
      }
      this.markSeen(target.id);
      const key = target.key ?? { remoteJid: jid, id: target.id, fromMe: false, participant: null };
      await this.handleIncoming({
        remoteJid: jid,
        remoteJidAlt: (target.key as { remoteJidAlt?: string } | null)?.remoteJidAlt ?? null,
        key,
        text: target.text,
        kind: (target.kind ?? "text") as IncomingKind,
        mentioned: [],
        quotedParticipant: null,
        sentAt: target.ts,
        pushName: this.contacts.get(jid)?.name,
        sock,
        alreadyLogged: true,
      });
      answered++;
      if (answered >= 15) break;
    }
    if (answered > 0) console.log(`Session ${this.userId} catch-up answered ${answered} chat(s)`);
  }
}
