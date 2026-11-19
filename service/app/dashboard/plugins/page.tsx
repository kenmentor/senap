"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Search, Mail, Calendar, Youtube, Table, StickyNote, Folder,
  CreditCard, ShoppingBag, MessageSquare, Globe, ShieldCheck, Trash2, type LucideIcon
} from "lucide-react";
import type { IconType } from "react-icons";
import {
  SiGmail, SiGooglesheets, SiGooglecalendar, SiNotion, SiGoogledrive,
  SiYoutube, SiShopify, SiStripe
} from "react-icons/si";
import { FaSlack } from "react-icons/fa";
import { NeedsLineGate, useHasLine } from "@/components/dashboard/needs-line";

type Tool = { id: string; name: string; desc: string; cat: string; icon: LucideIcon; brand: IconType | null; tint: string; perms: string[] };
type Connected = { id: string; toolId: string; account: string; enabled: boolean; lastUsed: string; grants?: boolean[] };

const TOOLS: Tool[] = [
  { id: "gmail", name: "Gmail", desc: "Read & send email for order updates", cat: "Email", icon: Mail, brand: SiGmail, tint: "#ea4335", perms: ["Read order-related emails", "Send replies you approve", "Manage labels for receipts"] },
  { id: "sheets", name: "Google Sheets", desc: "Log every sale to a live sheet", cat: "Spreadsheets", icon: Table, brand: SiGooglesheets, tint: "#34a853", perms: ["Create & edit sales sheets", "Append new order rows"] },
  { id: "calendar", name: "Google Calendar", desc: "Book deliveries & reminders", cat: "Scheduling", icon: Calendar, brand: SiGooglecalendar, tint: "#4285f4", perms: ["Create delivery events", "Read free/busy slots"] },
  { id: "notion", name: "Notion", desc: "Keep stock notes & SOPs in sync", cat: "Notes", icon: StickyNote, brand: SiNotion, tint: "#e9edef", perms: ["Read inventory pages", "Update stock notes"] },
  { id: "drive", name: "Google Drive", desc: "Save receipts & product photos", cat: "Files", icon: Folder, brand: SiGoogledrive, tint: "#fbbc04", perms: ["Upload receipts & photos", "Create dated folders"] },
  { id: "youtube", name: "YouTube", desc: "Pull product videos into chats", cat: "Video", icon: Youtube, brand: SiYoutube, tint: "#ff0033", perms: ["Read your uploads", "Share links in chats"] },
  { id: "slack", name: "Slack", desc: "Ping your team on big orders", cat: "Team chat", icon: MessageSquare, brand: FaSlack, tint: "#7c3aed", perms: ["Post to #sales", "Send restock alerts"] },
  { id: "shopify", name: "Shopify", desc: "Mirror stock with your store", cat: "Store", icon: ShoppingBag, brand: SiShopify, tint: "#95bf47", perms: ["Read product stock", "Push stock updates"] },
  { id: "stripe", name: "Stripe", desc: "Send payment links in chat", cat: "Payments", icon: CreditCard, brand: SiStripe, tint: "#8b9dff", perms: ["Create payment links", "Read payment status"] },
  { id: "web", name: "Web search", desc: "Look up prices & competitor info", cat: "Research", icon: Globe, brand: null, tint: "#00a884", perms: ["Search the public web", "Summarise findings"] }
];

/* Real brand logo (vector, offline) with the generic icon as fallback. */
function ToolMark({ tool, size = 48, iconSize = 21 }: { tool: Tool; size?: number; iconSize?: number }) {
  const Icon = tool.icon;
  const Brand = tool.brand;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-2xl" style={{ width: size, height: size, background: `${tool.tint}1c` }}>
      {Brand ? <Brand size={iconSize} color={tool.tint} /> : <Icon size={iconSize} style={{ color: tool.tint }} />}
    </span>
  );
}

const toolById = (id: string) => TOOLS.find((t) => t.id === id)!;

export default function PluginsPage() {
  const [connected, setConnected] = useState<Connected[]>([]);
  const hasLine = useHasLine();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/plugins");
        if (!res.ok) return;
        const docs: Connected[] = await res.json();
        setConnected(docs);
        setGrants((g) => {
          const next = { ...g };
          for (const d of docs) if (d.grants?.length) next[d.id] = d.grants;
          return next;
        });
      } catch {
        /* offline — page still works locally */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [authTool, setAuthTool] = useState<Tool | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, boolean[]>>({});

  const detail = detailId ? connected.find((c) => c.id === detailId) ?? null : null;
  const isGranted = (conId: string, i: number) =>
    grants[conId]?.[i] ?? connected.find((c) => c.id === conId)?.grants?.[i] ?? true;
  const flipGrant = (conId: string, i: number, count: number) => {
    const cur = grants[conId] ?? connected.find((c) => c.id === conId)?.grants ?? Array(count).fill(true);
    const next = [...cur];
    while (next.length < count) next.push(true);
    next[i] = !next[i];
    setGrants((g) => ({ ...g, [conId]: next }));
    fetch(`/api/plugins/${conId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grants: next })
    }).catch(() => {});
  };

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    const notAdded = TOOLS.filter((t) => !connected.some((c) => c.toolId === t.id));
    if (!q) return notAdded;
    return notAdded.filter((t) => [t.name, t.desc, t.cat].join(" ").toLowerCase().includes(q));
  }, [query, connected]);

  const openSheet = () => {
    setQuery("");
    setAuthTool(null);
    setSheetOpen(true);
  };

  const approve = async () => {
    if (!authTool) return;
    const body = {
      toolId: authTool.id,
      account: authTool.id === "gmail" ? "sales@nalaphones.com" : `${authTool.name} workspace`,
      enabled: true,
      lastUsed: "Just now"
    };
    try {
      const res = await fetch("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("connect failed");
      const created: Connected = await res.json();
      setConnected((v) => [...v, created]);
    } catch {
      setConnected((v) => [...v, { id: "con_" + Date.now().toString(36), ...body }]);
    }
    setAuthTool(null);
    setSheetOpen(false);
  };

  const toggle = async (id: string) => {
    const target = connected.find((c) => c.id === id);
    const enabled = !(target?.enabled ?? true);
    setConnected((v) => v.map((c) => (c.id === id ? { ...c, enabled } : c)));
    try {
      await fetch(`/api/plugins/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    } catch {
      /* local-only */
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Disconnect ${name}? The agent will lose access.`)) return;
    try {
      await fetch(`/api/plugins/${id}`, { method: "DELETE" });
    } catch {
      /* fall through to local removal */
    }
    setConnected((v) => v.filter((c) => c.id !== id));
    if (detailId === id) setDetailId(null);
  };

  if (hasLine === false) return <NeedsLineGate />;

  return (
    <div>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {connected.map((c) => {
          const t = toolById(c.toolId);
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailId(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(c.id); } }}
              className="cursor-pointer rounded-2xl p-5 transition outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#00a884]"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", opacity: c.enabled ? 1 : 0.6 }}
            >
              <div className="flex items-center gap-3.5">
                <ToolMark tool={t} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
                    <span className="truncate">{t.name}</span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={c.enabled ? { background: "rgba(0,168,132,0.14)", color: "#00a884" } : { background: "rgba(255,255,255,0.08)", color: "#8a949b" }}>
                      {c.enabled ? "On" : "Off"}
                    </span>
                  </p>
                  <p className="truncate text-[12px]" style={{ color: "#8a949b" }}>{c.account} · Used {c.lastUsed}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(c.id); }}
                  aria-label={c.enabled ? `Disable ${t.name}` : `Enable ${t.name}`}
                  className="relative h-7 w-12 shrink-0 rounded-full transition"
                  style={{ background: c.enabled ? "#00a884" : "rgba(255,255,255,0.12)" }}
                >
                  <span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: c.enabled ? 26 : 4 }} />
                </button>
                <span className="text-[12px]" style={{ color: "#8a949b" }}>{c.enabled ? "Agent can use this" : "Paused"}</span>
                <button onClick={(e) => { e.stopPropagation(); remove(c.id, t.name); }} aria-label={`Disconnect ${t.name}`} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10" style={{ color: "#e66a6a" }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add card */}
        <button
          onClick={openSheet}
          className="group flex min-h-[172px] flex-col items-center justify-center gap-3 rounded-2xl transition hover:bg-white/[0.04]"
          style={{ border: "1px dashed rgba(255,255,255,0.18)" }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full transition group-hover:scale-105" style={{ background: "#00a884", color: "#04241d" }}>
            <Plus size={22} strokeWidth={2.5} />
          </span>
          <span className="text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>Add plugin</span>
          <span className="text-[12px]" style={{ color: "#636c73" }}>{TOOLS.length - connected.length} available</span>
        </button>
      </div>

      {/* Browse + auth sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setSheetOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            {!authTool ? (
              <>
                <div className="flex items-center justify-between px-6 pt-6">
                  <h2 className="text-[16px] font-semibold" style={{ color: "#e9edef" }}>Add plugin</h2>
                  <button onClick={() => setSheetOpen(false)} aria-label="Close" style={{ color: "#636c73" }}><X size={17} /></button>
                </div>
                <div className="px-6 pt-4">
                  <div className="flex items-center gap-2.5 rounded-xl px-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", height: 42 }}>
                    <Search size={15} strokeWidth={1.75} style={{ color: "#636c73" }} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search email, sheets, youtube…"
                      autoFocus
                      className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[#636c73]"
                      style={{ color: "#e9edef" }}
                    />
                    {query && <button onClick={() => setQuery("")} aria-label="Clear search" style={{ color: "#636c73" }}><X size={14} /></button>}
                  </div>
                </div>
                <div className="mt-2 flex-1 overflow-y-auto px-3 pb-4 pt-2">
                  {available.length === 0 && (
                    <p className="px-3 py-10 text-center text-[13px]" style={{ color: "#636c73" }}>
                      {connected.length >= TOOLS.length ? "Everything is connected ✓" : "No tools match your search."}
                    </p>
                  )}
                  {available.map((t) => {
                    return (
                      <div key={t.id} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.03]">
                        <ToolMark tool={t} size={40} iconSize={18} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>{t.name} <span className="ml-1 text-[11px] font-medium" style={{ color: "#636c73" }}>{t.cat}</span></p>
                          <p className="truncate text-[12px]" style={{ color: "#8a949b" }}>{t.desc}</p>
                        </div>
                        <button onClick={() => setAuthTool(t)} className="shrink-0 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold" style={{ background: "rgba(0,168,132,0.14)", color: "#00a884" }}>
                          Connect
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <button onClick={() => setAuthTool(null)} className="text-[13px] font-semibold" style={{ color: "#8a949b" }}>← All tools</button>
                  <button onClick={() => setSheetOpen(false)} aria-label="Close" style={{ color: "#636c73" }}><X size={17} /></button>
                </div>
                <div className="mt-5 flex flex-col items-center text-center">
                  <ToolMark tool={authTool} size={56} iconSize={26} />
                  <h2 className="mt-3 text-[17px] font-bold" style={{ color: "#e9edef" }}>Connect {authTool.name}?</h2>
                  <p className="mt-1 text-[13px]" style={{ color: "#8a949b" }}>Senap is asking permission to:</p>
                </div>
                <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {authTool.perms.map((p) => (
                    <p key={p} className="flex items-start gap-2.5 py-1.5 text-[13px]" style={{ color: "#cfd6db" }}>
                      <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: "#00a884" }} /> {p}
                    </p>
                  ))}
                </div>
                <div className="mt-5 flex gap-2.5">
                  <button onClick={() => setAuthTool(null)} className="flex-1 rounded-xl text-[13.5px] font-medium transition hover:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#aebac1", height: 44 }}>
                    Cancel
                  </button>
                  <button onClick={approve} className="flex-1 rounded-xl text-[13.5px] font-semibold" style={{ background: "#00a884", color: "#04241d", height: 44 }}>
                    Approve access
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Access detail — per-privilege toggles */}
      {detail && (() => {
        const t = toolById(detail.toolId);
        const grantedCount = t.perms.filter((_, i) => isGranted(detail.id, i)).length;
        return (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setDetailId(null)}>
            <div className="w-full max-w-[440px] rounded-t-3xl p-6 sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3.5">
                <ToolMark tool={t} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold" style={{ color: "#e9edef" }}>{t.name}</p>
                  <p className="truncate text-[12px]" style={{ color: "#8a949b" }}>{detail.account} · {grantedCount} of {t.perms.length} allowed</p>
                </div>
                <button onClick={() => setDetailId(null)} aria-label="Close" style={{ color: "#636c73" }}><X size={17} /></button>
              </div>

              <p className="mt-5 text-[11px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.1em" }}>Agent access</p>
              <div className="mt-2 flex flex-col gap-2">
                {t.perms.map((p, i) => {
                  const on = isGranted(detail.id, i);
                  return (
                    <div key={p} className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", opacity: on ? 1 : 0.55 }}>
                      <ShieldCheck size={16} className="shrink-0" style={{ color: on ? "#00a884" : "#636c73" }} />
                      <span className="min-w-0 flex-1 text-[13px]" style={{ color: "#cfd6db" }}>{p}</span>
                      <button
                        onClick={() => flipGrant(detail.id, i, t.perms.length)}
                        aria-label={on ? `Revoke: ${p}` : `Allow: ${p}`}
                        className="relative h-6 w-10 shrink-0 rounded-full transition"
                        style={{ background: on ? "#00a884" : "rgba(255,255,255,0.12)" }}
                      >
                        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11.5px]" style={{ color: "#636c73" }}>Revoked access stops working immediately.</p>

              <div className="mt-4 flex gap-2.5">
                <button onClick={() => { remove(detail.id, t.name); setDetailId(null); }} className="flex-1 rounded-xl text-[13px] font-semibold" style={{ border: "1px solid rgba(230,106,106,0.4)", color: "#e66a6a", height: 44 }}>
                  Disconnect
                </button>
                <button onClick={() => setDetailId(null)} className="flex-1 rounded-xl text-[13px] font-semibold" style={{ background: "#00a884", color: "#04241d", height: 44 }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
