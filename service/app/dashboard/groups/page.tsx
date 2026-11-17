"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, RefreshCw, Crown, ChevronDown, Bot, X, Power } from "lucide-react";

type Group = {
  jid: string;
  subject: string;
  members: number;
  isAdmin: boolean;
  lastActive: number;
};
type Member = { jid: string; name: string; admin: boolean };
type Details = {
  jid: string;
  subject: string;
  desc: string;
  members: number;
  isAdmin: boolean;
  avatar: string | null;
  participants: Member[];
};
type AgentStatus = {
  configured: boolean;
  enabled?: boolean;
  name?: string;
  role?: string;
  intervalHours?: number;
  maxPerDay?: number;
  replyThreshold?: number;
  sentToday?: number;
  nextRunAt?: string | null;
};

function chattyLabel(t: number | undefined): string {
  if (t === undefined) return "";
  if (t <= 0.4) return "chatty";
  if (t <= 0.6) return "balanced";
  return "quiet";
}

const card = {
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.025)",
} as const;

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  color: "#e9edef",
  border: "1px solid rgba(255,255,255,0.1)",
} as const;

function hueOf(s: string): number {
  let h: number = 11;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h % 360;
}

function activeAgo(ts: number): string {
  if (!ts) return "no activity yet";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "active now";
  if (s < 3600) return `active ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `active ${Math.floor(s / 3600)}h ago`;
  return `active ${Math.floor(s / 86400)}d ago`;
}

function nextIn(iso: string | null | undefined): string {
  if (!iso) return "not scheduled";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "due now";
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `in ${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 48) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

export default function GroupsPage() {
  const [accounts, setAccounts] = useState<{ number: string; engineId?: string }[]>([]);
  const [account, setAccount] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [adminCount, setAdminCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentUp, setAgentUp] = useState(true);
  const [openJid, setOpenJid] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Details>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  // Activate-agent modal
  const [modalJid, setModalJid] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fRole, setFRole] = useState("");
  const [fPersonality, setFPersonality] = useState("");
  const [fDuty, setFDuty] = useState("");
  const [fInterval, setFInterval] = useState("6");
  const [fMax, setFMax] = useState("4");
  const [fChatty, setFChatty] = useState("0.5");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) return;
        const list: { number: string; engineId?: string }[] = await res.json();
        setAccounts(list);
        let requested = "";
        try {
          requested = new URLSearchParams(window.location.search).get("account")?.trim() ?? "";
        } catch {
          requested = "";
        }
        const wanted = requested ? list.find((a) => (a.engineId ?? a.number) === requested) : undefined;
        const first = wanted ?? list[0];
        if (first) setAccount(first.engineId ?? first.number);
      } catch {
        /* offline */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!account) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(account)}/groups`, {
        cache: "no-store",
      }).catch(() => null);
      if (!res || !res.ok) {
        setAgentUp(false);
        setGroups([]);
        return;
      }
      const data = await res.json();
      const list: Group[] = Array.isArray(data.groups) ? data.groups : [];
      setGroups(list);
      setAdminCount(list.filter((g) => g.isAdmin).length);
      setAgentUp(!data.offline);
      // Lazy group avatars (cached per jid) — rows upgrade from icon to photo.
      for (const g of list) {
        fetch(
          `/api/agent/sessions/${encodeURIComponent(account)}/avatar?jid=${encodeURIComponent(g.jid)}`,
          { cache: "force-cache" },
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.url) setAvatars((v) => (v[g.jid] ? v : { ...v, [g.jid]: d.url as string }));
          })
          .catch(() => {});
      }
    } catch {
      setAgentUp(false);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (g: Group) => {
    if (openJid === g.jid) {
      setOpenJid(null);
      return;
    }
    setOpenJid(g.jid);
    const [dRes, sRes] = await Promise.all([
      details[g.jid]
        ? null
        : fetch(
            `/api/agent/sessions/${encodeURIComponent(account)}/groups/details?jid=${encodeURIComponent(g.jid)}`,
            { cache: "no-store" },
          ).catch(() => null),
      statuses[g.jid]
        ? null
        : fetch(
            `/api/agent/sessions/${encodeURIComponent(account)}/group-agent/status?jid=${encodeURIComponent(g.jid)}`,
            { cache: "no-store" },
          ).catch(() => null),
    ]);
    if (dRes) {
      setDetailsLoading(g.jid);
      try {
        if (dRes.ok) {
          const data = await dRes.json();
          if (data.group) {
            setDetails((v) => ({ ...v, [g.jid]: data.group as Details }));
            if ((data.group as Details).avatar) {
              const url = (data.group as Details).avatar as string;
              setAvatars((v) => (v[g.jid] ? v : { ...v, [g.jid]: url }));
            }
          }
        }
      } finally {
        setDetailsLoading(null);
      }
    }
    if (sRes) {
      try {
        if (sRes.ok) {
          const data = await sRes.json();
          setStatuses((v) => ({ ...v, [g.jid]: data as AgentStatus }));
        }
      } catch {
        /* offline */
      }
    }
  };

  const openActivate = (g: Group) => {
    const st = statuses[g.jid];
    setModalJid(g.jid);
    setFName("");
    setFRole("");
    setFPersonality("");
    setFDuty("");
    setFInterval(String(6));
    setFMax(String(4));
    setFChatty(String(statuses[g.jid]?.replyThreshold ?? 0.45));
    setSaveError(null);
    void st;
  };

  const saveActivate = async () => {
    if (!modalJid || !account) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(account)}/group-agent/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupJid: modalJid,
          name: fName.trim(),
          role: fRole.trim(),
          personality: fPersonality.trim(),
          duty: fDuty.trim(),
          intervalHours: Math.min(168, Math.max(1, Math.round(Number(fInterval) || 6))),
          maxPerDay: Math.min(20, Math.max(1, Math.round(Number(fMax) || 4))),
          replyThreshold: Math.min(1, Math.max(0, Number(fChatty) || 0.5)),
        })});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Setup failed (${res.status})`);
      setModalJid(null);
      setStatuses((v) => ({
        ...v,
        [modalJid]: {
          configured: true,
          enabled: true,
          name: fName.trim(),
          role: fRole.trim(),
          intervalHours: Number(fInterval) || 6,
          maxPerDay: Number(fMax) || 4,
          sentToday: 0,
          nextRunAt: data.firstRunAt ?? null,
        },
      }));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Setup failed.");
    } finally {
      setSaving(false);
    }
  };

  const disableAgent = async (jid: string) => {
    try {
      await fetch(`/api/agent/sessions/${encodeURIComponent(account)}/group-agent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupJid: jid }),
      }).catch(() => null);
    } finally {
      setStatuses((v) => ({ ...v, [jid]: { configured: true, enabled: false } }));
    }
  };

  const modalGroup = modalJid ? groups.find((g) => g.jid === modalJid) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold" style={{ color: "#e9edef" }}>
            Groups
          </h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "#636c73" }}>
            {groups.length === 0
              ? "Every group this line is in"
              : `${groups.length} group${groups.length === 1 ? "" : "s"} · admin in ${adminCount}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="rounded-lg px-3 py-2 text-[12.5px] font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {accounts.map((a) => (
                <option key={a.engineId ?? a.number} value={a.engineId ?? a.number} style={{ color: "#000" }}>
                  {a.engineId ?? a.number}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
            style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3.5 rounded-2xl p-5" style={card}>
              <div className="h-11 w-11 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "40%" }} />
                <div className="h-3 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "25%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : !agentUp ? (
        <p className="mt-4 rounded-2xl p-5 text-center text-[13px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
          Agent unreachable — start it on :3001, link the line, then hit Refresh.
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-2xl p-5 text-center text-[13px]" style={{ background: "rgba(255,255,255,0.03)", color: "#636c73", border: "1px dashed rgba(255,255,255,0.12)" }}>
          No groups yet — groups this line joins will list themselves here automatically.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {groups.map((g) => {
            const hue = hueOf(g.jid);
            const open = openJid === g.jid;
            const d = details[g.jid];
            const st = statuses[g.jid];
            const photo = avatars[g.jid] ?? d?.avatar ?? null;
            return (
              <li key={g.jid} className="rounded-2xl p-4 sm:p-5" style={card}>
                <button onClick={() => toggle(g)} className="flex w-full items-center gap-3.5 text-left">
                  <span
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold"
                    style={{ background: `linear-gradient(135deg, hsl(${hue},32%,30%), hsl(${(hue + 50) % 360},36%,18%))`, color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}
                  >
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <Users size={17} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold" style={{ color: "#e9edef" }}>{g.subject}</span>
                      {g.isAdmin ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: "rgba(0,168,132,0.14)", color: "#00d19f" }}>
                          <Crown size={11} /> Admin
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#8a949b" }}>
                          Member
                        </span>
                      )}
                      {st?.enabled ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: "rgba(0,168,132,0.08)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.3)" }}>
                          <Bot size={11} /> Agent on
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "#636c73" }}>
                      {g.members} member{g.members === 1 ? "" : "s"} · {activeAgo(g.lastActive)}
                      {st?.enabled ? ` · agent every ${st.intervalHours ?? "?"}h (${st.sentToday ?? 0}/${st.maxPerDay ?? "?"} today, ${chattyLabel(st.replyThreshold)})` : ""}
                    </span>
                  </span>
                  <ChevronDown size={16} style={{ color: "#636c73", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {open && (
                  <div className="mt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
                    {/* Agent controls */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {st?.enabled ? (
                        <>
                          <span className="text-[12px]" style={{ color: "#00d19f" }}>
                            Agent active{st.nextRunAt ? ` · next post ${nextIn(st.nextRunAt)}` : ""}
                          </span>
                          <button
                            onClick={() => disableAgent(g.jid)}
                            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                            style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}
                          >
                            <Power size={13} /> Switch off
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => openActivate(g)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                          style={{ background: "#00a884", color: "#04241d" }}
                        >
                          <Bot size={13} /> Activate agent for this group
                        </button>
                      )}
                    </div>
                    {detailsLoading === g.jid ? (
                      <p className="text-[12px]" style={{ color: "#636c73" }}>Loading members…</p>
                    ) : d ? (
                      <div>
                        {d.desc ? (
                          <p className="text-[12.5px]" style={{ color: "#8a949b" }}>{d.desc.slice(0, 200)}</p>
                        ) : null}
                        <ul className="mt-2 flex max-h-[240px] flex-col gap-1 overflow-y-auto">
                          {d.participants.slice(0, 200).map((p) => (
                            <li key={p.jid} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.02)" }}>
                              <span className="truncate text-[12.5px]" style={{ color: "#cfd6db" }}>{p.name}</span>
                              {p.admin && <Crown size={12} style={{ color: "#00d19f" }} />}
                            </li>
                          ))}
                        </ul>
                        {d.participants.length > 200 && (
                          <p className="mt-1 text-[11.5px]" style={{ color: "#636c73" }}>
                            +{d.participants.length - 200} more members
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[12px]" style={{ color: "#636c73" }}>Couldn&apos;t load members — try again.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Activate-agent modal */}
      {modalJid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => !saving && setModalJid(null)}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.12)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>
                Activate agent{modalGroup ? ` — ${modalGroup.subject}` : ""}
              </h2>
              <button onClick={() => !saving && setModalJid(null)} aria-label="Close" style={{ color: "#636c73" }}>
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "#8a949b" }}>
              The agent studies the group, takes its role, and runs its own engagement loop from here — no babysitting.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Name in group", value: fName, set: setFName, ph: "e.g. Nala" },
                { label: "Role", value: fRole, set: setFRole, ph: "e.g. vibe manager" },
                { label: "Personality", value: fPersonality, set: setFPersonality, ph: "e.g. playful pidgin, never formal" },
                { label: "Extra duty", value: fDuty, set: setFDuty, ph: "e.g. weekend deals every Friday" },
              ].map((f) => (
                <label key={f.label} className="flex flex-col gap-1 text-[12px] font-semibold" style={{ color: "#aebac1" }}>
                  {f.label}
                  <input
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                    className="rounded-lg px-3 py-2 text-[13px] font-normal outline-none"
                    style={inputStyle}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-[12px] font-semibold" style={{ color: "#aebac1" }}>
                How chatty in replies
                <select
                  value={fChatty}
                  onChange={(e) => setFChatty(e.target.value)}
                  className="rounded-lg px-3 py-2 text-[13px] font-normal outline-none"
                  style={inputStyle}
                >
                  <option value="0.3">Chatty — answers most things</option>
                  <option value="0.45">Balanced — answers when relevant</option>
                  <option value="0.65">Quiet — only when addressed</option>
                </select>
              </label>
              <div className="flex gap-2.5">
                <label className="flex flex-1 flex-col gap-1 text-[12px] font-semibold" style={{ color: "#aebac1" }}>
                  Post every (hours)
                  <input
                    value={fInterval}
                    onChange={(e) => setFInterval(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className="rounded-lg px-3 py-2 text-[13px] font-normal outline-none"
                    style={inputStyle}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[12px] font-semibold" style={{ color: "#aebac1" }}>
                  Max posts / day
                  <input
                    value={fMax}
                    onChange={(e) => setFMax(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className="rounded-lg px-3 py-2 text-[13px] font-normal outline-none"
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
            {saveError && (
              <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a" }}>
                {saveError}
              </p>
            )}
            <button
              onClick={saveActivate}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold disabled:opacity-50"
              style={{ background: "#00a884", color: "#04241d" }}
            >
              <Bot size={15} /> {saving ? "Activating…" : "Activate agent"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
