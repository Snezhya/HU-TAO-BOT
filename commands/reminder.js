import { setReminderConfig, getReminderConfig } from '../lib/reminder.js';
import { isOwner } from '../lib/config.js';

export default {
  name: 'reminder',
  aliases: ['remind'],
  description: 'Aktifkan/matikan fitur pengingat pasangan',
  async run(ctx, args, parsed) {
    const action = args[0]?.toLowerCase();
    const prefix = parsed.prefix || '.';
    
    // In group, only admin/owner
    if (ctx.group && !ctx.isAdmin && !isOwner(ctx.sender)) {
      return ctx.reply({ text: 'Cuma admin/owner yang bisa atur reminder di grup~ 😤' });
    }

    if (action === 'on') {
      const cfg = await getReminderConfig(ctx.jid);
      if (cfg?.enabled) {
        return ctx.reply({ text: 'Reminder udah aktif kok di sini~ 🌸' });
      }
      
      await setReminderConfig(ctx.jid, { 
        enabled: true, 
        isGroup: ctx.group,
        mentions: ctx.group ? [] : undefined
      });
      return ctx.reply({ text: '✅ Sip! Reminder pasangan udah aktif. Nanti aku ingetin makan, mandi, tidur, dll sesuai jadwal nyata ya~ ✨' });
    }

    if (action === 'off') {
      await setReminderConfig(ctx.jid, { enabled: false });
      return ctx.reply({ text: '🔇 Reminder dimatikan. Ga aku ingetin lagi deh~' });
    }

    if (action === 'tag' && ctx.group) {
        const target = ctx.msg.message?.extendedTextMessage?.contextInfo?.participant || (ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
        
        if (!target) {
            return ctx.reply({ text: 'Reply atau tag orang yang mau di-ingetin bareng~' });
        }
        const cfg = await getReminderConfig(ctx.jid) || { mentions: [] };
        let mentions = cfg.mentions || [];
        if (!mentions.includes(target)) mentions.push(target);
        
        await setReminderConfig(ctx.jid, { mentions });
        return ctx.reply({ text: `✅ @${target.split('@')[0]} bakal di-tag pas aku ngingetin nanti~`, mentions: [target] });
    }

    if (action === 'untag' && ctx.group) {
        const target = ctx.msg.message?.extendedTextMessage?.contextInfo?.participant || (ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
        if (!target) {
            return ctx.reply({ text: 'Reply atau tag orang yang mau di-untag~' });
        }
        const cfg = await getReminderConfig(ctx.jid) || { mentions: [] };
        let mentions = (cfg.mentions || []).filter(m => m !== target);
        await setReminderConfig(ctx.jid, { mentions });
        return ctx.reply({ text: `✅ @${target.split('@')[0]} udah gak di-tag lagi pas reminder~`, mentions: [target] });
    }

    if (action === 'list') {
      const cfg = await getReminderConfig(ctx.jid) || {};
      let schedule = cfg.schedule;
      if (!schedule) {
        const reminderLib = await import('../lib/reminder.js');
        schedule = reminderLib.DEFAULT_SCHEDULE;
      }
      let msg = `*Jadwal Pengingat Pasangan* 🕒\n\n`;
      schedule.forEach((s, i) => {
        const hh = String(s.hour).padStart(2, '0');
        const mm = String(s.minute).padStart(2, '0');
        if (s.type === 'tugas' && s.date) {
          msg += `${i + 1}. *${s.text || 'Tugas'}*\n   ${s.date} — ${hh}:${mm} WIB\n`;
        } else {
          msg += `${i + 1}. Rutinitas — Jam ${hh}:${mm} WIB (*${s.type.replace('_', ' ')}*)\n`;
        }
      });
      return ctx.reply({ text: msg });
    }

    if (action === 'add') {
      const timeStr = args[1];
      const type = args[2]?.toLowerCase();
      
      if (!timeStr || !type) {
        return ctx.reply({ text: `Caranya: \`${prefix}reminder add <jam:menit> <tipe>\`\n\nContoh: \`${prefix}reminder add 15:30 nanya_kabar\`\n\nTipe yang tersedia: bangun, sarapan, makan_siang, ngantuk, nanya_kabar, makan_malam, mandi, tidur` });
      }

      const [hh, mm] = timeStr.split(':').map(Number);
      if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return ctx.reply({ text: 'Format waktu salah! Gunakan format HH:MM (contoh 08:30)' });
      }

      const validTypes = ['bangun', 'sarapan', 'makan_siang', 'ngantuk', 'nanya_kabar', 'makan_malam', 'mandi', 'tidur'];
      if (!validTypes.includes(type)) {
        return ctx.reply({ text: `Tipe pengingat gak dikenal!\n\nPilih dari: ${validTypes.join(', ')}` });
      }

      const cfg = await getReminderConfig(ctx.jid) || {};
      let schedule = cfg.schedule;
      if (!schedule) {
        const reminderLib = await import('../lib/reminder.js');
        schedule = [...reminderLib.DEFAULT_SCHEDULE];
      }
      
      schedule.push({ hour: hh, minute: mm, type });
      schedule.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)); // urutkan berdasar waktu
      
      await setReminderConfig(ctx.jid, { schedule });
      return ctx.reply({ text: `✅ Berhasil nambahin pengingat *${type}* jam *${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} WIB*~` });
    }

    if (action === 'del' || action === 'remove') {
      const idx = parseInt(args[1]) - 1;
      if (isNaN(idx)) {
        return ctx.reply({ text: `Caranya: \`${prefix}reminder del <nomor>\`\nCek nomornya di \`${prefix}reminder list\`` });
      }

      const cfg = await getReminderConfig(ctx.jid) || {};
      let schedule = cfg.schedule;
      if (!schedule) {
        const reminderLib = await import('../lib/reminder.js');
        schedule = [...reminderLib.DEFAULT_SCHEDULE];
      }

      if (idx < 0 || idx >= schedule.length) {
        return ctx.reply({ text: 'Nomornya nggak ketemu di jadwal~' });
      }

      const removed = schedule.splice(idx, 1)[0];
      await setReminderConfig(ctx.jid, { schedule });
      return ctx.reply({ text: `✅ Jadwal jam ${String(removed.hour).padStart(2, '0')}:${String(removed.minute).padStart(2, '0')} (${removed.type}) udah dihapus~` });
    }

    if (action === 'reset') {
      await setReminderConfig(ctx.jid, { schedule: null });
      return ctx.reply({ text: '✅ Jadwal pengingat udah dibalikin ke default bawaan aku~' });
    }

    // Default help
    let msg = `*Fitur Pengingat Pasangan* 🌸\n\n`;
    msg += `\`${prefix}reminder on\` — Aktifkan pengingat\n`;
    msg += `\`${prefix}reminder off\` — Matikan pengingat\n`;
    msg += `\`${prefix}reminder list\` — Lihat jadwal saat ini\n`;
    msg += `\`${prefix}reminder add <jam:menit> <tipe>\` — Tambah jadwal\n`;
    msg += `\`${prefix}reminder del <nomor>\` — Hapus jadwal\n`;
    msg += `\`${prefix}reminder reset\` — Kembali ke jadwal awal\n`;
    
    if (ctx.group) {
        msg += `\n*Khusus Grup (reply/tag):*\n`;
        msg += `\`${prefix}reminder tag\` — Tambah orang yg di-tag\n`;
        msg += `\`${prefix}reminder untag\` — Hapus tag orang\n`;
    }
    return ctx.reply({ text: msg });
  }
};
