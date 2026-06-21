import Tesseract from 'tesseract.js';
import { parseCommand, downloadMedia } from '../lib/utils.js';
import { config } from '../lib/config.js';

export default {
  name: 'ocr',
  description: 'OCR teks dari gambar',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed || parsed.cmd !== 'ocr') return false;

    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || ctx.msg.message?.imageMessage;

    if (!imgMsg) {
      await ctx.reply({ text: `Reply gambar dengan ${config.prefix}ocr` });
      return true;
    }

    await ctx.reply({ text: '⏳ Hu Tao lagi baca gambar...' });

    try {
      const fakeMsg = { message: { imageMessage: imgMsg } };
      const { buffer } = await downloadMedia(fakeMsg);

      const { data: { text } } = await Tesseract.recognize(buffer, 'ind+eng', {
        logger: () => {}
      });

      const result = text?.trim() || '(tidak ada teks terdeteksi)';
      await ctx.reply({
        text: `📖 *Hasil OCR:*\n\n${result}\n\n~Hu Tao AI 🥀`
      });
    } catch (err) {
      await ctx.reply({ text: `OCR gagal: ${err.message}` });
    }

    return true;
  }
};
