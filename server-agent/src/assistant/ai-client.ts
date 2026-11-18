import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
// Default to the fast model — replies in ~1s instead of 5s+. The bigger
// 120b reasons better but keeps customers waiting; switch via GROQ_MODEL
// (or per-call model_name) when depth matters more than speed.
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b";
const CF_DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

// Groq sits behind Cloudflare WAF (error 1010) which blocks non-browser
// user-agents (bare SDK/python-urllib). Send a browser-like UA so calls
// from the agent are never mistaken for bots.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) senap-agent/1.0";

// Cooldowns for keys that just failed, so a dead key isn't retried on every
// single message. Quota/rate-limit failures cool down longer (they reset
// with time); other errors are retried sooner in case they were transient.
const QUOTA_COOLDOWN_MS = 10 * 60_000;
const ERROR_COOLDOWN_MS = 60_000;
const cooldownUntil = new Map<string, number>();

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const status = (e as { status?: unknown } | null)?.status;
  return (
    status === 429 ||
    /429|quota|neuron|allocation|rate.?limit|exceeded|insufficient|402|payment required/i.test(msg)
  );
}

interface Provider {
  /** Unique id for cooldown tracking (includes key suffix when multi-key). */
  id: string;
  name: "groq" | "cloudflare";
  label: string;
  client: OpenAI;
  model: string;
}

/**
 * Every configured key becomes its own provider entry, in try order:
 * all Groq keys first (GROQ_API_KEYS comma/newline-separated, plus legacy
 * GROQ_API_KEY), then Cloudflare. Add a second Groq key and the agent
 * automatically fails over when the first runs out.
 */
export function groqKeys(): string[] {
  const raw = [
    ...(process.env.GROQ_API_KEYS ?? "").split(/[,\n]/),
    process.env.GROQ_API_KEY ?? "",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const key = k.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function keySuffix(key: string): string {
  return key.length <= 8 ? "****" : `****${key.slice(-4)}`;
}

function buildProviders(modelOverride?: string): Provider[] {
  const out: Provider[] = [];
  const groqModel = modelOverride ?? ((process.env.GROQ_MODEL ?? "").trim() || GROQ_DEFAULT_MODEL);
  for (const key of groqKeys()) {
    out.push({
      id: `groq:${keySuffix(key)}`,
      name: "groq",
      label: `groq:${groqModel} (${keySuffix(key)})`,
      client: new OpenAI({
        apiKey: key,
        baseURL: GROQ_BASE_URL,
        defaultHeaders: { "User-Agent": BROWSER_UA },
      }),
      model: groqModel,
    });
  }
  const cfToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const cfAccount = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (cfToken && cfAccount) {
    out.push({
      id: "cloudflare",
      name: "cloudflare",
      label: `cloudflare:${modelOverride ?? CF_DEFAULT_MODEL}`,
      client: new OpenAI({
        apiKey: cfToken,
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1`,
      }),
      model: modelOverride ?? CF_DEFAULT_MODEL,
    });
  }
  return out;
}

let bootLogged = false;

export default class AiClient {
  ai: any;
  model_name: string;

  constructor(model_name?: string) {
    // Primary = Groq keys in order when set (Cloudflare quota is fragile),
    // then Cloudflare. model_name / GROQ_MODEL override the default.
    const providers = buildProviders(model_name);
    const primary = providers[0];
    this.ai = primary?.client ?? null;
    this.model_name = primary?.model ?? model_name ?? CF_DEFAULT_MODEL;
    // One-time boot line so a missing GROQ_API_KEY on the server is obvious
    // in the logs (labels carry key suffixes only, never keys).
    if (!bootLogged) {
      bootLogged = true;
      console.log(`Model providers: ${providers.map((p) => p.label).join(" → ") || "NONE — set GROQ_API_KEY"}`);
    }
  }

  /** Which providers are configured, in try order (key suffixes only, never keys). */
  static providers(): string[] {
    return buildProviders().map((p) => p.label);
  }

  async chat(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [],
    opts?: { timeoutMs?: number; maxTokens?: number; reasoningEffort?: "low" | "medium" | "high" },
  ) {
    // Bound context/cost: cap message count + per-message chars (no unbounded
    // captions/tool outputs blowing up RAM or the model bill).
    const MAX_MSGS = 40;
    const MAX_CHARS = 2000;
    const slim = messages.slice(-MAX_MSGS).map((m) => {
      if (typeof m.content === "string" && m.content.length > MAX_CHARS) {
        return { ...m, content: m.content.slice(0, MAX_CHARS) + "…[truncated]" };
      }
      return m;
    });
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
      let t!: ReturnType<typeof setTimeout>;
      const to = new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new Error("Model call timed out.")), ms);
      });
      return Promise.race([p, to]).finally(() => clearTimeout(t));
    };
    interface ToolCallWire { id: string; function: { name: string; arguments: string } }
    const providers = buildProviders(this.model_name === CF_DEFAULT_MODEL ? undefined : this.model_name);
    if (providers.length === 0) throw new Error("No model provider configured (set GROQ_API_KEY(S) or Cloudflare creds).");
    // Prefer keys not in cooldown; if everything is cooling down, try them
    // anyway in order (a recovered key answers instead of a hard failure).
    const now = Date.now();
    const fresh = providers.filter((p) => (cooldownUntil.get(p.id) ?? 0) <= now);
    const order = fresh.length > 0 ? fresh : providers;
    // Report the PRIMARY failure, not the last one: the fallback's error
    // (usually Cloudflare quota) otherwise masks what actually went wrong.
    let firstError: unknown = null;
    let lastError: unknown = null;
    for (const p of order) {
      try {
        const response = (await withTimeout(
          p.client.chat.completions.create({
            model: p.model,
            messages: slim,
            // 2000: reasoning models (gpt-oss) spend completion budget on
            // thinking first — 1200 starved long contexts into length
            // cutoffs, which came back as empty replies.
            max_tokens: opts?.maxTokens ?? 2000,
            ...(tools?.length && { tools, tool_choice: "auto" }),
            // Reasoning models (gpt-oss) spend most of their time thinking;
            // micro-calls (probes, classifiers, holding lines) get "low".
            ...(opts?.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
          } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]) as Promise<{
            choices: { message: { content: string | null; tool_calls?: ToolCallWire[] }; finish_reason: string }[];
            usage?: unknown;
          }>,
          opts?.timeoutMs ?? 30_000,
        ));
        const result = response.choices[0];
        if (!result) throw new Error(`${p.id}: empty choices`);
        cooldownUntil.delete(p.id);
        if (p !== order[0]) console.log(`Model failover: serving via ${p.label}`);
        return {
          content: result.message.content,
          tool_calls: result.message.tool_calls ?? [],
          finish_reason: result.finish_reason,
          usage: response.usage,
          provider: p.label,
        };
      } catch (e) {
        if (firstError === null) firstError = e;
        lastError = e;
        cooldownUntil.set(p.id, now + (isQuotaError(e) ? QUOTA_COOLDOWN_MS : ERROR_COOLDOWN_MS));
        console.error(
          `Model call failed on ${p.label}, trying next:`,
          e instanceof Error ? e.message.slice(0, 200) : e,
        );
      }
    }
    throw firstError instanceof Error ? firstError : lastError instanceof Error ? lastError : new Error("All model providers failed.");
  }
}
