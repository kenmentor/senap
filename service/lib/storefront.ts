import { dbConnect, docId } from "@/lib/db/mongoose";
import { Settings } from "@/lib/db/models/Settings";
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
 * Buyer-safe store payload (never costPrice). Public — no auth.
 * Resolves the slug to its owning settings doc, then serves ONLY that
 * owner's business + products. Unknown slug → null.
 */
export async function getStoreData(slug: string): Promise<StoreData | null> {
  try {
    const clean = (slug ?? "").toLowerCase().trim();
    if (!clean) return null;
    await dbConnect();

    // Explicit slug wins (unique across owners — enforced on save).
    let settings = await Settings.findOne({ storeSlug: clean }).lean();
    if (!settings) {
      // Legacy fallback: slug derived from the business name.
      const candidates = await Settings.find({
        $or: [{ storeSlug: "" }, { storeSlug: { $exists: false } }],
      })
        .select("business ownerId storeSlug")
        .lean();
      const hit = candidates.find((d) => slugify(d.business?.name ?? "") === clean);
      if (!hit) return null;
      settings = await Settings.findById(hit._id).lean();
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
