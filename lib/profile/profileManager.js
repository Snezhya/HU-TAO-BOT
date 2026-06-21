/**
 * Profile Manager
 * Core functions for updating WhatsApp profile
 */
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { log } from '../logger.js';

/**
 * Download image buffer dari imageMessage Baileys
 * @param {object} imageMessage - msg.message.imageMessage
 * @returns {Promise<Buffer>}
 */
export async function downloadImageBuffer(imageMessage) {
  const stream = await downloadContentFromMessage(imageMessage, 'image');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Update profile picture menggunakan Baileys
 * @param {object} sock - Baileys socket
 * @param {Buffer} buffer - Image buffer (JPEG/PNG)
 * @returns {Promise<boolean>}
 */
export async function updateProfilePicture(sock, buffer) {
  try {
    await sock.updateProfilePicture(sock.user.id, buffer);
    log.info('[PROFILE] Foto profil berhasil diperbarui');
    return true;
  } catch (err) {
    log.error(`[PROFILE] Gagal update foto profil: ${err.message}`);
    throw err;
  }
}

/**
 * Update profile name
 * @param {object} sock
 * @param {string} name
 */
export async function updateProfileName(sock, name) {
  try {
    await sock.updateProfileName(name);
    log.info(`[PROFILE] Nama profil diubah ke: "${name}"`);
    return true;
  } catch (err) {
    log.error(`[PROFILE] Gagal update nama: ${err.message}`);
    throw err;
  }
}

/**
 * Update profile status/bio
 * @param {object} sock
 * @param {string} status
 */
export async function updateProfileStatus(sock, status) {
  try {
    await sock.updateProfileStatus(status);
    log.info(`[PROFILE] Status diubah ke: "${status}"`);
    return true;
  } catch (err) {
    log.error(`[PROFILE] Gagal update status: ${err.message}`);
    throw err;
  }
}
