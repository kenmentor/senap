"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, RefreshCw, Crown, ChevronDown } from "lucide-react";

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
  participants: Member[];
};

const card = {
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.025)",
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
    if (details[g.jid]) return;
    setDetailsLoading(g.jid);
    try {
      const res = await fetch(
        `/api/agent/sessions/${encodeURIComponent(account)}/groups/details?jid=${encodeURIComponent(g.jid)}`,
        { cache: "no-store" },
      ).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.group) setDetails((v) => ({ ...v, [g.jid]: data.group as Details }));
      }
    } finally {
      setDetailsLoading(null);
    }
  };

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
            return (
              <li key={g.jid} className="rounded-2xl p-4 sm:p-5" style={card}>
                <button onClick={() => toggle(g)} className="flex w-full items-center gap-3.5 text-left">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ background: `linear-gradient(135deg, hsl(${hue},32%,30%), hsl(${(hue + 50) % 360},36%,18%))`, color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}
                  >
                    <Users size={17} />
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
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "#636c73" }}>
                      {g.members} member{g.members === 1 ? "" : "s"} · {activeAgo(g.lastActive)}
                    </span>
                  </span>
                  <ChevronDown size={16} style={{ color: "#636c73", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {open && (
                  <div className="mt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
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
    </div>
  );
}
