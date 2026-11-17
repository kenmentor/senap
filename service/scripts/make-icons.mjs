// Generates Senap PWA icons with zero dependencies (pure-Node PNG writer).
// Run: node scripts/make-icons.mjs   →   public/icons/*.png
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

/* ---------- minimal PNG encoder (RGBA → IHDR/IDAT/IEND) ---------- */
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, crc]);
}
function toPng(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter type 0 (None)
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- tiny canvas ---------- */
function hex(rgb) {
  const n = parseInt(rgb.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function canvas(size, bg) {
  const [r, g, b] = hex(bg);
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}
function setPx(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}
function circle(buf, size, cx, cy, rad, rgb) {
  const [r, g, b] = hex(rgb);
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rad) setPx(buf, size, x, y, r, g, b);
    }
  }
}
function roundRect(buf, size, radius) {
  // transparent corners over the flat bg
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x, radius), size - radius);
      const cy = Math.min(Math.max(y, radius), size - radius);
      if (Math.hypot(x - cx, y - cy) > radius) setPx(buf, size, x, y, 0, 0, 0, 0);
    }
  }
}

/* Pixel "S" (5×7) scaled up — crisp at any icon size. */
const S_GLYPH = [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."];
function drawS(buf, size, rgb) {
  const [r, g, b] = hex(rgb);
  const cell = size * 0.075;
  const gw = 5 * cell;
  const gh = 7 * cell;
  const ox = (size - gw) / 2;
  const oy = (size - gh) / 2;
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (S_GLYPH[gy][gx] !== "X") continue;
      for (let y = Math.floor(oy + gy * cell); y < oy + (gy + 1) * cell; y++) {
        for (let x = Math.floor(ox + gx * cell); x < ox + (gx + 1) * cell; x++) {
          setPx(buf, size, x, y, r, g, b);
        }
      }
    }
  }
}

function appTile(size, { bg, dot, glyph, rounded }) {
  const buf = canvas(size, bg);
  circle(buf, size, size / 2, size / 2, size * 0.31, dot);
  drawS(buf, size, glyph);
  if (rounded) roundRect(buf, size, size * 0.22);
  return toPng(size, size, buf);
}

function maskable(size) {
  // Full-bleed green; dark core well inside the mask safe zone.
  const buf = canvas(size, "#00a884");
  circle(buf, size, size / 2, size / 2, size * 0.33, "#04241d");
  drawS(buf, size, "#00a884");
  return toPng(size, size, buf);
}

writeFileSync(join(outDir, "icon-192.png"), appTile(192, { bg: "#111b21", dot: "#00a884", glyph: "#04241d", rounded: true }));
writeFileSync(join(outDir, "icon-512.png"), appTile(512, { bg: "#111b21", dot: "#00a884", glyph: "#04241d", rounded: true }));
writeFileSync(join(outDir, "apple-touch-180.png"), appTile(180, { bg: "#111b21", dot: "#00a884", glyph: "#04241d", rounded: false }));
writeFileSync(join(outDir, "maskable-512.png"), maskable(512));
console.log("icons written to", outDir);
