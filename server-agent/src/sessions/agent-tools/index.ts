import type OpenAI from "openai";
import type { ToolContext, ToolDefinition } from "./tool-types.js";
import { TOOL_TIMEOUT_MS, toolArgs } from "./tool-types.js";
import { logToolUse } from "../tool-usage.js";
import { timeTools } from "./time-tools.js";
import { productTools } from "./product.js";
import { todoTools } from "./todo.js";
import { downloaderTools } from "./downloader.js";
import { shopTools } from "./shop-tools.js";
import { messagingTools } from "./messaging-tools.js";
import { contactTools } from "./contact-tools.js";
import { chatTools } from "./chat-tools.js";
import { groupTools } from "./group-tools.js";
import { statusTools } from "./status-tools.js";
import { jobTools } from "./jobs.js";
import { senapTools } from "./senap.js";
import { broadcastTools } from "./broadcast-tools.js";
import { groupAgentTools } from "./group-agent-tools.js";
import { outreachTools } from "./outreach-tools.js";
import { campaignTools } from "./campaign-tools.js";
import { webTools } from "./web-tools.js";
import { memoryTools } from "./memory-tools.js";
import { promptNoteTools } from "./prompt-note-tools.js";
import { orderTools } from "./order-tools.js";

export const ALL_TOOLS: ToolDefinition[] = [
  ...timeTools,
  ...productTools,
  ...todoTools,
  ...downloaderTools,
  ...shopTools,
  ...messagingTools,
  ...contactTools,
  ...chatTools,
  ...groupTools,
  ...statusTools,
  ...jobTools,
  ...senapTools,
  ...broadcastTools,
  ...groupAgentTools,
  ...outreachTools,
  ...campaignTools,
  ...webTools,
  ...memoryTools,
  ...promptNoteTools,
  ...orderTools,
];

export function toolSchemas(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return toolSchemasFor(true);
}

/**
 * Speed + focus: customers only ever see tools they may actually call
 * (customer scope + current-chat exceptions like send_media). Owner-only
 * management tools are rejected in code anyway — sending their schemas
 * just bloats every prompt by thousands of tokens and slows every reply.
 */
export function toolSchemasFor(owner: boolean): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const list = owner ? ALL_TOOLS : ALL_TOOLS.filter((t) => t.scope === "customer" || t.allowCurrentChat);
  return list.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}

function timeoutAfter<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tool "${name}" timed out.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * One-line "on it" acknowledgements — ONLY for heavy, infrequent tools that
 * genuinely take seconds (big downloads, broadcasts, campaigns, status
 * posts, non-photo media). Everyday tools stay silent and fast; spamming
 * "hold on" for everything is banned. Each line fires at most once per
 * agent run (retries don't re-announce).
 */
function heavyAck(name: string, args: Record<string, unknown>): string | null {
  switch (name) {
    case "download_file":
      return "On it — pulling that file now, one sec…";
    case "send_broadcast":
      return "On it — lining up that broadcast, sending in the background…";
    case "execute_campaign":
      return "On it — kicking off that campaign now…";
    case "post_status":
      return "Posting that to your status now…";
    case "send_media": {
      const kind = toolArgs.asString((args as Record<string, unknown>).kind, "image");
      return kind === "image" ? null : "Sending that over now — big files take a moment…";
    }
    default:
      return null;
  }
}

/**
 * Hard isolation gate. Owner-only tools are rejected here in code — the model
 * cannot talk its way around it, and customers can never reach another
 * customer's chats, contacts, or reminders through any tool.
 */
function deniedByScope(tool: ToolDefinition, ctx: ToolContext, args: Record<string, unknown>): boolean {
  if (tool.scope !== "owner" || ctx.isOwner) return false;
  if (tool.allowCurrentChat) {
    try {
      const target = tool.targetOf ? tool.targetOf(args, ctx) : ctx.customerJid;
      if (target && target === ctx.customerJid) return false;
    } catch {
      /* fall through to deny */
    }
  }
  return true;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}".` };
  if (deniedByScope(tool, ctx, args)) {
    return { error: `"${name}" is restricted: only the shop owner can use it.` };
  }
  // Heavy-tool acknowledgement (once per run): the customer sees "on it"
  // while a genuinely slow job works. Never blocks the tool on failure.
  try {
    const seen = ((ctx as unknown as { __ackedTools?: Set<string> }).__ackedTools ??= new Set<string>());
    if (!seen.has(name)) {
      const ack = heavyAck(name, args);
      if (ack) {
        seen.add(name);
        await ctx.sendText(ctx.customerJid, ack).catch(() => {});
      }
    }
  } catch {
    /* acknowledgement is cosmetic */
  }
  logToolUse(ctx.userId, name);
  const started = Date.now();
  try {
    return await timeoutAfter(tool.execute(args, ctx), TOOL_TIMEOUT_MS, name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    const ms = Date.now() - started;
    if (ms > 3000) console.log(`Tool "${name}" took ${ms}ms (over 3s — watch for stalls).`);
  }
}
