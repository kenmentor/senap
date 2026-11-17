import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { signSession, sessionCookie } from "@/lib/auth";
import { settleWorkspace } from "@/lib/claims";

/**
 * Passwordless email entry (no verification codes — launch-speed auth).
 * The client shows an explicit "is this really your email?" confirm screen
 * before calling this, so typos and casual impersonation need a deliberate
 * second tap. Anyone who knows an address CAN enter that account — email OTP
 * is the planned upgrade when abuse shows up.
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

/* ---- tiny in-memory rate limiter (per Render instance; good enough to blunt
   credential-stuffing-style email spraying at launch) ---- */
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
    // Cheap prune: drop the oldest quarter of keys.
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
  const email = String(body.email ?? "").toLowerCase().trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "That doesn't look like an email address." },
      { status: 400 },
    );
  }
  if (!underLimit(`email:${email}`, 10, 60 * 60_000)) {
    return NextResponse.json(
      { error: "Too many tries for this email — wait an hour and retry." },
      { status: 429 },
    );
  }

  try {
    await dbConnect();
    let user = await User.findOne({ email });
    let isNew = false;
    if (!user) {
      user = await User.create({ name: nameFromEmail(email), email });
      isNew = true;
    }
    // First real email adopts the pre-launch workspace; later emails start empty.
    await settleWorkspace(String(user._id), email);
    const res = NextResponse.json({
      ok: true,
      name: user.name || "Business owner",
      email: user.email,
      isNew,
    });
    res.cookies.set(sessionCookie.name, await signSession(user.id), sessionCookie);
    return res;
  } catch {
    return NextResponse.json(
      { error: "Database is offline. Retry in a moment." },
      { status: 503 },
    );
  }
}
