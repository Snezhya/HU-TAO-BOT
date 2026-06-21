/**
 * Hu Tao AI — Menu gambar + teks (caption)
 */
import { config } from './config.js';
import { isPremium } from './database.js';
import { getRuntime } from './runtime.js';
import { delay } from './utils.js';
import { log } from './logger.js';
import { buildListSections, FOOTER } from './menu-data.js';
import {
  ensureMenuMedia,
  readMenuImage,
  readMenuGif,
  validateMenuMedia
} from './menu-media.js';
import { sendInteractiveList } from './menu-list.js';

export { formatRowReply, extractListRowId, ROW_REPLIES } from './menu-data.js';

export function countTotalFeatures() {
  return buildListSections().reduce((n, s) => n + s.rows.length, 0);
}

/** Teks menu lengkap (dipakai sebagai caption gambar) */
export function buildMenuText(stats) {
  const p = config.prefix;
  const alt = config.altPrefix || '.';

  const cmds = buildListSections()
    .map((sec) => {
      const lines = sec.rows
        .map((r) => {
          if (r.description && r.title) {
            return `  • ${r.description} → ${r.title}`;
          }
          return `  • ${r.description || r.title}`;
        })
        .join('\n');
      return `「 ${sec.title} 」\n${lines}`;
    })
    .join('\n\n');

  return `┏━━━━━━━━━━━━━━━━┓
┃  *HU TAO AI*  🥀         
┗━━━━━━━━━━━━━━━━┛

👤 ${stats.username}
⚡ ${stats.ping}ms · ⏱ ${stats.runtime}
🧩 ${stats.totalFeatures} fitur
🌐 Mode *${stats.mode}*
📌 Prefix \`${p}\` / \`${alt}\`

*Commands*
${cmds}

_${FOOTER}_`;
}

export async function gatherMenuStats(ctx) {
  const t0 = Date.now();
  try {
    await ctx.sock.profilePictureUrl(ctx.sender).catch(() => null);
  } catch {
    /* ignore */
  }
  const ping = Date.now() - t0;
  const username = ctx.msg.pushName || ctx.sender.split('@')[0];

  return {
    username,
    ping,
    runtime: getRuntime(),
    totalFeatures: countTotalFeatures(),
    premium: isPremium(ctx.sender) ? 'Premium' : 'Free',
    mode: config.mode,
    prefix: config.prefix
  };
}

/** Gambar banner + caption teks menu */
export async function sendImageMenu(ctx, stats) {
  await ensureMenuMedia();
  const image = readMenuImage();
  const caption = buildMenuText(stats);

  log.info(`Menu image+caption: ${image.length} bytes`);

  return ctx.sock.sendMessage(
    ctx.jid,
    { image, caption },
    { quoted: ctx.msg }
  );
}

/** GIF + caption (opsional) */
export async function sendGifMenu(ctx, stats, gifBuffer) {
  const gif = gifBuffer || readMenuGif();
  if (!gif) throw new Error('GIF tidak ada');

  return ctx.sock.sendMessage(
    ctx.jid,
    { video: gif, gifPlayback: true, caption: buildMenuText(stats) },
    { quoted: ctx.msg }
  );
}

export async function sendTextMenu(ctx, stats) {
  return ctx.sock.sendMessage(
    ctx.jid,
    { text: buildMenuText(stats) },
    { quoted: ctx.msg }
  );
}

/** Menu: gambar + teks di caption (fallback teks jika gambar gagal) */
export async function showFullMenu(ctx) {
  const stats = await gatherMenuStats(ctx);
  const style = (config.menu.style || 'auto').toLowerCase();

  try {
    await ctx.sock.sendPresenceUpdate('composing', ctx.jid).catch(() => {});

    if (config.menu.interactive) {
      try {
        await sendInteractiveList(ctx.sock, ctx.jid, ctx.msg, stats);
        await ctx.sock.sendPresenceUpdate('paused', ctx.jid).catch(() => {});
        return;
      } catch (err) {
        log.warn(`Interactive menu failed, falling back to image/gif menu: ${err.message}`);
      }
    }

    if (!validateMenuMedia().image) {
      await ensureMenuMedia();
    }

    await delay(400);

    try {
      const gifData = readMenuGif();
      if ((style === 'gif' || style === 'auto') && gifData) {
        await sendGifMenu(ctx, stats, gifData);
      } else {
        await sendImageMenu(ctx, stats);
      }
      log.success('Menu image + text sent');
    } catch (err) {
      log.error(`Menu image failed: ${err.message} — fallback text`);
      await ensureMenuMedia();
      try {
        await sendImageMenu(ctx, stats);
        log.success('Menu image + text sent (retry)');
      } catch {
        await sendTextMenu(ctx, stats);
        log.warn('Menu text-only fallback');
      }
    }

    await ctx.sock.sendPresenceUpdate('paused', ctx.jid).catch(() => {});
  } catch (err) {
    log.error(`Menu: ${err.message}`);
    await sendTextMenu(ctx, stats).catch(() => {});
  }
}
