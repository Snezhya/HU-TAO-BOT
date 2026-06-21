# Menu Banner

Bot menyalin `banner.jpg` ke `media/menu.jpg` saat start.

## List interaktif

List memakai **proto listMessage** (Baileys 6.7). Jangan pakai `{ text, sections }` — itu hanya teks biasa.

Set `MENU_INTERACTIVE=false` di `.env` untuk matikan list (hanya gambar + caption).

## File

| File | Keterangan |
|------|------------|
| `banner.jpg` | Banner menu (disarankan) |
| `banner.gif` | GIF opsional |
