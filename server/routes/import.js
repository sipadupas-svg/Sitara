// SITARA — Routes: Import master barang dari CSV/Excel SIMAK
import { db, audit, pendaftarMandiri } from '../db.js';
import { send } from '../router.js';

const FIELDS = ['kode_barang', 'nup', 'kib', 'nama', 'kategori', 'merk', 'tipe', 'tahun_perolehan', 'sumber_perolehan', 'nilai_perolehan', 'kondisi', 'status', 'ruang', 'catatan'];

export function registerImport(router) {
  router.post('/api/barang/import', (req, res) => {
    // Import master barang adalah pekerjaan petugas BMN, bukan peminjam.
    if (pendaftarMandiri(req.user.id)) {
      return send(res, 403, { error: 'Import master barang hanya dapat dilakukan petugas BMN.' });
    }
    const { rows, file_name } = req.body || {};
    if (!Array.isArray(rows) || !rows.length) {
      return send(res, 400, { error: 'Tidak ada baris data untuk diimpor' });
    }

    let created = 0, skipped = 0, gagal = 0;
    const errors = [];
    const cekNup = db.prepare('SELECT id FROM barang WHERE nup = ?');
    const cekBarcode = db.prepare('SELECT id FROM barang WHERE barcode = ?');
    const ins = db.prepare(`INSERT INTO barang
      (kode_barang, nup, kib, nama, kategori, merk, tipe, tahun_perolehan, sumber_perolehan, nilai_perolehan, kondisi, status, ruang, barcode, catatan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const clean = {};
      for (const f of FIELDS) clean[f] = (r[f] === undefined || r[f] === null || String(r[f]).trim() === '') ? null : String(r[f]).trim();
      if (!clean.nama || !clean.kode_barang) {
        gagal++;
        errors.push({ baris: i + 1, error: 'Kode barang / nama kosong' });
        continue;
      }
      if (clean.nup && cekNup.get(clean.nup)) { skipped++; continue; }
      const barcode = clean.barcode_default || clean.nup || clean.kode_barang;
      if (cekBarcode.get(barcode)) { skipped++; continue; }
      if (clean.kondisi && !['Baik', 'Rusak Ringan', 'Rusak Berat'].includes(clean.kondisi)) clean.kondisi = 'Baik';
      try {
        ins.run(
          clean.kode_barang, clean.nup, clean.kib, clean.nama, clean.kategori, clean.merk, clean.tipe,
          clean.tahun_perolehan ? parseInt(clean.tahun_perolehan, 10) || null : null,
          clean.sumber_perolehan,
          clean.nilai_perolehan ? parseFloat(clean.nilai_perolehan) || null : null,
          clean.kondisi || 'Baik', clean.status === 'Dipinjam' ? 'Tersedia' : 'Tersedia',
          clean.ruang, barcode, clean.catatan
        );
        created++;
      } catch (err) {
        gagal++;
        errors.push({ baris: i + 1, error: err.message.slice(0, 120) });
      }
    }

    db.prepare('INSERT INTO import_log (jenis, file_name, total_baris, berhasil, gagal, detail) VALUES (?,?,?,?,?,?)')
      .run('SIMAK-CSV', file_name || 'import.csv', rows.length, created, skipped + gagal, JSON.stringify(errors.slice(0, 20)));
    audit(req.user.id, 'import_simak', 'barang', null, { file: file_name, created, skipped, gagal });

    send(res, 200, { created, skipped, gagal, errors: errors.slice(0, 10), message: `Impor selesai: ${created} barang baru, ${skipped} dilewati (NUP sudah ada), ${gagal} gagal` });
  });
}
