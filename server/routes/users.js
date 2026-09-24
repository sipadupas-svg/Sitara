// SITARA — Routes: Kelola Akun Pengguna (khusus admin)
import { db, audit } from '../db.js';
import { send } from '../router.js';
import { hashPassword } from '../auth.js';

export function registerUsers(router) {
  router.get('/api/users', (req, res) => {
    if (req.user.role !== 'admin') return send(res, 403, { error: 'Hanya administrator yang dapat mengelola akun' });
    send(res, 200, {
      data: db.prepare(`
        SELECT u.id, u.username, u.nama, u.role, u.aktif, u.created_at, u.no_hp, u.daftar_mandiri,
               u.pegawai_id, g.nip AS pegawai_nip, g.nama AS pegawai_nama, g.unit_kerja AS pegawai_unit
        FROM users u LEFT JOIN pegawai g ON g.id = u.pegawai_id
        ORDER BY u.id
      `).all()
    });
  });

  router.post('/api/users', (req, res) => {
    if (req.user.role !== 'admin') return send(res, 403, { error: 'Hanya administrator yang dapat mengelola akun' });
    const { username, password, nama, role } = req.body || {};
    if (!username?.trim() || !password || !nama?.trim()) {
      return send(res, 400, { error: 'Username, nama, dan password wajib diisi' });
    }
    if (String(password).length < 6) return send(res, 400, { error: 'Password minimal 6 karakter' });
    if (!['admin', 'petugas'].includes(role)) return send(res, 400, { error: 'Peran harus admin atau petugas' });
    if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username.trim())) {
      return send(res, 409, { error: 'Username sudah dipakai' });
    }
    try {
      const { salt, hash } = hashPassword(password);
      const info = db.prepare(
        'INSERT INTO users (username, password_hash, salt, nama, role) VALUES (?,?,?,?,?)'
      ).run(username.trim(), hash, salt, nama.trim(), role);
      audit(req.user.id, 'tambah', 'user', info.lastInsertRowid, { username, role });
      send(res, 201, { message: `Akun "${username}" berhasil dibuat` });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return send(res, 409, { error: 'Username sudah dipakai' });
      throw err;
    }
  });

  router.put('/api/users/:id', (req, res) => {
    if (req.user.role !== 'admin') return send(res, 403, { error: 'Hanya administrator yang dapat mengelola akun' });
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return send(res, 404, { error: 'Akun tidak ditemukan' });
    const { nama, role, aktif, password, daftar_mandiri } = req.body || {};

    // Proteksi: tidak boleh menonaktifkan admin terakhir
    if (target.role === 'admin' && aktif === 0) {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND aktif=1").get().n;
      if (admins <= 1) return send(res, 409, { error: 'Tidak boleh menonaktifkan administrator terakhir' });
    }

    db.prepare('UPDATE users SET nama=COALESCE(?,nama), role=COALESCE(?,role), aktif=COALESCE(?,aktif), daftar_mandiri=COALESCE(?,daftar_mandiri) WHERE id=?')
      .run(nama?.trim() || null, role || null, aktif ?? null, daftar_mandiri ?? null, target.id);
    if (password) {
      if (String(password).length < 6) return send(res, 400, { error: 'Password minimal 6 karakter' });
      const { salt, hash } = hashPassword(password);
      db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hash, salt, target.id);
    }
    audit(req.user.id, 'ubah', 'user', target.id, {
      username: target.username, resetPassword: !!password,
      daftar_mandiri: daftar_mandiri === undefined ? null : Number(daftar_mandiri) ? 1 : 0
    });
    send(res, 200, { message: `Akun "${target.username}" diperbarui${password ? ' (password direset)' : ''}` });
  });

  router.delete('/api/users/:id', (req, res) => {
    if (req.user.role !== 'admin') return send(res, 403, { error: 'Hanya administrator yang dapat mengelola akun' });
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return send(res, 404, { error: 'Akun tidak ditemukan' });
    if (target.id === req.user.id) return send(res, 409, { error: 'Tidak dapat menghapus akun sendiri' });
    if (target.role === 'admin') {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND aktif=1").get().n;
      if (admins <= 1) return send(res, 409, { error: 'Tidak dapat menghapus administrator terakhir' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    audit(req.user.id, 'hapus', 'user', target.id, { username: target.username });
    send(res, 200, { message: `Akun "${target.username}" dihapus` });
  });
}
