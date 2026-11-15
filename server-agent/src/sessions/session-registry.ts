import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "./mongo.js";

interface RegistryDoc {
  number?: string;
  engineId?: string;
  unlinked?: boolean;
}

const RegistrySchema = new Schema<RegistryDoc>(
  {
    number: String,
    engineId: String,
    unlinked: Boolean,
  },
  { collection: "linkedaccounts" },
);

const RegistryModel =
  mongoose.models.AgentRegistry ??
  mongoose.model<RegistryDoc>("AgentRegistry", RegistrySchema);

/** Session ids that should be running: every record except unlinked ones. */
export async function loadRegisteredSessionIds(): Promise<string[]> {
  await ensureMongo();
  const docs = await RegistryModel.find({ unlinked: { $ne: true } }).lean();
  const ids = new Set<string>();
  for (const d of docs) {
    const id = (d.engineId ?? d.number ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}
