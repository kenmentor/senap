import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid } from "./store.js";

export const groupTools: ToolDefinition[] = [
  {
    name: "get_group_info",
    description:
      "Get a WhatsApp group's subject, description, and participant list with admin flags. OWNER ONLY.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
      },
      required: ["groupJid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = toolArgs.asString(args.groupJid).trim();
      if (!jid.endsWith("@g.us")) return { error: "That is not a group chat." };
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const metadata = await ctx.sock.groupMetadata(jid);
        return {
          subject: metadata.subject,
          description: metadata.desc ?? "",
          participants: metadata.participants.map((p) => ({ id: p.id, admin: p.admin ?? null })),
          participantCount: metadata.participants.length,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Group lookup failed." };
      }
    },
  },
  {
    name: "add_group_participants",
    description:       "Add one or more phone numbers to a group. Only works if this account is a group admin. OWNER ONLY.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
        phones: { type: "array", items: { type: "string" }, description: "Phone numbers to add." },
      },
      required: ["groupJid", "phones"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = toolArgs.asString(args.groupJid).trim();
      if (!jid.endsWith("@g.us")) return { error: "That is not a group chat." };
      const phones = toolArgs.asStringArray(args.phones);
      if (phones.length === 0) return { error: "No phone numbers given." };
      const jids: string[] = [];
      for (const p of phones) {
        try {
          jids.push(normalizeJid(p));
        } catch {
          return { error: `"${p}" is not a valid phone number.` };
        }
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const result = await ctx.sock.groupParticipantsUpdate(jid, jids, "add");
        return { updated: true, result };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Add failed." };
      }
    },
  },
  {
    name: "remove_group_participants",
    description:       "Remove one or more numbers from a group. Only works if this account is a group admin. Confirm with the customer before removing people. OWNER ONLY.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
        phones: { type: "array", items: { type: "string" }, description: "Phone numbers to remove." },
      },
      required: ["groupJid", "phones"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = toolArgs.asString(args.groupJid).trim();
      if (!jid.endsWith("@g.us")) return { error: "That is not a group chat." };
      const phones = toolArgs.asStringArray(args.phones);
      if (phones.length === 0) return { error: "No phone numbers given." };
      const jids: string[] = [];
      for (const p of phones) {
        try {
          jids.push(normalizeJid(p));
        } catch {
          return { error: `"${p}" is not a valid phone number.` };
        }
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const result = await ctx.sock.groupParticipantsUpdate(jid, jids, "remove");
        return { updated: true, result };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Remove failed." };
      }
    },
  },
];
