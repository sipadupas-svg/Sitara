// SITARA — Halaman: Login, Beranda, Barang, Scan, Riwayat, Profil
import { el, icons, toast, statusBadge, fmtDate, fmtRupiah, debounce, emptyState, skeletonList, openSheet } from './ui.js';
import { api, getStats, getUser, clearSession, setSession, downloadFile, queueCount, flushQueue, isPeminjam, isAdmin, bisaKelolaMaster } from './api.js';
import { openForm } from './pages-barang.js';
import { showDetail } from './pages-riwayat.js';

export function emblemSVG(size = 64) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}">
    <rect x="8" y="8" width="104" height="104" rx="14" fill="none" stroke="#D4AF37" stroke-width="2"/>
    <path d="M60 26 L88 60 L60 94 L32 60 Z" fill="none" stroke="#D4AF37" stroke-width="2.5"/>
    <path d="M60 44 L72 60 L60 76 L48 60 Z" fill="#D4AF37"/>
    <line x1="24" y1="60" x2="32" y2="60" stroke="#D4AF37" stroke-width="2.5"/>
    <line x1="88" y1="60" x2="96" y2="60" stroke="#D4AF37" stroke-width="2.5"/>
  </svg>`;
}

// ---------- LOGIN & DAFTAR MANDIRI ----------
function kepalaLogin(subJudul) {
  return [
    el('div', { class: 'login-emblem', html: emblemSVG() }),
    el('h1', { class: 'login-title' }, ['SITARA']),
    el('p', { class: 'login-sub' }, [subJudul]),
    el('p', { class: 'login-org' }, ['BMN · Rutan Klas I Samarinda'])
  ];
}

export function renderLogin(app, onSuccess) {
  document.title = 'Masuk — SITARA';
  const userInput = el('input', { type: 'text', placeholder: 'Username', autocomplete: 'username', id: 'f-user' });
  const passInput = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', id: 'f-pass' });
  const btn = el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, ['Masuk']);

  const form = el('form', { class: 'login-card' }, [
    ...kepalaLogin('Sistem Tata Kelola Aset Rutan'),
    el('div', { class: 'field' }, [el('label', { for: 'f-user' }, ['Username']), userInput]),
    el('div', { class: 'field' }, [el('label', { for: 'f-pass' }, ['Password']), passInput]),
    btn,
    el('p', { class: 'login-switch' }, [
      'Belum punya akun? ',
      el('button', { type: 'button', onclick: () => renderDaftar(app, onSuccess) }, ['Daftar mandiri'])
    ])
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: { username: userInput.value.trim(), password: passInput.value }
      });
      setSession(res.token, res.user);
      toast(`Selamat datang, ${res.user.nama.split(' ')[0]}`, 'success');
      onSuccess();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });

  app.replaceChildren(form);
}

// Pendaftaran mandiri: pegawai yang ingin mengajukan pinjaman membuat akunnya
// sendiri. Akun langsung aktif (langsung bisa masuk & mengajukan); petugas BMN
// tetap memverifikasi pengajuan dan dapat menonaktifkan akun di menu Kelola Akun.
function renderDaftar(app, onSuccess) {
  document.title = 'Daftar Mandiri — SITARA';

  const fNama = el('input', { type: 'text', placeholder: 'Nama lengkap (sesuai NIP)', autocomplete: 'name' });
  const fNip = el('input', { type: 'text', placeholder: 'NIP (opsional)', inputmode: 'numeric' });
  const fUnit = el('input', { type: 'text', placeholder: 'cth: Seksi BMN' });
  const fHp = el('input', { type: 'tel', placeholder: 'cth: 0812xxxxxxx', inputmode: 'tel' });
  const fUser = el('input', { type: 'text', placeholder: 'Username untuk masuk', autocomplete: 'username' });
  const fPass = el('input', { type: 'password', placeholder: 'Minimal 6 karakter', autocomplete: 'new-password' });
  const fPass2 = el('input', { type: 'password', placeholder: 'Ulangi password', autocomplete: 'new-password' });
  const btn = el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, ['Daftar Sekarang']);

  const form = el('form', { class: 'login-card' }, [
    ...kepalaLogin('Pendaftaran Akun Mandiri'),
    el('p', { class: 'login-info' }, [
      'Formulir ini untuk pegawai yang ingin mengajukan peminjaman barang BMN. ' +
      'Setelah mendaftar, Anda dapat langsung masuk dan mengajukan sendiri — ' +
      'pengajuan tetap diverifikasi petugas BMN.'
    ]),
    el('div', { class: 'field' }, [el('label', {}, ['Nama Lengkap *']), fNama]),
    el('div', { class: 'field' }, [el('label', {}, ['NIP']), fNip]),
    el('div', { class: 'field' }, [el('label', {}, ['Unit Kerja']), fUnit]),
    el('div', { class: 'field' }, [el('label', {}, ['No. HP / WhatsApp']), fHp]),
    el('div', { class: 'field' }, [el('label', {}, ['Username *']), fUser]),
    el('div', { class: 'field' }, [el('label', {}, ['Password *']), fPass]),
    el('div', { class: 'field' }, [el('label', {}, ['Ulangi Password *']), fPass2]),
    btn,
    el('p', { class: 'login-switch' }, [
      'Sudah punya akun? ',
      el('button', { type: 'button', onclick: () => renderLogin(app, onSuccess) }, ['Masuk di sini'])
    ])
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = fNama.value.trim();
    const username = fUser.value.trim().toLowerCase();
    if (nama.length < 3) { toast('Nama lengkap minimal 3 karakter', 'error'); return; }
    if (!/^[a-z0-9._-]{4,30}$/.test(username)) {
      toast('Username 4–30 karakter (huruf, angka, titik, garis bawah, strip)', 'error');
      return;
    }
    if (fPass.value.length < 6) { toast('Password minimal 6 karakter', 'error'); return; }
    if (fPass.value !== fPass2.value) { toast('Ulangi password belum sama', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Mendaftarkan…';
    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          nama,
          username,
          password: fPass.value,
          nip: fNip.value.trim(),
          unit_kerja: fUnit.value.trim(),
          no_hp: fHp.value.trim()
        }
      });
      setSession(res.token, res.user);
      toast(res.message || 'Pendaftaran berhasil', 'success');
      onSuccess();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Daftar Sekarang';
    }
  });

  app.replaceChildren(form);
}

// ---------- BERANDA ----------
export async function renderHome(app) {
  document.title = 'Beranda — SITARA';
  const u = getUser();
  const container = el('div', { class: 'page' }, [
    el('div', { class: 'greeting' }, [
      el('h2', {}, ['Selamat datang,']),
      el('p', { class: 'greeting-name' }, [u ? u.nama : 'Petugas'])
    ]),
    // Akun pendaftaran mandiri = peminjam: ditegaskan agar tidak mencari menu
    // verifikasi/pengelolaan yang memang tidak menjadi kewenangannya.
    isPeminjam() ? el('div', { class: 'role-note' }, [
      el('span', { class: 'role-note-icon', html: icons.user }),
      el('span', {}, [
        'Akun peminjam — Anda dapat mengajukan peminjaman sendiri dan memantau statusnya. ' +
        'Pengajuan tetap diverifikasi petugas BMN.'
      ])
    ]) : null
  ]);
  app.replaceChildren(container);

  let stats = null;
  try { stats = await getStats(); } catch { stats = null; }

  if (stats && stats.offline) {
    container.appendChild(el('div', { class: 'offline-note' }, [
      el('span', { class: 'offline-note-icon', html: icons.wifiOff }),
      'Menampilkan data tersimpan (mode offline)'
    ]));
  }

  const cards = el('div', { class: 'stat-grid' });
  const items = stats ? [
    { label: 'Total Barang', value: stats.data.totalBarang, cls: 'stat-navy' },
    { label: 'Tersedia', value: stats.data.tersedia, cls: 'stat-green' },
    { label: 'Dipinjam', value: stats.data.dipinjam, cls: 'stat-gold' },
    { label: 'Perbaikan', value: stats.data.perbaikan, cls: 'stat-red' }
  ] : [{ label: 'Total Barang', value: '—', cls: 'stat-navy' }];
  items.forEach((it, i) => {
    const c = el('button', {
      class: `stat-card ${it.cls}`,
      onclick: () => { location.hash = '#/barang'; }
    }, [el('span', { class: 'stat-value' }, [String(it.value)]), el('span', { class: 'stat-label' }, [it.label])]);
    c.style.animationDelay = `${i * 0.06}s`;
    cards.appendChild(c);
  });

  const tindakWrap = el('div', { class: 'card placeholder-card' }, [
    el('p', {}, ['Memuat…'])
  ]);
  const grafikWrap = el('div', { class: 'card placeholder-card' }, [
    el('p', {}, ['Memuat statistik…'])
  ]);
  const recentWrap = el('div', { class: 'card placeholder-card' }, [
    el('p', {}, ['Memuat aktivitas…'])
  ]);
  container.append(
    cards,
    quickActions(),
    el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h3', {}, ['Perlu Ditindaklanjuti'])
      ]),
      tindakWrap
    ]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h3', {}, ['Statistik'])
      ]),
      grafikWrap
    ]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h3', {}, ['Aktivitas Terbaru']),
        el('button', { class: 'section-link', onclick: () => { location.hash = '#/riwayat'; } }, ['Lihat semua →'])
      ]),
      recentWrap
    ]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h3', {}, ['Menu Administrasi'])
      ]),
      el('div', { class: 'admin-links' }, menuAdministrasi())
    ])
  );
  fillTindak(tindakWrap);
  fillGrafik(grafikWrap);
  fillRecent(recentWrap);
}

async function fillGrafik(wrap) {
  try {
    const res = await api('/grafik');
    const { bulanan, kategori } = res.data;
    const card = el('div', { class: 'card' }, [
      el('h4', { class: 'sub-title', style: 'margin-top:0' }, ['Tren Peminjaman (6 bulan)']),
      bulanan.length ? el('div', { class: 'bar-chart' }, bulanan.map((b) => {
        const max = Math.max(...bulanan.map((x) => x.total));
        return el('div', { class: 'bar-col' }, [
          el('span', { class: 'bar-val' }, [String(b.total)]),
          el('div', { class: 'bar-v', style: `height:${Math.max(8, Math.round((b.total / max) * 84))}px` }),
          el('span', { class: 'bar-label' }, [b.bulan.slice(5) + '/' + b.bulan.slice(2, 4)])
        ]);
      })) : el('p', { class: 'picker-empty' }, ['Belum ada data']),
      kategori.length ? el('div', { style: 'margin-top:14px' }, [
        el('h4', { class: 'sub-title' }, ['Kategori Terpopuler']),
        kategori.map((k) => {
          const max = Math.max(...kategori.map((x) => x.jumlah));
          return el('div', { class: 'kat-row' }, [
            el('span', { class: 'kat-label' }, [k.kategori || 'Tanpa kategori']),
            el('div', { class: 'kat-bar' }, [el('div', { class: 'kat-fill', style: `width:${Math.round((k.jumlah / max) * 100)}%` })]),
            el('span', { class: 'kat-n' }, [String(k.jumlah)])
          ]);
        })
      ]) : null
    ]);
    wrap.replaceWith(card);
  } catch {
    wrap.replaceChildren(el('p', {}, ['Statistik tidak tersedia (offline).']));
  }
}

async function fillTindak(wrap) {
  try {
    const res = await api('/tindak-lanjut');
    if (!res.data.length) {
      wrap.classList.add('tl-empty');
      wrap.replaceChildren(el('p', {}, ['Tidak ada keterlambatan — semua pinjaman terkendali ✓']));
      return;
    }
    const list = el('div', { class: 'recent-list' });
    res.data.forEach((t) => {
      list.appendChild(el('button', {
        class: 'recent-item',
        onclick: () => showDetail(t.id, () => {})
      }, [
        el('div', { class: 'barang-info' }, [
          el('strong', {}, [t.pegawai_nama]),
          el('span', { class: 'barang-meta' }, [`${t.no_transaksi} · rencana kembali ${t.tanggal_rencana_kembali}`])
        ]),
        el('span', { class: 'badge badge-dihapus' }, ['Terlambat'])
      ]));
    });
    wrap.replaceWith(list);
  } catch {
    wrap.replaceChildren(el('p', {}, ['Data tindak lanjut tidak tersedia (offline).']));
  }
}

async function fillRecent(wrap) {
  try {
    const res = await api('/peminjaman?limit=4');
    if (!res.data.length) {
      wrap.replaceChildren(el('p', {}, ['Belum ada aktivitas peminjaman.']));
      return;
    }
    const list = el('div', { class: 'recent-list' });
    res.data.forEach((p) => {
      list.appendChild(el('button', { class: 'recent-item', onclick: () => { location.hash = '#/riwayat'; } }, [
        el('div', { class: 'barang-info' }, [
          el('strong', {}, [p.pegawai_nama]),
          el('span', { class: 'barang-meta' }, [`${p.no_transaksi} · ${p.jumlah_item} barang`])
        ]),
        statusBadge(p.status)
      ]));
    });
    wrap.replaceWith(list);
  } catch {
    wrap.replaceChildren(el('p', {}, ['Aktivitas tidak dapat dimuat (offline).']));
  }
}

// ---------- BARANG ----------
export async function renderBarang(app) {
  document.title = 'Katalog Barang — SITARA';
  const listWrap = el('div', { class: 'barang-list' });
  listWrap.appendChild(skeletonList(4));

  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Cari nama, NUP, atau kode barang…',
    class: 'search-input'
  });

  const chips = el('div', { class: 'chip-row' });
  let activeStatus = '';
  [['', 'Semua'], ['Tersedia', 'Tersedia'], ['Dipinjam', 'Dipinjam'], ['Perbaikan', 'Perbaikan']].forEach(([val, label]) => {
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
      if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
      if (activeStatus) params.set('status', activeStatus);
      const res = await api('/barang?' + params.toString());
      listWrap.replaceChildren();
      if (!res.data.length) {
        listWrap.appendChild(emptyState(icons.box, 'Tidak ada barang', 'Coba ubah kata kunci atau filter status.'));
        return;
      }
      res.data.forEach((b, i) => {
        const item = el('button', { class: 'barang-item', onclick: () => toast(`Detail ${b.nama} — Fase 2`, 'info') }, [
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
    el('div', { class: 'search-wrap' }, [searchInput, el('span', { class: 'search-icon', html: icons.search })]),
    chips,
    listWrap
  ]));
  load();
}

// ---------- Aksi Cepat (Beranda) ----------
// Tombol yang memicu pekerjaan master data hanya ditampilkan untuk petugas BMN
// penuh; akun pendaftaran mandiri cukup melihat pengajuan & katalog.
function quickActions() {
  const qa = el('div', { class: 'quick-actions' });
  [
    { icon: icons.history, label: 'Ajukan Pinjam', action: () => { location.hash = '#/ajukan'; } },
    { icon: icons.box, label: 'Tambah Barang', action: () => openForm(null, () => toast('Barang ditambahkan', 'success')), masterSaja: true },
    { icon: icons.user, label: 'Pegawai', action: () => { location.hash = '#/pegawai'; } },
    { icon: icons.scan, label: 'Label QR', action: () => { location.hash = '#/labels'; } }
  ].filter(({ masterSaja }) => !masterSaja || bisaKelolaMaster())
    .forEach(({ icon, label, action }, i) => {
      const b = el('button', { class: 'qa-btn', onclick: action }, [
        el('span', { class: 'qa-icon', html: icon }),
        el('span', { class: 'qa-label' }, [label])
      ]);
      b.style.animationDelay = `${i * 0.06}s`;
      qa.appendChild(b);
    });
  return qa;
}

// Menu Administrasi Beranda — disaring sesuai kewenangan akun supaya tidak
// memunculkan tautan yang akan ditolak server (403).
function menuAdministrasi() {
  return [
    { label: 'Kelola Akun', icon: icons.user, hash: '#/users', tampil: isAdmin() },
    { label: 'Import SIMAK (CSV)', icon: icons.box, hash: '#/import', tampil: bisaKelolaMaster() },
    { label: 'Laporan & Export', icon: icons.home, hash: '#/laporan', tampil: true },
    { label: 'Audit Trail', icon: icons.history, hash: '#/audit', tampil: true }
  ].filter((m) => m.tampil).map((m) => el('button', {
    class: 'admin-link',
    onclick: () => { location.hash = m.hash; }
  }, [
    el('span', { class: 'qa-icon', html: m.icon }),
    el('span', {}, [m.label])
  ]));
}

// (Scanner Barcode kini di pages-scan.js)

// ---------- RIWAYAT ----------
// (Riwayat kini di pages-riwayat.js)

// ---------- PROFIL ----------
function themeLabel() {
  return document.documentElement.dataset.theme === 'dark' ? '☀️ Mode Terang' : '🌙 Mode Gelap';
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = cur;
  localStorage.setItem('sitara-theme', cur);
}

export function renderProfil(app, onLogout, installPrompt) {
  document.title = 'Profil — SITARA';
  const u = getUser();
  const actions = el('div', { class: 'profile-actions' });

  if (installPrompt && installPrompt.canInstall) {
    actions.appendChild(el('button', { class: 'btn btn-navy btn-block', onclick: () => installPrompt.prompt() }, [
      el('span', { class: 'btn-icon', html: icons.download }), 'Pasang Aplikasi (PWA)'
    ]));
  }
  actions.appendChild(el('button', { class: 'btn btn-ghost btn-block', onclick: () => { toggleTheme(); actions.querySelector('#theme-btn').textContent = themeLabel(); } , id: 'theme-btn' }, [themeLabel()]));

  const syncCard = el('div', { class: 'card' });
  fillSync(syncCard);

  const blocks = [
    el('div', { class: 'profile-card' }, [
      el('div', { class: 'profile-avatar' }, [u ? u.nama.charAt(0).toUpperCase() : '?']),
      el('h2', {}, [u ? u.nama : '—']),
      el('span', { class: `badge ${u && !u.daftar_mandiri ? 'badge-disetujui' : 'badge-diajukan'}` }, [
        u ? (u.role === 'admin' ? 'Administrator' : (u.daftar_mandiri ? 'Peminjam (Akun Mandiri)' : 'Petugas BMN')) : ''
      ]),
      el('p', { class: 'profile-username' }, [u ? '@' + u.username : ''])
    ]),
    actions,
    el('h4', { class: 'sub-title' }, ['Sinkronisasi Offline']),
    syncCard
  ];

  if (u && u.role === 'admin') {
    const fileInput = el('input', { type: 'file', accept: '.db,application/octet-stream', style: 'display:none' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const res = await api('/admin/db/import', { method: 'POST', body: { dataUrl } });
        toast(res.message, 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
    blocks.push(
      el('h4', { class: 'sub-title' }, ['Database (Admin)']),
      el('div', { class: 'card' }, [
        el('p', { class: 'page-desc', style: 'margin-bottom:10px' }, ['Backup berisi seluruh data. Restore akan menggantikan database saat server di-restart (data lama dibackup otomatis).']),
        el('div', { class: 'sheet-actions', style: 'margin-top:0' }, [
          el('button', {
            class: 'btn btn-navy',
            onclick: () => downloadFile('/admin/db/export', 'sitara-backup-' + new Date().toISOString().slice(0, 10) + '.db')
              .then(() => toast('Backup database diunduh', 'success')).catch((e) => toast(e.message, 'error'))
          }, ['⬇ Backup (.db)']),
          el('button', { class: 'btn btn-ghost', onclick: () => fileInput.click() }, ['⇧ Restore'])
        ]),
        fileInput
      ])
    );
  }

  actions.appendChild(el('button', {
    class: 'btn btn-danger btn-block',
    onclick: () => { clearSession(); onLogout(); }
  }, [el('span', { class: 'btn-icon', html: icons.logout }), 'Keluar']));

  blocks.push(
    el('div', { class: 'about-card', style: 'margin-top:14px' }, [
      el('div', { class: 'about-emblem', html: emblemSVG(36) }),
      el('div', {}, [
        el('strong', {}, ['SITARA v1.8.0 — Fase 7']),
        el('p', {}, ['Sistem Tata Kelola Aset Rutan · BMN Rutan Klas I Samarinda'])
      ])
    ])
  );

  app.replaceChildren(el('div', { class: 'page' }, blocks));
}

async function fillSync(wrap) {
  const n = await queueCount();
  wrap.replaceChildren(
    el('div', { class: 'detail-top', style: 'margin-bottom:10px' }, [
      el('strong', { class: 'detail-name', style: 'font-size:0.88rem' }, ['Perubahan offline menunggu sinkron']),
      el('span', { class: `badge ${n ? 'badge-dipinjam' : 'badge-tersedia'}` }, [n ? `${n} antre` : 'Tersinkron ✓'])
    ]),
    el('button', {
      class: 'btn btn-ghost btn-sm btn-block',
      onclick: async () => { await flushQueue(); fillSync(wrap); }
    }, ['Sinkronkan Sekarang'])
  );
}
