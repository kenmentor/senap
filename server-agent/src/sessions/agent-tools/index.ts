import type OpenAI from "openai";
import type { ToolContext, ToolDefinition } from "./tool-types.js";
import { TOOL_TIMEOUT_MS } from "./tool-types.js";
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
  logToolUse(ctx.userId, name);
  try {
    return await timeoutAfter(tool.execute(args, ctx), TOOL_TIMEOUT_MS, name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
