// SITARA — Database layer (node:sqlite, zero-dependency)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, renameSync, unlinkSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.join(__dirname, '..', 'data');
export const uploadsDir = path.join(dataDir, 'uploads');
mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });

// Restore otomatis saat boot: jika ada pending-restore.db yang valid,
// database lama dibackup lalu digantikan.
const dbPath = path.join(dataDir, 'sitara.db');
const pendingRestore = path.join(dataDir, 'pending-restore.db');
if (existsSync(pendingRestore)) {
  const sig = readFileSync(pendingRestore).subarray(0, 16);
  if (sig.equals(Buffer.from('SQLite format 3\0', 'latin1'))) {
    if (existsSync(dbPath)) copyFileSync(dbPath, dbPath + '.backup-' + Date.now());
    for (const suf of ['-wal', '-shm']) {
      if (existsSync(dbPath + suf)) { try { unlinkSync(dbPath + suf); } catch { /* noop */ } }
    }
    renameSync(pendingRestore, dbPath);
    console.log('[SITARA] Database berhasil dipulihkan dari backup (data lama tersimpan sebagai .backup-*)');
  } else {
    unlinkSync(pendingRestore);
    console.warn('[SITARA] pending-restore.db tidak valid — diabaikan');
  }
}

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','petugas')),
  aktif INTEGER NOT NULL DEFAULT 1,
  pegawai_id INTEGER REFERENCES pegawai(id),
  no_hp TEXT,
  daftar_mandiri INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pegawai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nip TEXT UNIQUE,
  nama TEXT NOT NULL,
  unit_kerja TEXT,
  jabatan TEXT,
  no_hp TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS barang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_barang TEXT NOT NULL,
  nup TEXT UNIQUE,
  kib TEXT,
  nama TEXT NOT NULL,
  kategori TEXT,
  merk TEXT,
  tipe TEXT,
  tahun_perolehan INTEGER,
  sumber_perolehan TEXT,
  nilai_perolehan REAL,
  kondisi TEXT NOT NULL DEFAULT 'Baik' CHECK (kondisi IN ('Baik','Rusak Ringan','Rusak Berat')),
  status TEXT NOT NULL DEFAULT 'Tersedia' CHECK (status IN ('Tersedia','Dipinjam','Perbaikan','Dihapus')),
  ruang TEXT,
  barcode TEXT UNIQUE,
  catatan TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS peminjaman (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_transaksi TEXT NOT NULL UNIQUE,
  pegawai_id INTEGER NOT NULL REFERENCES pegawai(id),
  keperluan TEXT,
  tanggal_pinjam TEXT,
  tanggal_rencana_kembali TEXT,
  tanggal_kembali TEXT,
  status TEXT NOT NULL DEFAULT 'Diajukan' CHECK (status IN ('Diajukan','Disetujui','Diserahkan','Dikembalikan','Ditolak')),
  catatan_penolakan TEXT,
  approved_by INTEGER REFERENCES users(id),
  diserahkan_oleh INTEGER REFERENCES users(id),
  diterima_oleh INTEGER REFERENCES users(id),
  dikembalikan_ke INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS detail_peminjaman (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peminjaman_id INTEGER NOT NULL REFERENCES peminjaman(id) ON DELETE CASCADE,
  barang_id INTEGER NOT NULL REFERENCES barang(id),
  jumlah INTEGER NOT NULL DEFAULT 1,
  kondisi_kembali TEXT CHECK (kondisi_kembali IN ('Baik','Rusak Ringan','Rusak Berat','Hilang')),
  catatan TEXT
);

CREATE TABLE IF NOT EXISTS dokumentasi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peminjaman_id INTEGER NOT NULL REFERENCES peminjaman(id) ON DELETE CASCADE,
  tahap TEXT NOT NULL CHECK (tahap IN ('kondisi-awal','serah-terima','pengembalian','berita-acara')),
  file_path TEXT NOT NULL,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS berita_acara (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peminjaman_id INTEGER NOT NULL UNIQUE REFERENCES peminjaman(id) ON DELETE CASCADE,
  nomor_ba TEXT,
  tanggal TEXT,
  file_path TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jenis TEXT,
  file_name TEXT,
  total_baris INTEGER,
  berhasil INTEGER,
  gagal INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  aksi TEXT NOT NULL,
  entitas TEXT,
  entitas_id INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_barang_status ON barang(status);
CREATE INDEX IF NOT EXISTS idx_barang_nama ON barang(nama);
CREATE INDEX IF NOT EXISTS idx_peminjaman_status ON peminjaman(status);
CREATE INDEX IF NOT EXISTS idx_detail_peminjaman ON detail_peminjaman(peminjaman_id);
CREATE INDEX IF NOT EXISTS idx_dok_peminjaman ON dokumentasi(peminjaman_id);
`);

// ---------- Migrasi ringan ----------
// Menambah kolom baru pada database yang sudah dipakai (tanpa kehilangan data).
function adaKolom(tabel, kolom) {
  return db.prepare(`PRAGMA table_info(${tabel})`).all().some((c) => c.name === kolom);
}

const migrasi = [
  ['users', 'pegawai_id', 'ALTER TABLE users ADD COLUMN pegawai_id INTEGER'],
  ['users', 'no_hp', 'ALTER TABLE users ADD COLUMN no_hp TEXT'],
  ['users', 'daftar_mandiri', 'ALTER TABLE users ADD COLUMN daftar_mandiri INTEGER NOT NULL DEFAULT 0']
];
for (const [tabel, kolom, sql] of migrasi) {
  if (!adaKolom(tabel, kolom)) {
    db.exec(sql);
    console.log(`[SITARA] Migrasi: kolom ${tabel}.${kolom} ditambahkan`);
  }
}

// Akun hasil pendaftaran mandiri (dibuat sendiri oleh pegawai di halaman masuk).
// Akun jenis ini boleh mengajukan peminjaman & membaca data, namun tidak boleh
// memverifikasi pengajuan atau mengubah master data — sampai admin mengangkatnya
// menjadi petugas penuh di menu Kelola Akun.
export function pendaftarMandiri(userId) {
  const row = db.prepare('SELECT daftar_mandiri FROM users WHERE id = ?').get(userId);
  return !!(row && row.daftar_mandiri);
}

export function audit(userId, aksi, entitas, entitasId = null, detail = null) {
  db.prepare(
    'INSERT INTO audit_log (user_id, aksi, entitas, entitas_id, detail) VALUES (?,?,?,?,?)'
  ).run(
    userId ?? null,
    aksi,
    entitas ?? null,
    entitasId ?? null,
    detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail))
  );
}

// ---------- Seed data awal ----------
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const { salt, hash } = hashPassword('admin123');
  db.prepare(
    'INSERT INTO users (username, password_hash, salt, nama, role) VALUES (?,?,?,?,?)'
  ).run('admin', hash, salt, 'Administrator SITARA', 'admin');
  console.log('[SITARA] Akun default dibuat -> username: admin | password: admin123');
}

const pegCount = db.prepare('SELECT COUNT(*) AS n FROM pegawai').get().n;
if (pegCount === 0) {
  const ins = db.prepare(
    'INSERT INTO pegawai (nip, nama, unit_kerja, jabatan, no_hp) VALUES (?,?,?,?,?)'
  );
  ins.run('197001012005011001', 'Budi Santoso, S.H.', 'Seksi Pemasyarakatan', 'Kepala Seksi', '0812-3456-7801');
  ins.run('198505102010021002', 'Siti Rahmawati, S.Ak.', 'Seksi BMN', 'Petugas BMN', '0812-3456-7802');
}

const barangCount = db.prepare('SELECT COUNT(*) AS n FROM barang').get().n;
if (barangCount === 0) {
  const ins = db.prepare(`INSERT INTO barang
    (kode_barang, nup, nama, kategori, merk, tipe, tahun_perolehan, sumber_perolehan, nilai_perolehan, kondisi, status, ruang, barcode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('108030200011016', '000001', 'Laptop', 'Peralatan dan Mesin', 'Lenovo', 'ThinkPad E14', 2023, 'APBN', 12500000, 'Baik', 'Tersedia', 'Ruang IT', '000001');
  ins.run('108030200011017', '000002', 'Proyektor', 'Peralatan dan Mesin', 'Epson', 'EB-X51', 2022, 'APBN', 6800000, 'Baik', 'Dipinjam', 'Aula', '000002');
  ins.run('108050100011004', '000003', 'Printer Laser', 'Peralatan dan Mesin', 'HP', 'LaserJet M1136', 2021, 'APBN', 2900000, 'Rusak Ringan', 'Perbaikan', 'Ruang Tata Usaha', '000003');
  console.log('[SITARA] Data contoh (3 barang BMN, 2 pegawai) dibuat');
}
