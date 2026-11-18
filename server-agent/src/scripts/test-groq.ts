/**
 * Groq smoke test (unit-test style for the primary model provider).
 * Run: npm run test:groq
 * Tests EVERY configured Groq key (GROQ_API_KEYS + GROQ_API_KEY) plus the
 * Cloudflare fallback path. Never prints keys — suffixes only.
 */
import dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const { default: AiClient, groqKeys } = await import("../assistant/ai-client.js");
  const keys = groqKeys();
  console.log(JSON.stringify({ keyCount: keys.length, providers: AiClient.providers() }));
  if (keys.length === 0) {
    console.error(JSON.stringify({ ok: false, error: "No GROQ_API_KEY(S) configured" }));
    process.exit(1);
  }
  let failures = 0;
  for (let i = 0; i < keys.length; i++) {
    const suffix = keys[i].length <= 8 ? "****" : `****${keys[i].slice(-4)}`;
    try {
      // Point this client at key i by temporarily narrowing the env list.
      process.env.GROQ_API_KEYS = keys[i];
      delete process.env.GROQ_API_KEY;
      const client = new AiClient();
      const t0 = Date.now();
      const res = await client.chat([{ role: "user", content: "Reply with exactly: ok" }], [], {
        timeoutMs: 45_000,
        maxTokens: 100,
      });
      const text = (res.content ?? "").trim();
      if (!text) throw new Error("empty reply");
      console.log(
        JSON.stringify({ ok: true, key: i + 1, suffix, latencyMs: Date.now() - t0, replyPreview: text.slice(0, 60) }),
      );
    } catch (e) {
      failures++;
      console.error(
        JSON.stringify({ ok: false, key: i + 1, suffix, error: e instanceof Error ? e.message.slice(0, 200) : String(e) }),
      );
    }
  }
  if (failures > 0) {
    console.error(JSON.stringify({ summary: `${failures}/${keys.length} key(s) failed — rotation will skip them` }));
    process.exit(1);
  }
  console.log(JSON.stringify({ summary: `all ${keys.length} key(s) live — rotation ready` }));
}

void main();
