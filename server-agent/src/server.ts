import { serve } from "@hono/node-server";
import mongoose from "mongoose";
import app, { sessions } from "./app.js";
import { INSTANCE_ID } from "./instance.js";
import { loadRegisteredSessionIds } from "./sessions/session-registry.js";
import { startJobWorker } from "./sessions/job-runner.js";
import {
  isLeader,
  releaseLeadership,
  startHeartbeat,
  tryAcquireLeadership,
  watchLeadership,
} from "./sessions/leader.js";
import { ensureMongo } from "./sessions/mongo.js";
import { serverStatus, setBootState, setReconcile } from "./health-status.js";

const port = Number(process.env.PORT ?? 3001);
const BOOT_AT = new Date(serverStatus().bootAt);
void BOOT_AT;

// Safety net: one session's stray failure must never kill the whole server
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Hono server listening on http://localhost:${info.port} (instance ${INSTANCE_ID})`);
  void electAndBoot();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Predictable lifecycle:
 *  1. Only the leader dials WhatsApp (Mongo lock, 10s heartbeat / 30s
 *     takeover). Standbys answer /health but refuse socket writes with 503,
 *     so two copies can never REPLACED-fight.
 *  2. The leader pre-creates every registered session FIRST (status
 *     "starting") so the dashboard sees Starting… instead of 404, then
 *     dials them one by one.
 *  3. A 60s reconciler revives anything that died, forever. Same tick,
 *     same order, same logs — the behaviour you can set your watch by.
 */
async function electAndBoot(): Promise<void> {
  if (await tryAcquireLeadership()) {
    startHeartbeat();
    await bootLeader();
  } else {
    setBootState("standby");
    console.log(`Standby (${INSTANCE_ID}) — another instance holds the lock. No sockets dialled here.`);
  }
  // Keep watching: a standby becomes leader when the lock goes stale;
  // a leader that loses the row steps down (handled inside).
  watchLeadership(() => void bootLeader());
  startReconciler();
}

let booted = false;
async function bootLeader(): Promise<void> {
  if (booted || !isLeader()) return;
  booted = true;
  setBootState("starting");
  startJobWorker(sessions);
  await bootResilient();
  setBootState("live");
}

async function bootResilient(): Promise<void> {
  let ids: string[] = [];
  for (let attempt = 1; ; attempt++) {
    try {
      ids = await loadRegisteredSessionIds();
      break;
    } catch (err) {
      const wait = Math.min(5000 * attempt, 30_000);
      console.error(
        `Boot: registry unreachable (attempt ${attempt}) — retrying in ${wait / 1000}s.`,
        err instanceof Error ? err.message : err,
      );
      await sleep(wait);
    }
  }
  if (ids.length === 0) {
    console.log("Boot: no registered sessions.");
  } else {
    // Pre-create first: dashboard polls read the map immediately and show
    // "Starting…" instead of 404 ("session lost — press Start again").
    for (const id of ids) sessions.prewarm(id);
    console.log(`Boot: starting ${ids.length} session(s)…`);
    for (const id of ids) {
      if (!isLeader()) {
        console.log("Boot: lost leadership mid-boot — stopping dial.");
        return;
      }
      await startWithRetry(id);
      // Stagger logins so WhatsApp isn't hit with all sessions at once
      await sleep(1500);
    }
  }
  console.log("Boot: all registered sessions dialled.");
}

async function startWithRetry(userId: string, maxAttempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (sessions.getSession(userId)?.isConnected()) return;
      await sessions.startSession(userId);
      console.log(`Boot: session ${userId} started`);
      return;
    } catch (err) {
      const wait = Math.min(5000 * attempt, 30_000);
      console.error(
        `Boot: session ${userId} failed (attempt ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < maxAttempts) await sleep(wait);
    }
  }
}

function startReconciler(): void {
  setInterval(() => {
    if (!isLeader()) return; // standbys never touch sockets
    void reconcile().catch((err) => console.error("Reconcile failed:", err));
    void sessions.sweepAbandoned().catch((err) => console.error("Sweep failed:", err));
    try {
      sessions.trimAll();
    } catch {
      /* best effort */
    }
  }, 60_000);
  console.log("Reconciler armed (60s tick, leader only).");
}

/** Revive anything that should be running but isn't (never touch parked/logged-out). */
async function reconcile(): Promise<void> {
  // Mongo ping first: a dropped connection reads as "no sessions" and would
  // wrongly look like an empty registry — fail closed instead.
  try {
    await ensureMongo();
    await mongoose.connection.db?.admin().ping();
  } catch {
    setReconcile("mongo unreachable — skipped");
    return;
  }
  let ids: string[];
  try {
    ids = await loadRegisteredSessionIds();
  } catch {
    setReconcile("registry unreadable — skipped");
    return; // DB down — next tick
  }
  let revived = 0;
  for (const id of ids) {
    if (sessions.isParked(id)) continue;
    const s = sessions.getSession(id);
    if (!s) {
      sessions.prewarm(id);
      console.log(`Reconcile: reviving missing session ${id}`);
      await startWithRetry(id, 2);
      revived++;
    } else if (s.status === "closed") {
      console.log(`Reconcile: reviving session ${id}`);
      await startWithRetry(id, 2);
      revived++;
    }
    // status "logged_out" needs a fresh QR scan — left for the user on /dashboard/link.
  }
  const note =
    revived === 0 ? `ok — ${ids.length} registered, all alive` : `ok — revived ${revived}/${ids.length}`;
  // Hourly heartbeat line: proves the process is alive for 2-week runs.
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  setReconcile(note);
  console.log(
    `Reconcile: ${note} (uptime ${Math.floor((Date.now() - BOOT_AT.getTime()) / 3600000)}h, rss ${memMb}MB)`,
  );
}

/** Graceful shutdown: release the lock FIRST so the next deploy takes over
 *  instantly, then close sockets (avoids the REPLACED fight during deploys). */
async function shutdown(signal: string): Promise<void> {
  console.log(`Shutdown (${signal}) — releasing leadership, closing sockets…`);
  try {
    await releaseLeadership();
  } catch {
    /* best effort */
  }
  try {
    for (const s of sessions.listSessions()) {
      const sess = sessions.getSession(s.userId);
      if (sess && s.connected) await sess.stop().catch(() => {});
    }
  } catch {
    /* best effort */
  }
  try {
    await mongoose.disconnect().catch(() => {});
  } catch {
    /* best effort */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
