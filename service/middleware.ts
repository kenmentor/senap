import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-change-me");
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("senap_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, secret());
      return NextResponse.next();
    } catch {
      /* expired / forged — fall through to signin */
    }
  }
  const url = new URL("/signin", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
