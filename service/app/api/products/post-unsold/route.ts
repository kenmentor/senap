import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Product } from "@/lib/db/models/Product";
import { Settings } from "@/lib/db/models/Settings";
import { sessionUser, signedOut, ownsLine } from "@/lib/auth-helpers";
import { postProductToStatus } from "@/lib/status-post";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

/** Push the stalest in-stock products (never-posted first) to status — max 3, oldest first. */
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const b = await req.json().catch(() => ({}));
    const settings = await Settings.findOne({ ownerId: me.id }).select("statusFlow").lean();
    const flow = (settings?.statusFlow ?? {}) as { lineId?: string; includePrice?: boolean };
    const lineId = String(b.lineId ?? flow.lineId ?? "").trim();
    if (!lineId) return NextResponse.json({ error: "Pick which line posts first." }, { status: 400 });
    if (!(await ownsLine(me.id, lineId))) {
      return NextResponse.json({ error: "That line isn't yours." }, { status: 403 });
    }
    const docs = await Product.find({ ownerId: me.id, quantity: { $gt: 0 } })
      .sort({ lastStatusPostAt: 1, updatedAt: 1 })
      .limit(3)
      .lean();
    if (docs.length === 0) {
      return NextResponse.json({ error: "Nothing in stock to post." }, { status: 404 });
    }
    const posted: string[] = [];
    let failed: string | null = null;
    for (const doc of docs) {
      try {
        await postProductToStatus(lineId, {
          id: String(doc._id),
          name: doc.name,
          unitPrice: doc.unitPrice,
          condition: doc.condition,
          description: doc.description,
          image: doc.image,
        }, flow.includePrice !== false);
        posted.push(docId(doc).id);
        await Product.updateOne({ _id: doc._id }, { $set: { lastStatusPostAt: Date.now() } }).catch(() => {});
      } catch (e) {
        failed = e instanceof Error ? e.message : "A post failed.";
        break;
      }
    }
    if (posted.length === 0) {
      return NextResponse.json({ error: failed ?? "Nothing posted." }, { status: 502 });
    }
    return NextResponse.json({ posted, failed });
  } catch {
    return dbError();
  }
}
