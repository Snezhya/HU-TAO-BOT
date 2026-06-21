/**
 * Media menu — file di disk + readFileSync (stabil di Baileys)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { config } from './config.js';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
export const ASSETS_DIR = join(ROOT, 'assets', 'menu');
export const MEDIA_DIR = join(ROOT, 'media');
export const MENU_JPG = join(MEDIA_DIR, 'menu.jpg');
export const MENU_GIF = join(MEDIA_DIR, 'menu.gif');

/** JPEG minimal valid (fallback tanpa sharp / tanpa network) */
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAoADwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKAP/Z';

let sharpModule = null;

async function getSharp() {
  if (sharpModule !== null) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
    return sharpModule;
  } catch {
    sharpModule = false;
    return false;
  }
}

export async function createDefaultBannerBuffer() {
  const sharp = await getSharp();
  if (!sharp) {
    log.warn('sharp tidak tersedia — pakai JPEG fallback kecil');
    return Buffer.from(TINY_JPEG_B64, 'base64');
  }

  const w = 1280;
  const h = 720;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1a0505"/>
        <stop offset="50%" stop-color="#7f1d1d"/>
        <stop offset="100%" stop-color="#1c1917"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial,sans-serif" font-size="64" font-weight="bold" fill="#fef2f2">HU TAO AI</text>
    <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial,sans-serif" font-size="28" fill="#fdba74">Yandere Mode</text>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

function findUserBanner() {
  const names = [
    config.menu.bannerImage || '',
    'banner.jpg',
    'banner.png',
    'banner.jpeg',
    'menu.jpg'
  ].filter(Boolean);

  for (const name of names) {
    const p = isAbsolute(name) ? name : join(ASSETS_DIR, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Pastikan media/menu.jpg ada di disk (dipanggil saat boot & sebelum kirim menu)
 */
export async function ensureMenuMedia() {
  mkdirSync(MEDIA_DIR, { recursive: true });
  mkdirSync(ASSETS_DIR, { recursive: true });

  const userBanner = findUserBanner();
  if (userBanner && userBanner !== MENU_JPG) {
    try {
      copyFileSync(userBanner, MENU_JPG);
      log.success(`Menu: disalin ${userBanner} → media/menu.jpg`);
      return { ok: true, path: MENU_JPG, source: userBanner };
    } catch (err) {
      log.warn(`Menu: gagal salin banner — ${err.message}`);
    }
  }

  if (existsSync(MENU_JPG)) {
    const stat = readFileSync(MENU_JPG);
    if (stat.length > 500) {
      return { ok: true, path: MENU_JPG, source: 'cached' };
    }
  }

  if (config.menu.bannerUrl) {
    try {
      const { data } = await axios.get(config.menu.bannerUrl, {
        responseType: 'arraybuffer',
        timeout: 25000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const buf = Buffer.from(data);
      writeFileSync(MENU_JPG, buf);
      log.success('Menu: banner diunduh dari MENU_BANNER_URL');
      return { ok: true, path: MENU_JPG, source: 'url' };
    } catch (err) {
      log.warn(`Menu: download banner gagal — ${err.message}`);
    }
  }

  try {
    const buf = await createDefaultBannerBuffer();
    writeFileSync(MENU_JPG, buf);
    log.success(`Menu: media/menu.jpg dibuat (${buf.length} bytes)`);
    return { ok: true, path: MENU_JPG, source: 'generated' };
  } catch (err) {
    writeFileSync(MENU_JPG, Buffer.from(TINY_JPEG_B64, 'base64'));
    log.warn(`Menu: pakai JPEG minimal — ${err.message}`);
    return { ok: true, path: MENU_JPG, source: 'tiny-fallback' };
  }
}

/** Baca gambar menu — format stabil untuk sendMessage */
export function readMenuImage() {
  if (!existsSync(MENU_JPG)) {
    throw new Error(`File tidak ada: ${MENU_JPG} — jalankan ensureMenuMedia() dulu`);
  }
  const buf = readFileSync(MENU_JPG);
  if (!buf?.length) throw new Error('media/menu.jpg kosong');
  return buf;
}

export function readMenuGif() {
  return null;
}

export function validateMenuMedia() {
  const result = { image: false, gif: false, imageBytes: 0, path: MENU_JPG };
  try {
    const buf = readMenuImage();
    result.image = buf.length > 100;
    result.imageBytes = buf.length;
  } catch (err) {
    result.error = err.message;
  }
  try {
    const gif = readMenuGif();
    result.gif = !!gif?.length;
  } catch {
    result.gif = false;
  }
  return result;
}
