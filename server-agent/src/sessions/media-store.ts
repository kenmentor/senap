import { v2 as cloudinary } from "cloudinary";

/**
 * Product media uploads (status imports today, dashboard uploads tomorrow).
 * Configured ONLY via CLOUDINARY_URL (`cloudinary://key:secret@cloud`) —
 * never hardcode credentials. Unconfigured → null and callers fall back to
 * embedded data URLs, so local dev works with zero setup.
 */

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const raw = (process.env.CLOUDINARY_URL ?? "").trim();
  const m = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!m) {
    configured = false;
    return false;
  }
  try {
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export function cloudinaryReady(): boolean {
  return ensureConfigured();
}

/**
 * Upload one product photo/video buffer. Returns the public https URL, or
 * null when unconfigured/failed (caller falls back to a data URL or no photo).
 */
export async function uploadProductMedia(
  buf: Buffer,
  mime: string,
  ownerId?: string | null,
): Promise<string | null> {
  if (!buf || buf.length === 0 || !ensureConfigured()) return null;
  if (!/^(image|video)\//.test(mime)) return null;
  const tag = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const publicId = `senap/products/${ownerId ? `${ownerId}/` : ""}${tag}`;
  try {
    const done = await new Promise<{ secure_url?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", public_id: publicId, timeout: 120_000 },
        (err, result) => (err ? reject(err) : resolve(result ?? {})),
      );
      stream.on("error", reject);
      stream.end(buf);
    });
    if (done.secure_url) return done.secure_url;
    return null;
  } catch {
    return null;
  }
}
