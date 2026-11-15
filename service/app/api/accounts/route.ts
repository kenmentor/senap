import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { LinkedAccount } from "@/lib/db/models/LinkedAccount";

function dbError() {
  return NextResponse.json(
    { error: "Database is offline. Start MongoDB (docker start senap-mongo) and retry." },
    { status: 503 }
  );
}

export async function GET() {
  try {
    await dbConnect();
    const docs = await LinkedAccount.find().sort({ createdAt: 1 }).lean();
    // NOTE: never seed here — auto-creating a record when the collection is
    // empty is what made deleted accounts reappear on reload.
    return NextResponse.json(docs.map((d) => docId(d)));
  } catch {
    return dbError();
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const b = await req.json();
    if (!b?.number?.trim()) return NextResponse.json({ error: "Number is required." }, { status: 400 });
    const doc = await LinkedAccount.create({
      number: String(b.number).trim(),
      name: String(b.name || "Nala Phones").trim() || "Nala Phones",
      linkedAt: String(b.linkedAt || "Today"),
      engineId: String(b.engineId || b.number).trim(),
      unlinked: Boolean(b.unlinked ?? false)
    });
    return NextResponse.json(docId(doc.toObject()), { status: 201 });
  } catch {
    return dbError();
  }
}
