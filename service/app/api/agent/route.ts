import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Agent } from "@/lib/db/models/Agent";
import { EMPLOYEE_DEFAULTS } from "@/lib/demo/agentDefaults";
import { sessionUser, signedOut, ownsLine, forbidden } from "@/lib/auth-helpers";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

/** Per-owner default key — shared "default" is read-only legacy from here on. */
const defaultKey = (ownerId: string) => `default:${ownerId}`;

export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const userId = new URL(req.url).searchParams.get("userId")?.trim();
    if (userId) {
      // A line id may only ever resolve to its own owner's config.
      if (!(await ownsLine(me.id, userId))) return forbidden("Not your line.");
      const own = await Agent.findOne({ key: userId, ownerId: me.id }).lean();
      if (own) return NextResponse.json(docId(own));
      // No per-number config yet — hand back the owner's defaults as a base.
    }
    let doc = await Agent.findOne({ key: defaultKey(me.id), ownerId: me.id }).lean();
    if (!doc) {
      // Read-only peek at the legacy shared default so a fresh owner doesn't
      // start from a blank slate (never written back to "default").
      doc = await Agent.findOne({ key: "default" }).lean();
    }
    if (!doc) {
      const created = await Agent.create({ key: defaultKey(me.id), ownerId: me.id, ...EMPLOYEE_DEFAULTS });
      doc = created.toObject();
    }
    return NextResponse.json(docId(doc));
  } catch {
    return dbError();
  }
}

export async function PUT(req: Request) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    const b = await req.json();
    const requested = String(b.userId ?? "default").trim() || "default";
    let key: string;
    if (requested === "default") {
      key = defaultKey(me.id);
    } else {
      if (!(await ownsLine(me.id, requested))) return forbidden("Not your line.");
      key = requested;
    }
    const allowed = [
      "empId", "activeEmp", "name", "role", "avatar", "photo", "avatarColor", "avatarInk",
      "personality", "greeting", "acts", "neverDo", "exCustomer", "exReply",
      "days", "open", "close"
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (b[k] !== undefined) patch[k] = b[k];
    const doc = await Agent.findOneAndUpdate(
      { key },
      { $set: { ...patch, ownerId: me.id } },
      { new: true, upsert: true }
    ).lean();
    return NextResponse.json(docId(doc!));
  } catch {
    return dbError();
  }
}
