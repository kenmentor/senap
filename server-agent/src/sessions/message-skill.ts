/**
 * MESSAGE SKILL — the single choke point between the AI's raw words and the
 * customer's screen. Disposable by design: one pure pipeline, no state, no
 * side effects, safe to swap out.
 *
 * Pipeline:  cleanReply()      — remove leaked thoughts, JSON, tracking junk
 *          → normalizeSpace()  — tabs, stray spaces, blank-line discipline
 *          → whatsappMarkup()  — markdown → WhatsApp-native (*bold*, • lists…)
 *          → polishStructure() — list spacing, punctuation tidying
 *
 * Usage: `prepareCustomerMessage(raw)` before ANY customer-facing send.
 * Never use it on internal text (prompts, logs) — only outbound chat.
 */
import { cleanReply } from "./format.js";

/** Tabs, trailing spaces, blank-line discipline. Idempotent. */
export function normalizeSpace(input: string): string {
  let t = (input ?? "").replace(/\t/g, " ");
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \u00a0]+$/g, ""))
    .join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * Markdown → WhatsApp-native markup. WhatsApp renders *bold*, _italic_,
 * ~strike~ and ```code``` — everything else from model-land shows raw, so:
 * __bold__ and **bold** -> *bold*; # headers -> *Title* (bold reads as the
 * professional heading on WhatsApp); -/* bullets -> •; [t](u) -> t (u);
 * `code` -> plain; > quotes -> plain; hr lines -> dropped.
 * Already-native markup passes through untouched. Idempotent.
 */
export function whatsappMarkup(input: string): string {
  let t = input ?? "";

  // 1. Park ```code fences``` (WhatsApp renders these fine) while we edit.
  const fences: string[] = [];
  const FENCE_MARK = "WA_FENCE_PLACEHOLDER_";
  t = t.replace(/```[\s\S]*?```/g, (m) => {
    fences.push(m);
    return `${FENCE_MARK}${fences.length - 1}@@`;
  });

  // 2. __bold__ and **bold** -> *bold*.
  t = t.replace(/__([^_]+)__/g, "*$1*");
  t = t.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // 3. # Headings -> *bold title line* (reads as a heading on WhatsApp).
  t = t.replace(/^#{1,6}\s*(.+)$/gm, "*$1*");

  // 4. [text](url) -> text (url).
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");

  // 5. `inline code` -> plain (single backticks show raw on WhatsApp).
  t = t.replace(/`([^`\n]+)`/g, "$1");

  // 6. "- item" bullets -> "• item" (dash only: a leading "*" without a
  //    space may open *bold*, so leave that form alone).
  t = t.replace(/^(\s*)-\s*/gm, "$1• ");
  t = t.replace(/^(\s*)-(?=\S)/gm, "$1• ");
  t = t.replace(/^(\s*)•(?!\s)/gm, "$1• ");

  // 7. "1.item" -> "1. item" (numbered lists WhatsApp renders as-is).
  t = t.replace(/^(\s*\d+)\.(?!\s)/gm, "$1. ");

  // 8. "> quote" -> plain.
  t = t.replace(/^(\s*)>\s?/gm, "$1");

  // 9. Horizontal rules (---, ***, ___) -> drop the line.
  t = t.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");

  // 10. Restore code fences.
  t = t.replace(new RegExp(`${FENCE_MARK}(\\d+)@@`, "g"), (_, i: string) => fences[Number(i)] ?? "");

  return t;
}

/** Final polish: collapse double spaces, tidy list rhythm, trim. Idempotent. */
export function polishStructure(input: string): string {
  let t = (input ?? "").replace(/[ \t]{2,}/g, " ");
  t = t
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

/** The full skill: raw AI words in, clean natural WhatsApp text out. */
export function prepareCustomerMessage(raw: string): string {
  return polishStructure(whatsappMarkup(normalizeSpace(cleanReply(raw))));
}
