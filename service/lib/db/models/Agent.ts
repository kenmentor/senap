import mongoose, { Schema, type Document } from "mongoose";

export interface AgentDoc extends Document {
  key: string;
  /** Dashboard owner — per-line keys inherit their line's owner; per-owner defaults use key `default:<ownerId>`. */
  ownerId: string;
  empId: string;
  activeEmp: string;
  name: string;
  role: string;
  avatar: string;
  photo: string;
  avatarColor: string;
  avatarInk: string;
  personality: string;
  greeting: string;
  acts: string;
  neverDo: string;
  exCustomer: string;
  exReply: string;
  days: string[];
  open: string;
  close: string;
  /** Agent access switches (Home → Agent access). Missing = all on. */
  control?: {
    paused?: boolean;
    readMessages?: boolean;
    replyDM?: boolean;
    replyGroups?: boolean;
    statusImport?: boolean;
    catalogMirror?: boolean;
  };
}

const AgentSchema = new Schema<AgentDoc>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    ownerId: { type: String, default: "", index: true },
    empId: { type: String, default: "amaka" },
    activeEmp: { type: String, default: "amaka" },
    name: { type: String, default: "Amaka" },
    role: { type: String, default: "Sales closer" },
    avatar: { type: String, default: "photo" },
    photo: { type: String, default: "" },
    avatarColor: { type: String, default: "#00a884" },
    avatarInk: { type: String, default: "#04241d" },
    personality: { type: String, default: "friendly" },
    greeting: { type: String, default: "" },
    acts: { type: String, default: "" },
    neverDo: { type: String, default: "" },
  exCustomer: { type: String, default: "Do you still have the Tecno Spark 20?" },
  exReply: { type: String, default: "Yes — 12 left at ₦155,000 each! How many should I reserve for you?" },
    days: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    open: { type: String, default: "08:00" },
    close: { type: String, default: "21:00" },
    control: {
      type: {
        paused: Boolean,
        readMessages: Boolean,
        replyDM: Boolean,
        replyGroups: Boolean,
        statusImport: Boolean,
        catalogMirror: Boolean,
      },
      default: undefined,
    },
  },
  { versionKey: false }
);

export const Agent =
  (mongoose.models.Agent as mongoose.Model<AgentDoc> | undefined) ??
  mongoose.model<AgentDoc>("Agent", AgentSchema);
