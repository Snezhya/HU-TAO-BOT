import { bratGen } from 'brat-canvas';
import { log } from '../lib/logger.js';

export default {
  name: 'brat',
  aliases: ['bratimage'],
  description: 'Buat gambar dengan gaya teks album brat',
  cooldown: 5000,

  async run(ctx, args, parsed) {
    const text = args.join(' ');

    if (!text) {
      await ctx.reply({
        text: `Kirim teks dulu! Contoh: *${parsed.usedPrefix}${parsed.cmd} good morning*`
      });
      return;
    }

    try {
      // 1. Generate brat image as buffer
      const buf = await bratGen(text, { BLUR: 0 });

      // 2. Send the buffer directly to WhatsApp
      await ctx.sock.sendMessage(ctx.jid, {
        image: buf,
        caption: `🍏 *Brat Image*`
      }, { quoted: ctx.msg });

    } catch (err) {
      log.error(`Brat error: ${err.message}`);
      await ctx.reply({
        text: `🥀 Gagal membuat gambar brat: ${err.message}`
      });
    }
  }
};
