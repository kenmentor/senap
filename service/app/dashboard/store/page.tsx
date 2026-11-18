"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { Store, Copy, Check, ExternalLink, Package, AlertTriangle, Save, Pencil, ImagePlus, Trash2, Loader2 } from "lucide-react";
import { cleanSlug } from "@/lib/store";

type Biz = { name: string; phone: string };
type Prod = { id: string; name: string; quantity: number };

export default function StorePage() {
  const [biz, setBiz] = useState<Biz>({ name: "Shop", phone: "" });
  const [slug, setSlug] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [banner, setBanner] = useState("");
  const [bannerDraft, setBannerDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const liveSlug = savedSlug || "shop";
  const storeUrl = `${origin}/${liveSlug}`;
  const previewSlug = cleanSlug(draft);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([fetch("/api/settings"), fetch("/api/products")]);
      if (sRes.ok) {
        const s = await sRes.json();
        if (s.business) setBiz({ name: s.business.name || "Shop", phone: s.business.phone || "" });
        if (typeof s.storeSlug === "string" && s.storeSlug) {
          setSlug(s.storeSlug);
          setSavedSlug(s.storeSlug);
        }
        if (typeof s.bannerImage === "string") {
          setBanner(s.bannerImage);
          setBannerDraft(s.bannerImage);
        }
      }
      if (pRes.ok) {
        const list = await pRes.json();
        setProducts(
          (Array.isArray(list) ? list : []).map((p: { id?: unknown; _id?: unknown; name?: unknown; quantity?: unknown }) => ({
            id: String(p?.id ?? p?._id ?? Math.random()),
            name: String(p?.name ?? "Unnamed"),
            quantity: Number(p?.quantity ?? 0),
          })),
        );
      }
    } catch {
      /* offline — page still renders */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl);
    } catch {
      /* clipboard blocked — link is visible to copy by hand */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const saveSlug = async () => {
    const clean = cleanSlug(draft);
    if (!clean) {
      setError("Use letters, numbers and dashes (e.g. nala-phones).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeSlug: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setSlug(data.storeSlug || clean);
      setSavedSlug(data.storeSlug || clean);
      setEditing(false);
      flash("Store link updated — the agent shares the new one from now on.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const saveBanner = async (url: string) => {
    const clean = url.trim().slice(0, 2000);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerImage: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save banner.");
      setBanner(typeof data.bannerImage === "string" ? data.bannerImage : clean);
      setBannerDraft(typeof data.bannerImage === "string" ? data.bannerImage : clean);
      flash(clean ? "Banner updated — live on your store now." : "Banner removed — back to placeholder.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save banner.");
    } finally {
      setSaving(false);
    }
  };

  const uploadBannerFile = async (f: File) => {
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      const url = String(data.url || data.secure_url || "");
      if (!url.startsWith("http")) throw new Error("Upload failed.");
      setBannerDraft(url);
      await saveBanner(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const inStock = products.filter((p) => p.quantity > 0).length;
  const outCount = products.length - inStock;
  const stat = useMemo(
    () => [
      { label: "Products", value: String(products.length) },
      { label: "In stock", value: String(inStock) },
      { label: "Out of stock", value: String(outCount) },
    ],
    [products.length, inStock, outCount],
  );

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display flex items-center gap-2 text-[22px] font-bold" style={{ color: "#e9edef" }}>
            <Store size={22} style={{ color: "#00a884" }} /> Your store
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "#8a949b" }}>
            Buyer-facing page — customers browse, you sell. The agent drops this link in chats by itself.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl p-3 text-[12.5px]" style={{ background: "rgba(230,106,106,0.08)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.3)" }}>
          {error}
        </p>
      )}

      {/* Link card */}
      <div className="mt-4 rounded-2xl p-5 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
        <p className="text-[12px] font-medium" style={{ color: "#8a949b" }}>Public store link</p>
        <button
          onClick={copy}
          title="Tap to copy"
          className="mt-1.5 flex w-full items-center gap-2 rounded-xl px-3.5 py-3 text-left transition active:bg-white/10"
          style={{ background: "rgba(0,168,132,0.07)", border: "1px dashed rgba(0,168,132,0.45)" }}
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]" style={{ color: "#00d19f" }}>
            {origin ? storeUrl.replace(/^https?:\/\//, "") : `/${liveSlug}`}
          </span>
          {copied ? <Check size={17} strokeWidth={2.5} style={{ color: "#00d19f" }} /> : <Copy size={16} style={{ color: "#636c73" }} />}
        </button>

        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition active:scale-[0.99]"
            style={{ background: "#00a884", color: "#04241d" }}
          >
            <ExternalLink size={16} strokeWidth={2.5} /> Open store
          </a>
          <button
            onClick={copy}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition active:bg-white/10"
            style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#e9edef" }}
          >
            {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} />} {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        {/* Slug */}
        <div className="mt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
          {editing ? (
            <div>
              <label className="block text-[12px] font-medium" style={{ color: "#8a949b" }}>
                Store address name
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9- ]/g, ""))}
                  placeholder="nala-phones"
                  className="mt-1.5 w-full rounded-xl px-3.5 text-[15px] outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 48 }}
                />
              </label>
              {draft.trim() && (
                <p className="mt-1.5 truncate text-[12px]" style={{ color: "#636c73" }}>
                  Becomes <span className="font-mono" style={{ color: "#00d19f" }}>/{previewSlug}</span>
                </p>
              )}
              <div className="mt-2.5 flex gap-2.5">
                <button onClick={saveSlug} disabled={saving} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
                  <Save size={15} strokeWidth={2.5} /> {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setDraft(savedSlug); }} className="min-h-[44px] rounded-xl px-5 text-[13.5px] font-medium transition active:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#aebac1" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setDraft(savedSlug); setEditing(true); }} className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-2 text-left transition active:opacity-80">
              <span className="text-[13px]" style={{ color: "#8a949b" }}>
                Address: <span className="font-mono font-semibold" style={{ color: "#e9edef" }}>/{liveSlug}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "#00d19f" }}>
                <Pencil size={13} /> Change
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Banner */}
      <div className="mt-2.5 rounded-2xl p-5 sm:mt-3.5 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
        <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Store banner</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: "#8a949b" }}>Cover photo at the top of your store. Empty = placeholder.</p>
        <div className="relative mt-3 overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(135deg, #0b3d33 0%, #0e151a 55%, #111b21 100%)" }}>
          <div className="relative h-36 w-full sm:h-44">
            {(bannerDraft || banner) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerDraft || banner} alt="Store banner preview" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[12.5px]" style={{ color: "#8a949b" }}>
                Placeholder banner shows until you upload one
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
          <label className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition active:scale-[0.99]" style={{ background: "#00a884", color: "#04241d", opacity: uploading || saving ? 0.6 : 1 }}>
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} strokeWidth={2.5} />}
            {uploading ? "Uploading…" : "Upload banner"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading || saving}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBannerFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {(banner || bannerDraft) && (
            <button
              onClick={() => void saveBanner("")}
              disabled={uploading || saving}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold transition active:bg-white/10 disabled:opacity-50"
              style={{ border: "1px solid rgba(230,106,106,0.4)", color: "#e66a6a" }}
            >
              <Trash2 size={15} /> Remove
            </button>
          )}
        </div>
        <label className="mt-3 block text-[12px] font-medium" style={{ color: "#8a949b" }}>
          Or paste image URL
          <span className="mt-1.5 flex gap-2">
            <input
              value={bannerDraft}
              onChange={(e) => setBannerDraft(e.target.value)}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-xl px-3.5 text-[13px] outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e9edef", height: 44 }}
            />
            <button
              onClick={() => void saveBanner(bannerDraft)}
              disabled={saving || uploading || bannerDraft.trim() === (banner || "").trim()}
              className="shrink-0 rounded-xl px-5 text-[13.5px] font-semibold transition active:scale-[0.99] disabled:opacity-50"
              style={{ background: "#00a884", color: "#04241d", height: 44 }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </span>
        </label>
      </div>

      {/* Stats */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 sm:mt-3.5 sm:gap-3.5">
        {stat.map((s) => (
          <div key={s.label} className="rounded-2xl p-3 sm:p-5" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
            <p className="truncate text-[10px] font-semibold uppercase sm:text-[11px]" style={{ color: "#636c73", letterSpacing: "0.08em" }}>{s.label}</p>
            <p className="font-display mt-1 text-[22px] font-bold leading-none sm:mt-1.5 sm:text-[32px]" style={{ color: "#e9edef" }}>
              {loading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* QR for the shop banner */}
      <div className="mt-2.5 rounded-2xl p-5 sm:mt-3.5 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-2xl bg-white p-2.5">
            <QRCode value={origin ? storeUrl : `/${liveSlug}`} size={120} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold" style={{ color: "#e9edef" }}>Shop banner QR</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "#8a949b" }}>
              Print this and stick it in {biz.name} — walk-in customers scan it and browse the full catalog on their own phones.
            </p>
          </div>
        </div>
      </div>

      {/* How it sells */}
      <div className="mt-2.5 rounded-2xl p-5 sm:mt-3.5 sm:p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#e9edef" }}>
          <Package size={16} style={{ color: "#00a884" }} /> How it sells for you
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed" style={{ color: "#aebac1" }}>
          <li className="flex gap-2"><span style={{ color: "#00a884" }}>1.</span> A customer asks for “your catalogue”, a link, or wants to browse — the agent sends this page by itself.</li>
          <li className="flex gap-2"><span style={{ color: "#00a884" }}>2.</span> They see live prices, photos and stock, then tap Order — it opens WhatsApp with the order pre-typed to you.</li>
          <li className="flex gap-2"><span style={{ color: "#00a884" }}>3.</span> Keep <Link href="/dashboard/products" className="font-semibold" style={{ color: "#00d19f" }}>products</Link> updated and the store is always current. Out-of-stock items show as unavailable automatically.</li>
        </ul>
        {outCount > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-xl p-3 text-[12.5px]" style={{ background: "rgba(232,180,91,0.08)", color: "#e8b45b", border: "1px solid rgba(232,180,91,0.3)" }}>
            <AlertTriangle size={15} className="shrink-0" /> {outCount} {outCount === 1 ? "product is" : "products are"} hidden behind an out-of-stock badge — restock from Products to sell {outCount === 1 ? "it" : "them"} again.
          </p>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-3 text-[13.5px] font-semibold shadow-2xl md:bottom-6" style={{ background: "#1f2c34", borderColor: "rgba(0,168,132,0.4)", color: "#e9edef" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
