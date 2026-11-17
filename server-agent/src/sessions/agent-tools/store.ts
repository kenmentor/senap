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

/** Owner filter that keeps working on legacy ownerless docs until claimed. */
function ownerOrLegacy(owner: string | null): Record<string, unknown>[] {
  if (!owner) return [];
  return [{ $or: [{ ownerId: owner }, { ownerId: { $in: [null, ""] } }] }];
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
  const and: Record<string, unknown>[] = [...ownerOrLegacy(owner)];
  if (q) {
    and.push({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { sku: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
      ],
    });
  }
  const filter = and.length > 0 ? { $and: and } : {};
  const docs = await ProductView.find(filter)
    .limit(Math.min(Math.max(limit, 1), 10))
    .lean();
  return docs.map((d) => toShopProduct(d));
}

export async function findProductByIdOrSku(idOrSku: string, scope?: string): Promise<ShopProduct | null> {
  await ensureConn();
  const q = idOrSku.trim();
  const owner = scope ? await resolveScopeOwner(scope).catch(() => null) : null;
  const matchesOwner = (d: ProductRow): boolean =>
    !owner || !d.ownerId || d.ownerId === owner;
  const byId = await ProductView.findById(q).lean().catch(() => null);
  if (byId && matchesOwner(byId)) return toShopProduct(byId);
  const and: Record<string, unknown>[] = [...ownerOrLegacy(owner)];
  and.push({ $or: [{ sku: q }, { name: { $regex: `^${q}$`, $options: "i" } }] });
  const doc = await ProductView.findOne({ $and: and }).lean();
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
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
  }).catch(() => null);
  if (!doc) return null;
  return { id: String(doc._id), name: doc.name as string };
}

/**
 * Bulk catalog seed (dashboard migrations, local -> cloud moves). Upserts by
 * SKU (fallback: exact name), so re-runs are safe. Returns match/insert counts.
 */
export async function upsertProducts(items: unknown[], ownerId?: string): Promise<{ matched: number; upserted: number }> {
  await ensureConn();
  const owner = (ownerId ?? "").trim() || null;
  let matched = 0;
  let upserted = 0;
  for (const raw of items.slice(0, 200)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
    if (!name) continue;
    const sku = typeof r.sku === "string" ? r.sku.trim().slice(0, 60) : "";
    const set: Record<string, unknown> = { name };
    if (sku) set.sku = sku;
    if (owner) set.ownerId = owner;
    if (sku) set.sku = sku;
    if (typeof r.quantity !== "undefined") set.quantity = Math.max(0, Math.round(asFiniteNumber(r.quantity, 0)));
    if (typeof r.unitPrice !== "undefined") set.unitPrice = Math.max(0, asFiniteNumber(r.unitPrice, 0));
    if (typeof r.costPrice !== "undefined") set.costPrice = Math.max(0, asFiniteNumber(r.costPrice, 0));
    if (typeof r.sold !== "undefined") set.sold = Math.max(0, Math.round(asFiniteNumber(r.sold, 0)));
    for (const k of ["category", "status", "description", "image", "condition"] as const) {
      if (typeof r[k] === "string" && (r[k] as string).trim()) set[k] = (r[k] as string).trim().slice(0, 1000);
    }
    // Global SKU/name match (stable across the claim migration), then stamp
    // the owner so the doc lands in their workspace, never someone else's.
    const filter: Record<string, unknown> = sku ? { sku } : { name };
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
  // resolves the reference back to bytes at send time.
  const imageUrl = image.startsWith("data:") ? `store-photo:${id}` : resolveImageUrl(image);
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
  };
}

export async function loadPersona(userId?: string): Promise<AssistantPersona | null> {
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

export async function loadBusiness(scope?: string): Promise<BusinessInfo | null> {
  await ensureConn();
  const owner = scope ? await resolveScopeOwner(scope).catch(() => null) : null;
  let doc = null;
  if (owner) doc = await SettingsView.findOne({ ownerId: owner }).lean();
  // Legacy single-shop doc (pre-multi-user) until it is claimed.
  doc ??= await SettingsView.findOne({ key: "default" }).lean();
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
