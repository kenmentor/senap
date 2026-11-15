/**
 * Convert model markdown into WhatsApp-native text.
 * WhatsApp renders *bold*, _italic_, ~strike~ and ```code``` — but shows
 * **double stars**, # headers, [links](url) and backticks as raw symbols,
 * which is an instant AI tell. This strips/converts those before sending.
 * Idempotent: running it twice changes nothing.
 */
export function toWhatsAppFormat(input: string): string {
  let t = input ?? "";

  // 1. Park ```code fences``` (WhatsApp renders these fine) while we edit.
  const fences: string[] = [];
  const FENCE_MARK = "WA_FENCE_PLACEHOLDER_";
  t = t.replace(/```[\s\S]*?```/g, (m) => {
    fences.push(m);
    return `${FENCE_MARK}${fences.length - 1}@@`;
  });

  // 2. **bold** -> *bold* (WhatsApp single-asterisk bold).
  t = t.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // 3. # Headings -> plain lines.
  t = t.replace(/^#{1,6}\s+/gm, "");

  // 4. [text](url) -> text (url).
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");

  // 5. `inline code` -> plain (single backticks show raw on WhatsApp).
  t = t.replace(/`([^`\n]+)`/g, "$1");

  // 6. "- item" / "* item" bullets -> "• item".
  t = t.replace(/^(\s*)[-*]\s+/gm, "$1• ");

  // 7. "> quote" -> plain.
  t = t.replace(/^(\s*)>\s?/gm, "$1");

  // 8. Horizontal rules (---, ***, ___) -> drop the line.
  t = t.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");

  // 9. Restore code fences.
  t = t.replace(new RegExp(`${FENCE_MARK}(\\d+)@@`, "g"), (_, i: string) => fences[Number(i)] ?? "");

  // 10. Collapse 3+ blank lines to one.
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

/** Strategy words from training material — for her brain only, never the chat. */
const INTERNAL_JARGON = [
  "demo closer",
  "trial-close",
  "trial close",
  "assumptive",
  "explicit permission",
  "pre-saved",
  "photo sequence",
  "green light",
  "zero matches",
  "no products matched",
  "my database",
  "let me search",
  "searching the",
  "checking stock",
  "backend",
  "pivot to",
  "dead-end",
  "dead end",
  "stock only once",
  "move to logistics",
  "tool call",
  "function call",
];

/**
 * Strip a leaked internal-monologue sentence: planning talk
 * ("I'll pick…", "I will list…") that only ever appears when the model
 * was thinking out loud. Runs AFTER the jargon filter as a second net.
 */
const PLANNING_VERBS = ["pick", "list", "avoid", "move", "focus", "prioritize", "display", "present", "select", "choose"];

function isPlanningTalk(sentence: string): boolean {
  return new RegExp(`\\bI(?:'ll| will)\\s+(?:${PLANNING_VERBS.join("|")})\\b`, "i").test(sentence);
}

/**
 * Strip reasoning-tag blocks (<think>, <reasoning>, …) including stray
 * openers/closers. GLM-style models think inside these tags and sometimes
 * leak them — even a lone "</think>" — into the reply. Segments sitting
 * between think markers are reasoning by definition, so they go too.
 */
const THINK_TAG = /<\/?(?:think|reasoning|analysis|scratchpad|thought)\b[^>]*>/gi;

function stripThinkBlocks(t: string): { text: string; stripped: boolean } {
  let stripped = false;
  // Paired or unclosed blocks first.
  let out = t.replace(/<(think|reasoning|analysis|scratchpad|thought)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, () => {
    stripped = true;
    return " ";
  });
  const markers = out.match(new RegExp(THINK_TAG.source, "gi")) ?? [];
  if (markers.length >= 2) {
    // e.g. "</think>...reasoning...</think>answer" — odd segments are thinking.
    const parts = out.split(new RegExp(THINK_TAG.source, "gi"));
    out = parts.filter((_, i) => i % 2 === 0).join(" ");
    stripped = true;
  } else if (markers.length === 1) {
    out = out.replace(new RegExp(THINK_TAG.source, "gi"), " ");
    stripped = true;
  }
  return { text: out, stripped };
}

/** Drop telemetry scribbles like "ga: p=3.28; n=5; b=30/100; g=1; wp=1". */
function isMetricSoup(line: string): boolean {
  const l = line.toLowerCase();
  if (/^\s*(ga|metrics|telemetry|tracking)\s*:/.test(l)) return true;
  const pairs = (l.match(/\b[a-z]{1,2}\s*=\s*[\d./%]+/g) ?? []).length;
  return pairs >= 3;
}
function matchBrace(t: string, open: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const INTERNAL_KEYS = new Set([
  "thought",
  "reasoning",
  "thinking",
  "analysis",
  "plan",
  "observation",
  "scratchpad",
  "action",
  "tool",
  "function",
  "name",
  "arguments",
]);

function looksInternalJson(span: string): boolean {
  try {
    const v = JSON.parse(span) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v).some((k) => INTERNAL_KEYS.has(k.toLowerCase()));
    }
    return false;
  } catch {
    return /"(thought|reasoning|thinking|analysis|plan|scratchpad)"\s*:/i.test(span);
  }
}

/** Remove balanced {...} spans that are clearly internal monologue, not chat text. */
function stripInternalJson(t: string): { text: string; stripped: boolean } {
  let out = "";
  let i = 0;
  let stripped = false;
  while (i < t.length) {
    if (t[i] === "{") {
      const end = matchBrace(t, i);
      if (end > i) {
        const span = t.slice(i, end + 1);
        if (looksInternalJson(span)) {
          stripped = true;
          i = end + 1;
          continue;
        }
        out += span;
        i = end + 1;
        continue;
      }
    }
    out += t[i];
    i++;
  }
  return { text: out, stripped };
}

/**
 * Final safety net before any text reaches a customer: remove leaked
 * reasoning JSON and strategy-talk sentences. If nothing customer-safe
 * remains, return a human fallback instead of silence or garbage.
 */
export function cleanReply(input: string): string {
  let t = (input ?? "").trim();
  if (!t) return t;

  const think = stripThinkBlocks(t);
  t = think.text;

  const json = stripInternalJson(t);
  t = json.text;
  // Even when the JSON/think block was unbalanced (no closing tag to strip),
  // its markers mean the model was thinking out loud.
  const leaked =
    json.stripped ||
    think.stripped ||
    /"(thought|reasoning|thinking|analysis|plan|scratchpad)"\s*:/i.test(t) ||
    /<\/?(think|reasoning|analysis|scratchpad|thought)\b/i.test(input);
  void leaked;

  const outLines: string[] = [];
  for (const rawLine of t.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      outLines.push("");
      continue;
    }
    const parts = line
      .split(/(?<=[.!?…]["'”’]?)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const kept = parts.filter((p) => {
      // Orphaned braces / quote-only shards from a stripped blob.
      if (/^[{}\s"'“”.,;:!?-]*$/.test(p)) return false;
      // Orphaned key opener, e.g. `{"thought": "`.
      if (/^[{"]?\s*"?(thought|reasoning|thinking|analysis|plan|scratchpad)\s*"?\s*:\s*"?$/i.test(p)) return false;
      // Tracking scribbles, e.g. "ga: p=3.28; …" or "next: deliver connection…".
      if (isMetricSoup(p)) return false;
      if (/^\s*(next|action|task|ga|metrics|telemetry)\s*:/i.test(p)) return false;
      const low = p.toLowerCase();
      if (INTERNAL_JARGON.some((j) => low.includes(j))) return false;
      if (leaked && isPlanningTalk(p)) return false;
      return true;
    });
    if (kept.length > 0) outLines.push(kept.join(" "));
  }
  t = outLines
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Tidy orphaned quotes left behind by stripped blobs.
  t = t.replace(/^["'“”\s.,;:]+/, "").replace(/["'“”\s.,;:]+$/, "").trim();

  if (!t) {
    return "Sorry, that one no clear — which phone you dey find? I go show you options with pictures.";
  }
  return t;
}
