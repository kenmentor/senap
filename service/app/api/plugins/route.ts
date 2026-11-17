import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { PluginConnection } from "@/lib/db/models/PluginConnection";
import { sessionUser, signedOut } from "@/lib/auth-helpers";

function dbError() {
  return NextResponse.json(
    { error: "Database is offline. Start MongoDB (docker start senap-mongo) and retry." },
    { status: 503 }
  );
}

const SEEDS = [
  { toolId: "gmail", account: "sales@nalaphones.com", enabled: true, grants: [], lastUsed: "12 min ago" },
  { toolId: "sheets", account: "Nala sales log", enabled: true, grants: [], lastUsed: "1 h ago" }
];

export async function GET() {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    let docs = await PluginConnection.find({ ownerId: me.id }).sort({ createdAt: 1 }).lean();
    if (docs.length === 0) {
      await PluginConnection.insertMany(SEEDS.map((s) => ({ ...s, ownerId: me.id }))).catch(() => {});
      docs = await PluginConnection.find({ ownerId: me.id }).sort({ createdAt: 1 }).lean();
    }
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
    if (!b?.toolId) return NextResponse.json({ error: "toolId is required." }, { status: 400 });
    const doc = await PluginConnection.create({
      ownerId: me.id,
      toolId: String(b.toolId),
      account: String(b.account || ""),
      enabled: b.enabled ?? true,
      grants: Array.isArray(b.grants) ? b.grants.map(Boolean) : [],
      lastUsed: String(b.lastUsed || "Just now")
    });
    return NextResponse.json(docId(doc.toObject()), { status: 201 });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: "Already connected." }, { status: 409 });
    }
    return dbError();
  }
}
