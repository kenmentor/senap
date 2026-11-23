import AiClient from "../../assistant/ai-client.js";
import type { SalesState } from "./sales-state.js";

export type Emotion = "neutral" | "frustrated" | "excited" | "uncertain" | "urgent" | "satisfied";

export interface Perception {
  intent: string;
  emotion: Emotion;
  urgency: number; // 0-1
  confidence: number; // 0-1
}

const client = new AiClient();

const EMOTIONS: Emotion[] = ["neutral", "frustrated", "excited", "uncertain", "urgent", "satisfied"];

/** Cheap heuristics first: frustration/urgency/complaint signals, zero tokens. */
function heuristic(text: string): Partial<Perception> {
  const t = (text ?? "").toLowerCase();
  const out: Partial<Perception> = {};
  if (/(scam|fraud|angry|annoy|useless|nonsense|refund|complaint|waiting since|days? now|no response)/.test(t)) {
    out.emotion = "frustrated";
    out.urgency = 0.85;
  } else if (/(urgent|asap|now now|today (morning|evening)|emergency|quick)/.test(t)) {
    out.emotion = "urgent";
    out.urgency = 0.8;
  } else if (/(not sure|confused|which (is|should)|advice|recommend\?|help me choose)/.test(t)) {
    out.emotion = "uncertain";
    out.urgency = 0.4;
  } else if (/(love it|perfect|great|nice|thank you|thanks|i like)/.test(t)) {
    out.emotion = "satisfied";
    out.urgency = 0.3;
  }
  if (/(how (much|far)|price|cost|pay|deliver|available|stock|size)/.test(t)) {
    out.intent = "buying_signal";
  }
  return out;
}

/**
 * Perceive the social situation behind one message. Heuristics run first;
 * the LLM probe only fires on ambiguous input (same pattern as probeGroupIntent).
 * Never throws — failure returns a neutral perception so the reply still runs.
 */
export async function perceive(
  text: string,
  recent: string[],
  state: SalesState | null,
): Promise<Perception> {
  const h = heuristic(text);
  const needsProbe = !h.emotion || !h.intent;
  if (!needsProbe) {
    return {
      intent: h.intent ?? state?.intent ?? "browsing",
      emotion: h.emotion ?? "neutral",
      urgency: h.urgency ?? 0.4,
      confidence: 0.7,
    };
  }
  const context = recent.length > 0 ? `Recent:\n${recent.slice(-3).map((l) => `- ${l.slice(0, 160)}`).join("\n")}\n` : "";
  const system =
    "Classify one WhatsApp shop message. Reply with exactly one line of JSON, no code fences: " +
    '{"intent":"browsing|buying_signal|ready_to_buy|complaint|support|follow_up","emotion":"neutral|frustrated|excited|uncertain|urgent|satisfied","urgency":0-1}. ' +
    "ready_to_buy = names a product + size/payment/delivery intent. complaint = waiting/delay/wrong/fraud. " +
    `Current stage: ${state?.stage ?? "discovery"}.`;
  try {
    const res = await client.chat(
      [
        { role: "system", content: system },
        { role: "user", content: `${context}Now: ${text.slice(0, 500)}` },
      ],
      [],
      { timeoutMs: 10000, maxTokens: 100, reasoningEffort: "low" },
    );
    const line = (res.content ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(line) as Partial<{ intent: string; emotion: string; urgency: number }>;
    const emotion = EMOTIONS.includes(parsed.emotion as Emotion) ? (parsed.emotion as Emotion) : (h.emotion ?? "neutral");
    const urgency =
      typeof parsed.urgency === "number" ? Math.min(1, Math.max(0, parsed.urgency)) : (h.urgency ?? 0.4);
    return {
      intent: typeof parsed.intent === "string" && parsed.intent ? parsed.intent.slice(0, 40) : (h.intent ?? "browsing"),
      emotion,
      urgency,
      confidence: 0.8,
    };
  } catch {
    return {
      intent: h.intent ?? "browsing",
      emotion: h.emotion ?? "neutral",
      urgency: h.urgency ?? 0.4,
      confidence: 0.4,
    };
  }
}

/** Narrow Naira budget figures ("30k", "₦28,000") out of free text. */
export function extractBudgetNgn(text: string): number | null {
  const t = (text ?? "").toLowerCase();
  const k = t.match(/(\d[\d,]*)\s*k\b/);
  if (k) {
    const v = Math.round(parseFloat(k[1].replace(/,/g, "")) * 1000);
    if (v >= 1000 && v <= 50_000_000) return v;
  }
  const n = t.match(/(?:₦|ngn|naira)\s*([\d,]+(?:\.\d+)?)/);
  if (n) {
    const v = Math.round(parseFloat(n[1].replace(/,/g, "")));
    if (v >= 100 && v <= 50_000_000) return v;
  }
  return null;
}
