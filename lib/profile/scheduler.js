/**
 * PP Scheduler
 * Auto-changes profile picture at configurable intervals
 * Config persists via storage.js JSON file
 */
import { log } from '../logger.js';
import { getRandomFromCollection, getSchedulerConfig, setSchedulerConfig } from './storage.js';
import { updateProfilePicture } from './profileManager.js';

let schedulerTimer = null;
let sockRef = null;

async function runRandomPP() {
  if (!sockRef) return;

  const buffer = await getRandomFromCollection();
  if (!buffer) {
    log.warn('[PP SCHEDULER] Koleksi kosong, skip rotate');
    return;
  }

  try {
    await updateProfilePicture(sockRef, buffer);
    await setSchedulerConfig({ lastChanged: Date.now() });
    log.info('[PP SCHEDULER] PP berhasil diganti otomatis');
  } catch (err) {
    log.error(`[PP SCHEDULER] Gagal ganti PP: ${err.message}`);
  }
}

/**
 * Mulai scheduler
 * @param {object} sock - Baileys socket
 * @param {number} intervalHours - Interval dalam jam
 */
export async function startScheduler(sock, intervalHours = 6) {
  sockRef = sock;
  if (schedulerTimer) clearInterval(schedulerTimer);

  const ms = intervalHours * 60 * 60 * 1000;
  schedulerTimer = setInterval(runRandomPP, ms);

  await setSchedulerConfig({ enabled: true, intervalHours });
  log.info(`[PP SCHEDULER] Aktif — ganti setiap ${intervalHours} jam`);

  // Langsung jalankan sekali
  await runRandomPP();
}

/**
 * Hentikan scheduler
 */
export async function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  await setSchedulerConfig({ enabled: false });
  log.info('[PP SCHEDULER] Dihentikan');
}

/**
 * Restore scheduler dari config tersimpan (dipanggil saat bot restart)
 * @param {object} sock
 */
export async function restoreScheduler(sock) {
  const config = await getSchedulerConfig();
  if (config.enabled && config.intervalHours > 0) {
    log.info(`[PP SCHEDULER] Restore jadwal ${config.intervalHours} jam dari config`);
    await startScheduler(sock, config.intervalHours);
  }
}

export function isSchedulerActive() {
  return schedulerTimer !== null;
}
