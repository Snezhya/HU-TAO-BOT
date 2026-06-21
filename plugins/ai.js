import { config } from '../lib/config.js';
import { respondHuTao } from '../lib/hu-tao-ai.js';
import { parseCommand } from '../lib/utils.js';

// Normalize JID: strip domain and device suffix (e.g., "6281234567890:18@s.whatsapp.net" → "6281234567890")
const normalizeJid = (jid) => jid?.split('@')[0].split(':')[0];

export default {
  name: 'ai-chat',
  description: 'Auto chat Hu Tao',
  priority: 10,

  async run(ctx) {
    const { text, sender } = ctx;
    const isSticker = !!(ctx.msg.message?.stickerMessage);
    
    // Kalau user kirim sticker di PM
    if (isSticker && !ctx.group) {
      try {
        const prompt = "[System: User mengirimkan sebuah sticker gambar. Beritahu mereka bahwa kamu hanyalah AI teks dan tidak bisa melihat atau mengerti sticker tersebut. Jawab dengan gaya bicara dan sifat/mood kamu saat ini!]";
        await respondHuTao(ctx, sender, prompt);
      } catch (err) {
        await ctx.reply({ text: 'Hu Tao lagi pusing 🥀' });
      }
      return true;
    }
    
    const txt = text || '';
    const hasTikTok = /tiktok\.com|vt\.tiktok\.com/i.test(txt);
    const hasYouTube = /youtube\.com|youtu\.be/i.test(txt);
    const hasInstagram = /instagram\.com|instagr\.am/i.test(txt);

    if (hasTikTok || hasYouTube || hasInstagram) {
      const p = Array.isArray(config.prefix) ? config.prefix[0] : (config.prefix || '.');
      
      if (hasTikTok) {
        await ctx.reply({ text: `Eh, kamu ngirim link TikTok? Mau didownload? \nGini caranya:\n\n*${p}tiktok <url>* — download video/slideshow\n\nContoh:\n${p}tiktok https://vt.tiktok.com/ZSxpXRBQa/\n\nNanti aku yang urus~ 🔥` });
        return true;
      }
      if (hasYouTube) {
        await ctx.reply({ text: `Eh, link YouTube nih? Mau didownload?\nGini caranya:\n\n*${p}yt <url>* — download video YouTube\n\nContoh:\n${p}yt https://youtu.be/xxxxx\n\nNanti aku yang urus~ 🔥` });
        return true;
      }
      if (hasInstagram) {
        await ctx.reply({ text: `Link Instagram? Mau didownload?\nGini caranya:\n\n*${p}ig <url>* — download foto/video Instagram\n\nContoh:\n${p}ig https://www.instagram.com/p/xxxxx\n\n` });
        return true;
      }
    }

    const parsed = parseCommand(text, config.prefix, config.altPrefix);

    if (parsed) return false;
    if (!text) return false;
    if (ctx.fromMe) return false;

     if (ctx.group) {
       // Ambil KEDUA identitas bot (Phone Number & Linked ID)
       const botPnJid = ctx.sock.user?.id;
       const botLidJid = ctx.sock.user?.lid;
       
       const botPnBase = normalizeJid(botPnJid);
       const botLidBase = normalizeJid(botLidJid);
       
       const isSameAsBot = (jid) => {
         if (!jid) return false;
         const base = normalizeJid(jid);
         return base === botPnBase || (botLidBase && base === botLidBase);
       };

       const mentioned = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
       const isMentioned = mentioned?.some((j) => isSameAsBot(j));
       
       const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.participant;
       const quotedBot = isSameAsBot(quoted);
       
       // Reply-to-continue: check if replying to bot WITHOUT prefix
       if (quotedBot) {
         const txtTrim = text.trim();
         const prefixes = Array.isArray(config.prefix) ? config.prefix : [config.prefix];
         const hasPrefix = prefixes.some(p => txtTrim.startsWith(p));
         
         if (!hasPrefix) {
           try {
             await respondHuTao(ctx, sender, text);
           } catch (err) {
             await ctx.reply({ text: err.message || 'Hu Tao lagi pusing 🥀' });
           }
           return true;
         }
       }
       
       if (!isMentioned && !quotedBot) return false;
     }

    try {
      await respondHuTao(ctx, sender, text);
    } catch (err) {
      await ctx.reply({ text: err.message || 'Hu Tao lagi pusing 🥀' });
    }

    return true;
  }
};
