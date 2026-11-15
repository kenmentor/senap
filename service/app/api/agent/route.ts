import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Agent } from "@/lib/db/models/Agent";
import { EMPLOYEE_DEFAULTS } from "@/lib/demo/agentDefaults";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const userId = new URL(req.url).searchParams.get("userId")?.trim();
    if (userId) {
      const own = await Agent.findOne({ key: userId }).lean();
      if (own) return NextResponse.json(docId(own));
      // No per-number config yet — hand back the shared defaults as a base.
    }
    let doc = await Agent.findOne({ key: "default" }).lean();
    if (!doc) {
      const created = await Agent.create({ key: "default", ...EMPLOYEE_DEFAULTS });
      doc = created.toObject();
    }
    return NextResponse.json(docId(doc));
  } catch {
    return dbError();
  }
}

export async function PUT(req: Request) {
  try {
    await dbConnect();
    const b = await req.json();
    const key = String(b.userId ?? "default").trim() || "default";
    const allowed = [
      "empId", "activeEmp", "name", "role", "avatar", "photo", "avatarColor", "avatarInk",
      "personality", "greeting", "acts", "neverDo", "exCustomer", "exReply",
      "days", "open", "close"
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (b[k] !== undefined) patch[k] = b[k];
    const doc = await Agent.findOneAndUpdate({ key }, patch, { new: true, upsert: true }).lean();
    return NextResponse.json(docId(doc!));
  } catch {
    return dbError();
  }
}
