// SITARA — Generator PDF minimal (pure Node.js, tanpa library)
// Mendukung: teks (Helvetica, WinAnsi), garis, kotak, dan embed JPEG (DCTDecode)
function latin(s) {
  return String(s)
    .replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[•]/g, '-')
    .replace(/[^\x00-\xFF]/g, '-');
}
function esc(s) {
  return latin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export class Pdf {
  constructor() {
    this.pages = [];
    this.images = [];
    this.cur = [];
    this.pages.push(this.cur);
  }
  addPage() { this.cur = []; this.pages.push(this.cur); return this; }
  _push(s) { this.cur.push(s); }

  text(x, y, size, str, bold = false) {
    this._push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(str)}) Tj ET`);
  }
  centered(y, size, str, bold = false) {
    const w = latin(str).length * size * 0.52;
    this.text((595 - w) / 2, y, size, str, bold);
  }
  line(x1, y1, x2, y2, width = 0.8) {
    this._push(`${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  rect(x, y, w, h, fill = false) {
    this._push(`${fill ? '' : '0.7 w '}${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill ? 'f' : 'S'}`);
  }
  // Embed JPEG; kembalikan false jika bukan JPEG valid
  image(jpegBuf, x, y, w, h) {
    const dim = jpegSize(jpegBuf);
    if (!dim) return false;
    this.images.push({ data: jpegBuf, w: dim.w, h: dim.h });
    this._push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${this.images.length} Do Q`);
    return true;
  }
  static wrap(str, maxChars) {
    const words = latin(String(str)).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars) { if (line) lines.push(line.trim()); line = w; }
      else line = (line + ' ' + w).trim();
    }
    if (line) lines.push(line);
    return lines;
  }

  toBuffer() {
    const chunks = [];
    let offset = 0;
    const push = (buf) => { chunks.push(buf); offset += buf.length; };

    const k = this.images.length;
    let objNum = 5 + k;
    const pageObjs = [], contentObjs = [];
    for (let i = 0; i < this.pages.length; i++) { pageObjs.push(objNum++); contentObjs.push(objNum++); }
    const maxObj = objNum - 1;

    push(Buffer.from('%PDF-1.4\n%\xB5\xB5\xB5\xB5\n', 'latin1'));
    const offsets = new Map();
    const addObj = (num, body) => {
      offsets.set(num, offset);
      push(Buffer.from(`${num} 0 obj\n${body}\nendobj\n`, 'latin1'));
    };

    addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObj(2, `<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    addObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    addObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    this.images.forEach((img, i) => {
      const num = 5 + i;
      offsets.set(num, offset);
      push(Buffer.from(`${num} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`, 'latin1'));
      push(img.data);
      push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    });

    this.pages.forEach((ops, i) => {
      const xobj = k ? ` /XObject << ${this.images.map((_, j) => `/Im${j + 1} ${5 + j} 0 R`).join(' ')} >>` : '';
      addObj(pageObjs[i], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${contentObjs[i]} 0 R >>`);
      const stream = Buffer.from(ops.join('\n'), 'latin1');
      offsets.set(contentObjs[i], offset);
      push(Buffer.from(`${contentObjs[i]} 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'));
      push(stream);
      push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    });

    const xrefPos = offset;
    let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= maxObj; n++) xref += String(offsets.get(n) || 0).padStart(10, '0') + ' 00000 n \n';
    push(Buffer.from(xref, 'latin1'));
    push(Buffer.from(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks);
  }
}

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Generator Berita Acara (PDF). d = detail peminjaman (dari endpoint detail)
export function buildBeritaAcara(d, nomorBa, uploadsDir) {
  const isKembali = d.status === 'Dikembalikan';
  const pdf = new Pdf();

  // ---- Halaman 1: Dokumen ----
  pdf.centered(790, 10, 'KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN');
  pdf.centered(774, 13, 'RUMAH TAHANAN NEGARA KELAS I SAMARINDA', true);
  pdf.centered(762, 8, 'Jalan Poros Samarinda-Bontang KM 12, Kalimantan Timur - SITARA');
  pdf.line(50, 752, 545, 752, 1.2);

  pdf.centered(726, 13, isKembali ? 'BERITA ACARA PENGEMBALIAN' : 'BERITA ACARA SERAH TERIMA', true);
  pdf.centered(712, 11, 'BARANG MILIK NEGARA', true);
  pdf.centered(698, 9, `Nomor: ${nomorBa}`);

  let y = 672;
  const tgl = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  for (const line of Pdf.wrap(`Pada hari ini, ${tgl}, kami yang bertanda tangan di bawah ini melaksanakan ${isKembali ? 'pengembalian' : 'serah terima'} Barang Milik Negara (BMN) dengan rincian sebagai berikut:`, 95)) {
    pdf.text(50, y, 9.5, line); y -= 13;
  }
  y -= 6;

  const rows = [
    ['Nomor Transaksi', d.no_transaksi],
    ['Pegawai Peminjam', d.pegawai_nama],
    ['NIP', d.nip || '-'],
    ['Unit Kerja', d.unit_kerja || '-'],
    ['Keperluan', d.keperluan || '-'],
    ['Tanggal Pinjam', d.tanggal_pinjam || '-'],
    ['Rencana Kembali', d.tanggal_rencana_kembali || '-'],
    ['Status', d.status]
  ];
  if (isKembali && d.tanggal_kembali) rows.push(['Tanggal Kembali', d.tanggal_kembali]);

  rows.forEach(([k, v]) => {
    pdf.text(50, y, 9.5, k, true);
    pdf.text(160, y, 9.5, ': ' + v);
    y -= 14;
  });
  y -= 8;

  pdf.text(50, y, 10, 'DAFTAR BARANG:', true); y -= 16;

  // Tabel barang
  pdf.rect(50, y - 4, 495, 16);
  pdf.text(56, y + 1, 8.5, 'No', true);
  pdf.text(80, y + 1, 8.5, 'NUP', true);
  pdf.text(130, y + 1, 8.5, 'Nama Barang', true);
  pdf.text(330, y + 1, 8.5, 'Kode', true);
  pdf.text(430, y + 1, 8.5, isKembali ? 'Kondisi Kembali' : 'Kondisi', true);
  y -= 4;
  pdf.line(50, y, 545, y);
  y -= 4;

  d.items.forEach((it, i) => {
    pdf.text(56, y, 8.5, String(i + 1));
    pdf.text(80, y, 8.5, it.nup || '-');
    pdf.text(130, y, 8.5, Pdf.wrap(`${it.nama}${it.merk ? ' ' + it.merk : ''}`, 38)[0] || '');
    pdf.text(330, y, 8.5, (it.kode_barang || '-').slice(0, 18));
    pdf.text(430, y, 8.5, isKembali ? (it.kondisi_kembali || '-') : (it.kondisi_barang || '-'));
    y -= 15;
    pdf.line(50, y + 4, 545, y + 4, 0.4);
  });
  y -= 10;

  for (const line of Pdf.wrap('Barang tersebut dinyatakan sesuai dengan daftar/kartu inventaris barang, dan selanjutnya menjadi tanggung jawab pihak penerima.', 95)) {
    pdf.text(50, y, 9.5, line); y -= 13;
  }

  // Blok tanda tangan
  const sy = Math.min(y - 10, 130);
  pdf.text(80, sy, 9.5, 'Petugas BMN / Penyerah,', true);
  pdf.text(340, sy, 9.5, 'Penerima,', true);
  pdf.text(80, sy - 46, 9.5, d.diserahkan_nama || '( ......................... )');
  pdf.text(340, sy - 46, 9.5, d.pegawai_nama || '( ......................... )');
  pdf.line(80, sy - 52, 200, sy - 52, 0.5);
  pdf.line(340, sy - 52, 460, sy - 52, 0.5);
  pdf.text(80, sy - 63, 7.5, d.diserahkan_nama ? `NIP. Petugas SITARA` : 'Petugas BMN');
  pdf.text(340, sy - 63, 7.5, d.nip ? `NIP ${d.nip}` : 'Pegawai Peminjam');
  pdf.centered(40, 7, `Dokumen ini dibuat otomatis oleh SITARA - ${new Date().toLocaleString('id-ID')}`);

  // ---- Halaman 2: Foto dokumentasi (JPEG saja) ----
  const fotos = [];
  const fotoSerah = d.dokumentasi?.filter((f) => f.tahap === 'serah-terima' && f.file_path.endsWith('.jpg')) || [];
  const fotoKondisi = d.dokumentasi?.filter((f) => f.tahap === 'kondisi-awal' && f.file_path.endsWith('.jpg')) || [];
  fotoKondisi.slice(0, 2).forEach((f) => fotos.push(['Foto Kondisi Barang', f]));
  fotoSerah.slice(0, 2).forEach((f) => fotos.push(['Foto Serah Terima', f]));

  if (fotos.length) {
    pdf.addPage();
    pdf.centered(800, 12, 'LAMPIRAN DOKUMENTASI FOTO', true);
    pdf.centered(786, 9, nomorBa);
    pdf.line(50, 776, 545, 776, 1);
    let fy = 700;
    let fx = 60;
    for (const [label, f] of fotos) {
      const abs = path.join(uploadsDir, path.basename(f.file_path));
      if (!existsSync(abs)) continue;
      let buf;
      try { buf = readFileSync(abs); } catch { continue; }
      const ok = pdf.image(buf, fx, fy - 230, 230, 230);
      if (ok) {
        pdf.text(fx + 10, fy - 242, 8, label, true);
        if (fx === 60) fx = 315; else { fx = 60; fy -= 275; }
      }
    }
  }

  return pdf.toBuffer();
}

