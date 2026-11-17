"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  QrCode,
  UserRound,
  Users,
  Package,
  Blocks,
  Settings,
  LogOut,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/link", label: "Link", icon: QrCode, exact: false },
  { href: "/dashboard/agent", label: "Agent", icon: UserRound, exact: false },
  { href: "/dashboard/groups", label: "Groups", icon: Users, exact: false },
  { href: "/dashboard/products", label: "Products", icon: Package, exact: false },
];

const moreItems = [
  { href: "/dashboard/plugins", label: "Plugins", icon: Blocks, desc: "Status, promos & tools" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, desc: "Business, hours & access" },
];

/**
 * Native mobile chrome: sticky top bar + iOS-style bottom tab bar.
 * Desktop (`md:` and up) keeps the sidebar — this renders nothing there.
 */
export default function MobileChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const me = await res.json();
        if (me.name) setUserName(me.name);
      } catch {
        /* offline — sheet still works */
      }
    })();
  }, []);

  // Lock body scroll while the sheet is open (native bottom-sheet feel).
  useEffect(() => {
    document.body.style.overflow = moreOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    router.push("/signin");
    router.refresh();
  };

  return (
    <>
      {/* Top bar — brand + overflow. Sticky, blurs over the chat wallpaper. */}
      <header
        className="sticky top-0 z-30 md:hidden"
        style={{
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-bold"
              style={{ background: "#00a884", color: "#04241d" }}
            >
              S
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight" style={{ color: "#e9edef" }}>
              Senap
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More options"
            className="flex h-11 w-11 items-center justify-center rounded-full transition active:bg-white/10"
            style={{ color: "#aebac1" }}
          >
            <MoreHorizontal size={22} />
          </button>
        </div>
      </header>

      {/* Bottom tab bar — thumb-reachable, safe-area aware. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 md:hidden"
        style={{
          background: "rgba(10,14,17,0.88)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="grid grid-cols-5 px-1 pt-1.5">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.href : pathname?.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className="relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl transition active:scale-95"
              >
                <span
                  aria-hidden
                  className="absolute top-0 h-[3px] w-8 rounded-full transition-all"
                  style={{ background: active ? "#00a884" : "transparent" }}
                />
                <Icon size={22} strokeWidth={active ? 2.25 : 1.75} style={{ color: active ? "#00d19f" : "#8a949b" }} />
                <span
                  className={cn("text-[10.5px] leading-none", active ? "font-bold" : "font-medium")}
                  style={{ color: active ? "#e9edef" : "#8a949b" }}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* More sheet — Plugins, Settings, account, sign out. */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More options">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl px-5 pb-6 pt-2"
            style={{
              background: "#111b21",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold" style={{ color: "#8a949b" }}>
                {userName ? `Hi, ${userName}` : "More"}
              </p>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-white/10"
                style={{ color: "#8a949b" }}
              >
                <X size={19} />
              </button>
            </div>
            {moreItems.map((m) => {
              const Icon = m.icon;
              const active = pathname?.startsWith(m.href);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-[60px] items-center gap-3.5 rounded-2xl px-2 py-2.5 transition active:bg-white/5"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: active ? "rgba(0,168,132,0.14)" : "rgba(255,255,255,0.06)",
                      color: active ? "#00d19f" : "#aebac1",
                    }}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold" style={{ color: "#e9edef" }}>
                      {m.label}
                    </span>
                    <span className="block truncate text-[12.5px]" style={{ color: "#636c73" }}>
                      {m.desc}
                    </span>
                  </span>
                </Link>
              );
            })}
            <div className="my-2 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            <button
              onClick={signOut}
              className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left transition active:bg-white/5"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a" }}
              >
                <LogOut size={19} strokeWidth={1.75} />
              </span>
              <span className="text-[15px] font-semibold" style={{ color: "#e66a6a" }}>
                Sign out
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
