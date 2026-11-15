export type HistoryRole = "system" | "user" | "assistant";

export interface HistoryEntry {
  role: HistoryRole;
  content: string;
}

const MAX_ENTRIES = 30;

/** Short per-customer conversation memory (in-memory; restarts forget). */
export default class ConversationHistory {
  private entries: HistoryEntry[] = [];

  append(role: HistoryRole, content: string): void {
    this.entries.push({ role, content });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
  }

  all(): HistoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
