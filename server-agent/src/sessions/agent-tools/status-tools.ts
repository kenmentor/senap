import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";

const STATUS_JID = "status@broadcast";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Baileys REQUIREMENT (README "Broadcast Lists & Stories", messages-send.js):
 * publishing to status@broadcast encrypts ONLY to `statusJidList`. Without it
 * the send resolves "successfully" but reaches zero devices — invisible
 * everywhere, which is exactly the silent failure we had. The audience is
 * every known 1:1 chat plus our own line (so it shows on the owner's phone).
 */
export function buildStatusAudience(
  contacts: Map<string, { name: string }>,
  ownId?: string | null,
): string[] {
  const out = new Set<string>();
  for (const jid of contacts.keys()) {
    if (
      jid === STATUS_JID ||
      jid.endsWith("@g.us") ||
      jid.endsWith("@newsletter") ||
      jid.endsWith("@broadcast")
    ) {
      continue;
    }
    out.add(jid);
  }
  if (ownId) out.add(ownId);
  return [...out];
}

function pickBackground(raw: string): string {
  const c = raw.trim();
  return HEX_COLOR.test(c) ? c : "#00a884";
}

export const statusTools: ToolDefinition[] = [
  {
    name: "post_status",
    description:
      "OWNER ONLY. Post a WhatsApp Status (story) from the linked business number: a short text update, or a photo/video with a caption (e.g. new arrivals, promo, opening hours). Visible to every known contact for 24h. Use only when the shop owner asks to post/share/update status. Text is capped at 700 characters.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text for a text status, or the caption when imageUrl/videoUrl is given.",
        },
        imageUrl: {
          type: "string",
          description: "Optional public http(s) URL of a photo to post as an image status.",
        },
        videoUrl: {
          type: "string",
          description: "Optional public http(s) URL of a video to post as a video status (takes precedence over imageUrl).",
        },
        backgroundColor: {
          type: "string",
          description: "Hex background for a text status, e.g. '#00a884'. Defaults to '#00a884'.",
        },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const text = toolArgs.asString(args.text).trim().slice(0, 700);
      const imageUrl = toolArgs.asString(args.imageUrl).trim();
      const videoUrl = toolArgs.asString(args.videoUrl).trim();
      if (!text && !imageUrl && !videoUrl) {
        return { error: "Give me `text` or an `imageUrl`/`videoUrl` to post." };
      }
      if (!ctx.sock) return { error: "WhatsApp is not connected." };

      // Which line is posting — the owner may run several, and a status only
      // ever appears on the line that posted it.
      const line = (() => {
        const u = ctx.sock?.user as unknown as { id?: string } | null | undefined;
        return u?.id ?? "";
      })();
      const audience = buildStatusAudience(ctx.contacts, line || undefined);
      if (audience.length === 0) {
        return { error: "Nobody to show the status to yet — this line has no chats." };
      }
      const proof = (kind: "text" | "image" | "video", sent: unknown) => {
        const key = (sent as { key?: { id?: string } } | null | undefined)?.key;
        const out = { posted: true as const, kind, line, audience: audience.length, messageId: key?.id ?? null };
        try {
          console.log(`Status posted: ${kind} to ${audience.length} recipient(s) (id ${out.messageId ?? "?"}, line ${line || "?"})`);
        } catch {
          /* logging never blocks the post */
        }
        return out;
      };

      try {
        if (videoUrl) {
          if (!/^https?:\/\//i.test(videoUrl)) return { error: "Only http(s) URLs are allowed." };
          const sent = await ctx.sock.sendMessage(
            STATUS_JID,
            {
              video: { url: videoUrl },
              caption: text || undefined,
            },
            { statusJidList: audience, broadcast: true },
          );
          return proof("video", sent);
        }
        if (imageUrl) {
          if (!/^https?:\/\//i.test(imageUrl)) return { error: "Only http(s) URLs are allowed." };
          const sent = await ctx.sock.sendMessage(
            STATUS_JID,
            {
              image: { url: imageUrl },
              caption: text || undefined,
            },
            { statusJidList: audience, broadcast: true },
          );
          return proof("image", sent);
        }
        const sent = await ctx.sock.sendMessage(
          STATUS_JID,
          { text },
          {
            backgroundColor: pickBackground(toolArgs.asString(args.backgroundColor, "#00a884")),
            font: 0,
            statusJidList: audience,
            broadcast: true,
          },
        );
        return proof("text", sent);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Status post failed." };
      }
    },
  },
  {
    name: "check_status_setup",
    description:
      "OWNER ONLY. Diagnose an invisible Status: connection state, which line would post, how many contacts would receive it (audience), and the phone's own Status privacy setting. Run this BEFORE re-posting when a status is reported missing — if privacy is restricted or the audience is tiny, say so instead of posting again.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async (_args, ctx) => {
      if (!ctx.sock) return { connected: false, error: "WhatsApp is not connected." };
      const line = (() => {
        const u = ctx.sock?.user as unknown as { id?: string } | null | undefined;
        return u?.id ?? "";
      })();
      const audience = buildStatusAudience(ctx.contacts, line || undefined);
      let statusPrivacy: unknown = "unknown";
      try {
        const s = ctx.sock as unknown as {
          fetchPrivacySettings?: (force?: boolean) => Promise<Record<string, unknown>>;
        };
        if (typeof s.fetchPrivacySettings === "function") {
          const all = await s.fetchPrivacySettings(true);
          statusPrivacy = all?.status ?? "unknown";
        }
      } catch (e) {
        statusPrivacy = `unreadable (${e instanceof Error ? e.message : "query failed"})`;
      }
      return {
        connected: true,
        line,
        audience: audience.length,
        statusPrivacy,
        note:
          "Post reaches the audience list only. If statusPrivacy is 'none'/restricted, change it on the phone (Settings > Privacy > Status). If audience is 1, only this phone would see it — the line has no other chats yet.",
      };
    },
  },
];
