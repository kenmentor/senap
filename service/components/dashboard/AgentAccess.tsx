"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Clock3, Power, User, Users, Smartphone, Store } from "lucide-react";
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
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
      style={
        indented
          ? { background: "rgba(255,255,255,0.03)", borderLeft: "2px solid rgba(0,168,132,0.5)" }
          : { background: "rgba(255,255,255,0.03)" }
      }
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

export default function AgentAccess() {
  const [lines, setLines] = useState<{ id: string; number: string; engineId?: string }[]>([]);
  const [line, setLine] = useState("");
  const [days, setDays] = useState<string[]>([...DAYS.slice(0, 5)]);
  const [open, setOpen] = useState("08:00");
  const [close, setClose] = useState("21:00");
  const [control, setControl] = useState<Control>(DEFAULT_CONTROL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      // Always apply (even empty days = everything off) so the UI never
      // shows stale switches after a save.
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
    // Pass the revert value so a failed save rolls the switch back.
    void save(`ctl-${k}`, { control: { [k]: !prev } }, { [k]: prev } as Partial<Control>);
  };

  const master = control.readMessages && !control.paused;

  return (
    <section className="rounded-3xl p-5 sm:p-6" style={{ background: "#10161b", border: "1px solid rgba(255,255,255,0.09)" }}>
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#00a884", color: "#04241d" }}>
          <Bot size={20} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold leading-tight" style={{ color: "#fff" }}>Agent access</span>
          <span className="block text-[12px]" style={{ color: "#8a949b" }}>When she works, and what she may touch</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: master ? "rgba(0,168,132,0.14)" : "rgba(255,255,255,0.06)", color: master ? "#00d19f" : "#8a949b" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: master ? "#00a884" : "#636c73" }} />
          {master ? "On duty" : "Paused"}
        </span>
      </header>

      {lines.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {lines.map((a) => {
            const id = a.engineId ?? a.number;
            const active = id === line;
            return (
              <button
                key={a.id}
                onClick={() => setLine(id)}
                disabled={!!saving}
                className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition disabled:opacity-50"
                style={active ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
              >
                {a.number}
              </button>
            );
          })}
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
          <p className="mt-5" style={LABEL}>Active days</p>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {DAYS.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => flipDay(d)}
                  disabled={!!saving}
                  aria-pressed={on}
                  title={d}
                  className="h-10 rounded-xl text-[12px] font-bold transition disabled:opacity-50"
                  style={on ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
                >
                  {d.slice(0, 1)}
                </button>
              );
            })}
          </div>

          <p className="mt-5 flex items-center gap-1.5" style={LABEL}>
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

          <p className="mt-5" style={LABEL}>Access level</p>
          <div className="mt-2 flex flex-col gap-2">
            <Row icon={Power} title="Read & reply" sub={master ? "She answers customers" : "Total silence to customers"} on={master} onFlip={() => flipControl("readMessages")} disabled={!!saving} />
            {master && (
              <>
                <Row icon={User} title="1:1 chats" sub="Private conversations" on={control.replyDM} onFlip={() => flipControl("replyDM")} disabled={!!saving} indented />
                <Row icon={Users} title="Groups" sub="Group chats this line is in" on={control.replyGroups} onFlip={() => flipControl("replyGroups")} disabled={!!saving} indented />
              </>
            )}
            <Row icon={Smartphone} title="Status to store" sub="Statuses become products" on={control.statusImport} onFlip={() => flipControl("statusImport")} disabled={!!saving} />
            <Row icon={Store} title="Post to catalog" sub="Mirror to WA Business catalog" on={control.catalogMirror} onFlip={() => flipControl("catalogMirror")} disabled={!!saving} />
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
