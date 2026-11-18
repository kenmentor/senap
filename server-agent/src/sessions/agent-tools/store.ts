import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

// Short TTL caches for per-message config reads (persona + business).
// Shop config changes rarely; 60s staleness is invisible in chat.
const CONFIG_TTL_MS = 60_000;
const personaCache = new Map<string, { at: number; value: AssistantPersona | null }>();
const businessCache = new Map<string, { at: number; value: BusinessInfo | null }>();

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
  costPrice?: number;
  sold?: number;
  /** Dashboard owner. Missing/empty = legacy pre-multi-user doc. */
  ownerId?: string;
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
        condition: String,
        costPrice: Number,
        sold: Number,
        ownerId: String,
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
  control?: AgentControl;
}

/** Per-line agent access switches (dashboard Home → Agent access). */
export interface AgentControl {
  /** Master kill-switch: no customer replies at all (owner bypasses). */
  paused: boolean;
  /** Master read gate: when off, customer messages are dropped silently. */
  readMessages: boolean;
  /** Replies to 1:1 chats. */
  replyDM: boolean;
  /** Replies in groups. */
  replyGroups: boolean;
  /** Status → product auto-import. */
  statusImport: boolean;
  /** Mirror imported products into the WA Business catalog. */
  catalogMirror: boolean;
}

export const DEFAULT_CONTROL: AgentControl = {
  paused: false,
  readMessages: true,
  replyDM: true,
  replyGroups: true,
  statusImport: true,
  catalogMirror: true,
};

/** Coerce a stored control doc (partial/legacy) into full switches. */
export function normalizeControl(raw: unknown): AgentControl {
  const r = (raw ?? {}) as Partial<Record<keyof AgentControl, unknown>>;
  const b = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  return {
    paused: b(r.paused, false),
    readMessages: b(r.readMessages, true),
    replyDM: b(r.replyDM, true),
    replyGroups: b(r.replyGroups, true),
    statusImport: b(r.statusImport, true),
    catalogMirror: b(r.catalogMirror, true),
  };
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
        control: { type: Schema.Types.Mixed, default: undefined },
      },
      { collection: "agents" },
    ),
  );

interface SettingsRow {
  key: string;
  /** Dashboard owner. Missing/empty = legacy pre-multi-user doc. */
  ownerId?: string;
  storeSlug?: string;
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
        ownerId: String,
        storeSlug: String,
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

/** WhatsApp line → dashboard owner mapping (linkedaccounts collection). */
export const AccountView =
  mongoose.models.ToolAccount ??
  mongoose.model(
    "ToolAccount",
    new Schema(
      { engineId: String, ownerId: String },
      { collection: "linkedaccounts" },
    ),
  );

/** Dashboard users (for username-based store addresses). */
const OwnerView =
  mongoose.models.ToolUser ??
  mongoose.model(
    "ToolUser",
    new Schema({ name: String, email: String }, { collection: "users" }),
  );

const ownerCache = new Map<string, { at: number; owner: string | null }>();
const OWNER_CACHE_TTL_MS = 60_000;

/** Resolve a WhatsApp line id to its dashboard owner's id (cached 60s). */
export async function ownerIdForLine(lineId: string): Promise<string | null> {
  const id = (lineId ?? "").trim();
  if (!id) return null;
  const hit = ownerCache.get(id);
  if (hit && Date.now() - hit.at < OWNER_CACHE_TTL_MS) return hit.owner;
  await ensureConn();
  const doc = (await AccountView.findOne({ engineId: id })
    .select("ownerId")
    .lean()
    .catch(() => null)) as { ownerId?: unknown } | null;
  const owner = doc?.ownerId ? String(doc.ownerId) : null;
  ownerCache.set(id, { at: Date.now(), owner });
  if (ownerCache.size > 500) {
    const oldest = ownerCache.keys().next().value;
    if (oldest !== undefined) ownerCache.delete(oldest);
  }
  return owner;
}

/**
 * Age of a linked line in days (from its LinkedAccount row). Null when
 * unknown — callers treat unknown as mature to avoid throttling a live
 * line during a DB blip. Used for new-number warm-up caps.
 */
export async function lineAgeDays(lineId: string): Promise<number | null> {
  const id = (lineId ?? "").trim();
  if (!id) return null;
  try {
    await ensureConn();
    const doc = (await AccountView.findOne({ engineId: id })
      .select("createdAt")
      .lean()
      .catch(() => null)) as { createdAt?: unknown } | null;
    const at = doc?.createdAt instanceof Date ? doc.createdAt.getTime() : NaN;
    if (!Number.isFinite(at)) return null;
    return Math.max(0, (Date.now() - at) / 86_400_000);
  } catch {
    return null;
  }
}

/**
 * Resolve a scope (line engineId or dashboard owner id) to an owner id.
 * Unknown/empty scope → null (legacy global reads, e.g. boot paths).
 */
export async function resolveScopeOwner(scope?: string): Promise<string | null> {
  const s = (scope ?? "").trim();
  if (!s) return null;
  const owner = await ownerIdForLine(s).catch(() => null);
  if (owner) return owner;
  if (/^[a-f0-9]{24}$/i.test(s)) return s;
  return null;
}

/** Strict owner filter — unknown owner matches NOTHING (never the world).
 *  Every store is isolated: products, settings and personas resolve only
 *  through the line's linked owner, and an unresolvable scope reads empty. */
function ownerOnly(owner: string | null): Record<string, unknown> | null {
  if (!owner) return null;
  return { ownerId: owner };
}

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
  /** Same for video: absolute/sendable video URL (or store-photo ref), else "". */
  videoUrl: string;
}

/** True for video media: data:video blobs, .mp4/.webm/.mov, Cloudinary video paths. */
export function isVideoUrl(url: string | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  if (/^data:video\//i.test(u)) return true;
  const path = u.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|3gp|avi)$/.test(path)) return true;
  return /\/video\/upload\//.test(u);
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
  control: AgentControl;
}

/** Schedule gate: true when the line is inside its active days + hours.
 *  No days set, or open/close unset = always active (backward compatible). */
export function isWithinActiveWindow(
  persona: { days?: string[]; open?: string; close?: string } | null,
  timezone?: string,
): boolean {
  if (!persona) return true;
  const days = persona.days ?? [];
  const open = (persona.open ?? "").trim();
  const close = (persona.close ?? "").trim();
  if (days.length === 0 || !open || !close) return true;
  return isOpenNow(days, open, close, timezone ?? "Africa/Lagos");
}

export interface BusinessInfo {
  name: string;
  owner: string;
  phone: string;
  currency: string;
  timezone: string;
  address: string;
  /** Buyer storefront slug (empty = derived from the business name). */
  storeSlug?: string;
  /** Private admin line — only trusted for owner commands when verified. */
  adminPhone?: string;
  adminVerified?: boolean;
}

export async function findProducts(query: string, limit = 5, scope?: string): Promise<ShopProduct[]> {
  await ensureConn();
  const q = query.trim();
  const owner = scope ? await resolveScopeOwner(scope).catch(() => null) : null;
  const only = ownerOnly(owner);
  // Unresolvable scope (unlinked line, unknown id) reads EMPTY — never global.
  if (!only) return [];
  const and: Record<string, unknown>[] = [only];
  if (q) {
    and.push({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { sku: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
      ],
    });
  }
  const filter = { $and: and };
  const docs = await ProductView.find(filter)
    .limit(Math.min(Math.max(limit, 1), 10))
    .lean();
  return docs.map((d) => toShopProduct(d));
}

export async function findProductByIdOrSku(idOrSku: string, scope?: string): Promise<ShopProduct | null> {
  await ensureConn();
  const q = idOrSku.trim();
  const owner = scope ? await resolveScopeOwner(scope).catch(() => null) : null;
  if (!owner) return null;
  const matchesOwner = (d: ProductRow): boolean => d.ownerId === owner;
  const byId = await ProductView.findById(q).lean().catch(() => null);
  if (byId && matchesOwner(byId)) return toShopProduct(byId);
  const doc = await ProductView.findOne({ $and: [{ ownerId: owner }, { $or: [{ sku: q }, { name: { $regex: `^${q}$`, $options: "i" } }] }] }).lean();
  if (!doc) return null;
  return toShopProduct(doc);
}

function asFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Create one shop product (Status auto-import, dashboard adds). Returns the
 * new id + name, or null when the DB write fails. Cost mirrors price (margin
 * unknown until the owner sets it) — never invent a cheaper cost.
 */
export async function createShopProduct(input: {
  ownerId?: string | null;
  name: string;
  description: string;
  unitPrice: number;
  quantity: number;
  condition: "New" | "UK Used" | "Used";
  image?: string;
  category?: string;
}): Promise<{ id: string; name: string } | null> {
  const owner = (input.ownerId ?? "").trim() || null;
  // No owner, no listing: unattributable docs could never be shown to the
  // right store, so refuse instead of creating cross-store orphans.
  if (!owner) return null;
  await ensureConn();
  const qty = Math.max(0, Math.floor(input.quantity));
  const price = Math.max(0, input.unitPrice);
  const doc = await ProductView.create({
    name: input.name.trim().slice(0, 200) || "New arrival",
    sku: `STS-${Date.now().toString(36).slice(-6).toUpperCase()}`,
    quantity: qty,
    unitPrice: price,
    costPrice: price,
    category: (input.category ?? "General").trim().slice(0, 60) || "General",
    status: qty <= 0 ? "Out" : qty <= 5 ? "Low" : "Available",
    condition: input.condition,
    description: input.description.slice(0, 1000),
    image: input.image ?? "",
    sold: 0,
    ownerId: owner,
  }).catch(() => null);
  if (!doc) return null;
  return { id: String(doc._id), name: doc.name as string };
}

/**
 * Bulk catalog seed (dashboard migrations, local -> cloud moves). Upserts by
 * SKU (fallback: exact name), so re-runs are safe. Returns match/insert counts.
 */
export async function upsertProducts(items: unknown[], ownerId?: string): Promise<{ matched: number; upserted: number }> {
  const owner = (ownerId ?? "").trim() || null;
  // Owner-scoped only: matching by global SKU/name could overwrite another
  // store's product, and an unknown owner must write nothing.
  if (!owner) return { matched: 0, upserted: 0 };
  await ensureConn();
  let matched = 0;
  let upserted = 0;
  for (const raw of items.slice(0, 200)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
    if (!name) continue;
    const sku = typeof r.sku === "string" ? r.sku.trim().slice(0, 60) : "";
    const set: Record<string, unknown> = { name, ownerId: owner };
    if (sku) set.sku = sku;
    if (typeof r.quantity !== "undefined") set.quantity = Math.max(0, Math.round(asFiniteNumber(r.quantity, 0)));
    if (typeof r.unitPrice !== "undefined") set.unitPrice = Math.max(0, asFiniteNumber(r.unitPrice, 0));
    if (typeof r.costPrice !== "undefined") set.costPrice = Math.max(0, asFiniteNumber(r.costPrice, 0));
    if (typeof r.sold !== "undefined") set.sold = Math.max(0, Math.round(asFiniteNumber(r.sold, 0)));
    for (const k of ["category", "status", "description", "image", "condition"] as const) {
      if (typeof r[k] === "string" && (r[k] as string).trim()) set[k] = (r[k] as string).trim().slice(0, 1000);
    }
    // Owner-scoped SKU/name match: one store's seed can never touch
    // another store's product, even with an identical SKU.
    const filter: Record<string, unknown> = sku ? { sku, ownerId: owner } : { name, ownerId: owner };
    const res = await ProductView.updateOne(filter, { $set: set }, { upsert: true });
    matched += res.matchedCount ?? 0;
    upserted += res.upsertedCount ?? 0;
  }
  return { matched, upserted };
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
  const id = String(d._id);
  // Embedded store photos (status imports) travel as a short `store-photo:<id>`
  // reference so multi-KB blobs never touch the model's context — send_media
  // resolves the reference back to bytes at send time (photos and videos alike).
  // Video products expose videoUrl and leave imageUrl empty, so photo-only
  // paths (image bubbles, catalog uploads) never receive a video by mistake.
  const isVideo = isVideoUrl(image);
  const sendable = image.startsWith("data:") ? `store-photo:${id}` : resolveImageUrl(image);
  const imageUrl = isVideo ? "" : sendable;
  const videoUrl = isVideo ? sendable : "";
  return {
    id,
    name: d.name,
    sku: d.sku,
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    category: d.category,
    status: d.status,
    description: d.description,
    condition: (d.condition ?? "").trim() || "New",
    image,
    imageUrl,
    videoUrl,
  };
}

export async function loadPersona(userId?: string): Promise<AssistantPersona | null> {
  // Hot path (every message): shop config changes rarely, so a short TTL
  // cache turns 1–3 Mongo roundtrips per message into a memory hit.
  const key = userId?.trim() ?? "";
  const hit = personaCache.get(key);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value;
  const value = await loadPersonaFresh(userId);
  if (personaCache.size > 500) personaCache.clear();
  personaCache.set(key, { at: Date.now(), value });
  return value;
}

async function loadPersonaFresh(userId?: string): Promise<AssistantPersona | null> {
  await ensureConn();
  // Per-number assignment: an account-specific persona (key = engine id)
  // wins; the owner's namespaced default is next; the legacy shared "default"
  // persona is the last resort.
  let doc = null;
  if (userId?.trim()) {
    doc = await AgentView.findOne({ key: userId.trim() }).lean();
    if (!doc) {
      const owner = await ownerIdForLine(userId.trim()).catch(() => null);
      if (owner) doc = await AgentView.findOne({ key: `default:${owner}` }).lean();
    }
  }
  // Generic defaults only: the shared doc is a last resort solely when it
  // is ownerless — a claimed workspace's persona must never leak sideways.
  if (!doc) {
    const shared = await AgentView.findOne({ key: "default" }).lean();
    if (shared && !(shared as { ownerId?: unknown }).ownerId) doc = shared;
  }
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
    control: normalizeControl((doc as { control?: unknown }).control),
  };
}

export async function loadBusiness(scope?: string): Promise<BusinessInfo | null> {
  // Hot path (every message, often 2–3×): same short TTL treatment.
  const key = scope?.trim() ?? "";
  const hit = businessCache.get(key);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value;
  const value = await loadBusinessFresh(scope);
  if (businessCache.size > 500) businessCache.clear();
  businessCache.set(key, { at: Date.now(), value });
  return value;
}

async function loadBusinessFresh(scope?: string): Promise<BusinessInfo | null> {
  await ensureConn();
  const owner = scope ? await resolveScopeOwner(scope).catch(() => null) : null;
  let doc = null;
  if (owner) doc = await SettingsView.findOne({ ownerId: owner }).lean();
  // Generic defaults only: fall back to the shared doc solely when it is
  // ownerless — a claimed workspace's settings must never leak sideways.
  if (!doc) {
    const shared = await SettingsView.findOne({ key: "default" }).lean();
    if (shared && !(shared as { ownerId?: unknown }).ownerId) doc = shared;
  }
  if (!doc?.business) return null;
  return {
    ...doc.business,
    storeSlug: doc.storeSlug ?? "",
    adminPhone: doc.adminPhone ?? undefined,
    adminVerified: doc.adminVerified ?? false,
  };
}

/** "Nala Phones!" -> "nala-phones". Mirrors service lib/store.ts. */
export function slugify(name: string): string {
  return (
    (name ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 60) || "shop"
  );
}

export function resolveStoreSlug(businessName?: string, userName?: string, explicit?: string): string {
  const raw = (explicit ?? "").trim();
  if (raw) {
    const clean = slugify(raw);
    if (clean) return clean;
  }
  const uname = slugify(userName ?? "");
  if (uname !== "shop") return uname;
  return slugify(businessName ?? "");
}

/** Absolute buyer-storefront URL for this line's owner (null when unknown). */
export async function storeUrl(scope?: string): Promise<string | null> {
  const business = await loadBusiness(scope).catch(() => null);
  if (!business) return null;
  let userName = "";
  const owner = scope ? await resolveScopeOwner(scope).catch(() => null) : null;
  if (owner) {
    try {
      await ensureConn();
      const u = (await OwnerView.findById(owner)
        .select("name")
        .lean()
        .catch(() => null)) as { name?: unknown } | null;
      if (typeof u?.name === "string") userName = u.name;
    } catch {
      /* username is a nicety — the business name still resolves */
    }
  }
  return `${appBaseUrl()}/${resolveStoreSlug(business.name, userName, business.storeSlug)}`;
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
  // Overnight windows (e.g. open 20:00, close 02:00): active when past open
  // OR before close, not between them.
  if (close <= open) return open <= hm || hm <= close;
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

/** Small edit distance for typo-tolerant name matching (no dependency). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Typo-tolerant name score 0-100 for "is it this or this?" recommendations.
 * Exact > starts-with > substring > close-typo. Digits still match by
 * substring (min 4). Returns 0 for no resemblance.
 */
export function nameScore(name: string, query: string): number {
  const n = name.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!n || !q) return 0;
  if (n === q) return 100;
  const qDigits = q.replace(/\D/g, "");
  const nDigits = n.replace(/\D/g, "");
  if (qDigits.length >= 4 && nDigits.includes(qDigits)) return 90;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 70;
  // Word-level: any word in the name close to the query (handles "Amaara"~"Amara").
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  let best = 0;
  const targets = [q, ...q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3)];
  for (const w of words) {
    for (const t of targets) {
      if (!t) continue;
      if (w === t) return 85;
      if (w.startsWith(t) || t.startsWith(w)) {
        best = Math.max(best, 60);
        continue;
      }
      const dist = levenshtein(w, t);
      const longest = Math.max(w.length, t.length);
      // Allow ~1 typo per 4 chars on words of 4+.
      if (longest >= 4 && dist <= Math.max(1, Math.floor(longest / 4))) {
        best = Math.max(best, 55 - dist * 5);
      }
    }
  }
  return best;
}
