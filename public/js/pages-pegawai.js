// SITARA — Halaman Master Pegawai (CRUD)
import { el, icons, toast, debounce, emptyState, skeletonList, openSheet, confirmDialog } from './ui.js';
import { api, bisaKelolaMaster } from './api.js';

export async function renderPegawai(app) {
  document.title = 'Master Pegawai — SITARA';
  const listWrap = el('div', { class: 'barang-list' });
  listWrap.appendChild(skeletonList(3));

  const searchInput = el('input', { type: 'search', placeholder: 'Cari nama, NIP, atau unit kerja…', class: 'search-input' });
  const addBtn = bisaKelolaMaster()
    ? el('button', { class: 'btn-add', onclick: () => openForm(null, load) }, ['＋ Tambah'])
    : null;

  async function load() {
    listWrap.replaceChildren(skeletonList(3));
    try {
      const params = new URLSearchParams();
      if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
      const res = await api('/pegawai?' + params.toString());
      listWrap.replaceChildren();
      if (!res.data.length) {
        listWrap.appendChild(emptyState(icons.user, 'Tidak ada pegawai', 'Tambahkan data pegawai peminjam.'));
        return;
      }
      res.data.forEach((p, i) => {
        const item = el('button', { class: 'barang-item', onclick: () => showDetail(p, load) }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [p.nama]),
            el('span', { class: 'barang-meta' }, [p.jabatan || '', p.unit_kerja ? ` · ${p.unit_kerja}` : ''])
          ]),
          el('div', { class: 'barang-side' }, [el('span', { class: 'badge badge-diajukan' }, [p.nip || 'tanpa NIP'])])
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
    listWrap
  ]));
  load();
}

function showDetail(p, onChanged) {
  const rows = [
    ['NIP', p.nip || '—'], ['Nama', p.nama], ['Unit Kerja', p.unit_kerja || '—'],
    ['Jabatan', p.jabatan || '—'], ['No. HP', p.no_hp || '—']
  ];
  const info = el('div', { class: 'info-grid' }, rows.map(([k, v]) => [
    el('span', { class: 'info-key' }, [k]), el('span', { class: 'info-val' }, [String(v)])
  ]).flat());

  // Akun pendaftaran mandiri hanya membaca data pegawai (tanpa ubah/hapus).
  const actions = el('div', { class: 'sheet-actions' }, [
    bisaKelolaMaster() ? el('button', { class: 'btn btn-gold', onclick: () => openForm(p, onChanged) }, ['Edit']) : null,
    bisaKelolaMaster() ? el('button', {
      class: 'btn btn-danger-solid',
      onclick: () => confirmDialog(`Hapus pegawai "${p.nama}"?`, async () => {
        try {
          const res = await api('/pegawai/' + p.id, { method: 'DELETE' });
          toast(res.message, 'success');
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      })
    }, ['Hapus']) : null
  ]);

  openSheet(el('div', {}, [
    el('div', { class: 'detail-top' }, [el('strong', { class: 'detail-name' }, [p.nama])]),
    info, actions
  ]), { title: 'Detail Pegawai' });
}

function openForm(existing, onSaved) {
  const p = existing || {};
  const isEdit = !!existing;
  const f = {};
  const input = (key, label, opts = {}) => {
    f[key] = el('input', { type: 'text', value: p[key] ?? '', placeholder: opts.placeholder || '' });
    return el('div', { class: 'field-light' }, [el('label', {}, [label + (opts.required ? ' *' : '')]), f[key]]);
  };

  const form = el('form', { class: 'form-light' }, [
    input('nama', 'Nama Lengkap', { required: true, placeholder: 'cth: Budi Santoso, S.H.' }),
    input('nip', 'NIP', { placeholder: '18 digit, opsional' }),
    el('div', { class: 'field-row' }, [
      input('unit_kerja', 'Unit Kerja', { placeholder: 'cth: Seksi BMN' }),
      input('jabatan', 'Jabatan', { placeholder: 'cth: Kasubsi' })
    ]),
    input('no_hp', 'No. HP', { placeholder: 'opsional' }),
    el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, [isEdit ? 'Simpan Perubahan' : 'Tambah Pegawai'])
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const [k, v] of Object.entries(f)) body[k] = v.value.trim() || null;
    if (!body.nama) { toast('Nama pegawai wajib diisi', 'error'); return; }
    try {
      const res = isEdit
        ? await api('/pegawai/' + existing.id, { method: 'PUT', body })
        : await api('/pegawai', { method: 'POST', body });
      toast(res.message, 'success');
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  });

  openSheet(form, { title: isEdit ? 'Edit Pegawai' : 'Tambah Pegawai' });
}
