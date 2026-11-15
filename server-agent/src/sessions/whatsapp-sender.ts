import type makeWASocket from "@whiskeysockets/baileys";
import { prepareCustomerMessage } from "./message-skill.js";

type WASocket = ReturnType<typeof makeWASocket>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send with a VISIBLE typing indicator. The agent types fast, but the
 * customer must at least see "typing…" — otherwise replies feel robotic.
 * Delay scales lightly with length and is capped so it never feels slow.
 */
export default async function sendWithTyping(
  socket: WASocket | null,
  remoteJid: string,
  text: string,
): Promise<void> {
  if (!socket) {
    throw new Error("Socket is not connected");
  }
  const clean = prepareCustomerMessage(text);
  // Fast typer: ~1.2s base + length, capped at 3.5s.
  const typingMs = Math.min(1200 + clean.length * 15 + Math.random() * 600, 3500);
  await socket.sendPresenceUpdate("composing", remoteJid);
  await sleep(typingMs);
  try {
    await socket.sendPresenceUpdate("paused", remoteJid);
    await socket.sendMessage(remoteJid, { text: clean });
    console.log("Message delivered");
  } catch (error) {
    console.error("Message failed:", error);
    throw error;
  }
}
