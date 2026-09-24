// SITARA — Routes: Dashboard (statistik ringkas untuk Beranda)
import { db } from '../db.js';
import { send } from '../router.js';

export function registerDashboard(router) {
  router.get('/api/stats', (req, res) => {
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM barang) AS totalBarang,
        (SELECT COUNT(*) FROM barang WHERE status = 'Tersedia') AS tersedia,
        (SELECT COUNT(*) FROM barang WHERE status = 'Dipinjam') AS dipinjam,
        (SELECT COUNT(*) FROM barang WHERE status = 'Perbaikan') AS perbaikan,
        (SELECT COUNT(*) FROM pegawai) AS totalPegawai,
        (SELECT COUNT(*) FROM peminjaman WHERE status IN ('Diajukan','Disetujui','Diserahkan')) AS aktifDipinjam
    `).get();
    send(res, 200, { data: row, generatedAt: new Date().toISOString() });
  });

  // Perlu Ditindaklanjuti: pinjaman aktif yang melewati rencana kembali
  router.get('/api/tindak-lanjut', (req, res) => {
    const data = db.prepare(`
      SELECT p.id, p.no_transaksi, p.tanggal_rencana_kembali, g.nama AS pegawai_nama,
        (SELECT COUNT(*) FROM detail_peminjaman d WHERE d.peminjaman_id = p.id) AS jumlah_item
      FROM peminjaman p
      JOIN pegawai g ON g.id = p.pegawai_id
      WHERE p.status = 'Diserahkan'
        AND p.tanggal_rencana_kembali IS NOT NULL
        AND p.tanggal_rencana_kembali < date('now','localtime')
      ORDER BY p.tanggal_rencana_kembali ASC LIMIT 20
    `).all();
    send(res, 200, { data, count: data.length });
  });

  // Data grafik: tren peminjaman 6 bulan + kategori terpopuler
  router.get('/api/grafik', (req, res) => {
    const bulanan = db.prepare(`
      SELECT strftime('%Y-%m', created_at) AS bulan, COUNT(*) AS total
      FROM peminjaman GROUP BY bulan ORDER BY bulan DESC LIMIT 6
    `).all().reverse();
    const kategori = db.prepare(`
      SELECT b.kategori, COUNT(*) AS jumlah
      FROM detail_peminjaman d JOIN barang b ON b.id = d.barang_id
      GROUP BY b.kategori ORDER BY jumlah DESC LIMIT 5
    `).all();
    send(res, 200, { data: { bulanan, kategori } });
  });
}
