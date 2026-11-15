"use client";

import { useEffect } from "react";
import { TriangleAlert, type LucideIcon } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red styling for destructive actions (delete/unlink). */
  danger?: boolean;
  icon?: LucideIcon;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Professional replacement for window.confirm: backdrop, card, icon, clear actions. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  icon: Icon = TriangleAlert,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const accent = danger ? "#e66a6a" : "#00a884";
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-[380px] rounded-t-3xl p-6 sm:rounded-3xl"
        style={{ background: "#111b21", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: danger ? "rgba(230,106,106,0.12)" : "rgba(0,168,132,0.12)", color: accent, border: `1px solid ${danger ? "rgba(230,106,106,0.4)" : "rgba(0,168,132,0.4)"}` }}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15.5px] font-semibold" style={{ color: "#e9edef" }}>{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "#8a949b" }}>{description}</p>
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl text-[13.5px] font-medium transition hover:bg-white/10 disabled:opacity-50"
            style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#aebac1", height: 44 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl text-[13.5px] font-semibold disabled:opacity-50"
            style={
              danger
                ? { background: "#e66a6a", color: "#fff", height: 44 }
                : { background: "#00a884", color: "#04241d", height: 44 }
            }
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
