// SITARA — Halaman Import SIMAK (CSV hasil Save-As Excel)
import { el, icons, toast, statusBadge, emptyState } from './ui.js';
import { api, bisaKelolaMaster } from './api.js';

function parseCSV(text) {
  text = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };
  const firstLine = text.split('\n')[0];
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === delim && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const lines = text.split('\n');
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s.]+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = cells[j] ?? ''; });
    rows.push(obj);
  }
  return { headers, rows };
}

export async function renderImport(app) {
  document.title = 'Import SIMAK — SITARA';

  // Import master barang adalah pekerjaan petugas BMN (server menjawab 403 untuk
  // akun pendaftaran mandiri) → tampilkan penjelasan, bukan formulir.
  if (!bisaKelolaMaster()) {
    app.replaceChildren(el('div', { class: 'page' }, [
      el('div', { class: 'card' }, [
        emptyState(
          icons.box,
          'Khusus petugas BMN',
          'Akun pendaftaran mandiri hanya dapat melihat katalog dan mengajukan peminjaman. ' +
          'Minta petugas BMN melakukan import master barang dari SIMAK.'
        )
      ])
    ]));
    return;
  }

  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none' });
  const dropCard = el('div', { class: 'import-drop' }, [
    el('strong', {}, ['Pilih berkas CSV']),
    el('p', {}, ['Dari SIMAK BMN / Excel: simpan sebagai CSV (pemisah ; atau ,). Kolom: kode_barang, nup, nama, kategori, dst.'])
  ]);
  const previewWrap = el('div', {});
  const submitBtn = el('button', { class: 'btn btn-gold btn-block', disabled: '' }, ['Impor ke SITARA']);

  let data = [];

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (!parsed.rows.length) { toast('Berkas CSV kosong', 'error'); return; }
      data = parsed.rows;
      renderPreview(file.name);
    } catch (err) {
      toast('Gagal membaca berkas: ' + err.message, 'error');
    }
    fileInput.value = '';
  });

  dropCard.addEventListener('click', () => fileInput.click());

  function renderPreview(fileName) {
    const valid = data.filter((r) => r.nama && r.kode_barang).length;
    previewWrap.replaceChildren(
      el('div', { class: 'card' }, [
        el('div', { class: 'detail-top' }, [
          el('strong', { class: 'detail-name' }, [fileName]),
          el('span', { class: 'badge badge-disetujui' }, [data.length + ' baris'])
        ]),
        el('p', { class: 'page-desc' }, [`${valid} baris siap diimpor · ${data.length - valid} baris tidak valid (kode/nama kosong)`]),
        el('div', { class: 'import-preview' }, (() => {
          const t = el('table', {});
          const thead = el('tr', {}, ['kode_barang', 'nup', 'nama', 'kategori', 'ruang'].map((h) => el('th', {}, [h])));
          t.appendChild(el('thead', {}, [thead]));
          const tb = el('tbody', {});
          data.slice(0, 5).forEach((r) => {
            tb.appendChild(el('tr', {}, ['kode_barang', 'nup', 'nama', 'kategori', 'ruang'].map((h) => el('td', {}, [r[h] || '—']))));
          });
          t.appendChild(tb);
          return t;
        })()),
        data.length > 5 ? el('p', { class: 'picker-empty' }, [`… dan ${data.length - 5} baris lainnya`]) : null
      ])
    );
    submitBtn.disabled = valid === 0;
  }

  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengimpor…';
    try {
      const res = await api('/barang/import', {
        method: 'POST',
        body: {
          file_name: data.__fileName || 'simak.csv',
          rows: data.map((r) => ({
            kode_barang: r.kode_barang, nup: r.nup, kib: r.kib, nama: r.nama,
            kategori: r.kategori, merk: r.merk, tipe: r.tipe,
            tahun_perolehan: r.tahun_perolehan, sumber_perolehan: r.sumber_perolehan,
            nilai_perolehan: r.nilai_perolehan, kondisi: r.kondisi, ruang: r.ruang, catatan: r.catatan
          }))
        }
      });
      previewWrap.prepend(el('div', { class: 'offline-note', style: 'margin:0 0 12px' }, [res.message]));
      toast(res.message, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    submitBtn.textContent = 'Impor ke SITARA';
  });

  app.replaceChildren(el('div', { class: 'page' }, [
    el('h2', { class: 'page-title' }, ['Import Data SIMAK BMN']),
    el('p', { class: 'page-desc' }, ['Impor master barang dari export SIMAK BMN (CSV). NUP yang sudah terdaftar otomatis dilewati — data tidak akan duplikat.']),
    dropCard,
    fileInput,
    previewWrap,
    submitBtn
  ]));
}
