import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { log } from '../lib/logger.js';

export default {
    name: 'rvo',
    aliases: ['readviewonce', 'readvo', 'openvo'],
    description: 'Buka pesan view-once (foto / video / audio / dokumen)',
    cooldown: 5,
    xp: 0,
    ownerOnly: false,
    groupOnly: false,
    privateOnly: false,

    async run(ctx) {
        // Support reply dari semua tipe pesan
        const quotedInfo =
            ctx.msg.message?.extendedTextMessage?.contextInfo ||
            ctx.msg.message?.imageMessage?.contextInfo        ||
            ctx.msg.message?.videoMessage?.contextInfo        ||
            ctx.msg.message?.audioMessage?.contextInfo        ||
            ctx.msg.message?.stickerMessage?.contextInfo      ||
            null;

        const quotedMsg = quotedInfo?.quotedMessage;

        if (!quotedMsg) {
            await ctx.reply({ text: '❗ Reply pesan view-once (foto / video / audio / dokumen) dengan *.rvo*' });
            return;
        }

        try {
            // Unwrap viewOnce — support V1, V2, V2Extension
            // Unwrap viewOnce — support semua format
        const innerMsg =
            quotedMsg.viewOnceMessageV2?.message          ||
            quotedMsg.viewOnceMessageV2Extension?.message ||
            quotedMsg.viewOnceMessage?.message            ||
            // ✅ Format baru: langsung imageMessage/videoMessage dengan flag viewOnce
            (quotedMsg.imageMessage?.viewOnce    ? { imageMessage: quotedMsg.imageMessage }    : null) ||
            (quotedMsg.videoMessage?.viewOnce    ? { videoMessage: quotedMsg.videoMessage }    : null) ||
            (quotedMsg.audioMessage?.viewOnce    ? { audioMessage: quotedMsg.audioMessage }    : null) ||
            (quotedMsg.documentMessage?.viewOnce ? { documentMessage: quotedMsg.documentMessage } : null) ||
            null;

        if (!innerMsg) {
            await ctx.reply({ text: '❌ Pesan yang di-reply bukan view-once, atau format tidak dikenali.' });
            return;
        }
            // Tentukan tipe media
            const media =
                innerMsg.imageMessage    ||
                innerMsg.videoMessage    ||
                innerMsg.audioMessage    ||
                innerMsg.documentMessage ||
                null;

            if (!media) {
                await ctx.reply({ text: '❌ Tidak ada media di pesan view-once tersebut.' });
                return;
            }

            const mime = media.mimetype || '';
            let mediaType;
            if      (mime.startsWith('image/'))  mediaType = 'image';
            else if (mime.startsWith('video/'))  mediaType = 'video';
            else if (mime.startsWith('audio/'))  mediaType = 'audio';
            else if (mime)                       mediaType = 'document';
            else {
                await ctx.reply({ text: '❌ Tipe media tidak didukung.' });
                return;
            }

            // Download — inject key agar decrypt di group tidak gagal
            const msgTypeKey = `${mediaType}Message`;
            const fakeMsg = {
                key: {
                    remoteJid:   quotedInfo.participant ? ctx.jid : ctx.jid,
                    id:          quotedInfo.stanzaId,
                    participant: quotedInfo.participant || null,
                    fromMe:      false,
                },
                message: innerMsg,
            };

            const stream = await downloadContentFromMessage(fakeMsg.message[msgTypeKey], mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            // Audio tidak support caption di WhatsApp
            const caption = mediaType === 'audio'
            ? undefined
            : (media.caption
                ? `🔓 *View-once dibuka*\n\n${media.caption}`
                : '🔓 *View-once berhasil dibuka*');
            await ctx.sock.sendMessage(
                ctx.jid,
                { [mediaType]: buffer, mimetype: mime, caption },
                { quoted: ctx.msg }
            );

            log.cmd(`[RVO] ${ctx.sender} buka view-once (${mediaType})`);

        } catch (err) {
            log.error(`[RVO] error: ${err.message}`);
            await ctx.reply({ text: '❌ Terjadi kesalahan saat membuka view-once. Coba lagi ya~' });
        }
    }
};