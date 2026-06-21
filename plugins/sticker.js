import sharp from 'sharp';
import { parseCommand, downloadMedia } from '../lib/utils.js';
import { config } from '../lib/config.js';

export default {
  name: 'sticker',
  description: 'Buat sticker dari gambar',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed || !['sticker', 's', 'stiker'].includes(parsed.cmd)) return false;

    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg =
      quoted?.imageMessage ||
      ctx.msg.message?.imageMessage;

    if (!imgMsg) {
      await ctx.reply({ text: `Reply gambar dengan ${config.prefix}sticker` });
      return true;
    }

    await ctx.reply({ text: '⏳ Bikin stiker...' });

    try {
      const fakeMsg = { message: { imageMessage: imgMsg } };
      const { buffer } = await downloadMedia(fakeMsg);

      const webp = await sharp(buffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();

      await ctx.sock.sendMessage(ctx.jid, {
        sticker: webp
      }, { quoted: ctx.msg });

      await ctx.reply({ text: 'Stiker siap~ 🔥😹' });
    } catch (err) {
      await ctx.reply({ text: `Gagal: ${err.message} 🥀` });
    }

    return true;
  }
};
