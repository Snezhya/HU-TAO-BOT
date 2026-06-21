import axios from 'axios';
import { parseCommand, downloadMedia } from '../lib/utils.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';

export default {
  name: 'upscale',
  aliases: ['hd', 'remini', 'enhance'],
  description: 'Meningkatkan resolusi gambar (HD) menggunakan AI',
  cooldown: 10000, // 10s cooldown since AI requests are heavy

  async run(ctx, args, parsed) {
    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || ctx.msg.message?.imageMessage;

    if (!imgMsg) {
      await ctx.reply({
        text: `Reply gambar dengan caption *${parsed.usedPrefix}${parsed.cmd}* untuk memperjelas resolusi!`
      });
      return;
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      await ctx.reply({
        text: `🥀 Fitur Upscale memerlukan *REPLICATE_API_TOKEN* di file .env.\n\n` +
              `Cara mendapatkannya:\n` +
              `1. Daftar di https://replicate.com\n` +
              `2. Salin API Token dari dashboard Anda\n` +
              `3. Tambahkan ke file .env:\n` +
              `   REPLICATE_API_TOKEN=r8_xxx...`
      });
      return;
    }

    await ctx.reply({ text: '⏳ Hu Tao sedang memperjelas gambar kamu dengan AI... Mohon tunggu~' });

    try {
      // 1. Download gambar dari WhatsApp
      const fakeMsg = { message: { imageMessage: imgMsg } };
      const { buffer, mimetype } = await downloadMedia(fakeMsg);

      // Convert to base64 Data URI
      const base64Data = buffer.toString('base64');
      const dataUri = `data:${mimetype || 'image/jpeg'};base64,${base64Data}`;

      // 2. Kirim request ke Replicate API
      // Menggunakan model nightmareai/real-esrgan (upscaler + face enhancement opsional)
      const response = await axios.post(
        'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions',
        {
          input: {
            image: dataUri,
            scale: 2, // 2x upscale is faster and safer for size limits
            face_enhance: true
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${replicateToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait' // Meminta Replicate memproses secara synchronous jika selesai cepat
          },
          timeout: 60000
        }
      );

      let prediction = response.data;
      let attempts = 0;

      // 3. Polling jika belum selesai (status: starting/processing)
      while (
        prediction.status !== 'succeeded' &&
        prediction.status !== 'failed' &&
        prediction.status !== 'canceled' &&
        attempts < 30
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const pollRes = await axios.get(
          `https://api.replicate.com/v1/predictions/${prediction.id}`,
          {
            headers: {
              'Authorization': `Bearer ${replicateToken}`
            }
          }
        );
        prediction = pollRes.data;
        attempts++;
      }

      if (prediction.status === 'succeeded') {
        const outputUrl = prediction.output;
        // output can be a string URL or an array of URLs
        const imageUrl = Array.isArray(outputUrl) ? outputUrl[0] : outputUrl;

        if (!imageUrl) {
          throw new Error('Hasil upscale tidak ditemukan');
        }

        await ctx.sock.sendMessage(ctx.jid, {
          image: { url: imageUrl },
          caption: `✅ *Upscale Berhasil!*\nResolusi gambar telah ditingkatkan menggunakan AI.\n\n~Hu Tao AI 🥀`
        }, { quoted: ctx.msg });
      } else {
        throw new Error(prediction.error || 'Proses AI gagal');
      }

    } catch (err) {
      log.error(`Upscale error: ${err.message}`);
      
      const errorMessage = (err.response?.data?.detail || err.message || '').toLowerCase();
      let replyText = `🥀 Gagal memproses gambar: ${err.response?.data?.detail || err.message}`;
      
      if (errorMessage.includes('insufficient credit')) {
        replyText = '🥀 Fitur upscale sedang tidak tersedia karena telah mencapai batas. Coba lagi nanti ya~';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        replyText = '🥀 Terlalu banyak request. Tunggu sebentar ya~';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
        replyText = '🥀 Request timeout, server lagi lambat. Coba lagi ya~';
      }

      await ctx.reply({ text: replyText });
    }
  }
};
