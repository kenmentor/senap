import type SessionManager from "./session-manager.js";
import { runDueJobs as runDue, startTaskServer, wake } from "./task-queue.js";

/**
 * Backwards-compatible wrapper: the durable queue + interrupt dispatcher now
 * live in task-queue.ts. Existing imports (`runDueJobs`, `startJobWorker`)
 * keep working.
 */
export async function runDueJobs(sessions: SessionManager): Promise<number> {
  return runDue(sessions);
}

/** Start the event-driven dispatcher (no tick/poll). Safe to call once at boot. */
export function startJobWorker(sessions: SessionManager): void {
  startTaskServer(sessions);
}

export { wake as wakeJobWorker };
