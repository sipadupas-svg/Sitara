// SITARA — Generator ikon PNG (pure Node.js, tanpa library eksternal)
// Menulis PNG secara manual: IHDR + IDAT (zlib) + IEND
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------- CRC32 ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function pngEncode(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Bentuk (signed distance) ----------
const NAVY = [10, 31, 68];    // #0A1F44
const GOLD = [212, 175, 55];  // #D4AF37

function sdRoundRect(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdDiamond(x, y, a) {
  return (Math.abs(x) + Math.abs(y)) / a - 1; // <0 di dalam
}

function sdRect(x, y, hw, hh) {
  const dx = Math.abs(x) - hw, dy = Math.abs(y) - hh;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

const smooth = (d, w) => Math.min(1, Math.max(0, 0.5 - d / (2 * w))); // coverage 0..1

// Render emblem SITARA ke buffer RGBA (ukuran size x size)
function renderIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const k = size / 120;                 // skala terhadap koordinat SVG 120
  const inset = maskable ? 0 : 0.0667 * size;
  const pad = maskable ? 0.14 * size : 0; // emblem lebih kecil untuk maskable
  const aa = 1.0;                        // lebar anti-alias (px)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Supersampling 2x2
      let r = 0, g = 0, b = 0, a = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const sx = x + ox, sy = y + oy;
        const cx = sx - size / 2, cy = sy - size / 2;

        // Latar
        let cov = 1;
        if (!maskable) {
          const sd = sdRoundRect(cx, cy, size / 2 - inset / 2, size / 2 - inset / 2, 24 * k * (size / 120) * (120 / size));
          cov = 1 - smooth(sd, aa); // dalam = penuh
        }
        let cr = NAVY[0], cg = NAVY[1], cb = NAVY[2];

        // Border emas dalam
        const sdB = sdRoundRect(cx, cy, size / 2 - inset - 1 * k, size / 2 - inset - 1 * k, 14 * k);
        const bCov = smooth(Math.abs(sdB) - 1 * k, aa);
        cr = cr + (GOLD[0] - cr) * bCov;
        cg = cg + (GOLD[1] - cg) * bCov;
        cb = cb + (GOLD[2] - cb) * bCov;

        // Skala relatif emblem (maskable: lebih kecil)
        const es = maskable ? size - pad * 2 : size;
        const ex = (sx - (maskable ? size / 2 : size / 2)) * (es / size);
        const ey = (sy - (maskable ? size / 2 : size / 2)) * (es / size);
        const kk = es / 120;

        // Berlian luar (outline)
        const dOut = Math.abs(sdDiamond(ex, ey, 34 * kk)) - 1.25 * kk;
        const dCov = smooth(dOut, aa);
        cr = cr + (GOLD[0] - cr) * dCov;
        cg = cg + (GOLD[1] - cg) * dCov;
        cb = cb + (GOLD[2] - cb) * dCov;

        // Berlian dalam (terisi)
        const dIn = sdDiamond(ex, ey, 12 * kk);
        const iCov = 1 - smooth(dIn, aa);
        cr = cr + (GOLD[0] - cr) * iCov;
        cg = cg + (GOLD[1] - cg) * iCov;
        cb = cb + (GOLD[2] - cb) * iCov;

        // Garis samping
        for (const side of [-1, 1]) {
          const dL = sdRect(ex - side * 28 * kk, ey, 4 * kk, 1.25 * kk);
          const lCov = 1 - smooth(dL, aa);
          cr = cr + (GOLD[0] - cr) * lCov;
          cg = cg + (GOLD[1] - cg) * lCov;
          cb = cb + (GOLD[2] - cb) * lCov;
        }

        r += cr * cov; g += cg * cov; b += cb * cov; a += cov;
      }
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / 4);
      px[i + 1] = Math.round(g / 4);
      px[i + 2] = Math.round(b / 4);
      px[i + 3] = Math.round((a / 4) * 255);
    }
  }
  return px;
}

function save(name, size, opts) {
  const buf = pngEncode(size, size, renderIcon(size, opts));
  writeFileSync(path.join(outDir, name), buf);
  console.log(`[SITARA] Ikon dibuat: public/icons/${name} (${size}x${size}, ${(buf.length / 1024).toFixed(1)} KB)`);
}

save('icon-512.png', 512);
save('icon-192.png', 192);
save('icon-180.png', 180);
save('icon-maskable-512.png', 512, { maskable: true });
console.log('[SITARA] Semua ikon selesai dibuat.');
