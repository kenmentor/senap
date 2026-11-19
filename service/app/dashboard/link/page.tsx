"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { Plus, RefreshCw, X, Unplug, Trash2, PlugZap, Check, QrCode, KeyRound, Copy, ArrowRight } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

// All agent calls go through /api/agent (server-side proxy keeps the key secret).

type Account = { id: string; number: string; name: string; linkedAt: string; engineId?: string; unlinked?: boolean };
type Phase = "idle" | "starting" | "waiting" | "connected" | "error";
type EngineState = { status: string; connected: boolean };

const engineIdOf = (a: Account) => (a.engineId ?? a.number ?? "").trim();

/** One status word per line — nothing else to interpret. */
function statusOf(a: Account, s: EngineState | undefined, serverUp: boolean): { word: string; color: string; pulse: boolean } {
  if (a.unlinked) return { word: "Unlinked", color: "#8a949b", pulse: false };
  if (!serverUp) return { word: "Server offline — retrying", color: "#8a949b", pulse: true };
  if (!s) return { word: "Starting…", color: "#8a949b", pulse: true };
  switch (s.status) {
    case "open":
      return { word: "Connected", color: "#00a884", pulse: false };
    case "qr":
    case "starting":
      return { word: "Waiting for scan", color: "#e0a100", pulse: true };
    case "logged_out":
      return { word: "Expired — tap Relink", color: "#e66a6a", pulse: false };
    default:
      return { word: "Offline — retrying", color: "#8a949b", pulse: true };
  }
}

function initialsOf(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.slice(-2) || "•";
}

/** Real WhatsApp profile photo with initials fallback. Fetched once per
 *  line via /api/line-avatar (server resolves the line's own JID). */
function LineAvatar({ number, url }: { number: string; url?: string | null }) {
  const [broken, setBroken] = useState(false);
  const show = !!url && url.startsWith("http") && !broken;
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold" style={{ background: "rgba(0,168,132,0.14)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)" }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url as string} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        initialsOf(number)
      )}
    </span>
  );
}

/** Short country list — the full dial list lives behind the same select. */
const COUNTRY_CODES = [
  { cc: "234", label: "Nigeria +234" },
  { cc: "233", label: "Ghana +233" },
  { cc: "254", label: "Kenya +254" },
  { cc: "27", label: "South Africa +27" },
  { cc: "44", label: "UK +44" },
  { cc: "1", label: "US/Canada +1" },
  { cc: "91", label: "India +91" },
  { cc: "971", label: "UAE +971" },
  { cc: "966", label: "Saudi +966" },
  { cc: "62", label: "Indonesia +62" },
  { cc: "63", label: "Philippines +63" },
];

function normalizePhone(cc: string, raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  if (d.startsWith("0")) return cc + d.slice(1);
  if (!d.startsWith(cc) && d.length <= 10) return cc + d;
  return d;
}

export default function LinkPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("my-shop");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [states, setStates] = useState<Record<string, EngineState>>({});
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const avatarsRef = useRef<Record<string, string | null>>({});
  const avatarFetchingRef = useRef<Set<string>>(new Set());
  const [serverUp, setServerUp] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pending, setPending] = useState<{ kind: "unlink" | "delete"; account: Account } | null>(null);
  const [relinkTarget, setRelinkTarget] = useState<string | null>(null);
  const [cc, setCc] = useState("234");
  const pollRef = useRef<number | null>(null);
  const startedHereRef = useRef(false);

  const suggestName = (list: Account[]) => {
    const taken = new Set(list.map((a) => engineIdOf(a).toLowerCase()));
    for (let i = 0; i < 25; i++) {
      const cand = `shop-${Math.random().toString(36).slice(2, 8)}`;
      if (!taken.has(cand)) return cand;
    }
    return `shop-${Date.now().toString(36)}`;
  };

  const openNew = () => {
    setDeviceName(suggestName(accounts));
    setRelinkTarget(null);
    setPhase("idle");
    setQr(null);
    setError(null);
    setMode("qr");
    setPhone("");
    setPairCode(null);
    setCopied(false);
    setActionError(null);
    setShowAdvanced(false);
    startedHereRef.current = false;
    setSheetOpen(true);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) setAccounts(await res.json());
      } catch {
        /* offline — page still renders */
      }
    })();
  }, []);

  // One photo fetch per line (only while connected — that guarantees the
  // agent knows the line's own JID). Failures aren't cached, so the next
  // poll retries; a genuine "no photo" caches as null.
  const ensureAvatar = (id: string) => {
    if (!id || avatarsRef.current[id] !== undefined || avatarFetchingRef.current.has(id)) return;
    avatarFetchingRef.current.add(id);
    fetch(`/api/line-avatar?line=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return; // unreachable — retry next poll
        const url = typeof d?.url === "string" && d.url.startsWith("http") ? (d.url as string) : null;
        avatarsRef.current[id] = url;
        setAvatars((v) => ({ ...v, [id]: url }));
      })
      .catch(() => {
        /* unreachable — retry next poll */
      })
      .finally(() => {
        avatarFetchingRef.current.delete(id);
      });
  };

  // One poll loop: every live line, every 5s. Sets the single server flag.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (accounts.length === 0) return;
      let ok = false;
      const next: Record<string, EngineState> = {};
      await Promise.all(
        accounts.map(async (a) => {
          const id = engineIdOf(a);
          if (!id || a.unlinked) return;
          try {
            const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`);
            if (!res.ok) return;
            const data = await res.json();
            next[id] = { status: data.status, connected: data.connected };
            ok = true;
          } catch {
            /* keep last state */
          }
        }),
      );
      if (cancelled) return;
      setServerUp(ok || accounts.every((a) => a.unlinked || !engineIdOf(a)));
      setStates((prev) => ({ ...prev, ...next }));
      for (const [id, st] of Object.entries(next)) {
        if (st.connected) ensureAvatar(id);
      }
    };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [accounts]);

  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    },
    [],
  );

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchQr = async (id: string) => {
    const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/qr`);
    if (!res.ok) {
      if (res.status === 401) {
        stopPolling();
        router.push("/signin?next=/dashboard/link");
        throw new Error("Session expired — sign in again.");
      }
      if (res.status === 404) throw new Error("Session was lost — press Start again.");
      throw new Error(`QR request failed (${res.status})`);
    }
    const data: { status: string; qr: string | null; connected: boolean } = await res.json();
    if (data.connected) {
      setQr(null);
      setPhase("connected");
      stopPolling();
    } else if (data.qr) {
      setQr(data.qr);
      setPhase("waiting");
    }
    return data;
  };

  const markStartedHere = async (id: string) => {
    try {
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        startedHereRef.current = !data.connected;
        return;
      }
    } catch {
      /* assume ours */
    }
    startedHereRef.current = true;
  };

  const startLinking = async () => {
    const id = deviceName.trim();
    if (!id) {
      setError("Enter a device name first.");
      return;
    }
    if (relinkTarget === null && accounts.some((a) => engineIdOf(a).toLowerCase() === id.toLowerCase())) {
      setError(`"${id}" is already linked. Pick a different name.`);
      return;
    }
    stopPolling();
    setError(null);
    setQr(null);
    setPhase("starting");
    await markStartedHere(id);
    try {
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/start`, { method: "POST" });
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/signin?next=/dashboard/link");
          return;
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Start failed (${res.status})`);
      }
      await fetchQr(id).catch(() => {});
      pollRef.current = window.setInterval(() => {
        fetchQr(id).catch((e) => {
          setError(e instanceof Error ? e.message : "Lost connection to agent.");
          setPhase("error");
          stopPolling();
        });
      }, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the agent.");
      setPhase("error");
    }
  };

  const closeSheet = () => {
    const id = deviceName.trim();
    const shouldStop = startedHereRef.current && phase !== "connected" && id;
    stopPolling();
    setSheetOpen(false);
    setRelinkTarget(null);
    setPhase("idle");
    setQr(null);
    setError(null);
    setPairCode(null);
    startedHereRef.current = false;
    if (shouldStop) {
      fetch(`/api/agent/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => {});
    }
  };

  const requestPairCode = async () => {
    const id = deviceName.trim();
    const digits = normalizePhone(cc, phone);
    if (!id) {
      setError("Enter a device name first.");
      return;
    }
    if (digits.length < 8 || digits.length > 15) {
      setError("Enter the full WhatsApp number first.");
      return;
    }
    stopPolling();
    setPairBusy(true);
    setError(null);
    setPairCode(null);
    await markStartedHere(id);
    try {
      const startRes = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/start`, { method: "POST" });
      if (!startRes.ok) {
        if (startRes.status === 401) {
          router.push("/signin?next=/dashboard/link");
          return;
        }
        const body = await startRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Start failed (${startRes.status})`);
      }
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/pairing-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: digits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Code request failed (${res.status})`);
      if (data.connected) {
        setPhase("connected");
        stopPolling();
        return;
      }
      if (!data.pairingCode) throw new Error("WhatsApp didn't return a code — try again.");
      setPairCode(data.pairingCode as string);
      setPhase("waiting");
      pollRef.current = window.setInterval(async () => {
        try {
          const s = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`);
          if (!s.ok) return;
          const st = await s.json();
          if (st.connected) {
            setPhase("connected");
            stopPolling();
          }
        } catch {
          /* keep waiting */
        }
      }, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a code.");
    } finally {
      setPairBusy(false);
    }
  };

  const copyCode = async () => {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(pairCode);
    } catch {
      /* clipboard blocked */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const waitForHealthy = async (id: string, timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.connected === true) return true;
        }
      } catch {
        /* retry */
      }
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  const confirmLinked = async () => {
    if (confirmBusy) return;
    const id = deviceName.trim() || "my-shop";
    setActionError(null);
    setConfirmBusy(true);
    try {
      const ok = await waitForHealthy(id, 15000);
      if (!ok) throw new Error("Not connected yet — finish the scan first, then tap Done.");
      const body = { number: id, name: "Shop line", linkedAt: "Today", engineId: id, unlinked: false };
      const res = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save this line.");
      }
      const created: Account = await res.json();
      setAccounts((v) => (v.some((x) => x.id === created.id) ? v.map((x) => (x.id === created.id ? created : x)) : [...v, created]));
      closeSheet();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setConfirmBusy(false);
    }
  };

  const unlink = async (a: Account) => {
    const id = engineIdOf(a);
    setActionError(null);
    setBusyId(a.id);
    try {
      if (id) await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => {});
      const res = await fetch(`/api/accounts/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unlinked: true }) });
      if (!res.ok) throw new Error("Unlink was NOT saved.");
      const updated: Account = await res.json();
      setAccounts((v) => v.map((x) => (x.id === a.id ? updated : x)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not unlink.");
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const removeAccount = async (a: Account) => {
    const id = engineIdOf(a);
    setActionError(null);
    setBusyId(a.id);
    try {
      if (id) await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete was NOT saved.");
      setAccounts((v) => v.filter((x) => x.id !== a.id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const relink = (a: Account) => {
    const id = engineIdOf(a) || a.number;
    setDeviceName(id);
    setRelinkTarget(id);
    startedHereRef.current = false;
    setPhase("idle");
    setQr(null);
    setError(null);
    setMode("qr");
    setPhone("");
    setPairCode(null);
    setSheetOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {actionError && (
        <p className="mb-3 rounded-xl p-3 text-[12.5px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
          {actionError}
        </p>
      )}

      <div className="grid gap-3">
        {accounts.map((a) => {
          const id = engineIdOf(a);
          const st = statusOf(a, states[id], serverUp);
          return (
            <div key={a.id} className="rounded-2xl p-4" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
              <Link href={`/dashboard/agent?account=${encodeURIComponent(id)}`} className="flex items-center gap-3 rounded-xl">
                <LineAvatar number={a.number} url={avatars[id]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold" style={{ color: "#e9edef" }}>{a.number}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: "#8a949b" }}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.pulse ? "animate-pulse" : ""}`} style={{ background: st.color }} />
                    {st.word}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: "#00d19f" }}>Manage →</span>
              </Link>
              <div className="mt-3 flex gap-2">
                {a.unlinked ? (
                  <button onClick={() => relink(a)} disabled={busyId === a.id} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-semibold transition hover:bg-white/10 disabled:opacity-50" style={{ color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)" }}>
                    <PlugZap size={14} /> Relink
                  </button>
                ) : (
                  <button onClick={() => setPending({ kind: "unlink", account: a })} disabled={busyId === a.id} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-medium transition hover:bg-white/10 disabled:opacity-50" style={{ color: "#aebac1", border: "1px solid rgba(255,255,255,0.12)" }}>
                    <Unplug size={14} /> {busyId === a.id ? "Working…" : "Unlink"}
                  </button>
                )}
                <button onClick={() => setPending({ kind: "delete", account: a })} disabled={busyId === a.id} aria-label={`Delete ${a.number}`} className="flex items-center justify-center rounded-xl px-3.5 py-2.5 transition hover:bg-white/10 disabled:opacity-50" style={{ color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        <button onClick={openNew} className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-2xl transition hover:bg-white/[0.04]" style={{ border: "1px dashed rgba(255,255,255,0.18)" }}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full transition group-hover:scale-105" style={{ background: "#00a884", color: "#04241d" }}>
            <Plus size={20} strokeWidth={2.5} />
          </span>
          <span className="text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>Link a new number</span>
          <span className="text-[12px]" style={{ color: "#636c73" }}>Takes about a minute</span>
        </button>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={closeSheet}>
          <div className="max-h-[92dvh] w-full max-w-[400px] overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold" style={{ color: "#e9edef" }}>
                {relinkTarget ? "Relink number" : "Link a new number"}
              </h2>
              <button onClick={closeSheet} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-white/10" style={{ color: "#636c73" }}><X size={17} /></button>
            </div>

            {/* Step 1 — pick how. Two big buttons, no jargon. */}
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#8a949b" }}>Step 1 · How do you want to link?</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)" }}>
              {([["qr", "Scan QR", QrCode], ["code", "Type a code", KeyRound]] as const).map(([m, label, Icon]) => (
                <button
                  key={m}
                  onClick={() => {
                    if (m === mode) return;
                    stopPolling();
                    setMode(m);
                    setPhase("idle");
                    setQr(null);
                    setError(null);
                    setPairCode(null);
                  }}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition active:scale-[0.98]"
                  style={mode === m ? { background: "rgba(0,168,132,0.16)", color: "#00d19f" } : { color: "#8a949b" }}
                >
                  <Icon size={15} strokeWidth={2} /> {label}
                </button>
              ))}
            </div>

            {/* Step 2 — do it. */}
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#8a949b" }}>Step 2 · Connect</p>
            {mode === "qr" ? (
              <div className="mt-2 flex flex-col items-center">
                {phase === "connected" ? (
                  <div className="flex w-full flex-col items-center rounded-2xl py-8" style={{ background: "rgba(0,168,132,0.08)", border: "1px solid rgba(0,168,132,0.35)" }}>
                    <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#00a884", color: "#04241d" }}><Check size={28} strokeWidth={3} /></span>
                    <p className="mt-3 text-[14px] font-semibold" style={{ color: "#e9edef" }}>Connected</p>
                    <p className="mt-1 text-[12px]" style={{ color: "#8a949b" }}>Tap Done below to finish.</p>
                  </div>
                ) : (
                  <>
                    {qr ? (
                      <div className="rounded-2xl bg-white p-3"><QRCode value={qr} size={216} /></div>
                    ) : (
                      <div className="flex items-center justify-center rounded-2xl bg-white/5" style={{ width: 240, height: 240, border: "1px dashed rgba(255,255,255,0.15)" }}>
                        <p className="px-8 text-center text-[12.5px]" style={{ color: "#636c73" }}>
                          {phase === "starting" ? "Starting…" : phase === "error" ? "Something went wrong." : "Press Start, then scan."}
                        </p>
                      </div>
                    )}
                    <ol className="mt-3 w-full rounded-2xl p-4 text-[12.5px] leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#cfd6db" }}>
                      <li>1. Press <b>Start</b> below.</li>
                      <li>2. On your phone: WhatsApp → Settings → Linked devices → Link a device.</li>
                      <li>3. Scan the code on this screen.</li>
                    </ol>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-2">
                {phase === "connected" ? (
                  <div className="flex w-full flex-col items-center rounded-2xl py-8" style={{ background: "rgba(0,168,132,0.08)", border: "1px solid rgba(0,168,132,0.35)" }}>
                    <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#00a884", color: "#04241d" }}><Check size={28} strokeWidth={3} /></span>
                    <p className="mt-3 text-[14px] font-semibold" style={{ color: "#e9edef" }}>Connected</p>
                    <p className="mt-1 text-[12px]" style={{ color: "#8a949b" }}>Tap Done below to finish.</p>
                  </div>
                ) : (
                  <>
                    <span className="flex gap-2">
                      <select value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Country code" className="shrink-0 rounded-xl px-2.5 text-[14px] font-semibold outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 48, maxWidth: 128 }}>
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.cc} value={c.cc} style={{ background: "#111b21" }}>+{c.cc} · {c.label.split(" +")[0]}</option>
                        ))}
                      </select>
                      <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))} placeholder="801 234 5678" inputMode="tel" autoComplete="tel" className="min-w-0 flex-1 rounded-xl px-3.5 text-[15px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 48 }} />
                    </span>
                    {pairCode ? (
                      <button onClick={copyCode} title="Tap to copy" className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-2xl py-5 transition active:scale-[0.99]" style={{ background: "rgba(0,168,132,0.08)", border: "1px dashed rgba(0,168,132,0.5)" }}>
                        <span className="font-mono text-[30px] font-bold tracking-[0.18em]" style={{ color: "#00d19f" }}>
                          {pairCode.length === 8 ? `${pairCode.slice(0, 4)}–${pairCode.slice(4)}` : pairCode}
                        </span>
                        {copied ? <Check size={17} strokeWidth={2.5} style={{ color: "#00d19f" }} /> : <Copy size={17} style={{ color: "#636c73" }} />}
                      </button>
                    ) : (
                      <div className="mt-3 flex w-full items-center justify-center rounded-2xl bg-white/5" style={{ minHeight: 96, border: "1px dashed rgba(255,255,255,0.15)" }}>
                        <p className="px-8 text-center text-[12.5px]" style={{ color: "#636c73" }}>
                          {pairBusy ? "Asking WhatsApp for your code…" : "Enter your number, then tap Get code."}
                        </p>
                      </div>
                    )}
                    <ol className="mt-3 w-full rounded-2xl p-4 text-[12.5px] leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#cfd6db" }}>
                      <li>1. Tap <b>Get code</b> below.</li>
                      <li>2. On your phone: WhatsApp → Settings → Linked devices → Link a device → “Link with phone number instead”.</li>
                      <li>3. Type the code above into your phone.</li>
                    </ol>
                  </>
                )}
              </div>
            )}

            {error && <p className="mt-2.5 text-center text-[12px]" style={{ color: "#e66a6a" }}>{error}</p>}
            {actionError && <p className="mt-2.5 text-center text-[12px]" style={{ color: "#e66a6a" }}>{actionError}</p>}

            {/* Advanced: device name, hidden unless needed. */}
            <button onClick={() => setShowAdvanced((v) => !v)} className="mt-3 text-[12px] font-semibold" style={{ color: "#636c73" }}>
              {showAdvanced ? "Hide advanced ▾" : "Advanced (device name) ▸"}
            </button>
            {showAdvanced && (
              <label className="mt-2 block text-[12px] font-medium" style={{ color: "#8a949b" }}>
                Device name (each number needs its own)
                <input value={deviceName} onChange={(e) => { setDeviceName(e.target.value); setRelinkTarget(null); }} className="mt-1.5 w-full rounded-xl px-3.5 text-[13.5px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 44 }} />
              </label>
            )}

            {/* Step 3 — one button that always says what happens next. */}
            <div className="sticky bottom-0 -mx-6 flex flex-col gap-2.5 px-6 pb-1 pt-3" style={{ background: "#111b21", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {phase === "connected" ? (
                <button onClick={confirmLinked} disabled={confirmBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                  {confirmBusy ? "Saving…" : <>Done <ArrowRight size={16} strokeWidth={2.5} /></>}
                </button>
              ) : mode === "code" ? (
                pairCode ? (
                  <button onClick={confirmLinked} disabled={confirmBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                    {confirmBusy ? "Saving…" : <>I typed the code — Done <ArrowRight size={16} strokeWidth={2.5} /></>}
                  </button>
                ) : (
                  <button onClick={requestPairCode} disabled={pairBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                    <KeyRound size={16} strokeWidth={2.5} /> {pairBusy ? "Getting code…" : "Get code"}
                  </button>
                )
              ) : phase === "idle" || phase === "error" ? (
                <button onClick={startLinking} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99]" style={{ background: "#00a884", color: "#04241d" }}>
                  <QrCode size={16} strokeWidth={2.5} /> Start
                </button>
              ) : (
                <>
                  <button onClick={confirmLinked} disabled={confirmBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                    {confirmBusy ? "Saving…" : <>I scanned the code — Done <ArrowRight size={16} strokeWidth={2.5} /></>}
                  </button>
                  <button onClick={startLinking} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-[13px] font-medium transition active:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#aebac1" }}>
                    <RefreshCw size={14} /> New code
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "delete" ? `Delete ${pending?.account.number}?` : "Unlink this number?"}
        description={pending?.kind === "delete" ? "This stops the line and removes it. Linking again needs a fresh scan." : "The line stops answering. Relink any time — no re-scan needed."}
        confirmLabel={pending?.kind === "delete" ? "Delete" : "Unlink"}
        danger={pending?.kind === "delete"}
        icon={pending?.kind === "delete" ? Trash2 : Unplug}
        busy={busyId !== null}
        onCancel={() => (busyId === null ? setPending(null) : undefined)}
        onConfirm={() => {
          if (!pending || busyId !== null) return;
          if (pending.kind === "delete") void removeAccount(pending.account);
          else void unlink(pending.account);
        }}
      />
    </div>
  );
}
