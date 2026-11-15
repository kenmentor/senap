import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";

const DOWNLOAD_DIR = join(process.cwd(), "downloads");
const MAX_BYTES = 20 * 1024 * 1024;

function isBlockedIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("ff")
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Resolve the host and refuse private/internal addresses (SSRF guard). */
async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new Error("Could not resolve the host.");
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a.address))) {
    throw new Error("That host resolves to a private/internal address — refused.");
  }
  return url;
}

/** Fills the other session's downloader.ts placeholder: fetch a file URL to disk. */
export const downloaderTools: ToolDefinition[] = [
  {
    name: "download_file",
    description:
      "Download a public file from the internet to the agent's downloads folder (receipts, catalog images, documents the customer links to). Max 20MB. Internal/private addresses are always refused.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) file URL." },
        filename: {
          type: "string",
          description: "Optional file name to save as. Defaults to the URL's file name.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const raw = toolArgs.asString(args.url).trim();
      let url: URL;
      try {
        url = await assertPublicUrl(raw);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Refused URL." };
      }
      let res: Response;
      try {
        res = await fetch(url);
      } catch (e) {
        return { error: `Download failed: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!res.ok) return { error: `Download failed with status ${res.status}.` };
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) return { error: "Downloaded file is empty." };
      if (buffer.length > MAX_BYTES) return { error: "File is larger than 20MB, refused." };
      const fallback = basename(url.pathname) || "file";
      const safe = toolArgs.asString(args.filename, fallback).replace(/[^\w.\-]+/g, "_");
      await mkdir(DOWNLOAD_DIR, { recursive: true });
      const path = join(DOWNLOAD_DIR, `${Date.now()}-${safe}`);
      await writeFile(path, buffer);
      return { path, bytes: buffer.length };
    },
  },
];
