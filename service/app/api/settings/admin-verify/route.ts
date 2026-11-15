import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db/mongoose";
import { Settings } from "@/lib/db/models/Settings";
import { LinkedAccount } from "@/lib/db/models/LinkedAccount";

const AGENT_URL = (process.env.AGENT_URL ?? process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OTP_TTL_MS = 10 * 60 * 1000;

function digitsOf(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

function jidOf(phone: string): string {
  return `${digitsOf(phone)}@s.whatsapp.net`;
}

/** POST { step: 'send' } → sends a 6-digit code over WhatsApp. POST { step:'confirm', code } → verifies. */
export async function POST(req: Request) {
  try {
    await dbConnect();
    const b = await req.json().catch(() => ({}));
    const step = b.step === "confirm" ? "confirm" : "send";

    const settings = await Settings.findOne({ key: "default" })
      .select("+adminOtpHash adminPhone reportAccountId adminVerified adminOtpExpires")
      .lean();
    const adminPhone = String(settings?.adminPhone ?? "").trim();
    if (digitsOf(adminPhone).length < 7) {
      return NextResponse.json({ error: "Enter a valid admin WhatsApp number first and save it." }, { status: 400 });
    }

    if (step === "send") {
      // Which business line sends the code? Explicit choice, else first linked account.
      let from = String(settings?.reportAccountId ?? "").trim();
      if (!from) {
        const first = await LinkedAccount.findOne({ unlinked: { $ne: true } }).sort({ createdAt: 1 }).lean();
        from = String(first?.engineId ?? first?.number ?? "").trim();
      }
      if (!from) {
        return NextResponse.json({ error: "Link a WhatsApp account first — the code is sent from it." }, { status: 400 });
      }

      const code = String(randomInt(100000, 1000000));
      const hash = await bcrypt.hash(code, 10);
      await Settings.findOneAndUpdate(
        { key: "default" },
        { adminOtpHash: hash, adminOtpExpires: new Date(Date.now() + OTP_TTL_MS) },
        { upsert: true },
      );

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const key = (process.env.AGENT_API_KEY ?? "").trim();
        const res = await fetch(`${AGENT_URL}/sessions/${encodeURIComponent(from)}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { authorization: `Bearer ${key}`, "x-agent-key": key } : {}),
          },
          body: JSON.stringify({
            to: jidOf(adminPhone),
            text: `Your Senap admin code is ${code}. It expires in 10 minutes. Enter it in your Senap dashboard to verify this number.`,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) throw new Error(`agent ${res.status}`);
      } catch {
        return NextResponse.json(
          { error: "Could not send the code — is the agent on :3001 running and the reporting account connected?" },
          { status: 502 },
        );
      }
      return NextResponse.json({ sent: true, expiresInMinutes: 10 });
    }

    // confirm
    const code = String(b.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    if (!settings?.adminOtpHash || !settings?.adminOtpExpires || new Date(settings.adminOtpExpires).getTime() < Date.now()) {
      return NextResponse.json({ error: "That code expired — tap Send code for a fresh one." }, { status: 400 });
    }
    const ok = await bcrypt.compare(code, settings.adminOtpHash);
    if (!ok) return NextResponse.json({ error: "That code doesn't match — check WhatsApp and try again." }, { status: 400 });
    await Settings.findOneAndUpdate(
      { key: "default" },
      { adminVerified: true, adminVerifiedAt: new Date(), adminOtpHash: "", adminOtpExpires: undefined },
      { upsert: true },
    );
    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: "Database is offline." }, { status: 503 });
  }
}
