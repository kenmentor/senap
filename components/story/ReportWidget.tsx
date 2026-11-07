"use client";

import type { ApprovalFlags } from "@/lib/demo/machine";
import { salesSummary } from "@/lib/demo/orders";
import { formatNaira } from "@/lib/demo/products";

export default function ReportWidget({
  visible,
  approvals,
  onShare
}: {
  visible: boolean;
  approvals: ApprovalFlags;
  onShare: (v: "approved" | "review") => void;
}) {
  if (!visible) return null;
  return (
    <div data-scene="report" className="panel mt-3 rounded-xl p-4">
      <p className="text-xs uppercase tracking-widest text-[var(--text-3)]">Sales report · spreadsheet preview</p>
      <div className="mt-2 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-3 gap-px text-xs" style={{ background: "var(--border)" }}>
          {["Item", "Orders", "Revenue"].map((h) => (
            <div key={h} className="px-3 py-2 font-semibold" style={{ background: "var(--bg-2)" }}>
              {h}
            </div>
          ))}
          {["Everyday Tote", String(salesSummary.totalOrders), formatNaira(salesSummary.revenue)].map((c, i) => (
            <div key={i} className="px-3 py-2" style={{ background: "var(--surface)" }}>
              {c}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 font-semibold">SALES REPORT READY</p>
      <p className="mt-1 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "rgba(232,181,91,0.12)", color: "var(--warning)" }}>
        SHARE WITH MR CHI? — contains customer summary. Approval required.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onShare("approved")}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: approvals.sharing === "approved" ? "var(--success)" : "var(--accent)", color: "#090A0C" }}
        >
          {approvals.sharing === "approved" ? "Approved ✓" : "Approve sharing"}
        </button>
        <button onClick={() => onShare("review")} className="rounded-lg px-4 py-2 text-sm" style={{ border: "1px solid var(--border)" }}>
          Review first
        </button>
      </div>
    </div>
  );
}
