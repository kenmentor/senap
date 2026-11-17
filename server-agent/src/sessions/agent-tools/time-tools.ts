import type { ToolDefinition } from "./tool-types.js";
import { nowIn, loadBusiness, cleanTimezone } from "./store.js";

export const timeTools: ToolDefinition[] = [
  {
    name: "get_current_time",
    description:
      "Get the current date and time in the shop's timezone. Use it whenever the customer asks about time, today, opening hours, or 'now'.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async (_args, ctx) => {
      const business = await loadBusiness(ctx.userId).catch(() => null);
      const { stamp, weekday } = nowIn(business?.timezone);
      return {
        datetime: stamp,
        weekday,
        timezone: cleanTimezone(business?.timezone),
      };
    },
  },
];
