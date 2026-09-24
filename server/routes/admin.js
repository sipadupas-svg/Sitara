// SITARA — Routes: Backup & restore database SQLite (khusus admin)
import { db, dataDir, audit } from '../db.js';
import { send } from '../router.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function registerAdmin(router) {
  // Export: unduh file database siap backup
  router.get('/api/admin/db/export', (req, res) => {
    if (req.user.role !== 'admin') return send(res, 403, { error: 'Hanya administrator' });
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const dbPath = path.join(dataDir, 'sitara.db');
    if (!existsSync(dbPath)) return send(res, 404, { error: 'Berkas database tidak ditemukan' });
    const buf = readFileSync(dbPath);
    audit(req.user.id, 'export_db', 'database', null, { ukuran: buf.length });
    const tgl = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="sitara-backup-${tgl}.db"`,
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });

  // Import: unggah backup → diproses saat server berikutnya direstart
  router.post('/api/admin/db/import', (req, res) => {
    if (req.user.role !== 'admin') return send(res, 403, { error: 'Hanya administrator' });
    const { dataUrl } = req.body || {};
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      return send(res, 400, { error: 'Berkas database tidak valid' });
    }
    const b64 = dataUrl.slice(dataUrl.indexOf(';base64,') + 8);
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 100 || !buf.slice(0, 16).equals(Buffer.from('SQLite format 3\0', 'latin1'))) {
      return send(res, 400, { error: 'Ini bukan berkas database SQLite yang valid' });
    }
    writeFileSync(path.join(dataDir, 'pending-restore.db'), buf);
    audit(req.user.id, 'import_db', 'database', null, { ukuran: buf.length });
    send(res, 200, {
      message: 'Berkas backup siap. Database akan diganti otomatis saat server di-restart (data saat ini dibackup otomatis).'
    });
  });
}
