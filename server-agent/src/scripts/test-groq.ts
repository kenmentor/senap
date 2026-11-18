/**
 * Groq smoke test (unit-test style for the primary model provider).
 * Run: npm run test:groq
 * Checks GROQ_API_KEY is set, the key is accepted, and a tiny chat
 * completes on the configured model. Never prints the key.
 */
import dotenv from "dotenv";

dotenv.config();

const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
const model = (process.env.GROQ_MODEL ?? "").trim() || "openai/gpt-oss-120b";

function suffix(v: string): string {
  return v.length <= 8 ? "****" : `${v.slice(0, 4)}****${v.slice(-4)}`;
}

async function main(): Promise<void> {
  if (!groqKey) {
    console.error(JSON.stringify({ ok: false, error: "GROQ_API_KEY is missing" }));
    process.exit(1);
  }
  try {
    const { default: AiClient } = await import("../assistant/ai-client.js");
    console.log(JSON.stringify({ providers: AiClient.providers() }));
    const client = new AiClient();
    const t0 = Date.now();
    const res = await client.chat([{ role: "user", content: "Reply with exactly: ok" }], [], {
      timeoutMs: 45_000,
      maxTokens: 100,
    });
    const text = (res.content ?? "").trim();
    if (!text) {
      console.error(JSON.stringify({ ok: false, stage: "chat", error: "empty reply from model" }));
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        ok: true,
        stage: "chat",
        key: suffix(groqKey),
        latencyMs: Date.now() - t0,
        replyPreview: text.slice(0, 60),
      }),
    );
  } catch (e) {
    console.error(
      JSON.stringify({ ok: false, stage: "chat", error: e instanceof Error ? e.message.slice(0, 300) : String(e) }),
    );
    process.exit(1);
  }
}

void main();
