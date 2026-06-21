import axios from 'axios';
import { parseCommand } from '../lib/utils.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';
import { toOpus } from '../lib/audio.js';

export default {
  name: 'ttsai',
  description: 'Text to speech (Kokoro Multilingual via Replicate)',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed || parsed.cmd !== 'ttsai') return false;

    let teks = parsed.args.join(' ');
    
    const quotedMsg = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!teks && quotedMsg) {
      teks = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
    }

    teks = teks.trim();

    if (!teks) {
      await ctx.reply({ text: `Usage: ${config.prefix}ttsai <teks>\nAtau reply pesan dengan ${config.prefix}ttsai` });
      return true;
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      await ctx.reply({ text: 'Set REPLICATE_API_TOKEN in .env first' });
      return true;
    }

    if (teks.length > 300) {
      teks = teks.substring(0, 300);
    }

    await ctx.reply({ text: '⏳ Hu Tao lagi mensintesis suara AI...' });

    try {
      // 1. Create prediction
      const createRes = await axios.post(
        'https://api.replicate.com/v1/predictions',
        {
          version: 'f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13',
          input: {
            text: teks,
            voice: 'af_bella'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let prediction = createRes.data;
      const getUrl = prediction.urls.get;

      // 2. Poll prediction status
      while (
        prediction.status !== 'succeeded' &&
        prediction.status !== 'failed' &&
        prediction.status !== 'canceled'
      ) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2s
        const pollRes = await axios.get(getUrl, {
          headers: {
            'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`
          }
        });
        prediction = pollRes.data;
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(prediction.error || `Prediction ${prediction.status}`);
      }

      // 3. Download the audio URL
      // Replicate typically returns output as URL string for audio tasks, or sometimes array.
      // We assume it's a direct URL based on standard Replicate audio models.
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) {
        throw new Error('Tidak ada output audio dari API');
      }

      const audioRes = await axios.get(outputUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const { buffer, mimetype } = await toOpus(Buffer.from(audioRes.data));

      // 4. Send as WhatsApp PTT
      await ctx.sock.sendMessage(ctx.jid, {
        audio: buffer,
        mimetype,
        ptt: true
      }, { quoted: ctx.msg });
      
    } catch (err) {
      log.error(`Kokoro TTS (Replicate) Error: ${err.message}`);
      let errorMsg = err.message;
      if (err.response && err.response.data) {
        errorMsg = err.response.data.detail || err.response.data.error || errorMsg;
      }
      await ctx.reply({ text: `TTS AI gagal: ${errorMsg} 🥀` });
    }

    return true;
  }
};
