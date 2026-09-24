// SITARA — Halaman Ajukan Peminjaman
import { el, icons, toast, statusBadge, emptyState, skeletonList, debounce, openSheet } from './ui.js';
import { api, getUser } from './api.js';

export async function renderAjukan(app) {
  document.title = 'Ajukan Peminjaman — SITARA';

  const state = { pegawai: null, items: [] };

  // ---------- Pilih pegawai ----------
  const pegSearch = el('input', { type: 'search', class: 'search-input', placeholder: 'Cari nama pegawai…' });
  const pegResult = el('div', { class: 'picker-result' });
  const pegSelected = el('div', { class: 'peg-selected', style: 'display:none' });
  const pegHint = el('p', { class: 'picker-empty', style: 'display:none' }, [
    'Terisi otomatis dari akun Anda — ganti bila mengajukan untuk pegawai lain.'
  ]);

  function pilihPegawai(p) {
    state.pegawai = p;
    pegSelected.style.display = '';
    pegSelected.replaceChildren(
      el('span', { class: 'peg-name' }, [p.nama]),
      el('span', { class: 'peg-meta' }, [p.nip ? 'NIP ' + p.nip : (p.unit_kerja || '')]),
      el('button', { class: 'sheet-close', onclick: () => { state.pegawai = null; pegSelected.style.display = 'none'; } }, ['✕'])
    );
    pegSearch.value = '';
    pegResult.replaceChildren();
  }

  pegSearch.addEventListener('input', debounce(async () => {
    const q = pegSearch.value.trim();
    if (q.length < 2) { pegResult.replaceChildren(); return; }
    try {
      const res = await api('/pegawai?q=' + encodeURIComponent(q));
      pegResult.replaceChildren();
      res.data.slice(0, 6).forEach((p) => {
        pegResult.appendChild(el('button', {
          class: 'picker-item',
          onclick: () => pilihPegawai(p)
        }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [p.nama]),
            el('span', { class: 'barang-meta' }, [p.jabatan || '', p.unit_kerja ? ` · ${p.unit_kerja}` : ''])
          ])
        ]));
      });
      if (!res.data.length) pegResult.replaceChildren(el('p', { class: 'picker-empty' }, ['Tidak ditemukan']));
    } catch { pegResult.replaceChildren(el('p', { class: 'picker-empty' }, ['Gagal mencari pegawai'])); }
  }, 350));

  // ---------- Pilih barang (hanya yang Tersedia) ----------
  const barSearch = el('input', { type: 'search', class: 'search-input', placeholder: 'Cari barang (nama/NUP)…' });
  const barResult = el('div', { class: 'picker-result' });
  const itemList = el('div', { class: 'item-list' });

  barSearch.addEventListener('input', debounce(async () => {
    const q = barSearch.value.trim();
    if (q.length < 2) { barResult.replaceChildren(); return; }
    try {
      const res = await api('/barang?status=Tersedia&q=' + encodeURIComponent(q));
      barResult.replaceChildren();
      res.data.slice(0, 6).forEach((b) => {
        barResult.appendChild(el('button', {
          class: 'picker-item',
          onclick: () => {
            if (state.items.some((i) => i.id === b.id)) { toast('Barang sudah ada di daftar', 'info'); return; }
            state.items.push({ id: b.id, nama: b.nama, nup: b.nup });
            renderItemState();
            barSearch.value = '';
            barResult.replaceChildren();
          }
        }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [b.nama]),
            el('span', { class: 'barang-meta' }, [b.merk ? `${b.merk} ` : '', b.tipe || '', b.nup ? `· NUP ${b.nup}` : ''])
          ]),
          el('span', { class: 'badge badge-tersedia' }, ['Tambah +'])
        ]));
      });
      if (!res.data.length) barResult.replaceChildren(el('p', { class: 'picker-empty' }, ['Tidak ada barang tersedia yang cocok']));
    } catch { barResult.replaceChildren(el('p', { class: 'picker-empty' }, ['Gagal mencari barang'])); }
  }, 350));

  function renderItemState() {
    itemList.replaceChildren();
    if (!state.items.length) {
      itemList.appendChild(el('p', { class: 'picker-empty' }, ['Belum ada barang dipilih']));
      return;
    }
    state.items.forEach((it, idx) => {
      itemList.appendChild(el('div', { class: 'item-row' }, [
        el('div', { class: 'barang-info' }, [
          el('strong', {}, [it.nama]),
          el('span', { class: 'barang-meta' }, [it.nup ? `NUP ${it.nup}` : ''])
        ]),
        el('button', { class: 'item-remove', 'aria-label': 'Hapus', onclick: () => { state.items.splice(idx, 1); renderItemState(); } }, ['✕'])
      ]));
    });
  }

  // ---------- Tanggal & keperluan ----------
  const datePinjam = el('input', { type: 'date', class: 'select-light', value: todayISO() });
  const dateKembali = el('input', { type: 'date', class: 'select-light', value: plusDaysISO(7) });
  const keperluanInput = el('input', { type: 'text', class: 'select-light', placeholder: 'cth: Kegiatan sosialisasi di aula' });

  const submitBtn = el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, ['Ajukan Peminjaman']);
  const form = el('form', { class: 'form-light' }, [
    el('div', { class: 'field-light' }, [el('label', {}, ['Pegawai Peminjam *']), pegSearch, pegSelected, pegHint, pegResult]),
    el('div', { class: 'field-light' }, [el('label', {}, ['Barang BMN * (hanya yang Tersedia)']), barSearch, barResult, itemList]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field-light' }, [el('label', {}, ['Tanggal Pinjam']), datePinjam]),
      el('div', { class: 'field-light' }, [el('label', {}, ['Rencana Kembali']), dateKembali])
    ]),
    el('div', { class: 'field-light' }, [el('label', {}, ['Keperluan']), keperluanInput]),
    submitBtn
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pegawai) { toast('Pilih pegawai peminjam terlebih dahulu', 'error'); return; }
    if (!state.items.length) { toast('Pilih minimal satu barang', 'error'); return; }
    if (dateKembali.value && datePinjam.value && dateKembali.value < datePinjam.value) {
      toast('Tanggal kembali tidak boleh sebelum tanggal pinjam', 'error');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses…';
    try {
      const res = await api('/peminjaman', {
        method: 'POST',
        body: {
          pegawai_id: state.pegawai.id,
          keperluan: keperluanInput.value.trim(),
          tanggal_pinjam: datePinjam.value,
          tanggal_rencana_kembali: dateKembali.value,
          items: state.items.map((i) => ({ barang_id: i.id }))
        }
      });
      toast(res.message, 'success');
      location.hash = '#/riwayat';
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ajukan Peminjaman';
    }
  });

  // Akun hasil pendaftaran mandiri: peminjam otomatis diarahkan ke identitas
  // sendiri supaya pegawai tinggal memilih barang & tanggal.
  const me = getUser();
  if (me?.pegawai_id) {
    try {
      const res = await api('/pegawai/' + me.pegawai_id);
      if (res.data) {
        pilihPegawai(res.data);
        pegHint.style.display = '';
      }
    } catch { /* gagal memuat — pegawai dapat memilih manual */ }
  }

  app.replaceChildren(el('div', { class: 'page' }, [
    el('h2', { class: 'page-title' }, ['Ajukan Peminjaman BMN']),
    el('p', { class: 'page-desc' }, ['Pilih pegawai, barang yang tersedia, dan tanggal. Pengajuan menunggu persetujuan petugas BMN.']),
    form
  ]));
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function plusDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

