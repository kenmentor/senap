import { NextResponse } from "next/server";
import { getStoreData } from "@/lib/storefront";

/**
 * Public buyer storefront data — NO auth. Only buyer-safe fields are
 * returned (never costPrice or internal notes). Unknown slug → 404.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const data = await getStoreData(params.slug ?? "");
  if (!data) {
    // Null covers both "unknown slug" and "DB unreachable" — buyers get one
    // honest message either way; sellers see the same page and check the DB.
    return NextResponse.json({ error: "Store not found or offline." }, { status: 404 });
  }
  return NextResponse.json(data);
}
