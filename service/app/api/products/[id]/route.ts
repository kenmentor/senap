import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Product } from "@/lib/db/models/Product";
import { statusFor } from "@/lib/demo/catalog";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();
    const b = await req.json();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.sku !== undefined) patch.sku = String(b.sku).trim();
    if (b.category !== undefined) patch.category = String(b.category).trim() || "General";
    if (b.description !== undefined) patch.description = String(b.description);
    if (b.image !== undefined) patch.image = String(b.image).trim();
    if (b.condition !== undefined && ["New", "UK Used", "Used"].includes(String(b.condition))) {
      patch.condition = String(b.condition);
    }
    if (b.quantity !== undefined) {
      const q = Math.max(0, Math.floor(Number(b.quantity) || 0));
      patch.quantity = q;
      patch.status = statusFor(q);
    }
    if (b.unitPrice !== undefined) patch.unitPrice = Math.max(0, Number(b.unitPrice) || 0);
    if (b.costPrice !== undefined) patch.costPrice = Math.max(0, Number(b.costPrice) || 0);
    if (b.sold !== undefined) patch.sold = Math.max(0, Math.floor(Number(b.sold) || 0));
    const doc = await Product.findByIdAndUpdate(params.id, patch, { new: true }).lean();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(docId(doc));
  } catch {
    return dbError();
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();
    const doc = await Product.findByIdAndDelete(params.id).lean();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
