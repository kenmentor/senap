"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, RefreshCw, Check, MessageCircle, Clock3, Zap, X, ChevronDown, AlertTriangle, BellRing, TrendingUp, QrCode, Package, Store as StoreIcon, Bot, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lowCount, statusOf, thumbFor, LOW_AT, type Item } from "@/lib/demo/catalog";
import AgentAccess from "@/components/dashboard/AgentAccess";

type RecentChat = { userId: string; jid: string; name: string; imgUrl?: string | null; text: string; fromMe: boolean; ts: number; messages: number };
type ScheduledJob = { id: string; userId: string; chat: string; kind: string; text: string; runAt: string };
type ModelAlert = { id: string; userId: string; text: string; status: string; runAt: string; createdAt: string };
type ToolUse = { name: string; count: number };
type StatCard = { label: string; value: string; delta: string };
type TrafficPoint = { day: string; messages: number };

function hueOf(s: string | null | undefined): number {
  let h = 11;
  for (const c of (s ?? "")) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h % 360;
}

function chatTimeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return `${Math.floor(s / 86400)}d`;
}

function dueIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "due now";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

function prettyTool(name: string): string {
  return (name || "unknown").replace(/_/g, " ").replace(/\s+/g, " ").trim() || "unknown";
}

/** 2 major home sections — one outer div, options are transparent black shade with good padding, lines inside. */
function HomeSection({
  id,
  icon: Icon,
  title,
  summary,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  badge?: string | number;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl px-4 pb-4 sm:px-5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <button
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex min-h-[64px] w-full items-center gap-3 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#00a884", color: "#04241d" }}>
          <Icon size={19} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight" style={{ color: "#fff" }}>{title}</span>
          <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>{summary}</span>
        </span>
        {badge !== undefined && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(0,168,132,0.12)", color: "#00d19f" }}>
            {badge}
          </span>
        )}
        <ChevronDown size={17} style={{ color: "#8a949b", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>
      {open && (
        <div className="flex flex-col gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
          {children}
        </div>
      )}
    </section>
  );
}

/** Line block inside a HomeSection — transparent with a light black shade for readability, good padding. */
function Block({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-5" style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12 }}>
      {children}
    </div>
  );
}

/** Download-the-app nudge — dashboard only (never on the public store).
 *  Shows only when installing is actually possible (real install prompt, or
 *  iOS with manual instructions), max 3 times, until installed or dismissed —
 *  never a permanent nag. */
function InstallApp() {
  const [ready, setReady] = useState(false);
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const MAX_SHOWS = 3;
    const noteShown = (): boolean => {
      try {
        const n = parseInt(window.localStorage.getItem("senap-install-shown") ?? "0", 10) || 0;
        if (n >= MAX_SHOWS) {
          window.localStorage.setItem("senap-install-dismissed", "1");
          return false;
        }
        window.localStorage.setItem("senap-install-shown", String(n + 1));
        return true;
      } catch {
        return true; // private mode — show this session, hide on reload
      }
    };
    try {
      if (window.localStorage.getItem("senap-install-dismissed")) return;
      if (window.localStorage.getItem("senap-installed")) return;
      if (window.matchMedia("(display-mode: standalone)").matches) {
        window.localStorage.setItem("senap-installed", "1");
        return;
      }
      // @ts-expect-error navigator.standalone is iOS-only
      if (window.navigator.standalone === true) {
        window.localStorage.setItem("senap-installed", "1");
        return;
      }
    } catch {
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);
    if (ios) {
      // No install event on iOS — manual Share instructions, capped.
      if (noteShown()) setReady(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      if (noteShown()) setReady(true);
    };
    const markInstalled = () => {
      try {
        window.localStorage.setItem("senap-installed", "1");
      } catch {
        /* private mode — hides until reload */
      }
      setReady(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (!ready) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem("senap-install-dismissed", "1");
    } catch {
      /* private mode — card just hides for this session */
    }
    setReady(false);
  };

  const install = async () => {
    if (!deferred) {
      setHelp(true);
      return;
    }
    setBusy(true);
    try {
      await ((deferred as unknown as { prompt: () => Promise<void> }).prompt());
      // Accepted installs fire `appinstalled` (which persists + hides);
      // this covers browsers that don't.
      try {
        window.localStorage.setItem("senap-installed", "1");
      } catch {
        /* ignore */
      }
      setReady(false);
    } catch {
      /* user cancelled — stay */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl px-4 py-4 sm:px-5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(0,168,132,0.35)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#00a884", color: "#04241d" }}>
          <Smartphone size={20} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight" style={{ color: "#fff" }}>Download the Senap app</span>
          <span className="block text-[12px]" style={{ color: "#8a949b" }}>Faster than the browser — one tap from your home screen</span>
        </span>
        <button onClick={dismiss} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10" style={{ color: "#8a949b" }}>
          <X size={14} />
        </button>
      </div>
      <div className="mt-3">
        <button
          onClick={install}
          disabled={busy}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-bold transition active:scale-[0.99] disabled:opacity-50"
          style={{ background: "#00a884", color: "#04241d" }}
        >
          <Smartphone size={18} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">{busy ? "Opening installer…" : "Download app"}</span>
        </button>
        {help && !deferred && (
          <p className="mt-2 px-1 text-center text-[12.5px] leading-relaxed" style={{ color: "#8a949b" }}>
            {isIos ? "Tap Share → Add to Home Screen to install Senap." : "Open your browser menu → Install Senap (or Add to Home screen)."}
          </p>
        )}
      </div>
    </section>
  );
}

/** One queued reminder/promo: colored card with a short user-facing title that
    expands to the full details. Long instructions stay stored — the card fits. */
function ScheduledRow({ job, onCancel }: { job: ScheduledJob; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const composed = job.kind === "agent";
  const accent = composed ? "#00a884" : "#5b9cf6";
  const due = dueIn(job.runAt);
  const chat = (job.chat || "").split("@")[0];
  const firstLine = (job.text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "(no text)";
  const title = firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
  const long = (job.text || "").trim().length > title.length;
  return (
    <li
      className="flex items-center gap-3 px-4 py-4"
      style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 14 }}
    >
      <span className="min-w-0 flex-1">
        <button
          onClick={() => long && setOpen((v) => !v)}
          aria-expanded={open}
          className="block w-full text-left"
          style={{ cursor: long ? "pointer" : "default" }}
        >
          <span className={`text-[13px] font-semibold leading-snug ${open ? "block whitespace-pre-wrap break-words" : "block truncate"}`} style={{ color: "#ffffff" }}>
            {open ? (job.text || "(no text)").trim() : title}
          </span>
        </button>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {chat ? (
            <span className="max-w-[140px] truncate text-[11px] font-semibold" style={{ color: "#8a949b" }}>
              {chat}
            </span>
          ) : null}
          {due ? (
            <span className="text-[11px] font-bold" style={{ color: accent }}>
              {due}
            </span>
          ) : null}
          <span className="text-[11px]" style={{ color: "#636c73" }}>
            {composed ? "AI composes" : "Send as-is"}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {long ? (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse details" : "Expand details"}
            aria-expanded={open}
            className="flex h-11 w-8 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15 sm:h-8"
            style={{ color: "#8a949b" }}
          >
            <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        ) : null}
        <button onClick={() => onCancel(job.id)} aria-label="Cancel task" title="Cancel" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15 sm:h-8 sm:w-8" style={{ color: "#8a949b" }}>
          <X size={14} />
        </button>
      </span>
    </li>
  );
}

function ChatAvatar({ jid, name, imgUrl }: { jid: string | null | undefined; name: string | null | undefined; imgUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  const hue = hueOf(jid ?? "");
  const safeName = name ?? "unknown";
  const initials = safeName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const showPhoto = !!imgUrl && imgUrl.startsWith("http") && !broken;
  return (
    <span
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold"
      style={{ background: `linear-gradient(135deg, hsl(${hue},32%,30%), hsl(${(hue + 50) % 360},36%,18%))`, color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}
    >
      {initials}
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl as string} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

const FALLBACK_STATS: StatCard[] = [
  { label: "Messages handled", value: "—", delta: "agent offline" },
  { label: "Active customers", value: "—", delta: "agent offline" },
  { label: "Lined up", value: "—", delta: "agent offline" },
];

const FALLBACK_TRAFFIC: TrafficPoint[] = Array.from({ length: 14 }, (_, i) => ({
  day: i === 13 ? "Today" : `-${13 - i}d`,
  messages: 0,
}));

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-[12px] font-semibold" style={{ background: "#1f2c34", border: "1px solid rgba(255,255,255,0.12)", color: "#e9edef" }}>
      {payload[0].value} messages · {label}
    </div>
  );
}

export default function DashboardHome() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbDown, setDbDown] = useState(false);
  const [chats, setChats] = useState<RecentChat[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledJob[]>([]);
  const [alerts, setAlerts] = useState<ModelAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [tools, setTools] = useState<ToolUse[]>([]);
  const [agentOnline, setAgentOnline] = useState(true);
  const [stats, setStats] = useState<StatCard[] | null>(null);
  const [traffic, setTraffic] = useState<TrafficPoint[] | null>(null);
  const [trafficTotal, setTrafficTotal] = useState<number | null>(null);
  const [cost, setCost] = useState<{ used: number; total: number; pct: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // Onboarding journey: null = unknown, 0 = first-timer (no lines linked yet).
  const [lineCount, setLineCount] = useState<number | null>(null);
  const [sections, setSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return { attention: true, growth: true };
    try {
      const raw = window.localStorage.getItem("dashboard-home-sections");
      if (raw) {
        const p = JSON.parse(raw) as Record<string, boolean>;
        return { attention: p.attention ?? true, growth: p.growth ?? true };
      }
    } catch {
      /* fall through */
    }
    return { attention: true, growth: true };
  });

  const toggleSection = (id: string) => {
    setSections((v) => {
      const next = { ...v, [id]: !v[id] };
      try {
        window.localStorage.setItem("dashboard-home-sections", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const loadActivity = async () => {
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const rawChats = Array.isArray(data.chats) ? data.chats : [];
      setChats(
        rawChats.map((c: { userId?: unknown; jid?: unknown; name?: unknown; imgUrl?: unknown; text?: unknown; fromMe?: unknown; ts?: unknown; messages?: unknown }) => ({
          userId: String(c?.userId ?? ""),
          jid: String(c?.jid ?? ""),
          name: String(c?.name ?? "unknown"),
          imgUrl: typeof c?.imgUrl === "string" ? c.imgUrl : null,
          text: String(c?.text ?? ""),
          fromMe: c?.fromMe === true,
          ts: Number(c?.ts ?? 0),
          messages: Number(c?.messages ?? 0),
        })),
      );
      const rawScheduled = Array.isArray(data.scheduled) ? data.scheduled : [];
      setScheduled(
        rawScheduled.map((j: { id?: unknown; userId?: unknown; chat?: unknown; kind?: unknown; text?: unknown; runAt?: unknown }) => ({
          id: String(j?.id ?? `job-${Math.random().toString(36).slice(2)}`),
          userId: String(j?.userId ?? ""),
          chat: String(j?.chat ?? ""),
          kind: String(j?.kind ?? "send"),
          text: String(j?.text ?? ""),
          runAt: String(j?.runAt ?? ""),
        })),
      );
      const rawTools = Array.isArray(data.tools) ? data.tools : [];
      setTools(
        rawTools.map((t: { name?: unknown; count?: unknown }) => ({
          name: String(t?.name ?? "unknown"),
          count: Number(t?.count ?? 0),
        })),
      );
      const rawAlerts = Array.isArray(data.alerts) ? data.alerts : [];
      setAlerts(
        rawAlerts.map((a: { id?: unknown; userId?: unknown; text?: unknown; status?: unknown; runAt?: unknown; createdAt?: unknown }) => ({
          id: String(a?.id ?? `alert-${Math.random().toString(36).slice(2)}`),
          userId: String(a?.userId ?? ""),
          text: String(a?.text ?? ""),
          status: String(a?.status ?? ""),
          runAt: String(a?.runAt ?? ""),
          createdAt: String(a?.createdAt ?? ""),
        })),
      );
      setAgentOnline(data.agentOnline !== false);
      if (Array.isArray(data.stats)) setStats(data.stats);
      if (Array.isArray(data.traffic)) setTraffic(data.traffic);
      if (typeof data.trafficTotal === "number") setTrafficTotal(data.trafficTotal);
      if (data.cost && typeof data.cost.used === "number") setCost(data.cost);
      setUpdatedAt(Date.now());
    } catch {
      /* activity is best-effort — products still render */
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadActivity()]);
    setRefreshing(false);
  };

  const cancelJob = async (id: string) => {
    try {
      const res = await fetch(`/api/activity/scheduled/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("cancel failed");
      setScheduled((v) => v.filter((j) => j.id !== id));
    } catch {
      /* leave it in the list */
    }
  };

  const load = async () => {
    setLoading(true);
    setDbDown(false);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("offline");
      setItems(await res.json());
    } catch {
      setDbDown(true);
    } finally {
      setLoading(false);
    }
    // First-timer check (best-effort — never blocks the page).
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const list = await res.json();
        setLineCount(Array.isArray(list) ? list.length : 0);
      }
    } catch {
      /* unknown — journey stays hidden */
    }
  };

  useEffect(() => {
    load();
    loadActivity();
    const t = window.setInterval(loadActivity, 30000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urgent = useMemo(
    () => items.filter((p) => p.quantity <= LOW_AT).sort((a, b) => a.quantity - b.quantity),
    [items]
  );

  const restock = async (id: string) => {
    const target = items.find((p) => p.id === id);
    if (!target) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: target.quantity + 10 })
      });
      if (!res.ok) throw new Error("restock failed");
      const updated: Item = await res.json();
      setItems((v) => v.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      setDbDown(true);
    }
  };

  const liveStats = stats ?? FALLBACK_STATS;
  const liveTraffic = traffic ?? FALLBACK_TRAFFIC;
  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));
  const attentionCount = visibleAlerts.length + scheduled.length + urgent.length;

  const rankedTools = useMemo(() => [...tools].sort((a, b) => b.count - a.count).slice(0, 5), [tools]);
  const toolTotal = useMemo(() => tools.reduce((n, t) => n + (t.count || 0), 0), [tools]);
  const toolMax = rankedTools.length ? Math.max(1, rankedTools[0].count) : 1;

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px]" style={{ color: "#636c73" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentOnline ? "#00a884" : "#e66a6a" }} />
          {updatedAt ? `Updated ${chatTimeAgo(updatedAt)}` : "Loading…"}
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition active:scale-95 disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 0 — DOWNLOAD THE APP (signed-in owners only, never on the store) */}
      <InstallApp />

      {/* 0 — FIRST-TIMER JOURNEY: account ✓ → link WhatsApp → setup */}
      {lineCount === 0 && (
        <section className="overflow-hidden rounded-3xl px-4 py-4 sm:px-5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(0,168,132,0.35)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
          <h2 className="px-1 text-[15px] font-bold" style={{ color: "#fff" }}>Get selling in 3 steps</h2>
          <ol className="mt-3 flex flex-col divide-y divide-white/10" style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <li className="flex items-center gap-3 px-4 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(0,168,132,0.16)", color: "#00d19f" }}>
                <Check size={17} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>1 · Account created</span>
                <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>You&apos;re signed in — step done</span>
              </span>
            </li>
            <li className="px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold" style={{ background: "#00a884", color: "#04241d" }}>2</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>Link your WhatsApp</span>
                  <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>Scan once — she replies from your number</span>
                </span>
              </div>
              <Link
                href="/dashboard/link"
                className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-bold transition active:scale-[0.99]"
                style={{ background: "#00a884", color: "#04241d" }}
              >
                <QrCode size={18} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Link your WhatsApp</span>
              </Link>
            </li>
            <li className="px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold" style={{ background: "rgba(255,255,255,0.08)", color: "#aebac1" }}>3</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>Set up your shop</span>
                  <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>Products, banner, agent — after linking</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { href: "/dashboard/products" as const, icon: Package, label: "Products" },
                  { href: "/dashboard/store" as const, icon: StoreIcon, label: "Store" },
                  { href: "/dashboard/agent" as const, icon: Bot, label: "Agent" },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[12px] font-semibold transition active:bg-white/10"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#e9edef" }}
                    >
                      <Icon size={17} strokeWidth={2} style={{ color: "#00d19f" }} />
                      {s.label}
                    </Link>
                  );
                })}
              </div>
              <Link href="/dashboard/store" className="mt-3 block text-center text-[12.5px] font-semibold" style={{ color: "#00d19f" }}>
                Just looking? Preview your store →
              </Link>
            </li>
          </ol>
        </section>
      )}

      {/* 0b — LINKED BUT EMPTY: finish setup nudge */}
      {lineCount !== null && lineCount > 0 && !loading && items.length === 0 && !dbDown && (
        <section className="rounded-3xl px-4 py-4 sm:px-5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
          <p className="px-1 text-[14px] font-bold" style={{ color: "#fff" }}>WhatsApp linked — finish setup</p>
          <p className="mt-1 px-1 text-[12.5px]" style={{ color: "#8a949b" }}>Add your first product and she can start selling.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { href: "/dashboard/products" as const, icon: Package, label: "Add product" },
              { href: "/dashboard/store" as const, icon: StoreIcon, label: "Store banner" },
              { href: "/dashboard/agent" as const, icon: Bot, label: "Configure agent" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.label}
                  href={s.href}
                  className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[12px] font-semibold transition active:scale-[0.98]"
                  style={{ background: "#00a884", color: "#04241d" }}
                >
                  <Icon size={17} strokeWidth={2.25} />
                  {s.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 1 — AGENT ACCESS (single header lives inside AgentAccess) */}
      <AgentAccess />

      {/* 2 — NEEDS YOUR ATTENTION: alerts + lined up + restocks */}
      <HomeSection
        id="attention"
        icon={BellRing}
        title="Needs attention"
        summary={`${visibleAlerts.length} alerts · ${scheduled.length} lined up · ${urgent.length} restocks`}
        badge={attentionCount > 0 ? attentionCount : undefined}
        open={sections.attention}
        onToggle={toggleSection}
      >
        {visibleAlerts.map((a) => (
          <div key={a.id} className="flex items-start gap-3 py-4" style={{ borderLeft: "3px solid #e66a6a", paddingLeft: 12 }}>
            <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: "#e66a6a" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold uppercase" style={{ color: "#e66a6a", letterSpacing: "0.06em" }}>
                Model outage{a.status === "done" ? " · owner notified" : " · notifying owner"}
              </p>
              <p className="mt-1 break-words text-[13px] leading-snug" style={{ color: "#e9edef" }}>{a.text}</p>
              {a.createdAt ? (
                <p className="mt-1 text-[11.5px]" style={{ color: "#8a949b" }}>{chatTimeAgo(new Date(a.createdAt).getTime())}</p>
              ) : null}
            </div>
            <button
              onClick={() => setDismissedAlerts((v) => new Set(v).add(a.id))}
              aria-label="Dismiss alert"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10"
              style={{ color: "#8a949b" }}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <Block>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
              <Clock3 size={16} style={{ color: "#00a884" }} /> Lined up for you
            </h2>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: scheduled.length ? "rgba(0,168,132,0.12)" : "rgba(255,255,255,0.06)", color: scheduled.length ? "#00d19f" : "#636c73" }}>
              {scheduled.length}
            </span>
          </div>
          {scheduled.length === 0 ? (
            <p className="mt-3 flex items-center justify-center gap-2 py-4 text-[12.5px]" style={{ color: "#8a949b" }}>
              <Clock3 size={15} /> Nothing lined up
            </p>
          ) : (
            <ul className="mt-3 flex max-h-[320px] flex-col divide-y divide-white/10 overflow-y-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {scheduled.map((j) => (
                <ScheduledRow key={j.id} job={j} onCancel={cancelJob} />
              ))}
            </ul>
          )}
        </Block>

        <Block>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Restocks</h2>
              {urgent.length > 0 && (
                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(230,106,106,0.14)", color: "#e66a6a" }}>
                  {urgent.length}
                </span>
              )}
            </div>
            <Link href="/dashboard/products" className="text-[12.5px] font-semibold" style={{ color: "#00a884" }}>
              All products →
            </Link>
          </div>

          {loading ? (
            <div className="mt-4 flex flex-col">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3.5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="h-11 w-11 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "55%" }} />
                    <div className="h-3 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "35%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : dbDown ? (
            <div className="mt-4 flex items-center justify-between gap-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#e66a6a" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#e66a6a" }} /> Offline
              </p>
              <button onClick={load} aria-label="Retry" title="Retry" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition active:scale-95" style={{ background: "#00a884", color: "#04241d" }}>
                <RefreshCw size={16} />
              </button>
            </div>
          ) : urgent.length === 0 ? (
              <p className="mt-3 flex items-center justify-center gap-2 py-4 text-center text-[13px] font-semibold" style={{ color: "#00a884" }}>
                <Check size={15} strokeWidth={3} /> All stocked up
              </p>
          ) : (
            <div className="mt-2 flex flex-col">
              {urgent.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image || thumbFor(p, 0)} alt="" draggable={false} className="h-11 w-11 shrink-0 rounded-xl object-cover" style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-[13.5px] font-medium" style={{ color: "#e9edef" }}>{p.name}</p>
                    <p className="mt-1 text-[11.5px] font-bold tabular-nums" style={lowCount}>
                      {p.quantity} left
                    </p>
                  </div>
                  <span className="hidden text-[11px] font-semibold sm:inline" style={{ color: statusOf(p).color }}>
                    {statusOf(p).label}
                  </span>
                  <button
                    onClick={() => restock(p.id)}
                    className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold transition active:scale-95"
                    style={{ background: "#00a884", color: "#04241d" }}
                  >
                    <Plus size={14} strokeWidth={2.5} /> Restock
                  </button>
                </div>
              ))}
            </div>
          )}
        </Block>
      </HomeSection>

      {/* 3 — CUSTOMERS & GROWTH: stats + chats + tools + traffic */}
      <HomeSection
        id="growth"
        icon={TrendingUp}
        title="Customers & growth"
        summary={`${chats.length} chats · ${toolTotal} tool calls · ${trafficTotal ?? "—"} msgs`}
        open={sections.growth}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-3 divide-x py-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {liveStats.map((s) => (
            <div key={s.label} className="px-3 first:pl-0 last:pr-0">
              <p className="truncate text-[10px] font-semibold uppercase sm:text-[11px]" style={{ color: "#636c73", letterSpacing: "0.08em" }}>{s.label}</p>
              <p className="font-display mt-1 text-[22px] font-bold leading-none sm:mt-1.5 sm:text-[32px]" style={{ color: "#e9edef" }}>{s.value}</p>
              <p className="mt-1.5 truncate text-[11px] font-medium sm:mt-2 sm:text-[12px]" style={{ color: "#00a884" }}>{s.delta}</p>
            </div>
          ))}
        </div>

        <Block>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
              <MessageCircle size={16} style={{ color: "#00a884" }} /> Recent chats
            </h2>
            <Link href="/dashboard/agent" className="text-[12.5px] font-semibold" style={{ color: "#00a884" }}>
              Manage →
            </Link>
          </div>
          {!agentOnline ? (
            <p className="flex items-center justify-center gap-2 py-4 text-center text-[13px] font-semibold" style={{ color: "#e66a6a" }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#e66a6a" }} /> Agent offline
            </p>
          ) : chats.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-4 text-center text-[13px]" style={{ color: "#636c73" }}>
              <MessageCircle size={15} /> No chats yet
            </p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-white/10" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {chats.slice(0, 6).map((c) => (
                <li key={`${c.userId}:${c.jid}`}>
                    <Link href={`/dashboard/agent?account=${encodeURIComponent(c.userId)}`} className="flex min-h-[60px] items-center gap-3 overflow-hidden py-2.5 transition hover:bg-white/[0.04] active:bg-white/[0.06]">
                    <ChatAvatar jid={c.jid} name={c.name} imgUrl={c.imgUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>{c.name}</span>
                        <span className="shrink-0 text-[11px]" style={{ color: "#636c73" }}>{chatTimeAgo(c.ts)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block break-words text-[12.5px] leading-snug" style={{ color: "#8a949b" }}>
                        {c.fromMe ? "You: " : ""}{c.text || "…"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#e9edef" }}>
              <Zap size={14} style={{ color: "#00a884" }} /> Tool activity
            </h3>
            {toolTotal > 0 && (
              <p className="text-[11.5px] font-semibold" style={{ color: "#00a884" }}>
                {toolTotal.toLocaleString()} {toolTotal === 1 ? "call" : "calls"} this week
              </p>
            )}
          </div>
          {rankedTools.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "#636c73" }}><Zap size={13} /> No activity yet</p>
          ) : (
            <ul className="mt-2.5 flex flex-col divide-y divide-white/10" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {rankedTools.map((t, i) => (
                <li key={`${t.name}-${i}`} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium capitalize" style={{ color: "#aebac1" }}>
                      {prettyTool(t.name)}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-bold tabular-nums" style={{ color: "#e9edef" }}>
                      {t.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round((t.count / toolMax) * 100))}%`, background: "#00a884" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Traffic</h2>
            <p className="text-[12.5px] font-semibold tabular-nums" style={{ color: "#00a884" }}>
              {trafficTotal !== null ? trafficTotal.toLocaleString() : "—"}
            </p>
          </div>

          <div className="mt-4 h-[200px] w-full sm:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={liveTraffic} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00a884" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00a884" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#636c73", fontSize: 11 }} axisLine={false} tickLine={false} interval={1} dy={6} />
                <YAxis tick={{ fill: "#636c73", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: "rgba(0,168,132,0.4)" }} />
                <Area type="monotone" dataKey="messages" stroke="#00a884" strokeWidth={2.25} fill="url(#trafficFill)" dot={false} activeDot={{ r: 4, fill: "#00a884", stroke: "#04241d", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold" style={{ color: "#e9edef" }}>Cost</p>
              <p className="text-[12.5px] tabular-nums" style={{ color: "#8a949b" }}>
                {cost ? `${cost.used} / ${cost.total} · ${cost.pct}%` : "—"}
              </p>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full" style={{ width: `${cost?.pct ?? 0}%`, background: "#00a884" }} />
            </div>
          </div>
        </Block>
      </HomeSection>
    </div>
  );
}
