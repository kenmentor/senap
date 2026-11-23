import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";

export interface CustomerProfile {
  userId: string;
  customerJid: string;
  displayName?: string;
  location?: string;
  priceRange?: [number, number];
  categories: string[];
  deliveryArea?: string;
  complaintCount: number;
  channelPref?: string;
  prefs: Record<string, string>;
  followUpConsent: boolean;
  lastPurchaseAt?: Date;
  updatedAt: Date;
}

interface CustomerProfileRow {
  userId: string;
  customerJid: string;
  displayName?: string;
  location?: string;
  priceRange?: number[];
  categories: string[];
  deliveryArea?: string;
  complaintCount: number;
  channelPref?: string;
  prefs: Record<string, string>;
  followUpConsent: boolean;
  lastPurchaseAt?: Date;
  updatedAt: Date;
}

const CustomerProfileSchema = new Schema<CustomerProfileRow>(
  {
    userId: String,
    customerJid: String,
    displayName: { type: String, default: "" },
    location: { type: String, default: "" },
    priceRange: { type: [Number], default: undefined },
    categories: { type: [String], default: [] },
    deliveryArea: { type: String, default: "" },
    complaintCount: { type: Number, default: 0 },
    channelPref: { type: String, default: "" },
    prefs: { type: Schema.Types.Mixed, default: {} },
    followUpConsent: { type: Boolean, default: true },
    lastPurchaseAt: { type: Date, default: undefined },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: "customerprofiles" },
);
CustomerProfileSchema.index({ userId: 1, customerJid: 1 }, { unique: true });

const CustomerProfileModel =
  mongoose.models.CustomerProfile ??
  mongoose.model<CustomerProfileRow>("CustomerProfile", CustomerProfileSchema);

/** Long-lived per-customer profile. Null when unknown — caller treats as new customer. */
export async function loadCustomerProfile(
  userId: string,
  customerJid: string,
): Promise<CustomerProfile | null> {
  try {
    await ensureMongo();
    const doc = await CustomerProfileModel.findOne({ userId, customerJid }).lean().catch(() => null);
    if (!doc) return null;
    const d = doc as CustomerProfileRow;
    const range =
      Array.isArray(d.priceRange) && d.priceRange.length === 2
        ? [d.priceRange[0], d.priceRange[1]] as [number, number]
        : undefined;
    return {
      userId: d.userId,
      customerJid: d.customerJid,
      displayName: d.displayName || undefined,
      location: d.location || undefined,
      priceRange: range,
      categories: Array.isArray(d.categories) ? d.categories.slice(0, 20) : [],
      deliveryArea: d.deliveryArea || undefined,
      complaintCount: d.complaintCount ?? 0,
      channelPref: d.channelPref || undefined,
      prefs: d.prefs && typeof d.prefs === "object" ? (d.prefs as Record<string, string>) : {},
      followUpConsent: d.followUpConsent !== false,
      lastPurchaseAt: d.lastPurchaseAt,
      updatedAt: d.updatedAt ?? new Date(),
    };
  } catch {
    return null;
  }
}

/** Patch profile fields. Only call on explicit signals (purchase, stated pref, opt-out). */
export async function saveCustomerProfile(
  userId: string,
  customerJid: string,
  patch: Partial<Omit<CustomerProfile, "userId" | "customerJid" | "updatedAt">>,
): Promise<void> {
  try {
    await ensureMongo();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.displayName !== undefined) set.displayName = patch.displayName ?? "";
    if (patch.location !== undefined) set.location = patch.location ?? "";
    if (patch.priceRange !== undefined) set.priceRange = patch.priceRange;
    if (patch.categories !== undefined) set.categories = patch.categories.slice(0, 20);
    if (patch.deliveryArea !== undefined) set.deliveryArea = patch.deliveryArea ?? "";
    if (patch.complaintCount !== undefined) set.complaintCount = patch.complaintCount;
    if (patch.channelPref !== undefined) set.channelPref = patch.channelPref ?? "";
    if (patch.prefs !== undefined) set.prefs = patch.prefs;
    if (patch.followUpConsent !== undefined) set.followUpConsent = patch.followUpConsent;
    if (patch.lastPurchaseAt !== undefined) set.lastPurchaseAt = patch.lastPurchaseAt;
    await CustomerProfileModel.findOneAndUpdate({ userId, customerJid }, { $set: set }, { upsert: true });
  } catch {
    /* best effort */
  }
}

/** One-line returner context. Null for new customers or when nothing useful is known. */
export function profileBlock(profile: CustomerProfile | null): string | null {
  if (!profile) return null;
  const bits: string[] = [];
  if (profile.displayName) bits.push(`name=${profile.displayName.slice(0, 40)}`);
  if (profile.categories.length > 0) bits.push(`likes=${profile.categories.slice(0, 3).join("/")}`);
  if (profile.deliveryArea) bits.push(`area=${profile.deliveryArea.slice(0, 40)}`);
  if (profile.complaintCount > 0) bits.push(`pastComplaints=${profile.complaintCount}`);
  if (profile.followUpConsent === false) bits.push("followUp=OPTED_OUT (never send proactive sales)");
  if (bits.length === 0) return null;
  const returning = profile.lastPurchaseAt ? "returning customer" : "known chat";
  return `Customer profile (${returning}): ${bits.join(" | ")}. Use it to personalize, never recite it.`;
}
