// SITARA — Routes: Laporan & Export CSV
import { db, audit } from '../db.js';
import { send } from '../router.js';

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvResponse(res, filename, headers, rows) {
  const lines = [headers.join(';')];
  for (const r of rows) lines.push(r.map(csvEscape).join(';'));
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store'
  });
  res.end('\ufeff' + lines.join('\r\n'));
}

export function registerLaporan(router) {
  router.get('/api/laporan', (req, res) => {
    const { dari = '', sampai = '' } = req.query || {};
    const hasRange = dari && sampai;
    const where = hasRange
      ? `WHERE date(p.created_at) BETWEEN '${dari.replace(/[^0-9-]/g, '')}' AND '${sampai.replace(/[^0-9-]/g, '')}'`
      : '';

    const total = db.prepare(`SELECT COUNT(*) AS n FROM peminjaman p ${where}`).get().n;
    const perStatus = {};
    db.prepare(`SELECT p.status, COUNT(*) AS n FROM peminjaman p ${where} GROUP BY p.status`).all()
      .forEach((r) => { perStatus[r.status] = r.n; });
    const totalItem = db.prepare(`
      SELECT COUNT(*) AS n FROM detail_peminjaman d
      ${hasRange ? "JOIN peminjaman p ON p.id = d.peminjaman_id AND date(p.created_at) BETWEEN '" + dari.replace(/[^0-9-]/g, '') + "' AND '" + sampai.replace(/[^0-9-]/g, '') + "'" : ''}
    `).get().n;
    const kategori = db.prepare(`
      SELECT b.kategori, COUNT(*) AS jumlah FROM detail_peminjaman d
      JOIN peminjaman p ON p.id = d.peminjaman_id ${where ? (hasRange ? 'AND ' : 'WHERE ') + "date(p.created_at) BETWEEN '" + dari.replace(/[^0-9-]/g, '') + "' AND '" + sampai.replace(/[^0-9-]/g, '') + "'" : ''}
      JOIN barang b ON b.id = d.barang_id
      GROUP BY b.kategori ORDER BY jumlah DESC LIMIT 8
    `).all();
    const terlambat = db.prepare(`
      SELECT p.id, p.no_transaksi, p.tanggal_rencana_kembali, g.nama AS pegawai_nama,
        (SELECT COUNT(*) FROM detail_peminjaman d WHERE d.peminjaman_id = p.id) AS jumlah_item
      FROM peminjaman p JOIN pegawai g ON g.id = p.pegawai_id
      WHERE p.status = 'Diserahkan' AND p.tanggal_rencana_kembali IS NOT NULL
        AND p.tanggal_rencana_kembali < date('now','localtime')
      ORDER BY p.tanggal_rencana_kembali ASC LIMIT 20
    `).all();

    audit(req.user.id, 'lihat_laporan', 'laporan', null, { dari, sampai });
    send(res, 200, { data: { total, perStatus, totalItem, kategori, terlambat }, periode: hasRange ? { dari, sampai } : null });
  });

  router.get('/api/laporan/export/peminjaman', (req, res) => {
    const { dari = '', sampai = '' } = req.query || {};
    const hasRange = dari && sampai;
    const rows = db.prepare(`
      SELECT p.no_transaksi, p.status, p.tanggal_pinjam, p.tanggal_rencana_kembali, p.tanggal_kembali,
             g.nama AS peminjam, g.nip, g.unit_kerja, p.keperluan,
             (SELECT GROUP_CONCAT(b.nama || ' (NUP ' || COALESCE(b.nup,'-') || ')', '; ')
                FROM detail_peminjaman d JOIN barang b ON b.id = d.barang_id
               WHERE d.peminjaman_id = p.id) AS barang,
             p.created_at
      FROM peminjaman p JOIN pegawai g ON g.id = p.pegawai_id
      ${hasRange ? "WHERE date(p.created_at) BETWEEN '" + dari.replace(/[^0-9-]/g, '') + "' AND '" + sampai.replace(/[^0-9-]/g, '') + "'" : ''}
      ORDER BY p.id DESC
    `).all();
    audit(req.user.id, 'export_laporan', 'peminjaman', null, { dari, sampai });
    csvResponse(res, `laporan-peminjaman-${dari || 'semua'}_${sampai || 'semua'}.csv`,
      ['No Transaksi', 'Status', 'Tgl Pinjam', 'Rencana Kembali', 'Tgl Kembali', 'Peminjam', 'NIP', 'Unit Kerja', 'Keperluan', 'Barang', 'Dibuat'],
      rows.map((r) => [r.no_transaksi, r.status, r.tanggal_pinjam, r.tanggal_rencana_kembali, r.tanggal_kembali, r.peminjam, r.nip, r.unit_kerja, r.keperluan, r.barang, r.created_at]));
  });

  router.get('/api/laporan/export/barang', (req, res) => {
    const rows = db.prepare(`
      SELECT kode_barang, nup, kib, nama, kategori, merk, tipe, tahun_perolehan,
             sumber_perolehan, nilai_perolehan, kondisi, status, ruang
      FROM barang ORDER BY kode_barang, nup
    `).all();
    audit(req.user.id, 'export_laporan', 'barang', null, { total: rows.length });
    csvResponse(res, 'daftar-barang-bmn-sitara.csv',
      ['Kode Barang', 'NUP', 'KIB', 'Nama Barang', 'Kategori', 'Merk', 'Tipe', 'Tahun', 'Sumber', 'Nilai Perolehan', 'Kondisi', 'Status', 'Ruang/Lokasi'],
      rows.map((r) => [r.kode_barang, r.nup, r.kib, r.nama, r.kategori, r.merk, r.tipe, r.tahun_perolehan, r.sumber_perolehan, r.nilai_perolehan, r.kondisi, r.status, r.ruang]));
  });
}

// SITARA — Routes: Audit Trail
import { db as dbAudit } from '../db.js';

export function registerAudit(router) {
  router.get('/api/audit', (req, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(req.query?.limit || '100', 10) || 100));
    const data = dbAudit.prepare(`
      SELECT a.id, a.aksi, a.entitas, a.entitas_id, a.detail, a.created_at, u.nama AS user_nama
      FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT ?
    `).all(limit);
    send(res, 200, { data });
  });
}
