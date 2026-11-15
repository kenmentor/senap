import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Settings } from "@/lib/db/models/Settings";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

export async function GET() {
  try {
    await dbConnect();
    let doc = await Settings.findOne({ key: "default" }).lean();
    if (!doc) {
      const created = await Settings.create({ key: "default" });
      doc = created.toObject();
    }
    const { adminOtpHash: _omit, ...safe } = doc as unknown as Record<string, unknown>;
    void _omit;
    return NextResponse.json(docId(safe as { _id: unknown }));
  } catch {
    return dbError();
  }
}

export async function PUT(req: Request) {
  try {
    await dbConnect();
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    if (b.business && typeof b.business === "object") patch.business = b.business;
    if (b.notifications && typeof b.notifications === "object") patch.notifications = b.notifications;
    if (Array.isArray(b.team)) patch.team = b.team.slice(0, 20).map((m: unknown) => {
      const mm = m as Record<string, unknown>;
      return { name: String(mm.name || "").slice(0, 60), role: String(mm.role || "Staff").slice(0, 40), access: String(mm.access || "View & chat").slice(0, 40) };
    });
    if (["Starter", "Growth", "Scale"].includes(b.plan)) patch.plan = b.plan;
    if (typeof b.adminPhone === "string") {
      const next = b.adminPhone.trim().slice(0, 32);
      const current = await Settings.findOne({ key: "default" }).select("adminPhone").lean();
      patch.adminPhone = next;
      // Changing the number resets verification — the new line must prove itself.
      if ((current?.adminPhone ?? "") !== next) {
        patch.adminVerified = false;
        patch.adminVerifiedAt = undefined;
        patch.adminOtpHash = "";
        patch.adminOtpExpires = undefined;
      }
    }
    if (typeof b.reportAccountId === "string") patch.reportAccountId = b.reportAccountId.trim().slice(0, 120);
    const doc = await Settings.findOneAndUpdate({ key: "default" }, patch, { new: true, upsert: true }).lean();
    const { adminOtpHash: _omit, ...safe } = doc as unknown as Record<string, unknown>;
    return NextResponse.json(docId(safe as { _id: unknown }));
  } catch {
    return dbError();
  }
}
