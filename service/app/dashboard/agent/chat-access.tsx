"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Ban, Star, RefreshCw } from "lucide-react";
import ContactAccessTable from "@/components/ui/contact-access-table";

// Agent calls go through /api/agent (server-side proxy attaches AGENT_API_KEY).

type Account = { id: string; number: string; engineId?: string };
type Rule = { id: string; jid: string; name: string; list: "black" | "white" };
type Chat = { jid: string; name: string; lastSeen: number; messages: number; imgUrl?: string | null; about?: string };
type Mode = "open" | "exclusive";

const card = {
  border: "1px solid rgba(255,255,255,0.09)",
  background: "transparent",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
} as const;

function timeAgo(ts: number): string {
  if (!ts) return "never seen";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function shortJid(jid: string): string {
  const user = jid.split("@")[0];
  return user.length > 16 ? `${user.slice(0, 16)}…` : user;
}

export default function ChatAccess() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState("");
  const [mode, setMode] = useState<Mode>("open");
  const [rules, setRules] = useState<Rule[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [agentUp, setAgentUp] = useState(true);
  const [pendingJid, setPendingJid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualJid, setManualJid] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) return;
        const list: Account[] = await res.json();
        setAccounts(list);
        // Deep link from /dashboard/link: ?account=<engineId> preselects that line.
        let requested = "";
        try {
          requested = new URLSearchParams(window.location.search).get("account")?.trim() ?? "";
        } catch {
          requested = "";
        }
        const wanted = requested
          ? list.find((a) => (a.engineId ?? a.number) === requested)
          : undefined;
        const first = wanted ?? list[0];
        if (first) setAccount(first.engineId ?? first.number);
      } catch {
        /* offline */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [accessRes, chatsRes] = await Promise.all([
        fetch(`/api/chat-access?userId=${encodeURIComponent(account)}`),
        fetch(`/api/agent/sessions/${encodeURIComponent(account)}/contacts`).catch(() => null),
      ]);
      if (accessRes.ok) {
        const data = await accessRes.json();
        setMode(data.mode ?? "open");
        setRules(data.rules ?? []);
      } else {
        const data = await accessRes.json().catch(() => ({}));
        setActionError(data.error ?? "Could not load block/allow rules (is MongoDB running?).");
      }
      if (chatsRes && chatsRes.ok) {
        const data = await chatsRes.json();
        setChats(data.chats ?? []);
        setAgentUp(true);
      } else {
        setAgentUp(false);
      }
    } catch {
      setActionError("Could not reach the server. Check MongoDB and the agent on :3001.");
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  const setRule = async (chat: Chat, list: "black" | "white" | null) => {
    if (!account || pendingJid) return;
    setActionError(null);
    setPendingJid(chat.jid);
    try {
      let res: Response | null = null;
      if (list === null) {
        res = await fetch(`/api/chat-access?userId=${encodeURIComponent(account)}&jid=${encodeURIComponent(chat.jid)}`, {
          method: "DELETE",
        });
      } else {
        res = await fetch("/api/chat-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: account, jid: chat.jid, name: chat.name, list }),
        });
      }
      if (!res || !res.ok) {
        const data = await res?.json().catch(() => ({}));
        throw new Error(data?.error ?? "Could not save the rule — is MongoDB running?");
      }
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save the rule.");
    } finally {
      setPendingJid(null);
    }
  };

  const setModeApi = async (next: Mode) => {
    if (!account) {
      setActionError("Link an account first, then choose who can talk to the assistant.");
      return;
    }
    setActionError(null);
    const prev = mode;
    setMode(next);
    try {
      const res = await fetch("/api/chat-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account, mode: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save the mode.");
      }
    } catch (e) {
      setMode(prev);
      setActionError(e instanceof Error ? e.message : "Could not save the mode.");
    }
  };

  /** Block/allow a number typed by hand — works even when the agent is offline. */
  const addManualRule = async (list: "black" | "white") => {
    const raw = manualJid.trim();
    if (!account) {
      setActionError("Link an account first.");
      return;
    }
    if (!raw) {
      setActionError("Type a phone number or JID first (e.g. 2348012345678).");
      return;
    }
    // Normalise "234801..." → "234801...@s.whatsapp.net" so it matches incoming messages.
    const jid = raw.includes("@") ? raw : `${raw.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    if (!jid.split("@")[0]) {
      setActionError("That number doesn't look valid.");
      return;
    }
    setActionError(null);
    setPendingJid(jid);
    try {
      const res = await fetch("/api/chat-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account, jid, name: raw, list }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save the rule.");
      }
      setManualJid("");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save the rule.");
    } finally {
      setPendingJid(null);
    }
  };

  const ruleByJid = new Map(rules.map((r) => [r.jid, r]));
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const rows: (Chat & { rule: Rule | null; isGroup: boolean })[] = [
    ...chats.map((c) => ({ ...c, rule: ruleByJid.get(c.jid) ?? null, isGroup: c.jid.endsWith("@g.us") })),
    ...rules
      .filter((r) => !chats.some((c) => c.jid === r.jid))
      .map((r) => ({ jid: r.jid, name: r.name, lastSeen: 0, messages: 0, rule: r, isGroup: r.jid.endsWith("@g.us") })),
  ].filter((r) => !q || r.name.toLowerCase().includes(q) || shortJid(r.jid).toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-3.5">
      <section className="rounded-2xl p-5 sm:p-6" style={card}>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
          <ShieldCheck size={16} style={{ color: "#00a884" }} /> Who can talk to the assistant?
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "#8a949b" }}>
          Blocked chats are dropped instantly — never read, never answered. Rules are stored in Mongo and enforced on the server, so no message can talk its way around them.
        </p>

        {/* Account picker */}
        {accounts.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {accounts.map((a) => {
              const id = a.engineId ?? a.number;
              const active = id === account;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccount(id)}
                  className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition"
                  style={active ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
                >
                  {a.number}
                </button>
              );
            })}
          </div>
        )}

        {/* Mode toggle */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)" }}>
          {(
            [
              ["open", "Everyone", "Blocked chats are dropped"],
              ["exclusive", "Invite only", "Only allowed chats reply"],
            ] as const
          ).map(([m, label, desc]) => (
            <button
              key={m}
              onClick={() => setModeApi(m)}
              className="rounded-lg px-3 py-2.5 text-left transition"
              style={mode === m ? { background: "rgba(255,255,255,0.09)" } : undefined}
            >
              <span className="block text-[13px] font-semibold" style={{ color: mode === m ? "#fff" : "#8a949b" }}>{label}</span>
              <span className="block text-[11px]" style={{ color: "#636c73" }}>{desc}</span>
            </button>
          ))}
        </div>

        {!agentUp && (
          <p className="mt-3 rounded-xl p-3 text-[12px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
            Agent offline — start it on :3001 to see live chats. You can still block by number below; saved rules apply on next boot.
          </p>
        )}

        {actionError && (
          <p className="mt-3 rounded-xl p-3 text-[12px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
            {actionError}
          </p>
        )}

        {!account && (
          <p className="mt-3 rounded-xl p-3 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", color: "#8a949b", border: "1px solid rgba(255,255,255,0.1)" }}>
            No linked account yet — link one on the Link page first.
          </p>
        )}

        {/* Manual entry: works even with zero live chats */}
        <div className="mt-4 flex gap-2">
          <input
            value={manualJid}
            onChange={(e) => setManualJid(e.target.value)}
            placeholder="Block/allow by number, e.g. 2348012345678"
            className="min-w-0 flex-1 rounded-xl px-3.5 text-[13px] outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 40 }}
          />
          <button
            onClick={() => addManualRule("black")}
            disabled={!manualJid.trim() || pendingJid !== null}
            className="flex items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold disabled:opacity-50"
            style={{ background: "rgba(230,106,106,0.15)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.35)", height: 40 }}
          >
            <Ban size={14} /> Block
          </button>
          <button
            onClick={() => addManualRule("white")}
            disabled={!manualJid.trim() || pendingJid !== null}
            className="flex items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold disabled:opacity-50"
            style={{ background: "rgba(0,168,132,0.12)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)", height: 40 }}
          >
            <Star size={14} /> Allow
          </button>
        </div>
      </section>

      <section className="rounded-2xl p-5 sm:p-6" style={card}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold" style={{ color: "#e9edef" }}>
            Contacts & groups {account ? `· ${account}` : ""} ({rows.length}){loading ? " ·…" : ""}
          </h3>
          <button onClick={load} aria-label="Refresh chats" style={{ color: "#8a949b" }}>
            <RefreshCw size={15} />
          </button>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search contacts & groups…"
          className="mt-3 w-full rounded-xl px-3.5 text-[13px] outline-none placeholder:text-[#4a545b]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 40 }}
        />

        {(() => {
          const tableRows = rows.map((row) => ({
            jid: row.jid,
            name: row.name,
            sub: `${shortJid(row.jid)} · ${row.messages} msgs · ${row.about && row.lastSeen === 0 ? row.about : timeAgo(row.lastSeen)}`,
            imgUrl: row.imgUrl ?? null,
            badge: row.isGroup ? "Group" : undefined,
            rule: row.rule,
          }));
          return (
            <ContactAccessTable
              rows={tableRows}
              pendingJid={pendingJid}
              onToggle={(tRow, list) => {
                const full = rows.find((r) => r.jid === tRow.jid);
                if (full) setRule(full, list);
              }}
              emptyText={
                q
                  ? "No contacts match that search."
                  : "No contacts yet — the full roster loads when the line connects; one-to-one chats appear after their first message."
              }
            />
          );
        })()}
      </section>
    </div>
  );
}
