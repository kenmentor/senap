import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { Product } from "@/lib/db/models/Product";
import { LinkedAccount } from "@/lib/db/models/LinkedAccount";
import { Agent } from "@/lib/db/models/Agent";
import { Settings } from "@/lib/db/models/Settings";
import { PluginConnection } from "@/lib/db/models/PluginConnection";

export const DEMO_EMAIL = "demo@senap.local";

/**
 * One-time-per-user workspace settlement (runs on login, idempotent).
 *
 * The app launched single-user, so pre-existing docs have no owner. The FIRST
 * real (non-demo) email to sign in adopts every ownerless doc — plus anything
 * the demo account gathered while the owner was testing — because that data
 * is theirs. Every later email gets a fresh empty workspace: real lock-in.
 * The demo account reseeds its own samples and never claims anything.
 */
const settled = new Set<string>();

/** Matches pre-multi-user docs (field missing, null, or empty string). */
const ownerlessFilter = () => ({ ownerId: { $in: [null, ""] } });

async function dropLegacyPluginIndex(): Promise<void> {
  try {
    await dbConnect();
    const conn = (await dbConnect()).connection;
    if (!conn.db) return;
    const cols = await conn.db.listCollections({ name: "pluginconnections" }).toArray();
    if (cols.length === 0) return;
    await conn.db.collection("pluginconnections").dropIndex("toolId_1").catch(() => {});
  } catch {
    /* index already gone or collection missing — fine */
  }
}

const DEMO_PRODUCTS = [
  { name: "Tecno Spark 20 8/128GB", sku: "TEC-SP20", quantity: 12, unitPrice: 155000, costPrice: 140000, category: "Phones", condition: "New", description: "8GB RAM, 128GB storage, 5000mAh battery. Sealed with receipt.", image: "/products/jiji-01.jpg", sold: 4 },
  { name: "iPhone 11 128GB (UK Used)", sku: "APL-11-128", quantity: 3, unitPrice: 220000, costPrice: 195000, category: "Phones", condition: "UK Used", description: "Body 10/10, battery health 89%, fully working.", image: "/products/jiji-02.jpg", sold: 9 },
  { name: "Samsung Galaxy A14", sku: "SAM-A14", quantity: 7, unitPrice: 178000, costPrice: 160000, category: "Phones", condition: "New", description: "6.6 inch display, 50MP camera, side fingerprint.", image: "/products/jiji-03.jpg", sold: 2 },
  { name: "Oraimo FreePods Pro", sku: "ORA-FP-PRO", quantity: 20, unitPrice: 25000, costPrice: 18000, category: "Accessories", condition: "New", description: "Active noise cancellation, 36-hour playtime.", image: "/products/jiji-04.jpg", sold: 15 },
  { name: "Anker 20000mAh Power Bank", sku: "ANK-20K", quantity: 9, unitPrice: 32000, costPrice: 24000, category: "Accessories", condition: "New", description: "22.5W fast charging, charges 3 devices at once.", image: "/products/jiji-05.jpg", sold: 6 },
];

export async function settleWorkspace(userId: string, email: string): Promise<void> {
  if (settled.has(userId)) return;
  try {
    await dbConnect();
    await dropLegacyPluginIndex();

    if (email === DEMO_EMAIL) {
      // Demo keeps its own sandbox: reseed samples only when it has nothing.
      const count = await Product.countDocuments({ ownerId: userId });
      if (count === 0) {
        await Product.insertMany(DEMO_PRODUCTS.map((p) => ({ ...p, ownerId: userId, status: "Available", updatedAt: Date.now() })));
      }
      settled.add(userId);
      return;
    }

    // Later real users keep an empty workspace — nothing to adopt.
    const other = await User.findOne({ email: { $ne: DEMO_EMAIL }, _id: { $ne: userId } })
      .select("_id")
      .lean();
    if (other) {
      settled.add(userId);
      return;
    }

    // First real user: adopt ownerless docs + whatever demo gathered.
    const demo = await User.findOne({ email: DEMO_EMAIL }).select("_id").lean();
    const demoId = demo ? String(demo._id) : "";
    const bare = ownerlessFilter();
    await Product.updateMany(bare, { $set: { ownerId: userId } });
    await LinkedAccount.updateMany(bare, { $set: { ownerId: userId } });
    await Agent.updateMany(bare, { $set: { ownerId: userId } });
    await PluginConnection.updateMany(bare, { $set: { ownerId: userId } });
    // Legacy settings doc becomes this owner's (re-keyed so lookups stay O(1)).
    await Settings.updateMany(bare, { $set: { ownerId: userId, key: userId } });
    if (demoId) {
      const demoFilter = { ownerId: demoId };
      await Product.updateMany(demoFilter, { $set: { ownerId: userId } });
      await LinkedAccount.updateMany(demoFilter, { $set: { ownerId: userId } });
      await Agent.updateMany(demoFilter, { $set: { ownerId: userId } });
      await PluginConnection.updateMany(demoFilter, { $set: { ownerId: userId } });
      await Settings.updateMany(demoFilter, { $set: { ownerId: userId, key: userId } });
    }

    settled.add(userId);
  } catch {
    /* best-effort — APIs scope by owner regardless */
  }
}
