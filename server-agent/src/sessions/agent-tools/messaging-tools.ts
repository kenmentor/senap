import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { loadBusiness, normalizeJid } from "./store.js";

export const messagingTools: ToolDefinition[] = [
  {
    name: "send_whatsapp_message",
    description:
      "OWNER ONLY. Send a WhatsApp message to a DIFFERENT number than the current chat (e.g. message a supplier or teammate). The current customer's reply is sent automatically — do not use this for the normal reply.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Phone number (e.g. '+234 801 234 5678') or full JID." },
        text: { type: "string", description: "Message text." },
      },
      required: ["to", "text"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const to = toolArgs.asString(args.to).trim();
      const text = toolArgs.asString(args.text).trim();
      if (!to || !text) return { error: "`to` and `text` are required." };
      try {
        const jid = normalizeJid(to);
        await ctx.sendText(jid, text);
        return { sent: true, to: jid };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Send failed." };
      }
    },
  },
  {
    name: "notify_owner",
    description:
      "Escalate the CURRENT conversation to the shop owner over WhatsApp: complaints you cannot resolve, big orders, fraud, or anything needing a human. Reports land on the verified admin line when one is set in the dashboard — otherwise on the line's own chat (every line answers to itself by default). It only ever messages the owner about this chat. Keep it short. Use sparingly — only for genuine escalation, never for chit-chat.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What the owner needs to know." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const business = await loadBusiness();
      const text = toolArgs.asString(args.text).trim();
      if (!text) return { error: "Message text is empty." };
      // Verified admin line first, else the shop number, else the line itself —
      // there is always somewhere for an escalation to go.
      const selfJid = ctx.sock?.user?.id ?? "";
      const targetJid = (() => {
        if (business?.adminVerified && business?.adminPhone) {
          try {
            return normalizeJid(business.adminPhone);
          } catch {
            /* fall through */
          }
        }
        if (business?.phone) {
          try {
            return normalizeJid(business.phone);
          } catch {
            /* fall through */
          }
        }
        return selfJid || "";
      })();
      if (!targetJid) return { error: "Owner phone is not configured and the line is offline." };
      try {
        await ctx.sendText(targetJid, `[agent] Escalation from ${ctx.customerJid}: ${text}`);
        return { sent: true, to: targetJid };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Send failed." };
      }
    },
  },
];
