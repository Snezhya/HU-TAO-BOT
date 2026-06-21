/**
 * Profile Rotator — auto-ganti nama & status Hu Tao secara berkala
 */
import { log } from './logger.js';

// Daftar nama yang akan di-rotate
const NAMES = [
  'Hu Tao 🥀',
  'Hu Tao ☁️',
  'Tao 👻',
  '胡桃 🥀',
  'Hu Tao ✨',
  'Hu Tao 🌸',
  'Hu Tao 🔥',
];

// Daftar status/bio yang akan di-rotate
const STATUSES = [
  'ada yang mau beli peti mati? harga spesial~ 🥀',
  'sedang ngurusin admin pemakaman, jangan ganggu 👻',
  'hidup itu singkat, tapi kematian itu abadi 🌸',
  '77 generasi direktur hutao, yang ke-77 paling keren 🔥',
  'jangan chat dulu, lagi ngitung jiwa yang lewat ☁️',
  'sibuk nulis bait puisi tentang keabadian ✨',
  'lagi iseng, siapa yang mau jadi teman?',
  'tumbal? eh maksudnya teman~ 🥀',
  'kalau seneng, sini. kalau sedih, sini juga.',
  'direktur pemakaman hutao. layanan 24 jam.',
];

let rotatorTimer = null;

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function rotate(sock) {
  try {
    const name = getRandom(NAMES);
    const status = getRandom(STATUSES);

    await sock.updateProfileName(name);
    await sock.updateProfileStatus(status);

    log.info(`[PROFILE ROTATOR] Nama: "${name}" | Status: "${status}"`);
  } catch (err) {
    log.warn(`[PROFILE ROTATOR] Gagal rotate: ${err.message}`);
  }
}

/**
 * Mulai auto-rotate profil
 * @param {object} sock - Baileys socket
 * @param {number} intervalMs - Interval dalam milidetik (default 2 jam)
 */
export function startProfileRotator(sock, intervalMs = 2 * 60 * 60 * 1000) {
  if (rotatorTimer) clearInterval(rotatorTimer);

  // Langsung rotate sekali saat start
  rotate(sock);

  // Lalu rotate berkala
  rotatorTimer = setInterval(() => rotate(sock), intervalMs);
  log.info(`[PROFILE ROTATOR] Aktif — rotasi setiap ${intervalMs / 60000} menit`);
}

export function stopProfileRotator() {
  if (rotatorTimer) {
    clearInterval(rotatorTimer);
    rotatorTimer = null;
    log.info('[PROFILE ROTATOR] Dihentikan');
  }
}
