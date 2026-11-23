import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";

export type BuyingStage =
  | "discovery"
  | "qualification"
  | "recommendation"
  | "objection"
  | "conversion"
  | "retention"
  | "support";

export type SalesIntent = "browsing" | "ready_to_buy" | "follow_up" | "support";

export interface SalesState {
  userId: string;
  customerJid: string;
  stage: BuyingStage;
  interest?: string;
  budget?: number;
  prefs: Record<string, string>;
  intent: SalesIntent;
  objection?: string;
  purchaseCompleted?: boolean;
  needsHuman?: boolean;
  nextStep?: string;
  updatedAt: Date;
}

interface SalesStateRow {
  userId: string;
  customerJid: string;
  stage: string;
  interest?: string;
  budget?: number;
  prefs: Record<string, string>;
  intent: string;
  objection?: string;
  purchaseCompleted?: boolean;
  needsHuman?: boolean;
  nextStep?: string;
  updatedAt: Date;
}

const SalesStateSchema = new Schema<SalesStateRow>(
  {
    userId: String,
    customerJid: String,
    stage: { type: String, default: "discovery" },
    interest: { type: String, default: "" },
    budget: { type: Number, default: undefined },
    prefs: { type: Schema.Types.Mixed, default: {} },
    intent: { type: String, default: "browsing" },
    objection: { type: String, default: "" },
    purchaseCompleted: { type: Boolean, default: false },
    needsHuman: { type: Boolean, default: false },
    nextStep: { type: String, default: "" },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: "salesstates" },
);
SalesStateSchema.index({ userId: 1, customerJid: 1 }, { unique: true });
SalesStateSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const SalesStateModel =
  mongoose.models.SalesState ?? mongoose.model<SalesStateRow>("SalesState", SalesStateSchema);

const STAGES: BuyingStage[] = [
  "discovery",
  "qualification",
  "recommendation",
  "objection",
  "conversion",
  "retention",
  "support",
];

const INTENTS: SalesIntent[] = ["browsing", "ready_to_buy", "follow_up", "support"];

function coerce(doc: SalesStateRow & { _id?: unknown }): SalesState {
  const stage = STAGES.includes(doc.stage as BuyingStage) ? (doc.stage as BuyingStage) : "discovery";
  const intent = INTENTS.includes(doc.intent as SalesIntent) ? (doc.intent as SalesIntent) : "browsing";
  return {
    userId: doc.userId,
    customerJid: doc.customerJid,
    stage,
    interest: doc.interest || undefined,
    budget: typeof doc.budget === "number" ? doc.budget : undefined,
    prefs: doc.prefs && typeof doc.prefs === "object" ? (doc.prefs as Record<string, string>) : {},
    intent,
    objection: doc.objection || undefined,
    purchaseCompleted: !!doc.purchaseCompleted,
    needsHuman: !!doc.needsHuman,
    nextStep: doc.nextStep || undefined,
    updatedAt: doc.updatedAt ?? new Date(),
  };
}

/** Load active sales state for one chat. Null when none yet — caller falls back to discovery. */
export async function loadSalesState(userId: string, customerJid: string): Promise<SalesState | null> {
  try {
    await ensureMongo();
    const doc = await SalesStateModel.findOne({ userId, customerJid }).lean().catch(() => null);
    if (!doc) return null;
    return coerce(doc as SalesStateRow);
  } catch {
    return null;
  }
}

/** Patch sales state (never resets unspecified fields). Fire-and-forget safe. */
export async function saveSalesState(
  userId: string,
  customerJid: string,
  patch: Partial<Omit<SalesState, "userId" | "customerJid" | "updatedAt">>,
): Promise<void> {
  try {
    await ensureMongo();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.stage) set.stage = patch.stage;
    if (patch.interest !== undefined) set.interest = patch.interest ?? "";
    if (patch.budget !== undefined) set.budget = patch.budget;
    if (patch.prefs) set.prefs = patch.prefs;
    if (patch.intent) set.intent = patch.intent;
    if (patch.objection !== undefined) set.objection = patch.objection ?? "";
    if (patch.purchaseCompleted !== undefined) set.purchaseCompleted = patch.purchaseCompleted;
    if (patch.needsHuman !== undefined) set.needsHuman = patch.needsHuman;
    if (patch.nextStep !== undefined) set.nextStep = patch.nextStep ?? "";
    await SalesStateModel.findOneAndUpdate({ userId, customerJid }, { $set: set }, { upsert: true });
  } catch {
    /* state is best-effort — never blocks the reply */
  }
}

/** One-line system context for the model. Null when no state yet. */
export function salesStateBlock(state: SalesState | null): string | null {
  if (!state) return null;
  const parts = [`stage=${state.stage}`, `intent=${state.intent}`];
  if (state.interest) parts.push(`interest=${state.interest.slice(0, 80)}`);
  if (typeof state.budget === "number") parts.push(`budget=${state.budget}`);
  const keys = Object.entries(state.prefs ?? {}).slice(0, 6).map(([k, v]) => `${k}:${String(v).slice(0, 40)}`);
  if (keys.length > 0) parts.push(`prefs=${keys.join(",")}`);
  if (state.objection) parts.push(`objection=${state.objection.slice(0, 80)}`);
  if (state.nextStep) parts.push(`next=${state.nextStep.slice(0, 80)}`);
  return `Current sales state (patch, never restart): ${parts.join(" | ")}.`;
}
