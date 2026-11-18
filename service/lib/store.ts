/**
 * Shared storefront helpers (service side). The agent has a mirrored copy in
 * server-agent (slugify/resolveStoreSlug/storeUrl) — keep the two in sync:
 * same input must always produce the same /<username> URL on both sides.
 */

export function slugify(name: string): string {
  const slug = (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
  return slug || "shop";
}

/** Clean a user-typed slug the same way everywhere. */
export function cleanSlug(raw: string): string {
  return slugify(raw);
}

export type StoreBusiness = {
  name: string;
  phone: string;
  address: string;
  currency: string;
};

/** The store address: explicit slug wins, then the account username, then business. */
export function resolveStoreSlug(
  settings: { storeSlug?: string; business?: { name?: string } },
  userName?: string,
): string {
  const raw = (settings.storeSlug ?? "").trim();
  if (raw) return cleanSlug(raw);
  const uname = slugify(userName ?? "");
  if (uname !== "shop") return uname;
  return slugify(settings.business?.name ?? "");
}

/** Public path of the buyer storefront. */
export function storePath(slug: string): string {
  return `/${slug}`;
}

/** "NGN ₦" -> "₦", "USD $" -> "$". Falls back to ₦. */
export function currencySymbol(currency: string | undefined): string {
  const parts = (currency ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "₦";
}

export function formatPrice(amount: number, currency?: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${currencySymbol(currency)}${n.toLocaleString("en-NG")}`;
}

/** Digits-only phone for wa.me links (drops +, spaces, dashes). */
export function waDigits(phone: string | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** True for video media: data:video blobs, .mp4/.webm/.mov, Cloudinary video paths. */
export function isVideoUrl(url: string | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  if (/^data:video\//i.test(u)) return true;
  const path = u.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|3gp|avi)$/.test(path)) return true;
  return /\/video\/upload\//.test(u);
}

/** Prefilled "I want to order…" WhatsApp deep link for a product. */
export function orderLink(phone: string | undefined, businessName: string, productName: string, price: string): string {
  const text = `Hello ${businessName}, I'd like to order: ${productName} (${price})`;
  return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
}
