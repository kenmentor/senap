"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, RefreshCw, Check, MessageCircle, Clock3, Zap, X, Sparkles, Send, ChevronDown, AlertTriangle } from "lucide-react";
import { lowCount, statusOf, thumbFor, LOW_AT, type Item } from "@/lib/demo/catalog";

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

/** One queued reminder/promo: colored card with a short user-facing title that
    expands to the full details. Long instructions stay stored — the card fits. */
function ScheduledRow({ job, onCancel }: { job: ScheduledJob; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const composed = job.kind === "agent";
  const accent = composed ? "#00a884" : "#5b9cf6";
  const ink = composed ? "#04241d" : "#0b1c33";
  const due = dueIn(job.runAt);
  const chat = (job.chat || "").split("@")[0];
  const firstLine = (job.text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "(no text)";
  const title = firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
  const long = (job.text || "").trim().length > title.length;
  return (
    <li
      className="flex items-center gap-3 rounded-2xl p-3 transition hover:brightness-125"
      style={{
        background: composed ? "rgba(0,168,132,0.10)" : "rgba(91,156,246,0.10)",
        border: `1px solid ${composed ? "rgba(0,168,132,0.38)" : "rgba(91,156,246,0.38)"}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: accent, color: ink }}
        title={composed ? "She composes it fresh" : "Sends as-is"}
      >
        {composed ? <Sparkles size={17} strokeWidth={2.25} /> : <Send size={16} strokeWidth={2.25} />}
      </span>
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
            <span className="max-w-[140px] truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "rgba(255,255,255,0.10)", color: "#cfd6db" }}>
              {chat}
            </span>
          ) : null}
          {due ? (
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: accent, color: ink }}>
              {due}
            </span>
          ) : null}
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

  const loadActivity = async () => {
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      // Coerce: the agent/DB can hand back rows with null fields (unknown
      // contact, legacy job doc) — one null must never crash the whole page.
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
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
      {/* Model-outage alerts — the agent stayed silent to customers and
          filed these for you instead. Dismiss is local; the row stays in
          "Lined up" until its owner DM delivers. */}
      {alerts.filter((a) => !dismissedAlerts.has(a.id)).map((a) => (
        <div key={a.id} className="mt-3 flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(230,106,106,0.08)", border: "1px solid rgba(230,106,106,0.35)" }}>
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
      {/* 3 stats — live from /api/activity, fallback while offline.
          Compact 3-across row on phones (native dashboard feel), roomy cards on desktop. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
        {liveStats.map((s) => (
          <div key={s.label} className="rounded-2xl p-3 sm:p-5" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
            <p className="truncate text-[10px] font-semibold uppercase sm:text-[11px]" style={{ color: "#636c73", letterSpacing: "0.08em" }}>{s.label}</p>
            <p className="font-display mt-1 text-[22px] font-bold leading-none sm:mt-1.5 sm:text-[32px]" style={{ color: "#e9edef" }}>{s.value}</p>
            <p className="mt-1.5 truncate text-[11px] font-medium sm:mt-2 sm:text-[12px]" style={{ color: "#00a884" }}>{s.delta}</p>
          </div>
        ))}
      </div>

      {/* Recent chats + operator tasks */}
      <div className="mt-2.5 grid gap-2.5 sm:mt-3.5 sm:gap-3.5 lg:grid-cols-2">
        {/* Recent chats — WhatsApp style: avatar, name, last message */}
        <div className="rounded-2xl p-4 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
              <MessageCircle size={16} style={{ color: "#00a884" }} /> Recent chats
            </h2>
            <Link href="/dashboard/agent" className="text-[12.5px] font-semibold" style={{ color: "#00a884" }}>
              Manage →
            </Link>
          </div>
          {!agentOnline ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-xl p-4 text-center text-[13px] font-semibold" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#e66a6a" }} /> Agent offline
            </p>
          ) : chats.length === 0 ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-xl p-4 text-center text-[13px]" style={{ background: "rgba(255,255,255,0.03)", color: "#636c73", border: "1px dashed rgba(255,255,255,0.12)" }}>
              <MessageCircle size={15} /> No chats yet
            </p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {chats.slice(0, 6).map((c) => (
                <li key={`${c.userId}:${c.jid}`}>
                    <Link href={`/dashboard/agent?account=${encodeURIComponent(c.userId)}`} className="flex min-h-[60px] items-center gap-3 overflow-hidden rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04] active:bg-white/[0.06]">
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
        </div>

        {/* Scheduled for the operator — fulfillments, follow-ups, promos */}
        <div className="rounded-2xl p-4 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
              <Clock3 size={16} style={{ color: "#00a884" }} /> Lined up for you
            </h2>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: scheduled.length ? "rgba(0,168,132,0.12)" : "rgba(255,255,255,0.06)", color: scheduled.length ? "#00d19f" : "#636c73" }}>
              {scheduled.length}
            </span>
          </div>
          {scheduled.length === 0 ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl p-4 text-[12.5px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", color: "#8a949b" }}>
              <Clock3 size={15} /> Nothing lined up
            </div>
          ) : (
            <ul className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto">
              {scheduled.map((j) => (
                <ScheduledRow key={j.id} job={j} onCancel={cancelJob} />
              ))}
            </ul>
          )}

          {/* Tool activity — what she's actually been doing */}
          {(() => {
            const ranked = [...tools].sort((a, b) => b.count - a.count).slice(0, 5);
            const total = tools.reduce((n, t) => n + (t.count || 0), 0);
            const max = ranked.length ? Math.max(1, ranked[0].count) : 1;
            return (
              <>
                <div className="mt-5 flex items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#e9edef" }}>
                    <Zap size={14} style={{ color: "#00a884" }} /> Tool activity
                  </h3>
                  {total > 0 && (
                    <p className="text-[11.5px] font-semibold" style={{ color: "#00a884" }}>
                      {total.toLocaleString()} {total === 1 ? "call" : "calls"} this week
                    </p>
                  )}
                </div>
                {ranked.length === 0 ? (
                  <p className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "#636c73" }}><Zap size={13} /> No activity yet</p>
                ) : (
                  <ul className="mt-2.5 flex flex-col gap-2">
                    {ranked.map((t, i) => (
                      <li key={`${t.name}-${i}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium capitalize" style={{ color: "#aebac1" }}>
                            {prettyTool(t.name)}
                          </span>
                          <span className="shrink-0 text-[11.5px] font-bold tabular-nums" style={{ color: "#e9edef" }}>
                            {t.count.toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round((t.count / max) * 100))}%`, background: "#00a884" }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Traffic graph + cost consumed */}
      <div className="mt-2.5 rounded-2xl p-4 sm:mt-3.5 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
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
      </div>

      {/* Urgent restocks */}
      <div className="mt-2.5 rounded-2xl p-4 sm:mt-3.5 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
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
          <div className="mt-4 flex flex-col gap-2.5">
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
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl p-4" style={{ border: "1px dashed rgba(230,106,106,0.4)" }}>
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#e66a6a" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#e66a6a" }} /> Offline
            </p>
            <button onClick={load} aria-label="Retry" title="Retry" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition active:scale-95" style={{ background: "#00a884", color: "#04241d" }}>
              <RefreshCw size={16} />
            </button>
          </div>
        ) : urgent.length === 0 ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-xl p-4 text-center text-[13px] font-semibold" style={{ background: "rgba(0,168,132,0.08)", color: "#00a884", border: "1px solid rgba(0,168,132,0.25)" }}>
              <Check size={15} strokeWidth={3} /> All stocked up
            </p>
        ) : (
          <div className="mt-4 flex flex-col">
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
                <span className="hidden rounded-full px-2.5 py-1 text-[10.5px] font-semibold sm:inline" style={{ background: statusOf(p).bg, color: statusOf(p).color }}>
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
      </div>
    </div>
  );
}
