import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Product } from "@/lib/db/models/Product";
import { statusFor } from "@/lib/demo/catalog";
import { sessionUser, signedOut } from "@/lib/auth-helpers";

function dbError() {
  return NextResponse.json(
    { error: "Database is offline. Start MongoDB (docker start senap-mongo) and retry." },
    { status: 503 }
  );
}

export async function GET() {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const docs = await Product.find({ ownerId: me.id }).sort({ name: 1 }).lean();
    return NextResponse.json(docs.map((d) => docId(d)));
  } catch {
    return dbError();
  }
}

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const b = await req.json();
    if (!b?.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const quantity = Math.max(0, Math.floor(Number(b.quantity) || 0));
    const rawCond = String(b.condition ?? "New");
    const condition = rawCond === "UK Used" || rawCond === "Used" ? rawCond : "New";
    const doc = await Product.create({
      ownerId: me.id,
      name: String(b.name).trim(),
      sku: String(b.sku || "").trim() || "SKU-" + Date.now().toString(36).slice(-4).toUpperCase(),
      quantity,
      unitPrice: Math.max(0, Number(b.unitPrice) || 0),
      costPrice: Math.max(0, Number(b.costPrice) || 0),
      category: String(b.category || "General").trim() || "General",
      status: statusFor(quantity),
      condition,
      description: String(b.description || ""),
      image: String(b.image || "").trim(),
      sold: 0,
      updatedAt: Date.now()
    });
    return NextResponse.json(docId(doc.toObject()), { status: 201 });
  } catch {
    return dbError();
  }
}
