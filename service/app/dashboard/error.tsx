"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Dashboard segment boundary: the dashboard layout (top bar + bottom tabs)
 * stays mounted — only the failing page is replaced by this retry card.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Dashboard segment crashed:", error);
  }, [error]);

  return (
    <div
      className="mx-auto flex w-full max-w-[480px] flex-col items-center rounded-2xl p-8 text-center"
      style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.025)" }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "rgba(232,180,91,0.12)", color: "#e8b45b" }}
      >
        <TriangleAlert size={26} strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "#e9edef" }}>
        This screen hit a snag
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "#8a949b" }}>
        Your tabs above still work — this page just failed to render. Try again, or switch tabs and come back.
      </p>
      <button
        onClick={reset}
        className="mt-5 flex min-h-[48px] items-center gap-2 rounded-xl px-6 text-[14px] font-semibold transition active:scale-[0.98]"
        style={{ background: "#00a884", color: "#04241d" }}
      >
        <RefreshCw size={16} strokeWidth={2.5} /> Try again
      </button>
    </div>
  );
}
