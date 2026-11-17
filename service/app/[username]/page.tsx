import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreData } from "@/lib/storefront";
import StoreGrid from "@/components/store/StoreGrid";

/** Reserved single-segment paths that must never be treated as a store name. */
const RESERVED = new Set([
  "sw.js",
  "manifest.webmanifest",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "icon.svg",
  "icon.png",
  "apple-touch-icon.png",
]);

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  if (RESERVED.has((params.username ?? "").toLowerCase())) return { title: "Senap" };
  const data = await getStoreData(params.username ?? "");
  if (!data) return { title: "Store not found — Senap" };
  return {
    title: `${data.business.name} — shop online`,
    description: `Browse ${data.business.name}: ${data.products.length} products with live prices. Order straight on WhatsApp.`,
  };
}

export default async function UsernameStorePage({ params }: { params: { username: string } }) {
  const clean = (params.username ?? "").toLowerCase().trim();
  if (RESERVED.has(clean)) notFound();
  const data = await getStoreData(clean);
  if (!data) notFound();
  return <StoreGrid business={data.business} products={data.products} />;
}
