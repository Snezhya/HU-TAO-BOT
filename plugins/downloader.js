import axios from 'axios';
import { parseCommand } from '../lib/utils.js';
import { config } from '../lib/config.js';
import { checkCooldown } from '../lib/cooldown.js';
import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import * as cheerio from 'cheerio';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const pendingSlideshow = new Map();
const pendingInstagram = new Map();

// ─── AIO Downloader (downr.org) ───────────────────────────────────────────────

const BASE = 'https://downr.org';
const ANALYTICS = `${BASE}/.netlify/functions/analytics`;
const DOWNLOAD = `${BASE}/.netlify/functions/download`;
const NYT = `${BASE}/.netlify/functions/nyt`;

const UA = 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36';

function parseCookie(setCookie = []) {
  return setCookie.map(v => v.split(';')[0]).join('; ');
}

function parseData(data) {
  if (typeof data !== 'string') return data;
  const text = data.trim();
  try { return JSON.parse(text); } catch { return text; }
}

function isOk(status, data) {
  const isObject = data && typeof data === 'object';
  if (status < 200 || status >= 300) return false;
  if (!data || data === 'error' || data === 'failed' || data === 'user_retry_required') return false;
  if (isObject && data.error) return false;
  if (isObject && data.status === false) return false;
  if (isObject && data.success === false) return false;
  return true;
}

function getError(data, status) {
  if (typeof data === 'string') return data || `HTTP ${status}`;
  if (data && typeof data === 'object') return data.message || data.error || data.status || data.reason || `HTTP ${status}`;
  return `HTTP ${status}`;
}

async function getCookie() {
  const res = await axios.get(ANALYTICS, {
    timeout: 30000,
    validateStatus: () => true,
    responseType: 'text',
    transformResponse: [v => v],
    headers: { accept: '*/*', referer: `${BASE}/`, 'user-agent': UA }
  });
  return parseCookie(res.headers['set-cookie'] || []);
}

async function postEndpoint(endpoint, url, cookie = '') {
  const res = await axios.post(endpoint, { url }, {
    timeout: 120000,
    validateStatus: () => true,
    responseType: 'text',
    transformResponse: [v => v],
    headers: {
      accept: '*/*',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/json',
      cookie,
      origin: BASE,
      referer: `${BASE}/`,
      'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': UA
    }
  });
  return { endpoint, status: res.status, data: parseData(res.data) };
}

async function tryDownload(url) {
  let cookie = await getCookie();
  let result = await postEndpoint(DOWNLOAD, url, cookie);
  if (isOk(result.status, result.data)) return result;

  cookie = await getCookie();
  result = await postEndpoint(DOWNLOAD, url, cookie);
  if (isOk(result.status, result.data)) return result;

  result = await postEndpoint(NYT, url, cookie);
  return result;
}

async function downr(url) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) throw new Error('Invalid url.');
    const result = await tryDownload(url);
    const ok = isOk(result.status, result.data);
    return {
      Status: ok,
      Code: result.status,
      Input: url,
      Endpoint: result.endpoint,
      Result: ok ? result.data : null,
      Error: ok ? null : getError(result.data, result.status)
    };
  } catch (err) {
    return {
      Status: false,
      Code: err.response?.status || 500,
      Input: url || null,
      Endpoint: null,
      Result: null,
      Error: err.message
    };
  }
}

// ─── Helper: send media from AIO result ──────────────────────────────────────

async function sendAioResult(ctx, aio, platform = '') {
  const r = aio.Result;
  if (!r) return false;

  console.log('[AIO Result]', JSON.stringify(r, null, 2));

  // TAMBAH: deteksi slideshow AIO
  if (platform === 'TikTok' && r.medias && Array.isArray(r.medias)) {
    const images = r.medias.filter(m => m.type === 'image').map(m => m.url);
    const audioObj = r.medias.find(m => m.type === 'audio');
    const audioUrl = audioObj?.url || null;
    const audioDuration = audioObj?.duration || null; // AIO sudah include duration di medias[]

    if (images.length > 0) {
      const title = r.title || 'TikTok';

      const timeoutId = setTimeout(async () => {
        pendingSlideshow.delete('tt:' + ctx.jid);
        await ctx.reply({ text: "⏰ Waktu pemilihan habis, silakan kirim ulang link-nya ya~" });
      }, 60000);

      pendingSlideshow.set('tt:' + ctx.jid, { images, audioUrl, audioDuration, title, author: r.author || '', timeoutId });

      await ctx.reply({
        text: `📸 *TikTok Slideshow terdeteksi!*\n_${title}_\nTerdapat *${images.length} foto* dengan musik.\n\nMau didownload gimana?\n*.gabung* — foto + musik digabung jadi 1 video .mp4\n*.pisah* — foto dikirim satu per satu + audio terpisah\n*.tt1*, *.tt2*, dst — download foto tertentu aja\n\n_(pilihan otomatis batal dalam 60 detik)_`
      });
      return true;
    }
  }

  // TAMBAH: deteksi Instagram carousel & Reels
  if (platform === 'Instagram' && r.medias && Array.isArray(r.medias)) {
    const images = r.medias.filter(m => m.type === 'image');

    console.log('[IG Debug] total medias:', r.medias.length);
    console.log('[IG Debug] images found:', images.length);
    console.log('[IG Debug] medias types:', r.medias.map(m => m.type));

    // Untuk video: ambil yang type video, pilih yang bukan pure audio stream
    // URL pertama di medias biasanya progressive (ada video+audio)
    const videoItem = r.medias.find(m => m.type === 'video' && m.extension === 'mp4');

    if (videoItem) {
      try {
        await ctx.reply({ text: '⏳ Download video Instagram, bentar ya...' });
        const res = await axios.get(videoItem.url, {
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.instagram.com/'
          }
        });
        const buffer = Buffer.from(res.data);
        await ctx.sock.sendMessage(ctx.jid, {
          video: buffer,
          mimetype: 'video/mp4',
          caption: `✅ *Instagram Reels*\n👤 ${r.author || r.owner?.username || ''}\n📝 ${r.title || ''}\n\n~Hu Tao AI 🔥`
        }, { quoted: ctx.msg });
        return true;
      } catch (err) {
        // lanjut ke fallback atau log error jika mau
        console.error('Failed to download IG video buffer:', err.message);
      }
    }

    if (images.length >= 1) {
      const title = r.title || 'Instagram Post';
      const timeoutId = setTimeout(async () => {
        pendingInstagram.delete('ig:' + ctx.jid);
        await ctx.reply({ text: "⏰ Waktu pemilihan habis, silakan kirim ulang link-nya ya~" });
      }, 60000);

      pendingInstagram.set('ig:' + ctx.jid, { images: images.map(m => m.url), title, author: r.author || r.owner?.username || '', timeoutId });

      await ctx.reply({
        text: `🖼️ *Instagram Carousel terdeteksi!*\n_${title}_\nTerdapat *${images.length} foto*\n\nMau didownload gimana?\n*.igall* — download semua foto sekaligus\n*.ig1*, *.ig2*, *.ig3* — download foto tertentu (sesuai nomornya)\n\n_(pilihan otomatis batal dalam 60 detik)_`
      });
      return true;
    }
  }

  // Result bisa berupa array URL, object dengan field url/video/audio, atau langsung string URL
  const medias = Array.isArray(r) ? r : [r];

  let sent = false;
  for (const item of medias) {
    const url = typeof item === 'string' ? item : (item.url || item.video || item.download_url || item.src);
    if (!url) continue;

    const isVideo = typeof item === 'string'
      ? (url.includes('.mp4') || url.includes('video'))
      : (item.type === 'video' || item.ext === 'mp4' || url.includes('.mp4'));

    const isAudio = typeof item === 'string'
      ? (url.includes('.mp3') || url.includes('audio'))
      : (item.type === 'audio' || item.ext === 'mp3');

    let cText = `✅ *${platform || 'Download'}*\n\n~Hu Tao AI 🔥`;
    if (platform === 'TikTok') {
      cText = `✅ *TikTok*\n👤 ${r.author || ''}\n📝 ${r.title || ''}\n\n~Hu Tao AI 😹`;
    } else if (platform === 'YouTube') {
      cText = `✅ *YouTube*\n📝 ${r.title || ''}\n\n~Hu Tao AI 🔥`;
    } else if (platform === 'Instagram') {
      cText = `✅ *Instagram*\n👤 ${r.author || r.owner?.username || ''}\n📝 ${r.title || ''}\n\n~Hu Tao AI 🔥`;
    }

    if (isVideo) {
      await ctx.sock.sendMessage(ctx.jid, {
        video: { url },
        mimetype: 'video/mp4',
        caption: cText
      }, { quoted: ctx.msg });
    } else if (isAudio) {
      await ctx.sock.sendMessage(ctx.jid, {
        audio: { url },
        mimetype: 'audio/mp4',
        ptt: false
      }, { quoted: ctx.msg });
    } else {
      const check = await axios.head(url, { timeout: 5000 }).catch(() => null);
      if (!check || check.status !== 200) throw new Error('URL media tidak valid');

      const cType = check.headers['content-type'] || '';
      if (cType.includes('video')) {
        await ctx.sock.sendMessage(ctx.jid, {
          video: { url },
          mimetype: cType.includes('mp4') ? cType : 'video/mp4',
          caption: cText
        }, { quoted: ctx.msg });
      } else {
        await ctx.sock.sendMessage(ctx.jid, {
          image: { url },
          caption: cText
        }, { quoted: ctx.msg });
      }
    }
    sent = true;
  }
  return sent;
}

// ─── Platform router ─────────────────────────────────────────────────────────

export default {
  name: 'downloader',
  description: 'Download YouTube, TikTok, Instagram & AIO',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed) return false;

    if (parsed.cmd === 'yt' || parsed.cmd === 'youtube') {
      const url = parsed.args[0];
      if (!url) {
        await ctx.reply({ text: `Usage: ${config.prefix}yt <url youtube>` });
        return true;
      }
      await downloadYouTube(ctx, url);
      return true;
    }

    if (parsed.cmd === 'tiktok' || parsed.cmd === 'tt') {
      const url = parsed.args[0];
      if (!url) {
        await ctx.reply({ text: `Usage: ${config.prefix}tiktok <url>` });
        return true;
      }
      await downloadTikTok(ctx, url);
      return true;
    }

    if (parsed.cmd === 'gabung') {
      await handleGabung(ctx);
      return true;
    }

    if (parsed.cmd === 'pisah') {
      await handlePisah(ctx);
      return true;
    }

    if (/^tt\d+$/.test(parsed.cmd)) {
      await handleTtOne(ctx, parseInt(parsed.cmd.replace('tt', '')));
      return true;
    }

    if (parsed.cmd === 'ig' || parsed.cmd === 'instagram') {
      const url = parsed.args[0];
      if (!url) {
        await ctx.reply({ text: `Usage: ${config.prefix}ig <url instagram>` });
        return true;
      }
      await downloadInstagram(ctx, url);
      return true;
    }

    if (parsed.cmd === 'igall') {
      await handleIgAll(ctx);
      return true;
    }

    if (/^ig\d+$/.test(parsed.cmd)) {
      await handleIgOne(ctx, parseInt(parsed.cmd.replace('ig', '')));
      return true;
    }

    if (parsed.cmd === 'dl' || parsed.cmd === 'download') {
      const url = parsed.args[0];
      if (!url) {
        await ctx.reply({ text: `Usage: ${config.prefix}dl <url>` });
        return true;
      }
      await downloadAio(ctx, url);
      return true;
    }

    return false;
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// ─── .dl — AIO (all-in-one) ──────────────────────────────────────────────────

async function downloadAio(ctx, url) {
  const cd = checkCooldown(ctx.sender, 'dl', 15000);
  if (!cd.ok) {
    await ctx.reply({ text: `Cooldown ${cd.remaining}s 😹` });
    return;
  }

  await ctx.reply({ text: '⏳ Hu Tao lagi download...' });

  try {
    const aio = await downr(url);
    if (aio.Status) {
      const sent = await sendAioResult(ctx, aio, 'Download');
      if (sent) return;
    }
    await ctx.reply({ text: '🥀 Gagal download. Coba lagi nanti ya~' });
  } catch {
    await ctx.reply({ text: '🥀 Gagal download. Coba lagi nanti ya~' });
  }
}

// ─── .yt — YouTube (AIO first → fallback) ────────────────────────────────────

async function downloadYouTube(ctx, url) {
  const cd = checkCooldown(ctx.sender, 'yt', 15000);
  if (!cd.ok) {
    await ctx.reply({ text: `Cooldown ${cd.remaining}s 😹` });
    return;
  }

  await ctx.reply({ text: '⏳ Hu Tao lagi ambil video YouTube...' });

  // AIO first
  try {
    const aio = await downr(url);
    if (aio.Status) {
      const sent = await sendAioResult(ctx, aio, 'YouTube');
      if (sent) return;
    }
  } catch { }

  // Fallback: existing logic
  try {
    let videoUrl = '';
    let title = 'YouTube Video';

    if (config.ytdlApi) {
      const videoId = getYouTubeId(url);
      if (!videoId) throw new Error('ID Video YouTube tidak ditemukan atau tidak valid');

      const { data } = await axios.get(
        `https://yt-api.p.rapidapi.com/dl?id=${videoId}`,
        {
          headers: {
            'x-rapidapi-key': config.ytdlApi,
            'x-rapidapi-host': 'yt-api.p.rapidapi.com'
          },
          timeout: 30000
        }
      );

      if (data?.status === 'OK' || data?.status === true || data?.link) {
        videoUrl = data.link || (data.formats && data.formats.find(f => !f.requiresMerge)?.url) || (data.formats && data.formats[0]?.url);
        title = data.title || title;
      } else {
        throw new Error(data?.msg || 'Gagal mengambil tautan unduhan dari RapidAPI');
      }
    } else {
      // Fallback gratis & keyless: oceansaver
      const { data } = await axios.get(
        `https://p.oceansaver.in/api/ytdl?url=${encodeURIComponent(url)}`,
        { timeout: 60000 }
      ).catch(() => ({ data: null }));

      if (data?.url || data?.download_url) {
        videoUrl = data.url || data.download_url;
        title = data.title || url;
      }
    }

    if (!videoUrl) {
      await ctx.reply({
        text: `🥀 Gagal download otomatis.\nSilakan coba lagi nanti atau periksa konfigurasi YTDL_API di .env.\nURL: ${url}`
      });
      return;
    }

    await ctx.reply({ text: '⏳ Download video YouTube, bentar ya...' });
    const ytRes = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const ytBuffer = Buffer.from(ytRes.data);
    await ctx.sock.sendMessage(ctx.jid, {
      video: ytBuffer,
      mimetype: 'video/mp4',
      caption: `✅ *YouTube*\n📝 ${title || ''}\n\n~Hu Tao AI 🔥`
    }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply({ text: `Gagal download: ${err.message} 🥀` });
  }
}

// ─── .tiktok — TikTok (AIO first → fallback) ─────────────────────────────────

async function downloadTikTok(ctx, url) {
  const cd = checkCooldown(ctx.sender, 'tiktok', 15000);
  if (!cd.ok) {
    await ctx.reply({ text: `Cooldown ${cd.remaining}s 😹` });
    return;
  }

  await ctx.reply({ text: '⏳ Hu Tao lagi ambil TikTok...' });

  // AIO first
  try {
    const aio = await downr(url);
    if (aio.Status) {
      const sent = await sendAioResult(ctx, aio, 'TikTok');
      if (sent) return;
    }
  } catch { }

  // Fallback: tikwm
  try {
    const { data } = await axios.post(
      'https://www.tikwm.com/api/',
      { url },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    if (data?.code !== 0 || !data?.data) {
      throw new Error(data?.msg || 'Video tidak ditemukan');
    }

    // TAMBAH: Deteksi slideshow
    if (data.data.images && Array.isArray(data.data.images) && data.data.images.length > 0) {
      const images = data.data.images;
      const audioUrl = data.data.music;
      const audioDuration = data.data.music_info?.duration || null;
      const title = data.data.title || 'TikTok';
      const author = data.data.author?.nickname || data.data.author?.unique_id || '';

      const timeoutId = setTimeout(async () => {
        pendingSlideshow.delete('tt:' + ctx.jid);
        await ctx.reply({ text: "⏰ Waktu pemilihan habis, silakan kirim ulang link-nya ya~" });
      }, 60000);

      pendingSlideshow.set('tt:' + ctx.jid, { images, audioUrl, audioDuration, title, author, timeoutId });

      await ctx.reply({
        text: `📸 *TikTok Slideshow terdeteksi!*\n_${title}_\nTerdapat *${images.length} foto* dengan musik.\n\nMau didownload gimana?\n*.gabung* — foto + musik digabung jadi 1 video .mp4\n*.pisah* — foto dikirim satu per satu + audio terpisah\n*.tt1*, *.tt2*, dst — download foto tertentu aja\n\n_(pilihan otomatis batal dalam 60 detik)_`
      });
      return;
    }

    const video = data.data.play || data.data.hdplay;
    const title = data.data.title || 'TikTok';
    const author = data.data.author?.nickname || data.data.author?.unique_id || '';

    await ctx.sock.sendMessage(ctx.jid, {
      video: { url: video },
      caption: `✅ *TikTok*\n👤 ${author}\n📝 ${title}\n\n~Hu Tao AI 😹`
    }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply({ text: `Gagal download TikTok: ${err.message} 🥀` });
  }
}

// TAMBAH: Handler mode pisah
async function handlePisah(ctx) {
  const data = pendingSlideshow.get('tt:' + ctx.jid);
  if (!data) {
    await ctx.reply({ text: "Tidak ada slideshow yang pending. Kirim dulu link TikTok-nya ya~ 😅" });
    return;
  }

  clearTimeout(data.timeoutId);
  pendingSlideshow.delete('tt:' + ctx.jid);

  await ctx.reply({ text: `⏳ Mengirim ${data.images.length} foto + audio...` });

  const total = data.images.length;
  for (let i = 0; i < total; i++) {
    const url = data.images[i];
    const caption = i === 0
      ? `✅ *TikTok Slideshow*\n👤 ${data.author || ''}\n📝 ${data.title || ''}\n📸 1/${total}\n\n~Hu Tao AI 😹`
      : `📸 ${i + 1}/${total}`;

    await ctx.sock.sendMessage(ctx.jid, { image: { url }, caption }, { quoted: ctx.msg });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (data.audioUrl) {
    await ctx.sock.sendMessage(ctx.jid, { audio: { url: data.audioUrl }, mimetype: 'audio/mp4', ptt: false }, { quoted: ctx.msg });
  }
}

// TAMBAH: Handler mode satu foto aja
async function handleTtOne(ctx, num) {
  const data = pendingSlideshow.get('tt:' + ctx.jid);
  if (!data) {
    await ctx.reply({ text: "Tidak ada slideshow yang pending. Kirim dulu link TikTok-nya ya~ 😅" });
    return;
  }

  if (num < 1 || num > data.images.length) {
    await ctx.reply({ text: `Nomor salah! Pilih dari 1 sampai ${data.images.length} ya~ 😤` });
    return;
  }

  // TIDAK dihapus dari pendingSlideshow agar user bisa pilih foto lain dalam 60 detik
  await ctx.reply({ text: `⏳ Mengambil foto ke-${num}...` });

  try {
    const url = data.images[num - 1];
    await ctx.sock.sendMessage(ctx.jid, {
      image: { url },
      caption: `📸 *Foto ${num}/${data.images.length}*\n👤 ${data.author || ''}\n📝 ${data.title || ''}\n\n~Hu Tao AI 😹`
    }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply({ text: `🥀 Gagal ambil foto ke-${num}: ${err.message}` });
  }
}

// TAMBAH: Handler mode gabung
async function handleGabung(ctx) {
  const data = pendingSlideshow.get('tt:' + ctx.jid);
  if (!data) {
    await ctx.reply({ text: "Tidak ada slideshow yang pending. Kirim dulu link TikTok-nya ya~ 😅" });
    return;
  }

  clearTimeout(data.timeoutId);
  pendingSlideshow.delete('tt:' + ctx.jid);

  // Cek dulu sebelum proses
  const maxFoto = 3;
  if (data.images.length > maxFoto) {
    const moodMessages = [
      `🥀 Aduh, ${data.images.length} foto sekaligus terlalu berat buat Hu Tao... maksimal ${maxFoto} foto aja ya~`,
      `😤 Hu Tao nyerah duluan! ${data.images.length} foto itu kebanyakan, Hu Tao cuma sanggup ${maxFoto} foto buat .gabung`,
      `🔥 Belum mulai udah mau meledak... ${data.images.length} foto? Tolong jangan lebih dari ${maxFoto} ya~`,
      `😵 Pusing Hu Tao liatnya... ${data.images.length} foto itu banyak banget! Batas .gabung cuma ${maxFoto} foto`,
      `🥀 Hu Tao bahkan ga mau nyoba kalau ${data.images.length} foto~ Maksimal ${maxFoto} aja!`,
    ];
    await ctx.reply({ text: moodMessages[Math.floor(Math.random() * moodMessages.length)] });
    return;
  }

  await ctx.reply({ text: "⏳ Hu Tao lagi ngerender video, bentar ya~" });

  const jidStr = ctx.jid.replace(/[^0-9]/g, '');
  const outputMp4 = `/tmp/slide_${jidStr}_output.mp4`;
  const audioFile = `/tmp/slide_${jidStr}_audio.mp3`;
  const listFile = `/tmp/slide_${jidStr}_list.txt`;
  const tempFiles = [];

  try {
    const imageFiles = [];
    for (let i = 0; i < data.images.length; i++) {
      const imgPath = `/tmp/slide_${jidStr}_${i}.jpg`;
      const res = await axios.get(data.images[i], { responseType: 'arraybuffer' });
      await fs.writeFile(imgPath, res.data);
      imageFiles.push(imgPath);
      tempFiles.push(imgPath);
    }

    if (data.audioUrl) {
      const res = await axios.get(data.audioUrl, { responseType: 'arraybuffer' });
      await fs.writeFile(audioFile, res.data);
      tempFiles.push(audioFile);
    }

    const durasiPerFoto = data.audioDuration ? Math.ceil(data.audioDuration / imageFiles.length) : 3;

    let listContent = '';
    for (const f of imageFiles) listContent += `file '${f}'\nduration ${durasiPerFoto}\n`;
    if (imageFiles.length > 0) listContent += `file '${imageFiles[imageFiles.length - 1]}'\n`;
    await fs.writeFile(listFile, listContent);
    tempFiles.push(listFile);

    await new Promise((resolve, reject) => {
      let command = ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0']);

      if (data.audioUrl) command = command.input(audioFile).inputOptions(['-stream_loop', '-1']);

      command
        .outputOptions([
          '-c:v', 'libx264',
          '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1',
          '-r', '30',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest'
        ])
        .output(outputMp4)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const videoBuffer = await fs.readFile(outputMp4);
    await ctx.sock.sendMessage(ctx.jid, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption: `✅ *TikTok Slideshow*\n👤 ${data.author || ''}\n📝 ${data.title || ''}\n\n~Hu Tao AI 😹`
    }, { quoted: ctx.msg });

  } catch (error) {
    console.error('FFMPEG Error:', error);
    await ctx.reply({ text: `🥀 Gagal ngerender video: ${error.message}` });
  } finally {
    for (const f of tempFiles) await fs.unlink(f).catch(() => { });
    await fs.unlink(outputMp4).catch(() => { });
  }
}

async function downloadInstagram(ctx, url) {
  const cd = checkCooldown(ctx.sender, 'ig', 15000);
  if (!cd.ok) {
    await ctx.reply({ text: `Cooldown ${cd.remaining}s 😹` });
    return;
  }

  await ctx.reply({ text: '⏳ Hu Tao lagi ambil konten Instagram...' });

  // Primary: downr.org
  try {
    const aio = await downr(url);
    if (aio.Status) {
      const sent = await sendAioResult(ctx, aio, 'Instagram');
      if (sent) return;
    }
  } catch { }

  // Fallback: engine.web.id
  try {
    const body = new URLSearchParams();
    body.append('url', url);

    const res = await axios.post('https://engine.web.id/download', body.toString(), {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://engine.web.id',
        'Referer': 'https://engine.web.id/',
      },
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: () => true
    });

    const html = String(res.data || '');
    const results = extractIgMedia(html);

    if (!results.length) {
      await ctx.reply({ text: '🥀 Hu Tao ga nemu media-nya... link-nya bener kan? 😅' });
      return;
    }

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const caption = i === 0 ? `✅ *Instagram*\n\n~Hu Tao AI 🔥` : `📎 ${i + 1}/${results.length}`;

      if (item.type === 'video') {
        await ctx.sock.sendMessage(ctx.jid, {
          video: { url: item.url },
          mimetype: 'video/mp4',
          caption
        }, { quoted: ctx.msg });
      } else {
        await ctx.sock.sendMessage(ctx.jid, {
          image: { url: item.url },
          caption
        }, { quoted: ctx.msg });
      }

      if (i < results.length - 1) await new Promise(r => setTimeout(r, 500));
    }

  } catch (err) {
    await ctx.reply({ text: `🥀 Gagal download Instagram: ${err.message}` });
  }
}

function extractIgMedia(html) {
  const $ = cheerio.load(html);
  const media = [];
  const seen = new Set();

  $('video source').each((_, el) => {
    const src = decodeIg($(el).attr('src') || '');
    if (src && !seen.has(src)) { seen.add(src); media.push({ type: 'video', url: src }); }
  });

  $('.media-container video').each((_, el) => {
    const src = decodeIg($(el).attr('src') || '');
    if (src && !seen.has(src)) { seen.add(src); media.push({ type: 'video', url: src }); }
  });

  $('.media-container img').each((_, el) => {
    const src = decodeIg($(el).attr('src') || '');
    if (src && !seen.has(src)) { seen.add(src); media.push({ type: 'image', url: src }); }
  });

  for (const match of html.matchAll(/forceDownload\('([^']+)'/g)) {
    const url = decodeIg(match[1] || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const clean = url.split('?')[0].toLowerCase();
    const type = clean.includes('.mp4') ? 'video' : 'image';
    media.push({ type, url });
  }

  return media;
}

function decodeIg(value) {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

// ─── Instagram Carousel Handlers ─────────────────────────────────────────────

async function fetchIgBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.instagram.com/'
    }
  });
  return res.data;
}

async function handleIgAll(ctx) {
  const data = pendingInstagram.get('ig:' + ctx.jid);
  if (!data) {
    await ctx.reply({ text: "Tidak ada pilihan Instagram carousel yang pending. Kirim dulu link Instagram-nya ya~ 😅" });
    return;
  }

  clearTimeout(data.timeoutId);
  pendingInstagram.delete('ig:' + ctx.jid);

  await ctx.reply({ text: `⏳ Mengambil ${data.images.length} foto Instagram...` });

  for (let i = 0; i < data.images.length; i++) {
    try {
      const buffer = await fetchIgBuffer(data.images[i]);
      const caption = i === 0 ? `✅ *Instagram Carousel*\n👤 ${data.author || ''}\n📝 ${data.title || ''}\n📸 1/${data.images.length}\n\n~Hu Tao AI 😹` : `📸 ${i + 1}/${data.images.length}`;
      await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption }, { quoted: ctx.msg });
    } catch (err) {
      await ctx.reply({ text: `🥀 Gagal ambil foto ke-${i + 1}: ${err.message}` });
    }
    if (i < data.images.length - 1) await new Promise(r => setTimeout(r, 500));
  }
}

async function handleIgOne(ctx, num) {
  const data = pendingInstagram.get('ig:' + ctx.jid);
  if (!data) {
    await ctx.reply({ text: "Tidak ada pilihan Instagram carousel yang pending. Kirim dulu link Instagram-nya ya~ 😅" });
    return;
  }

  if (num < 1 || num > data.images.length) {
    await ctx.reply({ text: `Nomor salah! Pilih dari 1 sampai ${data.images.length} ya~ 😤` });
    return;
  }

  // Sengaja TIDAK dihapus dari pendingInstagram agar user bisa milih foto lain dalam waktu 60 detik.
  // Tapi kita kasih tahu progresnya.
  await ctx.reply({ text: `⏳ Mengambil foto ke-${num}...` });

  try {
    const buffer = await fetchIgBuffer(data.images[num - 1]);
    await ctx.sock.sendMessage(ctx.jid, {
      image: buffer,
      caption: `📸 *Foto ${num}/${data.images.length}*\n👤 ${data.author || ''}\n📝 ${data.title || ''}\n\n~Hu Tao AI 😹`
    }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply({ text: `🥀 Gagal ambil foto ke-${num}: ${err.message}` });
  }
}