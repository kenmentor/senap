import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { PluginConnection } from "@/lib/db/models/PluginConnection";
import { sessionUser, signedOut } from "@/lib/auth-helpers";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    if (b.account !== undefined) patch.account = String(b.account);
    if (b.enabled !== undefined) patch.enabled = Boolean(b.enabled);
    if (b.grants !== undefined && Array.isArray(b.grants)) patch.grants = b.grants.map(Boolean);
    if (b.lastUsed !== undefined) patch.lastUsed = String(b.lastUsed);
    const doc = await PluginConnection.findOneAndUpdate({ _id: params.id, ownerId: me.id }, patch, { new: true }).lean();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(docId(doc));
  } catch {
    return dbError();
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const doc = await PluginConnection.findOneAndDelete({ _id: params.id, ownerId: me.id }).lean();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
