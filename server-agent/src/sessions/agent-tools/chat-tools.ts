import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid, resolveImageUrl } from "./store.js";
import type { BufferedMessage } from "./tool-types.js";

function chatOf(ctxJid: string, to: string): string {
  const raw = to.trim();
  if (!raw) return ctxJid;
  try {
    return normalizeJid(raw);
  } catch {
    return raw;
  }
}

function findMessage(
  log: BufferedMessage[] | undefined,
  messageId: string,
): BufferedMessage | null {
  if (!log) return null;
  return log.find((m) => m.id === messageId.trim()) ?? null;
}

export const chatTools: ToolDefinition[] = [
  {
    name: "search_messages",
    description:
      "Search recent message text. Without a chat it searches ONLY the current conversation; with a chat it is OWNER ONLY. Use it when the customer refers to an earlier message ('what did I order?'), and to get message ids for react_to_message / reply_to_message. Only covers messages seen since the session started.",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => {
      const jid = toolArgs.asString(args.jid).trim();
      return jid ? normalizeJid(jid) : ctx.customerJid;
    },
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for." },
        jid: { type: "string", description: "Optional chat JID or phone number to limit the search." },
        limit: { type: "number", description: "Max results (default 10)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const query = toolArgs.asString(args.query).trim().toLowerCase();
      if (!query) return { error: "Empty query." };
      const onlyJid = toolArgs.asString(args.jid).trim();
      // Customers may only ever search their own chat; owners may search all.
      const scope = onlyJid ? normalizeJid(onlyJid) : ctx.isOwner ? null : ctx.customerJid;
      const limit = Math.min(Math.max(toolArgs.asNumber(args.limit, 10), 1), 20);
      const hits: { chat: string; fromMe: boolean; text: string; at: string; id: string }[] = [];
      for (const [jid, messages] of ctx.messageLog) {
        if (scope && jid !== scope) continue;
        for (const m of messages) {
          if (m.text.toLowerCase().includes(query)) {
            hits.push({
              chat: jid,
              fromMe: m.fromMe,
              text: m.text,
              at: new Date(m.ts).toISOString(),
              id: m.id,
            });
          }
        }
      }
      hits.sort((a, b) => b.at.localeCompare(a.at));
      return { matches: hits.slice(0, limit) };
    },
  },
  {
    name: "react_to_message",
    description:
      "React with an emoji to a recent message in the current chat. Workflow: FIRST call search_messages to get the message id, THEN call this with that id. Only messages seen since the session started (this boot) can be reacted to — if the id is not found, say so instead of retrying blindly.",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => chatOf(ctx.customerJid, toolArgs.asString(args.to)),
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
        messageId: { type: "string", description: "Message id from search_messages." },
        emoji: { type: "string", description: "Single emoji, e.g. '❤️'. Empty string removes the reaction." },
      },
      required: ["messageId", "emoji"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      const msg = findMessage(ctx.messageLog.get(jid), toolArgs.asString(args.messageId));
      if (!msg) {
        return {
          error:
            "Message not found in recent history (only messages seen since the session started can be used — call search_messages first to get a valid id).",
        };
      }
      if (!msg.key) return { error: "Can only react to received messages." };
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.sendMessage(jid, { react: { text: toolArgs.asString(args.emoji), key: msg.key } });
        return { reacted: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "React failed." };
      }
    },
  },
  {
    name: "reply_to_message",
    description:
      "Reply with a quoted (highlighted) reply to a specific recent message in the current chat — the reply shows the original message above your text, like tapping 'reply' in WhatsApp. Workflow: FIRST call search_messages to get the message id, THEN call this with that id and your reply text. Only messages seen since the session started can be quoted.",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => chatOf(ctx.customerJid, toolArgs.asString(args.to)),
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
        messageId: { type: "string", description: "Message id from search_messages — the message to quote." },
        text: { type: "string", description: "Your reply text shown under the quote." },
      },
      required: ["messageId", "text"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      const text = toolArgs.asString(args.text).trim();
      if (!text) return { error: "Reply text is empty." };
      const msg = findMessage(ctx.messageLog.get(jid), toolArgs.asString(args.messageId));
      if (!msg) {
        return {
          error:
            "Message not found in recent history (only messages seen since the session started can be quoted — call search_messages first to get a valid id).",
        };
      }
      if (!msg.key?.id) return { error: "Can only quote received messages." };
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.sendMessage(jid, {
          text,
          contextInfo: {
            stanzaId: msg.key.id,
            participant: msg.key.participant || jid,
            quotedMessage: { conversation: msg.text },
          },
        });
        return { replied: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Reply failed." };
      }
    },
  },
  {
    name: "delete_message",
    description: "OWNER ONLY. Delete a message for everyone using its id from search_messages (works on your own recent messages).",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
        messageId: { type: "string", description: "Message id from search_messages." },
      },
      required: ["messageId"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      const msg = findMessage(ctx.messageLog.get(jid), toolArgs.asString(args.messageId));
      if (!msg) return { error: "Message not found in recent history." };
      if (!msg.key) return { error: "Can only delete messages with a known key." };
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.sendMessage(jid, { delete: msg.key });
        return { deleted: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Delete failed." };
      }
    },
  },
  {
    name: "mark_chat_read",
    description: "OWNER ONLY. Mark a chat as read (blue ticks).",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      const keys = (ctx.messageLog.get(jid) ?? []).flatMap((m) => (m.key ? [m.key] : []));
      if (keys.length === 0) return { error: "No recent messages to mark." };
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.readMessages(keys);
        return { markedRead: true, count: keys.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Mark-read failed." };
      }
    },
  },
  {
    name: "pin_chat",
    description: "OWNER ONLY. Pin or unpin a chat to the top of the chat list.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
        pin: { type: "boolean", description: "True to pin, false to unpin (default true)." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.chatModify({ pin: toolArgs.asBoolean(args.pin, true) }, jid);
        return { pinned: toolArgs.asBoolean(args.pin, true) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Pin failed." };
      }
    },
  },
  {
    name: "archive_chat",
    description: "OWNER ONLY. Archive or unarchive a chat.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
        archived: { type: "boolean", description: "True to archive, false to unarchive (default true)." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        const lastMessages = (ctx.messageLog.get(jid) ?? [])
          .filter((m) => m.key)
          .slice(-20)
          .reverse()
          .map((m) => ({ key: m.key!, messageTimestamp: Math.floor(m.ts / 1000) }));
        await ctx.sock.chatModify(
          { archive: toolArgs.asBoolean(args.archived, true), lastMessages },
          jid,
        );
        return { archived: toolArgs.asBoolean(args.archived, true) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Archive failed." };
      }
    },
  },
  {
    name: "send_poll",
    description: "Send a poll to the current chat, e.g. ask the customer to vote on a new phone model. 2-12 options. (Other chats: owner only.)",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => chatOf(ctx.customerJid, toolArgs.asString(args.to)),
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat or group JID/phone. Defaults to the current chat." },
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, description: "2-12 options." },
        selectableCount: { type: "number", description: "How many options can be picked (default 1)." },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      const options = toolArgs.asStringArray(args.options).map((o) => o.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 12) {
        return { error: "A poll needs 2-12 options." };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.sendMessage(jid, {
          poll: {
            name: toolArgs.asString(args.question).trim(),
            values: options,
            selectableCount: Math.max(1, Math.min(toolArgs.asNumber(args.selectableCount, 1), options.length)),
          },
        });
        return { sent: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Poll failed." };
      }
    },
  },
  {
    name: "tag_everyone",
    description: "OWNER ONLY. Mention every participant in a group (the '@all' everyone expects). Only use in groups and only when asked to address the whole group.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID ending in @g.us." },
        text: { type: "string", description: "Message text (defaults to an announcement)." },
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
        const mentions = metadata.participants.map((p) => p.id);
        await ctx.sock.sendMessage(jid, {
          text: toolArgs.asString(args.text, "Hello everyone!").trim() || "Hello everyone!",
          mentions,
        });
        return { sent: true, tagged: mentions.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Tag-all failed." };
      }
    },
  },
  {
    name: "send_media",
    description: "Send photos (or one video/voice note/document) from public URLs to the current chat. Use it to share product photos, receipts, or catalogs. MULTIPLE PHOTOS: pass them all in ONE call via `urls` (with matching `captions`) — they arrive back-to-back and group like a native album. NEVER paste image URLs as text links. (Other chats: owner only.)",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => chatOf(ctx.customerJid, toolArgs.asString(args.to)),
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Chat JID/phone. Defaults to the current chat." },
        url: { type: "string", description: "Single file URL (compatibility — prefer `urls` for photos)." },
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Several photo URLs in ONE call (max 5) — they arrive grouped like an album.",
        },
        captions: {
          type: "array",
          items: { type: "string" },
          description: "Caption per URL, same order as `urls` (e.g. name + price each). Missing entries send caption-less.",
        },
        kind: { type: "string", description: "One of: image, video, audio, document. Applies to the whole batch (default image)." },
        caption: { type: "string", description: "Caption for the first item (or the single `url`)." },
        fileName: { type: "string", description: "File name for documents." },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const jid = chatOf(ctx.customerJid, toolArgs.asString(args.to));
      // Product catalogues store "/products/x.jpg" style paths — resolve them
      // to a full URL the same way search_products does.
      const resolve = (raw: string): string => {
        const t = raw.trim();
        if (!t) return "";
        return /^https?:\/\//i.test(t) ? t : resolveImageUrl(t);
      };
      const raws = [...toolArgs.asStringArray(args.urls), toolArgs.asString(args.url)]
        .map((s) => s.trim())
        .filter(Boolean);
      const urls = [...new Set(raws.map(resolve).filter((u) => /^https?:\/\//i.test(u)))].slice(0, 5);
      const kind = toolArgs.asString(args.kind, "image").trim() || "image";
      if (urls.length === 0) {
        return {
          error:
            `No sendable photo URL (got "${raws[0] || "(empty)"}"). ` +
            "Tell the customer the picture is missing and suggest the owner add a photo URL in the dashboard. " +
            "Do not claim you sent it, and NEVER paste the raw URL as a text link.",
        };
      }
      if (!["image", "video", "audio", "document"].includes(kind)) {
        return { error: `Unknown media kind "${kind}".` };
      }
      if (kind !== "image" && urls.length > 1) {
        return { error: "Only photos can be batched — send video/audio/documents one at a time." };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      const captions = toolArgs.asStringArray(args.captions);
      const firstCaption = toolArgs.asString(args.caption) || undefined;
      const sent: string[] = [];
      const failed: { url: string; error: string }[] = [];
      // Rapid back-to-back sends group visually like a native album on the
      // recipient's phone (upstream Baileys has no single-message album API).
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const caption = captions[i]?.trim() || (i === 0 ? firstCaption : undefined);
        try {
          if (kind === "image") await ctx.sock.sendMessage(jid, { image: { url }, caption });
          else if (kind === "video") await ctx.sock.sendMessage(jid, { video: { url }, caption });
          else if (kind === "audio") await ctx.sock.sendMessage(jid, { audio: { url }, mimetype: "audio/ogg; codecs=opus" });
          else {
            await ctx.sock.sendMessage(jid, {
              document: { url },
              mimetype: "application/octet-stream",
              fileName: toolArgs.asString(args.fileName, "file"),
              caption,
            });
          }
          sent.push(url);
          const entry: BufferedMessage = {
            id: `out-img-${Date.now()}-${i}`,
            fromMe: true,
            text: `[photo] ${caption ?? url}`,
            ts: Date.now(),
            key: null,
          };
          const log = ctx.messageLog.get(jid);
          if (log) log.push(entry);
          else ctx.messageLog.set(jid, [entry]);
        } catch (e) {
          failed.push({ url, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (sent.length === 0) {
        return {
          error:
            `Media send failed (${failed[0]?.error ?? "unknown"}). The file URL may be unreachable from the agent host. ` +
            "Tell the customer the picture could not be delivered and quote the price/stock in words — NEVER paste the raw URL.",
        };
      }
      return {
        sent: true,
        url: sent[0],
        urls: sent,
        count: sent.length,
        ...(failed.length > 0 ? { failed, note: "Some photos failed — quote those in words, never paste their URLs." } : {}),
      };
    },
  },
  {
    name: "block_contact",
    description: "OWNER ONLY. Block a spammy or abusive number. Use sparingly.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        jid: { type: "string", description: "Phone number or JID to block." },
      },
      required: ["jid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      let jid: string;
      try {
        jid = normalizeJid(toolArgs.asString(args.jid));
      } catch {
        return { error: "Not a valid phone number or JID." };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.updateBlockStatus(jid, "block");
        return { blocked: true, jid };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Block failed." };
      }
    },
  },
  {
    name: "unblock_contact",
    description: "OWNER ONLY. Unblock a previously blocked number.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        jid: { type: "string", description: "Phone number or JID to unblock." },
      },
      required: ["jid"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      let jid: string;
      try {
        jid = normalizeJid(toolArgs.asString(args.jid));
      } catch {
        return { error: "Not a valid phone number or JID." };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };
      try {
        await ctx.sock.updateBlockStatus(jid, "unblock");
        return { unblocked: true, jid };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Unblock failed." };
      }
    },
  },
  {
    name: "get_recap",
    description:
      "OWNER ONLY. Summarise recent shop activity for the owner (recap / report / what happened today). Returns per-chat counts, latest messages and escalation hints across ALL chats. Call this when the owner asks 'recap', 'summary', 'report', 'what did I miss', 'how is business'. Then write a short human summary from the result — never paste raw JIDs.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max chats to include (default 10, max 20)." },
        perChat: { type: "number", description: "Recent messages per chat (default 3, max 5)." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const limit = Math.min(Math.max(toolArgs.asNumber(args.limit, 10), 1), 20);
      const perChat = Math.min(Math.max(toolArgs.asNumber(args.perChat, 3), 1), 5);
      const rows: { chat: string; name: string; total: number; recent: { fromMe: boolean; text: string; at: string }[] }[] = [];
      for (const [jid, messages] of ctx.messageLog) {
        if (jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
        const recent = messages.slice(-perChat).map((m) => ({
          fromMe: m.fromMe,
          text: m.text.length > 200 ? `${m.text.slice(0, 200)}…` : m.text,
          at: new Date(m.ts).toISOString(),
        }));
        rows.push({
          chat: jid,
          name: ctx.contacts.get(jid)?.name ?? jid.split("@")[0],
          total: messages.length,
          recent,
        });
      }
      rows.sort((a, b) => {
        const aLast = a.recent[a.recent.length - 1]?.at ?? "";
        const bLast = b.recent[b.recent.length - 1]?.at ?? "";
        return bLast.localeCompare(aLast);
      });
      return { chats: rows.slice(0, limit), totalChats: rows.length };
    },
  },
];
