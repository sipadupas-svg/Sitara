# 🏛️ SITARA — Sistem Tata Kelola Aset Rutan

Aplikasi Web (PWA) untuk pengelolaan **Peminjaman Barang BMN** di lingkungan
**Rutan Klas I Samarinda**. Mobile-first, ringan, dan tetap berfungsi penuh
saat offline.

## ✨ Fitur (Roadmap 6 Fase)

| Fase | Fitur | Status |
|------|-------|--------|
| 1 | Kerangka PWA + desain navy/gold + navigasi + skema SQLite + API dasar | ✅ |
| 2 | CRUD Barang & Pegawai + scanner barcode + generator label | ✅ |
| 3 | Alur peminjaman → approval → pengembalian + dokumentasi foto | ✅ |
| 4 | Berita Acara otomatis (PDF) + Import SIMAK + laporan + audit trail | ✅ |
| 5 | Multi-user + dashboard statistik + export/import DB + dark mode | ✅ |
| 6 | Pendaftaran mandiri pegawai (peminjam) + pemantauan & pengaturan kewenangan akun | ✅ |
| 7 | Layar sambutan (welcome) + pengajuan pinjaman tanpa akun untuk pegawai peminjam | ✅ |

## 🚀 Cara Menjalankan

```bash
npm start
```

Buka `http://localhost:3000` di browser (atau dari HP di jaringan LAN yang sama:
`http://<IP-KOMPUTER>:3000`).

**Tanpa dependensi npm** — backend memakai modul bawaan Node.js
(`node:sqlite`, `node:http`, `node:crypto`). Cukup Node.js ≥ 22.5.

> **Font sudah dibundel** (self-host di `public/fonts`) sehingga aplikasi tidak
> lagi menghubungi `fonts.googleapis.com` — penting karena jaringan Rutan umumnya
> hanya LAN. Bila ingin memperbarui font, jalankan `npm run fetch-fonts` (butuh
> internet sekali saja).

## 🔑 Akun Default

| Username | Password | Peran |
|----------|----------|-------|
| `admin` | `admin123` | Admin |

> ⚠️ Segera ganti password default setelah instalasi.

Pegawai yang ingin meminjam barang **tidak perlu lagi meminta akun ke petugas
BMN** — ia dapat mendaftar sendiri dari halaman Masuk (lihat
[Pendaftaran Mandiri Pegawai](#-pendaftaran-mandiri-pegawai-v170)).

## 🎨 Identitas Visual

- **Navy** `#0A1F44` (dominan) + **Gold** `#D4AF37` (aksen) — identitas Kemenimipas
- Font: **Plus Jakarta Sans** (teks) + **Marcellus** (display/kepala) — disajikan
  dari server sendiri (offline-friendly)
- Gaya: *"Institutional Luxury"* — formal, tegas, berwibawa

## ⚡ Optimasi Kecepatan

| Optimasi | Keterangan |
|----------|-----------|
| Font lokal | Tidak ada permintaan ke Google Fonts (dulu bisa menggantung bila klien tanpa internet) |
| Kompresi brotli/gzip | `app.css` 36 kB → ±8 kB, bundle JS ±71% lebih kecil |
| ETag + `304 Not Modified` | Kunjungan ulang tidak mengunduh berkas penuh lagi |
| Cache aset statis | Ikon & font di-cache 7 hari di browser |
| Keep-alive 65 s | Banyak berkas kecil dikirim lewat satu koneksi TCP |
| Precache SW ringan | Vendor ZXing/QRCode dimuat saat dipakai (bukan saat instal PWA) |
| Tanpa delay buatan | Splash hilang tepat setelah render pertama (bukan menunggu 700 ms) |
| IndexedDB + SW cache | Beranda & halaman tampil instan saat offline |

### 🐞 Perbaikan Bug Kritis (v1.6.0)

| Bug | Gejala yang terlihat | Perbaikan |
|-----|----------------------|-----------|
| `public/js/pages.js` diawali 4.002 spasi + 69 huruf `Q` (berkas rusak) | `ReferenceError: QQQ… is not defined` → **aplikasi tidak pernah boot**, splash/loading menggantung tanpa akhir sehingga terasa seperti *"loading sangat lambat"* | Awalan rusak dibuang; berkas dimulai dari komentar header |
| `public/js/scan.js` memakai `loadScript` secara lokal tetapi tidak mengekspornya, padahal diimpor `pages.js`, `pages-barang.js`, `pages-scan.js`, dan `pages-labels.js` | `SyntaxError: The requested module './scan.js' does not provide an export named 'loadScript'` → seluruh rantai modul batal dimuat | `loadScript` kini `export function` |
| Splash tidak pernah dihilangkan bila terjadi error saat boot | Layar menggantung tanpa penjelasan | `boot()` dibungkus `try/catch` + `showBootError()` (pesan kesalahan + tombol **Muat ulang**); splash selalu disembunyikan lewat `requestAnimationFrame` |
| Cache service worker lama masih menyimpan JS yang rusak | PWA yang sudah terpasang di HP tetap memakai berkas lama | Versi cache dinaikkan ke `sitara-v1.6.0` → cache lama dihapus saat aktivasi |

> **Setelah pembaruan:** jalankan ulang server (`npm start`) dan buka sekali lagi PWA di HP agar service worker `v1.8.1` aktif.

## 🙋 Pendaftaran Mandiri Pegawai (v1.7.0)

Pegawai yang ingin mengajukan peminjaman barang BMN tidak lagi harus meminta
petugas BMN membuatkan akun. Di halaman **Masuk** tersedia tautan
**“Belum punya akun? Daftar mandiri”** dengan formulir:

| Isian | Wajib | Keterangan |
|-------|-------|------------|
| Nama Lengkap | ✅ | Minimal 3 karakter; dipakai sebagai identitas peminjam |
| NIP | — | 8–20 digit angka. Bila NIP sudah ada di data Pegawai, akun langsung terhubung ke data itu (tidak membuat data ganda) |
| Unit Kerja · No. HP | — | Ikut tersimpan di master pegawai |
| Username | ✅ | 4–30 karakter (huruf, angka, titik, garis bawah, strip); otomatis dijadikan huruf kecil |
| Password | ✅ | Minimal 6 karakter dan harus diulang |

Setelah mendaftar, akun **langsung aktif** — pengguna otomatis masuk tanpa
perlu menunggu verifikasi, sehingga bisa mengajukan peminjaman saat itu juga.
Kolom **Pegawai Peminjam** di halaman *Ajukan* otomatis terisi dengan identitas
pendaftar (masih dapat diganti bila mengajukan untuk pegawai lain).

### Batas kewenangan akun pendaftaran mandiri

| Boleh | Tidak boleh (server menjawab `403`) |
|-------|-------------------------------------|
| Masuk aplikasi, melihat barang, pegawai, riwayat, dan laporan | Menyetujui / menolak / menyerahkan / menerima pengembalian pinjaman (`POST /api/peminjaman/:id/status`) |
| Mengajukan peminjaman sendiri + mengunggah foto dokumentasi | Menambah, mengubah, atau menghapus master barang dan data pegawai |
| Mengubah password sendiri | Import master barang SIMAK |

Pembatas ini mencegah pengajuan disetujui sendiri. Bila pendaftar ternyata
memang petugas BMN, admin dapat mengangkatnya melalui **Kelola Akun → Detail
Akun → “Jadikan Petugas Penuh”** — dan membatasi kembali dengan tombol
**“Batasi (Peminjam Saja)”**.

### Pemantauan oleh petugas BMN

Menu **Kelola Akun** kini menampilkan badge **Mandiri** beserta NIP dan unit
kerja pendaftar. Lembar **Detail Akun** menyediakan tombol cepat
**Aktifkan/Nonaktifkan Akun**, **Edit / Reset Password**, pengaturan
kewenangan, dan **Hapus**. Setiap pendaftaran tercatat di **Audit Trail**
dengan aksi `daftar_mandiri` (berisi username, nama, `pegawai_id`, dan IP).

> Formulir publik dibatasi maksimum **10 pendaftaran per jam per alamat IP**
> (balasan `429` bila terlampaui) agar tidak disalahgunakan untuk pembuatan
> akun massal.

### API yang terlibat

| Endpoint | Keterangan |
|----------|------------|
| `POST /api/auth/register` (publik) | Pendaftaran mandiri → `201` + token (akun langsung aktif) |
| `GET /api/auth/me` | Ditambah `pegawai_id`, `no_hp`, `daftar_mandiri` |
| `GET /api/pegawai/:id` | Detail satu pegawai (dipakai halaman Ajukan untuk mengisi peminjam otomatis) |
| `GET /api/users` (admin) | Ditambah `daftar_mandiri`, `pegawai_nip`, `pegawai_nama`, `pegawai_unit`, `no_hp` |
| `PUT /api/users/:id` (admin) | Menerima `daftar_mandiri` untuk mengatur kewenangan akun |

### 🐞 Perbaikan tambahan (v1.7.0)

| Bug | Gejala yang terlihat | Perbaikan |
|-----|----------------------|-----------|
| `req.query` tidak pernah diisi oleh mini router | Semua pencarian/filter via query string diabaikan: pencarian barang & pegawai selalu menampilkan seluruh data, filter status (Tersedia/Dipinjam/Diajukan), rentang tanggal laporan, dan `limit` tidak berpengaruh | `server/router.js` kini mengisi `req.query` dari `url.searchParams` |
| Nama pengguna peka huruf besar/kecil | Akun yang didaftarkan sebagai `Budi` tidak bisa masuk bila diketik `budi` | Pengecekan login, pendaftaran, dan pembuatan akun admin memakai `COLLATE NOCASE` |
| Versi cache PWA | Berkas lama masih terpakai setelah pembaruan | Versi cache dinaikkan ke `sitara-v1.7.0` (cache lama dihapus saat aktivasi) |

### Penyaringan menu sesuai peran (v1.7.1)

Selain ditolak di server (`403`), kini **menu yang bukan kewenangan akun juga tidak
ditampilkan**, sehingga akun peminjam tidak lagi menemukan tombol yang bila diklik
hanya menghasilkan pesan galat:

| Elemen | Peminjam (akun mandiri) | Petugas/Admin penuh |
|--------|--------------------------|----------------------|
| Aksi cepat **Tambah Barang** (Beranda) | disembunyikan | tampil |
| **Kelola Akun** (Beranda) & halaman `#/users` | disembunyikan / dialihkan ke Beranda | tampil |
| **Import SIMAK (CSV)** (Beranda) | disembunyikan (halaman `#/import` menampilkan penjelasan "Khusus petugas BMN") | tampil |
| Tombol **＋ Tambah** di Barang & Pegawai, tombol **Edit/Hapus** di detail | disembunyikan | tampil |
| Tombol **Tambah Barang** saat scan menemukan kode tak terdaftar | diganti penjelasan "Hubungi petugas BMN" | tampil |
| Lencana Profil | **Peminjam (Akun Mandiri)** | Administrator / Petugas BMN |
| Seksi **Database (Admin)** di Profil | disembunyikan (memang hanya untuk admin) | tampil |
| Catatan peran di Beranda | tampil ("Akun peminjam — …") | tidak tampil |

Pembatasan tetap ditegakkan di **server** — penyaringan menu hanya kemudahan tampilan.

## 👋 Layar Sambutan & Pengajuan Tanpa Akun (v1.8.1)

Halaman pertama aplikasi kini berupa **layar sambutan** (hero melengkung + judul +
keterangan) dengan **dua tombol** utama:

| Tombol | Fungsi |
|--------|--------|
| **Ajukan Pinjaman** (emas) | Membuka formulir pengajuan **tanpa perlu masuk / tanpa akun** |
| **Login (Masuk Petugas)** (navy) | Masuk untuk petugas BMN & admin (verifikasi, penyerahan, pengembalian, master data, laporan) |

Pegawai yang ingin meminjam barang cukup menekan **Ajukan Pinjaman**, lalu
mengisi:

| Isian | Wajib | Keterangan |
|-------|-------|------------|
| Nama Lengkap | ✅ | Minimal 3 karakter |
| NIP | — | 8–20 digit. Bila NIP sudah ada di data pegawai, pengajuan langsung tertaut ke data itu |
| Unit Kerja · No. HP | — | Ikut tersimpan pada data pegawai bila pendaftar baru |
| Barang BMN | ✅ | Dipilih dari katalog publik (hanya barang berstatus **Tersedia**). Daftar barang tersedia langsung dimuat saat formulir dibuka, dan dapat disaring dengan kata kunci |
| Tanggal Pinjam · Rencana Kembali | — | Rencana kembali tidak boleh sebelum tanggal pinjam |
| Keperluan | — | Keterangan penggunaan barang |

Setelah dikirim, layar menampilkan **kartu sukses berisi nomor transaksi**
(mis. `PJM-20260922-001`) yang dapat dicatat peminjam. Pengajuan masuk ke daftar
petugas BMN dengan status **Diajukan** dan diverifikasi seperti pengajuan lain
(disetujui → diserahkan → dikembalikan). Karena tidak ada akun, pengajuan ini
**tidak dapat diverifikasi oleh pengirimnya sendiri** — verifikasi tetap milik
petugas BMN.

### API tambahan

| Endpoint | Akses | Keterangan |
|----------|-------|------------|
| `GET /api/barang-tersedia?q=` | publik | Katalog ringkas (id, nama, NUP, merk, tipe, kategori) khusus barang **Tersedia** |
| `POST /api/peminjaman/tamu` | publik | Pengajuan tanpa akun → `201` + `no_transaksi` (status `Diajukan`, `created_by` kosong) |

Pembatas: maksimum **20 pengajuan tamu per jam per alamat IP** (balasan `429` bila
terlampaui). Setiap pengajuan tamu tercatat di **Audit Trail** dengan aksi
`ajukan_tamu` (nama, NIP, `pegawai_id`, jumlah barang, dan IP pengirim).

> Catatan: formulir publik hanya memuat data pegawai peminjam & rencana pinjam.
> Bila prasarana Rutan memiliki jaringan tamu, pertimbangkan mematikan rute
> publik ini (`server/routes/peminjaman.js` → `{ public: true }`).

## 🧩 Catatan: mengapa bukan React / shadcn / Tailwind?

Komponen contoh (React + Tailwind + TS + framer-motion + shadcn/ui) **tidak diadopsi
apa adanya** karena SITARA sengaja dirancang **zero-dependency**: tanpa build step,
tanpa bundler, dan berjalan penuh di LAN Rutan yang tidak punya akses internet.
Layar sambutan di atas adalah **padanan 1:1** dari komponen tersebut pada stack
yang ada (vanilla ES module + CSS design system navy/gold):

| Komponen React | Padanan SITARA |
|----------------|----------------|
| `<img style={{ clipPath: 'ellipse(100% 60% at 50% 40%)' }}>` | `.welcome-hero` dengan `clip-path: ellipse(100% 62% at 50% 38%)` |
| `framer-motion` `staggerChildren` + spring | `@keyframes welcomeRise/welcomeDrop` + `animation-delay` bertingkat |
| `<Button variant="default" size="lg">` | `.btn.btn-gold.btn-block.welcome-btn-lg` |
| `<Button variant="link">` aksi sekunder | `.login-switch button` (tautan "Daftar mandiri petugas") |
| `bg-background` / `text-foreground` (tema shadcn) | variabel CSS `--navy-*`, `--gold-*`, `--ink`, `--muted` |
| `lucide-react` | ikon SVG inline di `public/js/ui.js` |

**Bila kelak ingin memakai React/shadcn di proyek terpisah**, langkahnya:

```bash
npm create vite@latest sitara-ui -- --template react-ts   # Node.js ≥ 20, butuh internet
cd sitara-ui
npm i tailwindcss @tailwindcss/vite                       # Tailwind CSS v4
npm i -D typescript @types/react @types/react-dom         # TypeScript
npx shadcn@latest init                                    # membuat components.json + lib/utils.ts
npx shadcn@latest add button                              # komponen ke components/ui/button.tsx
npm i framer-motion                                       # animasi (dipakai komponen sambutan)
npm run dev
```

Struktur yang diharapkan shadcn: `@/components/ui` (komponen siap pakai),
`@/components` (komponen aplikasi), `@/lib/utils.ts` (`cn()`),
`@/app/globals.css`. Isi `lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

Lalu `components/ui/onboarding-welcome-screen.tsx` (komponen sambutan) dan
`components/ui/button.tsx` dapat di-copy apa adanya, misalnya dipakai di
`app/welcome/page.tsx`. Untuk SITARA sendiri, integrasi React akan menuntut
bundler, proses build di komputer Rutan, dan penulisan ulang seluruh halaman PWA —
sehingga jalur vanilla di atas yang dipakai.

## 📁 Struktur Proyek

```
sitara/
├── server/          # Backend (zero-dependency Node.js)
│   ├── index.js     # HTTP server + static + API
│   ├── router.js    # Mini router (pengganti Express)
│   ├── db.js        # SQLite (node:sqlite) + skema + seed
│   ├── auth.js      # Token HMAC + password scrypt
│   └── routes/      # auth, barang, pegawai, peminjaman, import, laporan, users, admin, pdf
├── public/          # Frontend PWA (vanilla, tanpa build)
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js        # Service worker (offline)
│   ├── css/app.css  # Design system navy/gold
│   ├── css/fonts.css# @font-face lokal (hasil generator)
│   ├── fonts/       # Plus Jakarta Sans + Marcellus (woff2, self-host)
│   ├── vendor/      # ZXing + QRCode (dimuat saat dipakai saja)
│   └── js/          # app, api, idb (IndexedDB), ui
├── tools/gen-icons.js  # Generator ikon PNG (tanpa library)
├── tools/fetch-fonts.js# Pengunduh font lokal (npm run fetch-fonts)
└── data/            # Database SQLite (dibuat otomatis)
```

## 📱 PWA / Offline

Buka aplikasi di Chrome Android → menu → **"Tambahkan ke layar utama"**.
Data & halaman tersimpan di Service Worker + IndexedDB; input offline
disinkronkan otomatis saat koneksi kembali.

## 🔗 Integrasi SIMAK BMN

Master barang memakai field standar SIMAK (kode barang 108, NUP, KIB).
Fase 4 menyediakan modul Import Excel/CSV + adapter `simak-adapter`
yang siap dihubungkan ke API resmi SIMAK jika tersedia.
