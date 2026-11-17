/**
 * Cloudflare Workers AI smoke test (unit-test style for the external service).
 * Run: npm run test:cloudflare
 * Checks:
 *   1. CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are set (values never printed).
 *   2. The token can reach the Cloudflare API (account verify).
 *   3. Workers AI can complete one tiny chat (the same path AiClient uses).
 * Exits 0 on success, 1 on failure. Only prints status + latency, never secrets.
 */
import dotenv from "dotenv";

dotenv.config();

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
const apiToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
const model = process.argv[2] ?? "@cf/zai-org/glm-4.7-flash";

function suffix(v: string): string {
  return v.length <= 4 ? "****" : `****${v.slice(-4)}`;
}

async function main(): Promise<void> {
  const started = Date.now();
  const checks: Record<string, string> = {};
  if (!accountId) {
    console.error(JSON.stringify({ ok: false, error: "CLOUDFLARE_ACCOUNT_ID is missing" }));
    process.exit(1);
  }
  if (!apiToken) {
    console.error(JSON.stringify({ ok: false, error: "CLOUDFLARE_API_TOKEN is missing" }));
    process.exit(1);
  }
  checks.env = "set";

  // 1) Token validity: lightweight account check (no AI cost).
  // Best-effort: narrow Workers-AI-only tokens can 403 here yet still
  // serve AI, so a verify failure warns but does NOT stop the chat probe.
  let verifyWarning: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, {
      headers: { authorization: `Bearer ${apiToken}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: { message?: string }[] };
    if (!res.ok || body.success !== true) {
      verifyWarning = body.errors?.[0]?.message ?? `verify failed (HTTP ${res.status})`;
      checks.verify = `warn: ${verifyWarning}`;
    } else {
      checks.verify = "ok";
    }
  } catch (e) {
    verifyWarning = e instanceof Error ? e.message : String(e);
    checks.verify = `warn: ${verifyWarning}`;
  }

  // 2) Workers AI chat via the exact OpenAI-compatible path the app uses.
  try {
    const { default: AiClient } = await import("../assistant/ai-client.js");
    const client = new AiClient(model);
    const t0 = Date.now();
    const res = await client.chat([{ role: "user", content: "Reply with exactly: ok" }], [], {
      timeoutMs: 45_000,
      maxTokens: 20,
    });
    const latencyMs = Date.now() - t0;
    const text = (res.content ?? "").trim();
    if (!text) {
      console.error(JSON.stringify({ ok: false, stage: "chat", error: "empty reply from model" }));
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        ok: true,
        stage: "chat",
        model,
        account: suffix(accountId),
        latencyMs,
        totalMs: Date.now() - started,
        replyPreview: text.slice(0, 60),
        checks,
      }),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        stage: "chat",
        error: e instanceof Error ? e.message : String(e),
        account: suffix(accountId),
      }),
    );
    process.exit(1);
  }
}

void main();
