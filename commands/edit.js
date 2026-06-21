import fs from 'node:fs/promises';
import { downloadMedia } from '../lib/utils.js';
import { log } from '../lib/logger.js';
import { editImage } from '../lib/nanobanana.js';

const TMP_PATH = '/tmp/edit_input.jpg';
const GLOBAL_COOLDOWN_MS = 30000;
let lastEditTime = 0;

export default {
  name: 'edit',
  aliases: ['editgambar', 'editimage', 'pix2pix'],
  description: 'Edit gambar menggunakan AI berdasarkan teks instruksi',
  cooldown: 20000,

  async run(ctx, args, parsed) {
    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || ctx.msg.message?.imageMessage;

    const prompt = args.join(' ');

    if (!imgMsg || !prompt) {
      await ctx.reply({
        text: `Kirim gambar dulu dengan caption *${parsed.usedPrefix}${parsed.cmd} [instruksi]*\n\nContoh: *${parsed.usedPrefix}${parsed.cmd} make the sky pink*`
      });
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEditTime;
    if (elapsed < GLOBAL_COOLDOWN_MS) {
      const sisa = Math.ceil((GLOBAL_COOLDOWN_MS - elapsed) / 1000);
      await ctx.reply({ text: `⏳ Sabar ya~ Hu Tao masih istirahat sebentar. Coba lagi dalam *${sisa} detik* ya!` });
      return;
    }
    lastEditTime = now;

    await ctx.reply({ text: '⏳ Hu Tao sedang mengedit gambar kamu dengan AI... Mohon tunggu sebentar ya~' });

    try {
      // 1. Download gambar dari WhatsApp ke buffer
      const fakeMsg = { message: { imageMessage: imgMsg } };
      const { buffer } = await downloadMedia(fakeMsg);

      // 2. Simpan ke /tmp
      await fs.writeFile(TMP_PATH, buffer);

      // 3. Panggil EaseMate AI scraper
      const result = await editImage(TMP_PATH, prompt);

      if (result.Status === true) {
        // 4. Fetch hasil URL dan kirim ke WhatsApp
        const imgRes = await fetch(result.Url);
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

        await ctx.sock.sendMessage(ctx.jid, {
          image: imgBuffer,
          caption: `✅ *Edit Berhasil!*\nInstruksi: _"${prompt}"_\n\n~Hu Tao AI 🥀`
        }, { quoted: ctx.msg });

      } else {
        const errMsg = result.Error || 'Gagal memproses gambar';

        let friendlyMsg = `🥀 Gagal mengedit gambar: ${errMsg}`;
        if (errMsg.includes('Free token') || errMsg.includes('habis')) {
          friendlyMsg = '🥀 Kuota edit gambar gratis hari ini sudah habis. Coba lagi besok ya~';
        } else if (errMsg.includes('Timeout')) {
          friendlyMsg = '🥀 Server terlalu lama merespon. Coba lagi nanti ya~';
        }

        await ctx.reply({ text: friendlyMsg });
      }

    } catch (err) {
      log.error(`Edit Image error: ${err.message}`);
      await ctx.reply({
        text: `🥀 Gagal memproses gambar. Coba lagi nanti ya~\n\n_${err.message}_`
      });
    } finally {
      // 5. Hapus file sementara
      await fs.unlink(TMP_PATH).catch(() => {});
    }
  }
};
