// SITARA — Halaman Barang: katalog + CRUD lengkap
import { el, icons, toast, statusBadge, fmtRupiah, debounce, emptyState, skeletonList, openSheet, confirmDialog } from './ui.js';
import { api, bisaKelolaMaster } from './api.js';
import { printLabels } from './pages-labels.js';

const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const STATUS = ['Tersedia', 'Dipinjam', 'Perbaikan', 'Dihapus'];

export async function renderBarang(app) {
  document.title = 'Katalog Barang — SITARA';
  const listWrap = el('div', { class: 'barang-list' });
  listWrap.appendChild(skeletonList(4));

  const searchInput = el('input', { type: 'search', placeholder: 'Cari nama, NUP, atau kode barang…', class: 'search-input' });
  const chips = el('div', { class: 'chip-row' });
  let activeStatus = '';
  [['', 'Semua'], ['Tersedia', 'Tersedia'], ['Dipinjam', 'Dipinjam'], ['Perbaikan', 'Perbaikan'], ['Dihapus', 'Dihapus']].forEach(([val, label]) => {
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

  const addBtn = bisaKelolaMaster()
    ? el('button', { class: 'btn-add', onclick: () => openForm(null, load) }, ['＋ Tambah'])
    : null;

  async function load() {
    listWrap.replaceChildren(skeletonList(3));
    try {
      const params = new URLSearchParams();
      if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
      if (activeStatus) params.set('status', activeStatus);
      const res = await api('/barang?' + params.toString());
      listWrap.replaceChildren();
      if (!res.data.length) {
        listWrap.appendChild(emptyState(icons.box, 'Tidak ada barang', 'Coba ubah kata kunci atau filter status.'));
        return;
      }
      res.data.forEach((b, i) => {
        const item = el('button', { class: 'barang-item', onclick: () => showDetail(b, load) }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [b.nama]),
            el('span', { class: 'barang-meta' }, [b.merk ? `${b.merk} ` : '', b.tipe || '', b.nup ? `· NUP ${b.nup}` : ''])
          ]),
          el('div', { class: 'barang-side' }, [statusBadge(b.status)])
        ]);
        item.style.animationDelay = `${Math.min(i, 8) * 0.04}s`;
        listWrap.appendChild(item);
      });
    } catch (err) {
      listWrap.replaceChildren();
      listWrap.appendChild(emptyState(icons.wifiOff, 'Gagal memuat', err.message));
    }
  }

  searchInput.addEventListener('input', debounce(load, 350));

  app.replaceChildren(el('div', { class: 'page' }, [
    el('div', { class: 'page-head-row' }, [
      el('div', { class: 'search-wrap grow' }, [searchInput, el('span', { class: 'search-icon', html: icons.search })]),
      addBtn
    ]),
    chips,
    listWrap
  ]));
  load();
}

// ---------- Detail Barang ----------
export function showDetail(b, onChanged) {
  const rows = [
    ['Kode Barang', b.kode_barang], ['NUP', b.nup || '—'], ['KIB', b.kib || '—'],
    ['Kategori', b.kategori || '—'], ['Merk / Tipe', [b.merk, b.tipe].filter(Boolean).join(' ') || '—'],
    ['Tahun / Sumber', [b.tahun_perolehan, b.sumber_perolehan].filter(Boolean).join(' · ') || '—'],
    ['Nilai Perolehan', fmtRupiah(b.nilai_perolehan)], ['Ruang / Lokasi', b.ruang || '—'],
    ['Barcode', b.barcode || '—']
  ];
  const info = el('div', { class: 'info-grid' }, rows.map(([k, v]) => [
    el('span', { class: 'info-key' }, [k]),
    el('span', { class: 'info-val' }, [String(v)])
  ]).flat());

  // Akun pendaftaran mandiri hanya dapat membaca & mencetak label; tombol
  // ubah/hapus disembunyikan karena server menolaknya (403).
  const actions = el('div', { class: 'sheet-actions' }, [
    el('button', { class: 'btn btn-navy', onclick: async () => { await printLabels([b]); } }, ['Cetak Label QR']),
    bisaKelolaMaster() ? el('button', { class: 'btn btn-gold', onclick: () => openForm(b, onChanged) }, ['Edit']) : null,
    bisaKelolaMaster() ? el('button', {
      class: 'btn btn-danger-solid',
      onclick: () => confirmDialog(`Hapus barang "${b.nama}"? Tindakan ini tidak dapat dibatalkan.`, async () => {
        try {
          const res = await api('/barang/' + b.id, { method: 'DELETE' });
          toast(res.message, 'success');
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      })
    }, ['Hapus']) : null
  ]);

  const content = el('div', {}, [
    el('div', { class: 'detail-top' }, [
      el('strong', { class: 'detail-name' }, [b.nama]),
      el('div', { class: 'detail-badges' }, [statusBadge(b.status), statusBadge(b.kondisi)])
    ]),
    info,
    actions
  ]);
  openSheet(content, { title: 'Detail Barang' });
}

// ---------- Form Tambah/Edit Barang ----------
export function openForm(existing, onSaved, preset = {}) {
  const b = existing || preset;
  const isEdit = !!existing;

  const f = {};
  const input = (key, label, opts = {}) => {
    f[key] = el('input', { type: opts.type || 'text', value: b[key] ?? '', placeholder: opts.placeholder || '', inputmode: opts.inputmode || '' });
    return el('div', { class: 'field-light' }, [el('label', {}, [label + (opts.required ? ' *' : '')]), f[key]]);
  };
  const select = (key, label, options, fallback) => {
    f[key] = el('select', { class: 'select-light' }, options.map((o) => el('option', { value: o, selected: (b[key] || fallback) === o }, [o])));
    return el('div', { class: 'field-light' }, [el('label', {}, [label]), f[key]]);
  };

  const form = el('form', { class: 'form-light' }, [
    input('nama', 'Nama Barang', { required: true, placeholder: 'cth: Laptop' }),
    input('kode_barang', 'Kode Barang (108)', { required: true, placeholder: 'cth: 108030200011016' }),
    el('div', { class: 'field-row' }, [
      input('nup', 'NUP', { placeholder: 'cth: 000001' }),
      input('kib', 'No. KIB', { placeholder: 'opsional' })
    ]),
    el('div', { class: 'field-row' }, [
      input('kategori', 'Kategori', { placeholder: 'cth: Peralatan dan Mesin' }),
      input('ruang', 'Ruang / Lokasi', { placeholder: 'cth: Ruang IT' })
    ]),
    el('div', { class: 'field-row' }, [input('merk', 'Merk'), input('tipe', 'Tipe')]),
    el('div', { class: 'field-row' }, [
      input('tahun_perolehan', 'Tahun', { type: 'number' }),
      input('nilai_perolehan', 'Nilai (Rp)', { type: 'number' })
    ]),
    input('sumber_perolehan', 'Sumber Perolehan', { placeholder: 'cth: APBN' }),
    select('kondisi', 'Kondisi', KONDISI, 'Baik'),
    select('status', 'Status', STATUS, 'Tersedia'),
    input('catatan', 'Catatan', { placeholder: 'opsional' }),
    el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, [isEdit ? 'Simpan Perubahan' : 'Tambah Barang'])
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const [k, v] of Object.entries(f)) {
      body[k] = v.value.trim() === '' ? null : (v.type === 'number' ? (Number(v.value) || null) : v.value.trim());
    }
    if (!body.nama || !body.kode_barang) { toast('Nama dan Kode Barang wajib diisi', 'error'); return; }
    try {
      const res = isEdit
        ? await api('/barang/' + existing.id, { method: 'PUT', body })
        : await api('/barang', { method: 'POST', body });
      toast(res.message, 'success');
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  });

  openSheet(form, { title: isEdit ? 'Edit Barang' : 'Tambah Barang BMN' });
}

