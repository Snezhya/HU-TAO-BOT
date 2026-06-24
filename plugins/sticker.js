import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { config } from '../lib/config.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

function parseCommand(text, prefix, altPrefix = '.') {
  const prefixes = [prefix, altPrefix].filter(Boolean);
  for (const p of prefixes) {
    if (!text?.startsWith(p)) continue;
    const body = text.slice(p.length).trim();
    const [cmd, ...args] = body.split(/\s+/);
    return { cmd: cmd.toLowerCase(), args, body, usedPrefix: p };
  }
  return null;
}

export default {
  name: 'sticker',
  description: 'Create sticker from image, video, or GIF',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed || !['sticker', 's', 'stiker'].includes(parsed.cmd)) return false;

    // ─── Find Media ─────────────────────────────────────────────────────────────
    const quotedInfo =
      ctx.msg.message?.extendedTextMessage?.contextInfo ||
      ctx.msg.message?.imageMessage?.contextInfo ||
      ctx.msg.message?.videoMessage?.contextInfo ||
      null;

    const quotedMsg = quotedInfo?.quotedMessage;

    // Priority:
    // 1. Quoted imageMessage
    // 2. Quoted videoMessage (including gifPlayback)
    // 3. Quoted stickerMessage
    // 4. Quoted documentMessage with mimetype image/* or video/*
    // 5. Direct imageMessage (no quote)
    // 6. Direct videoMessage (no quote)

    const imageMsg =
      quotedMsg?.imageMessage ||
      ctx.msg.message?.imageMessage;

    const videoMsg =
      quotedMsg?.videoMessage ||
      ctx.msg.message?.videoMessage;

    const stickerMsg = quotedMsg?.stickerMessage;
    const documentMsg = quotedMsg?.documentMessage;

    const isGif = videoMsg?.gifPlayback === true;

    let mediaType = null;
    let innerMsg = null;
    let isAnimated = false;

    if (imageMsg) {
      mediaType = 'image';
      innerMsg = { imageMessage: imageMsg };
      isAnimated = false;
    } else if (videoMsg) {
      mediaType = 'video';
      innerMsg = { videoMessage: videoMsg };
      isAnimated = true;
    } else if (stickerMsg) {
      mediaType = 'sticker';
      innerMsg = { stickerMessage: stickerMsg };
      isAnimated = stickerMsg?.isAnimated || false;
    } else if (documentMsg && (documentMsg.mimetype?.startsWith('image/') || documentMsg.mimetype?.startsWith('video/'))) {
      mediaType = documentMsg.mimetype.startsWith('image/') ? 'image' : 'video';
      innerMsg = { documentMessage: documentMsg };
      isAnimated = mediaType === 'video';
    }

    if (!innerMsg) {
      // No media found
      await ctx.reply({
        text: `⚠️  No media found.\n\n*Usage example:*\n• Reply to an image/video with ${config.prefix}sticker\n• Send an image/video directly with the command\n• .s 5 (for a 5-second video, max 30s)`
      });
      return true;
    }

    await ctx.reply({ text: '⏳ Creating sticker...' });

    const tmpDir = tmpdir();
    const inputPath = join(tmpDir, `${randomUUID()}.bin`);
    const outputPath = join(tmpDir, `${randomUUID()}.webp`);

    try {
      // ─── Download media via downloadContentFromMessage ────────────────────────
      const downloadKey = mediaType === 'sticker' ? 'stickerMessage' : `${mediaType}Message`;
      let stream;

      if (quotedInfo && quotedMsg && quotedMsg[downloadKey]) {
        // Media from quoted message, inject key so group decryption doesn't fail
        const fakeMsg = {
          key: {
            remoteJid: ctx.jid,
            id: quotedInfo.stanzaId,
            participant: quotedInfo.participant || null,
            fromMe: false
          },
          message: innerMsg
        };
        stream = await downloadContentFromMessage(fakeMsg.message[downloadKey], mediaType);
      } else {
        // Direct media (no quote)
        stream = await downloadContentFromMessage(innerMsg[downloadKey], mediaType);
      }

      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      await writeFile(inputPath, buffer);

      // ─── Conversion ───────────────────────────────────────────────────────────
      let webpBuffer;

      if (isAnimated) {
        // Video/GIF → animated WebP 512×512, fps=15, max 8 seconds default
        const durationArg = parsed.args[0] ? parseInt(parsed.args[0], 10) : null;
        const maxDuration = durationArg ? Math.min(Math.max(1, durationArg), 30) : 8;

        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .outputOptions([
              '-vcodec libwebp',
              '-loop 0',
              '-lossless 0',
              '-qscale 80',
              '-preset default',
              '-an',
              '-vsync 0',
              '-s 512x512',
              '-r 15',
              `-t ${maxDuration}`,
              '-f webp'
            ])
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
        });

        webpBuffer = await readFile(outputPath);
      } else {
        // Image / static sticker → static WebP 512×512, transparent
        webpBuffer = await sharp(inputPath)
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: 80 })
          .toBuffer();
      }

      // ─── Send sticker ─────────────────────────────────────────────────────────
      await ctx.sock.sendMessage(ctx.jid, {
        sticker: webpBuffer
      }, { quoted: ctx.msg });

      await ctx.reply({ text: '✅ Sticker ready~' });

    } catch (err) {
      const msg = err.message || '';
      let replyText = '';

      if (msg.includes('ENOENT') || msg.includes('ffmpeg') || msg.includes('FFmpeg')) {
        replyText = '❌ ffmpeg is not installed on the system. Please install it (e.g., `apt install ffmpeg`).';
      } else if (msg.includes('media key expired') || msg.includes('Cannot derive from empty media key') || msg.includes('decrypt')) {
        replyText = '⏳ Media key has expired. The message is too old to process. Please ask the sender to resend it.';
      } else if (msg.includes('unsupported') || msg.includes('Unsupported') || msg.includes('format')) {
        replyText = '❌ Unsupported media type. Only images (JPG, PNG, etc.) or videos (MP4, GIF) can be converted to stickers.';
      } else {
        replyText = `❌ Failed to create sticker: ${msg}`;
      }

      await ctx.reply({ text: replyText });
    } finally {
      // Cleanup
      try { await unlink(inputPath); } catch {}
      try { await unlink(outputPath); } catch {}
    }

    return true;
  }
};