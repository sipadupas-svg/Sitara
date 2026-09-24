// SITARA — Scanner barcode/QR: BarcodeDetector API (native) + fallback ZXing (vendor lokal, offline)
// Catatan: loadScript diekspor karena dipakai juga oleh pages-labels.js (generator QR)
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Library tidak dapat dimuat: ' + src));
    document.head.appendChild(s);
  });
}

export async function createScanner(videoEl, onResult, onError) {
  let stopped = false;
  let controls = null;

  const stop = () => {
    stopped = true;
    try { controls?.stop?.(); } catch { /* noop */ }
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
  };

  // --- Jalur 1: BarcodeDetector API (Chrome/Android, hemat resource) ---
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      const detector = new window.BarcodeDetector({ formats });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoEl.srcObject = stream;
      await videoEl.play();

      const loop = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(videoEl);
          if (codes && codes.length) {
            const hit = codes[0];
            navigator.vibrate?.(80);
            stop();
            onResult(hit.rawValue);
            return;
          }
        } catch { /* frame skip */ }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return { stop, mode: 'native' };
    } catch (err) {
      if (String(err).includes('Permission') || String(err).includes('NotAllowed')) {
        onError('Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.');
        return { stop, mode: 'none' };
      }
      // lanjut ke fallback
    }
  }

  // --- Jalur 2: ZXing (vendor lokal, tetap offline) ---
  try {
    await loadScript('/vendor/zxing.min.js');
    if (!window.ZXing?.BrowserMultiFormatReader) throw new Error('ZXing tidak tersedia');
    const reader = new window.ZXing.BrowserMultiFormatReader();
    controls = await reader.decodeFromConstraints(
      { video: { facingMode: 'environment', width: { ideal: 1280 } } },
      videoEl,
      (result) => {
        if (!result || stopped) return;
        navigator.vibrate?.(80);
        stop();
        onResult(result.getText());
      }
    );
    return { stop, mode: 'zxing' };
  } catch (err) {
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
    onError(
      String(err).includes('Permission') || String(err).includes('NotAllowed')
        ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.'
        : 'Scanner tidak tersedia di browser ini. Gunakan input manual di bawah.'
    );
    return { stop, mode: 'none' };
  }
}

// Cari barang berdasarkan hasil scan (NUP/barcode) via API
import { api } from './api.js';
export async function lookupScan(code) {
  return api('/barang/scan/' + encodeURIComponent(code.trim()));
}
