"use client";

import { products, formatNaira, stockValue } from "@/lib/demo/products";

export default function InventoryWidget({ visible }: { visible: boolean }) {
  const p = products[0];
  if (!visible) return null;
  return (
    <div data-scene="inventory" className="panel mt-3 rounded-xl p-4" style={{ borderRadius: 14 }}>
      <p className="text-xs uppercase tracking-widest text-[var(--text-3)]">Inventory check</p>
      <div className="mt-2 flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-lg text-lg"
          style={{ background: "rgba(255,138,61,0.15)" }}
          aria-hidden
        >
          👜
        </div>
        <div className="flex-1">
          <p className="font-medium">{p.name}</p>
          <p className="text-xs text-[var(--text-3)]">
            {p.sku} · {p.category}
          </p>
        </div>
        <span
          className="rounded-full px-2 py-1 text-[10px] font-semibold"
          style={{ background: "rgba(54,201,143,0.15)", color: "var(--success)" }}
        >
          COMPLETED
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-lg font-bold">{p.quantity}</p>
          <p className="text-[11px] text-[var(--text-3)]">units</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-lg font-bold">{formatNaira(p.unitPrice)}</p>
          <p className="text-[11px] text-[var(--text-3)]">each</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-lg font-bold">{formatNaira(stockValue)}</p>
          <p className="text-[11px] text-[var(--text-3)]">potential</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--text-3)]">{p.description}</p>
    </div>
  );
}
