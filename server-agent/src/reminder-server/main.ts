import type SessionManager from "../sessions/session-manager.js";
import { enqueueTask, startTaskServer, stopTaskServer, taskServerStats, wake } from "../sessions/task-queue.js";

/**
 * Agent Task Server.
 *
 * Thin owner for the durable + in-memory task dispatcher (see task-queue.ts).
 * The dashboard / tools enqueue tasks; the dispatcher interrupts the owning
 * session's agent with ONLY that task's (userId, chatJid) scope — never
 * another customer's details.
 */
export class TaskServer {
  private started = false;

  constructor(private sessions: SessionManager) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    startTaskServer(this.sessions);
  }

  /** Nudge the dispatcher: a newly enqueued task is picked up immediately. */
  notify(): void {
    wake();
  }

  stats(): { chains: number; draining: boolean; armedFor: number | null } {
    return taskServerStats();
  }

  stop(): void {
    stopTaskServer();
    this.started = false;
  }

  async schedule(input: {
    userId: string;
    chatJid: string;
    createdBy: string;
    createdByIsOwner?: boolean;
    kind: "send" | "agent";
    text: string;
    runAt: Date;
  }): Promise<string> {
    return enqueueTask(input);
  }
}

export default TaskServer;
