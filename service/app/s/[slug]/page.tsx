import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreData } from "@/lib/storefront";
import StoreGrid from "./store-grid";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getStoreData(params.slug ?? "");
  if (!data) return { title: "Store not found — Senap" };
  return {
    title: `${data.business.name} — shop online`,
    description: `Browse ${data.business.name}: ${data.products.length} products with live prices. Order straight on WhatsApp.`,
  };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  const data = await getStoreData(params.slug ?? "");
  if (!data) notFound();
  return <StoreGrid business={data.business} products={data.products} />;
}
