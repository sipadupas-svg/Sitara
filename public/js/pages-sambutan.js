// SITARA — Layar Sambutan (welcome/onboarding) + Pengajuan Pinjaman Tanpa Akun
//
// Padanan asli dari komponen contoh "onboarding welcome screen" untuk stack
// SITARA (vanilla ES module + design system navy/gold, tanpa build step):
//   • hero melengkung di bagian atas (clip-path bentuk elips)
//   • judul + keterangan di tengah
//   • tombol utama "Ajukan Pinjaman" & tombol "Login (Masuk Petugas)"
//   • animasi bertahap (stagger) memakai CSS keyframes, bukan framer-motion,
//     karena proyek ini sengaja zero-dependency dan harus tetap jalan offline.
import { el, icons, toast, debounce } from './ui.js';
import { api } from './api.js';
import { emblemSVG } from './pages.js';

// ---------- Layar Sambutan ----------
export function renderSambutan(app) {
  document.title = 'Selamat Datang — SITARA';

  const hero = el('div', { class: 'welcome-hero' }, [
    el('div', { class: 'welcome-hero-emblem', html: emblemSVG(140) }),
    el('span', { class: 'welcome-hero-sub' }, ['BMN · Rutan Klas I Samarinda'])
  ]);

  const body = el('div', { class: 'welcome-body' }, [
    el('h1', {
      class: 'welcome-title',
      html: 'Selamat Datang di <span class="welcome-accent">SITARA</span>'
    }),
    el('p', { class: 'welcome-desc' }, [
      'Sistem Tata Kelola Aset Rutan. Ajukan peminjaman barang BMN secara mandiri, ' +
      'pantau statusnya, dan cetak Berita Acara — semuanya dari satu aplikasi.'
    ]),
    el('p', { class: 'welcome-note' }, [
      'Ingin mengajukan pinjaman? Cukup isi data peminjam dan pilih barang — tanpa perlu akun. ' +
      'Pengajuan Anda tetap diverifikasi petugas BMN.'
    ])
  ]);

  const actions = el('div', { class: 'welcome-actions' }, [
    el('button', {
      class: 'btn btn-gold btn-block welcome-btn-lg',
      onclick: () => { location.hash = '#/ajukan-tamu'; }
    }, [
      el('span', { class: 'btn-icon', html: icons.history }),
      el('span', {}, ['Ajukan Pinjaman'])
    ]),
    el('button', {
      class: 'btn btn-navy btn-block welcome-btn-lg',
      onclick: () => { location.hash = '#/login'; }
    }, [
      el('span', { class: 'btn-icon', html: icons.user }),
      el('span', {}, ['Login (Masuk Petugas)'])
    ]),
    el('p', { class: 'login-switch' }, [
      'Belum punya akun? ',
      el('button', { type: 'button', onclick: () => { location.hash = '#/login'; } }, ['Daftar mandiri petugas'])
    ])
  ]);

  app.replaceChildren(el('div', { class: 'welcome' }, [hero, body, actions]));
}


// ---------- Form Pengajuan Tanpa Akun ----------
export function renderAjukanTamu(app) {
  document.title = 'Ajukan Pinjaman — SITARA';

  const state = { items: [] };

  // Kartu identitas peminjam
  const f = {};
  const input = (key, label, opts = {}) => {
    f[key] = el('input', {
      type: opts.type || 'text',
      inputmode: opts.inputmode || '',
      placeholder: opts.placeholder || ''
    });
    return el('div', { class: 'field-light' }, [el('label', {}, [label + (opts.wajib ? ' *' : '')]), f[key]]);
  };

  // Pencarian barang tersedia (endpoint publik — tanpa akun)
  const barSearch = el('input', { type: 'search', class: 'search-input', placeholder: 'Cari barang (nama/NUP)…' });
  const barResult = el('div', { class: 'picker-result' });
  const itemList = el('div', { class: 'item-list' });

  function renderItemState() {
    if (!state.items.length) {
      itemList.replaceChildren(el('p', { class: 'picker-empty' }, ['Belum ada barang dipilih.']));
      return;
    }
    itemList.replaceChildren(...state.items.map((it, idx) => el('div', { class: 'item-row' }, [
      el('div', { class: 'barang-info' }, [
        el('strong', {}, [it.nama]),
        el('span', { class: 'barang-meta' }, [it.nup ? 'NUP ' + it.nup : ''])
      ]),
      el('button', {
        class: 'item-remove', 'aria-label': 'Hapus',
        onclick: () => { state.items.splice(idx, 1); renderItemState(); }
      }, ['✕'])
    ])));
  }

  // Muat katalog publik. Tanpa kata kunci → tampilkan barang tersedia lebih
  // dulu, supaya peminjam tidak perlu menebak nama barang.
  async function muatBarang(q) {
    try {
      const res = await api('/barang-tersedia' + (q ? '?q=' + encodeURIComponent(q) : ''));
      barResult.replaceChildren();
      res.data.slice(0, 6).forEach((b) => {
        barResult.appendChild(el('button', {
          class: 'picker-item',
          onclick: () => {
            if (state.items.some((i) => i.id === b.id)) { toast('Barang sudah ada di daftar', 'info'); return; }
            state.items.push({ id: b.id, nama: b.nama, nup: b.nup });
            renderItemState();
            barSearch.value = '';
            muatBarang('');
          }
        }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [b.nama]),
            el('span', { class: 'barang-meta' }, [b.merk ? `${b.merk} ` : '', b.tipe || '', b.nup ? `· NUP ${b.nup}` : ''])
          ]),
          el('span', { class: 'badge badge-tersedia' }, ['Tambah +'])
        ]));
      });
      if (!res.data.length) {
        barResult.replaceChildren(el('p', { class: 'picker-empty' }, [
          q ? 'Barang tidak ditemukan' : 'Belum ada barang berstatus Tersedia'
        ]));
      }
    } catch {
      barResult.replaceChildren(el('p', { class: 'picker-empty' }, ['Gagal memuat daftar barang']));
    }
  }

  barSearch.addEventListener('input', debounce(() => muatBarang(barSearch.value.trim()), 300));

  const datePinjam = el('input', { type: 'date', class: 'select-light', value: todayISO() });
  const dateKembali = el('input', { type: 'date', class: 'select-light', value: plusDaysISO(7) });

  renderItemState();
  muatBarang('');

  const submitBtn = el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, ['Kirim Pengajuan']);
  const form = el('form', { class: 'form-light' }, [
    el('div', { class: 'card' }, [
      el('h4', { class: 'sub-title', style: 'margin-top:0' }, ['Identitas Peminjam']),
      input('nama', 'Nama Lengkap', { wajib: true, placeholder: 'cth: Budi Santoso' }),
      input('nip', 'NIP', { placeholder: '8–20 digit (opsional)' }),
      input('unit_kerja', 'Unit Kerja', { placeholder: 'cth: Seksi Teknis' }),
      input('no_hp', 'No. HP / WhatsApp', { placeholder: 'cth: 0812xxxxxxx', type: 'tel', inputmode: 'tel' })
    ]),
    el('div', { class: 'card', style: 'margin-top:12px' }, [
      el('h4', { class: 'sub-title', style: 'margin-top:0' }, ['Barang BMN yang Dipinjam *']),
      el('p', { class: 'page-desc', style: 'margin-bottom:10px' }, ['Hanya barang berstatus Tersedia.']),
      barSearch,
      barResult,
      itemList
    ]),
    el('div', { class: 'card', style: 'margin-top:12px' }, [
      el('h4', { class: 'sub-title', style: 'margin-top:0' }, ['Rincian Peminjaman']),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field-light' }, [el('label', {}, ['Tanggal Pinjam']), datePinjam]),
        el('div', { class: 'field-light' }, [el('label', {}, ['Rencana Kembali']), dateKembali])
      ]),
      input('keperluan', 'Keperluan', { placeholder: 'cth: Kegiatan sosialisasi di aula' })
    ]),
    submitBtn,
    el('p', { class: 'picker-empty', style: 'margin-top:10px' }, [
      'Setelah dikirim, catat nomor transaksi yang muncul. Petugas BMN akan memverifikasi pengajuan Anda.'
    ])
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = f.nama.value.trim();
    if (nama.length < 3) { toast('Nama lengkap minimal 3 karakter', 'error'); return; }
    if (!state.items.length) { toast('Pilih minimal satu barang', 'error'); return; }
    if (datePinjam.value && dateKembali.value && dateKembali.value < datePinjam.value) {
      toast('Tanggal kembali tidak boleh sebelum tanggal pinjam', 'error');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim…';
    try {
      const res = await api('/peminjaman/tamu', {
        method: 'POST',
        body: {
          nama,
          nip: f.nip.value.trim(),
          unit_kerja: f.unit_kerja.value.trim(),
          no_hp: f.no_hp.value.trim(),
          keperluan: f.keperluan.value.trim(),
          tanggal_pinjam: datePinjam.value,
          tanggal_rencana_kembali: dateKembali.value,
          items: state.items.map((i) => ({ barang_id: i.id }))
        }
      });
      tampilkanSuksesTamu(app, res, nama);
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Kirim Pengajuan';
    }
  });

  app.replaceChildren(el('div', { class: 'page' }, [
    el('button', { class: 'tamu-back', onclick: () => { location.hash = '#/sambutan'; } }, ['← Kembali']),
    el('h2', { class: 'page-title' }, ['Ajukan Pinjaman Tanpa Akun']),
    el('p', { class: 'page-desc' }, [
      'Isi data peminjam dan pilih barang yang akan dipinjam — tidak perlu akun. ' +
      'Pengajuan langsung masuk ke petugas BMN untuk diverifikasi.'
    ]),
    form
  ]));
}

// ---------- Kartu sukses (pengajuan terkirim) ----------
function tampilkanSuksesTamu(app, res, nama) {
  const no = res?.data?.no_transaksi || '-';
  app.replaceChildren(el('div', { class: 'page tamu-sukses' }, [
    el('div', { class: 'tamu-sukses-icon', html: icons.checkCircle }),
    el('h2', { class: 'page-title' }, ['Pengajuan Terkirim']),
    el('p', { class: 'page-desc' }, [
      `Terima kasih, ${nama}. Pengajuan Anda sudah diterima petugas BMN untuk diverifikasi.`
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'info-grid' }, [
        el('span', { class: 'info-key' }, ['Nomor Transaksi']),
        el('span', { class: 'info-val' }, [no]),
        el('span', { class: 'info-key' }, ['Jumlah Barang']),
        el('span', { class: 'info-val' }, [String(res?.data?.jumlah_item ?? '-')]),
        el('span', { class: 'info-key' }, ['Status']),
        el('span', { class: 'info-val' }, ['Diajukan — menunggu verifikasi'])
      ])
    ]),
    el('p', { class: 'picker-empty', style: 'margin-top:12px' }, [
      `Simpan nomor ${no} untuk menanyakan status peminjaman Anda kepada petugas BMN.`
    ]),
    el('div', { class: 'sheet-actions' }, [
      el('button', { class: 'btn btn-gold', onclick: () => renderAjukanTamu(app) }, ['Ajukan Lagi']),
      el('button', {
        class: 'btn btn-navy', onclick: () => { location.hash = '#/sambutan'; }
      }, ['Kembali ke Halaman Awal'])
    ])
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
