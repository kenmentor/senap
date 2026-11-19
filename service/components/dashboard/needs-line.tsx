"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QrCode } from "lucide-react";

/**
 * First-run gate for every dashboard tab except Link/Home.
 *
 * A new user with zero linked lines sees ONLY the next step — never the
 * tab's full UI with its wall of empty states. Copy and tokens are reused
 * from the Home journey card; nothing new is introduced.
 *
 * Fail-open: while unknown (or when /api/accounts errors) the real UI
 * renders, so a DB blip can never lock anyone out.
 */
export function useHasLine(): boolean | null {
  const [hasLine, setHasLine] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) {
          if (live) setHasLine(true);
          return;
        }
        const list = await res.json().catch(() => null);
        if (live) setHasLine(Array.isArray(list) ? list.length > 0 : true);
      } catch {
        if (live) setHasLine(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return hasLine;
}

export function NeedsLineGate() {
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <section className="rounded-3xl px-5 py-8 text-center sm:px-6" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(0,168,132,0.35)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl" style={{ background: "#00a884", color: "#04241d" }}>
          <QrCode size={28} strokeWidth={2} />
        </span>
        <h1 className="mt-4 text-[17px] font-bold" style={{ color: "#fff" }}>Link your WhatsApp</h1>
        <p className="mt-1 text-[13px]" style={{ color: "#8a949b" }}>Scan once — she replies from your number.</p>
        <Link
          href="/dashboard/link"
          className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-bold transition active:scale-[0.99]"
          style={{ background: "#00a884", color: "#04241d" }}
        >
          <QrCode size={18} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Link your WhatsApp</span>
        </Link>
      </section>
    </div>
  );
}
