import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { config } from './config.js';

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatJid(number) {
  const n = String(number).replace(/\D/g, '');
  return `${n}@s.whatsapp.net`;
}

export function getSender(msg) {
  return msg.key.participant || msg.key.remoteJid;
}

export function isGroup(jid) {
  return String(jid).endsWith('@g.us');
}

export function parseCommand(text, prefix, altPrefix = '.') {
  const prefixes = [prefix, altPrefix].filter(Boolean);
  for (const p of prefixes) {
    if (!text?.startsWith(p)) continue;
    const body = text.slice(p.length).trim();
    const [cmd, ...args] = body.split(/\s+/);
    return { cmd: cmd.toLowerCase(), args, body, usedPrefix: p };
  }
  return null;
}

export async function downloadMedia(msg, type = 'buffer') {
  const mimetype =
    msg.message?.imageMessage?.mimetype ||
    msg.message?.videoMessage?.mimetype ||
    msg.message?.audioMessage?.mimetype ||
    msg.message?.documentMessage?.mimetype;

  const mediaType = Object.keys(msg.message || {})[0]?.replace('Message', '') || 'document';

  const stream = await downloadContentFromMessage(
    msg.message[Object.keys(msg.message)[0]],
    mediaType
  );

  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  return { buffer, mimetype };
}

export function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function levelBar(xp, level) {
  const needed = level * 100;
  const pct = Math.min(100, Math.floor((xp / needed) * 100));
  const filled = Math.floor(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`;
}

export const LINK_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

export function getCurrentTimeContext() {
  const now = new Date();
  const tz = config.timezone || 'Asia/Jakarta';
  
  const jam = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz
  });
  const hari = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    timeZone: tz
  });
  const tanggal = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz
  });

  const jamSekarang = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: tz }).format(now),
    10
  );

  let periode = 'malam';
  if (jamSekarang >= 5 && jamSekarang < 11) periode = 'pagi';
  else if (jamSekarang >= 11 && jamSekarang < 15) periode = 'siang';
  else if (jamSekarang >= 15 && jamSekarang < 18) periode = 'sore';

  return `${hari}, ${tanggal}, jam ${jam} WIB (${periode})`;
}
