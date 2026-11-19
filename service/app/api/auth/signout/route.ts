import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookie } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Match the cookie's original attributes (secure/httpOnly/sameSite/path) so
  // the browser actually drops it — a Secure cookie cleared without Secure
  // survives in some browsers and the user stays logged in.
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookie, maxAge: 0 });
  return res;
}
