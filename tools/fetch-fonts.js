// SITARA — Generator font lokal (self-host)
// Mengunduh Plus Jakarta Sans + Marcellus dari Google Fonts, menyimpannya di
// public/fonts (woff2), lalu menulis public/css/fonts.css dengan path lokal.
//
//   npm run fetch-fonts      # jalankan sekali saat ada internet
//
// Setelah itu aplikasi TIDAK lagi menghubungi fonts.googleapis.com, sehingga
// halaman tampil cepat walau jaringan Rutan tanpa akses internet (LAN saja).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const FONTS_DIR = path.join(PUBLIC_DIR, 'fonts');
const CSS_OUT = path.join(PUBLIC_DIR, 'css', 'fonts.css');

// Chrome UA dipakai agar Google mengirim format woff2 (paling ringan)
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Marcellus&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Hanya subset yang dipakai (teks Indonesia) — sisanya dibuang agar ringan
const SUBSETS = new Set(['latin', 'latin-ext']);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parseFaces(css) {
  const faces = [];
  const blockRe = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const subset = m[1];
    const body = m[2];
    const get = (prop) => {
      const r = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
      return r ? r[1].trim() : '';
    };
    const urlMatch = get('src').match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!urlMatch) continue;
    faces.push({
      subset,
      family: get('font-family').replace(/['"]/g, ''),
      style: get('font-style') || 'normal',
      weight: get('font-weight') || '400',
      range: get('unicode-range'),
      url: urlMatch[1]
    });
  }
  return faces;
}

async function main() {
  console.log('[SITARA] Mengunduh CSS font dari Google Fonts…');
  const cssRes = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
  if (!cssRes.ok) throw new Error(`Gagal mengambil CSS font (HTTP ${cssRes.status})`);
  const css = await cssRes.text();

  const faces = parseFaces(css).filter((f) => SUBSETS.has(f.subset));
  if (!faces.length) throw new Error('Tidak ada @font-face woff2 pada respons Google Fonts');

  fs.mkdirSync(FONTS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CSS_OUT), { recursive: true });

  const out = [];
  let total = 0;
  for (const face of faces) {
    const fileName = `${slug(face.family)}-${face.subset}-${face.weight}-${face.style}.woff2`;
    const target = path.join(FONTS_DIR, fileName);
    const res = await fetch(face.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Gagal mengunduh ${fileName} (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(target, buf);
    total += buf.length;
    console.log(`  ✓ ${fileName} (${(buf.length / 1024).toFixed(1)} kB)`);

    out.push(
      `@font-face {\n` +
        `  font-family: '${face.family}';\n` +
        `  font-style: ${face.style};\n` +
        `  font-weight: ${face.weight};\n` +
        `  font-display: swap;\n` +
        `  src: url('/fonts/${fileName}') format('woff2');\n` +
        (face.range ? `  unicode-range: ${face.range};\n` : '') +
        `}`
    );
  }

  const header =
    `/* SITARA — Font lokal (dibuat otomatis oleh tools/fetch-fonts.js)\n` +
    `   Plus Jakarta Sans + Marcellus · ${faces.length} berkas · ${(total / 1024).toFixed(0)} kB\n` +
    `   Jangan diubah manual: jalankan "npm run fetch-fonts" untuk memperbarui. */\n\n`;
  fs.writeFileSync(CSS_OUT, header + out.join('\n\n') + '\n');

  console.log(`[SITARA] Selesai: ${faces.length} font (${(total / 1024).toFixed(0)} kB) → public/fonts + public/css/fonts.css`);
}

main().catch((err) => {
  console.error('[SITARA] Gagal membuat font lokal:', err.message);
  process.exitCode = 1;
});
