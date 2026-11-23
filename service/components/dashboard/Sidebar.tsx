"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, QrCode, UserRound, Users, Package, Store, Blocks, Settings, PanelLeftClose, PanelLeftOpen, LogOut, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/link", label: "Link", icon: QrCode, exact: false },
  { href: "/dashboard/agent", label: "Agent", icon: UserRound, exact: false },
  { href: "/dashboard/groups", label: "Groups", icon: Users, exact: false },
  { href: "/dashboard/products", label: "Products", icon: Package, exact: false },
  { href: "/dashboard/store", label: "Store", icon: Store, exact: false },
  { href: "/dashboard/plugins", label: "Plugins", icon: Blocks, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
  { href: "/dashboard/admin", label: "Platform", icon: BarChart3, exact: false }
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState("Business owner");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const me = await res.json();
        if (me.name) setUserName(me.name);
      } catch {
        /* keep default */
      }
    })();
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    // Drop the Firebase Google session too — otherwise the next visit to
    // /signin silently re-authenticates behind the user's back.
    try {
      const { firebaseSignOut } = await import("@/lib/firebase-client");
      await firebaseSignOut();
    } catch {
      /* best effort */
    }
    router.push("/signin");
    router.refresh();
  };

  const userInitials = userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "BO";

  return (
    <aside
      className={cn("sticky top-0 z-30 hidden h-screen shrink-0 flex-col transition-all duration-200 md:flex", collapsed ? "w-[68px]" : "w-[224px]")}
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(14px)",
        borderRight: "1px solid rgba(255,255,255,0.07)"
      }}
    >
      {/* Top — single toggle, always visible */}
      <div className={cn("flex h-16 items-center gap-2", collapsed ? "flex-col justify-center gap-1 px-0 py-3" : "justify-between px-4")}>
        <span className="font-display text-[15px] font-semibold tracking-tight" style={{ color: "#e9edef" }}>
          {collapsed ? "S" : "Senap"}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition hover:bg-white/10"
          style={{ color: "#8a949b" }}
        >
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2.5">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname?.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              title={collapsed ? it.label : undefined}
              className={cn("flex h-10 items-center gap-3 rounded-lg transition", collapsed ? "justify-center px-0" : "px-3")}
              style={{
                background: active ? "rgba(255,255,255,0.07)" : "transparent",
                color: active ? "#ffffff" : "#8a949b"
              }}
            >
              <Icon size={17} strokeWidth={active ? 2 : 1.75} />
              {!collapsed && <span className="text-[13.5px] font-medium tracking-tight">{it.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="mt-auto px-2.5 pb-4">
        <div className="mb-2.5 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className={cn("flex items-center gap-2.5 rounded-lg py-1", collapsed ? "justify-center" : "px-1.5")}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold" style={{ background: "rgba(255,255,255,0.09)", color: "#cfd6db" }}>
            {userInitials}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium" style={{ color: "#cfd6db" }}>{userName}</span>
            </span>
          )}
          {!collapsed && (
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition hover:bg-white/10"
              style={{ color: "#636c73" }}
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
