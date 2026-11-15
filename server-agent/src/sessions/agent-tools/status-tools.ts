import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";

const STATUS_JID = "status@broadcast";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function pickBackground(raw: string): string {
  const c = raw.trim();
  return HEX_COLOR.test(c) ? c : "#00a884";
}

export const statusTools: ToolDefinition[] = [
  {
    name: "post_status",
    description:
      "OWNER ONLY. Post a WhatsApp Status (story) from the linked business number: a short text update, or a photo/video with a caption (e.g. new arrivals, promo, opening hours). Use only when the shop owner asks to post/share/update status. Text is capped at 700 characters.",
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

      try {
        if (videoUrl) {
          if (!/^https?:\/\//i.test(videoUrl)) return { error: "Only http(s) URLs are allowed." };
          await ctx.sock.sendMessage(STATUS_JID, {
            video: { url: videoUrl },
            caption: text || undefined,
          });
          return { posted: true, kind: "video" };
        }
        if (imageUrl) {
          if (!/^https?:\/\//i.test(imageUrl)) return { error: "Only http(s) URLs are allowed." };
          await ctx.sock.sendMessage(STATUS_JID, {
            image: { url: imageUrl },
            caption: text || undefined,
          });
          return { posted: true, kind: "image" };
        }
        await ctx.sock.sendMessage(
          STATUS_JID,
          { text },
          {
            backgroundColor: pickBackground(toolArgs.asString(args.backgroundColor, "#00a884")),
            font: 0,
          },
        );
        return { posted: true, kind: "text" };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Status post failed." };
      }
    },
  },
];
