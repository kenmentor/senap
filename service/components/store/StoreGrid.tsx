"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, MapPin, Phone } from "lucide-react";
import type { StoreBusiness, StoreProduct } from "@/lib/storefront";
import { formatPrice, orderLink, waDigits } from "@/lib/store";

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

function stockOf(p: StoreProduct): { label: string; color: string; bg: string } {
  if (p.quantity <= 0) return { label: "Out of stock", color: "#8a949b", bg: "rgba(0,0,0,0.05)" };
  if (p.quantity <= 5) return { label: `Only ${p.quantity} left`, color: "#9a6b00", bg: "rgba(232,180,91,0.18)" };
  return { label: "In stock", color: "#00704f", bg: "rgba(0,168,132,0.12)" };
}

function conditionStyle(condition: string): { color: string; bg: string } {
  if (/uk\s*used/i.test(condition)) return { color: "#9a6b00", bg: "rgba(232,180,91,0.9)" };
  if (/used/i.test(condition)) return { color: "#fff", bg: "rgba(90,100,106,0.9)" };
  return { color: "#04241d", bg: "rgba(0,168,132,0.9)" };
}

function ProductCard({
  p,
  business,
}: {
  p: StoreProduct;
  business: StoreBusiness;
}) {
  const [broken, setBroken] = useState(false);
  const stock = stockOf(p);
  const cond = conditionStyle(p.condition);
  const price = formatPrice(p.price, business.currency);
  const out = p.quantity <= 0;
  const digits = waDigits(business.phone);
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="relative aspect-square bg-[#e4eae8]">
        {p.image && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            draggable={false}
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[28px] font-extrabold text-[#9fb3b0]">
            {initialsOf(p.name)}
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: cond.bg, color: cond.color }}>
          {p.condition || "New"}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <p className="line-clamp-2 min-h-[36px] text-[13px] font-semibold leading-snug text-[#0b141a]">{p.name}</p>
        <p className="mt-1 text-[15px] font-extrabold tabular-nums" style={{ color: "#00704f" }}>{price}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px]">
          <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: stock.bg, color: stock.color }}>
            {stock.label}
          </span>
          {p.sold > 0 && <span className="text-[#8a949b]">{p.sold.toLocaleString()} sold</span>}
        </p>
        {out || !digits ? (
          <span className="mt-2.5 flex min-h-[44px] items-center justify-center rounded-xl text-[13px] font-bold text-[#8a949b]" style={{ background: "rgba(0,0,0,0.05)" }}>
            {out ? "Out of stock" : "Order in chat"}
          </span>
        ) : (
          <a
            href={orderLink(business.phone, business.name, p.name, price)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold text-white transition active:scale-[0.98]"
            style={{ background: "#00a884" }}
          >
            <MessageCircle size={16} strokeWidth={2.25} /> Order now
          </a>
        )}
      </div>
    </div>
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
  const [cat, setCat] = useState("All");

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const p of products) {
      const c = (p.category || "General").trim() || "General";
      if (!seen.includes(c)) seen.push(c);
    }
    return ["All", ...seen.sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const q = query.trim().toLowerCase();
  const visible = products.filter((p) => {
    if (cat !== "All" && (p.category || "General") !== cat) return false;
    if (!q) return true;
    return `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q);
  });

  const inStock = products.filter((p) => p.quantity > 0).length;
  const digits = waDigits(business.phone);

  return (
    <main className="min-h-screen bg-[#eef2f1] pb-28 text-[#0b141a]">
      <div className="mx-auto w-full max-w-[720px]">
        {/* Shop header */}
        <div className="bg-white px-4 pb-4 pt-6" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[20px] font-extrabold text-[#04241d]" style={{ background: "#00a884" }}>
              {initialsOf(business.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[19px] font-extrabold leading-tight">{business.name}</h1>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-[#5b6b72]">
                <MapPin size={12} className="shrink-0" /> {business.address || "Online store"}
              </p>
              {business.phone ? (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-[#5b6b72]">
                  <Phone size={12} className="shrink-0" /> {business.phone}
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-[12.5px] text-[#5b6b72]">
            {products.length} {products.length === 1 ? "product" : "products"}
            {inStock < products.length ? ` · ${inStock} in stock` : " · all in stock"}
          </p>
        </div>

        {/* Sticky search + categories */}
        <div className="sticky top-0 z-10 bg-[#eef2f1]/95 px-4 pb-2 pt-3" style={{ backdropFilter: "blur(10px)" }}>
          <label className="flex min-h-[48px] items-center gap-2 rounded-full bg-white px-4" style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
            <Search size={17} className="shrink-0 text-[#8a949b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${business.name}…`}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#9fb3b0]"
            />
          </label>
          {categories.length > 2 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className="shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95"
                  style={cat === c ? { background: "#0b141a", color: "#fff" } : { background: "#fff", color: "#5b6b72", border: "1px solid rgba(0,0,0,0.08)" }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="px-4 pt-1">
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-[13.5px] text-[#5b6b72]">
              {q ? `No matches for “${query.trim()}”. Try another word.` : "Nothing here yet — check back soon."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {visible.map((p) => (
                <ProductCard key={p.id} p={p} business={business} />
              ))}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-[12px] text-[#9fb3b0]">
          Powered by <Link href="/" className="font-bold" style={{ color: "#00704f" }}>Senap</Link>
        </p>
      </div>

      {/* Floating WhatsApp chat */}
      {digits ? (
        <a
          href={`https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${business.name}! I was browsing your store.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Chat with ${business.name} on WhatsApp`}
          className="fixed bottom-6 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95"
          style={{ background: "#00a884", marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <MessageCircle size={26} strokeWidth={2} />
        </a>
      ) : null}
    </main>
  );
}
