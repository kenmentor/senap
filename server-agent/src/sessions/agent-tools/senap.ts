import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { findProducts, findProductByIdOrSku } from "./store.js";

/**
 * SENAP — the dedicated phone-domain tool. Anything about a device itself
 * (worth, condition, comparisons, which to buy, what a spec means) goes
 * through here first — never answered from vibes. All verdicts are grounded
 * in LIVE shop stock + Jiji-anchored fair prices.
 */

type ChipTier = "flagship" | "mid" | "budget";

interface ModelSpec {
  chip: string;
  tier: ChipTier;
  ram: string;
  storage: string;
  battery: string;
  camera: string;
  display: string;
  notes?: string;
}

/** Expert spec sheet for catalogue models (keyed by SKU). */
const SPECS: Record<string, ModelSpec> = {
  "TEC-001": { chip: "Helio G85", tier: "budget", ram: "8GB", storage: "256GB", battery: "5000mAh, ~2 days", camera: "50MP main", display: '6.6" 90Hz', notes: "Best value Tecno Spark; fingerprint + face unlock." },
  "TEC-002": { chip: "Helio G85", tier: "budget", ram: "8GB", storage: "128GB", battery: "5000mAh, ~2 days", camera: "50MP main", display: '6.6" 90Hz' },
  "TEC-003": { chip: "Helio G99", tier: "mid", ram: "8GB", storage: "256GB", battery: "5000mAh, 33W", camera: "108MP main", display: '6.78" 120Hz AMOLED-ish', notes: "G99 = smooth gaming at this price." },
  "TEC-004": { chip: "Helio G36", tier: "budget", ram: "4GB", storage: "256GB", battery: "5000mAh", camera: "50MP main", display: '6.6"' },
  "TEC-005": { chip: "Dimensity 7020 (5G)", tier: "mid", ram: "8GB", storage: "512GB", battery: "5000mAh, 70W", camera: "50MP OIS", display: '6.78" 120Hz AMOLED', notes: "Huge storage + 5G future-proofing." },
  "TEC-006": { chip: "Helio G100", tier: "mid", ram: "8GB", storage: "256GB", battery: "5000mAh, 20W wireless", camera: "50MP OIS", display: '6.78" AMOLED' },
  "INF-001": { chip: "Unisoc T606", tier: "budget", ram: "8GB", storage: "128GB", battery: "5000mAh, ~2 days", camera: "50MP main", display: '6.56" 90Hz', notes: "Side fingerprint. Strong battery phone." },
  "INF-002": { chip: "Helio G88", tier: "budget", ram: "8GB", storage: "256GB", battery: "5000mAh, 33W", camera: "50MP main", display: '6.78" 120Hz' },
  "INF-003": { chip: "Unisoc T606", tier: "budget", ram: "8GB", storage: "128GB", battery: "5000mAh", camera: "50MP main", display: '6.56" 90Hz' },
  "INF-004": { chip: "Helio G99", tier: "mid", ram: "8GB", storage: "256GB", battery: "5000mAh", camera: "108MP main", display: '6.78" 120Hz' },
  "INF-005": { chip: "Helio G99 Ultimate", tier: "mid", ram: "8GB", storage: "256GB", battery: "5000mAh, 70W", camera: "108MP OIS", display: '6.78" AMOLED 120Hz', notes: "Flagship-feel display + fastest charging in class." },
  "INF-006": { chip: "Helio G99 Ultimate", tier: "mid", ram: "12GB", storage: "256GB", battery: "5000mAh, 70W", camera: "108MP OIS", display: '6.78" AMOLED 120Hz' },
  "SAM-001": { chip: "Helio G99", tier: "mid", ram: "8GB", storage: "128GB", battery: "5000mAh, 25W", camera: "50MP OIS", display: '6.7" Super AMOLED 90Hz', notes: "Samsung camera + screen quality at mid price." },
  "SAM-002": { chip: "Snapdragon 865 5G", tier: "flagship", ram: "8GB", storage: "128GB", battery: "4500mAh, 25W", camera: "64MP telephoto", display: '6.5" 120Hz AMOLED', notes: "Ex-flagship: still faster than most new mid-rangers." },
  "SAM-003": { chip: "Snapdragon 865 5G", tier: "flagship", ram: "8GB", storage: "128GB", battery: "4000mAh", camera: "64MP", display: '6.2" 120Hz AMOLED' },
  "SAM-004": { chip: "Snapdragon 8 Gen 3", tier: "flagship", ram: "8GB", storage: "256GB", battery: "4000mAh, 25W", camera: "50MP triple", display: '6.2" 120Hz AMOLED', notes: "Compact flagship. 7 years of Samsung updates." },
  "SAM-005": { chip: "Exynos 2100 5G", tier: "flagship", ram: "8GB", storage: "256GB", battery: "4000mAh, 25W", camera: "64MP triple", display: '6.2" 120Hz AMOLED' },
  "SAM-006": { chip: "Exynos 2100 5G", tier: "flagship", ram: "12GB", storage: "256GB", battery: "5000mAh, 45W", camera: "108MP + 100x zoom", display: '6.8" 120Hz AMOLED', notes: "100x Space Zoom, S-Pen support." },
  "RED-001": { chip: "Snapdragon 7s Gen 2", tier: "mid", ram: "8GB", storage: "256GB", battery: "5100mAh, 67W", camera: "200MP main", display: '6.67" AMOLED', notes: "200MP camera + huge battery — spec king of the shelf." },
  "RED-002": { chip: "Snapdragon 680", tier: "budget", ram: "6GB", storage: "128GB", battery: "5000mAh, 33W", camera: "50MP main", display: '6.43" AMOLED' },
  "APP-001": { chip: "A14 Bionic", tier: "flagship", ram: "6GB", storage: "128GB", battery: "~2815mAh, ~1 day", camera: "Triple 12MP + LiDAR", display: '6.1" Super Retina XDR', notes: "UK-used: confirm BH%, Face ID, true-tone before paying." },
  "APP-002": { chip: "A13 Bionic", tier: "flagship", ram: "4GB", storage: "128GB", battery: "~3110mAh", camera: "Dual 12MP", display: '6.1" Liquid Retina', notes: "UK-used: confirm BH%, Face ID, true-tone before paying." },
  "APP-003": { chip: "A11 Bionic", tier: "mid", ram: "3GB", storage: "256GB", battery: "~2691mAh", camera: "Dual 12MP + portrait", display: '5.5" Retina HD', notes: "Cheapest iPhone door; battery is the weak point — budget for a change." },
  "APP-004": { chip: "A15 Bionic", tier: "flagship", ram: "6GB", storage: "128GB", battery: "~3227mAh", camera: "Dual 12MP, Cinematic mode", display: '6.1" Super Retina XDR', notes: "UK-used: confirm BH%, Face ID, true-tone before paying." },
  "APP-005": { chip: "A15 Bionic", tier: "flagship", ram: "6GB", storage: "128GB", battery: "~4352mAh", camera: "Triple 12MP Pro", display: '6.7" ProMotion 120Hz', notes: "UK-used: confirm BH%, Face ID, true-tone before paying." },
  "ITL-001": { chip: "Octa-core", tier: "budget", ram: "8GB", storage: "128GB", battery: "5000mAh", camera: "Dual AI", display: '6.6"' },
  "ITL-002": { chip: "Octa-core", tier: "budget", ram: "4GB", storage: "64GB", battery: "5000mAh", camera: "Dual AI", display: '6.6"' },
  "ONE-001": { chip: "Snapdragon 8+ Gen 1", tier: "flagship", ram: "8GB", storage: "128GB", battery: "4800mAh, 150W", camera: "50MP Sony IMX766", display: '6.7" 120Hz AMOLED', notes: "150W = full charge in ~19 minutes." },
  "OPP-001": { chip: "Dimensity 1200", tier: "mid", ram: "12GB", storage: "256GB", battery: "4500mAh, 65W", camera: "50MP + Bokeh Flare", display: '6.55" 90Hz AMOLED', notes: "Portrait-video specialist." },
  "XIA-001": { chip: "Snapdragon 8 Gen 3", tier: "flagship", ram: "12GB", storage: "512GB", battery: "4610mAh, 90W", camera: "Leica 50MP triple", display: '6.36" 120Hz AMOLED', notes: "Leica cameras; compact flagship." },
};

const TIER_RANK: Record<ChipTier, number> = { flagship: 3, mid: 2, budget: 1 };

/** Short expert guides the agent can quote from (research answers). */
const KNOWLEDGE: { match: RegExp; answer: string }[] = [
  {
    match: /battery|mah|charge|last|drain/i,
    answer: "Battery truths: 5000mAh with normal use = 2 days for most people; heavy data/gaming = 1 day. 15–25W charging fills overnight fine; 65W+ fills in under an hour. For UK-used iPhones, Battery Health (BH) matters more than size: 85%+ is sharp, 80–84% is okay but plan a change, under 80% negotiate hard or walk away.",
  },
  {
    match: /bh\b|battery health/i,
    answer: "iPhone Battery Health (Settings → Battery → Battery Health): 85%+ means sharp, 80–84% means okay for now but budget a battery change soon, below 80% means price must drop hard. Always pair BH with a Face ID + true-tone check.",
  },
  {
    match: /\bfu\b|factory unlock|locked|esim|dual sim/i,
    answer: "Factory Unlocked (FU) works with all SIMs — never buy a locked one unless it's priced like scrap. Physical + eSIM means dual-line (two numbers, one phone). Test with your own SIM before paying.",
  },
  {
    match: /amoled|lcd|screen|display|120hz|refresh/i,
    answer: "AMOLED = deeper blacks and punchier colours than LCD; 90/120Hz = scrolling feels buttery. For movies and Instagram, AMOLED matters. For basic WhatsApp/calls, any clean screen does the job.",
  },
  {
    match: /ram|storage|gb\b|hang|lag|gaming/i,
    answer: "RAM truth: 4GB is minimum today (light use only), 8GB is the sweet spot (no hanging), 12GB+ is for heavy gaming/multitasking. Storage: 128GB fills fast with videos — photographers and video people should take 256GB.",
  },
  {
    match: /camera|mp\b|photo/i,
    answer: "Megapixels aren't everything — OIS (optical stabilisation) and the sensor matter more. 108MP/200MP numbers impress, but a clean 50MP with OIS takes steadier real-life shots. For sellers: camera + storage decide the price tier.",
  },
  {
    match: /uk.used|second.hand|fairly|tokunbo|used/i,
    answer: "UK-used buying rules: 1) BH 85%+ (iPhones), 2) Face ID/fingerprint works, 3) true-tone present (proves original screen), 4) test SIM + WiFi + camera on the spot, 5) collect receipt + at least 1-week warranty. No receipt = no deal.",
  },
  {
    match: /warranty|receipt|guarantee/i,
    answer: "Every phone leaves with a receipt and warranty — brand new gets full warranty, UK-used gets at least 1 week. No receipt, no deal — that's how you know a seller stands behind the phone.",
  },
  {
    match: /water|swim|rain|ip68/i,
    answer: "Treat every 'water-resistant' rating as splash-proof, not swim-proof — manufacturers don't cover water damage. Keep it away from pools and heavy rain regardless of the rating.",
  },
];

function naira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

function specFor(sku: string): ModelSpec | null {
  return SPECS[sku] ?? null;
}

function verdictFor(price: number, anchor: number): { tag: string; note: string } {
  if (!anchor || anchor <= 0) return { tag: "no-reference", note: "No Jiji reference for this one — price is the tag price." };
  const diff = (price - anchor) / anchor;
  if (diff <= -0.1) return { tag: "good-deal", note: `About ${Math.round(-diff * 100)}% under the street price — strong value.` };
  if (diff <= 0.1) return { tag: "fair", note: "Right around the street price — fair." };
  return { tag: "steep", note: `About ${Math.round(diff * 100)}% above street price — push a cheaper alternative unless the condition justifies it.` };
}

export const senapTools: ToolDefinition[] = [
  {
    name: "analyze_phone",
    description:
      "SENAP expert dossier on ONE phone: full spec breakdown in plain language, who it's for, condition + what to verify before paying, and a fair-price verdict vs the Jiji street anchor. Use it whenever a customer asks 'is X good?', 'tell me about X', or before recommending X. Pass a product id, SKU, or name.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        idOrSku: { type: "string", description: "Product id, SKU (e.g. APP-001), or exact name." },
        quotedPrice: { type: "number", description: "Optional: a price the customer mentions, to judge fair/steep." },
      },
      required: ["idOrSku"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const product = await findProductByIdOrSku(toolArgs.asString(args.idOrSku));
      if (!product) {
        const near = (await findProducts(toolArgs.asString(args.idOrSku), 3)).map((p) => p.name);
        return { error: "Not in our catalogue.", closestInStock: near };
      }
      const spec = specFor(product.sku);
      const quoted = toolArgs.asNumber(args.quotedPrice, 0);
      const verdict = verdictFor(quoted || product.unitPrice, product.unitPrice);
      const checks =
        product.condition === "New"
          ? ["Sealed pack — verify seal + warranty card in front of the customer.", "Confirm storage in Settings matches the box."]
          : ["Battery health (iPhones: 85%+ sharp, 80–84% budget a change, <80% walk or slash).", "Face ID/fingerprint + true-tone present (proves original screen).", "Test SIM, WiFi, camera, speaker on the spot.", "Collect receipt + at least 1-week warranty."];
      return {
        name: product.name,
        price: product.unitPrice,
        condition: product.condition,
        stock: product.quantity,
        status: product.status,
        imageUrl: product.imageUrl,
        hasPhoto: product.imageUrl.length > 0,
        specs: spec ?? { note: "Spec sheet not filed — sell from description + condition.", description: product.description },
        verdict,
        whoFor:
          spec?.tier === "flagship"
            ? "Power users, camera lovers, and anyone that wants the phone to still feel fast in 3 years."
            : spec?.tier === "mid"
              ? "The sweet spot: smooth daily use, good camera, fair price."
              : "Calls, WhatsApp, light socials, students and second lines.",
        verifyBeforePay: checks,
      };
    },
  },
  {
    name: "compare_phones",
    description:
      "SENAP side-by-side: compare 2–3 phones (ids/SKUs/names) on price, condition, chip tier, RAM/storage, battery, camera — then a plain-language verdict: which wins for battery life, for camera, for gaming, and for tight budgets, plus ONE overall pick. Use it the moment a customer is torn between options.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "2–3 product ids, SKUs, or names." },
      },
      required: ["items"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const wants = toolArgs.asStringArray(args.items).slice(0, 3);
      if (wants.length < 2) return { error: "Give me 2–3 phones to compare." };
      const rows = [];
      for (const w of wants) {
        const p = await findProductByIdOrSku(w);
        if (!p) return { error: `"${w}" is not in our catalogue.` };
        rows.push({ ...p, spec: specFor(p.sku) });
      }
      const byTier = [...rows].sort((a, b) => (TIER_RANK[b.spec?.tier ?? "budget"] - TIER_RANK[a.spec?.tier ?? "budget"]) || (b.unitPrice - a.unitPrice));
      const cheapest = [...rows].sort((a, b) => a.unitPrice - b.unitPrice)[0];
      const pick = byTier[0].quantity > 0 ? byTier[0] : (rows.find((r) => r.quantity > 0) ?? byTier[0]);
      return {
        table: rows.map((r) => ({
          name: r.name,
          price: r.unitPrice,
          condition: r.condition,
          chip: r.spec?.chip ?? "—",
          ram: r.spec?.ram ?? "—",
          storage: r.spec?.storage ?? "—",
          battery: r.spec?.battery ?? "—",
          camera: r.spec?.camera ?? "—",
          stock: r.quantity,
        })),
        verdict: {
          fastest: byTier[0].name,
          cheapest: cheapest.name,
          overallPick: pick.name,
          why: `${pick.name} balances ${pick.spec?.chip ?? "performance"}, ${pick.quantity} in stock, at ${naira(pick.unitPrice)} — the safest recommendation of the bunch.`,
        },
      };
    },
  },
  {
    name: "suggest_phone",
    description:
      "SENAP recommender: shortlist LIVE in-stock phones for a budget + use + condition. Use it for 'what should I buy?', 'best phone under X', 'good camera phone', 'strong battery'. Returns ranked picks with reasons and a dealer one-liner each — send photos with send_media, then pitch the top pick first.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        maxPrice: { type: "number", description: "Customer's ceiling in naira, e.g. 200000. Omit for no cap." },
        use: { type: "string", description: "One of: battery, camera, gaming, general, cheap. Defaults to general." },
        condition: { type: "string", description: "New, UK Used, Used, or any. Defaults to any." },
        limit: { type: "number", description: "How many to shortlist (default 3, max 5)." },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      const max = toolArgs.asNumber(args.maxPrice, 0);
      const use = toolArgs.asString(args.use, "general").toLowerCase();
      const cond = toolArgs.asString(args.condition, "any");
      const limit = Math.min(Math.max(Math.floor(toolArgs.asNumber(args.limit, 3)), 1), 5);
      const all = await findProducts("", 10);
      let pool = all.filter((p) => p.quantity > 0);
      if (max > 0) pool = pool.filter((p) => p.unitPrice <= max);
      if (["New", "UK Used", "Used"].includes(cond)) pool = pool.filter((p) => p.condition === cond);
      const score = (p: (typeof all)[number]): number => {
        const tier = TIER_RANK[specFor(p.sku)?.tier ?? "budget"];
        let s = tier * 10;
        if (use === "battery" && /5000|5100/i.test(specFor(p.sku)?.battery ?? "")) s += 8;
        if (use === "camera" && /108MP|200MP|50MP/i.test(specFor(p.sku)?.camera ?? "")) s += 8;
        if (use === "gaming" && tier >= 2) s += 8;
        if (use === "cheap") s += Math.max(0, 10 - p.unitPrice / 50000);
        if (p.condition === "New") s += 1;
        return s;
      };
      const ranked = pool.sort((a, b) => score(b) - score(a)).slice(0, limit);
      return {
        picks: ranked.map((p) => ({
          name: p.name,
          price: p.unitPrice,
          condition: p.condition,
          stock: p.quantity,
          imageUrl: p.imageUrl,
          hasPhoto: p.imageUrl.length > 0,
          why: `${p.condition} • ${specFor(p.sku)?.chip ?? p.category} • ${naira(p.unitPrice)}`,
          dealerLine: `${p.name} — ${p.condition === "New" ? "brand new, sealed" : p.condition.toLowerCase()} — just ${Math.round(p.unitPrice / 1000)}k${p.quantity <= 5 ? " (only " + p.quantity + " left)" : ""}`,
        })),
        note: ranked.length === 0 ? "Nothing in stock matches — tell the customer plainly and offer to source it." : undefined,
      };
    },
  },
  {
    name: "phone_knowledge",
    description:
      "SENAP research desk: plain-language expert answers about phone matters — battery/BH, factory-unlock/eSIM, AMOLED vs LCD, RAM/storage sizing, cameras, UK-used safety checklist, warranty. Use it when the customer asks HOW/WHY questions ('is AMOLED good?', 'what BH should I accept?') so the answer sounds like a dealer, not a manual.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The customer's question or topic, e.g. 'is 5000mAh enough', 'what BH is good'." },
      },
      required: ["topic"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const q = toolArgs.asString(args.topic);
      const hit = KNOWLEDGE.find((k) => k.match.test(q));
      return {
        answer: hit?.answer ?? "Good question — that one depends on the exact model. Ask which phone they're eyeing and run analyze_phone on it for a grounded answer.",
      };
    },
  },
];
