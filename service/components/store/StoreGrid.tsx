"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, Package, MessageCircle, ChevronLeft } from "lucide-react";
import { BsPatchCheckFill } from "react-icons/bs";
import type { Product } from "@/lib/demo/products";
import { VIEWS, lowCount, statusOf, thumbFor, LOW_AT, type Item } from "@/lib/demo/catalog";
import { formatPrice, orderLink, waDigits, isVideoUrl } from "@/lib/store";
import type { StoreBusiness, StoreProduct } from "@/lib/storefront";
import ChatWallpaper from "@/components/story/ChatWallpaper";

const CONDITIONS = ["New", "UK Used", "Used"] as const;

/** Blue-tick verified badge — real library seal (react-icons BsPatchCheckFill). */
function BlueTick({ size = 18 }: { size?: number }) {
  return (
    <BsPatchCheckFill
      size={size}
      title="Verified"
      aria-label="Verified"
      style={{ color: "#1D9BF0", flexShrink: 0, display: "block" }}
    />
  );
}

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
  const [bannerBroken, setBannerBroken] = useState(false);

  // Banner — custom upload only. No banner = slim gradient strip, never a
  // stock photo: the products are the hero, the cover just sets the tone.
  const customBanner = ((business as { bannerImage?: unknown }).bannerImage as string | undefined || "").trim();

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
  const inStockCount = products.filter((p) => p.quantity > 0).length;
  const featured = useMemo(() => [...products].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 4), [products]);

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

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 sm:px-6">
        {/* Channel header, YouTube-compact: slim cover, one avatar row, then
            straight into search + products. Nothing above the fold but the shop. */}
        <div className="relative -mx-4 sm:-mx-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="relative h-20 w-full overflow-hidden sm:h-28" style={{ background: "linear-gradient(135deg, #0b3d33 0%, #0e151a 55%, #111b21 100%)" }}>
            {customBanner && !bannerBroken && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={customBanner}
                alt=""
                draggable={false}
                onError={() => setBannerBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
            )}
          </div>

          <div className="flex items-center gap-3 px-4 py-3 sm:px-6" style={{ background: "rgba(17,27,33,0.92)", backdropFilter: "blur(12px)" }}>
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[17px] font-extrabold" style={{ background: "#00a884", color: "#04241d", border: "2px solid #111b21" }}>
              {business.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.avatarUrl} alt={business.name} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                initialsOf(business.name)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display flex items-center gap-1.5 truncate text-[17px] font-bold leading-tight" style={{ color: "#fff" }}>
                <span className="truncate">{business.name}</span>
                <BlueTick size={16} />
              </h1>
              <p className="mt-0.5 truncate text-[12px]" style={{ color: "#8a949b" }}>
                {products.length} products<span aria-hidden> · </span>
                <span style={{ color: inStockCount > 0 ? "#00d19f" : "#e8b45b" }}>{inStockCount > 0 ? `${inStockCount} in stock` : "Restocking"}</span>
              </p>
            </div>
            {chatHref ? (
              <a
                href={chatHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Chat with ${business.name} on WhatsApp`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                style={{ background: "#00a884", color: "#04241d" }}
              >
                <MessageCircle size={20} strokeWidth={2} />
              </a>
            ) : null}
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-4" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", height: 48, minWidth: 220 }}>
            <Search size={16} strokeWidth={1.75} style={{ color: "#8a949b" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search in ${business.name}…`}
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#636c73]"
              style={{ color: "#fff" }}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" style={{ color: "#8a949b" }}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Featured — top sellers, horizontal snap */}
        {!query && catFilter === "All" && condFilter === "All" && featured.length > 0 && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="font-display text-[17px] font-bold" style={{ color: "#fff" }}>Featured picks</h2>
              <p className="text-[12px]" style={{ color: "#8a949b" }}>Best sellers this week</p>
            </div>
            <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {featured.map((p) => {
                const price = formatPrice(p.price, business.currency);
                return (
                  <button
                    key={p.id}
                    onClick={() => openDetail(p.id)}
                    className="flex w-[220px] shrink-0 snap-start items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.98]"
                    style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,168,132,0.3)", backdropFilter: "blur(12px)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image || thumbOf(p, 0)} alt="" draggable={false} className="h-16 w-16 shrink-0 rounded-xl object-cover" style={{ background: "#0e151a" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold" style={{ color: "#fff" }}>{p.name}</span>
                      <span className="mt-0.5 block text-[13px] font-bold tabular-nums" style={{ color: "#00d19f" }}>{price}</span>
                      <span className="block text-[11px]" style={{ color: "#8a949b" }}>{p.sold > 0 ? `${p.sold.toLocaleString()} sold` : `${p.quantity} left`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-6 flex items-baseline justify-between px-1">
          <h2 className="font-display text-[17px] font-bold" style={{ color: "#fff" }}>Shop all</h2>
          <p className="text-[12px] tabular-nums" style={{ color: "#8a949b" }}>{filtered.length} items</p>
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
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-3xl transition outline-none hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[#00a884]"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.42)", backdropFilter: "blur(12px)" }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden" style={{ background: "#0e151a" }}>
                    {isVideoUrl(p.image) ? (
                      <video src={p.image} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image || thumbOf(p, 0)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover transition duration-300 group-hover:scale-[1.05]" loading="lazy" />
                    )}
                    <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ background: "rgba(0,0,0,0.6)", color: out ? "#e66a6a" : "#00d19f", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}>
                      {isVideoUrl(p.image) ? `▶ ${s.label}` : s.label}
                    </span>
                    {p.sold > 0 && (
                      <span className="absolute bottom-2.5 left-2.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold tabular-nums" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}>
                        {p.sold.toLocaleString()} sold
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-4">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "#8a949b" }}>
                      {p.category} · <span style={{ color: conditionColor(p.condition) }}>{p.condition || "New"}</span>
                    </p>
                    <h3 className="mt-1 line-clamp-2 min-h-[38px] text-[14px] font-bold leading-snug" style={{ color: "#fff" }}>{p.name}</h3>
                    <p className="mt-1 text-[11.5px]" style={{ color: "#8a949b" }}>
                      <span style={isLow ? lowCount : undefined}>{out ? "Out of stock" : `${p.quantity} left`}</span>
                    </p>
                    <p className="mt-1.5 text-[17px] font-extrabold tabular-nums" style={{ color: "#fff" }}>{price}</p>
                    {out || !digits ? (
                      <span className="mt-3 flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-2xl px-2 text-[13px] font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#636c73" }}>
                        {out ? "Out of stock" : "Order in chat"}
                      </span>
                    ) : (
                      <a
                        href={orderLink(business.phone, business.name, p.name, price)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 text-[13.5px] font-bold transition active:scale-[0.98]"
                        style={{ background: "#00a884", color: "#04241d" }}
                      >
                        <MessageCircle size={16} strokeWidth={2.25} className="shrink-0" /> <span className="truncate">Order now</span>
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-8 border-t py-5 text-center text-[12px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "#636c73" }}>
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
            <div className="max-h-[92dvh] w-full max-w-[880px] overflow-y-auto rounded-t-3xl sm:rounded-3xl" style={{ background: "rgba(17,27,33,0.97)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)", paddingBottom: "calc(0rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b px-5 py-3.5" style={{ background: "rgba(17,27,33,0.95)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
                <button onClick={() => setSelectedId(null)} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10" aria-label="Back to store" style={{ color: "#aebac1" }}>
                  <ChevronLeft size={18} />
                </button>
                <p className="truncate text-[14px] font-semibold" style={{ color: "#e9edef" }}>{business.name} · {selected.name}</p>
              </div>

              <div className="grid gap-6 p-5 md:grid-cols-[1.05fr_1fr] md:p-7">
                <div>
                  <div className="relative overflow-hidden rounded-3xl" style={{ background: "#0e151a", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {isVideoUrl(selected.image) ? (
                      <video key={selected.id} src={selected.image} controls playsInline preload="metadata" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img key={activeImg} src={selected.image || thumbOf(selected, activeImg)} alt={selected.name} draggable={false} className="aspect-[4/3] w-full object-cover" />
                      </>
                    )}
                    <span className="absolute left-3 top-3 rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ background: "rgba(0,0,0,0.6)", color: out ? "#e66a6a" : "#00d19f", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}>
                      {s.label} · {out ? "unavailable" : `${selected.quantity} left`}
                    </span>
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
                  <div className="mt-4 flex flex-col gap-2.5">
                    {out || !digits ? (
                      <span className="flex min-h-[52px] w-full items-center justify-center whitespace-nowrap rounded-2xl px-4 text-[14px] font-bold" style={{ background: "rgba(255,255,255,0.05)", color: "#636c73" }}>
                        {out ? "Out of stock" : "Order in chat"}
                      </span>
                    ) : (
                      <a
                        href={orderLink(business.phone, business.name, selected.name, price)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 text-[14px] font-bold transition active:scale-[0.99]"
                        style={{ background: "#00a884", color: "#04241d" }}
                      >
                        <MessageCircle size={17} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Order now on WhatsApp</span>
                      </a>
                    )}
                    {chatHref ? (
                      <a
                        href={chatHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 text-[14px] font-semibold transition active:bg-white/10"
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
