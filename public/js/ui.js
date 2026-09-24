// SITARA — Utilitas UI: DOM builder, ikon, toast, format
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.5 8.5 12 13l8.5-4.5"/><path d="M12 13v8"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3.5 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 13 0"/><path d="M9 16.2a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9z"/><path d="M15 5h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>'
};

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: `toast toast-${type}` }, [message]);
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 2800);
}

const BADGE_MAP = {
  'Tersedia': 'badge-tersedia',
  'Dipinjam': 'badge-dipinjam',
  'Perbaikan': 'badge-perbaikan',
  'Dihapus': 'badge-dihapus',
  'Baik': 'badge-tersedia',
  'Rusak Ringan': 'badge-perbaikan',
  'Rusak Berat': 'badge-dihapus',
  'Hilang': 'badge-dihapus',
  'Diajukan': 'badge-diajukan',
  'Disetujui': 'badge-disetujui',
  'Diserahkan': 'badge-dipinjam',
  'Dikembalikan': 'badge-tersedia',
  'Ditolak': 'badge-dihapus'
};

export function statusBadge(status) {
  const cls = BADGE_MAP[status] || 'badge-diajukan';
  return el('span', { class: `badge ${cls}` }, [status]);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRupiah(n) {
  if (n === null || n === undefined) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function emptyState(icon, title, desc) {
  return el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-icon', html: icon }),
    el('h3', {}, [title]),
    el('p', {}, [desc])
  ]);
}

export function skeletonList(n = 3) {
  const wrap = el('div', { class: 'skeleton-list' });
  for (let i = 0; i < n; i++) wrap.appendChild(el('div', { class: 'skeleton-item' }));
  return wrap;
}

// ---------- Bottom Sheet / Modal ----------
export function openSheet(content, { title, onClose } = {}) {
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const sheet = el('div', { class: 'sheet', role: 'dialog' }, [
    el('div', { class: 'sheet-grab' }),
    el('div', { class: 'sheet-head' }, [
      el('h3', {}, [title || '']),
      el('button', { class: 'sheet-close', 'aria-label': 'Tutup', onclick: () => close() }, ['✕'])
    ]),
    el('div', { class: 'sheet-body' }, [content])
  ]);
  function close() {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => { sheet.remove(); backdrop.remove(); onClose?.(); }, 220);
  }
  backdrop.addEventListener('click', close);
  document.body.append(backdrop, sheet);
  requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); });
  return { close };
}

export function confirmDialog(message, onYes, { yesLabel = 'Hapus' } = {}) {
  const box = el('div', { class: 'confirm-box' }, [
    el('p', {}, [message]),
    el('div', { class: 'confirm-actions' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => c.close() }, ['Batal']),
      el('button', {
        class: 'btn btn-danger-solid',
        onclick: () => { c.close(); onYes(); }
      }, [yesLabel])
    ])
  ]);
  const c = openSheet(box, { title: 'Konfirmasi' });
  return c;
}
