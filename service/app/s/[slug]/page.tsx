import { notFound, redirect } from "next/navigation";
import { canonicalSlugForLegacy } from "@/lib/storefront";

/** Legacy /s/<slug> links forward to the canonical /<username> address. */
export default async function LegacyStoreRedirect({ params }: { params: { slug: string } }) {
  const canonical = await canonicalSlugForLegacy(params.slug ?? "");
  if (!canonical) notFound();
  redirect(`/${canonical}`);
}
