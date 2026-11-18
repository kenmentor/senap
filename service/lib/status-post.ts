import { agentBase, agentHeaders } from "@/lib/agent";
import { isVideoUrl } from "@/lib/store";

export type PostableProduct = {
  id: string;
  name: string;
  unitPrice: number;
  condition?: string;
  description?: string;
  image?: string;
};

/** Dealer-style caption: name + price (optional) + condition flag. */
export function statusCaption(p: PostableProduct, includePrice: boolean): string {
  const bits = [p.name.trim() || "New arrival"];
  if (includePrice && p.unitPrice > 0) bits.push(`₦${Number(p.unitPrice).toLocaleString("en-NG")}`);
  if (p.condition && p.condition !== "New") bits.push(`(${p.condition})`);
  const desc = (p.description ?? "").trim().split("\n")[0].slice(0, 120);
  const head = bits.join(" — ");
  return desc && !head.toLowerCase().includes(desc.toLowerCase().slice(0, 20))
    ? `${head}\n${desc}`
    : head;
}

/** Push one product to a line's WhatsApp status. Throws with a human message on failure. */
export async function postProductToStatus(
  lineId: string,
  p: PostableProduct,
  includePrice: boolean,
): Promise<void> {
  const media = (p.image ?? "").trim();
  const isVideo = isVideoUrl(media);
  const body: Record<string, string> = { text: statusCaption(p, includePrice).slice(0, 700) };
  if (media && /^https?:\/\//i.test(media)) {
    if (isVideo) body.videoUrl = media;
    else body.imageUrl = media;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${agentBase()}/sessions/${encodeURIComponent(lineId)}/status`, {
      method: "POST",
      headers: { ...agentHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? `Status post failed (${res.status})`);
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Agent took too long — is it running?");
    if (e instanceof TypeError) throw new Error("Agent unreachable — is it running?");
    throw e instanceof Error ? e : new Error("Status post failed.");
  } finally {
    clearTimeout(t);
  }
}
