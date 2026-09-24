// SITARA — Router aplikasi + shell (header, bottom nav, status koneksi)
import { el, icons, toast } from './ui.js';
import { getToken, getUser, clearSession, flushQueue, isAdmin } from './api.js';
import { renderLogin, renderHome, renderProfil, emblemSVG } from './pages.js';
import { renderSambutan, renderAjukanTamu } from './pages-sambutan.js';
import { renderBarang } from './pages-barang.js';
import { renderPegawai } from './pages-pegawai.js';
import { renderScan } from './pages-scan.js';
import { renderLabels } from './pages-labels.js';
import { renderAjukan } from './pages-ajukan.js';
import { renderRiwayat } from './pages-riwayat.js';
import { renderImport } from './pages-import.js';
import { renderLaporan, renderAudit } from './pages-laporan.js';
import { renderUsers } from './pages-users.js';

const appEl = document.getElementById('app');

// ---------- Install prompt (PWA) ----------
const installPrompt = { canInstall: false, deferred: null, prompt() {
  if (!this.deferred) return;
  this.deferred.prompt();
  this.deferred.userChoice.finally(() => { this.deferred = null; this.canInstall = false; render(); });
} };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt.deferred = e;
  installPrompt.canInstall = true;
  if (currentRoute === 'profil') render();
});

// ---------- Status koneksi ----------
let online = navigator.onLine;
const connPill = el('span', { class: 'conn-pill' });
function updateConn() {
  online = navigator.onLine;
  connPill.className = `conn-pill ${online ? 'conn-online' : 'conn-offline'}`;
  connPill.textContent = online ? 'Online' : 'Offline';
}
window.addEventListener('online', () => { updateConn(); toast('Kembali online', 'success'); flushQueue().then(() => { if (currentRoute) render(); }); });
window.addEventListener('offline', () => { updateConn(); toast('Mode offline — data tetap tersimpan', 'info'); });

// ---------- Routes ----------
const routes = {
  'beranda': { title: 'Beranda', icon: icons.home, render: renderHome },
  'barang': { title: 'Barang', icon: icons.box, render: renderBarang },
  'pegawai': { title: 'Pegawai', icon: icons.user, render: renderPegawai, hidden: true },
  'labels': { title: 'Label QR', icon: icons.scan, render: renderLabels, hidden: true },
  'ajukan': { title: 'Ajukan', icon: icons.history, render: renderAjukan, hidden: true },
  'import': { title: 'Import SIMAK', icon: icons.box, render: renderImport, hidden: true },
  'laporan': { title: 'Laporan', icon: icons.home, render: renderLaporan, hidden: true },
  'audit': { title: 'Audit Trail', icon: icons.history, render: renderAudit, hidden: true },
  'users': { title: 'Kelola Akun', icon: icons.user, render: renderUsers, hidden: true, adminSaja: true },
  'scan': { title: 'Scan', icon: icons.scan, render: renderScan },
  'riwayat': { title: 'Riwayat', icon: icons.history, render: renderRiwayat },
  'profil': { title: 'Profil', icon: icons.user, render: (a) => renderProfil(a, () => { location.hash = '#/beranda'; setTimeout(() => { clearSession(); location.hash = '#/login'; render(); }, 0); }, installPrompt) }
};
let currentRoute = '';

function bottomNav() {
  const nav = el('nav', { class: 'bottom-nav' });
  const order = ['beranda', 'barang', 'scan', 'riwayat', 'profil'];
  for (const key of order) {
    const r = routes[key];
    const isScan = key === 'scan';
    nav.appendChild(el('button', {
      class: `nav-item ${isScan ? 'nav-scan' : ''} ${currentRoute === key ? 'nav-active' : ''}`,
      'data-route': key,
      onclick: () => { location.hash = '#/' + key; }
    }, [
      isScan ? el('span', { class: 'nav-fab', html: r.icon }) : el('span', { class: 'nav-icon', html: r.icon }),
      el('span', { class: 'nav-label' }, [r.title])
    ]));
  }
  return nav;
}

function appHeader() {
  return el('header', { class: 'app-header' }, [
    el('div', { class: 'header-brand' }, [
      el('span', { class: 'header-emblem', html: emblemSVG(30) }),
      el('div', {}, [
        el('strong', { class: 'header-title' }, ['SITARA']),
        el('span', { class: 'header-sub' }, ['Tata Kelola Aset Rutan'])
      ])
    ]),
    connPill
  ]);
}

function render() {
  const hash = (location.hash || '#/beranda').replace(/^#\//, '') || 'beranda';
  currentRoute = routes[hash] ? hash : 'beranda';

  // Tamu (belum masuk): layar sambutan · formulir masuk · pengajuan tanpa akun
  if (!getToken()) {
    document.getElementById('header-root')?.remove();
    document.getElementById('nav-root')?.remove();
    if (hash === 'login') renderLogin(appEl, () => { location.hash = '#/beranda'; });
    else if (hash === 'ajukan-tamu') renderAjukanTamu(appEl);
    else renderSambutan(appEl);
    return;
  }
  if (hash === 'login' || hash === 'sambutan' || hash === 'ajukan-tamu') { location.hash = '#/beranda'; return; }

  // Validasi sesi ringan
  const u = getUser();
  if (!u) { clearSession(); location.hash = '#/login'; return; }

  // Halaman khusus admin (mis. Kelola Akun) tidak dirender untuk peran lain.
  if (routes[currentRoute].adminSaja && !isAdmin()) {
    toast('Hanya administrator yang dapat mengakses Kelola Akun', 'error');
    location.hash = '#/beranda';
    return;
  }

  let header = document.getElementById('header-root');
  let nav = document.getElementById('nav-root');
  if (!header) {
    header = el('div', { id: 'header-root' });
    nav = el('div', { id: 'nav-root' });
    document.body.prepend(header, nav);
  }
  header.replaceChildren(appHeader());
  nav.replaceChildren(bottomNav());
  updateConn();

  Promise.resolve(routes[currentRoute].render(appEl)).catch((err) => console.error('[SITARA] Render error:', err));
}

window.addEventListener('hashchange', render);

// ---------- Boot ----------
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash-hide');
  setTimeout(() => splash.remove(), 450);
}

// Tampilan darurat bila boot gagal (mis. ada modul/kode bermasalah):
// pengguna melihat pesan + tombol "Muat ulang", bukan splash yang menggantung.
function showBootError(err) {
  const pesan = String((err && err.message) || err || 'Kesalahan tidak diketahui');
  const header = document.getElementById('header-root');
  const nav = document.getElementById('nav-root');
  if (header) header.remove();
  if (nav) nav.remove();
  if (!appEl) return;
  appEl.replaceChildren(
    el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-icon', html: icons.alert }),
      el('h3', {}, ['Aplikasi gagal dimuat']),
      el('p', {}, [pesan]),
      el('button',
        { class: 'btn btn-navy btn-block', style: 'margin-top:16px', onclick: () => location.reload() },
        ['Muat ulang'])
    ])
  );
}

function boot() {
  try {
    // Tema (dark mode)
    document.documentElement.dataset.theme = localStorage.getItem('sitara-theme') || 'light';

    // Tampilkan aplikasi lebih dulu: splash hanya bertahan sampai render pertama,
    // jadi tidak ada lagi jeda 700 ms yang membuat pembukaan terasa lambat.
    render();
  } catch (err) {
    console.error('[SITARA] Boot error:', err);
    showBootError(err);
  }
  // Splash selalu dihilangkan, apa pun hasilnya — tidak boleh menggantung.
  requestAnimationFrame(hideSplash);

  // Service worker didaftarkan di latar belakang (tidak menahan tampilan)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* dev/HTTP: abaikan */ });
  }

  // Sinkronkan perubahan offline yang tertunda
  flushQueue()
    .then((n) => { if (n > 0) render(); })
    .catch(() => { /* offline / server mati: abaikan */ });
}

updateConn();
boot();
