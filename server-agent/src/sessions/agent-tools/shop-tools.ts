import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import {
  loadBusiness,
  loadPersona,
  isOpenNow,
  currencySymbol,
  findProductByIdOrSku,
  storeUrl,
} from "./store.js";

export const shopTools: ToolDefinition[] = [
  {
    name: "get_business_info",
    description:
      "Get the shop profile: name, owner, phone, address, currency, and whether it is currently open (from its work days and hours). Use it when customers ask where you are, when you open, or how to contact the shop.",
    scope: "customer",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => {
      const [business, persona] = await Promise.all([loadBusiness(ctx.userId), loadPersona(ctx.userId)]);
      if (!business) return { error: "Business profile is not set up yet." };
      const open = persona
        ? isOpenNow(persona.days, persona.open, persona.close, business.timezone)
        : true;
      return {
        name: business.name,
        owner: business.owner,
        phone: business.phone,
        address: business.address,
        currency: business.currency,
        timezone: business.timezone,
        hours: persona ? `${persona.days.join(", ")} ${persona.open}-${persona.close}` : "unknown",
        openNow: open,
        storeUrl: await storeUrl(ctx.userId).catch(() => null),
      };
    },
  },
  {
    name: "get_store_link",
    description:
      "Get the shop's public buyer storefront URL (photos, prices, WhatsApp order buttons). Call it when a customer asks for the full list, a catalogue, a link/website, or wants to browse everything on their own — then paste the URL into your reply as plain text (WhatsApp auto-previews it). Never invent the URL; always use the one this tool returns.",
    scope: "customer",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => {
      const [url, business] = await Promise.all([
        storeUrl(ctx.userId).catch(() => null),
        loadBusiness(ctx.userId).catch(() => null),
      ]);
      if (!url) return { error: "Store link is not available right now." };
      return {
        storeUrl: url,
        businessName: business?.name ?? "Shop",
        hint: "Send this URL as plain text in chat, e.g. 'You fit browse everything here: URL'.",
      };
    },
  },
  {
    name: "quote_order",
    description:
      "Price an order: pass items with product id/SKU and quantity. Returns per-line prices, the total in shop currency, and flags items with low or no stock. Always use this for totals — never invent prices.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Items to price.",
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
      },
      required: ["items"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const items = toolArgs.asArray(args.items);
      if (items.length === 0) return { error: "No items given." };
      const business = await loadBusiness(ctx.userId).catch(() => null);
      const currency = currencySymbol(business?.currency);
      const lines = [];
      let total = 0;
      for (const raw of items) {
        const item = toolArgs.asRecord(raw);
        const qty = Math.max(1, Math.floor(toolArgs.asNumber(item.quantity, 1)));
        const product = await findProductByIdOrSku(toolArgs.asString(item.idOrSku), ctx.userId);
        if (!product) {
          lines.push({ idOrSku: toolArgs.asString(item.idOrSku), error: "not found" });
          continue;
        }
        const lineTotal = product.unitPrice * qty;
        total += lineTotal;
        lines.push({
          name: product.name,
          sku: product.sku,
          unitPrice: product.unitPrice,
          quantity: qty,
          lineTotal,
          stock: product.quantity,
          stockFlag:
            product.quantity <= 0
              ? "out of stock"
              : product.quantity < qty
                ? `only ${product.quantity} left`
                : "in stock",
        });
      }
      return { currency, lines, total };
    },
  },
  {
    name: "get_assistant_persona",
    description:
      "Get your own persona: name, role, personality, greeting, how you act, and what you must never do. Re-read it if you are unsure how to handle a request.",
    scope: "customer",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => {
      const persona = await loadPersona(ctx.userId);
      if (!persona) return { error: "No persona configured." };
      return persona;
    },
  },
];
