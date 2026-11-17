import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { Settings } from "@/lib/db/models/Settings";
import { sessionUser, signedOut } from "@/lib/auth-helpers";
import { slugForOwner } from "@/lib/storefront";

function dbError() {
  return NextResponse.json({ error: "Database is offline." }, { status: 503 });
}

export async function GET() {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
    // One settings doc per owner; created lazily with schema defaults.
    let doc = await Settings.findOne({ ownerId: me.id }).lean();
    if (!doc) {
      const created = await Settings.create({ key: me.id, ownerId: me.id });
      doc = created.toObject();
    }
    // Every owner gets a unique public store address (their username),
    // minted once from their account/business name.
    if (!((doc as { storeSlug?: unknown }).storeSlug ?? "").toString().trim()) {
      await slugForOwner(me.id).catch(() => {});
      doc = (await Settings.findOne({ ownerId: me.id }).lean()) ?? doc;
    }
    const { adminOtpHash: _omit, ...safe } = doc as unknown as Record<string, unknown>;
    void _omit;
    return NextResponse.json(docId(safe as { _id: unknown }));
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
    const patch: Record<string, unknown> = {};
    if (b.business && typeof b.business === "object") patch.business = b.business;
    if (b.notifications && typeof b.notifications === "object") patch.notifications = b.notifications;
    if (Array.isArray(b.team)) patch.team = b.team.slice(0, 20).map((m: unknown) => {
      const mm = m as Record<string, unknown>;
      return { name: String(mm.name || "").slice(0, 60), role: String(mm.role || "Staff").slice(0, 40), access: String(mm.access || "View & chat").slice(0, 40) };
    });
    if (["Starter", "Growth", "Scale"].includes(b.plan)) patch.plan = b.plan;
    if (typeof b.storeSlug === "string") {
      const slug = b.storeSlug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, 60);
      if (slug) {
        // Slugs are the public address — first owner to claim one keeps it.
        const taken = await Settings.findOne({ storeSlug: slug, ownerId: { $ne: me.id } })
          .select("_id")
          .lean();
        if (taken) {
          return NextResponse.json({ error: "That store address is taken — try another." }, { status: 409 });
        }
      }
      patch.storeSlug = slug;
    }
    if (typeof b.adminPhone === "string") {
      const next = b.adminPhone.trim().slice(0, 32);
      const current = await Settings.findOne({ ownerId: me.id }).select("adminPhone").lean();
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
    // Key tracks the owner so every owner's doc stays unique under the key index.
    const doc = await Settings.findOneAndUpdate({ ownerId: me.id }, { $set: { ...patch, key: me.id, ownerId: me.id } }, { new: true, upsert: true }).lean();
    const { adminOtpHash: _omit, ...safe } = doc as unknown as Record<string, unknown>;
    return NextResponse.json(docId(safe as { _id: unknown }));
  } catch (e) {
    // Race on first save (two tabs) hits the unique key — just read it back.
    if ((e as { code?: number })?.code === 11000) {
      try {
        const doc = await Settings.findOne({ ownerId: me.id }).lean();
        if (doc) {
          const { adminOtpHash: _o, ...safe } = doc as unknown as Record<string, unknown>;
          return NextResponse.json(docId(safe as { _id: unknown }));
        }
      } catch {
        /* fall through */
      }
    }
    return dbError();
  }
}
