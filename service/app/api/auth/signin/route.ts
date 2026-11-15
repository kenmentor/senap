import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { signSession, sessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email, password } = await req.json();
    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, name: user.name, email: user.email });
    res.cookies.set(sessionCookie.name, await signSession(user.id), sessionCookie);
    return res;
  } catch {
    return NextResponse.json({ error: "Database is offline. Start MongoDB and retry." }, { status: 503 });
  }
}
