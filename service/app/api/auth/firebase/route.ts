import { NextResponse } from "next/server";
import { dbConnect, docId } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { signSession, sessionCookie } from "@/lib/auth";
import { settleWorkspace } from "@/lib/claims";
import { verifyFirebaseToken, adminStatus } from "@/lib/firebase-admin";

/**
 * Firebase email-link exchange: the client proves the inbox with a Firebase
 * ID token, we mint our own 30-day session cookie (same shape as before, so
 * middleware + sessionUser() + every scoped API keep working unchanged).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Name fallback for brand-new accounts: jane.doe+shop@x.com → "Jane Doe". */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0].split("+")[0];
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ").slice(0, 40) || "Business owner";
}

const hits = new Map<string, number[]>();
function underLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    const keys = Array.from(hits.keys()).slice(0, 1250);
    for (const k of keys) hits.delete(k);
  }
  return true;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
  if (!underLimit(`ip:${ip}`, 30, 60 * 60_000)) {
    return NextResponse.json(
      { error: "Too many tries from this device — wait an hour and retry." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const idToken = String(body.idToken ?? "");
  if (!idToken) {
    return NextResponse.json({ error: "Sign-in token missing — try again." }, { status: 400 });
  }

  const verified = await verifyFirebaseToken(idToken);
  if (!verified) {
    const status = await adminStatus();
    if (!status.ready) {
      console.error("[api/auth/firebase] admin SDK not ready:", status.reason ?? "unknown");
      return NextResponse.json(
        { error: "Email sign-in isn't set up on the server yet — the service key is missing or invalid. Check the terminal log." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't verify that sign-in — request a fresh link." },
      { status: 401 },
    );
  }
  const email = verified.email;
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email address looks invalid." }, { status: 400 });
  }

  try {
    await dbConnect();
    let user = await User.findOne({ email });
    let isNew = false;
    if (!user) {
      user = await User.create({ name: nameFromEmail(email), email });
      isNew = true;
    }
    await settleWorkspace(String(user._id), email);
    const res = NextResponse.json({
      ok: true,
      name: user.name || "Business owner",
      email: user.email,
      isNew,
    });
    res.cookies.set(sessionCookie.name, await signSession(user.id), sessionCookie);
    return res;
  } catch (e) {
    console.error("[api/auth/firebase] exchange failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Database is offline. Retry in a moment." },
      { status: 503 },
    );
  }
}
