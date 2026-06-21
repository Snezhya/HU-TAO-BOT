import { config, isOwner, isSelfMode } from './config.js';
import { checkCooldown } from './cooldown.js';
import { log } from './logger.js';
import { parseCommand, getSender, isGroup, delay } from './utils.js';
import { addXp, persistDb } from './database.js';
import { isFeatureEnabled } from './feature-toggle.js';

/**
 * Build context object untuk setiap pesan
 */
export function createContext(sock, msg) {
  const jid = msg.key.remoteJid;
  const sender = getSender(msg);
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  const fromMe = msg.key.fromMe;
  const group = isGroup(jid);
  const ownerFlag = isOwner(sender) || fromMe;

  return {
    sock,
    msg,
    jid,
    sender,
    text: text.trim(),
    fromMe,
    group,
    isGroup: group,
    isAdmin: false, // akan di-resolve saat command dijalankan
    isOwner: ownerFlag,
    isOwnerMsg: ownerFlag,
    reply: async (content, options = {}) => {
      return sock.sendMessage(jid, content, { quoted: msg, ...options });
    },
    react: async (emoji) => {
      if (!emoji) return;
      return sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
    },
    sendTyping: async () => {
      await sock.sendPresenceUpdate('composing', jid);
    }
  };
}

/**
 * Auto-react emoji berdasarkan konten pesan — karakter Hu Tao
 */
async function sendHuTaoReact(ctx) {
  try {
    // Jangan react ke pesan sendiri atau status
    if (ctx.fromMe) return;
    if (ctx.jid === 'status@broadcast') return;
    if (!ctx.text) return; // skip media tanpa caption

    const text = ctx.text.toLowerCase();
    let pool;

    if (/download|dl|tiktok|yt|youtube|ig/.test(text)) {
      pool = ['😒', '🙄', '😤', '⏳', '🔥', '😹'];
    } else if (/makasih|thanks|thx|ty|terima kasih/.test(text)) {
      pool = ['😒', '🥀', '😤', '💀', '🙄'];
    } else if (/haha|wkwk|lol|lucu|😂|🤣/.test(text)) {
      pool = ['😹', '💀', '😂', '🤣', '😆'];
    } else if (/sayang|cinta|suka|love|❤|😍|🥰/.test(text)) {
      pool = ['😤', '🙄', '😒', '🥀', '😳'];
    } else if (/bodoh|bego|goblok|tolol|idiot/.test(text)) {
      pool = ['😡', '🔥', '💢', '😤', '👺'];
    } else if (/help|tolong|bantu|bisa|gimana|cara/.test(text)) {
      pool = ['🙄', '😒', '😤', '🔥', '💪'];
    } else if (/menu|fitur|command|cmd/.test(text)) {
      pool = ['😹', '🔥', '👀', '😒'];
    } else if (/hai|halo|hi|hello|hei|^p$|pagi|malem|sore/.test(text)) {
      pool = ['😒', '🙄', '👋', '🥀', '😤'];
    } else {
      pool = ['🔥', '🥀', '😹', '😒', '🙄', '💀', '😤', '👀', '✨'];
    }

    const emoji = pool[Math.floor(Math.random() * pool.length)];
    await ctx.sock.sendMessage(ctx.jid, { react: { text: emoji, key: ctx.msg.key } });
  } catch {
    // silent ignore — jangan crash gara-gara react gagal
  }
}

/**
 * Jalankan command dari prefix
 */
export async function handleCommand(ctx, commands) {
  const { text, sender, jid } = ctx;
  const parsed = parseCommand(text, config.prefix, config.altPrefix);
  if (!parsed) return false;

  const cmd = commands.find(
    (c) => c.name === parsed.cmd || c.aliases?.includes(parsed.cmd)
  );
  if (!cmd) return false;

  // Cek feature toggle
  if (!cmd.bypassToggle) {
    const featureOn = await isFeatureEnabled(jid, cmd.name);
    if (!featureOn) return true; // fitur OFF → diam, tidak reply apapun
  }

  // Self mode: hanya owner
  if (isSelfMode() && !ctx.isOwnerMsg) {
    return true;
  }

  // Public mode + ownerOnly
  if (cmd.ownerOnly && !ctx.isOwner) {
    await ctx.reply({ text: '🥀 Hu Tao cuma nurut sama owner~' });
    return true;
  }

  if (cmd.groupOnly && !ctx.group) {
    await ctx.reply({ text: 'Command ini khusus grup ya 😹' });
    return true;
  }

  if (cmd.privateOnly && ctx.group) {
    await ctx.reply({ text: 'Command ini khusus chat pribadi 🔥' });
    return true;
  }

  const cd = checkCooldown(sender, cmd.name, cmd.cooldown);
  if (!cd.ok) {
    await ctx.reply({
      text: `Sabar dulu~ tunggu ${cd.remaining} detik lagi 😹`
    });
    return true;
  }

  log.cmd(sender.split('@')[0], parsed.cmd);

  // Resolve isAdmin untuk grup
  if (ctx.group) {
    try {
      const meta = await ctx.sock.groupMetadata(ctx.jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);
      ctx.isAdmin = admins.includes(ctx.sender);
    } catch {
      ctx.isAdmin = false;
    }
  }

  try {
    if (cmd.before) await cmd.before(ctx, parsed.args);
    await cmd.run(ctx, parsed.args, parsed);
    if (cmd.after) await cmd.after(ctx);
    const lvl = await addXp(sender, cmd.xp ?? 3);
    await persistDb();
    if (lvl.leveledUp && !ctx.group) {
      await ctx.reply({
        text: `🔥 Level up! Kamu sekarang level *${lvl.level}* — Hu Tao bangga~`
      });
    }
  } catch (err) {
    log.error(`Command ${cmd.name}: ${err.message}`);
    await ctx.reply({ text: `Error: ${err.message} 🥀` });
  }

  return true;
}

/**
 * Jalankan plugin (event-based, bukan prefix)
 */
export async function handlePlugins(ctx, plugins) {
  // Auto-react tanpa blocking
  // sendHuTaoReact(ctx);

  const sorted = [...plugins].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  for (const plugin of sorted) {
    if (plugin.disabled) continue;
    if (isSelfMode() && plugin.publicOnly && !ctx.isOwner) continue;

    // Cek feature toggle
    if (!plugin.bypassToggle) {
      const featureOn = await isFeatureEnabled(ctx.jid, plugin.name);
      if (!featureOn) continue; // plugin OFF → skip, lanjut ke plugin berikutnya
    }

    try {
      const handled = await plugin.run(ctx);
      if (handled === true) return true;
    } catch (err) {
      log.error(`Plugin ${plugin.name}: ${err.message}`);
    }
  }
  return false;
}

/**
 * Typing presence helper untuk AI
 */
export async function withTyping(sock, jid, fn) {
  await sock.sendPresenceUpdate('composing', jid);
  const result = await fn();
  await sock.sendPresenceUpdate('paused', jid);
  return result;
}
