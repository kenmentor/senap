import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { assertPublicUrl } from "./downloader.js";

const MAX_CHARS = 8000;
const FETCH_TIMEOUT_MS = 10_000;

/** Crude HTML -> text: scripts/styles out, tags to whitespace, entities decoded. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\xa0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webTools: ToolDefinition[] = [
  {
    name: "read_webpage",
    description:
      "Read any public web page as text: a link the customer sent, a product page, a price elsewhere, news, specs. Returns the page title + first ~8000 characters. Only http(s), no private addresses, no credentials in the URL. Use it whenever the answer lives on the web instead of in the shop — then reason over what you read like normal context.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) page URL." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const raw = toolArgs.asString(args.url).trim();
      if (!raw) return { error: "Empty URL." };
      let url: URL;
      try {
        url = await assertPublicUrl(raw);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Refused URL." };
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { "user-agent": "Mozilla/5.0 (SenapShopAssistant)", accept: "text/html,text/plain" },
        });
        if (!res.ok) return { error: `Page returned status ${res.status}.` };
        const contentType = res.headers.get("content-type") ?? "";
        const rawText = await res.text();
        if (!rawText.trim()) return { error: "Page is empty." };
        const text = (/html/i.test(contentType) || /<\s*html|<\s*body/i.test(rawText.slice(0, 2000)) ? htmlToText(rawText) : rawText.trim()).slice(0, MAX_CHARS);
        if (!text) return { error: "Nothing readable on that page." };
        const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(rawText)?.[1].trim() ?? "";
        return {
          url: url.toString(),
          ...(title ? { title } : {}),
          text,
          truncated: rawText.length > MAX_CHARS,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Fetch failed." };
      } finally {
        clearTimeout(t);
      }
    },
  },
];
