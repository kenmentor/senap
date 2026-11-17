import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { signSession, sessionCookie } from "@/lib/auth";

/** One-click demo login — creates the demo account on first use. */
export async function POST() {
  try {
    await dbConnect();
    let user = await User.findOne({ email: "demo@senap.local" });
    if (!user) {
      user = await User.create({ name: "Demo Owner", email: "demo@senap.local" });
    }
    const res = NextResponse.json({ ok: true, name: user.name, email: user.email });
    res.cookies.set(sessionCookie.name, await signSession(user.id), sessionCookie);
    return res;
  } catch {
    return NextResponse.json({ error: "Database is offline. Retry in a moment." }, { status: 503 });
  }
}
