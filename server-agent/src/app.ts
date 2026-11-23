import { Hono } from "hono";
import { cors } from "hono/cors";
import mongoose from "mongoose";
import { INSTANCE_ID } from "./instance.js";
import SessionManager from "./sessions/session-manager.js";
import { toolUseCounts } from "./sessions/tool-usage.js";

const app = new Hono();
const sessions = new SessionManager();

// Browser frontend (Next.js) calls these routes directly.
// Lock down in prod via ALLOWED_ORIGINS (comma-separated) or PUBLIC_APP_URL;
// dev defaults to open CORS for localhost dashboards.
// Bare hostnames (e.g. Render injects `svc.onrender.com` with no scheme) are
// normalized to https:// so they match the browser's Origin header.
function withScheme(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  return /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i.test(v) ? `http://${v}` : `https://${v}`;
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.PUBLIC_APP_URL ?? "")
  .split(",")
  .map((s) => (s.trim() ? withScheme(s.trim()) : ""))
  .filter(Boolean);
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (allowedOrigins.length === 0) return origin || "*";
      if (!origin) return allowedOrigins[0];
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Optional API-key guard: if AGENT_API_KEY is set, dashboard must send
// `Authorization: Bearer <key>` (or x-agent-key). Unset = open (dev compat).
const AGENT_API_KEY = process.env.AGENT_API_KEY?.trim() ?? "";
app.use("/sessions/*", async (c, next) => {
  if (!AGENT_API_KEY) return next();
  const h = c.req.header("authorization") ?? c.req.header("x-agent-key") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : h;
  if (token !== AGENT_API_KEY) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/", (c) => {
  return c.text("Hello Hono + Baileys!");
});

app.get("/health", async (c) => {
  const states = sessions.listSessions();
  let leader: { instanceId: string; ageSec: number; weAreLeader: boolean } | null = null;
  let role = "leader";
  try {
    const mod = await import("./sessions/leader.js");
    leader = await mod.getLeaderInfo();
    role = mod.isLeader() ? "leader" : leader ? "standby" : "electing";
  } catch {
    /* leader row unreadable — report what we have */
  }
  let boot: Record<string, unknown> = {};
  try {
    const mod = await import("./health-status.js");
    boot = (mod.serverStatus?.() ?? {}) as Record<string, unknown>;
  } catch {
    /* optional */
  }
  return c.json({
    status: "ok",
    role,
    instance: INSTANCE_ID,
   mongo: mongoose.connection.readyState === 1 ? "up" : "down",
    sessions: states.length,
    connected: states.filter((s) => s.connected).length,
    states,
    leader,
    ...boot,
  });
});

// Standby guard: only the leader may mutate sockets or enqueue work.
// Reads (GET) stay open so the dashboard can show the standby state.
app.use(async (c, next) => {
  const mutating = ["POST", "PUT", "DELETE"].includes(c.req.method);
  const touchesSockets = c.req.path.startsWith("/sessions/");
  if (mutating && touchesSockets) {
    try {
      const { isLeader } = await import("./sessions/leader.js");
      if (!isLeader()) {
        return c.json(
          { error: "standby — another instance is active. This copy never dials WhatsApp." },
          503,
        );
      }
    } catch {
      /* leader check unreadable — fail open for the single-instance case */
    }
  }
  await next();
});

// Start (and create if needed) a session for a user
app.post("/sessions/:userId/start", async (c) => {
  const userId = c.req.param("userId");
  try {
    const session = await sessions.startSession(userId);
    return c.json({ started: true, ...session.getState() });
  } catch (e) {
    return c.json(
      { userId, started: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

// Stop a session (unlink: auth stays, so it reconnects without re-scan)
app.post("/sessions/:userId/stop", async (c) => {
  const userId = c.req.param("userId");
  if (!sessions.hasSession(userId)) {
    return c.json({ error: "session not found" }, 404);
  }
  await sessions.stopSession(userId);
  return c.json({ userId, stopped: true });
});

// All sessions and their live states
app.get("/sessions", (c) => {
  return c.json(sessions.listSessions());
});

// NOTE: static /sessions/* routes MUST stay above "/sessions/:userId" —
// otherwise "recent"/"tools" get swallowed as a userId and 404.
app.get("/sessions/recent", (c) => {
  const limit = Math.max(1, Math.min(Number(c.req.query("limit") ?? 20), 50));
  return c.json({ chats: sessions.recentChats(limit) });
});

app.get("/sessions/tools", async (c) => {
  try {
    const userId = c.req.query("userId")?.trim() || undefined;
    return c.json({ tools: await toolUseCounts(userId) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "lookup failed" }, 503);
  }
});

// Real home-dashboard aggregates (opt-in live metrics — cheap indexed counts).
// NOTE: must stay above "/sessions/:userId" (see note above).
app.get("/sessions/stats", async (c) => {
  try {
    const [{ JobModel }, { default: mongoose }] = await Promise.all([
      import("./sessions/agent-tools/jobs.js"),
      import("mongoose"),
    ]);
    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
    const sincePrev = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
    const mem = mongoose.connection.collection("chatmemory");
    const pro = mongoose.connection.collection("processedmsgs");
    const tools = mongoose.connection.collection("tooluses");
    const jobs = JobModel.collection;
    const [msgs7d, msgsPrev, cust7d, custPrev, pending, toolCalls7d, perDay] = await Promise.all([
      mem.countDocuments({ role: "user", ts: { $gte: since7 } }).catch(() => 0),
      mem.countDocuments({ role: "user", ts: { $gte: sincePrev, $lt: since7 } }).catch(() => 0),
      pro.distinct("chatJid", { ts: { $gte: since7 } }).catch(() => [] as unknown[]),
      pro.distinct("chatJid", { ts: { $gte: sincePrev, $lt: since7 } }).catch(() => [] as unknown[]),
      jobs.countDocuments({ status: "pending" }).catch(() => 0),
      tools.countDocuments({ at: { $gte: since7 } }).catch(() => 0),
      mem
        .aggregate([
          { $match: { role: "user", ts: { $gte: since14 } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray()
        .catch(() => [] as { _id: string; count: number }[]),
    ]);
    const dayMap = new Map((perDay as { _id: string; count: number }[]).map((d) => [d._id, d.count]));
    const traffic: { day: string; messages: number }[] = [];
    const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
      const key = d.toISOString().slice(0, 10);
      traffic.push({ day: i === 0 ? "Today" : fmt.format(d), messages: dayMap.get(key) ?? 0 });
    }
    const replies30d = await mem
      .countDocuments({ role: "assistant", ts: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } })
      .catch(() => 0);
    return c.json({
      messages7d: msgs7d,
      messagesPrev7d: msgsPrev,
      customers7d: (cust7d as unknown[]).length,
      customersPrev7d: (custPrev as unknown[]).length,
      pendingTasks: pending,
      toolCalls7d,
      traffic,
      replies30d,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "stats failed" }, 503);
  }
});

// ---- Agent Task Server (webhook/event-driven, no polling) ----
// POST /sessions/:userId/tasks — inbound webhook: enqueue an interrupt.
// Body: { to|chatJid, text, kind?: "send"|"agent", runAt?: ISO }.
// Due/imminent runAt dispatches via setImmediate interrupt; future runAt arms
// one exact timer. Scope is pinned to (userId, chatJid) — never leaks.
app.post("/sessions/:userId/tasks", async (c) => {
  const userId = c.req.param("userId");
  const body = (await c.req
    .json<{ to?: string; chatJid?: string; text?: string; kind?: string; runAt?: string }>()
    .catch(() => ({}) as { to?: string; chatJid?: string; text?: string; kind?: string; runAt?: string }));
  const chatJid = (body.chatJid ?? body.to ?? "").trim();
  const text = (body.text ?? "").trim().slice(0, 2000);
  if (!chatJid || !text) return c.json({ error: "`chatJid`/`to` and `text` are required" }, 400);
  const kind = body.kind === "agent" ? "agent" : "send";
  let runAt = new Date();
  if (body.runAt) {
    const t = new Date(body.runAt);
    if (Number.isNaN(t.getTime())) return c.json({ error: "invalid runAt" }, 400);
    runAt = t;
  }
  try {
    // Session must exist for immediate interrupts; scheduled tasks may enqueue anyway.
    const { enqueueTask } = await import("./sessions/task-queue.js");
    const { normalizeJid } = await import("./sessions/agent-tools/store.js");
    let jid = chatJid;
    try {
      jid = normalizeJid(chatJid);
    } catch {
      /* raw JID passthrough */
    }
    // Dashboard webhook holds AGENT_API_KEY => trusted owner path.
    const id = await enqueueTask({ userId, chatJid: jid, createdBy: jid, createdByIsOwner: true, kind, text, runAt });
    // enqueueTask already event-interrupts (setImmediate + change-stream);
    // no wake/poll needed.
    return c.json({ userId, id, chat: jid, kind, runAt: runAt.toISOString(), queued: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "enqueue failed" }, 500);
  }
});

// GET /sessions/:userId/tasks/pending — pending interrupts, scoped to userId (+ optional chatJid).
app.get("/sessions/:userId/tasks/pending", async (c) => {
  const userId = c.req.param("userId");
  const chatJid = c.req.query("chatJid")?.trim() || undefined;
  try {
    const { JobModel } = await import("./sessions/agent-tools/jobs.js");
    const filter: Record<string, unknown> = { userId, status: "pending" };
    if (chatJid) {
      const { normalizeJid } = await import("./sessions/agent-tools/store.js");
      try {
        filter.chatJid = normalizeJid(chatJid);
      } catch {
        filter.chatJid = chatJid;
      }
    }
    const docs = await JobModel.find(filter).select("_id chatJid kind text runAt createdBy").sort({ runAt: 1 }).limit(50).lean();
    return c.json({
      tasks: docs.map((d) => ({
        id: String(d._id),
        chat: (d as Record<string, unknown>).chatJid,
        kind: (d as Record<string, unknown>).kind,
        text: (d as Record<string, unknown>).text,
        runAt: d.runAt instanceof Date ? d.runAt.toISOString() : String(d.runAt),
      })),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "lookup failed" }, 503);
  }
});

// GET /sessions/:userId/tasks/stats — dispatcher state (proves no polling: one armed timer, not a loop).
app.get("/sessions/:userId/tasks/stats", async (c) => {
  const { taskServerStats } = await import("./sessions/task-queue.js");
  return c.json({ userId: c.req.param("userId"), mode: "webhook/event-driven", ...taskServerStats() });
});

// Session status
app.get("/sessions/:userId", (c) => {
  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  return c.json(session.getState());
});

// Latest QR for pairing. Poll this after /start until `qr` is non-null,
// then render it with any QR library in the frontend.
app.get("/sessions/:userId/qr", (c) => {
  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  return c.json({
    userId,
    status: session.status,
    qr: session.qr,
    pairingCode: session.pairingCode,
    connected: session.isConnected(),
  });
});

// 8-char code typed into WhatsApp on the phone itself (same-phone linking:
// Settings → Linked devices → Link a device → "Link with phone number
// instead"). Body: { phoneNumber: "2348012345678" }. Start the session first
// (or it starts here), then POST this — the code shows on the Link page.
app.post("/sessions/:userId/pairing-code", async (c) => {
  const userId = c.req.param("userId");
  const body = (await c.req.json<{ phoneNumber?: string }>().catch(() => ({}) as { phoneNumber?: string }));
  const phoneNumber = String(body.phoneNumber ?? "").trim();
  if (!phoneNumber) return c.json({ error: "`phoneNumber` is required (e.g. 2348012345678)" }, 400);
  try {
    const session = sessions.ensureSession(userId);
    const code = await session.requestPairingCode(phoneNumber);
    return c.json({ userId, pairingCode: code, status: session.status, connected: session.isConnected() });
  } catch (e) {
    return c.json({ userId, error: e instanceof Error ? e.message : "pairing failed" }, 500);
  }
});

// Activate the agent for a group: persona + rhythm + first recurring job, one call.
app.post("/sessions/:userId/group-agent/setup", async (c) => {
  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) return c.json({ error: "session not found" }, 404);
  if (!session.isConnected()) return c.json({ error: "session is not connected" }, 503);
  type SetupBody = {
    groupJid?: string;
    name?: string;
    role?: string;
    personality?: string;
    duty?: string;
    mode?: string;
    purpose?: string;
    intro?: string;
    intervalHours?: number;
    maxPerDay?: number;
    replyThreshold?: number;
  };
  const body = (await c.req.json<SetupBody>().catch(() => ({}) as SetupBody));
  const groupJid = String(body.groupJid ?? "").trim();
  if (!groupJid.endsWith("@g.us")) return c.json({ error: "`groupJid` must be a group (@g.us)" }, 400);
  try {
    const store = await import("./sessions/agent-tools/group-agent-store.js");
    const { buildEngagementInstruction, styleExamplesFromLog } = await import("./sessions/agent-tools/group-agent-tools.js");
    const { JobModel } = await import("./sessions/agent-tools/jobs.js");
    const intervalHours = Math.min(168, Math.max(1, Math.round(Number(body.intervalHours ?? 6) || 6)));
    const maxPerDay = Math.min(20, Math.max(1, Math.round(Number(body.maxPerDay ?? 4) || 4)));
    const mode = store.normalizeMode(body.mode);
    const rtRaw = Number(body.replyThreshold);
    const replyThreshold = Number.isFinite(rtRaw) ? Math.min(1, Math.max(0, rtRaw)) : store.MODE_FLOORS[mode];
    const details = await session.groupDetails(groupJid);
    const repeatKey = store.repeatKeyFor(userId, groupJid);
    await store.deletePendingChain(userId, repeatKey);
    const instruction = buildEngagementInstruction({
      name: String(body.name ?? "").trim(),
      role: String(body.role ?? "").trim(),
      subject: details.subject,
      maxPerDay,
      duty: String(body.duty ?? "").trim(),
    });
    const firstAt = new Date(Date.now() + intervalHours * 3_600_000);
    const doc = await JobModel.create({
      userId,
      chatJid: groupJid,
      createdBy: groupJid,
      createdByIsOwner: true,
      kind: "agent",
      text: instruction,
      runAt: firstAt,
      status: "pending",
      attempts: 0,
      lastError: "",
      repeatMs: intervalHours * 3_600_000,
      repeatKey,
    });
    const style = styleExamplesFromLog(
      session.recentUserTexts(groupJid, 50).map((text) => ({ text, fromMe: false })),
    );
    const baseCfg = {
      userId,
      groupJid,
      enabled: true,
      name: String(body.name ?? "").trim().slice(0, 60),
      role: String(body.role ?? "").trim().slice(0, 120),
      personality: String(body.personality ?? "").trim().slice(0, 300),
      duty: String(body.duty ?? "").trim().slice(0, 300),
      mode,
      intervalHours,
      maxPerDay,
      replyThreshold,
      subject: details.subject,
      autoWhitelisted: false,
      styleExamples: style,
      repeatKey,
      jobId: String(doc._id),
    };
    await store.saveGroupAgent(baseCfg);
    // Group social memory: purpose + owner-approved intro (sent once).
    const purpose = String(body.purpose ?? "").trim().slice(0, 300);
    const intro = String(body.intro ?? "").trim().slice(0, 500);
    if (purpose || intro) {
      try {
        const { saveGroupSocialPatch } = await import("./sessions/social/group-memory.js");
        await saveGroupSocialPatch(userId, groupJid, {
          ...(purpose ? { purpose } : {}),
          ...(intro ? { intro, introSent: false } : {}),
        });
      } catch {
        /* memory is best-effort */
      }
    }
    // Activation implies access: allow-list the group so EXCLUSIVE mode lets
    // its messages through (lifts a STOP block too — reported).
    let accessNote = "";
    try {
      const { ensureGroupAllowed } = await import("./sessions/chat-access.js");
      const r = await ensureGroupAllowed(userId, groupJid, details.subject);
      if (r.whitelisted) await store.saveGroupAgent({ ...baseCfg, autoWhitelisted: true });
      accessNote = r.wasBlocked
        ? "The group was blocked (e.g. a STOP opt-out) — activation lifted the block."
        : "The group is now allow-listed so its messages always reach the agent.";
    } catch {
      accessNote = "Allow-listing failed — whitelist the group on the Link page if messages don't arrive.";
    }
    const { wake } = await import("./sessions/task-queue.js");
    wake();
    return c.json({
      userId,
      activated: true,
      group: details.subject,
      members: details.members,
      amAdmin: details.isAdmin,
      mode,
      intervalHours,
      maxPerDay,
      replyThreshold,
      styleSamples: style.length,
      firstRunAt: firstAt.toISOString(),
      access: accessNote.trim(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "setup failed" }, 500);
  }
});

// Group agent status: persona + rhythm + next run + today's count.
app.get("/sessions/:userId/group-agent/status", async (c) => {
  const userId = c.req.param("userId");
  const groupJid = c.req.query("jid")?.trim() ?? "";
  if (!groupJid) return c.json({ error: "`jid` query param is required" }, 400);
  try {
    const store = await import("./sessions/agent-tools/group-agent-store.js");
    const { countMessages } = await import("./sessions/chat-memory.js");
    const cfg = await store.getGroupAgent(userId, groupJid);
    if (!cfg) return c.json({ userId, configured: false });
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const [next, sentToday] = await Promise.all([
      store.nextPendingRun(userId, cfg.repeatKey),
      countMessages(userId, groupJid, "assistant", day),
    ]);
    return c.json({
      userId,
      configured: true,
      enabled: cfg.enabled,
      name: cfg.name,
      role: cfg.role,
      intervalHours: cfg.intervalHours,
      maxPerDay: cfg.maxPerDay,
      replyThreshold: typeof cfg.replyThreshold === "number" ? cfg.replyThreshold : 0.5,
      sentToday,
      nextRunAt: next ? next.toISOString() : null,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "lookup failed" }, 503);
  }
});

// Switch the group agent off (persona saved, loop cancelled).
app.delete("/sessions/:userId/group-agent", async (c) => {
  const userId = c.req.param("userId");
  const body = (await c.req.json<{ groupJid?: string }>().catch(() => ({}) as { groupJid?: string }));
  const groupJid = String(body.groupJid ?? c.req.query("jid") ?? "").trim();
  if (!groupJid) return c.json({ error: "`groupJid` is required" }, 400);
  try {
    const store = await import("./sessions/agent-tools/group-agent-store.js");
    const cfg = await store.getGroupAgent(userId, groupJid);
    if (!cfg) return c.json({ error: "no group agent configured here" }, 404);
    const cancelled = await store.deletePendingChain(userId, cfg.repeatKey);
    await store.setGroupAgentEnabled(userId, groupJid, false);
    let accessRemoved = false;
    if (cfg.autoWhitelisted) {
      try {
        const { removeAutoWhitelist } = await import("./sessions/chat-access.js");
        await removeAutoWhitelist(userId, groupJid);
        accessRemoved = true;
      } catch {
        /* rule stays — harmless, removable on the Link page */
      }
    }
    return c.json({ userId, disabled: true, cancelledLoops: cancelled, accessRemoved });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "disable failed" }, 500);
  }
});

// Full delete: stop the session and wipe its auth from Mongo.
app.delete("/sessions/:userId", async (c) => {
  const userId = c.req.param("userId");
  if (!sessions.hasSession(userId)) {
    return c.json({ error: "session not found" }, 404);
  }
  await sessions.destroySession(userId);
  return c.json({ userId, deleted: true });
});

// WhatsApp profile picture for any JID on this session's account.
app.get("/sessions/:userId/avatar", async (c) => {
  const userId = c.req.param("userId");
  const jid = c.req.query("jid");
  if (!jid) return c.json({ error: "`jid` query param is required" }, 400);
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  const url = await session.getAvatarUrl(jid);
  return c.json({ userId, jid, url });
});

// Force-refresh the block/allow cache after the dashboard edits rules.
app.post("/sessions/:userId/access/invalidate", async (c) => {
  const userId = c.req.param("userId");
  const { invalidateChatAccess } = await import("./sessions/chat-access.js");
  invalidateChatAccess(userId);
  return c.json({ userId, invalidated: true });
});

// Chats this session has seen + all its groups: feeds the dashboard allow/block list.
app.get("/sessions/:userId/contacts", async (c) => {
  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  return c.json({ userId, chats: await session.listKnownChats() });
});

// Every group this account is in + whether it is admin there. Admins first,
// then most-recently-active. Powers the dashboard Groups section.
app.get("/sessions/:userId/groups", async (c) => {
  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  try {
    return c.json({ userId, groups: await session.listGroups() });
  } catch (e) {
    return c.json(
      { userId, groups: [], offline: true, error: e instanceof Error ? e.message : "lookup failed" },
      503,
    );
  }
});

// Full roster for ONE group (on demand — keeps the list call light).
app.get("/sessions/:userId/groups/details", async (c) => {
  const userId = c.req.param("userId");
  const jid = c.req.query("jid")?.trim() ?? "";
  if (!jid) return c.json({ error: "`jid` query param is required" }, 400);
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  try {
    return c.json({ userId, group: await session.groupDetails(jid) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "lookup failed";
    return c.json({ error: msg }, /not connected/i.test(msg) ? 503 : 404);
  }
});

// One-off catalog seed (local -> cloud moves): upserts products by SKU/name.
// Key-guarded by the /sessions/* auth above. Accepts a raw JSON array or
// { products: [...] } (max 200 per call). Remove once migrated if unwanted.
app.post("/sessions/:userId/admin/seed-products", async (c) => {
  const userId = c.req.param("userId");
  const body = (await c.req.json().catch(() => null)) as { products?: unknown } | unknown[] | null;
  const items = Array.isArray(body) ? body : Array.isArray(body?.products) ? body.products : null;
  if (!items || items.length === 0) {
    return c.json({ error: "Send a JSON array of products (or { products: [...] }), max 200." }, 400);
  }
  try {
    const { upsertProducts, ownerIdForLine } = await import("./sessions/agent-tools/store.js");
    const owner = await ownerIdForLine(userId).catch(() => null);
    const res = await upsertProducts(items, owner ?? undefined);
    return c.json({ userId, ...res, received: items.length });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "seed failed" },
      500,
    );
  }
});

// Send a message via a session
app.post("/sessions/:userId/send", async (c) => {
  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  const body = await c.req.json<{ to?: string; text?: string }>();
  if (!body.to || !body.text) {
    return c.json({ error: "`to` and `text` are required" }, 400);
  }
  try {
    await session.send(body.to, body.text);
    return c.json({ userId, to: body.to, sent: true });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "send failed" },
      500,
    );
  }
});

// Post a WhatsApp Status (story) via a session
app.post("/sessions/:userId/status", async (c) => {  const userId = c.req.param("userId");
  const session = sessions.getSession(userId);
  if (!session) {
    return c.json({ error: "session not found" }, 404);
  }
  const body = await c.req.json<{
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    backgroundColor?: string;
  }>();
  try {
    const result = await session.postStatus(body ?? {});
    return c.json({ userId, posted: true, ...result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "status post failed" },
      500,
    );
  }
});

export default app;
export { sessions };
