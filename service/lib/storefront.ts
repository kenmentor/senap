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
    // Legacy docs without an owner (pre-claim) still serve globally so a
    // store never goes dark; claimed docs are strictly per-owner.
    const productFilter = owner ? { ownerId: owner } : {};
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
    return {
      business: {
        name: settings.business?.name ?? "Shop",
        phone: settings.business?.phone ?? "",
        address: settings.business?.address ?? "",
        currency: settings.business?.currency ?? "NGN ₦",
      },
      products,
    };
  } catch {
    return null;
  }
}
