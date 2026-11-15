import mongoose, { Schema, type Document } from "mongoose";

export interface PluginDoc extends Document {
  toolId: string;
  account: string;
  enabled: boolean;
  grants: boolean[];
  lastUsed: string;
}

const PluginSchema = new Schema<PluginDoc>(
  {
    toolId: { type: String, required: true, unique: true, trim: true },
    account: { type: String, required: true, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    grants: { type: [Boolean], default: [] },
    lastUsed: { type: String, default: "Just now" }
  },
  { timestamps: true, versionKey: false }
);

export const PluginConnection =
  (mongoose.models.PluginConnection as mongoose.Model<PluginDoc> | undefined) ??
  mongoose.model<PluginDoc>("PluginConnection", PluginSchema);
