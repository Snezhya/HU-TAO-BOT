# Hu Tao WhatsApp Bot 👻🦋

Hu Tao WhatsApp Bot adalah asisten virtual interaktif di WhatsApp berbasis Baileys, MongoDB, dan integrasi multi-LLM (Gemini & Groq) dengan pendekatan simulasi kepribadian dan _mood_ yang dinamis. 

Project ini menggabungkan core codebase bot WhatsApp dengan struktur tambahan yang memisahkan fitur publik dan _admin panel_. Bot ini tidak dirancang sebagai customer service biasa yang kaku, melainkan selayaknya teman ngobrol yang bisa marah (sulking), ramah (happy), atau menggunakan berbagai _persona_ (jutek, ceria, serius, dll).

## 🌟 Fitur Utama

### 🧠 Sistem AI & Kepribadian (Persona & Mood System)
* **Dynamic Persona:** Kepribadian AI dihitung unik berdasarkan nomor pengguna, tetapi dapat diubah secara manual (Ceria, Jutek, Santai, Serius, Romance, dll).
* **Mood System:** Respons dan gaya obrolan Hu Tao dapat berubah secara otomatis berdasarkan perlakuan pengguna. _Mood_ AI bisa naik (ketika dipuji) dan turun (ketika dimaki).
* **Relationship Tracker:** AI secara otomatis melacak tingkat keakraban (baru kenal, lumayan akrab, bestie) dan durasi terakhir interaksi, lalu mengadaptasi gaya balasannya.
* **Group Memory:** Jika di dalam grup, AI dapat mengingat percakapan secara komunal dan membedakan konteks obrolan antarpengirim secara spesifik.
* **Multi-Provider AI:** Dukungan redundansi AI; memprioritaskan Groq (LLaMA-3), lalu secara dinamis _fallback_ ke Google Gemini jika API limit terpenuhi.
* **Reply-to-Continue:** Mengobrol dengan AI tidak selalu harus memakai _prefix/command_. Anda cukup _reply_ (balas) pesan AI, maka AI akan lanjut mengobrol layaknya manusia normal.
* **Native WhatsApp Mention:** AI mampu me-_mention_ peserta di dalam grup secara akurat dengan fitur _native tag_.

### 🛠 Tools & Utilities
* Fitur Pengunduh Media (YouTube, TikTok, Instagram, Spotify).
* Fitur Editor/Pembuat Stiker & Gambar (Sticker, Brat, Brat-Vid, Upscale, OCR, Remove Watermark).
* Text-to-Speech (TTS) dan integrasi Voice AI.
* Reminder System: Meminta AI untuk mengingatkan waktu (custom atau default).

### 👥 Group & Admin Panel
Terdapat sistem hierarki akses di dalam bot.
* Menu Pengguna (`.menu`): Hanya berisi utilitas umum (AI, Tools, Downloader, dll).
* Admin Panel (`.adminmenu`): Dikhususkan bagi Admin Grup/Owner untuk mengelola izin, _feature toggles_, Kick/Promote member, serta Anti-Link/Welcome Greeting.

---

## 🚀 Instalasi & Persiapan Awal

### 1. Persyaratan Sistem
Pastikan Anda sudah menginstal dependensi berikut di sistem/komputer Anda:
- [Node.js](https://nodejs.org/en/) (Versi 18 atau lebih baru)
- [MongoDB](https://www.mongodb.com/) (Local atau Atlas untuk sistem Database)
- Git

### 2. Kloning dan Instalasi
```bash
git clone https://github.com/USERNAME/hutao-wa-bot.git
cd hutao-wa-bot
npm install
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file konfigurasi contoh, lalu isi nilai-nilainya dengan benar:
```bash
cp .env.example .env
```

Buka file `.env` di teks editor favorit Anda. Sesuaikan variabel-variabel di bawah ini:
```ini
# Info Dasar Bot
BOT_NAME="Hu Tao AI"
PREFIX="!"
ALT_PREFIX="."
OWNER_NUMBER="628123456789" # Masukkan nomor WhatsApp owner (tanpa +, hanya angka)

# Timezone (Opsional, Default Asia/Jakarta)
TIMEZONE="Asia/Jakarta"

# Konfigurasi MongoDB
MONGODB_URI="mongodb+srv://username:password@cluster0.mongodb.net/hutao" # Ganti dengan string MongoDB Anda

# Integrasi Gemini API
GEMINI_ENABLED=true
GEMINI_API_KEYS="AIzaSy...KEY_ANDA_1,AIzaSy...KEY_ANDA_2" # Pisahkan dengan koma jika menggunakan lebih dari satu key
GEMINI_MODELS="gemini-2.5-flash-lite,gemini-1.5-pro" # Opsi Model Gemini

# Integrasi Groq API
GROQ_API_KEY="gsk_...KEY_GROQ_ANDA"
GROQ_MODEL="llama-3.3-70b-versatile"
```
> **Penting**: Pastikan Database MongoDB dan API Key AI Anda sudah berjalan. Tanpa ini, bot tidak akan dapat merespon chat AI dengan benar.

### 4. Menjalankan Bot
```bash
npm start
```
1. Saat pertama kali berjalan, terminal/console akan memunculkan **QR Code**.
2. Buka aplikasi WhatsApp di HP Anda -> Perangkat Tertaut -> Tautkan Perangkat.
3. Scan QR Code tersebut.
4. Bot berhasil berjalan jika muncul log `[Socket] connection connected`.

---

## 📖 Panduan Penggunaan Singkat

* **Cek Menu Utama:** Ketik `.menu` atau `!menu`. (Ini akan memunculkan menu utilitas harian dan tools AI).
* **Mengobrol dengan AI:** Ketik `.ai <pertanyaan>`. Atau cukup tag bot/reply pesan dari bot untuk melanjutkan percakapan.
* **Ganti Kepribadian AI:** Ketik `.persona set romance` atau `.persona set ceria`.
* **Mengakses Admin Panel:** (Hanya berlaku untuk admin grup atau owner). Ketik `.adminmenu`.

### FAQ (Pertanyaan yang Sering Diajukan)
**Q: Kok bot-nya gak bales-bales?**
A: Pastikan Anda tidak dibatasi oleh _cooldown_, MongoDB tidak terputus, dan API Key tidak _limit_. Cek di log terminal Anda.

**Q: Bagaimana cara mematikan fitur memori grup?**
A: Ketik `.fitur groupmemory off` di dalam grup.

**Q: Pesan AI terpotong atau format aneh?**
A: Terkadang API AI membatasi output, tapi logika internal kami secara dinamis dapat beralih (fallback) jika Groq API error.

---
_Dikembangkan dengan ❤️ untuk komunitas bot WhatsApp. Terinspirasi dari karakter Hu Tao - Genshin Impact._