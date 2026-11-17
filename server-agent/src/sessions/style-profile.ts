import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "./mongo.js";

interface StyleRow {
  userId: string;
  chatJid: string;
  /** Incoming customer messages observed. */
  count: number;
  totalWords: number;
  emojiMsgs: number;
  pidginMsgs: number;
  formalMsgs: number;
  greetMsgs: number;
  questionMsgs: number;
  /** Last few verbatim customer lines (flavor samples, same chat only). */
  samples: string[];
  updatedAt: Date;
}

const StyleSchema = new Schema<StyleRow>(
  {
    userId: String,
    chatJid: String,
    count: { type: Number, default: 0 },
    totalWords: { type: Number, default: 0 },
    emojiMsgs: { type: Number, default: 0 },
    pidginMsgs: { type: Number, default: 0 },
    formalMsgs: { type: Number, default: 0 },
    greetMsgs: { type: Number, default: 0 },
    questionMsgs: { type: Number, default: 0 },
    samples: { type: [String], default: [] },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: "styleprofiles" },
);
StyleSchema.index({ userId: 1, chatJid: 1 }, { unique: true });

const StyleModel =
  mongoose.models.StyleProfile ?? mongoose.model<StyleRow>("StyleProfile", StyleSchema);

const PIDGIN = ["dey", "na ", "oya", "abeg", "wahala", "sapa", "gree", "yarn", "shey", "ehn", "omo", "chai", "japa", "gist", "chop", "gbam", "wer", "kolo", "mumu", "toh"];
const FORMAL = ["please", "kindly", "dear ", "regards", "sincerely", "good morning", "good afternoon", "good evening", "sir", "ma ", "madam", "thank you", "thanks", "i would like", "could you", "may i"];
const GREET = ["good morning", "good afternoon", "good evening", "hello", "hi ", "hey", "how far"];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

function signalsOf(text: string): { words: number; emoji: boolean; pidgin: boolean; formal: boolean; greet: boolean; question: boolean } {
  const t = (text ?? "").toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  const has = (list: string[]): boolean => list.some((m) => t.includes(m));
  return {
    words,
    emoji: EMOJI_RE.test(text ?? ""),
    pidgin: has(PIDGIN),
    formal: has(FORMAL),
    greet: GREET.some((g) => t.startsWith(g) || t.split("\n")[0].trim() === g.trim()),
    question: (text ?? "").includes("?"),
  };
}

/**
 * Observe one incoming customer line and return a mirror directive for THIS
 * reply (null while the profile is still cold). Counters persist in Mongo so
 * the voice survives restarts; the current line is folded in immediately so
 * even a style shift mid-conversation is picked up.
 */
export async function styleDirectiveFor(
  userId: string,
  chatJid: string,
  currentText: string,
  isOngoing: boolean,
): Promise<string | null> {
  await ensureMongo();
  const sig = signalsOf(currentText);
  const doc = await StyleModel.findOneAndUpdate(
    { userId, chatJid },
    {
      $inc: {
        count: 1,
        totalWords: sig.words,
        emojiMsgs: sig.emoji ? 1 : 0,
        pidginMsgs: sig.pidgin ? 1 : 0,
        formalMsgs: sig.formal ? 1 : 0,
        greetMsgs: sig.greet ? 1 : 0,
        questionMsgs: sig.question ? 1 : 0,
      },
      $set: { updatedAt: new Date() },
      $push: { samples: { $each: [currentText.slice(0, 200)], $slice: -5 } },
    },
    { upsert: true, new: true },
  )
    .lean()
    .catch(() => null);
  if (!doc) return null;
  const count = doc.count || 1;
  // Cold start: fewer than 3 lines seen — not enough to clone, stay default.
  if (count < 3) return null;

  const avgWords = (doc.totalWords || 0) / count;
  const emojiRate = (doc.emojiMsgs || 0) / count;
  const pidginRate = (doc.pidginMsgs || 0) / count;
  const formalRate = (doc.formalMsgs || 0) / count;
  const greetRate = (doc.greetMsgs || 0) / count;

  const length = avgWords < 10 ? "short bursts" : avgWords < 30 ? "medium messages" : "long detailed messages";
  const language = pidginRate >= 0.35 ? "Pidgin-flavored English" : formalRate >= 0.35 ? "polite formal English" : "plain simple English";
  const emoji = emojiRate >= 0.5 ? "uses emoji often — mirror with one at most" : emojiRate >= 0.15 ? "uses emoji sometimes — one only if they just did" : "never uses emoji — send none";
  const greeting = greetRate >= 0.4 ? "greets on entry — greet back in their words, once" : "never greets — never greet them, not even hello";
  const samples = ((doc.samples || []) as string[]).slice(-3).map((s: string) => `"${s.slice(0, 80)}"`).join(" / ");

  const parts = [
    `Customer voice mirror (overrides the default voice for THIS chat only): they write ${length} in ${language}; ${emoji}; ${greeting}.`,
    `Match their energy: short messages get short answers — sell or explain at length only when they show a buying signal or ask a real question.`,
  ];
  if (isOngoing) parts.push("You are mid-conversation — no welcome, no re-introduction, no 'how can I help'.");
  if (samples) parts.push(`Their flavor: ${samples} — sound like you belong in this chat.`);
  return parts.join(" ");
}
