"use client";

import { MessageCircle, ListChecks, Package, Megaphone, BarChart3, FileSpreadsheet } from "lucide-react";

const items = [
  { id: "conv", label: "Conversations", icon: MessageCircle, at: 0.05 },
  { id: "plan", label: "Planning", icon: ListChecks, at: 0.5 },
  { id: "inv", label: "Inventory", icon: Package, at: 0.6 },
  { id: "mkt", label: "Marketing", icon: Megaphone, at: 0.69 },
  { id: "bi", label: "Analytics", icon: BarChart3, at: 0.81 },
  { id: "rep", label: "Reports", icon: FileSpreadsheet, at: 0.89 }
];

export default function CapabilityRail({ progress, horizontal = false }: { progress: number; horizontal?: boolean }) {
  if (horizontal) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto" aria-label="Story progress">
        {items.map((it) => {
          const on = progress >= it.at;
          return (
            <span
              key={it.id}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: on ? "rgba(255,138,61,0.18)" : "rgba(255,255,255,0.05)",
                color: on ? "var(--text)" : "var(--text-3)"
              }}
            >
              {it.label}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div className="hidden w-[180px] flex-col gap-1 lg:flex" aria-label="Capabilities">
      {items.map((it) => {
        const on = progress >= it.at;
        const Icon = it.icon;
        return (
          <div
            key={it.id}
            data-rail={it.id}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
            style={{ color: on ? "var(--text)" : "var(--text-3)", background: on ? "rgba(255,138,61,0.1)" : "transparent" }}
          >
            <Icon size={16} color={on ? "var(--accent)" : "currentColor"} />
            {it.label}
            {on && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
          </div>
        );
      })}
    </div>
  );
}
