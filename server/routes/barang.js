// SITARA — Routes: Barang BMN (CRUD + pencarian)
import { db, audit, pendaftarMandiri } from '../db.js';
import { send } from '../router.js';

const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const STATUS = ['Tersedia', 'Dipinjam', 'Perbaikan', 'Dihapus'];

export function registerBarang(router) {
  // Master barang hanya boleh diubah petugas BMN penuh. Akun hasil pendaftaran
  // mandiri (pegawai peminjam) tidak diberi kewenangan ini.
  function tolakUbahBarang(req, res) {
    if (!pendaftarMandiri(req.user.id)) return false;
    send(res, 403, { error: 'Akun pendaftaran mandiri tidak dapat mengubah master barang. Hubungi petugas BMN.' });
    return true;
  }

  // Katalog publik (tanpa akun): hanya barang berstatus "Tersedia" dan hanya
  // kolom seperlunya. Dipakai formulir "Ajukan Pinjaman" di layar sambutan.
  router.get('/api/barang-tersedia', (req, res) => {
    const q = String(req.query?.q || '').trim();
    const kolom = 'id, nama, nup, merk, tipe, kategori';
    const data = q
      ? db.prepare(`
          SELECT ${kolom} FROM barang
          WHERE status = 'Tersedia' AND (nama LIKE ? OR nup LIKE ? OR kode_barang LIKE ?)
          ORDER BY nama LIMIT 8
        `).all(`%${q}%`, `%${q}%`, `%${q}%`)
      : db.prepare(`SELECT ${kolom} FROM barang WHERE status = 'Tersedia' ORDER BY nama LIMIT 8`).all();
    send(res, 200, { data });
  }, { public: true });

  // Daftar barang: ?q=&status=&kategori=&page=&limit=
  router.get('/api/barang', (req, res) => {
    const { q = '', status = '', kategori = '' } = req.query || {};
    const page = Math.max(1, parseInt(req.query?.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit || '50', 10) || 50));

    let where = [];
    let args = [];
    if (q) {
      where.push('(nama LIKE ? OR nup LIKE ? OR kode_barang LIKE ? OR kategori LIKE ? OR merk LIKE ?)');
      const p = `%${q}%`;
      args.push(p, p, p, p, p);
    }
    if (status) { where.push('status = ?'); args.push(status); }
    if (kategori) { where.push('kategori = ?'); args.push(kategori); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) AS n FROM barang ${whereSql}`).get(...args).n;
    const data = db.prepare(
      `SELECT * FROM barang ${whereSql} ORDER BY nama ASC LIMIT ? OFFSET ?`
    ).all(...args, limit, (page - 1) * limit);

    send(res, 200, { data, total, page, limit });
  });

  router.get('/api/barang/kategori', (req, res) => {
    const rows = db.prepare(
      "SELECT kategori, COUNT(*) AS jumlah FROM barang WHERE kategori IS NOT NULL AND kategori != '' GROUP BY kategori ORDER BY jumlah DESC"
    ).all();
    send(res, 200, { data: rows });
  });

  router.get('/api/barang/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM barang WHERE id = ?').get(req.params.id);
    if (!row) return send(res, 404, { error: 'Barang tidak ditemukan' });
    send(res, 200, { data: row });
  });

  router.get('/api/barang/scan/:barcode', (req, res) => {
    const bc = req.params.barcode.trim();
    const row = db.prepare('SELECT * FROM barang WHERE barcode = ? OR nup = ?').get(bc, bc);
    if (!row) return send(res, 404, { error: `Barang dengan kode "${bc}" tidak ditemukan` });
    send(res, 200, { data: row });
  });

  router.post('/api/barang', (req, res) => {
    if (tolakUbahBarang(req, res)) return;
    const b = req.body || {};
    if (!b.nama || !b.kode_barang) {
      return send(res, 400, { error: 'Kode barang dan nama wajib diisi' });
    }
    if (b.kondisi && !KONDISI.includes(b.kondisi)) return send(res, 400, { error: 'Kondisi tidak valid' });
    if (b.status && !STATUS.includes(b.status)) return send(res, 400, { error: 'Status tidak valid' });

    const barcode = (b.barcode || b.nup || b.kode_barang).trim();
    try {
      const info = db.prepare(`INSERT INTO barang
        (kode_barang, nup, kib, nama, kategori, merk, tipe, tahun_perolehan, sumber_perolehan, nilai_perolehan, kondisi, status, ruang, barcode, catatan)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          b.kode_barang.trim(), b.nup?.trim() || null, b.kib?.trim() || null, b.nama.trim(),
          b.kategori?.trim() || null, b.merk?.trim() || null, b.tipe?.trim() || null,
          b.tahun_perolehan || null, b.sumber_perolehan?.trim() || null,
          b.nilai_perolehan || null, b.kondisi || 'Baik', b.status || 'Tersedia',
          b.ruang?.trim() || null, barcode, b.catatan?.trim() || null
        );
      audit(req.user.id, 'tambah', 'barang', info.lastInsertRowid, { nama: b.nama, nup: b.nup });
      const row = db.prepare('SELECT * FROM barang WHERE id = ?').get(info.lastInsertRowid);
      send(res, 201, { data: row, message: 'Barang berhasil ditambahkan' });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return send(res, 409, { error: 'NUP/barcode sudah terdaftar (harus unik sesuai SIMAK)' });
      }
      throw err;
    }
  });

  router.put('/api/barang/:id', (req, res) => {
    if (tolakUbahBarang(req, res)) return;
    const row = db.prepare('SELECT * FROM barang WHERE id = ?').get(req.params.id);
    if (!row) return send(res, 404, { error: 'Barang tidak ditemukan' });
    const b = { ...row, ...(req.body || {}) };
    if (b.kondisi && !KONDISI.includes(b.kondisi)) return send(res, 400, { error: 'Kondisi tidak valid' });
    if (b.status && !STATUS.includes(b.status)) return send(res, 400, { error: 'Status tidak valid' });
    try {
      db.prepare(`UPDATE barang SET
        kode_barang=?, nup=?, kib=?, nama=?, kategori=?, merk=?, tipe=?, tahun_perolehan=?,
        sumber_perolehan=?, nilai_perolehan=?, kondisi=?, status=?, ruang=?, barcode=?, catatan=?,
        updated_at=datetime('now','localtime')
        WHERE id=?`)
        .run(
          b.kode_barang, b.nup || null, b.kib || null, b.nama, b.kategori || null, b.merk || null,
          b.tipe || null, b.tahun_perolehan || null, b.sumber_perolehan || null,
          b.nilai_perolehan || null, b.kondisi || 'Baik', b.status || 'Tersedia',
          b.ruang || null, b.barcode || b.nup || b.kode_barang, b.catatan || null, row.id
        );
      audit(req.user.id, 'ubah', 'barang', row.id, { nama: b.nama });
      const updated = db.prepare('SELECT * FROM barang WHERE id = ?').get(row.id);
      send(res, 200, { data: updated, message: 'Barang berhasil diperbarui' });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return send(res, 409, { error: 'NUP/barcode sudah dipakai barang lain' });
      }
      throw err;
    }
  });

  router.delete('/api/barang/:id', (req, res) => {
    if (tolakUbahBarang(req, res)) return;
    const row = db.prepare('SELECT * FROM barang WHERE id = ?').get(req.params.id);
    if (!row) return send(res, 404, { error: 'Barang tidak ditemukan' });
    try {
      db.prepare('DELETE FROM barang WHERE id = ?').run(row.id);
      audit(req.user.id, 'hapus', 'barang', row.id, { nama: row.nama, nup: row.nup });
      send(res, 200, { message: `Barang "${row.nama}" telah dihapus` });
    } catch (err) {
      if (String(err.message).includes('FOREIGN KEY')) {
        return send(res, 409, { error: 'Barang memiliki riwayat peminjaman — ubah status menjadi "Dihapus" alih-alih menghapus' });
      }
      throw err;
    }
  });
}
