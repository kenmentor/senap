import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { LinkedAccount } from "@/lib/db/models/LinkedAccount";
import { sessionUser, signedOut } from "@/lib/auth-helpers";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const b = await req.json().catch(() => ({}));
    const doc = await LinkedAccount.findOneAndUpdate(
      { _id: params.id, ownerId: me.id },
      { ...(typeof b.unlinked === "boolean" ? { unlinked: b.unlinked } : {}) },
      { new: true }
    ).lean();
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
    const doc = await LinkedAccount.findOneAndDelete({ _id: params.id, ownerId: me.id }).lean();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
