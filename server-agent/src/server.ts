import { serve } from "@hono/node-server";
import app, { sessions } from "./app.js";
import { loadRegisteredSessionIds } from "./sessions/session-registry.js";
import { startJobWorker } from "./sessions/job-runner.js";

const port = Number(process.env.PORT ?? 3001);

// Safety net: one session's stray failure must never kill the whole server
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Hono server listening on http://localhost:${info.port}`);
  startJobWorker(sessions);
  void bootResilient();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resilient boot: waits for Mongo instead of dying when it isn't up yet,
 * retries every session start, then reconciles forever so a session that
 * dies later (or was linked while the agent was down) comes back on its own.
 */
async function bootResilient(): Promise<void> {
  let ids: string[] = [];
  for (let attempt = 1; ; attempt++) {
    try {
      ids = await loadRegisteredSessionIds();
      break;
    } catch (err) {
      const wait = Math.min(5000 * attempt, 30_000);
      console.error(
        `Boot: registry unreachable (attempt ${attempt}) — retrying in ${wait / 1000}s. Start MongoDB (docker start senap-mongo) if this persists.`,
        err instanceof Error ? err.message : err,
      );
      await sleep(wait);
    }
  }
  if (ids.length === 0) {
    console.log("Boot: no registered sessions.");
  } else {
    console.log(`Boot: starting ${ids.length} session(s)…`);
    for (const id of ids) {
      await startWithRetry(id);
      // Stagger logins so WhatsApp isn't hit with all sessions at once
      await sleep(1500);
    }
  }
  setInterval(() => {
    void reconcile().catch((err) => console.error("Reconcile failed:", err));
    try {
      sessions.trimAll();
    } catch {
      /* best effort */
    }
  }, 60_000);
  console.log("Boot: reconciler started (60s tick).");
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

/** Revive anything that should be running but isn't (never touch parked/logged-out). */
async function reconcile(): Promise<void> {
  let ids: string[];
  try {
    ids = await loadRegisteredSessionIds();
  } catch {
    return; // DB down — next tick
  }
  for (const id of ids) {
    if (sessions.isParked(id)) continue;
    const s = sessions.getSession(id);
    if (!s || s.status === "closed") {
      console.log(`Reconcile: reviving session ${id}`);
      await startWithRetry(id, 2);
    }
    // status "logged_out" needs a fresh QR scan — left for the user on /dashboard/link.
  }
}
