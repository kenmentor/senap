import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

export default class AiClient {
  ai: any;
  model_name: string;

  constructor(model_name: string = "@cf/zai-org/glm-4.7-flash") {
    this.model_name = model_name;
    this.ai = new OpenAI({
      apiKey: process.env.CLOUDFLARE_API_TOKEN,
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    });
  }
  async chat(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [],
  ) {
    // Bound context/cost: cap message count + per-message chars (no unbounded
    // captions/tool outputs blowing up RAM or the Cloudflare bill).
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
    const response = (await withTimeout(
      this.ai.chat.completions.create({
        model: this.model_name,
        messages: slim,
        max_tokens: 1200,
        ...(tools?.length && { tools, tool_choice: "auto" }),
      }) as Promise<{
        choices: { message: { content: string | null; tool_calls?: ToolCallWire[] }; finish_reason: string }[];
        usage?: unknown;
      }>,
      30_000,
    ));

    const result = response.choices[0];

    return {
      content: result.message.content,
      tool_calls: result.message.tool_calls ?? [],
      finish_reason: result.finish_reason,
      usage: response.usage,
    };
  }
}
