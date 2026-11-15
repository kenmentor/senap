import mongoose, { Schema, type Document } from "mongoose";

export type ChatAccessMode = "open" | "exclusive";
export type ContactList = "black" | "white";

export interface ChatSettingsDoc extends Document {
  /** WhatsApp account id (the session/engine id). */
  userId: string;
  /** "open": everyone except blacklisted. "exclusive": only whitelisted. */
  mode: ChatAccessMode;
}

const ChatSettingsSchema = new Schema<ChatSettingsDoc>(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    mode: { type: String, enum: ["open", "exclusive"], default: "open" },
  },
  { versionKey: false }
);

export interface ContactRuleDoc extends Document {
  userId: string;
  jid: string;
  name: string;
  list: ContactList;
}

const ContactRuleSchema = new Schema<ContactRuleDoc>(
  {
    userId: { type: String, required: true, trim: true },
    jid: { type: String, required: true, trim: true },
    name: { type: String, default: "unknown", trim: true },
    list: { type: String, enum: ["black", "white"], required: true },
  },
  { timestamps: false, versionKey: false }
);
ContactRuleSchema.index({ userId: 1, jid: 1 }, { unique: true });

export const ChatSettings =
  (mongoose.models.ChatSettings as mongoose.Model<ChatSettingsDoc> | undefined) ??
  mongoose.model<ChatSettingsDoc>("ChatSettings", ChatSettingsSchema);

export const ContactRule =
  (mongoose.models.ContactRule as mongoose.Model<ContactRuleDoc> | undefined) ??
  mongoose.model<ContactRuleDoc>("ContactRule", ContactRuleSchema);
