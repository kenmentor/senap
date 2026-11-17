import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { nameScore, normalizeJid } from "./store.js";
import type { BufferedMessage } from "./tool-types.js";

function entryText(m: BufferedMessage): string {
  return m.text.length > 200 ? `${m.text.slice(0, 200)}…` : m.text;
}

export const outreachTools: ToolDefinition[] = [
  {
    name: "resolve_chat",
    description:
      "OWNER ONLY. Resolve a name to a WhatsApp chat in ONE step: searches 1:1 contacts AND groups together ('Amara' -> her DM, 'Modebe' -> the Modebe group). Returns JID, type, and name for each match. Use this first whenever the owner names a person or group instead of giving a number — then pass the JID to schedule_task / send_whatsapp_message / customer_profile.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Person name, group subject, or phone number, e.g. 'Amara' or 'Modebe'." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const query = toolArgs.asString(args.query).trim();
      if (!query) return { error: "Empty query." };
      const scored: {
        jid: string;
        type: "contact" | "group";
        name: string;
        members?: number;
        score: number;
      }[] = [];
      for (const [jid, c] of ctx.contacts) {
        if (jid.endsWith("@g.us")) continue;
        const score = Math.max(nameScore(c.name, query), nameScore(jid, query));
        if (score > 0) scored.push({ jid, type: "contact", name: c.name, score });
      }
      // Groups live on the socket, not in contacts — fetch when online.
      if (ctx.sock) {
        try {
          const groups = await ctx.sock.groupFetchAllParticipating();
          for (const [jid, meta] of Object.entries(groups)) {
            const subject = meta.subject || "Group";
            const score = Math.max(nameScore(subject, query), nameScore(jid, query));
            if (score > 0 && !scored.some((s) => s.jid === jid)) {
              scored.push({
                jid,
                type: "group",
                name: subject,
                members: meta.participants?.length ?? 0,
                score,
              });
            }
          }
        } catch {
          /* offline — contact matches still returned */
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const matches = scored.slice(0, 5).map(({ jid, type, name, members }) => ({
        jid,
        type,
        name,
        ...(members !== undefined ? { members } : {}),
      }));
      if (matches.length === 0) {
        return {
          matches,
          note: `No contact or group matches "${query}". Try resolve_contact for a number check, or list_groups to browse all groups.`,
        };
      }
      if (matches.length > 1 && scored[0].score - scored[1].score < 15) {
        return {
          matches,
          ambiguous: true as const,
          note: "Several close matches — confirm with the owner which one ('is it X or Y?') before acting.",
        };
      }
      return { matches };
    },
  },
  {
    name: "customer_profile",
    description:
      "OWNER ONLY. What does this customer care about? Reads their chat history on this account: recent questions, topics, and products already shown to them — so the owner (or you, when composing) can pitch what they will actually want instead of blasting the full catalogue. Pass a JID from resolve_chat, or a name/phone directly.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name, phone number, or JID, e.g. 'Amara'." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const query = toolArgs.asString(args.query).trim();
      if (!query) return { error: "Empty query." };
      // Resolve to a JID: direct JID/phone first, else name search.
      let jid = "";
      let name = "unknown";
      if (query.includes("@")) {
        jid = query.trim();
        name = ctx.contacts.get(jid)?.name ?? "unknown";
      } else {
        try {
          jid = normalizeJid(query);
          name = ctx.contacts.get(jid)?.name ?? "unknown";
        } catch {
          jid = "";
        }
      }
      if (!jid || (!ctx.contacts.has(jid) && !ctx.messageLog.has(jid))) {
        let best = 0;
        for (const [cJid, c] of ctx.contacts) {
          if (cJid.endsWith("@g.us")) continue;
          const score = Math.max(nameScore(c.name, query), nameScore(cJid, query));
          if (score > best) {
            best = score;
            jid = cJid;
            name = c.name;
          }
        }
        if (best === 0) jid = "";
      }
      if (!jid) return { error: `No customer matches "${query}".` };
      const log = ctx.messageLog.get(jid) ?? [];
      const incoming = log.filter((m) => !m.fromMe);
      const outgoing = log.filter((m) => m.fromMe);
      const last = log[log.length - 1];
      const productsShown = outgoing
        .filter((m) => m.text.startsWith("[photo]"))
        .map((m) => m.text.replace(/^\[photo\]\s*/, "").slice(0, 120));
      return {
        jid,
        name,
        messageCount: log.length,
        receivedCount: incoming.length,
        lastActive: last ? new Date(last.ts).toISOString() : null,
        recentQuestions: incoming.slice(-10).map(entryText),
        productsAlreadyShown: [...new Set(productsShown)].slice(0, 10),
        note: "Only covers messages seen since the session started. Infer interests from recentQuestions; never invent purchases.",
      };
    },
  },
];
