// SITARA — Routes: Autentikasi
import { db, audit } from '../db.js';
import { signToken, verifyPassword, hashPassword } from '../auth.js';
import { send } from '../router.js';

// ---------- Pendaftaran mandiri (publik) ----------
// Pembatasan sederhana: maksimum 10 pendaftaran per jam untuk setiap alamat IP,
// supaya formulir publik tidak disalahgunakan untuk membuat akun massal.
const MAX_DAFTAR_PER_JAM = 10;
const riwayatDaftar = new Map(); // ip -> [waktuDaftar, ...]

function bolehDaftar(ip) {
  const now = Date.now();
  if (riwayatDaftar.size > 500) riwayatDaftar.clear(); // jaga pemakaian memori
  const arr = (riwayatDaftar.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (arr.length >= MAX_DAFTAR_PER_JAM) {
    riwayatDaftar.set(ip, arr);
    return false;
  }
  arr.push(now);
  riwayatDaftar.set(ip, arr);
  return true;
}

function alamatKlien(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'tidak-diketahui';
}

export function registerAuth(router) {
  router.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return send(res, 400, { error: 'Username dan password wajib diisi' });
    }
    const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND aktif = 1').get(username);
    if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
      return send(res, 401, { error: 'Username atau password salah' });
    }
    audit(row.id, 'login', 'user', row.id, { username: row.username });
    const token = signToken({ id: row.id, username: row.username, nama: row.nama, role: row.role });
    send(res, 200, {
      token,
      user: {
        id: row.id, username: row.username, nama: row.nama, role: row.role,
        pegawai_id: row.pegawai_id || null, daftar_mandiri: row.daftar_mandiri ? 1 : 0
      }
    });
  }, { public: true });

  router.get('/api/auth/me', (req, res) => {
    const row = db.prepare(
      'SELECT id, username, nama, role, pegawai_id, no_hp, daftar_mandiri FROM users WHERE id = ? AND aktif = 1'
    ).get(req.user.id);
    if (!row) return send(res, 401, { error: 'Akun tidak ditemukan' });
    send(res, 200, { user: { ...row, pegawai_id: row.pegawai_id || null, daftar_mandiri: row.daftar_mandiri ? 1 : 0 } });
  });

  router.post('/api/auth/change-password', (req, res) => {
    const { passwordLama, passwordBaru } = req.body || {};
    if (!passwordLama || !passwordBaru) {
      return send(res, 400, { error: 'Password lama dan baru wajib diisi' });
    }
    if (String(passwordBaru).length < 6) {
      return send(res, 400, { error: 'Password baru minimal 6 karakter' });
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!row || !verifyPassword(passwordLama, row.salt, row.password_hash)) {
      return send(res, 400, { error: 'Password lama tidak sesuai' });
    }
    const { salt, hash } = hashPassword(passwordBaru);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, row.id);
    audit(row.id, 'ubah_password', 'user', row.id);
    send(res, 200, { message: 'Password berhasil diubah' });
  });

  // Pendaftaran mandiri pegawai yang ingin mengajukan peminjaman BMN.
  // Akun dibuat dengan peran "petugas" dan langsung aktif; petugas BMN tetap
  // dapat memantau, menonaktifkan, atau mereset passwordnya di menu Kelola Akun.
  router.post('/api/auth/register', (req, res) => {
    const ip = alamatKlien(req);
    const { nama, username, password, nip, unit_kerja, no_hp } = req.body || {};

    const namaBersih = String(nama || '').trim();
    const userBersih = String(username || '').trim().toLowerCase();
    const nipBersih = String(nip || '').replace(/\s+/g, '') || null;
    const hpBersih = String(no_hp || '').trim() || null;
    const unitBersih = String(unit_kerja || '').trim() || null;

    if (namaBersih.length < 3) return send(res, 400, { error: 'Nama lengkap wajib diisi (minimal 3 karakter)' });
    if (!/^[a-z0-9._-]{4,30}$/.test(userBersih)) {
      return send(res, 400, { error: 'Username 4–30 karakter, hanya huruf, angka, titik, garis bawah, atau strip' });
    }
    if (String(password || '').length < 6) return send(res, 400, { error: 'Password minimal 6 karakter' });
    if (nipBersih && !/^[0-9]{8,20}$/.test(nipBersih)) {
      return send(res, 400, { error: 'NIP harus berupa angka (8–20 digit) tanpa spasi' });
    }
    if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(userBersih)) {
      return send(res, 409, { error: 'Username sudah dipakai. Silakan pakai username lain atau langsung masuk.' });
    }
    if (!bolehDaftar(ip)) {
      return send(res, 429, { error: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi 1 jam lagi atau hubungi petugas BMN.' });
    }

    try {
      db.exec('BEGIN');

      // Tautkan ke data pegawai: pakai NIP yang sudah terdaftar, atau buat baru
      // supaya pengajuan peminjaman bisa langsung dilakukan memakai identitas sendiri.
      let pegawaiId = null;
      if (nipBersih) {
        const ada = db.prepare('SELECT id FROM pegawai WHERE nip = ?').get(nipBersih);
        if (ada) pegawaiId = ada.id;
      }
      if (!pegawaiId) {
        const insPeg = db.prepare(
          'INSERT INTO pegawai (nip, nama, unit_kerja, jabatan, no_hp) VALUES (?,?,?,?,?)'
        ).run(nipBersih, namaBersih, unitBersih, null, hpBersih);
        pegawaiId = Number(insPeg.lastInsertRowid);
      }

      const { salt, hash } = hashPassword(password);
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, salt, nama, role, aktif, pegawai_id, no_hp, daftar_mandiri)
        VALUES (?,?,?,?, 'petugas', 1, ?, ?, 1)
      `).run(userBersih, hash, salt, namaBersih, pegawaiId, hpBersih);
      const userId = Number(info.lastInsertRowid);

      db.exec('COMMIT');

      audit(null, 'daftar_mandiri', 'user', userId, {
        username: userBersih, nama: namaBersih, pegawai_id: pegawaiId, ip
      });

      const payload = { id: userId, username: userBersih, nama: namaBersih, role: 'petugas' };
      send(res, 201, {
        token: signToken(payload),
        user: { ...payload, pegawai_id: pegawaiId, daftar_mandiri: 1 },
        message: `Pendaftaran berhasil. Selamat datang, ${namaBersih.split(' ')[0]}!`
      });
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* transaksi sudah tertutup */ }
      if (String(err.message).includes('UNIQUE')) {
        return send(res, 409, { error: 'Username atau NIP sudah terdaftar. Silakan masuk atau hubungi petugas BMN.' });
      }
      throw err;
    }
  }, { public: true });
}
