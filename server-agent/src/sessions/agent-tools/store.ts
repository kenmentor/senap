import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

// Read-only views over the shop's own collections (same shape as the dashboard).

interface ProductRow {
  _id: unknown;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  category: string;
  status: string;
  description: string;
  image?: string;
  condition?: string;
}

const ProductView =
  mongoose.models.ToolProduct ??
  mongoose.model(
    "ToolProduct",
    new Schema<ProductRow>(
      {
        name: String,
        sku: String,
        quantity: Number,
        unitPrice: Number,
        category: String,
        status: String,
        description: String,
        image: String,
      },
      { collection: "products" },
    ),
  );

interface AgentRow {
  key: string;
  name: string;
  role: string;
  personality: string;
  greeting: string;
  acts: string;
  neverDo: string;
  days: string[];
  open: string;
  close: string;
}

const AgentView =
  mongoose.models.ToolAgent ??
  mongoose.model(
    "ToolAgent",
    new Schema<AgentRow>(
      {
        key: String,
        name: String,
        role: String,
        personality: String,
        greeting: String,
        acts: String,
        neverDo: String,
        days: [String],
        open: String,
        close: String,
      },
      { collection: "agents" },
    ),
  );

interface SettingsRow {
  key: string;
  business: {
    name: string;
    owner: string;
    phone: string;
    currency: string;
    timezone: string;
    address: string;
  };
  adminPhone?: string;
  adminVerified?: boolean;
}

const SettingsView =
  mongoose.models.ToolSettings ??
  mongoose.model(
    "ToolSettings",
    new Schema<SettingsRow>(
      {
        key: String,
        business: {
          name: String,
          owner: String,
          phone: String,
          currency: String,
          timezone: String,
          address: String,
        },
      },
      { collection: "settings" },
    ),
  );

export interface ShopProduct {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  category: string;
  status: string;
  description: string;
  /** Dealer condition: New, UK Used, or Used. */
  condition: string;
  /** Raw image value as stored on the product (http URL, /public path, or ""). */
  image: string;
  /** Absolute http(s) URL the assistant can actually send, or "" when none. */
  imageUrl: string;
}

export interface AssistantPersona {
  name: string;
  role: string;
  personality: string;
  greeting: string;
  acts: string;
  neverDo: string;
  days: string[];
  open: string;
  close: string;
}

export interface BusinessInfo {
  name: string;
  owner: string;
  phone: string;
  currency: string;
  timezone: string;
  address: string;
  /** Private admin line — only trusted for owner commands when verified. */
  adminPhone?: string;
  adminVerified?: boolean;
}

export async function findProducts(query: string, limit = 5): Promise<ShopProduct[]> {
  await ensureConn();
  const q = query.trim();
  const filter = q
    ? {
        $or: [
          { name: { $regex: q, $options: "i" } },
          { sku: { $regex: q, $options: "i" } },
          { category: { $regex: q, $options: "i" } },
        ],
      }
    : {};
  const docs = await ProductView.find(filter)
    .limit(Math.min(Math.max(limit, 1), 10))
    .lean();
  return docs.map((d) => toShopProduct(d));
}

export async function findProductByIdOrSku(idOrSku: string): Promise<ShopProduct | null> {
  await ensureConn();
  const q = idOrSku.trim();
  const byId = await ProductView.findById(q).lean().catch(() => null);
  const doc =
    byId ??
    (await ProductView.findOne({
      $or: [{ sku: q }, { name: { $regex: `^${q}$`, $options: "i" } }],
    }).lean());
  if (!doc) return null;
  return toShopProduct(doc);
}

/**
 * Turn a stored product image into something the assistant can actually send.
 * Absolute http(s) URLs pass through; "/products/x.jpg" style paths are
 * resolved against the public app URL (production) or the local dashboard
 * (dev default http://localhost:3000 — same machine as the agent, so Baileys
 * can download it). Anything else yields "".
 */
export function appBaseUrl(): string {
  const raw = (
    process.env.PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  )
    .trim()
    .replace(/\/+$/, "");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  return /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i.test(raw) ? `http://${raw}` : `https://${raw}`;
}

export function resolveImageUrl(image: string | undefined): string {
  const raw = (image ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("data:")) return "";
  if (raw.startsWith("/")) return `${appBaseUrl()}${raw}`;
  return "";
}

function toShopProduct(d: ProductRow): ShopProduct {
  const image = (d.image ?? "").trim();
  return {
    id: String(d._id),
    name: d.name,
    sku: d.sku,
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    category: d.category,
    status: d.status,
    description: d.description,
    condition: (d.condition ?? "").trim() || "New",
    image,
    imageUrl: resolveImageUrl(image),
  };
}

export async function loadPersona(userId?: string): Promise<AssistantPersona | null> {
  await ensureConn();
  // Per-number assignment: an account-specific persona (key = engine/user id)
  // wins; the shared "default" persona is the fallback.
  let doc = null;
  if (userId?.trim()) {
    doc = await AgentView.findOne({ key: userId.trim() }).lean();
  }
  doc ??= await AgentView.findOne({ key: "default" }).lean();
  if (!doc) return null;
  return {
    name: doc.name,
    role: doc.role,
    personality: doc.personality,
    greeting: doc.greeting,
    acts: doc.acts,
    neverDo: doc.neverDo,
    days: doc.days ?? [],
    open: doc.open,
    close: doc.close,
  };
}

export async function loadBusiness(): Promise<BusinessInfo | null> {
  await ensureConn();
  const doc = await SettingsView.findOne({ key: "default" }).lean();
  if (!doc?.business) return null;
  return {
    ...doc.business,
    adminPhone: doc.adminPhone ?? undefined,
    adminVerified: doc.adminVerified ?? false,
  };
}

/** "Africa/Lagos (WAT)" -> "Africa/Lagos" */
export function cleanTimezone(raw: string | undefined): string {
  const tz = (raw ?? "").split(" ")[0].trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Africa/Lagos";
  }
}

/** "2026-11-12 14:30" style stamp plus weekday, in the shop's timezone. */
export function nowIn(timezone: string | undefined): { stamp: string; weekday: string } {
  const tz = cleanTimezone(timezone);
  const now = new Date();
  const stamp =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now) + ` (${tz})`;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(now);
  return { stamp, weekday };
}

export function isOpenNow(
  days: string[],
  open: string,
  close: string,
  timezone: string,
): boolean {
  if (!days || days.length === 0) return true;
  const { weekday } = nowIn(timezone);
  const today = weekday.slice(0, 3).toLowerCase();
  const active = days.some((d) => d.slice(0, 3).toLowerCase() === today);
  if (!active) return false;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: cleanTimezone(timezone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return open <= hm && hm <= close;
}

/** "+234 801 234 5678" -> "2348012345678@s.whatsapp.net" (already-JIDs pass through). */
export function normalizeJid(to: string): string {
  const raw = to.trim();
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) throw new Error(`Cannot resolve "${to}" to a WhatsApp number.`);
  return `${digits}@s.whatsapp.net`;
}

/** "NGN ₦" -> "₦" */
export function currencySymbol(currency: string | undefined): string {
  const parts = (currency ?? "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || "₦";
}

/**
 * Split a JID into its bare user + server, stripping device (:xx) and
 * agent (_x) suffixes so `234801...:12@s.whatsapp.net` still matches
 * `234801...@s.whatsapp.net`. c.us is treated as s.whatsapp.net.
 */
export function splitJid(jid: string | null | undefined): { user: string; server: string } {
  if (!jid) return { user: "", server: "" };
  const at = jid.lastIndexOf("@");
  const rawUser = (at >= 0 ? jid.slice(0, at) : jid).toLowerCase();
  let server = (at >= 0 ? jid.slice(at + 1) : "").toLowerCase();
  if (server === "c.us") server = "s.whatsapp.net";
  const noDevice = rawUser.split(":")[0];
  const bareUser = noDevice.split("_")[0];
  return { user: bareUser, server };
}

function jidFamily(server: string): "pn" | "lid" | "other" {
  if (server === "s.whatsapp.net" || server === "hosted") return "pn";
  if (server === "lid" || server === "hosted.lid") return "lid";
  return "other";
}

/**
 * True when the chatter is the line itself ("Message yourself" self-chat).
 * This is the DEFAULT owner: every line answers to its own number unless a
 * separate verified admin number is set in the dashboard.
 *
 * Digit-tail matching only applies within the same family (PN vs PN, or
 * LID vs LID) — a PN tail can never equal a LID tail, they are different
 * namespaces (Baileys v7 mixes @s.whatsapp.net and @lid forms).
 */
export function isSelfJid(customerJid: string, selfJid: string | null | undefined): boolean {
  if (!selfJid) return false;
  const me = splitJid(selfJid);
  const caller = splitJid(customerJid);
  if (!me.user || !caller.user) return false;
  if (me.user === caller.user) return true;
  // Same bare digits but different formatting (leading +, spaces)?
  const selfDigits = me.user.replace(/\D/g, "");
  const callerDigits = caller.user.replace(/\D/g, "");
  if (selfDigits && selfDigits === callerDigits) return true;
  if (selfDigits.length < 7 || callerDigits.length < 7) return false;
  // Cross-namespace (PN vs LID) tails must never match.
  if (me.server && caller.server && jidFamily(me.server) !== jidFamily(caller.server)) return false;
  const tail = Math.min(selfDigits.length, callerDigits.length, 12);
  return selfDigits.slice(-tail) === callerDigits.slice(-tail);
}

/**
 * True when the chatter is the shop owner, matched by phone digits in code
 * (suffix match so country-code formatting differences still match).
 * Unknown/unmatched callers are never owners — deny by default.
 */
export function isOwnerJid(customerJid: string, ownerPhone: string | undefined): boolean {
  const ownerDigits = (ownerPhone ?? "").replace(/\D/g, "");
  const callerDigits = customerJid.split("@")[0].replace(/\D/g, "");
  if (ownerDigits.length < 7 || callerDigits.length < 7) return false;
  const tail = Math.min(ownerDigits.length, callerDigits.length, 12);
  return ownerDigits.slice(-tail) === callerDigits.slice(-tail);
}
