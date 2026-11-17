import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { LinkedAccount } from "@/lib/db/models/LinkedAccount";
import { settleWorkspace } from "@/lib/claims";

export type SessionUser = { id: string; email: string; name: string };

/** Logged-in dashboard user, or null. Every dashboard API starts here. */
export async function sessionUser(): Promise<SessionUser | null> {
  try {
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const uid = await verifySession(token);
    if (!uid) return null;
    await dbConnect();
    const user = await User.findById(uid).select("email name").lean();
    if (!user?.email) return null;
    // One-time workspace settlement (first real email adopts pre-launch data;
    // later emails start empty). No-op after the first call per instance.
    await settleWorkspace(String(user._id), user.email);
    return { id: String(user._id), email: user.email, name: user.name || "Business owner" };
  } catch {
    return null;
  }
}

export function signedOut() {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}

export function forbidden(message = "Not your line.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Engine ids of WhatsApp lines this owner linked. */
export async function ownedLineIds(ownerId: string): Promise<string[]> {
  await dbConnect();
  const docs = await LinkedAccount.find({ ownerId }).select("engineId").lean();
  return docs.map((d) => String(d.engineId || "").trim()).filter(Boolean);
}

/** True only when this exact line belongs to this owner. */
export async function ownsLine(ownerId: string, lineId: string): Promise<boolean> {
  const id = (lineId ?? "").trim();
  if (!id) return false;
  await dbConnect();
  const doc = await LinkedAccount.findOne({ ownerId, engineId: id }).select("_id").lean();
  return !!doc;
}

/**
 * Proxy gate for in-progress linking: a line with NO account doc yet is a
 * fresh link (allowed — device names are user-chosen secrets with a short
 * window); a line owned by someone else is always denied.
 */
export async function lineVisible(ownerId: string, lineId: string): Promise<boolean> {
  const id = (lineId ?? "").trim();
  if (!id) return false;
  await dbConnect();
  const doc = await LinkedAccount.findOne({ engineId: id }).select("ownerId").lean();
  if (!doc) return true;
  return String(doc.ownerId || "") === ownerId;
}
