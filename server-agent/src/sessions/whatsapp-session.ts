import makeWASocket, {
  DisconnectReason,
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
import { handleCustomerMessage } from "../assistant/agent-runner.js";
import type {
  BufferedMessage,
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
function extractIncoming(m: WAMessage): { text: string; kind: IncomingKind } | null {
  const msg = m.message;
  if (!msg) return null;
  const direct = msg.conversation || msg.extendedTextMessage?.text;
  if (direct) return { text: direct, kind: "text" };
  if (msg.imageMessage) {
    return msg.imageMessage.caption
      ? { text: msg.imageMessage.caption, kind: "photo" }
      : { text: "", kind: "photo" };
  }
  if (msg.videoMessage) {
    return msg.videoMessage.caption
      ? { text: msg.videoMessage.caption, kind: "video" }
      : { text: "", kind: "video" };
  }
  if (msg.documentMessage) {
    return msg.documentMessage.caption
      ? { text: msg.documentMessage.caption, kind: "document" }
      : { text: "", kind: "document" };
  }
  if (msg.audioMessage) return { text: "", kind: "audio" };
  if (msg.stickerMessage) return { text: "", kind: "sticker" };
  return null;
}

export class WhatsappSession {
  userId: string;
  sock: ReturnType<typeof makeWASocket> | null = null;
  status: SessionStatus = "idle";
  qr: string | null = null;
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
              session.enqueueSend(String(jid), () => {
                const t = target as unknown as {
                  sendMessage: (j: string, c: unknown, o?: unknown) => Promise<never>;
                };
                return t.sendMessage(jid, content, options);
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

  async stop(): Promise<void> {
    // Bump the generation first: any in-flight connect or pending reconnect
    // timer from before this stop is now stale and must stand down.
    this.epoch += 1;
    this.stopped = true;
    this.qr = null;
    // Free RAM when not in use: drop all per-chat state. It reseeds from
    // WhatsApp sync + Mongo on next start, so stopping is a real memory reset.
    this.histories.clear();
    this.messageLog.clear();
    this.contacts.clear();
    this.seenMessageIds.clear();
    this.chatChains.clear();
    this.chatActivity.clear();
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
    if (participantId === selfId) return true;
    const a = participantId.split("@")[0].replace(/\D/g, "");
    const b = selfId.split("@")[0].replace(/\D/g, "");
    if (a.length === 0 || b.length === 0) return false;
    if (a === b) return true;
    if (a.length < 7 || b.length < 7) return false;
    const tail = Math.min(a.length, b.length, 12);
    return a.slice(-tail) === b.slice(-tail);
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
    const selfId = this.sock.user?.id ?? "";
    const groups = await this.sock.groupFetchAllParticipating();
    const rows = Object.entries(groups).map(([jid, meta]) => {
      const participants = meta.participants ?? [];
      const me = participants.find((p) => this.isSelfParticipant(p.id, selfId));
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
    return rows.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      if (b.lastActive !== a.lastActive) return b.lastActive - a.lastActive;
      return a.subject.localeCompare(b.subject);
    });
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
    participants: { jid: string; name: string; admin: boolean }[];
  }> {
    if (!this.sock || this.status !== "open") {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    if (!jid.endsWith("@g.us")) throw new Error("That is not a group chat.");
    const selfId = this.sock.user?.id ?? "";
    const meta = await this.sock.groupMetadata(jid);
    const participants = (meta.participants ?? []).map((p) => {
      const adminFlag = (p as { admin?: string | null }).admin;
      return {
        jid: p.id,
        name: this.contacts.get(p.id)?.name ?? p.id.split("@")[0],
        admin: adminFlag === "admin" || adminFlag === "superadmin",
      };
    });
    const me = (meta.participants ?? []).find((p) => this.isSelfParticipant(p.id, selfId));
    const meAdmin = (me as { admin?: string | null } | undefined)?.admin;
    return {
      jid,
      subject: meta.subject || "Group",
      desc: meta.desc ?? "",
      members: participants.length,
      isAdmin: meAdmin === "admin" || meAdmin === "superadmin",
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
  }): Promise<{ kind: "text" | "image" | "video" }> {
    if (!this.sock) {
      throw new Error(`Session ${this.userId} is not connected`);
    }
    const text = (input.text ?? "").trim().slice(0, 700);
    const imageUrl = (input.imageUrl ?? "").trim();
    const videoUrl = (input.videoUrl ?? "").trim();
    if (!text && !imageUrl && !videoUrl) {
      throw new Error("`text` or an `imageUrl`/`videoUrl` is required.");
    }
    const STATUS_JID = "status@broadcast";
    if (videoUrl) {
      if (!/^https?:\/\//i.test(videoUrl)) throw new Error("Only http(s) URLs are allowed.");
      await this.sock.sendMessage(STATUS_JID, {
        video: { url: videoUrl },
        caption: text || undefined,
      });
      return { kind: "video" };
    }
    if (imageUrl) {
      if (!/^https?:\/\//i.test(imageUrl)) throw new Error("Only http(s) URLs are allowed.");
      await this.sock.sendMessage(STATUS_JID, {
        image: { url: imageUrl },
        caption: text || undefined,
      });
      return { kind: "image" };
    }
    const bg = (input.backgroundColor ?? "#00a884").trim();
    await this.sock.sendMessage(
      STATUS_JID,
      { text },
      {
        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : "#00a884",
        font: 0,
      },
    );
    return { kind: "text" };
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
            this.sock = null;
            this.histories.clear();
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
        this.status = "open";
        this.reconnectFailures = 0;
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

      for (const m of event.messages) {
        // One malformed/poison message must never break the loop or become an
        // unhandled rejection that takes down the session.
        try {
          if (!m?.key || m.key.fromMe) continue;

          const remoteJid = m.key.remoteJid;
          if (!remoteJid) continue;

          const mid = m.key.id ?? "";
          if (!mid || this.markSeen(mid)) continue;

          const got = extractIncoming(m);
          if (!got) continue;

          const ts = m.messageTimestamp;
          await this.handleIncoming({
            remoteJid,
            key: { remoteJid, id: m.key.id, fromMe: m.key.fromMe, participant: m.key.participant },
            text: got.text,
            kind: got.kind,
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
    key: { remoteJid?: string | null; id?: string | null; fromMe?: boolean | null; participant?: string | null };
    text: string;
    kind: IncomingKind;
    sentAt: number;
    pushName?: string | null;
    sock: ReturnType<typeof makeWASocket>;
    alreadyLogged: boolean;
    rawForLog?: WAMessage;
  }): Promise<void> {
    const { remoteJid, key, text, kind, sentAt, pushName, sock, alreadyLogged, rawForLog } = args;
    const mid = key.id ?? "";
    if (!mid) return;
    const ageMin = Math.max(0, (Date.now() - sentAt) / 60000);
    if (ageMin > 60 * 48) return; // ancient — never blast a reply days late.

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

    // Access gate FIRST: blacklisted / non-whitelisted chats are dropped
    // entirely — no history, no log, no AI, no reply. Just dropped.
    if (!(await isChatAllowed(this.userId, remoteJid))) return;

    if (isOptOut && kind === "text") {
      try {
        const { isOwnerJid, loadBusiness } = await import("./agent-tools/store.js");
        const b = await loadBusiness().catch(() => null);
        const senderIsOwner =
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
      await this.ensureHistory(remoteJid);
      const history = this.historyFor(remoteJid);
      history.append("user", incomingText);
      this.rememberContact(remoteJid, pushName ?? undefined);
      if (!alreadyLogged && rawForLog) this.logIncoming(remoteJid, rawForLog, incomingText, kind);
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
      // isOwner is resolved inside the agent runner (owner gate needs full
      // business info); scoped maps still guarantee no cross-chat leakage.
      const { isOwnerJid, loadBusiness } = await import("./agent-tools/store.js");
      let isOwner = false;
      try {
        const b = await loadBusiness().catch(() => null);
        isOwner =
          isOwnerJid(remoteJid, b?.phone) ||
          (b?.adminVerified === true && !!b?.adminPhone ? isOwnerJid(remoteJid, b.adminPhone) : false);
      } catch {
        isOwner = false;
      }
      scoped.isOwner = isOwner;
      // Owner chats keep the full session view (broadcast audience, cross-chat
      // reports). Customers stay scoped to their own chat — no leakage.
      if (isOwner) {
        scoped.contacts = this.contacts;
        scoped.messageLog = this.messageLog;
      }
      const reply = await handleCustomerMessage({
        userId: this.userId,
        customerJid: remoteJid,
        incomingText,
        history: history.all(),
        sendText: scoped.sendText,
        sock: scoped.sock,
        contacts: scoped.contacts,
        messageLog: scoped.messageLog,
      });
      history.append("assistant", reply);

      console.log("User:", incomingText);
      console.log("AI:", reply);

      // Now that the answer is ready: blue ticks, typing, reply — back to back, like a human.
      try {
        await sock.readMessages([{ ...key, fromMe: false }]);
      } catch {
        /* receipts are cosmetic — never block the reply */
      }
      // Caught-up backlog gets an honest human opener, not silence.
      const finalReply = ageMin > 10 ? `Sorry for the slow reply — ${reply}` : reply;
      await this.sendNaturalReply(remoteJid, finalReply, {
        id: key.id,
        participant: key.participant,
        text,
      });
      await markProcessed(this.userId, remoteJid, mid, new Date(sentAt));
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
        key,
        text: target.text,
        kind: (target.kind ?? "text") as IncomingKind,
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
