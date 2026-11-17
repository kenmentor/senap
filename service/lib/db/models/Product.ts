import mongoose, { Schema, type Document } from "mongoose";

export type ProductStatus = "Available" | "Low" | "Out";
export type ProductCondition = "New" | "UK Used" | "Used";

export interface ProductDoc extends Document {
  /** Dashboard owner (User id). Empty = legacy pre-multi-user doc. */
  ownerId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  category: string;
  status: ProductStatus;
  /** Dealer condition, like a Jiji listing: brand new or second-hand. */
  condition: ProductCondition;
  description: string;
  image: string;
  sold: number;
  updatedAt: number;
}

const ProductSchema = new Schema<ProductDoc>(
  {
    ownerId: { type: String, default: "", index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, default: 0, min: 0 },
    costPrice: { type: Number, required: true, default: 0, min: 0 },
    category: { type: String, required: true, default: "General", trim: true },
    status: { type: String, enum: ["Available", "Low", "Out"], default: "Available" },
    condition: { type: String, enum: ["New", "UK Used", "Used"], default: "New" },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    sold: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Number, default: () => Date.now() }
  },
  { timestamps: false, versionKey: false }
);

ProductSchema.index({ name: "text", sku: "text", category: "text" });

export const Product =
  (mongoose.models.Product as mongoose.Model<ProductDoc> | undefined) ??
  mongoose.model<ProductDoc>("Product", ProductSchema);
