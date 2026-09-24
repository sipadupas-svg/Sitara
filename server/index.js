// SITARA — HTTP Server (zero-dependency): API + static PWA + SPA fallback
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Router } from './router.js';
import { registerAuth } from './routes/auth.js';
import { registerBarang } from './routes/barang.js';
import { registerPegawai } from './routes/pegawai.js';
import { registerDashboard } from './routes/dashboard.js';
import { registerPeminjaman } from './routes/peminjaman.js';
import { registerImport } from './routes/import.js';
import { registerLaporan, registerAudit } from './routes/laporan.js';
import { registerUsers } from './routes/users.js';
import { registerAdmin } from './routes/admin.js';
import { uploadsDir } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const router = new Router();
registerAuth(router);
registerBarang(router);
registerPegawai(router);
registerDashboard(router);
registerPeminjaman(router);
registerImport(router);
registerLaporan(router);
registerAudit(router);
registerUsers(router);
registerAdmin(router);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf'
};

// Ekstensi teks yang mendatangkan keuntungan besar bila dikompresi
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.svg', '.txt', '.csv', '.xml']);
// Aset yang praktis tidak berubah → cukup diunduh sekali oleh browser
const IMMUTABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf']);

// Pilih algoritma kompresi terbaik yang didukung browser (brotli > gzip > deflate)
function pickEncoding(req, ext, size) {
  if (!COMPRESSIBLE.has(ext) || size < 512) return null;
  const accept = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(accept)) return 'br';
  if (/\bgzip\b/.test(accept)) return 'gzip';
  if (/\bdeflate\b/.test(accept)) return 'deflate';
  return null;
}

function compressor(enc) {
  if (enc === 'br') return zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
  if (enc === 'gzip') return zlib.createGzip({ level: 6 });
  return zlib.createDeflate({ level: 6 });
}

async function serveFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  let st;
  try {
    st = await fsp.stat(filePath);
  } catch {
    st = null;
  }
  if (!st || !st.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 - Berkas tidak ditemukan');
  }

  // ETag murah (ukuran + waktu ubah) → kunjungan berikutnya cukup 304, tidak unduh ulang penuh.
  // HTML/JS/SW tetap "no-cache" agar update aplikasi langsung terpakai; sisanya boleh lama di cache.
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type,
    ETag: etag,
    'Last-Modified': st.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': IMMUTABLE.has(ext) ? 'public, max-age=604800' : 'no-cache'
  };
  if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  const enc = pickEncoding(req, ext, st.size);
  if (enc) headers['Content-Encoding'] = enc;

  res.writeHead(200, headers);
  const file = fs.createReadStream(filePath);
  file.on('error', () => res.destroy());
  if (enc) file.pipe(compressor(enc)).pipe(res);
  else file.pipe(res);
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Foto dokumentasi (data/uploads)
  if (pathname.startsWith('/uploads/')) {
    const abs = path.join(uploadsDir, path.basename(pathname));
    try {
      if ((await fsp.stat(abs)).isFile()) return await serveFile(req, res, abs);
    } catch { /* berkas tidak ada */ }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 - Foto tidak ditemukan');
  }

  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    if ((await fsp.stat(safePath)).isFile()) return await serveFile(req, res, safePath);
  } catch { /* lanjut ke fallback SPA */ }

  // SPA fallback: semua rute non-file kembalikan index.html
  if (!path.extname(pathname)) {
    return await serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - Berkas tidak ditemukan');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    return router.handle(req, res, url).catch((err) => {
      console.error('[SITARA] Fatal API error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Kesalahan server internal' }));
      }
    });
  }

  serveStatic(req, res, url).catch((err) => {
    console.error('[SITARA] Static error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 - Kesalahan server');
    }
  });
});

// Pertahankan koneksi lebih lama: banyak berkas kecil (CSS/JS/font) dikirim
// lewat satu koneksi TCP, sehingga halaman terasa jauh lebih cepat di HP.
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

server.listen(PORT, HOST, () => {
  console.log('==============================================');
  console.log('  🏛️  SITARA — Sistem Tata Kelola Aset Rutan');
  console.log('  Peminjaman Barang BMN · Rutan Klas I Samarinda');
  console.log('==============================================');
  console.log(`  Server berjalan di : http://localhost:${PORT}`);
  console.log(`  Akses LAN          : http://<IP-KOMPUTER>:${PORT}`);
  console.log('  Akun default       : admin / admin123');
  console.log('==============================================');
});

// Penanganan galat jaringan: pesan yang jelas dalam bahasa Indonesia,
// bukan stack trace mentah — kasus tersering adalah port sudah dipakai
// oleh instance SITARA lain yang masih berjalan.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('==============================================');
    console.error(`  [!] Port ${PORT} sedang dipakai proses lain.`);
    console.error('  Kemungkinan SITARA sudah berjalan di jendela lain.');
    console.error('  Cara mengatasi:');
    console.error('   1) Tutup jendela server yang lama, lalu jalankan ulang.');
    console.error(`   2) Atau pakai port lain : $env:PORT=3001; npm run dev`);
    console.error(`   3) Cari proses pemakai : netstat -ano | findstr :${PORT}`);
    console.error('      Hentikan dengan    : taskkill /PID <PID> /F');
    console.error('==============================================');
    process.exit(1);
  }
  console.error('==============================================');
  console.error('  [!] Server gagal dijalankan:', err.message);
  console.error('==============================================');
  process.exit(1);
});
