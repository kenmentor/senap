import mongoose, { Schema, type Document } from "mongoose";

export interface PluginDoc extends Document {
  /** Dashboard owner — same toolId can be connected by many owners. */
  ownerId: string;
  toolId: string;
  account: string;
  enabled: boolean;
  grants: boolean[];
  lastUsed: string;
}

const PluginSchema = new Schema<PluginDoc>(
  {
    ownerId: { type: String, default: "", index: true },
    toolId: { type: String, required: true, trim: true },
    account: { type: String, required: true, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    grants: { type: [Boolean], default: [] },
    lastUsed: { type: String, default: "Just now" }
  },
  { timestamps: true, versionKey: false }
);

PluginSchema.index({ ownerId: 1, toolId: 1 }, { unique: true });

export const PluginConnection =
  (mongoose.models.PluginConnection as mongoose.Model<PluginDoc> | undefined) ??
  mongoose.model<PluginDoc>("PluginConnection", PluginSchema);
