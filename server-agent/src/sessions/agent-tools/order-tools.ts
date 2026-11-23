import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { findProductByIdOrSku, loadBusiness, currencySymbol } from "./store.js";
import { ensureMongo } from "../mongo.js";

interface OrderItem {
  idOrSku: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderRow {
  userId: string;
  customerJid: string;
  items: OrderItem[];
  total: number;
  currency: string;
  deliveryArea?: string;
  status: string;
  createdAt: Date;
}

const OrderSchema = new Schema<OrderRow>(
  {
    userId: String,
    customerJid: String,
    items: { type: Schema.Types.Mixed, default: [] },
    total: { type: Number, default: 0 },
    currency: { type: String, default: "₦" },
    deliveryArea: { type: String, default: "" },
    status: { type: String, default: "pending" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "orders" },
);
OrderSchema.index({ userId: 1, customerJid: 1, createdAt: -1 });

export const OrderModel =
  mongoose.models.CustomerOrder ?? mongoose.model<OrderRow>("CustomerOrder", OrderSchema);

/**
 * P4 operational: verified order creation. Stock-checked (never promises what
 * isn't there), totals from live prices (never invented). Status starts at
 * pending — the owner confirms/delivers; the agent never takes payment.
 */
export const orderTools: ToolDefinition[] = [
  {
    name: "create_order",
    description:
      "Create a verified order for the CURRENT chat: pass items with product id/SKU and quantity plus optional deliveryArea. Stock is checked live — out-of-stock items fail instead of being promised. Returns the order id, per-line totals and grand total. Call this when the customer confirms they want to buy (CLOSE), after quote_order if you need a preview. Then ask for delivery area if missing and notify_owner for confirmation.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Items to order.",
          items: {
            type: "object",
            properties: {
              idOrSku: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["idOrSku", "quantity"],
            additionalProperties: false,
          },
        },
        deliveryArea: { type: "string", description: "Delivery area/address if already given." },
      },
      required: ["items"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const rawItems = toolArgs.asArray(args.items).slice(0, 10);
      if (rawItems.length === 0) return { error: "No items given." };
      const deliveryArea = toolArgs.asString(args.deliveryArea).trim().slice(0, 200);
      const business = await loadBusiness(ctx.userId).catch(() => null);
      const currency = currencySymbol(business?.currency);
      const lines: OrderItem[] = [];
      let total = 0;
      for (const raw of rawItems) {
        const item = toolArgs.asRecord(raw);
        const qty = Math.max(1, Math.min(99, Math.floor(toolArgs.asNumber(item.quantity, 1))));
        const idOrSku = toolArgs.asString(item.idOrSku).trim();
        if (!idOrSku) return { error: "One item is missing its product id/SKU." };
        const product = await findProductByIdOrSku(idOrSku, ctx.userId);
        if (!product) return { error: `Product "${idOrSku}" was not found — search_products for the right one.` };
        if (product.quantity <= 0) {
          return { error: `"${product.name}" is out of stock right now — offer an alternative instead of promising it.` };
        }
        if (product.quantity < qty) {
          return {
            error: `Only ${product.quantity} of "${product.name}" left — ask if ${product.quantity} works or offer an alternative.`,
          };
        }
        const lineTotal = product.unitPrice * qty;
        total += lineTotal;
        lines.push({
          idOrSku,
          name: product.name,
          sku: product.sku,
          quantity: qty,
          unitPrice: product.unitPrice,
          lineTotal,
        });
      }
      const doc = await OrderModel.create({
        userId: ctx.userId,
        customerJid: ctx.customerJid,
        items: lines,
        total,
        currency,
        deliveryArea,
        status: "pending",
        createdAt: new Date(),
      });
      return {
        orderId: String(doc._id),
        items: lines,
        total,
        currency,
        deliveryArea: deliveryArea || null,
        status: "pending",
        next: deliveryArea
          ? "Order recorded as pending — tell the customer the total and that the owner will confirm shortly. Call notify_owner with the order id."
          : "Order recorded as pending — ask for the delivery area in plain words, then notify_owner with the order id.",
      };
    },
  },
  {
    name: "order_status",
    description:
      "Check an order from the CURRENT chat by its order id (from create_order). Customers only ever see their own chat's orders.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order id from create_order." },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const id = toolArgs.asString(args.orderId).trim();
      if (!id) return { error: "Order id is required." };
      const doc = await OrderModel.findOne({ _id: id, userId: ctx.userId, customerJid: ctx.customerJid }).lean().catch(() => null);
      if (!doc) return { error: "Order not found in this chat." };
      return {
        orderId: String(doc._id),
        items: doc.items,
        total: doc.total,
        currency: doc.currency,
        deliveryArea: doc.deliveryArea || null,
        status: doc.status,
        createdAt: doc.createdAt,
      };
    },
  },
];
