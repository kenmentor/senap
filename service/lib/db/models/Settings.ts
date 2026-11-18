import mongoose, { Schema, type Document } from "mongoose";

export interface SettingsDoc extends Document {
  key: string;
  /** Dashboard owner (User id). One settings doc per owner; key = ownerId for owner docs. */
  ownerId: string;
  business: {
    name: string;
    owner: string;
    phone: string;
    currency: string;
    timezone: string;
    address: string;
  };
  notifications: {
    orders: boolean;
    approvals: boolean;
    daily: boolean;
    lowStock: boolean;
    marketing: boolean;
    sms: boolean;
  };
  team: { name: string; role: string; access: string }[];
  plan: "Starter" | "Growth" | "Scale";
  /** Buyer-facing storefront slug: the public store lives at /s/<storeSlug>. */
  storeSlug: string;
  /** Private admin line that receives reports and can command the agent. OTP-verified. */
  adminPhone: string;
  /** engineId of the linked account used to send reports + OTP codes. */
  reportAccountId: string;
  adminVerified: boolean;
  adminVerifiedAt?: Date;
  adminOtpHash: string;
  adminOtpExpires?: Date;
  /** Product → status flow (Products page Status section). */
  statusFlow: {
    lineId: string;
    includePrice: boolean;
    postingEnabled: boolean;
  };
}

const SettingsSchema = new Schema<SettingsDoc>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    ownerId: { type: String, default: "", index: true },
    business: {
      name: { type: String, default: "Nala Phones" },
      owner: { type: String, default: "Business owner" },
      phone: { type: String, default: "+234 801 234 5678" },
      currency: { type: String, default: "NGN ₦" },
      timezone: { type: String, default: "Africa/Lagos (WAT)" },
      address: { type: String, default: "12 Admiralty Way, Lekki, Lagos" }
    },
    notifications: {
      orders: { type: Boolean, default: true },
      approvals: { type: Boolean, default: true },
      daily: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
      sms: { type: Boolean, default: false }
    },
    team: {
      type: [{ name: String, role: String, access: String }],
      default: [
        { name: "Business owner", role: "Owner", access: "Full access" },
        { name: "Mr Chi", role: "Manager", access: "Approve & reports" }
      ]
    },
    plan: { type: String, enum: ["Starter", "Growth", "Scale"], default: "Growth" },
    storeSlug: { type: String, default: "", trim: true },
    adminPhone: { type: String, default: "", trim: true },
    reportAccountId: { type: String, default: "", trim: true },
    adminVerified: { type: Boolean, default: false },
    adminVerifiedAt: { type: Date },
    adminOtpHash: { type: String, default: "", select: false },
    adminOtpExpires: { type: Date },
    statusFlow: {
      type: {
        lineId: String,
        includePrice: Boolean,
        postingEnabled: Boolean,
      },
      default: undefined,
    },
  },
  { versionKey: false }
);

export const Settings =
  (mongoose.models.Settings as mongoose.Model<SettingsDoc> | undefined) ??
  mongoose.model<SettingsDoc>("Settings", SettingsSchema);
