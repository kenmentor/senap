import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "senap_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-change-me");
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: SESSION_COOKIE,
  maxAge: MAX_AGE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};
