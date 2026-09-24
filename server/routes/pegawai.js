// SITARA — Routes: Pegawai (master data peminjam)
import { db, audit, pendaftarMandiri } from '../db.js';
import { send } from '../router.js';

export function registerPegawai(router) {
  // Master pegawai (data peminjam) hanya boleh diubah petugas BMN penuh.
  function tolakUbahPegawai(req, res) {
    if (!pendaftarMandiri(req.user.id)) return false;
    send(res, 403, { error: 'Akun pendaftaran mandiri tidak dapat mengubah data pegawai. Hubungi petugas BMN.' });
    return true;
  }

  router.get('/api/pegawai', (req, res) => {
    const q = (req.query?.q || '').trim();
    let sql = 'SELECT * FROM pegawai';
    const args = [];
    if (q) {
      sql += ' WHERE (nama LIKE ? OR nip LIKE ? OR unit_kerja LIKE ?)';
      const p = `%${q}%`;
      args.push(p, p, p);
    }
    sql += ' ORDER BY nama ASC LIMIT 200';
    send(res, 200, { data: db.prepare(sql).all(...args) });
  });

  router.get('/api/pegawai/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    if (!row) return send(res, 404, { error: 'Pegawai tidak ditemukan' });
    send(res, 200, { data: row });
  });

  router.post('/api/pegawai', (req, res) => {
    if (tolakUbahPegawai(req, res)) return;
    const b = req.body || {};
    if (!b.nama) return send(res, 400, { error: 'Nama pegawai wajib diisi' });
    try {
      const info = db.prepare(
        'INSERT INTO pegawai (nip, nama, unit_kerja, jabatan, no_hp) VALUES (?,?,?,?,?)'
      ).run(b.nip?.trim() || null, b.nama.trim(), b.unit_kerja?.trim() || null, b.jabatan?.trim() || null, b.no_hp?.trim() || null);
      audit(req.user.id, 'tambah', 'pegawai', info.lastInsertRowid, { nama: b.nama });
      const row = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(info.lastInsertRowid);
      send(res, 201, { data: row, message: 'Pegawai berhasil ditambahkan' });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return send(res, 409, { error: 'NIP sudah terdaftar' });
      }
      throw err;
    }
  });

  router.put('/api/pegawai/:id', (req, res) => {
    if (tolakUbahPegawai(req, res)) return;
    const row = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    if (!row) return send(res, 404, { error: 'Pegawai tidak ditemukan' });
    const b = { ...row, ...(req.body || {}) };
    try {
      db.prepare('UPDATE pegawai SET nip=?, nama=?, unit_kerja=?, jabatan=?, no_hp=? WHERE id=?')
        .run(b.nip || null, b.nama, b.unit_kerja || null, b.jabatan || null, b.no_hp || null, row.id);
      audit(req.user.id, 'ubah', 'pegawai', row.id, { nama: b.nama });
      send(res, 200, { data: db.prepare('SELECT * FROM pegawai WHERE id = ?').get(row.id), message: 'Pegawai berhasil diperbarui' });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return send(res, 409, { error: 'NIP sudah dipakai pegawai lain' });
      }
      throw err;
    }
  });

  router.delete('/api/pegawai/:id', (req, res) => {
    if (tolakUbahPegawai(req, res)) return;
    const row = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    if (!row) return send(res, 404, { error: 'Pegawai tidak ditemukan' });
    try {
      db.prepare('DELETE FROM pegawai WHERE id = ?').run(row.id);
      audit(req.user.id, 'hapus', 'pegawai', row.id, { nama: row.nama });
      send(res, 200, { message: `Pegawai "${row.nama}" telah dihapus` });
    } catch (err) {
      if (String(err.message).includes('FOREIGN KEY')) {
        return send(res, 409, { error: 'Pegawai memiliki riwayat peminjaman dan tidak dapat dihapus' });
      }
      throw err;
    }
  });
}
