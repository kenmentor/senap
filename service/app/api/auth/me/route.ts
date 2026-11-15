import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models/User";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

export async function GET() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const uid = await verifySession(token);
  if (!uid) return NextResponse.json({ error: "Session expired." }, { status: 401 });
  try {
    await dbConnect();
    const user = await User.findById(uid).lean();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    return NextResponse.json({ name: user.name, email: user.email });
  } catch {
    return NextResponse.json({ error: "Database is offline." }, { status: 503 });
  }
}
