/**
 * feature-toggle.js — Single source of truth untuk per-chat feature toggle (Public Bot)
 *
 * Di public bot, default semua fitur adalah ON.
 */

import { ChatSettings } from './db/models.js';
import { log } from './logger.js';

// ─── Konstanta ────────────────────────────────────────────────────────────────

/** Fitur yang HANYA bisa di-toggle oleh owner (bukan group admin) */
const OWNER_ONLY_TOGGLE = new Set(['rvo']);

// ─── State internal ───────────────────────────────────────────────────────────

/** Semua nama fitur yang terdaftar (diisi setelah loadModules) */
let registeredFeatures = [];

/** In-memory cache: jid → { featureName: boolean } */
const cache = new Map();

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Daftarkan semua nama fitur dari modules yang di-load.
 * Dipanggil SEKALI saat startup setelah commands + plugins dimuat.
 * @param {string[]} names
 */
export function registerFeatures(names) {
  registeredFeatures = [...new Set(names.filter(Boolean))].sort();
  log.info(`[FeatureToggle] ${registeredFeatures.length} fitur terdaftar: ${registeredFeatures.join(', ')}`);
}

/** Kembalikan semua nama fitur yang terdaftar (read-only copy) */
export function getAllRegisteredFeatures() {
  return [...registeredFeatures];
}

/** Apakah fitur ini hanya bisa di-toggle oleh owner? */
export function isOwnerOnlyToggle(featureName) {
  return OWNER_ONLY_TOGGLE.has(featureName);
}

/** Apakah fitur ini DEFAULT ON? Di public bot, semua default ON. */
export function isDefaultOn(featureName) {
  return true;
}

// ─── Read ──────────────────────────────────────────────────────────────────────

/**
 * Ambil settings semua fitur untuk JID tertentu.
 * Hasil: { featureName: boolean, ... }
 * Jika JID belum punya dokumen di DB, kembalikan defaults (semua ON).
 * @param {string} jid
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getSettings(jid) {
  if (cache.has(jid)) return cache.get(jid);

  try {
    const doc = await ChatSettings.findOne({ jid }).lean();
    const featureMap = (doc?.features && typeof doc.features === 'object') ? doc.features : {};
    const settings = {};

    for (const feature of registeredFeatures) {
      settings[feature] = Object.prototype.hasOwnProperty.call(featureMap, feature)
        ? Boolean(featureMap[feature])
        : true; // Default ON untuk semua fitur di public bot
    }

    cache.set(jid, settings);
    return settings;
  } catch (err) {
    log.error(`[FeatureToggle] getSettings error (${jid}): ${err.message}`);
    const defaults = {};
    for (const f of registeredFeatures) defaults[f] = true;
    return defaults;
  }
}

/**
 * Cek apakah satu fitur aktif untuk JID tertentu.
 * Jika fitur belum terdaftar → biarkan lewat (backward compat).
 * @param {string} jid
 * @param {string} featureName
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(jid, featureName) {
  if (!registeredFeatures.includes(featureName)) return true;
  const settings = await getSettings(jid);
  return settings[featureName] ?? true;
}

// ─── Write ─────────────────────────────────────────────────────────────────────

/**
 * Set status satu fitur untuk JID tertentu.
 * @param {string} jid
 * @param {string} featureName
 * @param {boolean} enabled
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function setFeature(jid, featureName, enabled) {
  if (!registeredFeatures.includes(featureName)) {
    return { ok: false, message: `Fitur *${featureName}* tidak ditemukan` };
  }

  try {
    await ChatSettings.findOneAndUpdate(
      { jid },
      { $set: { [`features.${featureName}`]: enabled, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    // Update cache
    if (cache.has(jid)) cache.get(jid)[featureName] = enabled;

    return { ok: true };
  } catch (err) {
    log.error(`[FeatureToggle] setFeature error: ${err.message}`);
    return { ok: false, message: err.message };
  }
}

/**
 * Set banyak fitur sekaligus untuk JID tertentu.
 * @param {string} jid
 * @param {Record<string, boolean>} updates  — { featureName: boolean }
 * @returns {Promise<{ ok: boolean, message?: string, invalid?: string[] }>}
 */
export async function setFeatures(jid, updates) {
  const invalid = Object.keys(updates).filter(f => !registeredFeatures.includes(f));
  if (invalid.length) {
    return { ok: false, message: `Fitur tidak ditemukan: ${invalid.join(', ')}`, invalid };
  }

  try {
    const setObj = { updatedAt: new Date() };
    for (const [f, v] of Object.entries(updates)) setObj[`features.${f}`] = v;

    await ChatSettings.findOneAndUpdate(
      { jid },
      { $set: setObj },
      { upsert: true, new: true }
    );

    // Update cache
    if (cache.has(jid)) {
      const cached = cache.get(jid);
      for (const [f, v] of Object.entries(updates)) cached[f] = v;
    }

    return { ok: true };
  } catch (err) {
    log.error(`[FeatureToggle] setFeatures error: ${err.message}`);
    return { ok: false, message: err.message };
  }
}

/** Hapus cache untuk JID tertentu (paksa re-read dari DB) */
export function invalidateCache(jid) {
  cache.delete(jid);
}