import mongoose, { Schema, type Document } from "mongoose";

export interface AgentDoc extends Document {
  key: string;
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
}

const AgentSchema = new Schema<AgentDoc>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
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
    close: { type: String, default: "21:00" }
  },
  { versionKey: false }
);

export const Agent =
  (mongoose.models.Agent as mongoose.Model<AgentDoc> | undefined) ??
  mongoose.model<AgentDoc>("Agent", AgentSchema);
