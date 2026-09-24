// SITARA — Halaman Kelola Akun (multi-user, khusus admin)
import { el, icons, toast, debounce, emptyState, skeletonList, openSheet, confirmDialog } from './ui.js';
import { api, getUser } from './api.js';

const ROLE_LABEL = { admin: 'Administrator', petugas: 'Petugas BMN' };

export async function renderUsers(app) {
  document.title = 'Kelola Akun — SITARA';
  const me = getUser();
  const listWrap = el('div', { class: 'barang-list' });
  listWrap.appendChild(skeletonList(3));

  const addBtn = el('button', { class: 'btn-add', onclick: () => openForm(null, load) }, ['＋ Akun Baru']);

  async function load() {
    listWrap.replaceChildren(skeletonList(3));
    try {
      const res = await api('/users');
      listWrap.replaceChildren();
      res.data.forEach((u, i) => {
        const isMe = me && u.id === me.id;
        const item = el('button', { class: 'barang-item', onclick: () => showDetail(u, load) }, [
          el('div', { class: 'barang-info' }, [
            el('strong', {}, [u.nama + (isMe ? ' (Anda)' : '')]),
            el('span', { class: 'barang-meta' }, [`@${u.username} · dibuat ${u.created_at}`]),
            u.daftar_mandiri
              ? el('span', { class: 'barang-meta' }, [
                  u.pegawai_nip ? `NIP ${u.pegawai_nip}` : 'Tanpa NIP',
                  u.pegawai_unit ? ` · ${u.pegawai_unit}` : ''
                ])
              : null
          ]),
          el('div', { class: 'barang-side' }, [
            u.daftar_mandiri ? el('span', { class: 'badge badge-tersedia' }, ['Mandiri']) : null,
            el('span', { class: `badge ${u.role === 'admin' ? 'badge-disetujui' : 'badge-diajukan'}` }, [ROLE_LABEL[u.role] || u.role]),
            u.aktif ? null : el('span', { class: 'badge badge-dihapus' }, ['Nonaktif'])
          ])
        ]);
        item.style.animationDelay = `${Math.min(i, 8) * 0.04}s`;
        listWrap.appendChild(item);
      });
    } catch (err) {
      listWrap.replaceChildren(emptyState(icons.wifiOff, 'Gagal memuat', err.message));
    }
  }

  app.replaceChildren(el('div', { class: 'page' }, [
    el('div', { class: 'page-head-row' }, [
      el('h2', { class: 'page-title', style: 'margin:0' }, ['Kelola Akun']),
      addBtn
    ]),
    listWrap
  ]));
  load();
}

function showDetail(u, onChanged) {
  // Tindak lanjut cepat untuk akun hasil pendaftaran mandiri: aktif/nonaktif.
  const toggleBtn = el('button', {
    class: u.aktif ? 'btn btn-danger' : 'btn btn-navy',
    onclick: () => confirmDialog(
      u.aktif
        ? `Nonaktifkan akun "${u.username}"? Pegawai tidak dapat masuk lagi sampai diaktifkan kembali.`
        : `Aktifkan kembali akun "${u.username}"?`,
      async () => {
        try {
          const res = await api('/users/' + u.id, { method: 'PUT', body: { aktif: u.aktif ? 0 : 1 } });
          toast(res.message, 'success');
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      },
      { yesLabel: u.aktif ? 'Ya, nonaktifkan' : 'Ya, aktifkan' }
    )
  }, [u.aktif ? 'Nonaktifkan Akun' : 'Aktifkan Akun']);

  // Atur kewenangan: akun pendaftaran mandiri hanya boleh mengajukan & memantau.
  const izinBtn = el('button', {
    class: 'btn btn-ghost',
    onclick: () => confirmDialog(
      u.daftar_mandiri
        ? `Jadikan "${u.username}" petugas BMN penuh? Ia dapat memverifikasi pengajuan dan mengubah master data.`
        : `Batasi "${u.username}" menjadi peminjam saja (hanya mengajukan & memantau)?`,
      async () => {
        try {
          const res = await api('/users/' + u.id, {
            method: 'PUT',
            body: { daftar_mandiri: u.daftar_mandiri ? 0 : 1 }
          });
          toast(res.message, 'success');
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      },
      { yesLabel: u.daftar_mandiri ? 'Ya, jadikan penuh' : 'Ya, batasi' }
    )
  }, [u.daftar_mandiri ? 'Jadikan Petugas Penuh' : 'Batasi (Peminjam Saja)']);

  const actions = el('div', { class: 'sheet-actions' }, [
    el('button', { class: 'btn btn-gold', onclick: () => openForm(u, onChanged) }, ['Edit / Reset Password']),
    toggleBtn,
    u.role === 'petugas' ? izinBtn : null,
    el('button', {
      class: 'btn btn-danger-solid',
      onclick: () => confirmDialog(`Hapus akun "${u.username}"?`, async () => {
        try {
          const res = await api('/users/' + u.id, { method: 'DELETE' });
          toast(res.message, 'success');
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      })
    }, ['Hapus'])
  ]);

  openSheet(el('div', {}, [
    el('div', { class: 'detail-top' }, [
      el('strong', { class: 'detail-name' }, [u.nama]),
      el('span', { class: `badge ${u.role === 'admin' ? 'badge-disetujui' : 'badge-diajukan'}` }, [ROLE_LABEL[u.role]])
    ]),
    el('div', { class: 'info-grid' }, [
      el('span', { class: 'info-key' }, ['Username']),
      el('span', { class: 'info-val' }, ['@' + u.username]),
      el('span', { class: 'info-key' }, ['Sumber Akun']),
      el('span', { class: 'info-val' }, [u.daftar_mandiri ? 'Pendaftaran mandiri' : 'Dibuat admin']),
      el('span', { class: 'info-key' }, ['NIP']),
      el('span', { class: 'info-val' }, [u.pegawai_nip || '—']),
      el('span', { class: 'info-key' }, ['Unit Kerja']),
      el('span', { class: 'info-val' }, [u.pegawai_unit || '—']),
      el('span', { class: 'info-key' }, ['No. HP']),
      el('span', { class: 'info-val' }, [u.no_hp || '—']),
      el('span', { class: 'info-key' }, ['Status']),
      el('span', { class: 'info-val' }, [u.aktif ? 'Aktif' : 'Nonaktif']),
      el('span', { class: 'info-key' }, ['Dibuat']),
      el('span', { class: 'info-val' }, [u.created_at || '—'])
    ]),
    actions
  ]), { title: 'Detail Akun' });
}

function openForm(existing, onSaved) {
  const u = existing || {};
  const isEdit = !!existing;
  const fNama = el('input', { type: 'text', value: u.nama ?? '', placeholder: 'Nama lengkap' });
  const fUser = el('input', { type: 'text', value: u.username ?? '', placeholder: 'Username unik', autocomplete: 'off' });
  const fRole = el('select', { class: 'select-light' }, [
    el('option', { value: 'petugas', selected: u.role !== 'admin' }, ['Petugas BMN']),
    el('option', { value: 'admin', selected: u.role === 'admin' }, ['Administrator'])
  ]);
  const fPass = el('input', { type: 'password', placeholder: isEdit ? 'Kosongkan bila tidak diubah (min. 6)' : 'Password (min. 6)' });
  const fAktif = el('select', { class: 'select-light' }, [
    el('option', { value: '1', selected: u.aktif !== 0 }, ['Aktif']),
    el('option', { value: '0', selected: u.aktif === 0 }, ['Nonaktif'])
  ]);

  const form = el('form', { class: 'form-light' }, [
    el('div', { class: 'field-light' }, [el('label', {}, ['Nama Lengkap *']), fNama]),
    el('div', { class: 'field-light' }, [el('label', {}, ['Username *']), fUser]),
    el('div', { class: 'field-light' }, [el('label', {}, ['Peran']), fRole]),
    el('div', { class: 'field-light' }, [el('label', {}, ['Password' + (isEdit ? '' : ' *')]), fPass]),
    isEdit ? el('div', { class: 'field-light' }, [el('label', {}, ['Status Akun']), fAktif]) : null,
    el('button', { class: 'btn btn-gold btn-block', type: 'submit' }, [isEdit ? 'Simpan Perubahan' : 'Buat Akun'])
  ].filter(Boolean));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fNama.value.trim() || !fUser.value.trim()) { toast('Nama dan username wajib diisi', 'error'); return; }
    if (!isEdit && fPass.value.length < 6) { toast('Password minimal 6 karakter', 'error'); return; }
    try {
      const res = isEdit
        ? await api('/users/' + existing.id, {
            method: 'PUT',
            body: {
              nama: fNama.value.trim(),
              role: fRole.value,
              aktif: Number(fAktif.value),
              password: fPass.value || undefined
            }
          })
        : await api('/users', {
            method: 'POST',
            body: { nama: fNama.value.trim(), username: fUser.value.trim(), role: fRole.value, password: fPass.value }
          });
      toast(res.message, 'success');
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  });

  openSheet(form, { title: isEdit ? 'Edit Akun — @' + existing.username : 'Akun Baru' });
}
