"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Clock3, MessageCircle, Store, Power, User, Users, Smartphone, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type Control = {
  paused: boolean;
  readMessages: boolean;
  replyDM: boolean;
  replyGroups: boolean;
  statusImport: boolean;
  catalogMirror: boolean;
};

const DEFAULT_CONTROL: Control = {
  paused: false,
  readMessages: true,
  replyDM: true,
  replyGroups: true,
  statusImport: true,
  catalogMirror: true,
};

function coerceControl(raw: unknown): Control {
  const r = (raw ?? {}) as Partial<Record<keyof Control, unknown>>;
  const b = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    paused: b(r.paused, false),
    readMessages: b(r.readMessages, true),
    replyDM: b(r.replyDM, true),
    replyGroups: b(r.replyGroups, true),
    statusImport: b(r.statusImport, true),
    catalogMirror: b(r.catalogMirror, true),
  };
}

function Toggle({ on, onFlip, disabled, label }: { on: boolean; onFlip: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      onClick={onFlip}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="flex h-7 w-[46px] shrink-0 items-center rounded-full p-1 transition disabled:opacity-40"
      style={{ background: on ? "#00a884" : "rgba(255,255,255,0.14)", justifyContent: on ? "flex-end" : "flex-start" }}
    >
      <span className="h-5 w-5 rounded-full" style={{ background: on ? "#04241d" : "#8a949b" }} />
    </button>
  );
}

function Row({
  icon: Icon,
  title,
  sub,
  on,
  onFlip,
  disabled,
  indented,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  on: boolean;
  onFlip: () => void;
  disabled?: boolean;
  indented?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-4"
      style={indented ? { borderLeft: "2px solid rgba(0,168,132,0.5)", paddingLeft: 14 } : undefined}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: on ? "rgba(0,168,132,0.14)" : "rgba(255,255,255,0.05)", color: on ? "#00d19f" : "#636c73" }}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold leading-snug" style={{ color: "#e9edef" }}>{title}</span>
        <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>{sub}</span>
      </span>
      <Toggle on={on} onFlip={onFlip} disabled={disabled} label={title} />
    </div>
  );
}

const LABEL = { color: "#8a949b", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const };

type SectionId = "schedule" | "chats" | "store";

function Section({
  id,
  icon: Icon,
  title,
  summary,
  open,
  onToggle,
  children,
  last,
}: {
  id: SectionId;
  icon: LucideIcon;
  title: string;
  summary: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div style={last ? undefined : { borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <button
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex min-h-[64px] w-full items-center gap-3 px-2 py-4 text-left transition hover:bg-white/[0.03] active:bg-white/[0.05]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(0,168,132,0.14)", color: "#00d19f" }}>
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold leading-tight" style={{ color: "#fff" }}>{title}</span>
          <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>{summary}</span>
        </span>
        <ChevronDown
          size={16}
          style={{ color: "#8a949b", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
        />
      </button>
      {open && (
        <div
          className="mb-3 flex flex-col divide-y divide-white/10"
          style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function AgentAccess() {
  const [lines, setLines] = useState<{ id: string; number: string; engineId?: string }[]>([]);
  const [line, setLine] = useState("");
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [days, setDays] = useState<string[]>([...DAYS.slice(0, 5)]);
  const [open, setOpen] = useState("08:00");
  const [close, setClose] = useState("21:00");
  const [control, setControl] = useState<Control>(DEFAULT_CONTROL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 3 major sections — click to expand. Persisted so the dashboard stays tidy.
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>(() => {
    if (typeof window === "undefined") return { schedule: true, chats: false, store: false };
    try {
      const raw = window.localStorage.getItem("agent-access-expanded");
      if (raw) {
        const p = JSON.parse(raw) as Partial<Record<SectionId, boolean>>;
        return { schedule: p.schedule ?? true, chats: p.chats ?? false, store: p.store ?? false };
      }
    } catch {
      /* fall through */
    }
    return { schedule: true, chats: false, store: false };
  });

  const toggleSection = (id: SectionId) => {
    setExpanded((v) => {
      const next = { ...v, [id]: !v[id] };
      try {
        window.localStorage.setItem("agent-access-expanded", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) return;
        const list: { id: string; number: string; engineId?: string }[] = await res.json();
        setLines(list);
        const first = list[0];
        if (first) setLine(first.engineId ?? first.number);
      } catch {
        /* picker stays hidden */
      }
    })();
  }, []);

  const load = useCallback(async (lineId: string) => {
    if (!lineId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent?userId=${encodeURIComponent(lineId)}`);
      if (!res.ok) throw new Error("offline");
      const c = await res.json();
      if (Array.isArray(c.days)) setDays(c.days.filter((d: unknown) => typeof d === "string"));
      if (typeof c.open === "string" && c.open) setOpen(c.open);
      if (typeof c.close === "string" && c.close) setClose(c.close);
      setControl(coerceControl(c.control));
    } catch {
      setError("Couldn't load this line — check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(line);
  }, [line, load]);

  // Real WhatsApp avatars for my lines (best-effort, initials fallback).
  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        lines.map(async (a) => {
          const id = a.engineId ?? a.number;
          try {
            const res = await fetch(`/api/line-avatar?line=${encodeURIComponent(id)}`);
            if (!res.ok) return [id, null] as const;
            const data = await res.json();
            const url = typeof data?.url === "string" && data.url.startsWith("http") ? data.url : null;
            return [id, url] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      if (!cancelled) {
        setAvatars(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lines]);

  const save = async (key: string, patch: Record<string, unknown>, controlPatch?: Partial<Control>) => {
    if (!line || saving) return;
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: line, ...patch }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setError("Couldn't save — check your connection. It stays off until saved.");
      if (controlPatch) setControl((v) => ({ ...v, ...controlPatch }));
      load(line);
    } finally {
      setSaving(null);
    }
  };

  const flipDay = (d: string) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    setDays(next);
    void save(`day-${d}`, { days: next });
  };

  const flipControl = (k: keyof Control) => {
    const prev = control[k];
    setControl((v) => ({ ...v, [k]: !v[k] }));
    void save(`ctl-${k}`, { control: { [k]: !prev } }, { [k]: prev } as Partial<Control>);
  };

  const onDuty = !control.paused;
  const master = control.readMessages && onDuty;

  const scheduleSummary = !onDuty
    ? "Paused — she stays silent"
    : days.length === 7
      ? `Every day · ${open}–${close}`
      : days.length === 0
        ? `No days · ${open}–${close}`
        : `${days.map((d) => d.slice(0, 3)).join(", ")} · ${open}–${close}`;

  const chatsSummary = !master
    ? "Silent to customers"
    : `DM ${control.replyDM ? "on" : "off"} · Groups ${control.replyGroups ? "on" : "off"}`;

  const storeOn = (control.statusImport ? 1 : 0) + (control.catalogMirror ? 1 : 0);
  const storeSummary = storeOn === 2 ? "Status + catalog on" : storeOn === 0 ? "Both off" : storeOn === 1 && control.statusImport ? "Status on · catalog off" : "Catalog on · status off";

  return (
    <section className="rounded-3xl px-4 py-4 sm:px-5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <header className="flex items-center gap-3 px-1 py-1">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl" style={{ background: "#00a884", color: "#04241d" }}>
          {avatars[line] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatars[line] as string} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <Bot size={20} strokeWidth={2.25} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold leading-tight" style={{ color: "#fff" }}>Agent access</span>
          <span className="block text-[12px]" style={{ color: "#8a949b" }}>When she works · what she answers · store</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: master ? "rgba(0,168,132,0.14)" : "rgba(255,255,255,0.06)", color: master ? "#00d19f" : "#8a949b" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: master ? "#00a884" : "#636c73" }} />
          {master ? "On duty" : "Paused"}
        </span>
      </header>

      {lines.length > 1 && (
        <div className="mt-3 flex items-center gap-3 px-1">
          <div className="flex items-center" style={{ gap: 0 }}>
            {lines.slice(0, 2).map((a, idx) => {
              const id = a.engineId ?? a.number;
              const active = id === line;
              const initials = (a.number || "?").replace(/\D/g, "").slice(-2) || "•";
              const img = avatars[id];
              return (
                <button
                  key={a.id}
                  onClick={() => setLine(id)}
                  disabled={!!saving}
                  title={a.number}
                  aria-label={`Switch to ${a.number}`}
                  className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold transition disabled:opacity-50"
                  style={{
                    background: img ? "transparent" : active ? "#00a884" : "rgba(255,255,255,0.08)",
                    color: active ? "#04241d" : "#cfd6db",
                    border: active ? "2px solid #00a884" : "2px solid rgba(255,255,255,0.15)",
                    marginLeft: idx === 0 ? 0 : -10,
                    zIndex: active ? 2 : 1,
                  }}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </button>
              );
            })}
            {lines.length > 2 && (
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: "rgba(255,255,255,0.06)", color: "#8a949b", border: "2px solid rgba(255,255,255,0.12)", marginLeft: -10 }}
              >
                +{lines.length - 2}
              </span>
            )}
          </div>
          <span className="truncate text-[12px]" style={{ color: "#8a949b" }}>
            {lines.find((l) => (l.engineId ?? l.number) === line)?.number ?? ""}
          </span>
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-col">
            {/* 1 — WHEN SHE WORKS: duty + days + time */}
            <Section id="schedule" icon={Clock3} title="When she works" summary={scheduleSummary} open={expanded.schedule} onToggle={toggleSection}>
              <Row icon={Power} title={onDuty ? "On duty" : "Paused"} sub={onDuty ? "She follows schedule below" : "Total silence — your messages still work"} on={onDuty} onFlip={() => flipControl("paused")} disabled={!!saving} />
              <div className="px-4 py-4">
                <p style={LABEL}>Active days</p>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {DAYS.map((d) => {
                    const isOn = days.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => flipDay(d)}
                        disabled={!!saving}
                        aria-pressed={isOn}
                        title={d}
                        className="h-10 rounded-xl text-[12px] font-bold transition disabled:opacity-50"
                        style={isOn ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
                      >
                        {d.slice(0, 1)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-4">
                <p className="flex items-center gap-1.5" style={LABEL}>
                  <Clock3 size={12} /> Active time
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <input
                    type="time"
                    value={open}
                    disabled={!!saving}
                    onChange={(e) => {
                      setOpen(e.target.value);
                      void save("open", { open: e.target.value });
                    }}
                    aria-label="Active from"
                    className="h-11 min-w-0 flex-1 rounded-xl px-3 text-center text-[14px] font-semibold outline-none disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#e9edef", colorScheme: "dark" }}
                  />
                  <span style={{ color: "#636c73" }}>→</span>
                  <input
                    type="time"
                    value={close}
                    disabled={!!saving}
                    onChange={(e) => {
                      setClose(e.target.value);
                      void save("close", { close: e.target.value });
                    }}
                    aria-label="Active until"
                    className="h-11 min-w-0 flex-1 rounded-xl px-3 text-center text-[14px] font-semibold outline-none disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#e9edef", colorScheme: "dark" }}
                  />
                </div>
              </div>
            </Section>

            {/* 2 — WHAT SHE MAY ANSWER: DM + groups */}
            <Section id="chats" icon={MessageCircle} title="Chats she answers" summary={chatsSummary} open={expanded.chats} onToggle={toggleSection}>
              <Row icon={Power} title="Read & reply" sub={master ? "She answers customers" : "Total silence to customers"} on={master} onFlip={() => flipControl("readMessages")} disabled={!!saving} />
              <Row icon={User} title="1:1 chats" sub="Private conversations" on={control.replyDM && master} onFlip={() => flipControl("replyDM")} disabled={!!saving || !master} indented />
              <Row icon={Users} title="Groups" sub="Group chats this line is in" on={control.replyGroups && master} onFlip={() => flipControl("replyGroups")} disabled={!!saving || !master} indented />
            </Section>

            {/* 3 — STORE AUTOMATION: status + catalog */}
            <Section id="store" icon={Store} title="Store automation" summary={storeSummary} open={expanded.store} onToggle={toggleSection} last>
              <Row icon={Smartphone} title="Status to store" sub="Statuses become products" on={control.statusImport} onFlip={() => flipControl("statusImport")} disabled={!!saving} />
              <Row icon={Store} title="Post to catalog" sub="Mirror to WA Business catalog" on={control.catalogMirror} onFlip={() => flipControl("catalogMirror")} disabled={!!saving} />
            </Section>
          </div>

          {error && (
            <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a" }}>
              {error}
            </p>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "#636c73" }}>
            Outside active days and time she stays silent — your own messages still work. Changes apply within a minute{saving ? " · saving…" : ""}.
          </p>
        </>
      )}
    </section>
  );
}
