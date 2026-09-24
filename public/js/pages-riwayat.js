// SITARA — Halaman Riwayat: alur peminjaman + dokumentasi foto
import { el, icons, toast, statusBadge, fmtDate, emptyState, skeletonList, openSheet, confirmDialog, debounce } from './ui.js';
import { api, downloadFile } from './api.js';

const TAHAP = [
  ['kondisi-awal', 'Kondisi Barang'],
  ['serah-terima', 'Serah Terima'],
  ['pengembalian', 'Pengembalian'],
  ['berita-acara', 'Berita Acara']
];

export async function renderRiwayat(app) {
  document.title = 'Riwayat — SITARA';
  const listWrap = el('div', { class: 'barang-list' });
  listWrap.appendChild(skeletonList(4));

  const ajukanBtn = el('button', { class: 'btn-add', onclick: () => { location.hash = '#/ajukan'; } }, ['＋ Ajukan']);
  const chips = el('div', { class: 'chip-row' });
  let activeStatus = '';
  [['', 'Semua'], ['Diajukan', 'Diajukan'], ['Disetujui', 'Disetujui'], ['Diserahkan', 'Dipinjam'], ['Dikembalikan', 'Selesai']].forEach(([val, label]) => {
    chips.appendChild(el('button', {
      class: 'chip' + (val === '' ? ' chip-active' : ''),
      onclick: (e) => {
        activeStatus = val;
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-active'));
        e.currentTarget.classList.add('chip-active');
        load();
      }
    }, [label]));
  });

  async function load() {
    listWrap.replaceChildren(skeletonList(3));
    try {
      const params = new URLSearchParams();
      if (activeStatus) params.set('status', activeStatus);
      const res = await api('/peminjaman?' + params.toString());
      listWrap.replaceChildren();
      if (!res.data.length) {
        listWrap.appendChild(emptyState(icons.history, 'Belum ada transaksi', 'Ajukan peminjaman untuk mulai mencatat alur serah terima BMN.'));
        return;
      }
      res.data.forEach((p, i) => {
        const item = el('button', { class: 'barang-item pjm-item', onclick: () => showDetail(p.id, load) }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [p.pegawai_nama]),
            el('span', { class: 'barang-meta' }, [`${p.no_transaksi} · ${p.jumlah_item} barang${p.jumlah_foto ? ` · ${p.jumlah_foto} foto` : ''}`]),
            el('span', { class: 'barang-meta' }, [p.tanggal_pinjam ? fmtDate(p.tanggal_pinjam) : 'belum diserahkan'])
          ]),
          el('div', { class: 'barang-side' }, [statusBadge(p.status)])
        ]);
        item.style.animationDelay = `${Math.min(i, 8) * 0.04}s`;
        listWrap.appendChild(item);
      });
    } catch (err) {
      listWrap.replaceChildren();
      listWrap.appendChild(emptyState(icons.wifiOff, 'Gagal memuat', err.message));
    }
  }

  app.replaceChildren(el('div', { class: 'page' }, [
    el('div', { class: 'page-head-row' }, [
      el('h2', { class: 'page-title', style: 'margin:0' }, ['Riwayat Peminjaman']),
      ajukanBtn
    ]),
    chips,
    listWrap
  ]));
  load();
}

// ---------- Kompresi foto ----------
function compressImage(file, maxDim = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const r = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function pickPhoto(onDataUrl) {
  const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      onDataUrl(await compressImage(file));
    } catch {
      toast('Gagal memproses foto', 'error');
    }
  });
  document.body.appendChild(input);
  input.click();
}

// ---------- Detail transaksi + aksi status ----------
const STEPS = ['Diajukan', 'Disetujui', 'Diserahkan', 'Dikembalikan'];

export async function showDetail(id, onChanged) {
  let d;
  try {
    d = (await api('/peminjaman/' + id)).data;
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  // Timeline status
  const tl = el('div', { class: 'timeline' });
  const idx = d.status === 'Ditolak' ? 1 : STEPS.indexOf(d.status);
  STEPS.forEach((s, i) => {
    const done = d.status !== 'Ditolak' && i <= idx;
    tl.appendChild(el('div', { class: 'tl-item' + (done ? ' tl-done' : '') + (d.status !== 'Ditolak' && i === idx ? ' tl-now' : '') }, [
      el('span', { class: 'tl-dot' }),
      el('span', { class: 'tl-label' }, [s])
    ]));
  });
  if (d.status === 'Ditolak') {
    tl.appendChild(el('div', { class: 'tl-item tl-reject' }, [
      el('span', { class: 'tl-dot' }),
      el('span', { class: 'tl-label' }, ['Ditolak' + (d.catatan_penolakan ? ' — ' + d.catatan_penolakan : '')])
    ]));
  }

  const info = el('div', { class: 'info-grid' }, [
    el('span', { class: 'info-key' }, ['Peminjam']),
    el('span', { class: 'info-val' }, [d.pegawai_nama + (d.unit_kerja ? ' · ' + d.unit_kerja : '')]),
    el('span', { class: 'info-key' }, ['Keperluan']),
    el('span', { class: 'info-val' }, [d.keperluan || '—']),
    el('span', { class: 'info-key' }, ['Tgl Pinjam']),
    el('span', { class: 'info-val' }, [d.tanggal_pinjam ? fmtDate(d.tanggal_pinjam) : '—']),
    el('span', { class: 'info-key' }, ['Rencana Kembali']),
    el('span', { class: 'info-val' }, [d.tanggal_rencana_kembali ? fmtDate(d.tanggal_rencana_kembali) : '—']),
    d.tanggal_kembali ? el('span', { class: 'info-key' }, ['Dikembalikan']) : null,
    d.tanggal_kembali ? el('span', { class: 'info-val' }, [fmtDate(d.tanggal_kembali)]) : null,
    d.berita_acara ? el('span', { class: 'info-key' }, ['Berita Acara']) : null,
    d.berita_acara ? el('span', { class: 'info-val' }, [`${d.berita_acara.nomor_ba} (${fmtDate(d.berita_acara.tanggal)})`]) : null
  ].filter(Boolean).flat());

  const itemsEl = el('div', { class: 'detail-items' }, d.items.map((it) =>
    el('div', { class: 'item-row' }, [
      el('div', { class: 'barang-info' }, [
        el('strong', {}, [it.nama]),
        el('span', { class: 'barang-meta' }, [it.nup ? `NUP ${it.nup} · ` : '', it.kondisi_barang || ''])
      ]),
      it.kondisi_kembali ? statusBadge(it.kondisi_kembali) : el('span', { class: 'badge badge-diajukan' }, ['Dipinjam'])
    ])
  ));

  // Galeri dokumentasi per tahap
  const galWrap = el('div', { class: 'dok-wrap' });
  for (const [tahap, label] of TAHAP) {
    galWrap.appendChild(dokSection(d, tahap, label, () => showDetail(id, onChanged)));
  }

  const content = el('div', {}, [
    el('div', { class: 'detail-top' }, [
      el('strong', { class: 'detail-name' }, [d.no_transaksi]),
      statusBadge(d.status)
    ]),
    tl, info,
    el('h4', { class: 'sub-title' }, ['Barang']),
    itemsEl,
    el('h4', { class: 'sub-title' }, ['Dokumentasi']),
    galWrap,
    statusActions(d, () => showDetail(id, onChanged))
  ]);
  openSheet(content, { title: 'Detail Peminjaman' });
}

function dokSection(d, tahap, label, refresh) {
  const grid = el('div', { class: 'photo-grid' });
  const addBtn = el('button', {
    class: 'photo-add',
    'aria-label': 'Tambah foto ' + label,
    onclick: () => pickPhoto(async (dataUrl) => {
      try {
        const res = await api(`/peminjaman/${d.id}/dokumentasi`, { method: 'POST', body: { tahap, dataUrl } });
        toast(res.message, 'success');
        refresh();
      } catch (err) { toast(err.message, 'error'); }
    })
  }, ['＋ Foto']);
  grid.appendChild(addBtn);

  d.dokumentasi.filter((x) => x.tahap === tahap).forEach((f) => {
    grid.appendChild(el('button', { class: 'photo-thumb', onclick: () => viewPhoto(d.id, f, refresh) }, [
      el('img', { src: f.file_path, alt: label, loading: 'lazy' })
    ]));
  });

  return el('div', { class: 'dok-section' }, [el('span', { class: 'dok-label' }, [label]), grid]);
}

function viewPhoto(pjmId, f, refresh) {
  const content = el('div', {}, [
    el('img', { src: f.file_path, class: 'photo-full', alt: f.tahap }),
    el('div', { class: 'sheet-actions' }, [
      el('button', {
        class: 'btn btn-danger-solid',
        onclick: () => confirmDialog('Hapus foto ini?', async () => {
          try {
            const res = await api(`/peminjaman/${pjmId}/dokumentasi/${f.id}`, { method: 'DELETE' });
            toast(res.message, 'success');
            refresh();
          } catch (err) { toast(err.message, 'error'); }
        })
      }, ['Hapus'])
    ])
  ]);
  openSheet(content, { title: 'Foto Dokumentasi' });
}

// ---------- Aksi sesuai status ----------
function statusActions(d, refresh) {
  const wrap = el('div', { class: 'sheet-actions' });

  if (d.status === 'Diajukan') {
    wrap.appendChild(el('button', {
      class: 'btn btn-gold',
      onclick: () => doAction(d.id, { aksi: 'setujui' }, 'Pengajuan disetujui?', refresh)
    }, ['✓ Setujui']));
    wrap.appendChild(el('button', {
      class: 'btn btn-danger-solid',
      onclick: () => {
        const catatan = el('input', { type: 'text', class: 'select-light', placeholder: 'Alasan penolakan (opsional)' });
        const s = openSheet(el('div', {}, [
          catatan,
          el('button', {
            class: 'btn btn-danger-solid btn-block',
            style: 'margin-top:12px',
            onclick: async () => {
              s.close();
              await doAction(d.id, { aksi: 'tolak', catatan: catatan.value }, 'Pengajuan ditolak?', refresh);
            }
          }, ['Tolak Pengajuan'])
        ]), { title: 'Tolak Pengajuan' });
      }
    }, ['✕ Tolak']));
  }

  if (d.status === 'Disetujui') {
    wrap.appendChild(el('button', {
      class: 'btn btn-gold btn-block',
      onclick: () => doAction(d.id, { aksi: 'serahkan' }, 'Serahkan barang sekarang? Pastikan foto serah terima telah diambil.', refresh)
    }, ['🤝 Serahkan Barang']));
  }

  if (d.status === 'Diserahkan') {
    wrap.appendChild(el('button', {
      class: 'btn btn-gold btn-block',
      onclick: () => openReturnForm(d, refresh)
    }, ['↩ Catat Pengembalian']));
  }

  if (d.status === 'Diserahkan' || d.status === 'Dikembalikan') {
    wrap.appendChild(el('button', {
      class: 'btn btn-navy btn-block',
      onclick: () => {
        toast('Menyiapkan Berita Acara (PDF)…', 'info');
        downloadFile(`/peminjaman/${d.id}/berita-acara`, d.no_transaksi + '-berita-acara.pdf')
          .then(() => toast('Berita Acara diunduh', 'success'))
          .catch((e) => toast(e.message, 'error'));
      }
    }, ['📄 Berita Acara (PDF)']));
  }

  return wrap;
}

async function doAction(id, body, confirmMsg, refresh) {
  confirmDialog(confirmMsg, async () => {
    try {
      const res = await api(`/peminjaman/${id}/status`, { method: 'POST', body });
      toast(res.message, 'success');
      refresh();
    } catch (err) { toast(err.message, 'error'); }
  }, { yesLabel: 'Ya, Lanjutkan' });
}

function openReturnForm(d, refresh) {
  const selects = d.items.map((it) => {
    const sel = el('select', { class: 'select-light' }, ['Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang'].map((k) =>
      el('option', { value: k }, [k])
    ));
    return el('div', { class: 'return-row' }, [
      el('div', { class: 'barang-info' }, [
        el('strong', {}, [it.nama]),
        el('span', { class: 'barang-meta' }, [it.nup ? `NUP ${it.nup}` : ''])
      ]),
      sel
    ]);
  });
  const content = el('div', {}, [
    el('p', { class: 'page-desc' }, ['Periksa kondisi fisik setiap barang. Hilang/rusak akan mengubah status barang di katalog.']),
    ...selects,
    el('button', {
      class: 'btn btn-gold btn-block',
      style: 'margin-top:14px',
      onclick: async () => {
        const items = d.items.map((it, i) => ({ detail_id: it.detail_id, kondisi_kembali: selects[i].querySelector('select').value }));
        try {
          const res = await api(`/peminjaman/${d.id}/status`, { method: 'POST', body: { aksi: 'kembalikan', items } });
          toast(res.message, 'success');
          sheet.close();
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      }
    }, ['Konfirmasi Pengembalian'])
  ]);
  const sheet = openSheet(content, { title: 'Pengembalian Barang' });
}

// [PART3]

