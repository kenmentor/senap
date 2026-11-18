import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { dbConnect } from "@/lib/db/mongoose";
import { sessionUser, signedOut } from "@/lib/auth-helpers";

function cloudinaryReady(): boolean {
  const raw = (process.env.CLOUDINARY_URL ?? "").trim();
  const m = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!m) return false;
  try {
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    return true;
  } catch {
    return false;
  }
}

/** Phone/camera upload straight to Cloudinary — returns a public URL for the product form. */
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me) return signedOut();
  try {
    await dbConnect();
  } catch {
    return NextResponse.json({ error: "Database is offline." }, { status: 503 });
  }
  if (!cloudinaryReady()) {
    return NextResponse.json(
      { error: "Photo hosting isn't set up — add CLOUDINARY_URL to the dashboard service env." },
      { status: 503 },
    );
  }
  let buf: Buffer;
  let mime = "";
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No file received." }, { status: 400 });
    if (file.size <= 0 || file.size > 12_000_000) {
      return NextResponse.json({ error: "Keep photos under 12MB." }, { status: 400 });
    }
    mime = file.type || "";
    if (!/^(image|video)\//.test(mime)) {
      return NextResponse.json({ error: "Only photos and videos." }, { status: 400 });
    }
    buf = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });
  }
  try {
    const tag = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const done = await new Promise<{ secure_url?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", public_id: `senap/products/${me.id}/${tag}`, timeout: 120_000 },
        (err, result) => (err ? reject(err) : resolve(result ?? {})),
      );
      stream.on("error", reject);
      stream.end(buf);
    });
    if (!done.secure_url) throw new Error("no url");
    void mime;
    return NextResponse.json({ url: done.secure_url }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed — try a smaller photo." }, { status: 502 });
  }
}
