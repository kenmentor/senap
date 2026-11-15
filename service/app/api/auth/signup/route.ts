import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { signSession, sessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { name, email, password } = await req.json();
    if (!email?.trim() || !password || String(password).length < 6) {
      return NextResponse.json({ error: "Email and a 6+ character password are required." }, { status: 400 });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase().trim() }).lean();
    if (existing) return NextResponse.json({ error: "That email is already registered. Sign in instead." }, { status: 409 });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      name: String(name || "").trim() || "Business owner",
      email: String(email).toLowerCase().trim(),
      passwordHash
    });
    const res = NextResponse.json({ ok: true, name: user.name, email: user.email });
    res.cookies.set(sessionCookie.name, await signSession(user.id), sessionCookie);
    return res;
  } catch {
    return NextResponse.json({ error: "Database is offline. Start MongoDB and retry." }, { status: 503 });
  }
}
