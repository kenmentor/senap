"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, QrCode, MessageCircle, ShoppingBag, Package, Wrench, Clock3, ShieldAlert } from "lucide-react";

type Overview = {
  totals: {
    users: number;
    lines: number;
    products: number;
    messages: number;
    messages7d: number;
    customerChats: number;
    profiles: number;
    activeSalesStates: number;
    orders: number;
    orderValue: number;
    pendingJobs: number;
  };
  series: { day: string; messages: number; orders: number; signups: number }[];
  topTools: { name: string; count: number }[];
  recentUsers: { email: string; name: string; joined: string | null; lines: number }[];
};

const card = {
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(0,0,0,0.35)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
} as const;

function num(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/overview");
        if (res.status === 403) {
          setDenied(true);
          return;
        }
        if (!res.ok) return;
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[720px] rounded-3xl px-4 py-10 text-center text-[13.5px]" style={{ ...card, color: "#8a949b" }}>
        Loading platform stats…
      </div>
    );
  }

  if (denied || !data) {
    return (
      <div className="mx-auto w-full max-w-[720px] rounded-3xl px-4 py-10 text-center" style={card}>
        <ShieldAlert size={26} style={{ color: "#e66a6a", margin: "0 auto" }} />
        <p className="mt-3 text-[15px] font-bold" style={{ color: "#fff" }}>Platform admin only</p>
        <p className="mt-1 text-[12.5px]" style={{ color: "#8a949b" }}>
          {denied
            ? "This account is not a platform admin."
            : "Could not load stats — is MongoDB running?"}
        </p>
      </div>
    );
  }

  const t = data.totals;
  const stats = [
    { icon: Users, label: "Shops (users)", value: num(t.users) },
    { icon: QrCode, label: "Linked lines", value: num(t.lines) },
    { icon: MessageCircle, label: "Messages (all time)", value: num(t.messages) },
    { icon: MessageCircle, label: "Messages (7d)", value: num(t.messages7d) },
    { icon: Users, label: "Customer chats", value: num(t.customerChats) },
    { icon: ShoppingBag, label: "Orders", value: `${num(t.orders)} · ₦${num(t.orderValue)}` },
    { icon: Package, label: "Products", value: num(t.products) },
    { icon: Clock3, label: "Pending jobs", value: num(t.pendingJobs) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3.5">
      <div>
        <h1 className="font-display text-[20px] font-bold leading-tight" style={{ color: "#e9edef" }}>Platform</h1>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "#8a949b" }}>General tracking — how the site is doing. Counts only, no message bodies.</p>
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl p-4" style={card}>
              <Icon size={17} style={{ color: "#00a884" }} />
              <p className="mt-2 truncate text-[16px] font-bold" style={{ color: "#fff" }}>{s.value}</p>
              <p className="truncate text-[11.5px]" style={{ color: "#8a949b" }}>{s.label}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-3xl px-4 py-4 sm:px-5" style={card}>
        <h2 className="px-1 text-[15px] font-bold" style={{ color: "#fff" }}>Last 14 days</h2>
        <div className="mt-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#636c73", fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fill: "#636c73", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#1f2c34", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#e9edef" }}
              />
              <Area type="monotone" dataKey="messages" name="Messages" stroke="#00a884" fill="rgba(0,168,132,0.18)" strokeWidth={2} />
              <Area type="monotone" dataKey="orders" name="Orders" stroke="#5b9cf6" fill="rgba(91,156,246,0.15)" strokeWidth={2} />
              <Area type="monotone" dataKey="signups" name="Signups" stroke="#e8b45b" fill="rgba(232,180,91,0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-3xl px-4 py-4 sm:px-5" style={card}>
        <h2 className="flex items-center gap-2 px-1 text-[15px] font-bold" style={{ color: "#fff" }}>
          <Wrench size={15} style={{ color: "#00a884" }} /> Top tools
        </h2>
        {data.topTools.length === 0 ? (
          <p className="mt-2 px-1 text-[12.5px]" style={{ color: "#8a949b" }}>No tool usage yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-white/10" style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12 }}>
            {data.topTools.map((tool) => (
              <li key={tool.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-[13px] font-medium" style={{ color: "#e9edef" }}>{tool.name.replace(/_/g, " ")}</span>
                <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "rgba(0,168,132,0.12)", color: "#00d19f" }}>{num(tool.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl px-4 py-4 sm:px-5" style={card}>
        <h2 className="px-1 text-[15px] font-bold" style={{ color: "#fff" }}>Newest shops</h2>
        {data.recentUsers.length === 0 ? (
          <p className="mt-2 px-1 text-[12.5px]" style={{ color: "#8a949b" }}>No shops yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-white/10" style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12 }}>
            {data.recentUsers.map((u) => (
              <li key={u.email} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold" style={{ color: "#e9edef" }}>{u.name} · {u.email}</span>
                  <span className="block text-[11.5px]" style={{ color: "#636c73" }}>
                    {u.joined ? new Date(u.joined).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} · {u.lines} line{u.lines === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
