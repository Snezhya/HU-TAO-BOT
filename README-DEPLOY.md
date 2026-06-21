# Deployment Guide — Koyeb (Public Bot Setup)

Repositori `bot` dikonfigurasi secara khusus untuk deployment publik di Koyeb.

---

## Langkah Deploy ke Koyeb

1. **Hubungkan Repositori GitHub**:
   - Masuk ke dashboard Koyeb.
   - Buat App/Service baru dengan tipe **Web Service**.
   - Pilih repositori GitHub Anda dan arahkan ke folder `/bot` jika ditaruh di sub-folder.
   - Set build builder ke **Dockerfile** (Koyeb akan otomatis membaca `Dockerfile` di dalam folder tersebut).

2. **Environment Variables**:
   Set variabel berikut di panel Environment Variables Koyeb Dashboard:
   - `MONGODB_URI` : URI koneksi MongoDB Atlas.
   - `OWNER_NUMBER` : Nomor WhatsApp owner utama.
   - `BOT_NAME` : Nama bot Anda.
   - `PREFIX` : Prefix bot (default `!`).
   - `BOT_MODE` : Mode bot (`public`).
   - `GEMINI_API_KEY` / `GEMINI_API_KEYS` : Kunci API Google Gemini.
   - `PORT` : `3000` (Sesuai port internal kontainer).
   - `NODE_ENV` : `production`
   - `EXPRESS_ENABLED` : `true`
   - `SESSION_STORE` : `mongo` atau `auto`.

3. **Health Check**:
   Koyeb sudah dikonfigurasi lewat `koyeb.yaml` untuk menggunakan `/health` (port 3000) dengan tipe HTTP GET untuk health check.

4. **Jalankan Deployment**:
   Klik **Deploy** dan pantau log startup.

---

## Hapus Berkas Railway Lama
Untuk menghindari kebingungan, pastikan berkas-berkas konfigurasi Railway berikut dihapus atau tidak digunakan lagi:
- `railway.json`
- `Procfile`
- `nixpacks.toml`