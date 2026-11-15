"use client";

import { salesSummary } from "@/lib/demo/orders";
import { formatNaira } from "@/lib/demo/products";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

const chart = [
  { d: "Mon", v: 8000 },
  { d: "Tue", v: 4000 },
  { d: "Thu", v: 12000 },
  { d: "Sat", v: 4000 }
];

export default function SalesDashboard({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div data-scene="sales" className="panel mt-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-[var(--text-3)]">Sales review · sample data</p>
        <span
          className="rounded-full px-2 py-1 text-[10px] font-semibold"
          style={{ background: "rgba(54,201,143,0.15)", color: "var(--success)" }}
        >
          REVIEWED
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-lg font-bold">{salesSummary.totalOrders}</p>
          <p className="text-[11px] text-[var(--text-3)]">orders</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-lg font-bold">{formatNaira(salesSummary.revenue)}</p>
          <p className="text-[11px] text-[var(--text-3)]">revenue (+{salesSummary.growthPct}% vs prev)</p>
        </div>
      </div>
      <div className="mt-2 h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <XAxis dataKey="d" tick={{ fill: "#6F7580", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [formatNaira(Number(v ?? 0)), "Revenue"]} />
            <Bar dataKey="v" fill="#FF8A3D" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-[var(--text-3)]">
        Best-seller: {salesSummary.bestSeller} · New: {salesSummary.newCustomers} · Returning: {salesSummary.returning}
      </p>
    </div>
  );
}
