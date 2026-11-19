import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Browsers probe /favicon.ico on every page — serve the app icon instead of 404ing. */
export async function GET() {
  try {
    const buf = await readFile(join(process.cwd(), "public", "icons", "icon-192.png"));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
