import type OpenAI from "openai";
import type makeWASocket from "@whiskeysockets/baileys";
import type { WAMessageKey } from "@whiskeysockets/baileys";

export type WASocket = ReturnType<typeof makeWASocket>;

export interface KnownContact {
  name: string;
  lastSeen: number;
  /** Profile photo URL synced from WhatsApp (may be "changed"/null). */
  imgUrl?: string | null;
  /** About/status line synced from WhatsApp. */
  about?: string;
}

export interface BufferedMessage {
  id: string;
  fromMe: boolean;
  text: string;
  ts: number;
  key: WAMessageKey | null;
  /** What the message carried — text, media with a caption, or media alone. */
  kind?: "text" | "photo" | "video" | "document" | "audio" | "sticker";
}

/** What a tool can do with the live session: message anyone via WhatsApp. */
export interface ToolContext {
  userId: string;
  customerJid: string;
  /** True only when the chatter is the shop owner (matched by phone number in code). */
  isOwner: boolean;
  sendText: (to: string, text: string) => Promise<void>;
  sock: WASocket | null;
  contacts: Map<string, KnownContact>;
  messageLog: Map<string, BufferedMessage[]>;
}

export type ToolScope = "customer" | "owner";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** "customer" = anyone may use it. "owner" = shop owner only, enforced in code. */
  scope: ToolScope;
  /**
   * For owner tools that also make sense inside the ongoing conversation
   * (react/poll/media in the current chat): customers may use them only when
   * the resolved target equals the current chat.
   */
  allowCurrentChat?: boolean;
  /** JID the tool acts on (for the current-chat exception). Defaults to current chat. */
  targetOf?: (args: Record<string, unknown>, ctx: ToolContext) => string | null;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** One tool gets this long before the model is told it timed out. */
export const TOOL_TIMEOUT_MS = 12_000;

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === "string");
}

export const toolArgs = { asRecord, asString, asNumber, asBoolean, asArray, asStringArray };
