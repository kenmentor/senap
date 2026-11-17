import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid } from "./store.js";

export const groupTools: ToolDefinition[] = [
  {
    name: "list_groups",
    description:
      "List every WhatsApp group this account is in: name, JID, member count, and whether this account is an admin there. OWNER ONLY. Use when the owner asks what groups they have or which group to manage.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async (_args, ctx) => {
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const { isSelfJid } = await import("./store.js");
        const meUser = ctx.sock.user as unknown as
          | { id?: string; lid?: string; phoneNumber?: string }
          | null
          | undefined;
        const ownForms = [meUser?.id, meUser?.lid, meUser?.phoneNumber].filter(
          (x): x is string => !!x,
        );
        const groups = await ctx.sock.groupFetchAllParticipating();
        const rows = Object.entries(groups).map(([jid, meta]) => {
          const participants = meta.participants ?? [];
          const me = participants.find((p) => ownForms.some((s) => isSelfJid(p.id, s)));
          const flag = (me as { admin?: string | null } | undefined)?.admin;
          return {
            groupJid: jid,
            subject: meta.subject || "Group",
            members: participants.length,
            isAdmin: flag === "admin" || flag === "superadmin",
          };
        });
        rows.sort((a, b) => {
          if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
          return a.subject.localeCompare(b.subject);
        });
        return { groups: rows, count: rows.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Group list failed." };
      }
    },
  },
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
