"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Clock3 } from "lucide-react";

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

function Switch({ on, onFlip, disabled, label }: { on: boolean; onFlip: () => void; disabled?: boolean; label: string }) {
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

  // Lines for the picker.
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

  // This line's schedule + switches.
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
      if (Array.isArray(c.days) && c.days.length) setDays(c.days.filter((d: unknown) => typeof d === "string"));
      if (typeof c.open === "string" && c.open) setOpen(c.open);
      if (typeof c.close === "string" && c.close) setClose(c.close);
      setControl(coerceControl(c.control));
    } catch {
      setError("Couldn't load this line's settings — is MongoDB running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(line);
  }, [line, load]);

  /** One PUT per change; the key locks its own switch until saved. */
  const save = async (key: string, patch: Record<string, unknown>) => {
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
      setError("Couldn't save — retry. It will still be off in the meantime.");
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
    const next = { ...control, [k]: !control[k] };
    setControl(next);
    void save(`ctl-${k}`, { control: { [k]: next[k] } });
  };

  const master = control.readMessages && !control.paused;

  return (
    <div className="rounded-2xl p-4 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
          <Bot size={16} style={{ color: "#00a884" }} /> Agent access
        </h2>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: master ? "#00d19f" : "#8a949b" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: master ? "#00a884" : "#636c73" }} />
          {master ? "On duty" : "Paused"}
        </span>
      </div>

      {lines.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {lines.map((a) => {
            const id = a.engineId ?? a.number;
            const active = id === line;
            return (
              <button
                key={a.id}
                onClick={() => setLine(id)}
                className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition disabled:opacity-50"
                disabled={!!saving}
                style={active ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
              >
                {a.number}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
      ) : (
        <>
          {/* Active days */}
          <p className="mt-4 text-[12px] font-semibold" style={{ color: "#8a949b" }}>Active days</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => flipDay(d)}
                  disabled={!!saving}
                  aria-pressed={on}
                  className="h-10 w-12 rounded-xl text-[13px] font-semibold transition disabled:opacity-50"
                  style={on ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Active time */}
          <p className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "#8a949b" }}>
            <Clock3 size={13} /> Active time
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]" style={{ color: "#8a949b" }}>
              From
              <input
                type="time"
                value={open}
                disabled={!!saving}
                onChange={(e) => {
                  setOpen(e.target.value);
                  void save("open", { open: e.target.value });
                }}
                className="rounded-xl px-3 py-2 text-[13px] outline-none disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", colorScheme: "dark" }}
              />
            </label>
            <label className="flex items-center gap-2 text-[13px]" style={{ color: "#8a949b" }}>
              To
              <input
                type="time"
                value={close}
                disabled={!!saving}
                onChange={(e) => {
                  setClose(e.target.value);
                  void save("close", { close: e.target.value });
                }}
                className="rounded-xl px-3 py-2 text-[13px] outline-none disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", colorScheme: "dark" }}
              />
            </label>
          </div>

          {/* Access level */}
          <div className="mt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>Read & reply to messages</p>
                <p className="mt-0.5 text-[12px]" style={{ color: "#636c73" }}>Master switch — off means total silence to customers</p>
              </div>
              <Switch on={master} onFlip={() => flipControl("readMessages")} disabled={!!saving} label="Read and reply to messages" />
            </div>
            {master && (
              <div className="mt-3 flex flex-col gap-2.5 pl-1">
                {(
                  [
                    ["replyDM", "1:1 chats", "Private customer conversations"],
                    ["replyGroups", "Groups", "Group chats this line is in"],
                  ] as const
                ).map(([k, label, sub]) => (
                  <div key={k} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: "#e9edef" }}>{label}</p>
                      <p className="text-[11.5px]" style={{ color: "#636c73" }}>{sub}</p>
                    </div>
                    <Switch on={control[k]} onFlip={() => flipControl(k)} disabled={!!saving} label={label} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status + catalog */}
          <div className="mt-3 flex flex-col gap-2.5">
            {(
              [
                ["statusImport", "Status access", "Turn phone statuses into store products"],
                ["catalogMirror", "Post to catalog", "Mirror new products to the WA Business catalog"],
              ] as const
            ).map(([k, label, sub]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "#e9edef" }}>{label}</p>
                  <p className="text-[11.5px]" style={{ color: "#636c73" }}>{sub}</p>
                </div>
                <Switch on={control[k]} onFlip={() => flipControl(k)} disabled={!!saving} label={label} />
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a" }}>
              {error}
            </p>
          )}
          <p className="mt-3 text-[11.5px]" style={{ color: "#636c73" }}>
            Changes take effect within a minute{saving ? " · saving…" : ""}
          </p>
        </>
      )}
    </div>
  );
}
