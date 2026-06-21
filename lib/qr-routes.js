import QRCode from 'qrcode';
import { config } from './config.js';
import { getQrState } from './qr-state.js';

function pageHtml(title, body) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="refresh" content="8"/>
  <title>${title} — Hu Tao AI</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:420px;margin:2rem auto;padding:1rem;text-align:center;background:#1a0a0a;color:#fff}
    img{max-width:100%;border-radius:12px;background:#fff;padding:12px}
    code{font-size:1.5rem;letter-spacing:.2em;background:#333;padding:.5rem 1rem;border-radius:8px}
    p{color:#ccc;line-height:1.5}
    h1{font-size:1.25rem}
  </style>
</head>
<body>
  <h1>🥀 Hu Tao AI — ${title}</h1>
  ${body}
  <p><small>Halaman refresh otomatis setiap 8 detik</small></p>
</body>
</html>`;
}

export function registerQrRoutes(app) {
  app.get('/qr', async (req, res) => {
    const { qr, pairingCode, connected } = getQrState();

    if (connected) {
      return res.send(
        pageHtml(
          'Sudah connect',
          '<p>WhatsApp sudah terhubung. Tutup halaman ini.</p>'
        )
      );
    }

    if (pairingCode) {
      return res.send(
        pageHtml(
          'Pairing Code',
          `<p>WhatsApp → <strong>Perangkat tertaut</strong> → Tautkan dengan nomor telepon</p>
           <p><code>${pairingCode}</code></p>
           <p>Masukkan kode di atas (bukan QR)</p>`
        )
      );
    }

    if (!qr) {
      const up = Math.floor(process.uptime());
      const stale = up > 90;
      return res.send(
        pageHtml(
          stale ? 'QR tidak muncul' : 'Menunggu QR',
          stale
            ? `<p>Bot sudah jalan ${up}s tapi QR belum keluar.</p>
               <p><strong>1.</strong> Railway → <strong>Restart</strong> service<br/>
               <strong>2.</strong> Buka halaman ini lagi dalam 30 detik<br/>
               <strong>3.</strong> Atau pakai <strong>pairing</strong>: set <code>LOGIN_METHOD=pairing</code> + <code>PAIRING_PHONE</code></p>
               <p>Kalau pernah login gagal: hapus koleksi <code>wasessions</code> di MongoDB Atlas lalu restart.</p>`
            : `<p>Bot sedang menyambung… tunggu 5–15 detik.</p>
               <p>Pastikan deploy terbaru punya route <code>/qr</code> (bukan cuma JSON di <code>/</code>).</p>`
        )
      );
    }

    try {
      const dataUrl = await QRCode.toDataURL(qr, { width: 360, margin: 2, errorCorrectionLevel: 'M' });
      res.send(
        pageHtml(
          'Scan QR WhatsApp',
          `<p>Buka WhatsApp → <strong>Perangkat tertaut</strong> → <strong>Tautkan perangkat</strong></p>
           <img src="${dataUrl}" alt="WhatsApp QR Code" width="360" height="360"/>
           <p>Scan gambar di atas dengan HP (bukan screenshot log Railway)</p>`
        )
      );
    } catch (err) {
      res.status(500).send(`Gagal buat QR: ${err.message}`);
    }
  });

  app.get('/qr.png', async (req, res) => {
    const { qr, connected } = getQrState();
    if (connected) return res.status(410).send('Already connected');
    if (!qr) return res.status(404).send('QR belum tersedia');
    try {
      const buf = await QRCode.toBuffer(qr, { width: 400, margin: 2 });
      res.type('png').send(buf);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
}

export function getPublicBase(req) {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${host}`;
}

export function logQrUrl() {
  const base = config.publicUrl || `http://localhost:${config.port}`;
  return `${base.replace(/\/$/, '')}/qr`;
}
