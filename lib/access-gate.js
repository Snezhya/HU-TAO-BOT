/**
 * access-gate.js — Utilitas gate akses berbasis access mode
 *
 * Dipakai di command/plugin untuk mengecek apakah sender diizinkan
 * menggunakan sebuah fitur berdasarkan mode 'self' atau 'public'.
 */

import { getAccessMode } from './feature-toggle.js';
import { isOwner } from './config.js';

/**
 * Cek apakah sender diizinkan menggunakan fitur tertentu.
 *
 * Mode resolution:
 *   'public' → semua orang boleh
 *   'self'   → hanya owner bot
 *
 * @param {string} jid        - chat JID (grup atau private)
 * @param {string} feature    - nama fitur (contoh: 'rvo')
 * @param {string} senderJid  - JID pengirim pesan
 * @returns {Promise<boolean>}
 */
export async function canAccess(jid, feature, senderJid) {
  const mode = await getAccessMode(jid, feature);
  if (mode === 'public') return true;
  if (mode === 'self') return isOwner(senderJid);
  return false;
}
