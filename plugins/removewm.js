import axios from 'axios';
import { parseCommand, downloadMedia } from '../lib/utils.js';
import { config } from '../lib/config.js';
import { checkCooldown } from '../lib/cooldown.js';

// ─── Remove Watermark ────────────────────────────────────────────────────────
// Base: https://ezremove.ai

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';
const ORIGIN = 'https://ezremove.ai';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function removeWatermark(buffer, mime = 'image/jpeg') {
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const filename = `image_${Date.now()}.${mime.split('/')[1] || 'jpg'}`;

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image_file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const create = await axios.post(
    'https://api.ezremove.ai/api/ez-remove/watermark-remove/create-job',
    body,
    {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Origin': ORIGIN,
        'Referer': `${ORIGIN}/`,
        'product-serial': `sr-${Date.now()}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      timeout: 30000,
      validateStatus: () => true,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  if (create.status < 200 || create.status >= 300) {
    throw new Error(`Gagal membuat job remove wm (status ${create.status})`);
  }

  const jobId = create.data?.result?.job_id;
  if (!jobId) {
    throw new Error('Gagal mendapatkan Job ID dari ezremove');
  }

  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const check = await axios.get(
      `https://api.ezremove.ai/api/ez-remove/watermark-remove/get-job/${jobId}`,
      {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json, text/plain, */*',
          'Origin': ORIGIN,
          'Referer': `${ORIGIN}/`,
          'product-serial': `sr-${Date.now()}`
        },
        timeout: 15000,
        validateStatus: () => true
      }
    );

    if (check.status < 200 || check.status >= 300) {
      throw new Error(`Gagal mengecek status job (status ${check.status})`);
    }

    const resultUrl = check.data?.result?.output?.[0];
    if (check.data?.code === 100000 && resultUrl) {
      return resultUrl;
    }

    if (check.data?.code !== 300001) {
      throw new Error(`Error dari server ezremove: ${check.data?.message || check.data?.code}`);
    }
  }

  throw new Error('Timeout menunggu proses remove watermark selesai');
}

export default {
  name: 'removewm',
  description: 'Menghapus watermark dari gambar',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed) return false;

    if (parsed.cmd !== 'rmwm' && parsed.cmd !== 'removewm') return false;

    // Ambil detail gambar dari chat langsung atau quoted message
    const quotedMsg = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = ctx.msg.message?.imageMessage;
    const isQuotedImage = quotedMsg?.imageMessage;

    if (!isImage && !isQuotedImage) {
      await ctx.reply({
        text: `❌ Kirim gambar dengan caption *${config.prefix}rmwm* atau reply gambar yang sudah ada dengan ketik *${config.prefix}rmwm*`
      });
      return true;
    }

    const cd = checkCooldown(ctx.sender, 'rmwm', 20000);
    if (!cd.ok) {
      await ctx.reply({ text: `⏳ Cooldown ${cd.remaining}s dulu ya~ 😹` });
      return true;
    }

    await ctx.reply({ text: '🖼️ Hu Tao lagi hapus watermark gambarmu, tunggu bentar ya~' });

    try {
      const targetMsg = isImage ? ctx.msg : { message: quotedMsg };
      const { buffer, mimetype } = await downloadMedia(targetMsg);

      if (!mimetype.startsWith('image/')) {
        await ctx.reply({ text: '❌ Hanya mendukung file gambar!' });
        return true;
      }

      const resultUrl = await removeWatermark(buffer, mimetype);

      await ctx.sock.sendMessage(
        ctx.jid,
        {
          image: { url: resultUrl },
          caption: '✨ Nih, watermark-nya udah ilang! Bersih kan? 😹\n\n~Hu Tao AI 🔥'
        },
        { quoted: ctx.msg }
      );
    } catch (err) {
      await ctx.reply({ text: `🥀 Gagal menghapus watermark: ${err.message}` });
    }

    return true;
  }
};