/** P3 lightweight pref extraction — patch sales-state prefs without an LLM call. */

const COLOURS = [
  "black", "white", "blue", "red", "green", "yellow", "gold", "silver", "grey", "gray",
  "brown", "pink", "purple", "orange", "navy", "beige", "cream", "maroon",
];

const CONDITIONS = ["brand new", "brand-new", "uk used", "uk-used", "used", "new"];

/** "size 42", "size: 42", "42" for shoes + phone storage "128gb/256gb". */
function extractSize(text: string): string | null {
  const t = (text ?? "").toLowerCase();
  const m = t.match(/\bsize\s*[:\-]?\s*(\d{1,2}(?:\.\d)?)\b/) ?? t.match(/\b(3[6-9]|4[0-7](?:\.\d)?)\b/);
  if (m) {
    const v = parseFloat(m[1]);
    if (v >= 30 && v <= 50) return String(m[1]);
  }
  const gb = t.match(/\b(32|64|128|256|512)\s*gb\b/);
  if (gb) return `${gb[1]}GB`;
  const ram = t.match(/\b(4|6|8|12|16)\s*gb\s*ram\b/);
  if (ram) return `${ram[1]}GB RAM`;
  return null;
}

function extractColour(text: string): string | null {
  const t = (text ?? "").toLowerCase();
  // "prefer black now", "i like the white one", "black one"
  for (const c of COLOURS) {
    if (new RegExp(`\\b${c}\\b`).test(t)) return c;
  }
  return null;
}

function extractCondition(text: string): string | null {
  const t = (text ?? "").toLowerCase();
  if (/\buk[\s-]?used\b/.test(t)) return "UK Used";
  if (/\bbrand[\s-]?new\b/.test(t)) return "Brand New";
  if (/\bused\b/.test(t)) return "Used";
  return null;
}

/** Category interest: first meaningful noun-ish chunk, capped. */
function extractInterest(text: string): string | null {
  const t = (text ?? "").trim().toLowerCase();
  const m = t.match(/(sneaker|shoe|boot|sandal|phone|iphone|samsung|tecno|infinix|redmi|itel|charger|laptop|bag|watch|shirt|trouser|jean|dress|wig|hair|perfume)s?\b/);
  if (m) return m[0].slice(0, 60);
  if (t.length >= 3 && t.length <= 60 && !/^(hi+|hello|thanks|bye|ok(ay)?)\b/.test(t)) {
    // Fallback: short product-ish queries ("Spark 20", "Hot 40i").
    if (/[a-z]+\s*\d/i.test(text) || t.split(/\s+/).length <= 4) return text.trim().slice(0, 60);
  }
  return null;
}

/**
 * Merge newly stated prefs into existing ones. Never deletes — "prefer black
 * now" overwrites colour but keeps size/budget (patch, never restart).
 */
export function extractPrefs(
  text: string,
  existing: Record<string, string> = {},
): Record<string, string> | null {
  const next: Record<string, string> = { ...existing };
  let changed = false;
  const size = extractSize(text);
  if (size && next.size !== size) {
    next.size = size;
    changed = true;
  }
  const colour = extractColour(text);
  if (colour && next.colour !== colour) {
    next.colour = colour;
    changed = true;
  }
  const condition = extractCondition(text);
  if (condition && next.condition !== condition) {
    next.condition = condition;
    changed = true;
  }
  const interest = extractInterest(text);
  if (interest && !next.interest) {
    next.interest = interest;
    changed = true;
  }
  return changed ? next : null;
}
