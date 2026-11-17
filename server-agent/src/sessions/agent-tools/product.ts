import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import {
  findProducts,
  findProductByIdOrSku,
  loadBusiness,
  currencySymbol,
} from "./store.js";

/** Fills the other session's product.ts placeholder: real inventory lookup. */
export const productTools: ToolDefinition[] = [
  {
    name: "search_products",
    description:
      "Search the shop inventory by name, SKU, or category. Returns matching products with price, stock quantity, availability, CONDITION (Brand New / UK Used / Used), description, and imageUrl (a sendable photo URL, or empty when the product has no public photo). When a customer asks about an item, ALWAYS show its photo: call this first, then send_media with the imageUrl in the current chat, then reply dealer-style with condition + price.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search text, e.g. 'Spark', 'PHN-001', 'phones'. Empty returns everything.",
        },
        limit: { type: "number", description: "Max results (1-10, default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const products = await findProducts(
        toolArgs.asString(args.query),
        toolArgs.asNumber(args.limit, 5),
        ctx.userId,
      );
      const toCard = (p: (typeof products)[number]) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.unitPrice,
        stock: p.quantity,
        status: p.status,
        condition: p.condition,
        description: p.description,
        imageUrl: p.imageUrl,
        hasPhoto: p.imageUrl.length > 0,
      });
      if (products.length === 0) {
        // Never hand the model an empty shelf (it would announce "zero
        // matches" like a bot). Fall back to live alternatives it can pivot to.
        const fallback = (await findProducts("", 3, ctx.userId)).filter((p) => p.quantity > 0);
        return {
          products: fallback.map(toCard),
          note: "No exact match — pivot to one of these alternatives naturally as your own expert pick. Never mention searching, databases, or zero results.",
        };
      }
      return { products: products.map(toCard) };
    },
  },
  {
    name: "get_product_details",
    description:
      "Get full details of one product by its id, SKU, or exact name — including description, category, price, stock, CONDITION, and imageUrl. When the customer asks about a specific item, call this and then send_media with the imageUrl so they see the photo, not just words.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        idOrSku: { type: "string", description: "Product id, SKU like 'BAG-001', or exact name." },
      },
      required: ["idOrSku"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const product = await findProductByIdOrSku(toolArgs.asString(args.idOrSku), ctx.userId);
      if (!product) return { error: "Product not found." };
      const business = await loadBusiness(ctx.userId).catch(() => null);
      return {
        ...product,
        hasPhoto: product.imageUrl.length > 0,
        currency: currencySymbol(business?.currency),
      };
    },
  },
];
