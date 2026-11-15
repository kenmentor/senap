"use client";

import { Check } from "lucide-react";
import { demoTasks } from "@/lib/demo/tasks";

export type TaskStatus = "pending" | "active" | "done" | "awaiting";

export function statusForTask(index: number, progress: number): TaskStatus {
  // plan visible 50-60%, then sequential activation
  if (progress < 0.5) return "pending";
  if (progress < 0.6) return index === 0 ? "active" : "pending";
  if (progress < 0.6875) return index === 0 ? "done" : index === 1 ? "active" : "pending";
  if (progress < 0.8) return index <= 0 ? "done" : index === 1 ? "awaiting" : index === 2 ? "active" : "pending";
  if (progress < 0.8875) return index <= 1 ? (index === 1 ? "awaiting" : "done") : index === 2 ? "done" : "active";
  if (progress < 0.95) return index === 3 ? "awaiting" : index === 1 ? "awaiting" : "done";
  return index === 1 || index === 3 ? "awaiting" : "done";
}

const label: Record<TaskStatus, string> = {
  pending: "QUEUED",
  active: "WORKING",
  done: "COMPLETED",
  awaiting: "NEEDS YOU"
};

export default function TaskTimeline({ progress }: { progress: number }) {
  return (
    <div data-scene="plan">
      <p className="text-xs uppercase tracking-widest text-[var(--text-3)]">Today&apos;s work</p>
      <div className="mt-3 space-y-2">
        {demoTasks.map((t, i) => {
          const s = statusForTask(i, progress);
          return (
          <div
            key={t.id}
            data-task={t.id}
            className="flex items-center gap-4 rounded-2xl px-5 py-4"
            style={{ border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}
          >
            <span className="text-sm text-[var(--text-3)]">0{i + 1}</span>
            <div className="flex-1">
              <p className="text-lg font-medium">{t.title}</p>
              <p className="text-sm text-[var(--text-3)]">{t.detail}</p>
            </div>
              <span
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold"
                style={{
                  background: s === "done" ? "rgba(54,201,143,0.15)" : s === "awaiting" ? "rgba(232,181,91,0.15)" : "rgba(255,255,255,0.06)",
                  color: s === "done" ? "var(--success)" : s === "awaiting" ? "var(--warning)" : "var(--text-2)"
                }}
              >
                {s === "done" && <Check size={12} />}
                {label[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
