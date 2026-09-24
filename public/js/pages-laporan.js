// SITARA — Halaman Laporan & Export
import { el, icons, toast, statusBadge, fmtDate, emptyState, skeletonList } from './ui.js';
import { api, downloadFile } from './api.js';

export async function renderLaporan(app) {
  document.title = 'Laporan — SITARA';

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  const dariInput = el('input', { type: 'date', class: 'select-light', value: iso(firstDay) });
  const sampaiInput = el('input', { type: 'date', class: 'select-light', value: iso(today) });
  const muatBtn = el('button', { class: 'btn btn-navy btn-block', onclick: load }, ['Muat Laporan']);
  const wrap = el('div', { class: 'laporan-wrap' });

  async function load() {
    wrap.replaceChildren(skeletonList(3));
    try {
      const res = await api(`/laporan?dari=${dariInput.value}&sampai=${sampaiInput.value}`);
      const { total, perStatus, totalItem, kategori, terlambat } = res.data;

      const cards = el('div', { class: 'stat-grid' }, [
        el('div', { class: 'stat-card stat-navy' }, [el('span', { class: 'stat-value' }, [String(total)]), el('span', { class: 'stat-label' }, ['Total Transaksi'])]),
        el('div', { class: 'stat-card stat-gold' }, [el('span', { class: 'stat-value' }, [String(totalItem)]), el('span', { class: 'stat-label' }, ['Barang Dipinjamkan'])]),
        el('div', { class: 'stat-card stat-green' }, [el('span', { class: 'stat-value' }, [String(perStatus['Dikembalikan'] || 0)]), el('span', { class: 'stat-label' }, ['Selesai'])]),
        el('div', { class: 'stat-card stat-red' }, [el('span', { class: 'stat-value' }, [String(terlambat.length)]), el('span', { class: 'stat-label' }, ['Terlambat'])])
      ]);

      const kat = el('div', { class: 'card' }, [
        el('h4', { class: 'sub-title', style: 'margin-top:0' }, ['Kategori Terpopuler']),
        kategori.length ? kategori.map((k) => {
          const max = Math.max(...kategori.map((x) => x.jumlah));
          return el('div', { class: 'kat-row' }, [
            el('span', { class: 'kat-label' }, [k.kategori || 'Tanpa kategori']),
            el('div', { class: 'kat-bar' }, [el('div', { class: 'kat-fill', style: `width:${Math.round((k.jumlah / max) * 100)}%` })]),
            el('span', { class: 'kat-n' }, [String(k.jumlah)])
          ]);
        }) : el('p', { class: 'picker-empty' }, ['Belum ada data pada periode ini'])
      ]);

      const tel = el('div', { class: 'card' }, [
        el('h4', { class: 'sub-title', style: 'margin-top:0' }, ['Perlu Ditindaklanjuti (Terlambat)']),
        terlambat.length
          ? terlambat.map((t) => el('div', { class: 'recent-item' }, [
              el('div', { class: 'barang-info' }, [
                el('strong', {}, [t.pegawai_nama]),
                el('span', { class: 'barang-meta' }, [`${t.no_transaksi} · rencana kembali ${fmtDate(t.tanggal_rencana_kembali)}`])
              ]),
              el('span', { class: 'badge badge-dihapus' }, ['Terlambat'])
            ]))
          : el('p', { class: 'picker-empty' }, ['Tidak ada keterlambatan 🎉'])
      ]);

      wrap.replaceChildren(
        cards,
        el('div', { class: 'sheet-actions' }, [
          el('button', {
            class: 'btn btn-navy',
            onclick: () => downloadFile(`/laporan/export/peminjaman?dari=${dariInput.value}&sampai=${sampaiInput.value}`, 'laporan-peminjaman.csv').then(() => toast('Laporan peminjaman diunduh', 'success')).catch((e) => toast(e.message, 'error'))
          }, ['⬇ CSV Peminjaman']),
          el('button', {
            class: 'btn btn-ghost',
            onclick: () => downloadFile('/laporan/export/barang', 'daftar-barang-bmn.csv').then(() => toast('Daftar barang diunduh', 'success')).catch((e) => toast(e.message, 'error'))
          }, ['⬇ CSV Barang (SIMAK)'])
        ]),
        kat, tel
      );
    } catch (err) {
      wrap.replaceChildren(emptyState(icons.wifiOff, 'Gagal memuat', err.message));
    }
  }

  app.replaceChildren(el('div', { class: 'page' }, [
    el('h2', { class: 'page-title' }, ['Laporan Peminjaman BMN']),
    el('p', { class: 'page-desc' }, ['Ringkasan transaksi pada periode yang dipilih, siap dilaporkan ke kepala rutan/kanwil.']),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field-light' }, [el('label', {}, ['Dari Tanggal']), dariInput]),
      el('div', { class: 'field-light' }, [el('label', {}, ['Sampai']), sampaiInput])
    ]),
    el('div', { style: 'margin:12px 0' }, [muatBtn]),
    wrap
  ]));
  load();
}

// SITARA — Halaman Audit Trail
export async function renderAudit(app) {
  document.title = 'Audit Trail — SITARA';
  const wrap = el('div', { class: 'audit-list' });
  wrap.appendChild(skeletonList(5));
  app.replaceChildren(el('div', { class: 'page' }, [
    el('h2', { class: 'page-title' }, ['Audit Trail']),
    el('p', { class: 'page-desc' }, ['100 aktivitas terakhir pada sistem — penting untuk pemeriksaan aset negara.']),
    wrap
  ]));
  try {
    const res = await api('/audit?limit=100');
    wrap.replaceChildren();
    if (!res.data.length) {
      wrap.appendChild(emptyState(icons.history, 'Belum ada aktivitas', 'Aktivitas pengguna akan tercatat di sini.'));
      return;
    }
    res.data.forEach((a) => {
      let detail = '';
      try { detail = Object.entries(JSON.parse(a.detail || '{}')).map(([k, v]) => `${k}: ${v}`).join(' · '); } catch { detail = a.detail || ''; }
      wrap.appendChild(el('div', { class: 'audit-item' }, [
        el('div', { class: 'audit-head' }, [
          el('strong', {}, [aksiLabel(a.aksi)]),
          el('span', { class: 'barang-meta' }, [a.created_at])
        ]),
        el('span', { class: 'barang-meta' }, [`${a.user_nama || 'Sistem'} → ${a.entitas || '-'}${a.entitas_id ? ' #' + a.entitas_id : ''}`]),
        detail ? el('span', { class: 'barang-meta audit-detail' }, [detail]) : null
      ]));
    });
  } catch (err) {
    wrap.replaceChildren(emptyState(icons.wifiOff, 'Gagal memuat', err.message));
  }
}

function aksiLabel(a) {
  const map = {
    login: 'Masuk', tambah: 'Tambah', ubah: 'Ubah', hapus: 'Hapus',
    setujui: 'Setujui', tolak: 'Tolak', serahkan: 'Serahkan', kembalikan: 'Kembalikan',
    unggah_foto: 'Unggah Foto', hapus_foto: 'Hapus Foto', cetak_ba: 'Cetak BA',
    import_simak: 'Import SIMAK', lihat_laporan: 'Lihat Laporan', export_laporan: 'Export',
    ubah_password: 'Ganti Password', ajukan: 'Ajukan'
  };
  return map[a] || a;
}
