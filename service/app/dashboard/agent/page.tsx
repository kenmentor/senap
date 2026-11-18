"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserRound, Bot, Sparkles, CaseSensitive, Save, Clock3, Plus, ArrowLeft, Check, Hand, Tag, BellOff, AlertTriangle, Languages, Moon, ShieldCheck, Package, Briefcase, HeartHandshake, Truck, Send, ChevronLeft, ChevronRight, Zap, type LucideIcon } from "lucide-react";
import ChatAccess from "./chat-access";

const EX_CUSTOMER_DEFAULT = "Do you still have the Tecno Spark 20?";
const EX_REPLY_DEFAULT = "Yes — 12 left at ₦155,000 each! How many should I reserve for you?";

type Snippet = { label: string; text: string; keywords: string[]; icon: LucideIcon; target: "acts" | "never" };

const SNIPPETS: Snippet[] = [
  { label: "Greeting", text: "Greet every customer warmly, using their name when you know it.", keywords: ["hello", "hi", "greet", "welcome"], icon: Hand, target: "acts" },
  { label: "Intro", text: "Introduce yourself by name and role at the start of new chats.", keywords: ["introduce", "name", "who", "start"], icon: UserRound, target: "acts" },
  { label: "Confirm price", text: "Always confirm the total price, including delivery, before taking an order.", keywords: ["price", "cost", "total", "payment", "delivery"], icon: Tag, target: "acts" },
  { label: "Add-on", text: "Suggest one relevant add-on per order, then stop — never push.", keywords: ["upsell", "suggest", "addon", "recommend"], icon: Plus, target: "acts" },
  { label: "Language", text: "Reply in the customer's language — English, Pidgin, Yoruba, Hausa or Igbo.", keywords: ["language", "pidgin", "yoruba", "hausa", "igbo"], icon: Languages, target: "acts" },
  { label: "After hours", text: "Outside working hours, promise a reply first thing in the morning.", keywords: ["hour", "closed", "night", "offline", "morning"], icon: Moon, target: "acts" },
  { label: "Stock truth", text: "Never invent stock — only quote what the inventory says.", keywords: ["stock", "inventory", "left", "available"], icon: Package, target: "never" },
  { label: "Approval", text: "Hold promotions, discounts and reports for owner approval — never publish alone.", keywords: ["promo", "approv", "publish", "report", "discount"], icon: ShieldCheck, target: "never" },
  { label: "Opt-out", text: "Never message customers who opted out of broadcasts.", keywords: ["opt", "broadcast", "spam", "message"], icon: BellOff, target: "never" },
  { label: "Escalate", text: "Escalate angry or confused customers to the owner immediately.", keywords: ["angry", "complaint", "escalat", "confused", "owner"], icon: AlertTriangle, target: "never" }
];

const CHECKS: { id: string; hint: string; test: (p: string) => boolean }[] = [
  { id: "length", hint: "more detail", test: (p) => p.trim().length >= 120 },
  { id: "greeting", hint: "a greeting rule", test: (p) => /(greet|welcome|hello)/i.test(p) },
  { id: "stock", hint: "stock rule", test: (p) => /(stock|inventory)/i.test(p) },
  { id: "price", hint: "a price rule", test: (p) => /(price|total|₦|naira)/i.test(p) },
  { id: "approval", hint: "an approval rule", test: (p) => /(approv|confirm|ask)/i.test(p) },
  { id: "boundary", hint: "a never/escalation rule", test: (p) => /(never|must not|escalat|opt)/i.test(p) }
];

function strengthLabel(score: number, total: number): { label: string; color: string } {
  const r = score / total;
  if (r >= 1) return { label: "Excellent", color: "#00a884" };
  if (r >= 0.66) return { label: "Strong", color: "#00a884" };
  if (r >= 0.4) return { label: "Fair", color: "#e8b45b" };
  return { label: "Weak", color: "#e66a6a" };
}

type Employee = { id: string; name: string; role: string; vibe: string; acts: string; never: string; greeting: string; personality: string; avatar: string; photo: string; color: string; ink: string; icon: LucideIcon };

/** Reliable Nigerian portraits — pure inline SVG, zero network (replaces randomuser photos). */
function Portrait({ id, size = 48 }: { id: string; size?: number }) {
  const key = (id || "blank").toLowerCase();
  const skin = key === "ade" || key === "tunde" ? "#5a3a22" : key === "zara" ? "#6b4423" : key === "blank" ? "#8a949b" : "#7a4b2a";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <rect width="64" height="64" fill="#0e151a" />
      <circle cx="32" cy="26" r="22" fill="#00a884" opacity="0.12" />
      {key === "amaka" && (
        <g>
          <path d="M14 26 Q12 8 32 8 Q52 8 50 26 L46 26 Q48 12 32 12 Q16 12 18 26 Z" fill="#101010" />
          <circle cx="18" cy="30" r="3" fill="#101010" />
          <circle cx="46" cy="30" r="3" fill="#101010" />
          <rect x="26" y="44" width="12" height="10" rx="4" fill={skin} />
          <path d="M12 64 Q14 50 32 50 Q50 50 52 64 Z" fill="#00a884" />
          <ellipse cx="32" cy="32" rx="14" ry="16" fill={skin} />
          <path d="M25 38 Q32 44 39 38" stroke="#2b1a10" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="26" cy="31" r="1.8" fill="#1a0f08" />
          <circle cx="38" cy="31" r="1.8" fill="#1a0f08" />
          <circle cx="18.5" cy="36" r="1.6" fill="#e8b45b" />
          <circle cx="45.5" cy="36" r="1.6" fill="#e8b45b" />
        </g>
      )}
      {key === "zara" && (
        <g>
          <path d="M12 26 Q14 6 32 6 Q50 6 52 26 L48 28 Q46 14 32 14 Q18 14 16 28 Z" fill="#e0569b" />
          <circle cx="24" cy="14" r="2.4" fill="#ffd166" />
          <circle cx="34" cy="11" r="2" fill="#00a884" />
          <circle cx="42" cy="16" r="2.2" fill="#ffd166" />
          <rect x="26" y="44" width="12" height="10" rx="4" fill={skin} />
          <path d="M12 64 Q14 50 32 50 Q50 50 52 64 Z" fill="#e0569b" />
          <ellipse cx="32" cy="33" rx="14" ry="15" fill={skin} />
          <path d="M24 39 Q32 47 40 39" stroke="#2b1a10" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <circle cx="26" cy="31" r="1.8" fill="#1a0f08" />
          <circle cx="38" cy="31" r="1.8" fill="#1a0f08" />
          <circle cx="18.5" cy="37" r="2" fill="none" stroke="#ffd166" strokeWidth="1.4" />
          <circle cx="45.5" cy="37" r="2" fill="none" stroke="#ffd166" strokeWidth="1.4" />
        </g>
      )}
      {key === "ade" && (
        <g>
          <path d="M18 26 Q18 12 32 12 Q46 12 46 26 L44 24 Q42 15 32 15 Q22 15 20 24 Z" fill="#101010" />
          <rect x="26" y="44" width="12" height="10" rx="4" fill={skin} />
          <path d="M12 64 Q14 50 32 50 Q50 50 52 64 Z" fill="#4285f4" />
          <rect x="28" y="50" width="8" height="14" fill="#fff" opacity="0.9" />
          <ellipse cx="32" cy="32" rx="13" ry="15" fill={skin} />
          <rect x="21" y="28" width="9" height="7" rx="2" fill="none" stroke="#111b21" strokeWidth="1.8" />
          <rect x="34" y="28" width="9" height="7" rx="2" fill="none" stroke="#111b21" strokeWidth="1.8" />
          <path d="M30 31 L34 31" stroke="#111b21" strokeWidth="1.8" />
          <circle cx="25.5" cy="31.5" r="1.4" fill="#1a0f08" />
          <circle cx="38.5" cy="31.5" r="1.4" fill="#1a0f08" />
          <path d="M27 40 Q32 38.5 37 40" stroke="#101010" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </g>
      )}
      {key === "nkechi" && (
        <g>
          <path d="M10 28 Q12 4 32 4 Q52 4 54 28 L50 30 Q48 12 32 12 Q16 12 14 30 Z" fill="#e8a33d" />
          <path d="M20 10 Q32 6 44 10" stroke="#b8741f" strokeWidth="2" fill="none" strokeLinecap="round" />
          <rect x="26" y="44" width="12" height="10" rx="4" fill={skin} />
          <path d="M12 64 Q14 50 32 50 Q50 50 52 64 Z" fill="#e8a33d" />
          <ellipse cx="32" cy="33" rx="13.5" ry="14.5" fill={skin} />
          <circle cx="26.5" cy="32" r="1.6" fill="#1a0f08" />
          <circle cx="37.5" cy="32" r="1.6" fill="#1a0f08" />
          <path d="M25 39 Q32 45 39 39" stroke="#2b1a10" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="19" cy="37" r="1.8" fill="#ffd166" />
          <circle cx="45" cy="37" r="1.8" fill="#ffd166" />
        </g>
      )}
      {key === "tunde" && (
        <g>
          <path d="M14 24 Q16 10 32 10 Q48 10 50 24 L52 26 L12 26 Z" fill="#22b8cf" />
          <rect x="12" y="24" width="40" height="3" rx="1.5" fill="#1899ad" />
          <rect x="26" y="44" width="12" height="10" rx="4" fill={skin} />
          <path d="M12 64 Q14 50 32 50 Q50 50 52 64 Z" fill="#22b8cf" />
          <ellipse cx="32" cy="33" rx="13" ry="14.5" fill={skin} />
          <circle cx="26.5" cy="32" r="1.7" fill="#1a0f08" />
          <circle cx="37.5" cy="32" r="1.7" fill="#1a0f08" />
          <path d="M26 40 Q32 43 38 40" stroke="#2b1a10" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      )}
      {(key === "blank" || !["amaka", "zara", "ade", "nkechi", "tunde"].includes(key)) && (
        <g>
          <ellipse cx="32" cy="32" rx="13" ry="14" fill="#2a3942" />
          <circle cx="27" cy="31" r="1.8" fill="#e9edef" />
          <circle cx="37" cy="31" r="1.8" fill="#e9edef" />
          <path d="M26 39 Q32 43 38 39" stroke="#8a949b" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      )}
    </svg>
  );
}

const EMPLOYEES: Employee[] = [
  { id: "amaka", name: "Amaka", role: "Sales closer", vibe: "Warm, sharp, always closing.", personality: "friendly", avatar: "portrait", photo: "", color: "#00a884", ink: "#04241d", icon: UserRound,
    greeting: "Hello, welcome to Nala Phones! 💚 How can I help you today?",
    acts: `You are Amaka, the sales assistant for Nala Phones. Greet every customer warmly. Always check live stock before quoting, and confirm price before taking an order.`,
    never: "Never invent stock. Hold promotions and reports for owner approval." },
  { id: "zara", name: "Zara", role: "Hype marketer", vibe: "Energy, emojis, urgency.", personality: "playful", avatar: "portrait", photo: "", color: "#e0569b", ink: "#ffffff", icon: Sparkles,
    greeting: "Heeey! 🔥 Zara here — today's deals are HOT. What are we shopping for?",
      acts: `You are Zara, the hype marketer for Nala Phones. Bring energy and urgency to every chat. Push today's deal hard but stay honest — only quote live stock.`,
    never: "Never invent discounts. Get owner approval before publishing any promo." },
  { id: "ade", name: "Mr Ade", role: "Strict cashier", vibe: "Precise. No credit, no stories.", personality: "professional", avatar: "portrait", photo: "", color: "#4285f4", ink: "#ffffff", icon: Briefcase,
    greeting: "Good day. This is Mr Ade, Nala Phones cashier. How may I assist you?",
    acts: `You are Mr Ade, the cashier for Nala Phones. Be precise and formal. Confirm every amount twice. Issue a receipt note for every payment.`,
    never: "No credit and no discounts without owner approval." },
  { id: "nkechi", name: "Mama Nkechi", role: "Customer care", vibe: "Family treatment, fast fixes.", personality: "friendly", avatar: "portrait", photo: "", color: "#e8a33d", ink: "#04241d", icon: HeartHandshake,
    greeting: "Welcome, my dear! Mama Nkechi here — tell me what you need and consider it handled. 💛",
      acts: `You are Nkechi, customer care for Nala Phones. Treat every customer like family. Listen first, solve fast.`,
    never: "Never argue with a customer. Escalate complaints to the owner with full context." },
  { id: "tunde", name: "Tunde", role: "Delivery lead", vibe: "Short replies, on-time drops.", personality: "concise", avatar: "portrait", photo: "", color: "#22b8cf", ink: "#04241d", icon: Truck,
    greeting: "Tunde here. Send your address + what you need. Fast dispatch.",
      acts: `You are Tunde, delivery coordinator for Nala Phones. Keep replies short. Confirm address, phone number and delivery window for every order.`,
    never: "Never promise a delivery time you can't meet. Flag failed deliveries to the owner immediately." },
  { id: "blank", name: "Blank canvas", role: "Build from scratch", vibe: "Your words, your rules.", personality: "friendly", avatar: "initials", photo: "", color: "#2a3942", ink: "#e9edef", icon: CaseSensitive, greeting: "Hello! How can I help you today?", acts: "", never: "" }
];

const AVATARS = [
  { id: "portrait", label: "Portrait", icon: UserRound },
  { id: "employee", label: "Employee", icon: UserRound },
  { id: "bot", label: "Assistant", icon: Bot },
  { id: "spark", label: "Spark", icon: Sparkles },
  { id: "initials", label: "Initials", icon: CaseSensitive }
] as const;

const PERSONALITIES: { id: string; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "professional", label: "Professional", desc: "Polite and precise.", icon: Briefcase },
  { id: "friendly", label: "Friendly", desc: "Warm, like a great shopkeeper.", icon: HeartHandshake },
  { id: "playful", label: "Playful", desc: "Light banter, still helpful.", icon: Sparkles },
  { id: "concise", label: "Concise", desc: "Short replies, facts only.", icon: Zap },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const card = {
  border: "1px solid rgba(255,255,255,0.09)",
  background: "transparent",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)"
} as const;
const field = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef" } as const;

type Msg = { id: number; from: "me" | "her" | "typing"; text: string };

function voiceWrap(text: string, personality: string): string {
  if (personality === "concise") {
    const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
    return first.length < text.length ? first : text;
  }
  if (personality === "playful" && !/[😀🎉🔥]$/.test(text)) return `${text} 🔥`;
  if (personality === "friendly" && !/[😊🎉👋?]$/.test(text)) return `${text} 😊`;
  return text;
}

export default function AgentPage() {
  const [index, setIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [empId, setEmpId] = useState("amaka");
  const [activeId, setActiveId] = useState("amaka");
  const [name, setName] = useState(EMPLOYEES[0].name);
  const [role, setRole] = useState(EMPLOYEES[0].role);
  const [avatar, setAvatar] = useState<string>("portrait");
  const [photo, setPhoto] = useState("");
  const [avatarColor, setAvatarColor] = useState(EMPLOYEES[0].color);
  const [avatarInk, setAvatarInk] = useState(EMPLOYEES[0].ink);
  const [acts, setActs] = useState(EMPLOYEES[0].acts);
  const [neverDo, setNeverDo] = useState(EMPLOYEES[0].never);
  const [greeting, setGreeting] = useState(EMPLOYEES[0].greeting);
  const [exCustomer, setExCustomer] = useState(EX_CUSTOMER_DEFAULT);
  const [exReply, setExReply] = useState(EX_REPLY_DEFAULT);
  const [personality, setPersonality] = useState<string>(EMPLOYEES[0].personality);
  const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [open, setOpen] = useState("08:00");
  const [close, setClose] = useState("21:00");
  const [toast, setToast] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState<Record<string, boolean>>({});
  const [activeBox, setActiveBox] = useState<"acts" | "never">("acts");
  const [agentAccounts, setAgentAccounts] = useState<{ id: string; number: string; engineId?: string }[]>([]);
  const [agentAccount, setAgentAccount] = useState("");
  const [lineAvatars, setLineAvatars] = useState<Record<string, string | null>>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const neverRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchX = useRef<number | null>(null);

  /* Live example Q&A from the first real product (only while untouched) */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) return;
        const items: { name: string; quantity: number; unitPrice: number }[] = await res.json();
        const first = items[0];
        if (!first) return;
        const price = `₦${Number(first.unitPrice).toLocaleString("en-NG")}`;
        setExCustomer((v) => (v === EX_CUSTOMER_DEFAULT ? `Do you still have the ${first.name}?` : v));
        setExReply((v) =>
          v === EX_REPLY_DEFAULT
            ? `Yes — ${first.quantity} left at ${price} each! How many should I reserve for you?`
            : v,
        );
      } catch {
        /* keep generic examples */
      }
    })();
  }, []);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  /* Live example Q&A from the first real product (only while untouched) */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) return;
        const items: { name: string; quantity: number; unitPrice: number }[] = await res.json();
        const first = items[0];
        if (!first) return;
        const price = `₦${Number(first.unitPrice).toLocaleString("en-NG")}`;
        setExCustomer((v) => (v === EX_CUSTOMER_DEFAULT ? `Do you still have the ${first.name}?` : v));
        setExReply((v) =>
          v === EX_REPLY_DEFAULT
            ? `Yes — ${first.quantity} left at ${price} each! How many should I reserve for you?`
            : v,
        );
      } catch {
        /* keep generic examples */
      }
    })();
  }, []);

  /* Linked lines + per-number agent config (?account= deep link from /dashboard/link) */
  const applyConfig = (c: {
    empId?: string; activeEmp?: string; name?: string; role?: string; avatar?: string; photo?: string;
    avatarColor?: string; avatarInk?: string; personality?: string; greeting?: string; acts?: string;
    neverDo?: string; exCustomer?: string; exReply?: string; days?: string[]; open?: string; close?: string;
  }) => {
    // Coerce: server/DB can hand back nulls for any of these — one null must
    // never poison state and crash the page later.
    const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
    if (str(c.empId)) {
      setEmpId(c.empId as string);
      const i = EMPLOYEES.findIndex((e) => e.id === c.empId);
      if (i >= 0) setIndex(i);
    }
    if (str(c.activeEmp)) setActiveId(c.activeEmp as string);
    if (c.name !== undefined) setName(str(c.name));
    if (c.role !== undefined) setRole(str(c.role));
    // Legacy randomuser photos are retired — coerce to the built-in portrait.
    if (c.photo !== undefined && typeof c.photo === "string" && c.photo.includes("randomuser.me")) {
      setAvatar("portrait");
      setPhoto("");
    } else {
      if (str(c.avatar)) setAvatar(c.avatar as string);
      if (c.photo !== undefined) setPhoto(str(c.photo));
    }
    if (str(c.avatarColor)) setAvatarColor(c.avatarColor as string);
    if (str(c.avatarInk)) setAvatarInk(c.avatarInk as string);
    if (str(c.personality)) setPersonality(c.personality as string);
    if (c.greeting !== undefined) setGreeting(str(c.greeting));
    if (c.acts !== undefined) setActs(str(c.acts));
    if (c.neverDo !== undefined) setNeverDo(str(c.neverDo));
    if (c.exCustomer !== undefined) setExCustomer(str(c.exCustomer));
    if (c.exReply !== undefined) setExReply(str(c.exReply));
    if (Array.isArray(c.days) && c.days.length) setDays(c.days.filter((d) => typeof d === "string"));
    if (str(c.open)) setOpen(c.open as string);
    if (str(c.close)) setClose(c.close as string);
  };

  useEffect(() => {
    (async () => {
      let picked = "";
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) {
          const list: { id: string; number: string; engineId?: string }[] = await res.json();
          setAgentAccounts(list);
          let requested = "";
          try {
            requested = new URLSearchParams(window.location.search).get("account")?.trim() ?? "";
          } catch {
            requested = "";
          }
          const wanted = requested ? list.find((a) => (a.engineId ?? a.number) === requested) : undefined;
          picked = (wanted ?? list[0]) ? ((wanted ?? list[0]).engineId ?? (wanted ?? list[0]).number) : "";
          if (picked) setAgentAccount(picked);
        }
      } catch {
        /* offline — keep local defaults */
      }
      /* Load this number's agent (falls back to shared defaults on first run) */
      try {
        const res = await fetch(`/api/agent${picked ? `?userId=${encodeURIComponent(picked)}` : ""}`);
        if (!res.ok) return;
        applyConfig(await res.json());
      } catch {
        /* offline — keep local defaults */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (detailOpen && messages.length === 0) {
      setMessages([{ id: 0, from: "her", text: greeting }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOpen]);

  useEffect(() => {
    if (agentAccounts.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        agentAccounts.map(async (a) => {
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
      if (!cancelled) setLineAvatars(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [agentAccounts]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, detailOpen]);

  /* Arrow-key carousel */
  useEffect(() => {
    if (detailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % EMPLOYEES.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + EMPLOYEES.length) % EMPLOYEES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

  /* Keep the active thumb in view */
  useEffect(() => {
    stripRef.current?.querySelector(`[data-thumb="${index}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + EMPLOYEES.length) % EMPLOYEES.length);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const loadEmp = (e: Employee) => {
    setEmpId(e.id);
    if (e.id === "blank") return;
    setName(e.name);
    setRole(e.role);
    // Built-in Nigerian portrait — the agent assumes this look everywhere.
    setAvatar("portrait");
    setPhoto("");
    setAvatarColor(e.color);
    setAvatarInk(e.ink);
    setPersonality(e.personality);
    setGreeting(e.greeting);
    setActs(e.acts);
    setNeverDo(e.never);
    setMessages([]);
  };

  const useAgent = async (e: Employee) => {
    loadEmp(e);
    setActiveId(e.id);
    if (e.id === "blank") {
      flash("Blank canvas — build from scratch.");
      return;
    }
    flash(`${e.name} is now answering${agentAccount ? ` on ${agentAccount}` : " customers"}.`);
    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: agentAccount || "default", activeEmp: e.id })
      });
      if (!res.ok) throw new Error("duty save failed");
    } catch {
      flash("On duty locally — couldn't reach MongoDB.");
    }
  };

  const openDetail = (e: Employee) => {
    loadEmp(e);
    setDetailOpen(true);
  };

  const setActiveText = (text: string) => (activeBox === "acts" ? setActs(text) : setNeverDo(text));
  const insertSnippet = (text: string) => {
    setActiveText((activeBox === "acts" ? acts : neverDo) === "" ? text : `${activeBox === "acts" ? acts : neverDo} ${text}`);
    requestAnimationFrame(() => (activeBox === "acts" ? promptRef : neverRef).current?.focus());
  };

  const activeText = activeBox === "acts" ? acts : neverDo;
  const suggestions = useMemo(() => {
    const words = activeText.slice(-60).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);
    if (words.length === 0) return [];
    const lowered = activeText.toLowerCase();
    return SNIPPETS.filter((s) => s.target === activeBox && !lowered.includes(s.text.slice(0, 24).toLowerCase()))
      .map((s) => ({ s, hit: s.keywords.filter((k) => words.some((w) => w.includes(k) || k.includes(w))).length }))
      .filter((x) => x.hit > 0)
      .sort((a, b) => b.hit - a.hit)
      .slice(0, 3)
      .map((x) => x.s);
  }, [activeText, activeBox]);

  const combined = `${acts} ${neverDo}`;
  const { score, missing } = useMemo(() => {
    const failed = CHECKS.filter((c) => !c.test(combined));
    return { score: CHECKS.length - failed.length, missing: failed.map((f) => f.hint) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combined]);
  const strength = strengthLabel(score, CHECKS.length);

  const save = async () => {
    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: agentAccount || "default", empId, activeEmp: activeId, name, role, avatar, photo, avatarColor, avatarInk, personality, greeting, acts, neverDo, exCustomer, exReply, days, open, close })
      });
      if (!res.ok) throw new Error("save failed");
      flash(`${name || "Agent"} updated${agentAccount ? ` — live on ${agentAccount}` : " — live on WhatsApp"}.`);
    } catch {
      flash("Couldn't save — is MongoDB running?");
    }
  };

  const flipDay = (d: string) =>
    setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));

  const AvatarIcon = (AVATARS.find((a) => a.id === avatar) ?? AVATARS[0]).icon;
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AG";
  const showPhoto = avatar === "photo" && photo !== "" && !photo.includes("randomuser.me");
  const showPortrait = avatar === "portrait";
  const portraitId = (EMPLOYEES.find((e) => e.id === empId)?.id ?? "blank") as string;
  const avatarOptions = photo !== "" && !photo.includes("randomuser.me") ? [{ id: "photo", label: "Photo", icon: UserRound }, ...AVATARS] : [...AVATARS];

  const faceImg = (extra = "") => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt={name || "Agent"}
      draggable={false}
      onError={() => setAvatar("initials")}
      className={`h-full w-full object-cover ${extra}`}
    />
  );

  const summary =
    days.length === 7 ? "Every day" :
    days.length === 0 ? "Off — replies paused" :
    `Active ${DAYS.filter((d) => days.includes(d)).join(", ")}`;

  const brainReply = (text: string): string => {
    const t = text.toLowerCase();
    if (/(^|\b)(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) return greeting;
    if (/price|cost|how much|₦/.test(t)) return `Let me check the live price for you — one moment.`;
    if (/stock|left|available|remain/.test(t)) return `Let me check live stock for you — one moment.`;
    if (/order|buy|want \d|deliver|take/.test(t)) return `Done — noted. I'll confirm the total including delivery before we finalize.`;
    if (/promo|discount|sale|deal/.test(t)) return `Something is cooking! Let me confirm with my manager and get right back to you.`;
    if (/thank/.test(t)) return `You're so welcome! Anything else I can help with?`;
    return `Got it — looking into that now. Meanwhile, anything else I can help with?`;
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages((m) => [...m, { id: msgId.current++, from: "me", text }]);
    setMessages((m) => [...m, { id: msgId.current++, from: "typing", text: "" }]);
    timer.current = setTimeout(() => {
      setMessages((m) => [...m.filter((x) => x.from !== "typing"), { id: msgId.current++, from: "her", text: voiceWrap(brainReply(text), personality) }]);
    }, 900);
  };

  if (!detailOpen) {
    const switchAccount = (id: string) => {
      setAgentAccount(id);
      try {
        const u = new URL(window.location.href);
        u.searchParams.set("account", id);
        window.history.replaceState(null, "", u.toString());
      } catch { /* ignore */ }
      (async () => {
        try {
          const res = await fetch(`/api/agent?userId=${encodeURIComponent(id)}`);
          if (res.ok) applyConfig(await res.json());
        } catch { /* keep current */ }
      })();
    };
    return (
      <div className="mx-auto w-full max-w-[640px] rounded-3xl px-4 py-4 sm:px-5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Pick your employee</h2>
          <p className="text-[12px]" style={{ color: "#636c73" }}>
            {agentAccount ? <>Answering on <span style={{ color: "#00d19f" }}>{agentAccount}</span></> : "One answers at a time"}
          </p>
        </div>
        {agentAccounts.length > 1 && (
          <div className="mt-3 flex items-center gap-3 px-1">
            <div className="flex items-center" style={{ gap: 0 }}>
              {agentAccounts.slice(0, 2).map((a, idx) => {
                const id = a.engineId ?? a.number;
                const active = id === agentAccount;
                const initials = (a.number || "?").replace(/\D/g, "").slice(-2) || "•";
                const img = lineAvatars[id];
                return (
                  <button
                    key={a.id}
                    onClick={() => switchAccount(id)}
                    title={a.number}
                    aria-label={`Answer on ${a.number}`}
                    className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold transition"
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
              {agentAccounts.length > 2 && (
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#8a949b", border: "2px solid rgba(255,255,255,0.12)", marginLeft: -10 }}
                >
                  +{agentAccounts.length - 2}
                </span>
              )}
            </div>
            <span className="truncate text-[12px]" style={{ color: "#8a949b" }}>
              {agentAccounts.find((a) => (a.engineId ?? a.number) === agentAccount)?.number ?? ""}
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-col divide-y divide-white/10" style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {EMPLOYEES.map((e) => {
            const EI = e.icon;
            const isActive = activeId === e.id;
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-4">
                <button
                  onClick={() => openDetail(e)}
                  aria-label={`Configure ${e.name}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[16px] font-bold" style={{ background: e.color, color: e.ink, border: "2px solid rgba(255,255,255,0.14)" }}>
                    {e.id === "blank" ? (
                      <EI size={22} strokeWidth={1.75} />
                    ) : (
                      <Portrait id={e.id} size={48} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold" style={{ color: "#e9edef" }}>{e.name}</span>
                      {isActive && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "rgba(0,168,132,0.16)", color: "#00d19f", letterSpacing: "0.06em" }}>
                          <span className="h-1 w-1 animate-pulse rounded-full" style={{ background: "#00a884" }} /> On duty
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[12px] font-semibold" style={{ color: "#00a884" }}>{e.role} · {e.personality} mode</span>
                    <span className="block truncate text-[12px]" style={{ color: "#8a949b" }}>{e.vibe}</span>
                  </span>
                </button>
                {isActive ? (
                  <span className="shrink-0 text-[11px] font-semibold" style={{ color: "#00a884" }}>Answering</span>
                ) : (
                  <button
                    onClick={() => useAgent(e)}
                    className="shrink-0 rounded-lg px-3.5 py-2.5 text-[12px] font-semibold transition active:scale-95"
                    style={{ background: "#00a884", color: "#04241d" }}
                  >
                    Put on duty
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-3 text-[13.5px] font-semibold shadow-2xl" style={{ background: "#1f2c34", borderColor: "rgba(0,168,132,0.4)", color: "#e9edef" }}>
            {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* Detail header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setDetailOpen(false)} aria-label="Back to agents" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#aebac1" }}>
          <ArrowLeft size={17} />
        </button>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-[19px] font-bold" style={{ background: avatarColor, color: avatarInk }}>
          {showPortrait ? <Portrait id={portraitId} size={56} /> : showPhoto ? faceImg() : avatar === "initials" ? initials : <AvatarIcon size={26} strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-[20px] font-bold leading-tight" style={{ color: "#e9edef" }}>{name || "Agent"}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: "#8a949b" }}>
            <span className={`h-1.5 w-1.5 rounded-full ${activeId === empId ? "animate-pulse" : ""}`} style={{ background: activeId === empId ? "#00a884" : "#636c73" }} />
            {role} · {activeId === empId ? "On duty" : "Standby"}
          </p>
        </div>
        {activeId === empId ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase" style={{ background: "rgba(0,168,132,0.14)", color: "#00a884", letterSpacing: "0.06em" }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#00a884" }} /> Live
          </span>
        ) : (
          <button onClick={() => useAgent(EMPLOYEES.find((e) => e.id === empId) ?? EMPLOYEES[index])} className="shrink-0 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold" style={{ background: "#00a884", color: "#04241d" }}>
            Put on duty
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {/* Persona */}
        <section className="rounded-2xl p-5 sm:p-6" style={card}>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
            <UserRound size={16} style={{ color: "#00a884" }} /> Persona
          </h2>
          <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amaka" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Role</span>
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Sales closer" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ ...field, height: 42 }} />
            </label>
          </div>
          <p className="mt-4 text-[12px] font-medium" style={{ color: "#8a949b" }}>Avatar style</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {avatarOptions.map((a) => {
              const I = a.icon;
              const active = avatar === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAvatar(a.id)}
                  className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition"
                  style={active ? { background: "rgba(0,168,132,0.14)", border: "1px solid rgba(0,168,132,0.45)", color: "#e9edef" } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", color: "#8a949b" }}
                >
                  {a.id === "portrait" ? (
                    <span className="h-5 w-5 overflow-hidden rounded-full"><Portrait id={portraitId} size={20} /></span>
                  ) : a.id === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" draggable={false} onError={() => setAvatar("initials")} className="h-5 w-5 rounded-full object-cover" />
                  ) : a.id === "initials" ? (
                    <span className="text-[13px] font-bold">{initials}</span>
                  ) : (
                    <I size={16} />
                  )}
                  {a.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Prompt */}
        <section className="rounded-2xl p-5 sm:p-6" style={card}>
          <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Agent prompt</h2>

          <p className="mt-3.5 text-[12px] font-semibold" style={{ color: "#8a949b" }}>HOW {name ? name.toUpperCase() : "SHE"} ACTS</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SNIPPETS.filter((s) => s.target === "acts").map((s) => {
              const added = combined.toLowerCase().includes(s.text.slice(0, 24).toLowerCase());
              const I = s.icon;
              return (
                <button
                  key={s.label}
                  title={s.text}
                  onClick={() => { setActiveBox("acts"); if (!added) insertSnippet(s.text); }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition"
                  style={added
                    ? { background: "rgba(0,168,132,0.12)", color: "#00a884", border: "1px solid rgba(0,168,132,0.35)" }
                    : { background: "rgba(255,255,255,0.04)", color: "#aebac1", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {added ? <Check size={13} strokeWidth={3} /> : <I size={13} />} {s.label}
                </button>
              );
            })}
          </div>
          <textarea
            ref={promptRef}
            value={acts}
            onFocus={() => setActiveBox("acts")}
            onChange={(e) => setActs(e.target.value.slice(0, 800))}
            onKeyDown={(e) => {
              if (e.key === "Tab" && activeBox === "acts" && suggestions.length > 0) {
                e.preventDefault();
                insertSnippet(suggestions[0].text);
              }
            }}
            rows={5}
            placeholder="e.g. Greet warmly, confirm price before orders…"
            className="mt-2 w-full rounded-xl p-3.5 text-[13.5px] leading-relaxed outline-none placeholder:text-[#4a545b]"
            style={{ ...field, borderColor: activeBox === "acts" ? "rgba(0,168,132,0.45)" : field.border as string }}
          />

          <p className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "#e66a6a" }}>
            <ShieldCheck size={13} /> NEVER DO — non-negotiable
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SNIPPETS.filter((s) => s.target === "never").map((s) => {
              const added = combined.toLowerCase().includes(s.text.slice(0, 24).toLowerCase());
              const I = s.icon;
              return (
                <button
                  key={s.label}
                  title={s.text}
                  onClick={() => { setActiveBox("never"); if (!added) insertSnippet(s.text); }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition"
                  style={added
                    ? { background: "rgba(230,106,106,0.12)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.4)" }
                    : { background: "rgba(255,255,255,0.04)", color: "#aebac1", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {added ? <Check size={13} strokeWidth={3} /> : <I size={13} />} {s.label}
                </button>
              );
            })}
          </div>
          <textarea
            ref={neverRef}
            value={neverDo}
            onFocus={() => setActiveBox("never")}
            onChange={(e) => setNeverDo(e.target.value.slice(0, 600))}
            onKeyDown={(e) => {
              if (e.key === "Tab" && activeBox === "never" && suggestions.length > 0) {
                e.preventDefault();
                insertSnippet(suggestions[0].text);
              }
            }}
            rows={3}
            placeholder="e.g. Never invent stock, never publish promos alone…"
            className="mt-2 w-full rounded-xl p-3.5 text-[13.5px] leading-relaxed outline-none placeholder:text-[#4a545b]"
            style={{ ...field, borderColor: activeBox === "never" ? "rgba(230,106,106,0.5)" : field.border as string, background: "rgba(230,106,106,0.04)" }}
          />

          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px]" style={{ color: "#636c73" }}>Tab for the first:</span>
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  title={s.text}
                  onClick={() => insertSnippet(s.text)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition hover:bg-white/10"
                  style={{ background: "rgba(0,168,132,0.1)", border: "1px dashed rgba(0,168,132,0.5)", color: "#00d19f" }}
                >
                  <Sparkles size={12} /> {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3.5">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-semibold" style={{ color: strength.color }}>
                {strength.label} · {score}/{CHECKS.length}
              </p>
              {missing.length > 0 && (
                <p className="text-[11.5px]" style={{ color: "#636c73" }}>Add: {missing.slice(0, 2).join(", ")}{missing.length > 2 ? "…" : ""}</p>
              )}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(score / CHECKS.length) * 100}%`, background: strength.color }} />
            </div>
          </div>
        </section>

        {/* Voice */}
        <section className="rounded-2xl p-5 sm:p-6" style={card}>
          <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Voice &amp; style</h2>

          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PERSONALITIES.map((p) => {
              const active = personality === p.id;
              const PI = p.icon;
              return (
                <button
                  key={p.id}
                  title={p.desc}
                  onClick={() => setPersonality(p.id)}
                  className="rounded-xl p-3.5 text-center transition"
                  style={active ? { background: "rgba(0,168,132,0.1)", border: "1px solid rgba(0,168,132,0.45)" } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  <span className="flex justify-center" style={{ color: active ? "#00a884" : "#8a949b" }}>
                    <PI size={26} strokeWidth={1.75} />
                  </span>
                  <span className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-semibold" style={{ color: "#e9edef" }}>
                    {active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#00a884" }} />}
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-[12px] font-medium" style={{ color: "#8a949b" }}>Opening line — first thing customers see</p>
          <input
            value={greeting}
            onChange={(e) => setGreeting(e.target.value.slice(0, 200))}
            className="mt-1.5 w-full rounded-xl px-3.5 text-[13.5px] outline-none"
            style={{ ...field, height: 44 }}
          />
          <div className="mt-2.5 rounded-2xl rounded-tl-md px-4 py-2.5 text-[13.5px]" style={{ background: "#1f2c34", color: "#e9edef", maxWidth: "88%" }}>
            {greeting || "…"}
          </div>

          <p className="mt-4 text-[12px] font-medium" style={{ color: "#8a949b" }}>Example exchange — show, don&apos;t tell</p>
          <div className="mt-1.5 grid gap-2">
            <input
              value={exCustomer}
              onChange={(e) => setExCustomer(e.target.value.slice(0, 200))}
              placeholder="Customer says…"
              className="w-full rounded-xl px-3.5 text-[13.5px] outline-none"
              style={{ ...field, height: 42 }}
            />
            <input
              value={exReply}
              onChange={(e) => setExReply(e.target.value.slice(0, 300))}
              placeholder="Agent replies…"
              className="w-full rounded-xl px-3.5 text-[13.5px] outline-none"
              style={{ ...field, height: 42 }}
            />
          </div>
        </section>

        {/* Schedule */}
        <section className="rounded-2xl p-5 sm:p-6" style={card}>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
            <Clock3 size={16} style={{ color: "#00a884" }} /> Working days
          </h2>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => flipDay(d)}
                  className="h-10 w-12 rounded-xl text-[13px] font-semibold transition"
                  style={on ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]" style={{ color: "#8a949b" }}>
              From
              <input type="time" value={open} onChange={(e) => setOpen(e.target.value)} className="rounded-xl px-3 py-2 text-[13px] outline-none" style={{ ...field, colorScheme: "dark" }} />
            </label>
            <label className="flex items-center gap-2 text-[13px]" style={{ color: "#8a949b" }}>
              To
              <input type="time" value={close} onChange={(e) => setClose(e.target.value)} className="rounded-xl px-3 py-2 text-[13px] outline-none" style={{ ...field, colorScheme: "dark" }} />
            </label>
          </div>
          <p className="mt-3.5 rounded-xl p-3 text-[12.5px]" style={{ background: "rgba(0,168,132,0.07)", color: "#aebac1", border: "1px solid rgba(0,168,132,0.22)" }}>
            {summary}{days.length > 0 && ` · ${open} – ${close}`}
          </p>
        </section>

        {/* Chat access */}
        <ChatAccess />

        {/* Test chat */}
        <section className="overflow-hidden rounded-2xl" style={card}>
          <div className="flex items-center gap-3 px-5 py-3.5" style={{ background: "#1f2c34" }}>
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold" style={{ background: avatarColor, color: avatarInk }}>
              {showPortrait ? <Portrait id={portraitId} size={36} /> : showPhoto ? faceImg() : avatar === "initials" ? initials : <AvatarIcon size={17} />}
            </span>
            <div>
              <p className="text-[13.5px] font-bold" style={{ color: "#e9edef" }}>{name || "Agent"}</p>
              <p className="text-[11.5px]" style={{ color: "#00a884" }}>online · test mode</p>
            </div>
            <span className="ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase" style={{ background: "rgba(232,180,91,0.12)", color: "#e8b45b", letterSpacing: "0.08em" }}>
              Preview
            </span>
          </div>
          <div ref={chatRef} className="flex max-h-[320px] min-h-[220px] flex-col gap-2 overflow-y-auto p-4" style={{ background: "radial-gradient(rgba(0,168,132,0.05) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
            {messages.map((m) =>
              m.from === "typing" ? (
                <div key={m.id} className="flex gap-1 rounded-2xl rounded-bl-md px-4 py-3" style={{ background: "#1f2c34", width: "fit-content" }}>
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "#8a949b", animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
              ) : (
                <div
                  key={m.id}
                  className={m.from === "me" ? "max-w-[85%] self-end rounded-2xl rounded-br-md px-4 py-2.5 text-[13.5px]" : "max-w-[88%] rounded-2xl rounded-bl-md px-4 py-2.5 text-[13.5px]"}
                  style={m.from === "me" ? { background: "#005c4b", color: "#e9edef" } : { background: "#1f2c34", color: "#e9edef" }}
                >
                  {m.text}
                </div>
              )
            )}
          </div>
          <div className="flex gap-2 p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder={`Message ${name || "her"}… try “price” or “order”`}
              className="min-w-0 flex-1 rounded-full px-4 text-[13.5px] outline-none"
              style={{ ...field, height: 42, borderRadius: 999 }}
            />
            <button onClick={send} aria-label="Send test message" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full" style={{ background: "#00a884", color: "#04241d" }}>
              <Send size={16} />
            </button>
          </div>
        </section>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 mt-5 flex gap-2.5 rounded-2xl p-2.5" style={{ background: "rgba(17,27,33,0.92)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}>
        <button
          onClick={() => setDetailOpen(false)}
          className="flex items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-medium transition hover:bg-white/10"
          style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#aebac1", height: 44 }}
        >
          <ArrowLeft size={15} /> Agents
        </button>
        <button onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold" style={{ background: "#00a884", color: "#04241d", height: 44 }}>
          <Save size={15} /> Save {name || "agent"}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-3 text-[13.5px] font-semibold shadow-2xl" style={{ background: "#1f2c34", borderColor: "rgba(0,168,132,0.4)", color: "#e9edef" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
