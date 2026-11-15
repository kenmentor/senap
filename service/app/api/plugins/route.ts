import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { PluginConnection } from "@/lib/db/models/PluginConnection";

function dbError() {
  return NextResponse.json(
    { error: "Database is offline. Start MongoDB (docker start senap-mongo) and retry." },
    { status: 503 }
  );
}

export async function GET() {
  try {
    await dbConnect();
    let docs = await PluginConnection.find().sort({ createdAt: 1 }).lean();
    if (docs.length === 0) {
      await PluginConnection.insertMany([
        { toolId: "gmail", account: "sales@nalaphones.com", enabled: true, grants: [], lastUsed: "12 min ago" },
        { toolId: "sheets", account: "Nala sales log", enabled: true, grants: [], lastUsed: "1 h ago" }
      ]);
      docs = await PluginConnection.find().sort({ createdAt: 1 }).lean();
    }
    return NextResponse.json(docs.map((d) => docId(d)));
  } catch {
    return dbError();
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const b = await req.json();
    if (!b?.toolId) return NextResponse.json({ error: "toolId is required." }, { status: 400 });
    const doc = await PluginConnection.create({
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
