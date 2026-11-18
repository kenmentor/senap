/**
 * Status → product pipeline test (offline, no model, no network).
 * Run: npm run test:status
 *
 * Verifies:
 *  1. Caption parsing (name + price sniffing) on realistic captions.
 *  2. The offline legitimacy decision (product → list, vibes → skip).
 *  3. Wiring: status@broadcast is routed to handleStatusPost, which calls
 *     the model classifier first and the offline fallback second, then
 *     creates the product.
 *  4. Config presence: Cloudflare creds (classifier) + Cloudinary (photos).
 *
 * NOTE: the model classifier itself needs live Cloudflare quota; when it is
 * down the pipeline degrades to check (2), which is what this script proves.
 */
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const here = dirname(fileURLToPath(import.meta.url));
const sessionSrc = readFileSync(join(here, "..", "sessions", "whatsapp-session.ts"), "utf8");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { parseStatusCaption, statusCaptionLooksSellish } = await import("../sessions/whatsapp-session.js");

  // 1. Price parsing.
  const priceCases: [string, number][] = [
    ["iPhone 11 256GB — just 220k", 220000],
    ["Infinix Hot 50i 8/128GB — 100k, box + receipt", 100000],
    ["Tecno Spark 20\n₦155,000 each", 155000],
    ["UK used iPhone 14 Pro 128GB $450", 450],
    ["Samsung A15 150k neg", 150000],
    ["New arrival, DM for price", 0],
  ];
  for (const [caption, want] of priceCases) {
    const got = parseStatusCaption(caption).price;
    check(`price "${caption.slice(0, 34)}…"`, got === want, `want ${want}, got ${got}`);
  }
  const named = parseStatusCaption("Tecno Spark 20\n₦155,000 each\nDM me");
  check("name = first line", named.name === "Tecno Spark 20", `got "${named.name}"`);

  // 2. Offline legitimacy decision.
  const sellish: [string, boolean][] = [
    ["iPhone 11 256GB — just 220k, DM me", true],
    ["New arrival! Infinix phones available, call 0803...", true],
    ["UK used laptops for sale, wholesale deals", true],
    ["Promo! 10% discount this weekend only", true],
    ["Good morning family ❤️ have a blessed day", false],
    ["Happy birthday to me 🎉", false],
    ["", false],
    ["Just vibes, out with the guys", false],
  ];
  for (const [caption, want] of sellish) {
    const got = statusCaptionLooksSellish(caption);
    check(`sellish "${caption.slice(0, 34)}"`, got === want, `want ${want}, got ${got}`);
  }

  // 3. Wiring (static — fails loudly if the route is ever removed).
  check(
    "messages.upsert routes status@broadcast → handleStatusPost",
    sessionSrc.includes('if (remoteJid === "status@broadcast")') &&
      sessionSrc.includes("await this.handleStatusPost(m, current, epoch)"),
  );
  check(
    "handleStatusPost tries model classifier first",
    sessionSrc.includes("classifyStatusPost(caption, kind)"),
  );
  check(
    "handleStatusPost falls back to offline decision",
    sessionSrc.includes("statusCaptionLooksSellish(caption)"),
  );
  check(
    "ownership gate (only the owner's own posts become products)",
    sessionSrc.includes("if (!mine) return;"),
  );
  check(
    "duplicate guard (processed ledger)",
    sessionSrc.includes('wasProcessed(this.userId, "status@broadcast", mid)'),
  );
  check(
    "creates the product + confirms on owner chat",
    sessionSrc.includes("createShopProduct({") && sessionSrc.includes("Saved to your store"),
  );

  // 4. Config presence (values never printed).
  check("CLOUDFLARE_ACCOUNT_ID set (classifier)", (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim().length > 0);
  check("CLOUDFLARE_API_TOKEN set (classifier)", (process.env.CLOUDFLARE_API_TOKEN ?? "").trim().length > 0);
  const cloudinary = (process.env.CLOUDINARY_URL ?? "").trim().length > 0;
  console.log(`${cloudinary ? "PASS" : "WARN"}  CLOUDINARY_URL ${cloudinary ? "set (photos hosted)" : "missing (photos embed as data URLs)"}`);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll status-pipeline checks passed (offline decision path).");
}

void main().catch((e) => {
  console.error("Test crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
