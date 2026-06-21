/**
 * Menu via Poll — paling stabil di WhatsApp biasa (tombol bisa diklik)
 */
import { getAggregateVotesInPollMessage } from '@whiskeysockets/baileys';
import { formatRowReply } from './menu-data.js';
import { log } from './logger.js';

/** Urutan opsi poll → rowId menu */
export const POLL_OPTIONS = [
  { label: 'AI Chat', rowId: 'menu_ai' },
  { label: 'Downloader', rowId: 'menu_dl' },
  { label: 'Tools', rowId: 'menu_tools' },
  { label: 'Fun / Info', rowId: 'menu_fun' },
  { label: 'Owner', rowId: 'menu_owner' },
  { label: 'Grup', rowId: 'menu_group' }
];

/** rowId gabungan untuk kategori */
export const POLL_ROW_ALIASES = {
  menu_dl: 'menu_yt',
  menu_tools: 'menu_sticker',
  menu_fun: 'menu_level',
  menu_owner: 'menu_mode'
};

const pollRegistry = new Map();

export function buildPollName(stats) {
  return `Hu Tao AI Menu · ${stats.username}`;
}

/**
 * Kirim poll — ini yang tampil sebagai tombol interaktif di HP
 */
export async function sendPollMenu(sock, jid, stats, quoted) {
  const name = buildPollName(stats);
  const values = POLL_OPTIONS.map((o) => o.label);

  const sent = await sock.sendMessage(
    jid,
    {
      poll: {
        name,
        values,
        selectableCount: 1
      }
    },
    { quoted }
  );

  if (sent?.key?.id) {
    pollRegistry.set(sent.key.id, {
      jid,
      message: sent.message,
      options: POLL_OPTIONS,
      at: Date.now()
    });
    // Bersihkan cache lama (>1 jam)
    if (pollRegistry.size > 100) {
      const cutoff = Date.now() - 3600000;
      for (const [k, v] of pollRegistry) {
        if (v.at < cutoff) pollRegistry.delete(k);
      }
    }
  }

  log.success('Poll menu sent');
  return sent;
}

function resolvePollRowId(rowId) {
  if (formatRowReply(rowId)) return rowId;
  const alias = POLL_ROW_ALIASES[rowId];
  if (alias && formatRowReply(alias)) return alias;
  return rowId;
}

function getCategoryHelp(rowId) {
  const line = (id) => {
    const t = formatRowReply(id);
    return t ? t.split('\n\n_')[0] : '';
  };

  const blocks = {
    menu_dl: `*Downloader*\n${line('menu_yt')}\n\n${line('menu_tiktok')}`,
    menu_tools: `*Tools*\n${line('menu_sticker')}\n\n${line('menu_ocr')}\n\n${line('menu_tts')}`,
    menu_fun: `*Fun / Info*\n${line('menu_level')}\n\n${line('menu_profile')}`,
    menu_owner: `*Owner*\n${line('menu_mode')}\n\n${line('menu_premium')}`
  };

  return blocks[rowId] || line(rowId) || line(resolvePollRowId(rowId));
}

/**
 * Daftarkan handler poll vote (panggil sekali di index.js)
 */
export function setupPollMenuHandler(sock) {
  const meId = () => sock.user?.id;

  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
      if (!update?.pollUpdates?.length || !key?.id) continue;

      const cached = pollRegistry.get(key.id);
      if (!cached) continue;

      try {
        const agg = getAggregateVotesInPollMessage(
          { message: cached.message, pollUpdates: update.pollUpdates },
          meId()
        );

        const chosen = agg.find((a) => a.voters?.length > 0);
        if (!chosen) continue;

        const idx = POLL_OPTIONS.findIndex((o) => o.label === chosen.name);
        const opt = POLL_OPTIONS[idx];
        if (!opt) continue;

        const jid = key.remoteJid;
        const help = getCategoryHelp(opt.rowId);
        if (!help) continue;

        await sock.sendMessage(jid, { text: help });
        log.success(`Poll pick: ${chosen.name} → ${opt.rowId}`);
      } catch (err) {
        log.warn(`Poll vote handler: ${err.message}`);
      }
    }
  });
}
