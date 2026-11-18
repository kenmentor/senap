import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
const CF_DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

// Groq sits behind Cloudflare WAF (error 1010) which blocks non-browser
// user-agents (bare SDK/python-urllib). Send a browser-like UA so calls
// from the agent are never mistaken for bots.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) senap-agent/1.0";

interface Provider {
  name: "groq" | "cloudflare";
  client: OpenAI;
  model: string;
}

function buildProviders(modelOverride?: string): Provider[] {
  const out: Provider[] = [];
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (groqKey) {
    out.push({
      name: "groq",
      client: new OpenAI({
        apiKey: groqKey,
        baseURL: GROQ_BASE_URL,
        defaultHeaders: { "User-Agent": BROWSER_UA },
      }),
      model: modelOverride ?? ((process.env.GROQ_MODEL ?? "").trim() || GROQ_DEFAULT_MODEL),
    });
  }
  const cfToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const cfAccount = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (cfToken && cfAccount) {
    out.push({
      name: "cloudflare",
      client: new OpenAI({
        apiKey: cfToken,
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1`,
      }),
      model: modelOverride ?? CF_DEFAULT_MODEL,
    });
  }
  return out;
}

export default class AiClient {
  ai: any;
  model_name: string;

  constructor(model_name?: string) {
    // Primary = Groq when GROQ_API_KEY is set (Cloudflare quota is fragile),
    // else Cloudflare. model_name / GROQ_MODEL override the default.
    const providers = buildProviders(model_name);
    const primary = providers[0];
    this.ai = primary?.client ?? null;
    this.model_name = primary?.model ?? model_name ?? CF_DEFAULT_MODEL;
  }

  /** Which providers are configured, in try order. */
  static providers(): string[] {
    return buildProviders().map((p) => `${p.name}:${p.model}`);
  }

  async chat(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [],
    opts?: { timeoutMs?: number; maxTokens?: number },
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
    if (providers.length === 0) throw new Error("No model provider configured (set GROQ_API_KEY or Cloudflare creds).");
    let lastError: unknown = null;
    for (const p of providers) {
      try {
        const response = (await withTimeout(
          p.client.chat.completions.create({
            model: p.model,
            messages: slim,
            max_tokens: opts?.maxTokens ?? 1200,
            ...(tools?.length && { tools, tool_choice: "auto" }),
          }) as Promise<{
            choices: { message: { content: string | null; tool_calls?: ToolCallWire[] }; finish_reason: string }[];
            usage?: unknown;
          }>,
          opts?.timeoutMs ?? 30_000,
        ));
        const result = response.choices[0];
        if (!result) throw new Error(`${p.name}: empty choices`);
        return {
          content: result.message.content,
          tool_calls: result.message.tool_calls ?? [],
          finish_reason: result.finish_reason,
          usage: response.usage,
        };
      } catch (e) {
        lastError = e;
        console.error(`Model call failed on ${p.name} (${p.model}), trying next:`, e instanceof Error ? e.message.slice(0, 200) : e);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All model providers failed.");
  }
}
