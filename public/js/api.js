// SITARA — API client: fetch + token + penanganan offline + antrean sinkronisasi
import { idb } from './idb.js';
import { toast } from './ui.js';

let token = localStorage.getItem('sitara-token') || '';
let user = null;
try {
  user = JSON.parse(localStorage.getItem('sitara-user') || 'null');
} catch { user = null; }

export function getToken() { return token; }
export function getUser() { return user; }

// ---------- Peran pengguna ----------
// Akun pendaftaran mandiri (dibuat sendiri pegawai di halaman Masuk) hanya boleh
// mengajukan peminjaman dan membaca data. Verifikasi pengajuan serta perubahan
// master data ditolak oleh server (403), sehingga menu terkait disembunyikan.
export function isPeminjam() { return !!(user && user.daftar_mandiri); }
export function isAdmin() { return !!(user && user.role === 'admin'); }
export function bisaKelolaMaster() { return !!user && !user.daftar_mandiri; }

export function setSession(t, u) {
  token = t;
  user = u;
  localStorage.setItem('sitara-token', t);
  localStorage.setItem('sitara-user', JSON.stringify(u));
}

export function clearSession() {
  token = '';
  user = null;
  localStorage.removeItem('sitara-token');
  localStorage.removeItem('sitara-user');
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, silent = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    // Offline: simpan perubahan ke antrean sinkronisasi (kecuali pembacaan)
    if (method !== 'GET' && token && !path.includes('/auth/')) {
      try {
        await idb.add('syncQueue', { method, path, body, waktu: Date.now() });
        throw new ApiError(0, 'Tidak ada koneksi — perubahan disimpan & akan tersinkron otomatis');
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(0, 'Tidak ada koneksi ke server');
      }
    }
    throw new ApiError(0, 'Tidak ada koneksi ke server');
  }

  let data = {};
  try { data = await res.json(); } catch { /* body kosong */ }

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearSession();
      location.hash = '#/login';
    }
    throw new ApiError(res.status, data.error || `Kesalahan ${res.status}`);
  }
  return data;
}

// ---------- Antrean sinkronisasi offline ----------
let flushing = false;

export async function queueCount() {
  try { return ((await idb.all('syncQueue')) || []).length; } catch { return 0; }
}

export async function flushQueue() {
  if (flushing || !navigator.onLine || !getToken()) return 0;
  flushing = true;
  let synced = 0;
  try {
    const items = (await idb.all('syncQueue')) || [];
    for (const item of items) {
      try {
        const res = await fetch('/api' + item.path, {
          method: item.method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: item.body === undefined ? undefined : JSON.stringify(item.body)
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          // Berhasil, atau ditolak server secara permanen (409 dll) → buang dari antrean
          await idb.del('syncQueue', item.id);
          if (res.ok) synced++;
        } else {
          break; // galat server sementara — coba lagi nanti
        }
      } catch {
        break; // masih offline
      }
    }
  } finally {
    flushing = false;
  }
  if (synced > 0) {
    toast(`${synced} perubahan offline berhasil tersinkron`, 'success');
  }
  return synced;
}

// Statistik dashboard: coba online, fallback cache offline
export async function getStats() {
  try {
    const res = await api('/stats');
    await idb.set('kv', 'stats', res);
    return { ...res, offline: false };
  } catch {
    const cached = await idb.get('kv', 'stats');
    if (cached) return { ...cached, offline: true };
    throw new ApiError(0, 'Data belum tersedia offline');
  }
}

// Unduh berkas yang butuh token (mis. Berita Acara PDF, CSV laporan)
export async function downloadFile(path, filename) {
  const res = await fetch('/api' + path, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!res.ok) {
    let msg = `Gagal mengunduh (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'unduhan';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
