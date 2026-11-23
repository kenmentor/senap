import type { ToolContext } from "../sessions/agent-tools/tool-types.js";
import type { RoleMap } from "../roles/roles.js";

/**
 * Central authorization: roles never bypass permissions.
 * Interim (per owner request): permissive for everyday selling/service,
 * strict only for consequential actions. Single place to tighten later.
 */

const OWNER_ONLY_TOOLS = new Set([
  "send_broadcast",
  "execute_campaign",
  "plan_campaign",
  "post_status",
  "remove_member",
  "pin_message",
  "update_group_agent",
]);

/** Marketing bulk sends need the marketing duty + owner. Moderation needs moderator duty. */
export function canDo(tool: string, roles: RoleMap | null, ctx: ToolContext): { ok: boolean; reason?: string } {
  // Owner bypasses everything (self-chat / verified admin line).
  if (ctx.isOwner) return { ok: true };
  // Hard gate: owner-only tools stay owner-only while permissions are deferred.
  if (OWNER_ONLY_TOOLS.has(tool)) {
    return { ok: false, reason: `"${tool}" is restricted: only the shop owner can use it.` };
  }
  if (!roles) return { ok: true };
  // Duty gates: tell the model WHY it must not act, so it redirects cleanly.
  if ((tool === "create_order" || tool === "quote_order" || tool === "search_products") && !roles.salesperson) {
    return { ok: false, reason: "Sales duty is disabled for this shop — tell the customer the owner will help and call notify_owner." };
  }
  if ((tool === "schedule_task" || tool === "add_reminder") && !roles.personal_assistant) {
    return { ok: false, reason: "Assistant duty is disabled — tell the customer the owner will follow up." };
  }
  if ((tool === "send_broadcast" || tool === "plan_campaign") && !roles.marketing) {
    return { ok: false, reason: "Marketing duty is disabled." };
  }
  return { ok: true };
}
