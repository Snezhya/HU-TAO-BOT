import axios from 'axios';
import { parseCommand } from '../lib/utils.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';
import { toOpus } from '../lib/audio.js';

const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const DEFAULT_SPEAKER = 1; // Zundamon

export default {
  name: 'tts',
  description: 'Text to speech (VoiceVox Anime Voice)',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed || parsed.cmd !== 'tts') return false;

    let teks = parsed.args.join(' ');
    
    const quotedMsg = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!teks && quotedMsg) {
      teks = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
    }

    teks = teks.trim();

    if (!teks) {
      await ctx.reply({ text: `Usage: ${config.prefix}tts <teks>\nAtau reply pesan dengan ${config.prefix}tts` });
      return true;
    }

    if (teks.length > 300) {
      teks = teks.substring(0, 300);
    }

    await ctx.reply({ text: '⏳ Hu Tao lagi rekam suara (VoiceVox)...' });

    try {
      // 1. Dapatkan query JSON
      const queryRes = await axios.post(
        `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(teks)}&speaker=${DEFAULT_SPEAKER}`,
        null,
        { timeout: 15000 }
      );

      // 2. Synthesis ke WAV
      const synthRes = await axios.post(
        `${VOICEVOX_URL}/synthesis?speaker=${DEFAULT_SPEAKER}`,
        queryRes.data,
        {
          responseType: 'arraybuffer',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'audio/wav'
          },
          timeout: 30000
        }
      );

      // 3. Konversi ke Opus/MP3 agar WhatsApp bisa putar (PTT)
      const { buffer, mimetype } = await toOpus(Buffer.from(synthRes.data));

      // 4. Kirim sebagai PTT
      await ctx.sock.sendMessage(ctx.jid, {
        audio: buffer,
        mimetype,
        ptt: true
      }, { quoted: ctx.msg });
    } catch (err) {
      log.error(`VoiceVox TTS Error: ${err.message}`);
      if (err.code === 'ECONNREFUSED' || err.message.includes('timeout')) {
        await ctx.reply({ text: 'VoiceVox server offline 🎐' });
      } else {
        await ctx.reply({ text: `TTS gagal: ${err.message} 🥀` });
      }
    }

    return true;
  }
};
