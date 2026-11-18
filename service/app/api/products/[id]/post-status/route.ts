import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Product } from "@/lib/db/models/Product";
import { Settings } from "@/lib/db/models/Settings";
import { sessionUser, signedOut, ownsLine } from "@/lib/auth-helpers";
import { postProductToStatus } from "@/lib/status-post";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

/** Push one in-stock product to the line's WhatsApp status. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const doc = await Product.findOne({ _id: params.id, ownerId: me.id }).lean();
    if (!doc) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if ((doc.quantity ?? 0) <= 0) {
      return NextResponse.json({ error: "Out of stock — restock it first." }, { status: 400 });
    }
    const settings = await Settings.findOne({ ownerId: me.id }).select("statusFlow").lean();
    const flow = (settings?.statusFlow ?? {}) as { lineId?: string; includePrice?: boolean; postingEnabled?: boolean };
    const b = await req.json().catch(() => ({}));
    const lineId = String(b.lineId ?? flow.lineId ?? "").trim();
    if (!lineId) return NextResponse.json({ error: "Pick which line posts it first." }, { status: 400 });
    if (!(await ownsLine(me.id, lineId))) {
      return NextResponse.json({ error: "That line isn't yours." }, { status: 403 });
    }
    await postProductToStatus(lineId, {
      id: String(doc._id),
      name: doc.name,
      unitPrice: doc.unitPrice,
      condition: doc.condition,
      description: doc.description,
      image: doc.image,
    }, flow.includePrice !== false);
    await Product.updateOne({ _id: doc._id }, { $set: { lastStatusPostAt: Date.now() } }).catch(() => {});
    return NextResponse.json({ posted: true, id: docId(doc).id });
  } catch (e) {
    if (e instanceof Error && !/offline/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return dbError();
  }
}
