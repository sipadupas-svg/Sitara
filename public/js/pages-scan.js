// SITARA — Halaman Scan: kamera barcode/QR + input manual
import { el, icons, toast, statusBadge, openSheet } from './ui.js';
import { createScanner, lookupScan } from './scan.js';
import { showDetail, openForm } from './pages-barang.js';
import { fmtRupiah } from './ui.js';
import { bisaKelolaMaster } from './api.js';

export async function renderScan(app) {
  document.title = 'Scan Barcode — SITARA';

  const video = el('video', { class: 'scan-video', playsinline: '', muted: '', autoplay: '' });
  const status = el('p', { class: 'scan-status' }, ['Scanner siap. Tekan "Mulai Scan" dan arahkan kamera ke barcode/QR barang.']);
  const startBtn = el('button', { class: 'btn btn-gold btn-block' }, ['Mulai Scan']);
  let scanner = null;

  const manualInput = el('input', { type: 'text', class: 'search-input', placeholder: 'Atau ketik NUP / kode di sini…' });
  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && manualInput.value.trim()) {
      e.preventDefault();
      handleCode(manualInput.value.trim());
      manualInput.value = '';
    }
  });

  startBtn.addEventListener('click', async () => {
    if (scanner) { scanner.stop(); scanner = null; startBtn.textContent = 'Mulai Scan'; status.textContent = 'Scanner dihentikan.'; return; }
    startBtn.disabled = true;
    startBtn.textContent = 'Menyiapkan kamera…';
    status.textContent = 'Kamera aktif — arahkan ke barcode/QR barang…';
    video.classList.add('scan-video-on');
    scanner = await createScanner(video, handleCode, (msg) => {
      status.textContent = msg;
      scanner = null;
      video.classList.remove('scan-video-on');
      startBtn.textContent = 'Mulai Scan';
      startBtn.disabled = false;
    });
    if (scanner) {
      startBtn.disabled = false;
      startBtn.textContent = 'Berhenti';
    } else {
      video.classList.remove('scan-video-on');
      startBtn.disabled = false;
      startBtn.textContent = 'Mulai Scan';
    }
  });

  app.replaceChildren(el('div', { class: 'page page-center' }, [
    el('div', { class: 'scan-frame' }, [
      el('div', { class: 'scan-corner tl' }), el('div', { class: 'scan-corner tr' }),
      el('div', { class: 'scan-corner bl' }), el('div', { class: 'scan-corner br' }),
      el('div', { class: 'scan-line' }),
      video
    ]),
    startBtn,
    status,
    el('div', { class: 'scan-manual' }, [
      el('label', {}, ['Input manual']),
      manualInput
    ])
  ]));

  // Cleanup saat pindah halaman
  const obs = new MutationObserver(() => {
    if (!document.body.contains(video)) {
      scanner?.stop();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

export async function handleCode(code) {
  let res;
  try {
    res = await lookupScan(code);
  } catch (err) {
    // Tidak ditemukan → tawarkan tambah barang dengan NUP terisi (khusus petugas
    // BMN penuh; akun peminjam hanya diberi tahu barang tidak terdaftar).
    const content = el('div', {}, [
      el('p', { class: 'scan-notfound' }, [`Barang dengan kode "${code}" tidak ditemukan.`]),
      bisaKelolaMaster() ? null : el('p', { class: 'page-desc' }, [
        'Barang belum terdaftar di SITARA. Hubungi petugas BMN untuk pendataannya.'
      ]),
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => sheet.close() }, ['Tutup']),
        bisaKelolaMaster() ? el('button', {
          class: 'btn btn-gold',
          onclick: () => { sheet.close(); openForm(null, () => toast('Barang ditambahkan', 'success'), { nup: code, barcode: code }); }
        }, ['Tambah Barang']) : null
      ])
    ]);
    const sheet = openSheet(content, { title: 'Tidak Ditemukan' });
    return;
  }
  const b = res.data;
  const content = el('div', {}, [
    el('div', { class: 'detail-top' }, [
      el('strong', { class: 'detail-name' }, [b.nama]),
      el('div', { class: 'detail-badges' }, [statusBadge(b.status), statusBadge(b.kondisi)])
    ]),
    el('div', { class: 'scan-result-meta' }, [
      el('span', {}, [b.merk ? `${b.merk} ${b.tipe || ''}` : (b.tipe || '—')]),
      el('span', {}, [`NUP ${b.nup || '—'} · ${b.ruang || 'Lokasi —'}`]),
      b.nilai_perolehan ? el('span', {}, [fmtRupiah(b.nilai_perolehan)]) : null
    ]),
    el('div', { class: 'sheet-actions' }, [
      el('button', { class: 'btn btn-gold', onclick: () => { sheet.close(); showDetail(b); } }, ['Detail Lengkap']),
      el('button', { class: 'btn btn-ghost', onclick: () => sheet.close() }, ['Tutup'])
    ])
  ]);
  const sheet = openSheet(content, { title: 'Barang Ditemukan ✓' });
}
