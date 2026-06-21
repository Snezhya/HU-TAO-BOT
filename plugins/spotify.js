import axios from 'axios';
import { parseCommand } from '../lib/utils.js';
import { config } from '../lib/config.js';
import { checkCooldown } from '../lib/cooldown.js';

// ─── Spotify Downloader ───────────────────────────────────────────────────────
// Base: https://musicfab.io

const SPOTIFY_API = 'https://musicfab.io/api/spotify';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

async function spotifyDownload(url) {
  const response = await axios.post(
    SPOTIFY_API,
    { url },
    {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Origin': 'https://musicfab.io',
        'Referer': 'https://musicfab.io/',
        'Sec-CH-UA': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        'Sec-CH-UA-Mobile': '?1',
        'Sec-CH-UA-Platform': '"Android"',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 60000,
      validateStatus: () => true
    }
  );

  const metadata = response.data?.data?.metadata || null;
  if (!metadata?.download) {
    throw new Error('Gagal mendapatkan link download dari Spotify');
  }

  return {
    downloadUrl: metadata.download,
    name: metadata.name || 'Unknown',
    artist: metadata.artist || 'Unknown',
    album: metadata.album || 'Unknown',
    duration: metadata.duration || null,
    image: metadata.image || null
  };
}

export default {
  name: 'spotify',
  description: 'Download lagu dari Spotify',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed) return false;

    if (parsed.cmd !== 'spdl') return false;

    const url = parsed.args[0];
    if (!url) {
      await ctx.reply({
        text: `❌ Masukkan URL Spotify!\nContoh: ${config.prefix}spdl https://open.spotify.com/track/...`
      });
      return true;
    }

    if (!url.includes('spotify.com')) {
      await ctx.reply({ text: '❌ URL tidak valid. Pastikan link dari Spotify ya~' });
      return true;
    }

    const cd = checkCooldown(ctx.sender, 'spdl', 30000);
    if (!cd.ok) {
      await ctx.reply({ text: `⏳ Cooldown ${cd.remaining}s dulu ya~ 😹` });
      return true;
    }

    await ctx.reply({ text: '🎵 Hu Tao lagi download lagu Spotify, bentar ya~' });

    try {
      const result = await spotifyDownload(url);

      const caption = `✅ *Spotify Downloader*\n\n🎵 *${result.name}*\n👤 ${result.artist}\n💿 ${result.album}${result.duration ? '\n⏱️ ' + result.duration : ''}\n\n~Hu Tao AI 🔥`;

      if (result.image) {
        await ctx.sock.sendMessage(ctx.jid, {
          image: { url: result.image },
          caption
        }, { quoted: ctx.msg });
      } else {
        await ctx.reply({ text: caption });
      }

      await ctx.sock.sendMessage(ctx.jid, {
        audio: { url: result.downloadUrl },
        mimetype: 'audio/mpeg',
        fileName: `${result.name} - ${result.artist}.mp3`
      }, { quoted: ctx.msg });

    } catch (err) {
      await ctx.reply({ text: `🥀 Gagal download Spotify: ${err.message}` });
    }

    return true;
  }
};