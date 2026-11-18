"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, Package, MessageCircle, ChevronLeft, MapPin } from "lucide-react";
import type { Product } from "@/lib/demo/products";
import { VIEWS, lowCount, statusOf, thumbFor, LOW_AT, type Item } from "@/lib/demo/catalog";
import { formatPrice, orderLink, waDigits, isVideoUrl } from "@/lib/store";
import type { StoreBusiness, StoreProduct } from "@/lib/storefront";
import ChatWallpaper from "@/components/story/ChatWallpaper";

const CONDITIONS = ["New", "UK Used", "Used"] as const;

function conditionColor(c: string | undefined): string {
  if (c === "UK Used") return "#e8b45b";
  if (c === "Used") return "#8a949b";
  return "#00a884";
}

/** Shape the shared catalogue helpers expect (they only read id/name/quantity). */
const asItem = (p: StoreProduct): Item =>
  ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    quantity: p.quantity,
    unitPrice: p.price,
    costPrice: p.price,
    category: p.category,
    status: p.quantity <= 0 ? "Out" : p.quantity <= LOW_AT ? "Low" : "Available",
    condition: (p.condition || "New") as Item["condition"],
    description: p.description,
    image: p.image,
    sold: p.sold,
    updatedAt: Date.now(),
  }) as Item;

const thumbOf = (p: StoreProduct, view = 0): string =>
  thumbFor({ id: p.id, name: p.name } as Product, view);

function initialsOf(name: string): string {
  return (
    (name || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export default function StoreGrid({
  business,
  products,
}: {
  business: StoreBusiness;
  products: StoreProduct[];
}) {
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [condFilter, setCondFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== "All" && p.category !== catFilter) return false;
      if (condFilter !== "All" && (p.condition || "New") !== condFilter) return false;
      if (!q) return true;
      return [p.name, p.sku, p.category].join(" ").toLowerCase().includes(q);
    });
  }, [products, query, catFilter, condFilter]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))],
    [products],
  );

  const selected = selectedId ? products.find((p) => p.id === selectedId) ?? null : null;
  const digits = waDigits(business.phone);
  const chatHref = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${business.name}! I was browsing your store.`)}`
    : null;

  const openDetail = (id: string) => {
    setActiveImg(0);
    setSelectedId(id);
  };

  return (
    <main className="dark relative min-h-screen pb-28" style={{ background: "#000000", color: "#e9edef" }}>
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "#000000" }}>
        <ChatWallpaper opacity={0.38} image="/bg-chat-tile-dark.png" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.76)" }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-6 sm:px-6">
        {/* Shop banner — minimal: mark + name, nothing else */}
        <div className="overflow-hidden rounded-3xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3.5 px-4 py-4 sm:px-5" style={{ background: "linear-gradient(135deg, rgba(0,168,132,0.22), rgba(0,168,132,0.04) 55%, rgba(255,255,255,0.02))" }}>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[20px] font-extrabold" style={{ background: "#00a884", color: "#04241d" }}>
              {initialsOf(business.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-[22px] font-bold leading-tight" style={{ color: "#e9edef" }}>{business.name}</h1>
              {business.address ? (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[12px]" style={{ color: "#8a949b" }}>
                  <MapPin size={12} className="shrink-0" /> {business.address}
                </p>
              ) : null}
            </div>
            {chatHref ? (
              <a
                href={chatHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Chat with ${business.name} on WhatsApp`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                style={{ background: "#00a884", color: "#04241d" }}
              >
                <MessageCircle size={22} strokeWidth={2} />
              </a>
            ) : null}
          </div>
        </div>

        {/* Search */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", height: 44, minWidth: 220 }}>
            <Search size={16} strokeWidth={1.75} style={{ color: "#636c73" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[#636c73]"
              style={{ color: "#e9edef" }}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" style={{ color: "#636c73" }}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Filters: category pills + condition */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition active:scale-95"
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
              <option key={c} value={c} style={{ background: "#111b21" }}>{c === "All" ? "Any condition" : c}</option>
            ))}
          </select>
        </div>

        {/* Card grid — same look as the seller Products page */}
        {filtered.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl py-20" style={{ border: "1px dashed rgba(255,255,255,0.12)" }}>
            <Package size={22} strokeWidth={1.5} style={{ color: "#636c73" }} />
            <p className="mt-3 text-[14px] font-medium" style={{ color: "#aebac1" }}>
              {query ? `No matches for “${query.trim()}”` : "Nothing here yet — check back soon."}
            </p>
            {query ? (
              <button onClick={() => setQuery("")} className="mt-4 rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "#e9edef" }}>
                Clear search
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const s = statusOf(asItem(p));
              const isLow = p.quantity <= LOW_AT;
              const out = p.quantity <= 0;
              const price = formatPrice(p.price, business.currency);
              return (
                <article
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(p.id); } }}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl transition outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#00a884]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}
                >
                  <div className="relative aspect-square overflow-hidden" style={{ background: "#0e151a" }}>
                    {isVideoUrl(p.image) ? (
                      <video src={p.image} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image || thumbOf(p, 0)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                    )}
                    <span className="absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[10.5px] font-semibold" style={{ background: "rgba(0,0,0,0.65)", color: s.color, border: `1px solid ${s.color}44`, backdropFilter: "blur(6px)" }}>
                      {isVideoUrl(p.image) ? `▶ ${s.label}` : s.label}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>
                      {p.category} · <span style={{ color: conditionColor(p.condition) }}>{p.condition || "New"}</span>
                    </p>
                    <h3 className="mt-1 line-clamp-2 min-h-[38px] text-[13.5px] font-medium leading-snug" style={{ color: "#e9edef" }}>{p.name}</h3>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: "#8a949b" }}>
                      {p.sold > 0 ? (<><span>{p.sold.toLocaleString()} sold</span><span aria-hidden>·</span></>) : null}
                      <span style={isLow ? lowCount : undefined}>{out ? "Out of stock" : `${p.quantity} left`}</span>
                    </p>
                    <p className="mt-1.5 text-[16px] font-bold tabular-nums" style={{ color: "#e9edef" }}>{price}</p>
                    {out || !digits ? (
                      <span className="mt-2.5 flex min-h-[44px] items-center justify-center rounded-xl text-[13px] font-bold" style={{ background: "rgba(255,255,255,0.05)", color: "#636c73" }}>
                        {out ? "Out of stock" : "Order in chat"}
                      </span>
                    ) : (
                      <a
                        href={orderLink(business.phone, business.name, p.name, price)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="mt-2.5 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold transition active:scale-[0.98]"
                        style={{ background: "#00a884", color: "#04241d" }}
                      >
                        <MessageCircle size={16} strokeWidth={2.25} /> Order now
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-[12px]" style={{ color: "#636c73" }}>
          Powered by <Link href="/" className="font-bold" style={{ color: "#00a884" }}>Senap</Link>
        </p>
      </div>

      {/* Floating WhatsApp chat */}
      {chatHref ? (
        <a
          href={chatHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Chat with ${business.name} on WhatsApp`}
          className="fixed bottom-6 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95"
          style={{ background: "#00a884", marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <MessageCircle size={26} strokeWidth={2} />
        </a>
      ) : null}

      {/* Detail view — tap a card (buyer version: order instead of edit) */}
      {selected && (() => {
        const s = statusOf(asItem(selected));
        const out = selected.quantity <= 0;
        const price = formatPrice(selected.price, business.currency);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setSelectedId(null)}>
            <div className="max-h-[92dvh] w-full max-w-[880px] overflow-y-auto rounded-t-3xl sm:rounded-3xl" style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)", paddingBottom: "calc(0rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b px-5 py-3.5" style={{ background: "rgba(17,27,33,0.95)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
                <button onClick={() => setSelectedId(null)} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10" aria-label="Back to store" style={{ color: "#aebac1" }}>
                  <ChevronLeft size={18} />
                </button>
                <p className="truncate text-[14px] font-semibold" style={{ color: "#e9edef" }}>{selected.name}</p>
              </div>

              <div className="grid gap-6 p-5 md:grid-cols-[1.05fr_1fr] md:p-7">
                <div>
                  <div className="overflow-hidden rounded-2xl" style={{ background: "#0e151a", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {isVideoUrl(selected.image) ? (
                      <video key={selected.id} src={selected.image} controls playsInline preload="metadata" className="aspect-square w-full object-cover" />
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img key={activeImg} src={selected.image || thumbOf(selected, activeImg)} alt={selected.name} draggable={false} className="aspect-square w-full object-cover" />
                      </>
                    )}
                  </div>
                  {selected.image ? null : (
                    <>
                      <div className="mt-3 grid grid-cols-4 gap-2.5">
                        {VIEWS.map((label, i) => (
                          <button key={label} onClick={() => setActiveImg(i)} aria-label={`View ${label}`} className="overflow-hidden rounded-xl transition active:scale-95" style={{ border: i === activeImg ? "2px solid #00a884" : "1px solid rgba(255,255,255,0.1)", opacity: i === activeImg ? 1 : 0.65 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbOf(selected, i)} alt="" draggable={false} className="aspect-square w-full object-cover" />
                          </button>
                        ))}
                      </div>
                      <p className="mt-2.5 text-[11.5px]" style={{ color: "#636c73" }}>{VIEWS.length} photos · tap a thumbnail to view</p>
                    </>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.1em" }}>{selected.category} · {selected.sku} · <span style={{ color: conditionColor(selected.condition) }}>{selected.condition || "New"}</span></p>
                  <h2 className="font-display mt-1.5 text-[24px] font-bold leading-tight" style={{ color: "#e9edef" }}>{selected.name}</h2>
                  <p className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: "#8a949b" }}>
                    {selected.sold > 0 ? (<><span>{selected.sold.toLocaleString()} sold</span><span aria-hidden>·</span></>) : null}
                    <span style={selected.quantity <= LOW_AT ? lowCount : undefined}>{out ? "Out of stock" : `${selected.quantity} left`}</span>
                  </p>
                  <p className="mt-3 text-[26px] font-extrabold tabular-nums" style={{ color: "#e9edef" }}>{price}</p>
                  <p className="mt-2.5 inline-block rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: statusOf(asItem(selected)).bg, color: statusOf(asItem(selected)).color }}>
                    {statusOf(asItem(selected)).label}
                  </p>
                  <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[12px] font-semibold uppercase" style={{ color: "#636c73", letterSpacing: "0.08em" }}>About this product</p>
                    <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "#aebac1" }}>{selected.description || "Ask us anything about this on WhatsApp."}</p>
                  </div>
                  <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                    {out || !digits ? (
                      <span className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl text-[14px] font-bold" style={{ background: "rgba(255,255,255,0.05)", color: "#636c73" }}>
                        {out ? "Out of stock" : "Order in chat"}
                      </span>
                    ) : (
                      <a
                        href={orderLink(business.phone, business.name, selected.name, price)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition active:scale-[0.99]"
                        style={{ background: "#00a884", color: "#04241d" }}
                      >
                        <MessageCircle size={16} strokeWidth={2.5} /> Order now on WhatsApp
                      </a>
                    )}
                    {chatHref ? (
                      <a
                        href={chatHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-semibold transition active:bg-white/10"
                        style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#e9edef" }}
                      >
                        Ask a question
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
