"use client";

export type Reaction = { emoji: string; count?: number };

export function ReactionsDisplay({ reactions }: { reactions: Reaction[] }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{ background: "var(--wa-panel-bg)", border: "1px solid var(--wa-border)" }}
    >
      {reactions.map((r, i) => (
        <span key={i}>
          {r.emoji}
          {r.count && r.count > 1 ? ` ${r.count}` : ""}
        </span>
      ))}
    </span>
  );
}
