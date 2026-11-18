"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { Plus, RefreshCw, X, Unplug, Trash2, PlugZap, Check, Smartphone, ShieldCheck, QrCode, ArrowRight, Copy, KeyRound } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import ContactAccessTable from "@/components/ui/contact-access-table";

// NOTE: all agent calls go through /api/agent (server-side proxy) so the
// AGENT_API_KEY is attached and contacts/groups/QR actually load.

type Account = { id: string; number: string; name: string; linkedAt: string; engineId?: string; unlinked?: boolean };
type Phase = "idle" | "starting" | "qr" | "connected" | "error";
type EngineState = { status: string; connected: boolean; me?: string | null };

const engineIdOf = (a: Account) => (a.engineId ?? a.number ?? "").trim();

function statusLabel(a: Account, s: EngineState | undefined, agentOnline: boolean): { text: string; color: string; pulse: boolean } {
  if (a.unlinked) return { text: "Unlinked · record kept", color: "#8a949b", pulse: false };
  if (!agentOnline) return { text: "Agent offline", color: "#8a949b", pulse: false };
  if (!s) return { text: "Starting…", color: "#8a949b", pulse: true };
  switch (s.status) {
    case "open":
      return { text: `${a.name} · Connected · ${a.linkedAt}`, color: "#00a884", pulse: true };
    case "qr":
    case "starting":
      return { text: "Waiting for scan…", color: "#e0a100", pulse: true };
    case "logged_out":
      return { text: "Session expired · scan again", color: "#e66a6a", pulse: false };
    default:
      return { text: "Offline", color: "#8a949b", pulse: false };
  }
}

/* WhatsApp account avatar: real profile photo on top, clean phone icon underneath. */
function hashStr(s: string): number {
  let h = 11;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
}

function WhatsAppAvatar({ engineId, meJid, number, name }: { engineId: string; meJid?: string | null; number: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const h = hashStr(number);
  const hue = h % 360;

  useEffect(() => {
    if (!meJid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agent/sessions/${encodeURIComponent(engineId)}/avatar?jid=${encodeURIComponent(meJid)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.url) setUrl(data.url);
      } catch {
        /* keep initials fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engineId, meJid]);

  return (
    <span className="relative shrink-0">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: `linear-gradient(135deg, hsl(${hue},32%,30%), hsl(${(hue + 50) % 360},36%,18%))`, color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}
      >
        <Smartphone size={22} strokeWidth={1.75} />
      </span>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${name} WhatsApp photo`}
          draggable={false}
          onError={() => setUrl(null)}
          className="absolute inset-0 h-12 w-12 rounded-full object-cover"
          style={{ border: "1px solid rgba(255,255,255,0.14)" }}
        />
      )}
      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full" style={{ background: "#00a884", border: "2px solid #111b21" }} title="Connected" />
    </span>
  );
}

const QR_STEPS = ["Open WhatsApp on your phone", "Go to Settings → Linked devices", "Tap Link a device", "Point your phone at the code above"];

const CODE_STEPS = ["Pick your country code and enter the WhatsApp number", "Tap Get code — an 8-character code appears", "On your phone: WhatsApp → Settings → Linked devices", "Tap Link a device → “Link with phone number instead”", "Type in the code — your agent connects by itself"];

/** Dialing prefixes (longest first so business-number matching hits right). */
const COUNTRY_CODES = [
  { cc: "234", label: "Nigeria +234" },
  { cc: "233", label: "Ghana +233" },
  { cc: "254", label: "Kenya +254" },
  { cc: "256", label: "Uganda +256" },
  { cc: "255", label: "Tanzania +255" },
  { cc: "250", label: "Rwanda +250" },
  { cc: "251", label: "Ethiopia +251" },
  { cc: "27", label: "South Africa +27" },
  { cc: "260", label: "Zambia +260" },
  { cc: "263", label: "Zimbabwe +263" },
  { cc: "265", label: "Malawi +265" },
  { cc: "267", label: "Botswana +267" },
  { cc: "237", label: "Cameroon +237" },
  { cc: "221", label: "Senegal +221" },
  { cc: "225", label: "Ivory Coast +225" },
  { cc: "220", label: "Gambia +220" },
  { cc: "224", label: "Guinea +224" },
  { cc: "231", label: "Liberia +231" },
  { cc: "232", label: "Sierra Leone +232" },
  { cc: "241", label: "Gabon +241" },
  { cc: "242", label: "Congo +242" },
  { cc: "243", label: "DR Congo +243" },
  { cc: "261", label: "Madagascar +261" },
  { cc: "252", label: "Somalia +252" },
  { cc: "20", label: "Egypt +20" },
  { cc: "212", label: "Morocco +212" },
  { cc: "971", label: "UAE +971" },
  { cc: "966", label: "Saudi +966" },
  { cc: "91", label: "India +91" },
  { cc: "92", label: "Pakistan +92" },
  { cc: "880", label: "Bangladesh +880" },
  { cc: "63", label: "Philippines +63" },
  { cc: "62", label: "Indonesia +62" },
  { cc: "44", label: "UK +44" },
  { cc: "1", label: "US/Canada +1" },
].sort((a, b) => b.cc.length - a.cc.length || a.label.localeCompare(b.label));

/**
 * Normalize a typed number against the selected country: drop trunk zeros,
 * drop 00, and prepend the country code when the user typed a local number.
 */
function normalizePhone(cc: string, raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  if (d.startsWith("0")) return cc + d.slice(1);
  if (!d.startsWith(cc) && d.length <= 10) return cc + d;
  return d;
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-4 w-full rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {items.map((text, i) => (
        <li key={text} className="relative flex items-start gap-3 pb-3.5 last:pb-0">
          {i < items.length - 1 && (
            <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-22px)] w-px" style={{ background: "rgba(0,168,132,0.25)" }} />
          )}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: "rgba(0,168,132,0.14)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)" }}>
            {i + 1}
          </span>
          <span className="pt-1 text-[13px] leading-snug" style={{ color: "#cfd6db" }}>{text}</span>
        </li>
      ))}
    </ol>
  );
}

export default function LinkPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userId, setUserId] = useState("my-shop");
  const [phase, setPhase] = useState<Phase>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** QR vs pairing-code linking (code = for the same phone — no camera scan). */
  const [linkMode, setLinkMode] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [engineStates, setEngineStates] = useState<Record<string, EngineState>>({});
  const [agentOnline, setAgentOnline] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** In-flight guards: double-clicks while loading must never fire twice. */
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ kind: "unlink" | "delete"; account: Account } | null>(null);
  /** Just-linked line waiting for its block/allow choice. */
  const [freshLinked, setFreshLinked] = useState<string | null>(null);
  const [freshMode, setFreshMode] = useState<"open" | "exclusive">("open");
  const [freshChats, setFreshChats] = useState<{ jid: string; name: string; imgUrl?: string | null; about?: string }[]>([]);
  const [freshRules, setFreshRules] = useState<{ jid: string; name: string; list: "black" | "white" }[]>([]);
  const [freshLoading, setFreshLoading] = useState(false);
  const [freshAgentDown, setFreshAgentDown] = useState(false);
  const [freshFilter, setFreshFilter] = useState("");
  const [freshPending, setFreshPending] = useState<string | null>(null);
  /** engineId being relinked (null = linking a brand-new number). */
  const [relinkTarget, setRelinkTarget] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  /** True when THIS sheet opening started the session (so closing an
      unfinished link stops the orphan instead of leaking a live socket). */
  const startedHereRef = useRef(false);
  /** Country prefix for the pairing-code number, auto-guessed from the shop line. */
  const [cc, setCc] = useState("234");
  const [bizPhone, setBizPhone] = useState("");

  /** Auto-minted unique device name: shop-<random> (editable, always unique). */
  const suggestName = (list: Account[]) => {
    const taken = new Set(list.map((a) => engineIdOf(a).toLowerCase()));
    for (let i = 0; i < 25; i++) {
      const cand = `shop-${Math.random().toString(36).slice(2, 8)}`;
      if (!taken.has(cand)) return cand;
    }
    return `shop-${Date.now().toString(36)}`;
  };

  /** Guess the dialing country from the shop's own number (+234… → 234). */
  const guessCc = (businessPhone: string): string | null => {
    const digits = businessPhone.replace(/\D/g, "");
    const hit = COUNTRY_CODES.find((c) => digits.startsWith(c.cc));
    return hit ? hit.cc : null;
  };

  const openPickerForNew = () => {
    setUserId(suggestName(accounts));
    setRelinkTarget(null);
    setPhase("idle");
    setQr(null);
    setError(null);
    setLinkMode("qr");
    setPhone("");
    setPairCode(null);
    setPairError(null);
    setCopied(false);
    setActionError(null);
    startedHereRef.current = false;
    // Default the country prefix from the shop's own number.
    const guessed = guessCc(bizPhone);
    if (guessed) setCc(guessed);
    setPickerOpen(true);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) setAccounts(await res.json());
      } catch {
        /* offline — page still works locally */
      }
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const s = await res.json();
          const phone = typeof s?.business?.phone === "string" ? s.business.phone : "";
          setBizPhone(phone);
          const guessed = guessCc(phone);
          if (guessed) setCc(guessed);
        }
      } catch {
        /* country prefix stays on default */
      }
    })();
  }, []);

  /* Live WhatsApp status for every account card */
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
            next[id] = { status: data.status, connected: data.connected, me: data.me ?? null };
            ok = true;
          } catch {
            /* engine not running yet — keep last state */
          }
        }),
      );
      if (cancelled) return;
      setAgentOnline(ok || accounts.every((a) => a.unlinked || !engineIdOf(a)));
      setEngineStates((prev) => ({ ...prev, ...next }));
    };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [accounts]);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const fetchQr = async (id: string) => {
    const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/qr`);
    if (!res.ok) {
      if (res.status === 401) {
        stopPolling();
        router.push("/signin?next=/dashboard/link");
        throw new Error("Session expired — sign in again.");
      }
      if (res.status === 404) throw new Error("Session was lost on the agent — press Start again.");
      throw new Error(`QR request failed (${res.status})`);
    }
    const data: { status: string; qr: string | null; connected: boolean } = await res.json();
    if (data.connected) {
      setQr(null);
      setPhase("connected");
      stopPolling();
    } else if (data.qr) {
      setQr(data.qr);
      setPhase("qr");
    }
    return data;
  };

  /**
   * Claim ownership of this sheet's session lifecycle: if the session is NOT
   * already connected (relink of a live line), closing an unfinished sheet
   * stops the socket we dialled instead of leaking it.
   */
  const markStartedHere = async (id: string) => {
    try {
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        startedHereRef.current = !data.connected;
        return;
      }
    } catch {
      /* assume ours — close cleans up */
    }
    startedHereRef.current = true;
  };

  const startLinking = async () => {
    if (startBusy) return;
    const id = userId.trim();
    if (!id) {
      setError("Enter a name for this device first.");
      return;
    }
    // A fresh name always starts a fresh session. Reusing a linked name just
    // reattaches to that old session — which is why "another number" linking
    // seemed to connect the previous number instead of scanning a new one.
    if (relinkTarget === null) {
      const clash = accounts.some((a) => engineIdOf(a).toLowerCase() === id.toLowerCase());
      if (clash) {
        setError(`"${id}" is already linked. Pick a different device name (e.g. ${suggestName(accounts)}) to connect another number.`);
        return;
      }
    }
    stopPolling();
    setError(null);
    setQr(null);
    setPhase("starting");
    setStartBusy(true);
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
      // QR takes a few seconds to arrive — poll until it does
      await fetchQr(id).catch(() => {});
      pollRef.current = window.setInterval(() => {
        fetchQr(id).catch((e) => {
          setError(e instanceof Error ? e.message : "Lost connection to agent.");
          setPhase("error");
          stopPolling();
        });
      }, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the agent. Is it running on :3001?");
      setPhase("error");
    } finally {
      setStartBusy(false);
    }
  };

  const closeSheet = () => {
    const id = userId.trim();
    // Abandoned link = orphan live socket. If THIS sheet started the session
    // and the link never completed, stop it so dead bots don't pile up.
    const shouldStop = startedHereRef.current && phase !== "connected" && id;
    stopPolling();
    setPickerOpen(false);
    setRelinkTarget(null);
    setPhase("idle");
    setQr(null);
    setError(null);
    setLinkMode("qr");
    setPhone("");
    setPairCode(null);
    setPairError(null);
    setCopied(false);
    setActionError(null);
    startedHereRef.current = false;
    if (shouldStop) {
      fetch(`/api/agent/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => {});
    }
  };

  /** Watch a starting session until WhatsApp confirms the link (code mode). */
  const pollForConnection = (id: string) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`);
        if (!res.ok) {
          if (res.status === 401) {
            stopPolling();
            router.push("/signin?next=/dashboard/link");
          }
          return;
        }
        const data = await res.json();
        if (data.connected) {
          setPhase("connected");
          stopPolling();
        }
      } catch {
        /* keep polling — the code stays valid for a while */
      }
    }, 2500);
  };

  /** Switch QR ⇄ code: stop whatever the other mode was polling. */  const switchMode = (m: "qr" | "code") => {
    if (m === linkMode) return;
    stopPolling();
    setLinkMode(m);
    if (phase !== "connected") {
      setPhase("idle");
      setQr(null);
      setError(null);
      setPairCode(null);
      setPairError(null);
      setCopied(false);
    }
  };

  /**
   * Same-phone linking: no camera needed. Starts the session, asks WhatsApp
   * for an 8-character code for this number, and shows it to type into
   * WhatsApp → Linked devices → “Link with phone number instead”.
   */
  const requestPairCode = async () => {
    const id = userId.trim();
    const digits = normalizePhone(cc, phone);
    if (!id) {
      setPairError("Enter a device name first.");
      return;
    }
    if (digits.length < 8 || digits.length > 15) {
      setPairError("Enter the full WhatsApp number — pick the country code, then the local number.");
      return;
    }
    if (relinkTarget === null && accounts.some((a) => engineIdOf(a).toLowerCase() === id.toLowerCase())) {
      setPairError(`"${id}" is already linked — pick a different device name.`);
      return;
    }
    stopPolling();
    setPairBusy(true);
    setPairError(null);
    setPairCode(null);
    setCopied(false);
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
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/signin?next=/dashboard/link");
          return;
        }
        throw new Error(data.error ?? `Code request failed (${res.status})`);
      }
      if (data.connected) {
        setPhase("connected");
      } else {
        setPairCode(data.pairingCode ?? null);
        if (!data.pairingCode) throw new Error("WhatsApp didn't return a code — try again.");
        setPhase("qr"); // “waiting” — the code panel shows the code + waiting note
        pollForConnection(id);
      }
    } catch (e) {
      setPairError(e instanceof Error ? e.message : "Could not get a code — is the agent running on :3001?");
    } finally {
      setPairBusy(false);
    }
  };

  const copyCode = async () => {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(pairCode);
    } catch {
      /* clipboard blocked — user can read it off the screen */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const confirmLinked = async () => {
    if (confirmBusy) return;
    const id = userId.trim() || "my-shop";
    if (relinkTarget === null && accounts.some((a) => engineIdOf(a).toLowerCase() === id.toLowerCase())) {
      setActionError(`"${id}" is already linked — pick a different device name.`);
      return;
    }
    const body = { number: id, name: "Nala Phones", linkedAt: "Today", engineId: id, unlinked: false };
    setActionError(null);
    setConfirmBusy(true);
    try {
      const res = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/signin?next=/dashboard/link");
          return;
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save the linked account (is MongoDB running?).");
      }
      const created: Account = await res.json();
      // Server is idempotent (returns the existing row on double-submit) —
      // upsert locally instead of appending a duplicate card.
      setAccounts((v) =>
        v.some((x) => x.id === created.id) ? v.map((x) => (x.id === created.id ? created : x)) : [...v, created],
      );
      const linkedId = engineIdOf(created) || id;
      closeSheet();
      // Right after linking: show THIS line's real contacts + groups with
      // checkboxes, so block/allow is set up immediately.
      setFreshMode("open");
      setFreshChats([]);
      setFreshRules([]);
      setFreshFilter("");
      setFreshAgentDown(false);
      setFreshLinked(linkedId);
      void loadFresh(linkedId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save the linked account.");
    } finally {
      setConfirmBusy(false);
    }
  };

  /** Load the fresh line's mode, saved rules, and live contacts + groups. */
  const loadFresh = async (lineId: string) => {
    setFreshLoading(true);
    try {
      const [accessRes, chatsRes] = await Promise.all([
        fetch(`/api/chat-access?userId=${encodeURIComponent(lineId)}`),
        fetch(`/api/agent/sessions/${encodeURIComponent(lineId)}/contacts`).catch(() => null),
      ]);
      if (accessRes.ok) {
        const data = await accessRes.json();
        setFreshMode(data.mode ?? "open");
        const rawRules = Array.isArray(data.rules) ? data.rules : [];
        setFreshRules(
          rawRules.map((r: { jid?: unknown; name?: unknown; list?: unknown }) => ({
            jid: String(r?.jid ?? ""),
            name: String(r?.name ?? "Unknown"),
            list: r?.list === "white" ? ("white" as const) : ("black" as const),
          })),
        );
      }
      if (chatsRes && chatsRes.ok) {
        const data = await chatsRes.json();
        type FreshChat = { jid?: unknown; name?: unknown; imgUrl?: unknown; about?: unknown };
        const list: { jid: string; name: string; imgUrl?: string | null; about?: string }[] = ((data.chats ?? []) as FreshChat[]).map((c) => ({
          jid: String(c?.jid ?? ""),
          name: String(c?.name ?? "Unknown"),
          imgUrl: typeof c?.imgUrl === "string" ? c.imgUrl : null,
          about: typeof c?.about === "string" ? c.about : "",
        }));
        setFreshChats(list);
        setFreshAgentDown(false);
      } else {
        setFreshAgentDown(true);
      }
    } catch {
      setFreshAgentDown(true);
    } finally {
      setFreshLoading(false);
    }
  };

  /** Save the fresh line's access mode immediately. */
  const freshSetMode = async (next: "open" | "exclusive") => {
    if (!freshLinked) return;
    setFreshMode(next);
    try {
      await fetch("/api/chat-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: freshLinked, mode: next }),
      });
    } catch {
      /* mode toggle is best-effort here; agent page shows the saved value */
    }
  };

  /** Tick/untick Block or Allow for one contact or group on the fresh line. */
  const freshSetRule = async (chat: { jid: string; name: string; imgUrl?: string | null; about?: string }, list: "black" | "white" | null) => {
    if (!freshLinked || freshPending) return;
    setFreshPending(chat.jid);
    try {
      if (list === null) {
        const res = await fetch(
          `/api/chat-access?userId=${encodeURIComponent(freshLinked)}&jid=${encodeURIComponent(chat.jid)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("could not remove the rule");
        setFreshRules((v) => v.filter((r) => r.jid !== chat.jid));
      } else {
        const res = await fetch("/api/chat-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: freshLinked, jid: chat.jid, name: chat.name, list }),
        });
        if (!res.ok) throw new Error("could not save the rule");
        const saved = await res.json();
        setFreshRules((v) => {
          const rest = v.filter((r) => r.jid !== chat.jid);
          return [...rest, { jid: chat.jid, name: chat.name, list: saved.list ?? list }];
        });
      }
    } catch {
      setActionError("Could not save that tick — is MongoDB running? It will still be fixable on the agent page.");
    } finally {
      setFreshPending(null);
    }
  };

  /** Done with the fresh line's setup — stay here. */
  const closeFresh = () => {
    setFreshLinked(null);
  };

  /** Jump to the full per-number agent + chats page for the fresh line. */
  const manageFresh = () => {
    if (!freshLinked) return;
    const id = freshLinked;
    setFreshLinked(null);
    router.push(`/dashboard/agent?account=${encodeURIComponent(id)}`);
  };

  /** Unlink: stop the engine but keep the record + auth (relink needs no re-scan). */
  const unlink = async (a: Account) => {
    const id = engineIdOf(a);
    setActionError(null);
    setBusyId(a.id);
    try {
      if (id) await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => {});
      const res = await fetch(`/api/accounts/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unlinked: true }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not unlink in the database — the change was NOT saved.");
      }
      const updated: Account = await res.json();
      setAccounts((v) => v.map((x) => (x.id === a.id ? updated : x)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not unlink this account.");
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  };

  /** Relink: reopen the sheet for this engine (scan again only if session expired). */
  const relink = (a: Account) => {
    const id = engineIdOf(a) || a.number;
    setUserId(id);
    setRelinkTarget(id);
    startedHereRef.current = false;
    setPhase("idle");
    setQr(null);
    setError(null);
    setLinkMode("qr");
    setPhone("");
    setPairCode(null);
    setPairError(null);
    setCopied(false);
    setPickerOpen(true);
  };

  /** Delete: stop the engine, wipe its auth, and remove the record. */
  const removeAccount = async (a: Account) => {
    const id = engineIdOf(a);
    setActionError(null);
    setBusyId(a.id);
    try {
      if (id) await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete was NOT saved — it will reappear on reload. Is MongoDB running?");
      }
      // Only drop it from the UI after the database confirms the delete.
      setAccounts((v) => v.filter((x) => x.id !== a.id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete this account.");
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  };

  return (
    <div>
      {actionError && (
        <p className="mb-3.5 rounded-xl p-3 text-[12.5px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
          {actionError}
        </p>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {/* Linked account cards */}
        {accounts.map((a) => {
          const id = engineIdOf(a);
          const st = statusLabel(a, engineStates[id], agentOnline);
          return (
          <div key={a.id} className="rounded-2xl p-5" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
            {/* Tap the account to manage its block/allow list in the agent page. */}
            <Link
              href={`/dashboard/agent?account=${encodeURIComponent(id)}`}
              title={`Manage chats for ${a.number}`}
              className="flex items-center gap-3.5 rounded-xl transition hover:bg-white/[0.03]"
            >
              <WhatsAppAvatar engineId={id} meJid={engineStates[id]?.connected ? engineStates[id]?.me : undefined} number={a.number} name={a.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold" style={{ color: "#e9edef" }}>{a.number}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: "#8a949b" }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.pulse ? "animate-pulse" : ""}`} style={{ background: st.color }} />
                  {st.text}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold" style={{ color: "#00d19f" }}>
                <ShieldCheck size={13} /> Chats
              </span>
            </Link>
            <div className="mt-4 flex gap-2">
              {a.unlinked ? (
                <button onClick={() => relink(a)} disabled={busyId === a.id} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-medium transition hover:bg-white/10 disabled:opacity-50" style={{ color: "#00d19f", border: "1px solid rgba(0,168,132,0.4)" }}>
                  <PlugZap size={14} /> Relink
                </button>
              ) : (
                <button onClick={() => setPendingAction({ kind: "unlink", account: a })} disabled={busyId === a.id} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-medium transition hover:bg-white/10 disabled:opacity-50" style={{ color: "#aebac1", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <Unplug size={14} /> {busyId === a.id ? "Working…" : "Unlink"}
                </button>
              )}
              <button onClick={() => setPendingAction({ kind: "delete", account: a })} disabled={busyId === a.id} aria-label={`Delete ${a.number}`} title="Delete (wipes session)" className="flex items-center justify-center rounded-xl px-3.5 py-2.5 transition hover:bg-white/10 disabled:opacity-50" style={{ color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          );
        })}

        {/* Add card */}
        <button
          onClick={openPickerForNew}
          className="group flex min-h-[172px] flex-col items-center justify-center gap-3 rounded-2xl transition hover:bg-white/[0.04]"
          style={{ border: "1px dashed rgba(255,255,255,0.18)" }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full transition group-hover:scale-105" style={{ background: "#00a884", color: "#04241d" }}>
            <Plus size={22} strokeWidth={2.5} />
          </span>
          <span className="text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>Link account</span>
          <span className="text-[12px]" style={{ color: "#636c73" }}>Scan QR to connect</span>
        </button>
      </div>

      {/* Link sheet */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={closeSheet}>
          <div className="max-h-[92dvh] w-full max-w-[400px] overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold" style={{ color: "#e9edef" }}>Link WhatsApp</h2>
              <button onClick={closeSheet} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-white/10" style={{ color: "#636c73" }}><X size={17} /></button>
            </div>

            <label className="mt-4 block text-[12px] font-medium" style={{ color: "#8a949b" }}>
              Device name
              <input
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setRelinkTarget(null); }}
                placeholder="shop-…"
                className="mt-1.5 w-full rounded-xl px-3.5 text-[13.5px] outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 44 }}
              />
              <span className="mt-1 block text-[11.5px]" style={{ color: "#636c73" }}>
                Auto-generated and unique — rename it if you like. Each number needs its own name.
              </span>
            </label>

            {/* QR ⇄ code switch — codes are for the same phone (no camera scan). */}
            {phase !== "connected" && (
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)" }}>
                {(
                  [
                    ["qr", "Scan QR", QrCode],
                    ["code", "Use code", KeyRound],
                  ] as const
                ).map(([m, label, Icon]) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition active:scale-[0.98]"
                    style={linkMode === m ? { background: "rgba(0,168,132,0.16)", color: "#00d19f" } : { color: "#8a949b" }}
                  >
                    <Icon size={15} strokeWidth={2} /> {label}
                  </button>
                ))}
              </div>
            )}
            {phase !== "connected" && linkMode === "code" && (
              <p className="mt-2.5 rounded-xl p-3 text-center text-[12px] leading-snug" style={{ background: "rgba(0,168,132,0.07)", color: "#aebac1", border: "1px solid rgba(0,168,132,0.22)" }}>
                Same phone as WhatsApp? Stay on this tab — a QR can&apos;t be scanned from its own screen.
              </p>
            )}

            <div className="mt-4 flex flex-col items-center">
              {phase === "connected" ? (
                <div className="flex w-full flex-col items-center rounded-2xl py-8" style={{ background: "rgba(0,168,132,0.08)", border: "1px solid rgba(0,168,132,0.35)" }}>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#00a884", color: "#04241d" }}><Check size={28} strokeWidth={3} /></span>
                  <p className="mt-3 text-[14px] font-semibold" style={{ color: "#e9edef" }}>Device connected</p>
                  <p className="mt-1 text-[12px]" style={{ color: "#8a949b" }}>Your agent is now answering this number.</p>
                </div>
              ) : linkMode === "code" ? (
                <>
                  <label className="block w-full text-[12px] font-medium" style={{ color: "#8a949b" }}>
                    WhatsApp number
                    <span className="mt-1.5 flex gap-2">
                      <select
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        aria-label="Country code"
                        className="shrink-0 rounded-xl px-2.5 text-[14px] font-semibold outline-none"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 48, maxWidth: 128 }}
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.cc} value={c.cc} style={{ background: "#111b21" }}>+{c.cc} · {c.label.split(" +")[0]}</option>
                        ))}
                      </select>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))}
                        placeholder="801 234 5678"
                        inputMode="tel"
                        autoComplete="tel"
                        className="min-w-0 flex-1 rounded-xl px-3.5 text-[15px] outline-none"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 48 }}
                      />
                    </span>
                  </label>
                  {phone.replace(/\D/g, "") && (
                    <p className="mt-1.5 w-full truncate text-center font-mono text-[12px]" style={{ color: "#00d19f" }}>
                      Will link: +{normalizePhone(cc, phone).replace(new RegExp(`^${cc}`), `${cc} `)}
                    </p>
                  )}
                  {pairCode ? (
                    <button
                      onClick={copyCode}
                      title="Tap to copy"
                      className="mt-3.5 flex w-full items-center justify-center gap-2.5 rounded-2xl py-5 transition active:scale-[0.99]"
                      style={{ background: "rgba(0,168,132,0.08)", border: "1px dashed rgba(0,168,132,0.5)" }}
                    >
                      <span className="font-mono text-[30px] font-bold tracking-[0.18em]" style={{ color: "#00d19f" }}>
                        {pairCode.includes("-") || pairCode.length !== 8 ? pairCode : `${pairCode.slice(0, 4)}–${pairCode.slice(4)}`}
                      </span>
                      {copied ? <Check size={17} strokeWidth={2.5} style={{ color: "#00d19f" }} /> : <Copy size={17} style={{ color: "#636c73" }} />}
                    </button>
                  ) : (
                    <div className="mt-3.5 flex w-full items-center justify-center rounded-2xl bg-white/5" style={{ minHeight: 118, border: "1px dashed rgba(255,255,255,0.15)" }}>
                      <p className="px-8 text-center text-[12.5px]" style={{ color: "#636c73" }}>
                        {pairBusy ? "Asking WhatsApp for your code…" : "Enter your number above, then tap Get code."}
                      </p>
                    </div>
                  )}

                  {pairError && <p className="mt-2.5 text-center text-[12px]" style={{ color: "#e66a6a" }}>{pairError}</p>}
                  {actionError && <p className="mt-2.5 text-center text-[12px]" style={{ color: "#e66a6a" }}>{actionError}</p>}
                  {pairCode && !pairError && <p className="mt-2.5 text-[11.5px]" style={{ color: "#636c73" }}>Type it into WhatsApp now — codes expire fast, request a new one if rejected</p>}

                  <Steps items={CODE_STEPS} />
                </>
              ) : (
                <>
                  {qr ? (
                    <div className="rounded-2xl bg-white p-3">
                      <QRCode value={qr} size={216} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center rounded-2xl bg-white/5" style={{ width: 240, height: 240, border: "1px dashed rgba(255,255,255,0.15)" }}>
                      <p className="px-8 text-center text-[12.5px]" style={{ color: "#636c73" }}>
                        {phase === "starting" ? "Starting engine…" : phase === "error" ? "Something went wrong." : "Press Start, then scan the code with WhatsApp."}
                      </p>
                    </div>
                  )}

                  {error && <p className="mt-2.5 text-center text-[12px]" style={{ color: "#e66a6a" }}>{error}</p>}
                  {actionError && <p className="mt-2.5 text-center text-[12px]" style={{ color: "#e66a6a" }}>{actionError}</p>}
                  {phase === "qr" && !error && <p className="mt-2.5 text-[11.5px]" style={{ color: "#636c73" }}>Code refreshes automatically — keep this open</p>}

                  <Steps items={QR_STEPS} />
                </>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {phase === "connected" ? (
                <button onClick={confirmLinked} disabled={confirmBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                  {confirmBusy ? "Saving…" : <>Done <ArrowRight size={16} strokeWidth={2.5} /></>}
                </button>
              ) : linkMode === "code" ? (
                <>
                  {pairCode ? (
                    <>
                      <button onClick={confirmLinked} disabled={confirmBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                        {confirmBusy ? "Saving…" : <>I&apos;ve entered the code <ArrowRight size={16} strokeWidth={2.5} /></>}
                      </button>
                      <button onClick={requestPairCode} disabled={pairBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[13px] font-medium transition active:bg-white/10 disabled:opacity-50" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#aebac1" }}>
                        <RefreshCw size={14} className={pairBusy ? "animate-spin" : ""} /> {pairBusy ? "Getting code…" : "New code"}
                      </button>
                    </>
                  ) : (
                    <button onClick={requestPairCode} disabled={pairBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                      <KeyRound size={16} strokeWidth={2.5} /> {pairBusy ? "Getting code…" : "Get code"}
                    </button>
                  )}
                </>
              ) : phase === "idle" || phase === "error" ? (
                <button onClick={startLinking} disabled={startBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                  <QrCode size={16} strokeWidth={2.5} /> {startBusy ? "Starting…" : "Start linking"}
                </button>
              ) : (
                <>
                  <button onClick={confirmLinked} disabled={confirmBusy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                    {confirmBusy ? "Saving…" : <>I&apos;ve scanned the code <ArrowRight size={16} strokeWidth={2.5} /></>}
                  </button>
                  <button onClick={startLinking} disabled={startBusy} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-[13px] font-medium transition active:bg-white/10 disabled:opacity-50" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#aebac1" }}>
                    <RefreshCw size={14} className={startBusy ? "animate-spin" : ""} /> {startBusy ? "Starting…" : "Refresh code"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* First-run setup for a freshly linked line: real contacts + groups with checkboxes */}
      {freshLinked && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-[440px] flex-col rounded-t-3xl p-6 sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "#00a884", color: "#04241d" }}>
                <Check size={22} strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[16px] font-semibold" style={{ color: "#e9edef" }}>{freshLinked} linked</h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "#8a949b" }}>Tick who can reach her on this line.</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)" }}>
              {(
                [
                  ["open", "Everyone", "Blocked chats are dropped"],
                  ["exclusive", "Invite only", "Only allowed chats reply"],
                ] as const
              ).map(([m, label, desc]) => (
                <button
                  key={m}
                  onClick={() => freshSetMode(m)}
                  className="rounded-lg px-3 py-2.5 text-left transition"
                  style={freshMode === m ? { background: "rgba(255,255,255,0.09)" } : undefined}
                >
                  <span className="block text-[13px] font-semibold" style={{ color: freshMode === m ? "#fff" : "#8a949b" }}>{label}</span>
                  <span className="block text-[11px]" style={{ color: "#636c73" }}>{desc}</span>
                </button>
              ))}
            </div>

            <input
              value={freshFilter}
              onChange={(e) => setFreshFilter(e.target.value)}
              placeholder="Search contacts & groups…"
              className="mt-3 w-full rounded-xl px-3.5 text-[13px] outline-none placeholder:text-[#4a545b]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 40 }}
            />

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {freshLoading ? (
                <p className="py-6 text-center text-[12.5px]" style={{ color: "#636c73" }}>Loading contacts…</p>
              ) : freshAgentDown ? (
                <p className="rounded-xl p-3 text-[12px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
                  Agent is offline — the roster will appear here once it&apos;s back on :3001. Your mode choice above is already saved.
                </p>
              ) : (() => {
                const fq = freshFilter.trim().toLowerCase();
                const ruleByJid = new Map(freshRules.map((r) => [r.jid, r]));
                const seen = new Set(freshChats.map((c) => c.jid));
                const all = [
                  ...freshChats.map((c) => ({ ...c, rule: ruleByJid.get(c.jid) ?? null })),
                  ...freshRules.filter((r) => !seen.has(r.jid)).map((r) => ({ jid: r.jid, name: r.name, rule: r as { list: "black" | "white" } })),
                ].filter((r) => !fq || (r.name ?? "").toLowerCase().includes(fq) || (r.jid ?? "").split("@")[0].includes(fq));
                if (all.length === 0) {
                  return (
                    <p className="py-4 text-center text-[12.5px]" style={{ color: "#636c73" }}>
                      No contacts yet — the full roster loads when the line connects, and one-to-one chats appear after their first message.
                    </p>
                  );
                }
                return (
                  <ContactAccessTable
                    rows={all.map((row) => ({
                      jid: row.jid,
                      name: row.name,
                      sub: (row.jid ?? "").split("@")[0],
                      imgUrl: (row as { imgUrl?: string | null }).imgUrl ?? null,
                      badge: row.jid.endsWith("@g.us") ? "Group" : undefined,
                      rule: row.rule,
                    }))}
                    pendingJid={freshPending}
                    onToggle={(tRow, list) => {
                      const full = all.find((r) => r.jid === tRow.jid);
                      if (full) freshSetRule(full, list);
                    }}
                    emptyText="No contacts match that search."
                  />
                );
              })()}
            </div>

            <div className="mt-4 flex gap-2.5">
              <button
                onClick={closeFresh}
                className="flex-1 rounded-xl text-[13px] font-medium transition hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#aebac1", height: 44 }}
              >
                Done
              </button>
              <button
                onClick={manageFresh}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold"
                style={{ background: "#00a884", color: "#04241d", height: 44 }}
              >
                Manage chats <ArrowRight size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.kind === "delete" ? `Delete ${pendingAction?.account.number}?` : "Unlink this number?"}
        description={
          pendingAction?.kind === "delete"
            ? "This stops the session, wipes its login, and removes the record. Linking again will need a fresh QR scan."
            : "The record stays and you can relink without scanning again. The session just stops answering."
        }
        confirmLabel={pendingAction?.kind === "delete" ? "Delete" : "Unlink"}
        danger={pendingAction?.kind === "delete"}
        icon={pendingAction?.kind === "delete" ? Trash2 : Unplug}
        busy={busyId !== null}
        onCancel={() => (busyId === null ? setPendingAction(null) : undefined)}
        onConfirm={() => {
          if (!pendingAction || busyId !== null) return;
          if (pendingAction.kind === "delete") void removeAccount(pendingAction.account);
          else void unlink(pendingAction.account);
        }}
      />
    </div>
  );
}
