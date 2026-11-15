"use client";

export default function StoryProgress({ progress }: { progress: number }) {
  return (
    <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.round(progress * 100)}%`, background: "var(--accent)", transition: "width 120ms linear" }}
      />
    </div>
  );
}
