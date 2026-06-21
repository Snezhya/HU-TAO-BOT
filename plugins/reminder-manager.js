/**
 * Plugin: reminder-manager
 * Intercept natural language reminder requests BEFORE they reach the AI.
 * Priority 5 → runs before AI plugin (priority 10+).
 */
import { detectReminderIntent } from '../lib/reminder-intent.js';
import {
  getReminderConfig,
  setReminderConfig,
  DEFAULT_SCHEDULE,
} from '../lib/reminder.js';

// ============================================================================
// Helpers
// ============================================================================

function wibNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function fmtTime(h, m) {
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

function fmtScheduleItem(s) {
  const label = s.text
    ? `📌 *${s.text}*`
    : `⏰ ${s.type.replace(/_/g, ' ')}`;
  const dateNote = s.date ? ` _(${s.date})_` : '';
  return `• ${label} — jam *${fmtTime(s.hour, s.minute)}*${dateNote}`;
}

// ============================================================================
// Quick check: does the text look like a reminder request?
// ============================================================================
function looksLikeReminder(text = '') {
  return /(?:ingetin|ingat(?:in)?|remind|pengingat|reminder|jadwal(?:in)?)\b/i.test(text) ||
    /hapus\s+semua\s+(?:yang\s+aku\s+suruh|pengingat|reminder)/i.test(text);
}

// ============================================================================
// Plugin
// ============================================================================
export default {
  name: 'reminder-manager',
  priority: 5,

  async run(ctx) {
    const { text, jid, sender, fromMe, sock } = ctx;
    if (!text) return false;
    if (!looksLikeReminder(text)) return false;

    const result = detectReminderIntent(text);
    if (!result.intent) return false; // let AI handle it

    const targetJid = jid; // DM or group chat JID
    const cfg = (await getReminderConfig(targetJid)) || {};

    // ---- ON ----
    if (result.intent === 'ON') {
      const mentions = ctx.isGroup ? [sender] : [];
      await setReminderConfig(targetJid, {
        enabled: true,
        isGroup: ctx.isGroup,
        mentions,
        schedule: cfg.schedule?.length ? cfg.schedule : null,
      });
      const scheduleList = (cfg.schedule?.length ? cfg.schedule : DEFAULT_SCHEDULE)
        .map(fmtScheduleItem).join('\n');
      await ctx.reply({
        text: `✅ Oke! Pengingat pasangan udah aktif~\n\nJadwal aku:\n${scheduleList}\n\n😤 aku bakal ngingetin kamu tiap hari sesuai jadwal!`,
      });
      return true;
    }

    // ---- OFF ----
    if (result.intent === 'OFF') {
      await setReminderConfig(targetJid, { enabled: false });
      await ctx.reply({ text: '🔕 Oke, pengingat otomatis udah aku matiin. Panggil aku kalau butuh ya~' });
      return true;
    }

    // ---- LIST ----
    if (result.intent === 'LIST') {
      const currentCfg = await getReminderConfig(targetJid);
      if (!currentCfg?.enabled) {
        await ctx.reply({ text: '📭 Pengingat belum aktif. Mau aku aktifkan?' });
        return true;
      }
      const schedule = currentCfg.schedule?.length ? currentCfg.schedule : DEFAULT_SCHEDULE;
      const list = schedule.map((s, i) => `${i + 1}. ${fmtScheduleItem(s)}`).join('\n');
      await ctx.reply({ text: `📋 *Jadwal Pengingat Kamu*\n\n${list}` });
      return true;
    }

    // ---- CLEAR_ALL ----
    if (result.intent === 'CLEAR_ALL') {
      const currentCfg = await getReminderConfig(targetJid);
      if (!currentCfg) {
        await ctx.reply({ text: '📭 Tidak ada pengingat yang tersimpan.' });
        return true;
      }
      // Hapus hanya jadwal tugas (type=tugas / has date), pertahankan jadwal rutin kalau ada
      const filtered = (currentCfg.schedule || []).filter(s => s.type !== 'tugas' && !s.date);
      await setReminderConfig(targetJid, { schedule: filtered.length ? filtered : null });
      await ctx.reply({ text: '🗑️ Semua pengingat tugas/khusus udah aku hapus. Jadwal rutin harian tetap jalan ya~' });
      return true;
    }

    // ---- RELATIVE: "ingetin X menit lagi" ----
    if (result.intent === 'RELATIVE') {
      const newItem = {
        hour:   result.hour,
        minute: result.minute,
        type:   'tugas',
        date:   result.date,
        text:   result.text || `Pengingat ${result.offsetMinutes} menit`,
      };
      const existingSchedule = cfg.schedule?.length ? [...cfg.schedule] : [];
      existingSchedule.push(newItem);

      await setReminderConfig(targetJid, {
        enabled: true,
        isGroup: ctx.isGroup,
        mentions: ctx.isGroup ? [sender] : [],
        schedule: existingSchedule,
      });

      const fireTime = fmtTime(result.hour, result.minute);
      const durationText = result.offsetMinutes < 60
        ? `${result.offsetMinutes} menit`
        : `${result.offsetMinutes / 60} jam`;
      await ctx.reply({
        text: `⏰ Oke! Aku bakal ngingetin kamu ${durationText} lagi, jam *${fireTime}* ya~ 😤`,
      });
      return true;
    }

    // ---- FROM_TIME: "masak jam 2.27, kalo 30 menit ingetin" ----
    if (result.intent === 'FROM_TIME') {
      const newItem = {
        hour:   result.hour,
        minute: result.minute,
        type:   'tugas',
        date:   result.date,
        text:   result.text || `Pengingat ${result.offsetMinutes} menit`,
      };
      const existingSchedule = cfg.schedule?.length ? [...cfg.schedule] : [];
      existingSchedule.push(newItem);

      await setReminderConfig(targetJid, {
        enabled: true,
        isGroup: ctx.isGroup,
        mentions: ctx.isGroup ? [sender] : [],
        schedule: existingSchedule,
      });

      const fireTime = fmtTime(result.hour, result.minute);
      await ctx.reply({
        text: `⏰ Sip! Aku catat ya — nanti jam *${fireTime}* aku bakal ngingetin kamu! 😤`,
      });
      return true;
    }

    // ---- ADD (rutinitas) ----
    if (result.intent === 'ADD') {
      const newItem = { hour: result.hour, minute: result.minute, type: result.type };
      const existingSchedule = cfg.schedule?.length ? [...cfg.schedule] : [...DEFAULT_SCHEDULE];
      // Hindari duplikat tipe + jam
      const isDup = existingSchedule.some(s => s.type === result.type && s.hour === result.hour && s.minute === result.minute);
      if (!isDup) existingSchedule.push(newItem);

      await setReminderConfig(targetJid, {
        enabled: true,
        isGroup: ctx.isGroup,
        mentions: ctx.isGroup ? [sender] : [],
        schedule: existingSchedule,
      });

      const fireTime = fmtTime(result.hour, result.minute);
      await ctx.reply({
        text: `✅ Oke! Jadwal *${result.type.replace(/_/g, ' ')}* jam *${fireTime}* udah aku tambahkan~ 😤`,
      });
      return true;
    }

    // ---- ADD_TASK ----
    if (result.intent === 'ADD_TASK') {
      const newItem = {
        hour:   result.hour,
        minute: result.minute,
        type:   'tugas',
        date:   result.date,
        text:   result.text,
      };
      const existingSchedule = cfg.schedule?.length ? [...cfg.schedule] : [];
      existingSchedule.push(newItem);

      await setReminderConfig(targetJid, {
        enabled: true,
        isGroup: ctx.isGroup,
        mentions: ctx.isGroup ? [sender] : [],
        schedule: existingSchedule,
      });

      const fireTime = fmtTime(result.hour, result.minute);
      await ctx.reply({
        text: `📌 Oke! Aku catat:\n\n*${result.text}*\nJam *${fireTime}* _(${result.date})_\n\nAku bakal ngingetin kamu tepat waktu! 😤`,
      });
      return true;
    }

    // ---- DEL ----
    if (result.intent === 'DEL') {
      const currentCfg = await getReminderConfig(targetJid);
      const schedule = currentCfg?.schedule?.length ? [...currentCfg.schedule] : [...DEFAULT_SCHEDULE];
      const idx = result.index - 1;
      if (idx < 0 || idx >= schedule.length) {
        await ctx.reply({ text: `❌ Nomor ${result.index} tidak ada di jadwal.` });
        return true;
      }
      const removed = schedule.splice(idx, 1)[0];
      await setReminderConfig(targetJid, { schedule });
      await ctx.reply({
        text: `🗑️ Jadwal *${removed.type.replace(/_/g, ' ')} ${removed.text || ''}* jam ${fmtTime(removed.hour, removed.minute)} udah aku hapus~`,
      });
      return true;
    }

    // ---- SNOOZE ----
    if (result.intent === 'SNOOZE') {
      const wib = wibNow();
      wib.setMinutes(wib.getMinutes() + result.minutes);
      const h = wib.getUTCHours();
      const m = wib.getUTCMinutes();
      const dateStr = wib.toISOString().split('T')[0];

      const snoozeItem = {
        hour: h, minute: m, type: 'tugas',
        date: dateStr, text: 'Pengingat (snooze)',
      };
      const existingSchedule = cfg.schedule?.length ? [...cfg.schedule] : [];
      existingSchedule.push(snoozeItem);
      await setReminderConfig(targetJid, { enabled: true, schedule: existingSchedule });
      await ctx.reply({ text: `⏱️ Oke, aku tunda ${result.minutes} menit ya~ nanti jam *${fmtTime(h, m)}* aku ingetin lagi!` });
      return true;
    }

    return false;
  },
};