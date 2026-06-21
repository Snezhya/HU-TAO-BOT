/**
 * Reminder System — "Pasangan Hidup" Mode
 * Auto-kirim pesan pengingat sesuai jadwal waktu nyata
 * Persistent via MongoDB Atlas (fallback ke JSON di /tmp)
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { log } from './logger.js';

const STORAGE_PATH = process.env.REMINDER_STORAGE || '/tmp/hutao-reminders.json';

// ============================================================================
// JADWAL DEFAULT — waktu WIB (UTC+7)
// ============================================================================
export const DEFAULT_SCHEDULE = [
  { hour: 5,  minute: 0,  type: 'bangun' },
  { hour: 7,  minute: 0,  type: 'sarapan' },
  { hour: 10, minute: 0,  type: 'nanya_kabar' },
  { hour: 12, minute: 0,  type: 'makan_siang' },
  { hour: 14, minute: 30, type: 'ngantuk' },
  { hour: 16, minute: 0,  type: 'nanya_kabar' },
  { hour: 18, minute: 30, type: 'makan_malam' },
  { hour: 20, minute: 0,  type: 'mandi' },
  { hour: 22, minute: 0,  type: 'tidur' },
];

// ============================================================================
// TEMPLATE PESAN PER TIPE (random dari array)
// ============================================================================
export const REMINDER_MESSAGES = {
  bangun: [
    'hei hei, udah pagi nih! jangan rebahan mulu dong 🌅',
    'bangun bangun!! hari baru nih, semangat ya~',
    'pagi!! udah melek belom? jangan males-malesan 😤',
    'waktu bangun tidurr!! jangan sampe telat lagi deh',
  ],
  sarapan: [
    'udah sarapan belom? jangan skip makan pagi dong, nanti maag 😤',
    'oi, sarapan dulu sana! perut kosong tuh bahaya',
    'hei! udah makan pagi? kalo belum, buruan! aku khawatir tau nggak',
    'ingat ya, sarapan itu penting banget~ jangan dilewatin',
  ],
  makan_siang: [
    'waktunya makan siang! udah makan belom? jangan lupa makan ya~',
    'hei, jam makan siang nih! udah siap makan apa?',
    'istirahat dulu dong, terus makan siang! badan minta diisi nih 😤',
    'jam 12 nih, buruan makan! jangan sampe lupa gara-gara sibuk',
  ],
  makan_malam: [
    'makan malem dulu dong! jangan skip makan ya~',
    'hei, udah makan malem? kalo belum buruan, nanti kesorean',
    'waktunya makan malam! udah siap belom?',
    'ingat makan malem ya! badan butuh energi buat besok juga',
  ],
  mandi: [
    'udah mandi belom? jangan lupa mandi ya, biar seger~ 🚿',
    'hei! mandi dulu sana sebelum tidur, biar bersih',
    'oi, udah mandi? mandi dulu sana, jangan malas-malasan',
    'ingetin ya, mandi malem itu penting buat tidur nyenyak~',
  ],
  tidur: [
    'udah malem nih, coba istirahat ya~ jangan begadang mulu 😴',
    'hei, udah jam segini! tidur dulu dong, besok masih ada hari',
    'tidur yuk! kesehatan itu penting, jangan dipaksa melek terus',
    'oi, istirahat dong! badan kamu butuh tidur yang cukup~',
  ],
  ngantuk: [
    'lagi ngantuk nggak? kalo ngantuk boleh tidur siang sebentar kok~',
    'hei, gimana kabarnya siang-siang gini? masi semangat?',
    'udah makan siang tadi? jangan sampe ngantuk gara-gara laper 😤',
    'santai dulu bentar, jangan terlalu dipaksain ya~',
  ],
  nanya_kabar: [
    'hei! lagi ngapain? baik-baik aja kan? 🌸',
    'halooo, aku kangen tau, gimana kabarnya?',
    'eh, lagi apa sekarang? cerita dong~',
    'nggak denger kabar dari kamu, baik-baik aja kan?',
    'oi, lagi sibuk? jangan lupa istirahat ya~',
  ],
};

// ============================================================================
// STORAGE — MongoDB first, JSON fallback
// ============================================================================
let jsonCache = null; // fallback cache

function defaultStore() {
  return { reminders: {} };
}

async function isMongoAvailable() {
  try {
    const { isMongoConnected } = await import('./db/connection.js');
    return isMongoConnected();
  } catch {
    return false;
  }
}

async function getModel() {
  const { ReminderConfig } = await import('./db/models.js');
  return ReminderConfig;
}

// ---- JSON fallback helpers ----
async function loadJson() {
  if (jsonCache) return jsonCache;
  if (!existsSync(STORAGE_PATH)) { jsonCache = defaultStore(); return jsonCache; }
  try {
    jsonCache = { ...defaultStore(), ...JSON.parse(await fs.readFile(STORAGE_PATH, 'utf-8')) };
  } catch { jsonCache = defaultStore(); }
  return jsonCache;
}

async function saveJson() {
  try {
    await fs.writeFile(STORAGE_PATH, JSON.stringify(jsonCache, null, 2));
  } catch (err) {
    log.warn(`[REMINDER] JSON save gagal: ${err.message}`);
  }
}

// ---- Public API ----

export async function getReminderConfig(jid) {
  if (await isMongoAvailable()) {
    try {
      const Model = await getModel();
      const doc = await Model.findOne({ jid }).lean();
      if (!doc) return null;
      const { _id, __v, createdAt, updatedAt, ...cfg } = doc;
      return cfg;
    } catch (err) {
      log.warn(`[REMINDER] Mongo read gagal: ${err.message} — pakai JSON`);
    }
  }
  // fallback JSON
  const store = await loadJson();
  return store.reminders[jid] || null;
}

export async function setReminderConfig(jid, patch) {
  if (await isMongoAvailable()) {
    try {
      const Model = await getModel();
      const updated = await Model.findOneAndUpdate(
        { jid },
        { $set: patch },
        { upsert: true, new: true, lean: true }
      );
      const { _id, __v, createdAt, updatedAt, ...cfg } = updated;
      return cfg;
    } catch (err) {
      log.warn(`[REMINDER] Mongo write gagal: ${err.message} — pakai JSON`);
    }
  }
  // fallback JSON
  const store = await loadJson();
  store.reminders[jid] = { ...(store.reminders[jid] || {}), ...patch };
  await saveJson();
  return store.reminders[jid];
}

export async function deleteReminderConfig(jid) {
  if (await isMongoAvailable()) {
    try {
      const Model = await getModel();
      await Model.deleteOne({ jid });
      return;
    } catch (err) {
      log.warn(`[REMINDER] Mongo delete gagal: ${err.message}`);
    }
  }
  const store = await loadJson();
  delete store.reminders[jid];
  await saveJson();
}

export async function getAllActiveReminders() {
  if (await isMongoAvailable()) {
    try {
      const Model = await getModel();
      const docs = await Model.find({ enabled: true }).lean();
      return docs.map(({ _id, __v, createdAt, updatedAt, ...cfg }) => cfg);
    } catch (err) {
      log.warn(`[REMINDER] Mongo getAll gagal: ${err.message} — pakai JSON`);
    }
  }
  const store = await loadJson();
  return Object.entries(store.reminders)
    .filter(([, cfg]) => cfg.enabled)
    .map(([jid, cfg]) => ({ jid, ...cfg }));
}

// ============================================================================
// REMINDER CONTEXT — simpan konteks reminder yang baru dikirim
// Dipakai AI untuk melanjutkan percakapan secara natural saat user membalas
// ============================================================================
const pendingReminderCtx = new Map(); // jid → { type, text, sentAt }
const REMINDER_CTX_TTL = 30 * 60 * 1000; // 30 menit

export function setPendingReminderCtx(jid, ctx) {
  pendingReminderCtx.set(jid, { ...ctx, sentAt: Date.now() });
}

export function getPendingReminderCtx(jid) {
  const ctx = pendingReminderCtx.get(jid);
  if (!ctx) return null;
  if (Date.now() - ctx.sentAt > REMINDER_CTX_TTL) {
    pendingReminderCtx.delete(jid);
    return null;
  }
  return ctx;
}

export function clearPendingReminderCtx(jid) {
  pendingReminderCtx.delete(jid);
}

// ============================================================================
// SCHEDULER ENGINE
// ============================================================================
let schedulerInterval = null;
let sockRef = null;

// Track what has been fired: key = "jid|type|text|YYYY-MM-DD|HH:MM"
const firedCache = new Set();
let lastCleanupMinute = -1;

function getWIBNow() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {
    hour:   now.getUTCHours(),
    minute: now.getUTCMinutes(),
    second: now.getUTCSeconds(),
    dateStr: now.toISOString().split('T')[0], // YYYY-MM-DD in WIB
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMessage(type) {
  const pool = REMINDER_MESSAGES[type] || REMINDER_MESSAGES.nanya_kabar;
  return pickRandom(pool);
}

async function tick() {
  if (!sockRef) return;
  const { hour, minute, second, dateStr } = getWIBNow();

  // Bersihkan firedCache setiap awal menit baru
  const currentMinute = hour * 60 + minute;
  if (currentMinute !== lastCleanupMinute) {
    firedCache.clear();
    lastCleanupMinute = currentMinute;
  }

  // Hanya proses di detik 0–30 per menit untuk efisiensi
  // (tick tiap 10 detik → cek di detik 0, 10, 20, 30, 40, 50)
  // Kita biarkan semua detik lewat, firedCache yang mencegah double-fire

  let actives;
  try {
    actives = await getAllActiveReminders();
  } catch (err) {
    log.warn(`[REMINDER] Gagal ambil daftar aktif: ${err.message}`);
    return;
  }

  for (const cfg of actives) {
    // Always include routine DEFAULT_SCHEDULE + any custom one-off tasks
    const customTasks = (cfg.schedule || []).filter(s => s.type === 'tugas');
    const schedule = [...DEFAULT_SCHEDULE, ...customTasks];

    const toFire = schedule.filter(s => {
      if (s.hour !== hour || s.minute !== minute) return false;
      // Kalau ada tanggal spesifik, harus cocok dengan hari ini (WIB)
      if (s.date && s.date !== dateStr) return false;

      const cacheKey = `${cfg.jid}|${s.type}|${s.text || ''}|${dateStr}|${hour}:${minute}`;
      if (firedCache.has(cacheKey)) return false;
      return true;
    });

    if (toFire.length === 0) continue;

    for (const match of toFire) {
      const cacheKey = `${cfg.jid}|${match.type}|${match.text || ''}|${dateStr}|${hour}:${minute}`;
      firedCache.add(cacheKey); // tandai dulu sebelum kirim agar tick berikutnya tidak double-fire

      try {
        let text = '';
        if (match.type === 'tugas' && match.text) {
          try {
            const { getUserProfile } = await import('./hu-tao-ai.js');
            const { generateAIResponse } = await import('./ai.js');
            const profile = await getUserProfile(cfg.jid);
            const prompt = `[System: Waktunya pengingat: "${match.text}". Buatkan pesan pengingat singkat yang natural sesuai karakter kamu. Langsung sapa dan ingetin, tanpa format kaku.]`;
            const aiRes = await generateAIResponse(prompt, [], { profile });
            text = `🔔 *PENGINGAT*\n\n${aiRes.text}`;
          } catch {
            text = `🔔 *PENGINGAT*\n\n*${match.text}*\n\njangan lupa ya! 😤`;
          }
        } else {
          text = buildMessage(match.type);
        }

        const mentions = cfg.isGroup && cfg.mentions?.length ? cfg.mentions : [];
        if (mentions.length > 0) {
          const mentionText = mentions.map(m => `@${m.split('@')[0]}`).join(' ');
          await sockRef.sendMessage(cfg.jid, { text: `${mentionText} ${text}`, mentions });
        } else {
          await sockRef.sendMessage(cfg.jid, { text });
        }

        // Simpan konteks reminder agar AI bisa lanjut percakapan natural saat user membalas
        setPendingReminderCtx(cfg.jid, { type: match.type, text });
        log.info(`[REMINDER] ✅ Sent "${match.type}" → ${cfg.jid}`);
      } catch (err) {
        log.warn(`[REMINDER] Gagal kirim ke ${cfg.jid}: ${err.message}`);
        firedCache.delete(cacheKey); // hapus dari cache agar bisa retry
      }
    }

    // Cleanup: hapus hanya custom tasks yang sudah dieksekusi hari ini
    // (DEFAULT_SCHEDULE tidak disimpan ke DB, selalu di-merge saat runtime)
    const newCustomTasks = customTasks.filter(s => {
      if (s.date && s.date === dateStr && s.hour === hour && s.minute === minute) return false;
      return true;
    });
    if (newCustomTasks.length !== customTasks.length) {
      try {
        await setReminderConfig(cfg.jid, { schedule: newCustomTasks });
      } catch (err) {
        log.warn(`[REMINDER] Gagal cleanup schedule: ${err.message}`);
      }
    }
  }
}

export function startReminderScheduler(sock) {
  sockRef = sock;
  if (schedulerInterval) clearInterval(schedulerInterval);
  // Cek setiap 10 detik agar lebih presisi
  schedulerInterval = setInterval(tick, 10 * 1000);
  log.info('[REMINDER] Scheduler aktif — cek setiap 10 detik, storage: MongoDB');
}

export function stopReminderScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = null;
}