import { dbConnect, docId } from "@/lib/db/mongoose";
import { Settings } from "@/lib/db/models/Settings";
import { User } from "@/lib/db/models/User";
import { Product } from "@/lib/db/models/Product";
import { slugify } from "@/lib/store";

export type StoreProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  status: string;
  condition: string;
  description: string;
  image: string;
  category: string;
  sold: number;
};

export type StoreBusiness = {
  name: string;
  phone: string;
  address: string;
  currency: string;
  /** Real WhatsApp profile pic of the linked line, if privacy allows. Null = initials fallback. */
  avatarUrl?: string | null;
  /** Custom cover banner (owner upload). Empty = placeholder. */
  bannerImage?: string | null;
};

export type StoreData = { business: StoreBusiness; products: StoreProduct[] };

/**
 * The owner's canonical store address. Explicit slug wins; otherwise one is
 * minted from the account name (then business name) and saved, unique across
 * owners (`name`, `name-2`, …). Idempotent — a set slug is returned as-is.
 */
export async function slugForOwner(ownerId: string): Promise<string> {
  await dbConnect();
  const doc = await Settings.findOne({ ownerId }).lean();
  if (!doc) return "shop";
  if ((doc.storeSlug ?? "").trim()) return doc.storeSlug!.trim();
  const user = await User.findById(ownerId).select("name").lean().catch(() => null);
  let base = slugify(user?.name ?? "");
  if (base === "shop") base = slugify(doc.business?.name ?? "");
  const taken = new Set(
    (await Settings.find({ storeSlug: { $ne: "" } }).select("storeSlug").lean()).map((d) => d.storeSlug),
  );
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-${n++}`;
  await Settings.updateOne({ _id: doc._id }, { $set: { storeSlug: candidate } });
  return candidate;
}

/**
 * Legacy /s/<slug> lookup → canonical /<username>. Exact slug match first,
 * then the old business-name form. Returns null when nothing matches.
 */
export async function canonicalSlugForLegacy(slug: string): Promise<string | null> {
  try {
    const clean = (slug ?? "").toLowerCase().trim();
    if (!clean) return null;
    await dbConnect();
    const exact = await Settings.findOne({ storeSlug: clean }).select("storeSlug").lean();
    if (exact?.storeSlug) return exact.storeSlug;
    const candidates = await Settings.find({
      $or: [{ storeSlug: "" }, { storeSlug: { $exists: false } }],
    })
      .select("_id ownerId business")
      .lean();
    // Old form: slug derived straight from the business name.
    const hit = candidates.find((d) => slugify(d.business?.name ?? "") === clean);
    if (!hit) return null;
    const ownerId = String((hit as { ownerId?: unknown }).ownerId ?? "");
    if (!ownerId) return null;
    return await slugForOwner(ownerId).catch(() => null);
  } catch {
    return null;
  }
}
export async function getStoreData(slug: string): Promise<StoreData | null> {
  try {
    const clean = (slug ?? "").toLowerCase().trim();
    if (!clean) return null;
    await dbConnect();

    // Explicit slug wins (unique across owners — enforced on save).
    let settings = await Settings.findOne({ storeSlug: clean }).lean();
    if (!settings) {
      // Username/business fallback: find the owner this address belongs to,
      // allocating their canonical slug on first hit so it sticks.
      const candidates = await Settings.find({
        $or: [{ storeSlug: "" }, { storeSlug: { $exists: false } }],
      })
        .select("_id ownerId business")
        .lean();
      for (const cand of candidates) {
        const ownerId = String((cand as { ownerId?: unknown }).ownerId ?? "");
        if (!ownerId) continue;
        const got = await slugForOwner(ownerId).catch(() => "");
        if (got === clean) {
          settings = await Settings.findById(cand._id).lean();
          break;
        }
      }
      if (!settings) return null;
    }

    const owner = String((settings as { ownerId?: unknown }).ownerId ?? "");
    // No owner, no store: an unclaimed settings doc must never serve a
    // global catalog — every store is isolated to its owner.
    if (!owner) return null;
    const productFilter = { ownerId: owner };
    const docs = await Product.find(productFilter).sort({ name: 1 }).lean();
    const products: StoreProduct[] = docs.map((d) => {
      const row = docId(d) as Record<string, unknown>;
      return {
        id: String(row.id ?? row._id ?? ""),
        name: String(row.name ?? "Unnamed"),
        sku: String(row.sku ?? ""),
        price: Number(row.unitPrice ?? 0),
        quantity: Number(row.quantity ?? 0),
        status: String(row.status ?? "Available"),
        condition: String(row.condition ?? "New"),
        description: String(row.description ?? "").slice(0, 1000),
        image: String(row.image ?? ""),
        category: String(row.category ?? "General"),
        sold: Number(row.sold ?? 0),
      };
    });
    products.sort((a, b) => {
      const aOut = a.quantity <= 0 ? 1 : 0;
      const bOut = b.quantity <= 0 ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return a.name.localeCompare(b.name);
    });
    // Real WhatsApp avatar for the shop logo (best-effort, privacy-respecting).
    // Falls back to initials when offline, unlinked, or privacy-blocked.
    let avatarUrl: string | null = null;
    try {
      const { LinkedAccount } = await import("@/lib/db/models/LinkedAccount");
      const lineDocs = owner
        ? ((await LinkedAccount.find({ ownerId: owner }).select("engineId").lean()) as { engineId?: unknown }[])
        : [];
      const lineId = lineDocs.map((d) => String(d.engineId || "").trim()).filter(Boolean)[0] ?? null;
      if (lineId) {
        const rawBase = (process.env.AGENT_URL ?? process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:3001").trim().replace(/\/+$/, "");
        const base = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawBase) ? rawBase : `https://${rawBase.replace(/^\/+/, "")}`;
        const key = (process.env.AGENT_API_KEY ?? process.env.NEXT_PUBLIC_AGENT_KEY ?? "").trim();
        const headers: Record<string, string> = key ? { authorization: `Bearer ${key}`, "x-agent-key": key } : {};
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const stateRes = await fetch(`${base}/sessions/${encodeURIComponent(lineId)}`, { signal: ctrl.signal, headers }).catch(() => null);
        const state = (await stateRes?.json().catch(() => null)) as { me?: unknown } | null;
        const me = typeof state?.me === "string" && state.me ? state.me : null;
        if (me) {
          const avRes = await fetch(`${base}/sessions/${encodeURIComponent(lineId)}/avatar?jid=${encodeURIComponent(me)}`, { signal: ctrl.signal, headers }).catch(() => null);
          const av = (await avRes?.json().catch(() => null)) as { url?: unknown } | null;
          if (typeof av?.url === "string" && av.url.startsWith("http")) avatarUrl = av.url;
        }
        clearTimeout(timer);
      }
    } catch {
      avatarUrl = null;
    }
    return {
      business: {
        name: settings.business?.name ?? "Shop",
        phone: settings.business?.phone ?? "",
        address: settings.business?.address ?? "",
        currency: settings.business?.currency ?? "NGN ₦",
        avatarUrl,
        bannerImage: typeof (settings as { bannerImage?: unknown }).bannerImage === "string" ? ((settings as { bannerImage?: string }).bannerImage ?? "") : "",
      },
      products,
    };
  } catch {
    return null;
  }
}
