import { getGroup, saveGroup } from '../lib/database.js';

export default {
  name: 'welcome',
  aliases: ['goodbye'],
  description: 'Aktifkan/nonaktifkan pesan welcome atau goodbye di grup',
  groupOnly: true,

  async run(ctx, args, parsed) {
    // 1. Cek apakah sender adalah admin grup atau owner bot
    const metadata = await ctx.sock.groupMetadata(ctx.jid);
    const participant = metadata.participants.find((p) => p.id === ctx.sender);
    const isAdmin =
      participant?.admin === 'admin' ||
      participant?.admin === 'superadmin' ||
      ctx.isOwner;

    if (!isAdmin) {
      await ctx.reply({ text: 'Hanya admin grup yang bisa mengatur fitur ini~ 😹' });
      return;
    }

    const action = args[0]?.toLowerCase();
    if (!['on', 'off', 'aktif', 'nonaktif'].includes(action)) {
      await ctx.reply({
        text: `Usage:\n${parsed.usedPrefix}${parsed.cmd} on/off`
      });
      return;
    }

    const value = ['on', 'aktif'].includes(action);
    const isWelcome = parsed.cmd === 'welcome';

    if (isWelcome) {
      await saveGroup(ctx.jid, { welcome: value });
      await ctx.reply({
        text: `Pesan *Welcome* telah di-${value ? 'aktifkan' : 'nonaktifkan'} untuk grup ini! 🔥`
      });
    } else {
      await saveGroup(ctx.jid, { goodbye: value });
      await ctx.reply({
        text: `Pesan *Goodbye* telah di-${value ? 'aktifkan' : 'nonaktifkan'} untuk grup ini! 🥀`
      });
    }
  }
};
