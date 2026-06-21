import { config, isOwner } from '../lib/config.js';
import { LINK_REGEX } from '../lib/utils.js';
import { getSettings, getGroup } from '../lib/database.js';
import { log } from '../lib/logger.js';

export default {
  name: 'antilink',
  description: 'Hapus pesan berisi link di grup',
  priority: 1,
  publicOnly: false,

  async run(ctx) {
    if (!ctx.group || ctx.fromMe) return false;
    if (ctx.isOwner) return false;

    // Cek setting per-grup dulu
    const groupData = await getGroup(ctx.jid);
    if (groupData.antilink === false) return false;

    // Jika per-grup belum diset (null), cek global settings
    if (groupData.antilink === null) {
      const settings = await getSettings();
      if (settings.antilink === false) return false;

      const groups = config.antilinkGroups;
      if (groups.length && !groups.includes(ctx.jid)) return false;
    }

    if (!LINK_REGEX.test(ctx.text)) {
      LINK_REGEX.lastIndex = 0;
      return false;
    }
    LINK_REGEX.lastIndex = 0;

    let deleted = false;
    try {
      await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key });
      deleted = true;
    } catch (err) {
      log.warn(`Antilink delete gagal (butuh admin?): ${err.message}`);
    }

    await ctx.reply({
      text: deleted
        ? '🥀 Jangan kirim link sembarangan di grup~'
        : '🥀 Link tidak diizinkan. (Bot perlu jadi admin grup untuk hapus pesan)'
    });

    return true;
  }
};
