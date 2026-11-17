import mongoose, { Schema, type Document } from "mongoose";

export interface AccountDoc extends Document {
  /** Dashboard owner (User id) — a line belongs to exactly one owner. */
  ownerId: string;
  number: string;
  name: string;
  linkedAt: string;
  engineId: string;
  unlinked: boolean;
}

const AccountSchema = new Schema<AccountDoc>(
  {
    ownerId: { type: String, default: "", index: true },
    number: { type: String, required: true, trim: true },
    name: { type: String, required: true, default: "Nala Phones", trim: true },
    linkedAt: { type: String, default: "Today" },
    engineId: { type: String, required: true, trim: true },
    unlinked: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

export const LinkedAccount =
  (mongoose.models.LinkedAccount as mongoose.Model<AccountDoc> | undefined) ??
  mongoose.model<AccountDoc>("LinkedAccount", AccountSchema);
