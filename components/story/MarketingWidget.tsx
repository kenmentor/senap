"use client";

import { products, formatNaira } from "@/lib/demo/products";
import type { ApprovalFlags } from "@/lib/demo/machine";

export default function MarketingWidget({
  visible,
  approvals,
  onDiscount
}: {
  visible: boolean;
  approvals: ApprovalFlags;
  onDiscount: (v: "set" | "keep") => void;
}) {
  if (!visible) return null;
  const p = products[0];
  return (
    <div data-scene="promo" className="panel mt-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-[var(--text-3)]">Promotion draft</p>
        <span
          className="rounded-full px-2 py-1 text-[10px] font-semibold"
          style={{ background: "rgba(232,181,91,0.15)", color: "var(--warning)" }}
        >
          AWAITING APPROVAL
        </span>
      </div>
      <p className="font-display mt-2 text-xl font-bold">EVERYDAY TOTE</p>
      <p className="text-sm text-[var(--text-2)]">
        {formatNaira(p.unitPrice)} · {p.quantity} available
      </p>
      <p className="mt-2 text-sm">“Meet your new everyday bag. Available now while stock lasts.”</p>
      <p className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "rgba(232,181,91,0.12)", color: "var(--warning)" }}>
        DISCOUNT: NEEDS OWNER INPUT
      </p>
      <p className="mt-3 text-sm font-medium">What discount should I include?</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onDiscount("set")}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{
            background: approvals.discount === "set" ? "var(--success)" : "var(--accent)",
            color: "#090A0C"
          }}
        >
          {approvals.discount === "set" ? "Discount noted ✓" : "Set discount"}
        </button>
        <button
          onClick={() => onDiscount("keep")}
          className="rounded-lg px-4 py-2 text-sm"
          style={{ border: "1px solid var(--border)" }}
        >
          {approvals.discount === "keep" ? "Keeping price ✓" : "Keep original price"}
        </button>
      </div>
    </div>
  );
}
