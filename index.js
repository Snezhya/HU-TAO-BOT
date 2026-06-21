/**
 * Hu Tao AI — WhatsApp Bot
 * Entry point — Railway / VPS / lokal
 */
import { silenceSignalSessionLogs } from './lib/signal-quiet.js';

silenceSignalSessionLogs();

import { config } from './lib/config.js';
import { log } from './lib/logger.js';
import { initDatabase, flushDatabase, disconnectDatabase, getDbMode } from './lib/database.js';
import { loadModules, registerAllFeatures } from './lib/loader.js';
import { connectWhatsApp, closeWhatsApp } from './lib/connection.js';
import { createContext, handleCommand, handlePlugins } from './lib/handler.js';
import { startExpress } from './lib/server.js';
import { setupGroupEvents } from './plugins/group-events.js';
import { setBootAt } from './lib/runtime.js';
import { ensureMenuMedia, validateMenuMedia } from './lib/menu-media.js';
import { startProfileRotator } from './lib/profile-rotator.js';
import { restoreScheduler } from './lib/profile/scheduler.js';
import { startReminderScheduler } from './lib/reminder.js';
import { pixivSessionPlugin, allowR18Command, denyR18Command } from './commands/pixiv.js';

const sockRef = { current: null };
let shuttingDown = false;
const groupSubjectCache = new Map();

function isSchoolClass(subject) {
  if (!subject) return false;

  const hasYear = /\b(20)?\d{2}[\s/\-]?(20)?\d{2}\b/.test(subject);
  const hasRomanGrade = /\b(kelas\s+)?(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i.test(subject);
  const hasNumGrade = /\b(kelas\s+)(10|11|12)\b/i.test(subject); // angka hanya valid kalau ada kata "Kelas"
  const hasMajor = /\b(IPA|IPS|MIPA|Bahasa|Agama|Teknik|RPL|TKJ|DKV)\b/i.test(subject);

  const hasGrade = hasRomanGrade || hasNumGrade;
  return (hasGrade && hasYear) || (hasGrade && hasMajor);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn(`Shutdown (${signal})...`);
  await closeWhatsApp();
  await flushDatabase();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log.error(`uncaughtException: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (
    msg.includes('Bad MAC') ||
    msg.includes('MessageCounterError') ||
    msg.includes('Key used already') ||
    msg.includes('Failed to decrypt')
  ) return; // silent ignore — decrypt error biasa, tidak perlu crash
  log.error(`unhandledRejection: ${msg}`);
});

async function main() {
  setBootAt();
  console.clear();
  log.info(`Starting ${config.botName}... 🔥🥀`);
  if (config.isRailway) log.info('Railway environment detected');

  const mode = await initDatabase();
  log.success(`Database ready (${mode})`);

  // Express dulu — Railway healthcheck tidak tunggu WhatsApp QR
  startExpress(sockRef);

  try {
    const media = await ensureMenuMedia();
    const v = validateMenuMedia();
    log.success(`Menu banner: ${media.path} (${v.imageBytes} bytes)`);
  } catch (err) {
    log.warn(`Menu banner: ${err.message}`);
  }

  const [commands, plugins] = await Promise.all([
    loadModules('commands'),
    loadModules('plugins')
  ]);

  // Register pixiv session plugin and admin commands (named exports, not auto-loaded)
  plugins.unshift(pixivSessionPlugin);
  commands.push(allowR18Command, denyR18Command);

  log.info(`Loaded ${commands.length} commands, ${plugins.length} plugins`);

  // Daftarkan semua nama fitur ke registry
  registerAllFeatures(commands, plugins);

  const sock = await connectWhatsApp(async (s, msg) => {
    sockRef.current = s;
    const ctx = createContext(s, msg);

    // Self mode in group "Kelas XI 2526" (only respond to owners)
    if (ctx.group && !ctx.isOwner) {
      let subject = groupSubjectCache.get(ctx.jid);
      if (!subject) {
        try {
          const meta = await s.groupMetadata(ctx.jid);
          if (meta && meta.subject) {
            subject = meta.subject;
            groupSubjectCache.set(ctx.jid, subject);
          }
        } catch {
          // ignore
        }
      }
      if (isSchoolClass(subject)) {
        return;
      }
    }

    const pluginHandled = await handlePlugins(ctx, plugins);
    if (pluginHandled) return;

    const cmdHandled = await handleCommand(ctx, commands);
    if (cmdHandled) return;
  }, (s) => {
    setupGroupEvents(s);
    s.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          groupSubjectCache.set(update.id, update.subject);
        }
      }
    });
  });  // ← di-pass agar auto re-register saat reconnect

  sockRef.current = sock;
  console.log('[BOT LID]', sock.user?.lid, sock.user?.id);

  // Auto-rotate nama & status profil setiap 2 jam
  startProfileRotator(sock, 2 * 60 * 60 * 1000);

  // Restore jadwal PP random (jika sebelumnya aktif)
  restoreScheduler(sock).catch(() => {});

  // Jalankan scheduler pengingat otomatis
  startReminderScheduler(sock);

  log.success('Bot siap menerima pesan~ 😹');
}

main().catch((err) => {
  log.error(err.stack || err.message);
  process.exit(1);
});
