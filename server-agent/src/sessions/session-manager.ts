import { WhatsappSession } from "./whatsapp-session.js";

/** How long a manually stopped/unlinked session stays exempt from auto-restart. */
const PARK_TTL_MS = 10 * 60_000;

export default class SessionManager {
  private sessions = new Map<string, WhatsappSession>();
  /** userIds parked by an explicit stop/unlink/delete — the reconciler skips them. */
  private parked = new Map<string, number>();

  ensureSession(userId: string): WhatsappSession {
    let session = this.sessions.get(userId);
    if (!session) {
      session = new WhatsappSession(userId);
      this.sessions.set(userId, session);
    }
    return session;
  }

  getSession(userId: string) {
    return this.sessions.get(userId);
  }

  hasSession(userId: string) {
    return this.sessions.has(userId);
  }

  async startSession(userId: string) {
    const session = this.ensureSession(userId);
    await session.start();
    return session;
  }

  async stopSession(userId: string) {
    this.parked.set(userId, Date.now());
    await this.getSession(userId)?.stop();
  }

  /** Stop the session, wipe its auth, and forget it. */
  async destroySession(userId: string) {
    this.parked.set(userId, Date.now());
    const session = this.getSession(userId);
    if (session) {
      await session.destroy();
      this.sessions.delete(userId);
    }
  }

  /** True while an explicit stop/unlink/delete shields the session from auto-restart. */
  isParked(userId: string): boolean {
    const at = this.parked.get(userId);
    if (at === undefined) return false;
    if (Date.now() - at > PARK_TTL_MS) {
      this.parked.delete(userId);
      return false;
    }
    return true;
  }

  /** Free RAM in idle chats across all sessions (amortized, cheap). */
  trimAll(): void {
    for (const s of this.sessions.values()) {
      try {
        s.trimMemory();
      } catch {
        /* best effort */
      }
    }
  }

  listSessions() {
    return [...this.sessions.values()].map((s) => s.getState());
  }

  /** Most recent customer chats across every session (for the dashboard home). */
  recentChats(limit = 20) {
    const out: ({ userId: string } & ReturnType<WhatsappSession["recentChats"]>[number])[] = [];
    for (const s of this.sessions.values()) {
      for (const c of s.recentChats(limit)) out.push({ userId: s.userId, ...c });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, Math.max(1, Math.min(limit, 50)));
  }
}
