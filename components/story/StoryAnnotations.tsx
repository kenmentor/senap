"use client";

export function annotationFor(progress: number): { title: string; body: string } {
  if (progress < 0.19) return { title: "AN AI EMPLOYEE AT WORK", body: "Watch one instruction become finished work. Scroll to begin." };
  if (progress < 0.4) return { title: "DELEGATE IN WORDS", body: "The owner speaks naturally — no forms, no tickets." };
  if (progress < 0.5) return { title: "SHE UNDERSTANDS", body: "Amaka reads stock, plans tasks, and flags what needs you." };
  if (progress < 0.6) return { title: "ONE INSTRUCTION. A PLAN.", body: "Talk becomes 4 traceable tasks with owners and states." };
  if (progress < 0.8) return { title: "EVIDENCE, NOT GUESSES", body: "Inventory from fixtures. Promo stays draft until you set the discount." };
  if (progress < 0.95) return { title: "REPORT WITH CARE", body: "Sales from seeded records. Sharing with Mr Chi needs your YES." };
  return { title: "YOU DIRECT. AMAKA WORKS.", body: "Some decisions still need you — and that is the point." };
}

export default function StoryAnnotations({ progress }: { progress: number }) {
  const a = annotationFor(progress);
  return (
    <div className="hidden w-[220px] lg:block">
      <p className="eyebrow">{a.title}</p>
      <p className="mt-2 text-sm text-[var(--text-2)]">{a.body}</p>
      <p className="mt-4 rounded-lg px-3 py-2 text-[11px] text-[var(--text-3)]" style={{ border: "1px solid var(--border)" }}>
        INTERACTIVE PRODUCT PREVIEW · SAMPLE BUSINESS DATA
      </p>
    </div>
  );
}
