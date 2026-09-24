// SITARA — Generator & cetak label QR barang (vendor lokal: qrcode-generator)
import { el, toast } from './ui.js';
import { api } from './api.js';
import { loadScript } from './scan.js';
import { icons, emptyState, skeletonList } from './ui.js';

async function ensureQrLib() {
  await loadScript('/vendor/qrcode.js');
  if (typeof window.qrcode !== 'function') throw new Error('Library QR tidak tersedia');
}

export function qrSvg(code) {
  const qr = window.qrcode(0, 'M');
  qr.addData(String(code));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
}

export function labelNode(b) {
  const code = b.barcode || b.nup || b.kode_barang;
  return el('div', { class: 'label-card' }, [
    el('div', { class: 'label-head' }, [
      el('strong', {}, ['SITARA']),
      el('span', {}, ['BMN · Rutan Klas I Samarinda'])
    ]),
    el('div', { class: 'label-qr', html: qrSvg(code) }),
    el('div', { class: 'label-info' }, [
      el('strong', { class: 'label-name' }, [b.nama]),
      el('span', {}, [`NUP ${b.nup || '—'}`]),
      el('span', {}, [b.kode_barang || '']),
      b.ruang ? el('span', {}, [b.ruang]) : null
    ])
  ]);
}

export async function printLabels(list) {
  try {
    await ensureQrLib();
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const area = document.getElementById('print-area') || document.body.appendChild(el('div', { id: 'print-area' }));
  area.replaceChildren(...list.map(labelNode));
  setTimeout(() => window.print(), 60);
}

export async function renderLabels(app) {
  document.title = 'Label QR Barang — SITARA';
  const listWrap = el('div', { class: 'label-select-list' });
  listWrap.appendChild(skeletonList(4));
  let selected = new Set();
  let barang = [];

  const printBtn = el('button', {
    class: 'btn btn-gold btn-block',
    disabled: '',
    onclick: async () => {
      const items = barang.filter((b) => selected.has(b.id));
      if (!items.length) return;
      toast('Menyiapkan label untuk dicetak…', 'info');
      await printLabels(items);
    }
  }, ['Cetak Label Terpilih']);

  function refresh() {
    printBtn.disabled = selected.size === 0;
    printBtn.textContent = selected.size ? `Cetak ${selected.size} Label Terpilih` : 'Pilih barang untuk dicetak';
  }

  try {
    const res = await api('/barang?limit=100');
    barang = res.data;
    listWrap.replaceChildren();
    if (!barang.length) {
      listWrap.appendChild(emptyState(icons.box, 'Belum ada barang', 'Tambahkan barang terlebih dahulu untuk membuat label.'));
    }
    barang.forEach((b) => {
      const cb = el('input', { type: 'checkbox', class: 'label-check' });
      cb.addEventListener('change', () => {
        cb.checked ? selected.add(b.id) : selected.delete(b.id);
        row.classList.toggle('label-row-on', cb.checked);
        refresh();
      });
      const row = el('label', { class: 'label-row' }, [
        cb,
        el('div', { class: 'barang-info' }, [
          el('strong', {}, [b.nama]),
          el('span', { class: 'barang-meta' }, [b.nup ? `NUP ${b.nup}` : b.kode_barang])
        ]),
        el('button', {
          class: 'btn btn-ghost btn-sm',
          onclick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await printLabels([b]);
          }
        }, ['Cetak 1'])
      ]);
      listWrap.appendChild(row);
    });
  } catch (err) {
    listWrap.replaceChildren(emptyState(icons.wifiOff, 'Gagal memuat', err.message));
  }

  app.replaceChildren(el('div', { class: 'page' }, [
    el('h2', { class: 'page-title' }, ['Label QR Barang']),
    el('p', { class: 'page-desc' }, ['Tempel label QR pada barang. QR berisi NUP — bisa discan dengan SITARA maupun kamera HP biasa (berguna saat inspeksi).']),
    printBtn,
    listWrap
  ]));
  refresh();
}
