"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

/** Root boundary (landing / auth): never a blank screen, always a way back. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Route crashed:", error);
  }, [error]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-8 text-center"
      style={{ background: "#000000", color: "#e9edef" }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "rgba(232,180,91,0.12)", color: "#e8b45b" }}
      >
        <TriangleAlert size={26} strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-[18px] font-semibold">Something went wrong</h1>
      <p className="mt-1.5 max-w-[320px] text-[13.5px]" style={{ color: "#8a949b" }}>
        The page failed to load. Your data is safe — try again or head back.
      </p>
      <div className="mt-5 flex gap-2.5">
        <button
          onClick={reset}
          className="flex min-h-[48px] items-center gap-2 rounded-xl px-6 text-[14px] font-semibold transition active:scale-[0.98]"
          style={{ background: "#00a884", color: "#04241d" }}
        >
          <RefreshCw size={16} strokeWidth={2.5} /> Try again
        </button>
        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl px-6 text-[14px] font-medium"
          style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#aebac1" }}
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
