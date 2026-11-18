"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Pencil, Trash2, X, Package, ChevronLeft, ChevronDown, RefreshCw, Megaphone, Camera, Upload } from "lucide-react";
import { VIEWS, formatUpdated, lowCount, statusOf, thumbFor, LOW_AT, type Item } from "@/lib/demo/catalog";
import { isVideoUrl } from "@/lib/store";

type Draft = { name: string; sku: string; unitPrice: string; quantity: string; category: string; condition: string; description: string; image: string };

const emptyDraft: Draft = { name: "", sku: "", unitPrice: "", quantity: "", category: "", condition: "New", description: "", image: "" };

const CONDITIONS = ["New", "UK Used", "Used"] as const;

function conditionColor(c: string | undefined): string {
  if (c === "UK Used") return "#e8b45b";
  if (c === "Used") return "#8a949b";
  return "#00a884";
}

export default function ProductsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<null | { mode: "add" } | { mode: "edit"; id: string }>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [catFilter, setCatFilter] = useState("All");
  const [condFilter, setCondFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("offline");
      setItems(await res.json());
    } catch {
      setLoadError("Can't reach the database. Start MongoDB, then retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (catFilter !== "All" && p.category !== catFilter) return false;
      if (condFilter !== "All" && (p.condition ?? "New") !== condFilter) return false;
      if (!q) return true;
      return [p.name, p.sku, p.category].join(" ").toLowerCase().includes(q);
    });
  }, [items, query, catFilter, condFilter]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(items.map((p) => p.category).filter(Boolean)))], [items]);

  const selected = selectedId ? items.find((p) => p.id === selectedId) ?? null : null;

  const openDetail = (id: string) => {
    setActiveImg(0);
    setSelectedId(id);
  };

  const openAdd = () => {
    setDraft(emptyDraft);
    setModal({ mode: "add" });
  };

  /* ---------- Status control (collapsible sections, manual switches) ---------- */
  const [statusOpen, setStatusOpen] = useState<null | "post" | "import" | "catalog">(null);
  const [lines, setLines] = useState<{ id: string; number: string; engineId?: string }[]>([]);
  const [statusLine, setStatusLine] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [postingEnabled, setPostingEnabled] = useState(true);
  const [agentCtl, setAgentCtl] = useState({ statusImport: true, catalogMirror: true });
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [postingOne, setPostingOne] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [accRes, setRes] = await Promise.all([fetch("/api/accounts"), fetch("/api/settings")]);
        if (accRes.ok) {
          const list: { id: string; number: string; engineId?: string }[] = await accRes.json();
          setLines(list);
          const first = list[0];
          if (first) setStatusLine(first.engineId ?? first.number);
        }
        if (setRes.ok) {
          const s = await setRes.json();
          const flow = (s.statusFlow ?? {}) as { lineId?: string; includePrice?: boolean; postingEnabled?: boolean };
          if (typeof flow.lineId === "string" && flow.lineId) setStatusLine(flow.lineId);
          if (typeof flow.includePrice === "boolean") setIncludePrice(flow.includePrice);
          if (typeof flow.postingEnabled === "boolean") setPostingEnabled(flow.postingEnabled);
        }
      } catch {
        /* section stays usable with defaults */
      }
    })();
  }, []);

  // This line's import/catalog switches (same source as Agent access).
  useEffect(() => {
    if (!statusLine) return;
    (async () => {
      try {
        const res = await fetch(`/api/agent?userId=${encodeURIComponent(statusLine)}`);
        if (!res.ok) return;
        const c = await res.json();
        const ctl = (c.control ?? {}) as { statusImport?: boolean; catalogMirror?: boolean };
        setAgentCtl({
          statusImport: typeof ctl.statusImport === "boolean" ? ctl.statusImport : true,
          catalogMirror: typeof ctl.catalogMirror === "boolean" ? ctl.catalogMirror : true,
        });
      } catch {
        /* keep defaults */
      }
    })();
  }, [statusLine]);

  const saveFlow = async (key: string, patch: Record<string, unknown>) => {
    if (statusBusy) return;
    setStatusBusy(key);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusFlow: patch }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setStatusMsg("Couldn't save that switch — retry.");
    } finally {
      setStatusBusy(null);
    }
  };

  const saveAgentCtl = async (k: "statusImport" | "catalogMirror") => {
    if (!statusLine || statusBusy) return;
    const next = !agentCtl[k];
    setAgentCtl((v) => ({ ...v, [k]: next }));
    setStatusBusy(`ctl-${k}`);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: statusLine, control: { [k]: next } }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setAgentCtl((v) => ({ ...v, [k]: !next }));
      setStatusMsg("Couldn't save that switch — retry.");
    } finally {
      setStatusBusy(null);
    }
  };

  const postSingle = async (id: string) => {
    if (postingOne) return;
    setPostingOne(id);
    try {
      const res = await fetch(`/api/products/${id}/post-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: statusLine }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "post failed");
      setItems((v) => v.map((p) => (p.id === id ? { ...p, lastStatusPostAt: Date.now() } as Item : p)));
      setStatusMsg("Posted to status ✅");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't post that.");
    } finally {
      setPostingOne(null);
    }
  };

  const postUnsold = async () => {
    if (statusBusy) return;
    setStatusBusy("unsold");
    setStatusMsg(null);
    try {
      const res = await fetch("/api/products/post-unsold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: statusLine }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "nothing posted");
      const ids: string[] = Array.isArray(data.posted) ? data.posted : [];
      const now = Date.now();
      setItems((v) => v.map((p) => (ids.includes(p.id) ? { ...p, lastStatusPostAt: now } as Item : p)));
      setStatusMsg(`Posted ${ids.length} to status ✅${data.failed ? ` · stopped: ${data.failed}` : ""}`);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Nothing posted.");
    } finally {
      setStatusBusy(null);
    }
  };

  const uploadFile = async (f: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "upload failed");
      setDraft((d) => ({ ...d, image: data.url as string }));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (p: Item) => {
    setDraft({ name: p.name, sku: p.sku, unitPrice: String(p.unitPrice), quantity: String(p.quantity), category: p.category, condition: p.condition ?? "New", description: p.description, image: p.image ?? "" });
    setModal({ mode: "edit", id: p.id });
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    const price = Math.max(0, Number(draft.unitPrice) || 0);
    const qty = Math.max(0, Math.floor(Number(draft.quantity) || 0));
    const body = {
      name: draft.name.trim(),
      sku: draft.sku.trim(),
      quantity: qty,
      unitPrice: price,
      category: draft.category.trim() || "General",
      condition: (["New", "UK Used", "Used"] as string[]).includes(draft.condition) ? draft.condition : "New",
      description: draft.description.trim(),
      image: draft.image.trim()
    };
    try {
      if (modal?.mode === "add") {
        const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, costPrice: Math.round(price * 0.6) }) });
        if (!res.ok) throw new Error("save failed");
        const created: Item = await res.json();
        setItems((v) => [...v, created]);
      } else if (modal?.mode === "edit") {
        const res = await fetch(`/api/products/${modal.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error("save failed");
        const updated: Item = await res.json();
        setItems((v) => v.map((p) => (p.id === updated.id ? updated : p)));
      }
      setModal(null);
    } catch {
      window.alert("Couldn't save — is MongoDB running?");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setItems((v) => v.filter((p) => p.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch {
      window.alert("Couldn't delete — is MongoDB running?");
    }
  };

  return (
    <div>
      {/* Top bar: search + add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", height: 44, minWidth: 220 }}>
          <Search size={16} strokeWidth={1.75} style={{ color: "#636c73" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, SKUs…"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[#636c73]"
            style={{ color: "#e9edef" }}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" style={{ color: "#636c73" }}>
              <X size={15} />
            </button>
          )}
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold" style={{ background: "#00a884", color: "#04241d", height: 44 }}>
          <Plus size={16} strokeWidth={2.25} /> Add product
        </button>
      </div>

      {/* Status control — one switch per flow, expand for details. */}
      <div className="mt-3 overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
        {(
          [
            ["post", "Post products to status", postingEnabled ? "On — cards can post" : "Off", postingEnabled],
            ["import", "Status to store", agentCtl.statusImport ? "On — statuses become products" : "Off", agentCtl.statusImport],
            ["catalog", "Post to catalog", agentCtl.catalogMirror ? "On — mirrors to WA catalog" : "Off", agentCtl.catalogMirror],
          ] as const
        ).map(([key, title, sub, on], i) => {
          const expanded = statusOpen === key;
          const flip = () => {
            if (key === "post") {
              const next = !postingEnabled;
              setPostingEnabled(next);
              void saveFlow("posting", { postingEnabled: next });
            } else if (key === "import") void saveAgentCtl("statusImport");
            else void saveAgentCtl("catalogMirror");
          };
          return (
            <div key={key} style={i > 0 ? { borderTop: "1px solid rgba(255,255,255,0.07)" } : undefined}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setStatusOpen(expanded ? null : key)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <ChevronDown size={16} style={{ color: "#636c73", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold" style={{ color: "#e9edef" }}>{title}</span>
                    <span className="block truncate text-[11.5px]" style={{ color: on ? "#00d19f" : "#636c73" }}>{sub}</span>
                  </span>
                </button>
                <button
                  onClick={flip}
                  disabled={!!statusBusy}
                  role="switch"
                  aria-checked={on}
                  aria-label={title}
                  className="flex h-7 w-[46px] shrink-0 items-center rounded-full p-1 transition disabled:opacity-40"
                  style={{ background: on ? "#00a884" : "rgba(255,255,255,0.14)", justifyContent: on ? "flex-end" : "flex-start" }}
                >
                  <span className="h-5 w-5 rounded-full" style={{ background: on ? "#04241d" : "#8a949b" }} />
                </button>
              </div>
              {expanded && (
                <div className="px-4 pb-4" style={{ paddingTop: 2 }}>
                  {key === "post" && (
                    <>
                      {lines.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                          {lines.map((a) => {
                            const id = a.engineId ?? a.number;
                            return (
                              <button
                                key={a.id}
                                onClick={() => {
                                  setStatusLine(id);
                                  void saveFlow("line", { lineId: id });
                                }}
                                disabled={!!statusBusy}
                                className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition disabled:opacity-50"
                                style={id === statusLine ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
                              >
                                {a.number}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <span>
                          <span className="block text-[13px] font-semibold" style={{ color: "#e9edef" }}>Include price in caption</span>
                          <span className="block text-[11.5px]" style={{ color: "#636c73" }}>Name — ₦price (condition)</span>
                        </span>
                        <button
                          onClick={() => {
                            const next = !includePrice;
                            setIncludePrice(next);
                            void saveFlow("price", { includePrice: next });
                          }}
                          disabled={!!statusBusy}
                          role="switch"
                          aria-checked={includePrice}
                          aria-label="Include price in caption"
                          className="flex h-7 w-[46px] shrink-0 items-center rounded-full p-1 transition disabled:opacity-40"
                          style={{ background: includePrice ? "#00a884" : "rgba(255,255,255,0.14)", justifyContent: includePrice ? "flex-end" : "flex-start" }}
                        >
                          <span className="h-5 w-5 rounded-full" style={{ background: includePrice ? "#04241d" : "#8a949b" }} />
                        </button>
                      </label>
                      <button
                        onClick={postUnsold}
                        disabled={!!statusBusy || !postingEnabled}
                        className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold transition active:scale-[0.99] disabled:opacity-50"
                        style={{ background: "#00a884", color: "#04241d" }}
                      >
                        <Megaphone size={15} strokeWidth={2.25} /> {statusBusy === "unsold" ? "Posting…" : "Post unsold now"}
                      </button>
                      <p className="mt-2 text-[11.5px]" style={{ color: "#636c73" }}>Pushes up to 3 in-stock products you haven&apos;t posted in the longest — oldest first.</p>
                    </>
                  )}
                  {key === "import" && (
                    <p className="rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", color: "#8a949b" }}>
                      When on, photo/video statuses posted from this line&apos;s own phone are judged and listed as products automatically. Same switch as Agent access — both places stay in sync.
                    </p>
                  )}
                  {key === "catalog" && (
                    <p className="rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", color: "#8a949b" }}>
                      When on, every status import is also mirrored into the WhatsApp Business catalog with the same details. Photo items carry their photo; videos list without one.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {statusMsg && (
          <p className="mx-4 mb-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "rgba(0,168,132,0.1)", color: "#00d19f" }}>
            {statusMsg}
          </p>
        )}
      </div>

      <p className="mt-5 text-[12.5px]" style={{ color: "#636c73" }}>
        {filtered.length} product{filtered.length === 1 ? "" : "s"}{query ? ` · “${query}”` : ""}
      </p>

      {/* Dealer filters: category pills + condition */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition"
            style={catFilter === c ? { background: "#00a884", color: "#04241d" } : { background: "rgba(255,255,255,0.05)", color: "#8a949b" }}
          >
            {c}
          </button>
        ))}
        <select
          value={condFilter}
          onChange={(e) => setCondFilter(e.target.value)}
          aria-label="Filter by condition"
          className="rounded-full px-3 text-[12.5px] font-semibold outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "#8a949b", height: 34 }}
        >
          {["All", ...CONDITIONS].map((c) => (
            <option key={c} value={c}>{c === "All" ? "Any condition" : c}</option>
          ))}
        </select>
      </div>

      {/* Card grid */}
      {loading ? (
        <div className="mt-3 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="aspect-square" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="space-y-2 p-3.5">
                <div className="h-3.5 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "70%" }} />
                <div className="h-3.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "45%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl py-16" style={{ border: "1px dashed rgba(230,106,106,0.4)" }}>
          <p className="text-[14px] font-medium" style={{ color: "#e66a6a" }}>{loadError}</p>
          <button onClick={load} className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: "#00a884", color: "#04241d" }}>
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl py-20" style={{ border: "1px dashed rgba(255,255,255,0.12)" }}>
          <Package size={22} strokeWidth={1.5} style={{ color: "#636c73" }} />
          <p className="mt-3 text-[14px] font-medium" style={{ color: "#aebac1" }}>No products found</p>
          <button onClick={openAdd} className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef" }}>
            <Plus size={15} /> Add your first product
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const s = statusOf(p);
            const isLow = p.quantity <= LOW_AT;
            return (
              <article
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(p.id); } }}
                className="group cursor-pointer overflow-hidden rounded-2xl transition outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#00a884]"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}
              >
                <div className="relative aspect-square overflow-hidden" style={{ background: "#0e151a" }}>
                  {isVideoUrl(p.image) ? (
                    <video src={p.image} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image || thumbFor(p, 0)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[10.5px] font-semibold" style={{ background: "rgba(0,0,0,0.65)", color: s.color, border: `1px solid ${s.color}44`, backdropFilter: "blur(6px)" }}>
                    {isVideoUrl(p.image) ? `▶ ${s.label}` : s.label}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    aria-label={`Edit ${p.name}`}
                    className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100"
                    style={{ background: "rgba(0,0,0,0.65)", color: "#e9edef", backdropFilter: "blur(6px)" }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); postSingle(p.id); }}
                    disabled={postingOne === p.id || !postingEnabled}
                    aria-label={`Post ${p.name} to status`}
                    title={postingEnabled ? "Post to WhatsApp status" : "Turn on posting in the Status section first"}
                    className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-50"
                    style={{ background: "rgba(0,168,132,0.9)", color: "#04241d" }}
                  >
                    {postingOne === p.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (p as Item & { lastStatusPostAt?: number }).lastStatusPostAt ? (
                      <Megaphone size={14} strokeWidth={2.5} />
                    ) : (
                      <Megaphone size={14} />
                    )}
                  </button>
                </div>
                <div className="p-3.5">
                  <p className="text-[10.5px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>
                    {p.category} · {p.sku} · <span style={{ color: conditionColor(p.condition) }}>{p.condition ?? "New"}</span>
                  </p>
                  <h3 className="mt-1 line-clamp-2 min-h-[38px] text-[13.5px] font-medium leading-snug" style={{ color: "#e9edef" }}>{p.name}</h3>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: "#8a949b" }}>
                    <span>{p.sold} sold</span>
                    <span aria-hidden>·</span>
                    <span style={isLow ? lowCount : undefined}>{p.quantity} left</span>
                  </p>
                  <p className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-[16px] font-bold" style={{ color: "#e9edef" }}>₦{p.unitPrice.toLocaleString("en-NG")}</span>
                  </p>
                  <p className="mt-1 text-[10.5px]" style={{ color: "#636c73" }}>Updated {formatUpdated(p.updatedAt)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail view — click a card */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setSelectedId(null)}>
          <div className="max-h-[92vh] w-full max-w-[880px] overflow-y-auto rounded-t-3xl sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b px-5 py-3.5" style={{ background: "rgba(17,27,33,0.95)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
              <button onClick={() => setSelectedId(null)} className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/10" aria-label="Back to products" style={{ color: "#aebac1" }}>
                <ChevronLeft size={18} />
              </button>
              <p className="truncate text-[14px] font-semibold" style={{ color: "#e9edef" }}>{selected.name}</p>
              <span className="ml-auto flex gap-2">
                <button onClick={() => { setSelectedId(null); openEdit(selected); }} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "rgba(255,255,255,0.07)", color: "#e9edef" }}>
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => remove(selected.id)} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg transition hover:bg-white/10" aria-label="Delete product" style={{ color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>

            <div className="grid gap-6 p-5 md:grid-cols-[1.05fr_1fr] md:p-7">
              {/* Gallery */}
              <div>
                <div className="overflow-hidden rounded-2xl" style={{ background: "#0e151a", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {isVideoUrl(selected.image) ? (
                    <video key={selected.id} src={selected.image} controls playsInline preload="metadata" className="aspect-square w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={activeImg} src={selected.image || thumbFor(selected, activeImg)} alt={selected.image ? selected.name : `${selected.name} — ${VIEWS[activeImg]} view`} draggable={false} className="aspect-square w-full object-cover" />
                  )}
                </div>
                {isVideoUrl(selected.image) ? (
                  <p className="mt-2.5 text-[11.5px]" style={{ color: "#636c73" }}>Real video · tap Edit to change it</p>
                ) : selected.image ? (
                  <p className="mt-2.5 text-[11.5px]" style={{ color: "#636c73" }}>Real photo · tap Edit to change it</p>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-4 gap-2.5">
                      {VIEWS.map((label, i) => (
                        <button key={label} onClick={() => setActiveImg(i)} aria-label={`View ${label}`} className="overflow-hidden rounded-xl transition" style={{ border: i === activeImg ? "2px solid #00a884" : "1px solid rgba(255,255,255,0.1)", opacity: i === activeImg ? 1 : 0.65 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumbFor(selected, i)} alt="" draggable={false} className="aspect-square w-full object-cover" />
                        </button>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[11.5px]" style={{ color: "#636c73" }}>{VIEWS.length} photos · tap a thumbnail to view</p>
                  </>
                )}
              </div>

              {/* Info */}
              <div>
                <p className="text-[11px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.1em" }}>{selected.category} · {selected.sku} · <span style={{ color: conditionColor(selected.condition) }}>{selected.condition ?? "New"}</span></p>
                <h2 className="font-display mt-1.5 text-[24px] font-bold leading-tight" style={{ color: "#e9edef" }}>{selected.name}</h2>
                <p className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: "#8a949b" }}>
                  <span>{selected.sold} sold</span>
                  <span aria-hidden>·</span>
                  <span style={selected.quantity <= LOW_AT ? lowCount : undefined}>{selected.quantity} left</span>
                  <span aria-hidden>·</span>
                  <span>Updated {formatUpdated(selected.updatedAt)}</span>
                </p>
                <p className="mt-3 flex items-baseline gap-2.5">
                  <span className="text-[26px] font-extrabold" style={{ color: "#e9edef" }}>₦{selected.unitPrice.toLocaleString("en-NG")}</span>
                  <span className="text-[12.5px]" style={{ color: "#636c73" }}>Cost ₦{selected.costPrice.toLocaleString("en-NG")} · Margin ₦{(selected.unitPrice - selected.costPrice).toLocaleString("en-NG")}</span>
                </p>
                <p className="mt-2.5 inline-block rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: statusOf(selected).bg, color: statusOf(selected).color }}>
                  {statusOf(selected).label}
                </p>
                <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-[12px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>About this product</p>
                  <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "#aebac1" }}>{selected.description || "No description yet — add one so customers (and your agent) know exactly what this is."}</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
                  {( [["Sold", `${selected.sold}`, false], ["Left", `${selected.quantity}`, selected.quantity <= LOW_AT], ["Updated", formatUpdated(selected.updatedAt), false]] as [string, string, boolean][] ).map(([k, v, alert]) => (
                    <div key={k} className="rounded-xl px-2 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="text-[10.5px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>{k}</p>
                      <p className="mt-1 truncate text-[13px] font-semibold" style={alert ? lowCount : { color: "#e9edef" }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setModal(null)}>
          <div className="max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl p-6 sm:rounded-2xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold" style={{ color: "#e9edef" }}>{modal.mode === "add" ? "Add product" : "Edit product"}</h2>
              <button onClick={() => setModal(null)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-white/10" style={{ color: "#636c73" }}><X size={17} /></button>
            </div>
            <div className="mt-5 grid gap-3.5">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Name</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Tecno Spark 20" autoFocus className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
              </label>
              <div className="grid grid-cols-2 gap-3.5">
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>SKU</span>
                  <input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="PHN-001" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Category</span>
                  <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Smartphones" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Condition</span>
                  <select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }}>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{c === "New" ? "Brand New" : c}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Stock</span>
                  <input value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} inputMode="numeric" placeholder="10" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Price (₦)</span>
                  <input value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} inputMode="numeric" placeholder="155000" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Dealer note <span style={{ color: "#636c73" }}>(how it posts on WhatsApp)</span></span>
                  <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="8/128GB, box + receipt, just 155k" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
                </label>
              </div>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Photo <span style={{ color: "#636c73" }}>(real product photo or video — blank = generated art)</span></span>
                <input value={draft.image} onChange={(e) => setDraft({ ...draft, image: e.target.value })} placeholder="https://… or /products/phone.jpg" className="rounded-xl px-3.5 text-[14px] outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#e9edef", height: 42 }} />
                <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }} />
                <span className="flex gap-2">
                  <button onClick={() => galleryRef.current?.click()} disabled={uploading} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef" }}>
                    <Upload size={14} /> {uploading ? "Uploading…" : "Upload"}
                  </button>
                  <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef" }}>
                    <Camera size={14} /> Take photo
                  </button>
                </span>
              </label>
              {draft.image.trim() && (
                isVideoUrl(draft.image.trim()) ? (
                  <video src={draft.image.trim()} controls playsInline preload="metadata" className="h-24 w-40 rounded-xl object-cover" style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.image.trim()} alt="Photo preview" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} className="h-24 w-24 rounded-xl object-cover" style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
                )
              )}
              <p className="text-[11.5px]" style={{ color: "#636c73" }}>Tip: drop real photos in the <span className="font-mono">public/products</span> folder, then use <span className="font-mono">/products/your-photo.jpg</span> here.</p>
            </div>
            <div className="mt-6 flex gap-2.5">
              <button onClick={() => setModal(null)} className="flex-1 rounded-xl text-[13.5px] font-medium transition hover:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#aebac1", height: 44 }}>
                Cancel
              </button>
              <button onClick={save} disabled={!draft.name.trim()} className="flex-1 rounded-xl text-[13.5px] font-semibold disabled:opacity-40" style={{ background: "#00a884", color: "#04241d", height: 44 }}>
                {modal.mode === "add" ? "Add product" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
