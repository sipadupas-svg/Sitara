// SITARA — Routes: Peminjaman (pengajuan, alur status, dokumentasi)
import { db, audit, uploadsDir, pendaftarMandiri } from '../db.js';
import { send } from '../router.js';
import { buildBeritaAcara } from './pdf.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

function genNoTransaksi() {
  const tgl = db.prepare("SELECT strftime('%Y%m%d','now','localtime') AS t").get().t;
  const n = db.prepare(
    "SELECT COUNT(*) AS n FROM peminjaman WHERE no_transaksi LIKE 'PJM-" + tgl + "-%'"
  ).get().n;
  return `PJM-${tgl}-${String(n + 1).padStart(3, '0')}`;
}

export function registerPeminjaman(router) {
  // Daftar: ?status=&q=&limit=
  router.get('/api/peminjaman', (req, res) => {
    const { status = '', q = '' } = req.query || {};
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit || '50', 10) || 50));
    let where = [];
    const args = [];
    if (status) { where.push('p.status = ?'); args.push(status); }
    if (q) {
      where.push('(p.no_transaksi LIKE ? OR g.nama LIKE ? OR p.keperluan LIKE ?)');
      const p = `%${q}%`;
      args.push(p, p, p);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const data = db.prepare(`
      SELECT p.id, p.no_transaksi, p.status, p.keperluan, p.tanggal_pinjam,
             p.tanggal_rencana_kembali, p.tanggal_kembali, p.created_at,
             g.nama AS pegawai_nama, g.unit_kerja,
             (SELECT COUNT(*) FROM detail_peminjaman d WHERE d.peminjaman_id = p.id) AS jumlah_item,
             (SELECT COUNT(*) FROM dokumentasi dok WHERE dok.peminjaman_id = p.id) AS jumlah_foto
      FROM peminjaman p
      JOIN pegawai g ON g.id = p.pegawai_id
      ${whereSql}
      ORDER BY p.id DESC LIMIT ?
    `).all(...args, limit);
    send(res, 200, { data });
  });

  // Detail lengkap
  router.get('/api/peminjaman/:id', (req, res) => {
    const p = db.prepare(`
      SELECT p.*, g.nama AS pegawai_nama, g.nip, g.unit_kerja, g.jabatan,
             ua.nama AS approved_nama, us.nama AS diserahkan_nama, uk.nama AS dikembalikan_nama
      FROM peminjaman p
      JOIN pegawai g ON g.id = p.pegawai_id
      LEFT JOIN users ua ON ua.id = p.approved_by
      LEFT JOIN users us ON us.id = p.diserahkan_oleh
      LEFT JOIN users uk ON uk.id = p.dikembalikan_ke
      WHERE p.id = ?
    `).get(req.params.id);
    if (!p) return send(res, 404, { error: 'Transaksi tidak ditemukan' });
    const items = db.prepare(`
      SELECT d.id AS detail_id, d.jumlah, d.kondisi_kembali, d.catatan,
             b.id AS barang_id, b.nama, b.nup, b.kode_barang, b.merk, b.tipe, b.kondisi AS kondisi_barang
      FROM detail_peminjaman d JOIN barang b ON b.id = d.barang_id
      WHERE d.peminjaman_id = ? ORDER BY d.id
    `).all(p.id);
    const dokumentasi = db.prepare(
      'SELECT id, tahap, file_path, keterangan, created_at FROM dokumentasi WHERE peminjaman_id = ? ORDER BY id'
    ).all(p.id);
    const ba = db.prepare('SELECT * FROM berita_acara WHERE peminjaman_id = ?').get(p.id) || null;
    send(res, 200, { data: { ...p, items, dokumentasi, berita_acara: ba } });
  });

  // Pengajuan baru
  router.post('/api/peminjaman', (req, res) => {
    const { pegawai_id, keperluan, tanggal_pinjam, tanggal_rencana_kembali, items } = req.body || {};
    if (!pegawai_id || !items?.length) {
      return send(res, 400, { error: 'Pegawai dan minimal satu barang wajib dipilih' });
    }
    const peg = db.prepare('SELECT id FROM pegawai WHERE id = ?').get(pegawai_id);
    if (!peg) return send(res, 400, { error: 'Pegawai tidak ditemukan' });

    const uniq = [...new Set(items.map((i) => Number(i.barang_id)))];
    const placeholders = uniq.map(() => '?').join(',');
    const tersedia = db.prepare(
      `SELECT id FROM barang WHERE id IN (${placeholders}) AND status != 'Tersedia'`
    ).all(...uniq);
    if (tersedia.length) {
      return send(res, 409, { error: 'Beberapa barang tidak tersedia (sedang dipinjam/perbaikan)' });
    }

    const no = genNoTransaksi();
    try {
      db.exec('BEGIN');
      const info = db.prepare(`
        INSERT INTO peminjaman (no_transaksi, pegawai_id, keperluan, tanggal_pinjam, tanggal_rencana_kembali, status, created_by)
        VALUES (?,?,?,?,?, 'Diajukan', ?)
      `).run(no, pegawai_id, keperluan?.trim() || null, tanggal_pinjam || null, tanggal_rencana_kembali || null, req.user.id);
      const insD = db.prepare('INSERT INTO detail_peminjaman (peminjaman_id, barang_id, jumlah) VALUES (?,?,1)');
      for (const bid of uniq) insD.run(info.lastInsertRowid, bid);
      db.exec('COMMIT');
      audit(req.user.id, 'ajukan', 'peminjaman', info.lastInsertRowid, { no, pegawai_id, items: uniq.length });
      send(res, 201, { data: { id: info.lastInsertRowid, no_transaksi: no }, message: `Pengajuan ${no} berhasil dibuat` });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  // ---------- Pengajuan tanpa akun (halaman sambutan) ----------
  // Petugas yang ingin meminjam cukup menekan "Ajukan Pinjaman" di layar
  // sambutan lalu mengisi data — tanpa akun. Pengajuan tetap berstatus
  // "Diajukan" dan diverifikasi petugas BMN seperti pengajuan lain.
  // Dibatasai 20 pengajuan/jam untuk setiap alamat IP agar formulir publik
  // tidak disalahgunakan.
  const MAX_TAMU_PER_JAM = 20;
  const riwayatTamu = new Map(); // ip -> [waktu, ...]

  function bolehAjukanTamu(ip) {
    const now = Date.now();
    if (riwayatTamu.size > 500) riwayatTamu.clear();
    const arr = (riwayatTamu.get(ip) || []).filter((t) => now - t < 3600 * 1000);
    if (arr.length >= MAX_TAMU_PER_JAM) {
      riwayatTamu.set(ip, arr);
      return false;
    }
    arr.push(now);
    riwayatTamu.set(ip, arr);
    return true;
  }

  function alamatKlien(req) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.socket?.remoteAddress || 'tidak-diketahui';
  }

  router.post('/api/peminjaman/tamu', (req, res) => {
    const ip = alamatKlien(req);
    const {
      nama, nip, unit_kerja, no_hp, keperluan,
      tanggal_pinjam, tanggal_rencana_kembali, items
    } = req.body || {};

    const namaBersih = String(nama || '').trim();
    const nipBersih = String(nip || '').replace(/\s+/g, '') || null;
    const unitBersih = String(unit_kerja || '').trim() || null;
    const hpBersih = String(no_hp || '').trim() || null;
    const tglPinjam = String(tanggal_pinjam || '').trim() || null;
    const tglKembali = String(tanggal_rencana_kembali || '').trim() || null;

    if (namaBersih.length < 3) return send(res, 400, { error: 'Nama lengkap wajib diisi (minimal 3 karakter)' });
    if (nipBersih && !/^[0-9]{8,20}$/.test(nipBersih)) {
      return send(res, 400, { error: 'NIP harus berupa angka (8–20 digit) tanpa spasi' });
    }
    for (const t of [tglPinjam, tglKembali]) {
      if (t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        return send(res, 400, { error: 'Format tanggal tidak valid (YYYY-MM-DD)' });
      }
    }
    if (tglPinjam && tglKembali && tglKembali < tglPinjam) {
      return send(res, 400, { error: 'Tanggal kembali tidak boleh sebelum tanggal pinjam' });
    }
    if (!Array.isArray(items) || !items.length) {
      return send(res, 400, { error: 'Pilih minimal satu barang yang akan dipinjam' });
    }

    const uniq = [...new Set(items.map((i) => Number(i?.barang_id ?? i)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!uniq.length) return send(res, 400, { error: 'Barang yang dipilih tidak valid' });

    const placeholders = uniq.map(() => '?').join(',');
    const ditemukan = db.prepare(`SELECT id, status FROM barang WHERE id IN (${placeholders})`).all(...uniq);
    if (ditemukan.length !== uniq.length) {
      return send(res, 400, { error: 'Sebagian barang tidak ditemukan' });
    }
    if (ditemukan.some((b) => b.status !== 'Tersedia')) {
      return send(res, 409, { error: 'Beberapa barang tidak tersedia (sedang dipinjam/perbaikan)' });
    }
    if (!bolehAjukanTamu(ip)) {
      return send(res, 429, { error: 'Terlalu banyak pengajuan dari jaringan ini. Coba lagi 1 jam lagi atau hubungi petugas BMN.' });
    }

    const no = genNoTransaksi();
    try {
      db.exec('BEGIN');

      // Identitas peminjam: pakai data pegawai yang sudah ada (berdasarkan NIP),
      // atau daftarkan sebagai pegawai baru agar pengajuan tetap dapat dilacak.
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

      const info = db.prepare(`
        INSERT INTO peminjaman (no_transaksi, pegawai_id, keperluan, tanggal_pinjam, tanggal_rencana_kembali, status, created_by)
        VALUES (?,?,?,?,?, 'Diajukan', NULL)
      `).run(no, pegawaiId, keperluan?.trim() || null, tglPinjam, tglKembali);
      const insD = db.prepare('INSERT INTO detail_peminjaman (peminjaman_id, barang_id, jumlah) VALUES (?,?,1)');
      for (const bid of uniq) insD.run(info.lastInsertRowid, bid);
      db.exec('COMMIT');

      audit(null, 'ajukan_tamu', 'peminjaman', info.lastInsertRowid, {
        no, nama: namaBersih, nip: nipBersih, pegawai_id: pegawaiId, items: uniq.length, ip
      });
      send(res, 201, {
        data: { id: Number(info.lastInsertRowid), no_transaksi: no, jumlah_item: uniq.length },
        message: `Pengajuan ${no} terkirim. Petugas BMN akan memverifikasi.`
      });
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* transaksi sudah tertutup */ }
      throw err;
    }
  }, { public: true });

  // Transisi status: aksi = setujui | tolak | serahkan | kembalikan
  router.post('/api/peminjaman/:id/status', (req, res) => {
    // Verifikasi, penyerahan, dan pengembalian adalah kewenangan petugas BMN.
    if (pendaftarMandiri(req.user.id)) {
      return send(res, 403, {
        error: 'Akun pendaftaran mandiri hanya dapat mengajukan dan memantau. Verifikasi dilakukan petugas BMN.'
      });
    }
    const p = db.prepare('SELECT * FROM peminjaman WHERE id = ?').get(req.params.id);
    if (!p) return send(res, 404, { error: 'Transaksi tidak ditemukan' });
    const { aksi, catatan, items } = req.body || {};

    if (aksi === 'setujui') {
      if (p.status !== 'Diajukan') return send(res, 409, { error: 'Hanya pengajuan berstatus "Diajukan" yang dapat disetujui' });
      db.prepare("UPDATE peminjaman SET status='Disetujui', approved_by=? WHERE id=?").run(req.user.id, p.id);
      audit(req.user.id, 'setujui', 'peminjaman', p.id, { no: p.no_transaksi });
      return send(res, 200, { message: `${p.no_transaksi} disetujui` });
    }

    if (aksi === 'tolak') {
      if (p.status !== 'Diajukan') return send(res, 409, { error: 'Hanya pengajuan berstatus "Diajukan" yang dapat ditolak' });
      db.prepare("UPDATE peminjaman SET status='Ditolak', approved_by=?, catatan_penolakan=? WHERE id=?")
        .run(req.user.id, catatan?.trim() || null, p.id);
      audit(req.user.id, 'tolak', 'peminjaman', p.id, { no: p.no_transaksi, catatan });
      return send(res, 200, { message: `${p.no_transaksi} ditolak` });
    }

    if (aksi === 'serahkan') {
      if (p.status !== 'Disetujui') return send(res, 409, { error: 'Hanya transaksi berstatus "Disetujui" yang dapat diserahkan' });
      try {
        db.exec('BEGIN');
        db.prepare(`
          UPDATE peminjaman SET status='Diserahkan', diserahkan_oleh=?,
            tanggal_pinjam=COALESCE(tanggal_pinjam, datetime('now','localtime'))
          WHERE id=?
        `).run(req.user.id, p.id);
        const upd = db.prepare("UPDATE barang SET status='Dipinjam', updated_at=datetime('now','localtime') WHERE id=?");
        const rows = db.prepare('SELECT barang_id FROM detail_peminjaman WHERE peminjaman_id=?').all(p.id);
        for (const r of rows) upd.run(r.barang_id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      audit(req.user.id, 'serahkan', 'peminjaman', p.id, { no: p.no_transaksi });
      return send(res, 200, { message: `${p.no_transaksi} — barang diserahkan` });
    }

    if (aksi === 'kembalikan') {
      if (p.status !== 'Diserahkan') return send(res, 409, { error: 'Hanya transaksi berstatus "Diserahkan" yang dapat dikembalikan' });
      const KONDISI_KEMBALI = ['Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang'];
      const cond = items || [];
      try {
        db.exec('BEGIN');
        db.prepare(`
          UPDATE peminjaman SET status='Dikembalikan', tanggal_kembali=datetime('now','localtime'),
            dikembalikan_ke=? WHERE id=?
        `).run(req.user.id, p.id);
        const updD = db.prepare('UPDATE detail_peminjaman SET kondisi_kembali=? WHERE id=? AND peminjaman_id=?');
        for (const it of cond) {
          if (!KONDISI_KEMBALI.includes(it.kondisi_kembali)) throw new Error('Kondisi kembali tidak valid');
          updD.run(it.kondisi_kembali, it.detail_id, p.id);
        }
        // Perbarui status/kondisi barang
        const rows = db.prepare(`
          SELECT d.barang_id, d.kondisi_kembali FROM detail_peminjaman d WHERE d.peminjaman_id=?
        `).all(p.id);
        const updBarang = db.prepare(`
          UPDATE barang SET status=?, kondisi=COALESCE(?, kondisi), updated_at=datetime('now','localtime') WHERE id=?
        `);
        for (const r of rows) {
          const k = r.kondisi_kembali;
          if (k === 'Hilang') updBarang.run('Dihapus', null, r.barang_id);
          else if (k === 'Rusak Berat') updBarang.run('Perbaikan', 'Rusak Berat', r.barang_id);
          else if (k === 'Rusak Ringan') updBarang.run('Perbaikan', 'Rusak Ringan', r.barang_id);
          else updBarang.run('Tersedia', 'Baik', r.barang_id);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        return send(res, 400, { error: err.message || 'Gagal memproses pengembalian' });
      }
      audit(req.user.id, 'kembalikan', 'peminjaman', p.id, { no: p.no_transaksi, items: cond.length });
      return send(res, 200, { message: `${p.no_transaksi} — barang telah dikembalikan` });
    }

    return send(res, 400, { error: 'Aksi tidak dikenal' });
  });

  // Upload foto dokumentasi (base64 dataURL → file)
  router.post('/api/peminjaman/:id/dokumentasi', (req, res) => {
    const p = db.prepare('SELECT id, no_transaksi FROM peminjaman WHERE id = ?').get(req.params.id);
    if (!p) return send(res, 404, { error: 'Transaksi tidak ditemukan' });
    const { tahap, dataUrl, keterangan } = req.body || {};
    const TAHAP = ['kondisi-awal', 'serah-terima', 'pengembalian', 'berita-acara'];
    if (!TAHAP.includes(tahap)) return send(res, 400, { error: 'Tahap dokumentasi tidak valid' });
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return send(res, 400, { error: 'Foto tidak valid (harus dataURL gambar)' });
    }
    const m = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
    if (!m) return send(res, 400, { error: 'Format foto tidak didukung' });
    const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 8 * 1024 * 1024) return send(res, 413, { error: 'Foto terlalu besar (maks 8 MB)' });

    const name = `dok-${p.id}-${tahap}-${Date.now()}.${ext}`;
    writeFileSync(path.join(uploadsDir, name), buf);
    const filePath = `/uploads/${name}`;
    const info = db.prepare(
      'INSERT INTO dokumentasi (peminjaman_id, tahap, file_path, keterangan) VALUES (?,?,?,?)'
    ).run(p.id, tahap, filePath, keterangan?.trim() || null);
    audit(req.user.id, 'unggah_foto', 'dokumentasi', info.lastInsertRowid, { peminjaman: p.no_transaksi, tahap });
    send(res, 201, { data: { id: info.lastInsertRowid, file_path: filePath, tahap }, message: 'Foto dokumentasi tersimpan' });
  });

  // Hapus foto dokumentasi
  router.delete('/api/peminjaman/:id/dokumentasi/:dokId', (req, res) => {
    const dok = db.prepare('SELECT * FROM dokumentasi WHERE id = ? AND peminjaman_id = ?')
      .get(req.params.dokId, req.params.id);
    if (!dok) return send(res, 404, { error: 'Foto tidak ditemukan' });
    const abs = path.join(uploadsDir, path.basename(dok.file_path));
    if (existsSync(abs)) { try { unlinkSync(abs); } catch { /* abaikan */ } }
    db.prepare('DELETE FROM dokumentasi WHERE id = ?').run(dok.id);
    audit(req.user.id, 'hapus_foto', 'dokumentasi', dok.id, { file: dok.file_path });
    send(res, 200, { message: 'Foto dihapus' });
  });

  // Berita Acara (PDF) — dibuat otomatis, tersimpan nomor & tanggalnya
  router.get('/api/peminjaman/:id/berita-acara', (req, res) => {
    const p = db.prepare(`
      SELECT p.*, g.nama AS pegawai_nama, g.nip, g.unit_kerja, g.jabatan,
             ua.nama AS approved_nama, us.nama AS diserahkan_nama, uk.nama AS dikembalikan_nama
      FROM peminjaman p
      JOIN pegawai g ON g.id = p.pegawai_id
      LEFT JOIN users ua ON ua.id = p.approved_by
      LEFT JOIN users us ON us.id = p.diserahkan_oleh
      LEFT JOIN users uk ON uk.id = p.dikembalikan_ke
      WHERE p.id = ?
    `).get(req.params.id);
    if (!p) return send(res, 404, { error: 'Transaksi tidak ditemukan' });
    if (!['Diserahkan', 'Dikembalikan'].includes(p.status)) {
      return send(res, 409, { error: 'Berita Acara tersedia setelah barang diserahkan' });
    }

    const items = db.prepare(`
      SELECT d.kondisi_kembali, b.nama, b.nup, b.kode_barang, b.merk, b.kondisi AS kondisi_barang
      FROM detail_peminjaman d JOIN barang b ON b.id = d.barang_id
      WHERE d.peminjaman_id = ? ORDER BY d.id
    `).all(p.id);
    const dokumentasi = db.prepare(
      'SELECT id, tahap, file_path FROM dokumentasi WHERE peminjaman_id = ? ORDER BY id'
    ).all(p.id);

    let ba = db.prepare('SELECT * FROM berita_acara WHERE peminjaman_id = ?').get(p.id);
    const nomorBa = ba?.nomor_ba || `BA/${p.no_transaksi}/SITARA/${new Date().getFullYear()}`;
    db.prepare(`
      INSERT INTO berita_acara (peminjaman_id, nomor_ba, tanggal)
      VALUES (?,?,date('now','localtime'))
      ON CONFLICT(peminjaman_id) DO UPDATE SET nomor_ba=excluded.nomor_ba, tanggal=excluded.tanggal
    `).run(p.id, nomorBa);

    audit(req.user.id, 'cetak_ba', 'peminjaman', p.id, { nomor: nomorBa });

    const buf = buildBeritaAcara({ ...p, items, dokumentasi }, nomorBa, uploadsDir);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nomorBa.replace(/[\/\\]/g, '-')}.pdf"`,
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}
