import { bratVid } from 'brat-canvas/video';
import { log } from '../lib/logger.js';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';

process.env.FFMPEG_PATH = ffmpegInstaller.path;
console.log('[bratvid] ffmpeg path:', ffmpegInstaller.path);
export default {
  name: 'bratvid',
  aliases: ['bratvideo'],
  description: 'Buat video lirik dengan gaya teks album brat',
  cooldown: 15000,

  async run(ctx, args, parsed) {
    const text = args.join(' ');

    if (!text) {
      await ctx.reply({
        text: `Kirim teks dulu! Contoh: *${parsed.usedPrefix}${parsed.cmd} just friend ygy*`
      });
      return;
    }

    await ctx.reply({ text: '⏳ Generating brat video... Mohon tunggu sebentar ya~' });

    try {
      // 1. Generate brat video as buffer
      const buf = await bratVid(text, {
        outputFormat: 'mp4',
        fast_progress: true, // true untuk render lebih cepat
        lyric: {
          maxWordPerLayer: 5,
          frameDuration: 0.7,
          lastFrameDuration: 1.5
        },
        brat: { BLUR: 0 },
        onProgress: ({ current, total, text }) => {
          // Opsional: log progress
          // console.log(`Progress: ${current}/${total} - ${text}`);
        }
      });

      // 2. Send the buffer directly to WhatsApp as a video
      await ctx.sock.sendMessage(ctx.jid, {
        video: buf,
        mimetype: 'video/mp4',
        caption: `🍏 *Brat Video*`
      }, { quoted: ctx.msg });

    } catch (err) {
      log.error(`BratVid error: ${err.message}`);
      await ctx.reply({
        text: `🥀 Gagal membuat video brat: ${err.message}`
      });
    }
  }
};
