import { parseCommand } from '../lib/utils.js';
import { config } from '../lib/config.js';

function extractNumber(jid = '') {
  // Handle format: 628xxx@s.whatsapp.net, 628xxx@lid, 628xxx:20@s.whatsapp.net
  return jid.replace(/@.*$/, '').replace(/:.*$/, '').replace(/\D/g, '');
}

export default {
  name: 'admin',
  description: 'Fitur admin grup',
  priority: 5,
  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed) return false;

    const cmds = ['kick', 'promote', 'demote', 'add', 'mute', 'unmute', 'hidetag', 'grouplink', 'resetlink', 'admin', 'owner', 'clearsession', 'photoreact', 'antilink'];
    if (!cmds.includes(parsed.cmd)) return false;

    const isGroup = ctx.jid.endsWith('@g.us');

    const senderJid = ctx.msg?.key?.participant || ctx.msg?.key?.remoteJid || ctx.sender || '';
    const senderNum = extractNumber(senderJid);

    // Cek semua kemungkinan sumber nomor
    const senderFromCtx = extractNumber(ctx.sender || '');

    const ownerList = config.owners || [];
    const knownLids = config.ownerLids || [];

    let isOwner = ownerList.includes(senderNum) 
      || ownerList.includes(senderFromCtx)
      || knownLids.includes(senderJid)
      || knownLids.includes(extractNumber(senderJid));

    console.log('[ADMIN DEBUG v2]', { senderJid, senderNum, senderFromCtx, ownerList, isOwner });

    let isAdmin = false;
    let isBotAdmin = false;
    let groupMeta = null;
    let participants = [];

    if (isGroup) {
      groupMeta = await ctx.sock.groupMetadata(ctx.jid);
      participants = groupMeta.participants;
      
      const senderAdmin = participants.find(p => p.id === ctx.sender)?.admin;
      isAdmin = senderAdmin === 'admin' || senderAdmin === 'superadmin';
      
      const botJid = ctx.sock.user.id.replace(/:.*@/, '@');
      const botAdmin = participants.find(p => p.id === botJid)?.admin;
      isBotAdmin = botAdmin === 'admin' || botAdmin === 'superadmin';
    }

    if (!isOwner && isGroup) {
      try {
        const meta = groupMeta || await ctx.sock.groupMetadata(ctx.jid);
        const participant = meta.participants.find(p => 
          p.id === ctx.sender || p.lid === ctx.sender
        );
        if (participant) {
          const resolvedNum = extractNumber(participant.id);
          if (ownerList.includes(resolvedNum)) isOwner = true;
        }
      } catch {}
    }

    const isAuthorized = isOwner || isAdmin;
    const prefix = Array.isArray(config.prefix) ? config.prefix[0] : (config.prefix || '.');
    const target = ctx.msg.message?.extendedTextMessage?.contextInfo?.participant;

    // --- .admin atau .owner ---
    if (parsed.cmd === 'admin' || parsed.cmd === 'owner') {
      if (!isAuthorized) {
        await ctx.reply({ text: "Kamu bukan admin/owner, nggak bisa lihat ini~ 😤" });
        return true;
      }
      
      const senderNum = ctx.sender.replace('@s.whatsapp.net', '');
      const groupName = isGroup ? groupMeta.subject : '';
      
      let schedulerStatus = '🔴 Mati';
      try {
        const { isSchedulerActive } = await import('../lib/profile/scheduler.js');
        schedulerStatus = isSchedulerActive() ? '🟢 Aktif' : '🔴 Mati';
      } catch { /* ignore */ }

      let menu = `┏━━━━━━━━━━━━━━━━━━━━━━━┓\n┃     ADMIN PANEL 🔥        \n┗━━━━━━━━━━━━━━━━━━━━━━━┛\n\n👤 ${senderNum}\n`;
      if (isGroup) menu += `🏠 ${groupName}\n`;
      menu += `
┌─ 👥 Manajemen Member
│  ${prefix}kick — keluarkan member (reply)
│  ${prefix}add <nomor> — tambah member
│  ${prefix}promote — jadikan admin (reply)
│  ${prefix}demote — copot admin (reply)
│
├─ 💬 Manajemen Grup
│  ${prefix}mute — hanya admin yang bisa chat
│  ${prefix}unmute — semua bisa chat lagi
│  ${prefix}hidetag <pesan> — tag semua member
│  ${prefix}grouplink — ambil link invite
│  ${prefix}resetlink — reset link invite
│  ${prefix}antilink on|off — filter link WhatsApp
│  ${prefix}photoreact on|off — reaksi foto/stiker
│
├─ 🧠 AI & Persona
│  ${prefix}persona set <mode> — ganti kepribadian
│    Mode: jutek · ceria · serius · santai
│  ${prefix}persona — lihat profil persona user
│  ${prefix}serious — aktifkan mode serius bot
│  ${prefix}normal — kembalikan ke mode normal
│  !reset — hapus memory percakapan
│
├─ 📝 Pengingat Tugas & Rutinitas
│  "ingetin tugas matematika besok jam 15"
│  "tambah deadline laporan hari jumat jam 08:00"
│  "ingetin aku meeting tanggal 20 jam 10"
│  "tunda 10 menit" (snooze pengingat)
│  "lihat jadwal" / "hapus jadwal nomor 2"
│  "aktifkan pengingat" / "matiin pengingat"
│  Auto PP Scheduler & Pengingat: ${schedulerStatus}
│
├─ 🖼️ Profile Picture Manager
│  "ganti pp jadi foto ini" — update PP langsung
│  "simpan foto ini ke koleksi pp" — tambah koleksi
│  "ganti pp random" — pilih acak dari koleksi
│  "lihat koleksi pp" — tampilkan daftar koleksi
│  "hapus pp <nomor>" — hapus dari koleksi
│  "aktifkan pp random tiap <N> jam" — jadwal otomatis
│
├─ 👑 Owner Only
│  !mode self|public — ganti mode akses bot
│  !premium add <nomor> — tambah user premium
│  ${prefix}clearsession — lihat/hapus session WA
│
└─ ℹ️ Command grup butuh bot jadi admin
   Command PP & Pengingat bisa dipakai di mana saja

_HU TAO_ 🚀📚⏰`;

      await ctx.reply({ text: menu.trim() });
      return true;
    }

    // --- Semua command di bawah ini butuh grup ---
    if (!isGroup) {
      await ctx.reply({ text: "Command ini cuma bisa dipakai di grup ya~ 😅" });
      return true;
    }

    if (!isAuthorized) {
      await ctx.reply({ text: "Kamu bukan admin, nggak bisa pakai command ini~ 😤" });
      return true;
    }

    // --- Command yang tidak butuh bot jadi admin ---
    if (parsed.cmd === 'hidetag') {
      const msgText = parsed.args.join(' ');
      if (!msgText) {
        await ctx.reply({ text: `Usage: ${prefix}hidetag <pesan>` });
        return true;
      }
      const allMembers = participants.map(p => p.id);
      await ctx.sock.sendMessage(ctx.jid, { text: msgText, mentions: allMembers });
      return true;
    }

    // --- .photoreact (tidak butuh bot jadi admin) ---
    if (parsed.cmd === 'photoreact') {
      if (!isAuthorized) {
        await ctx.reply({ text: 'Kamu bukan admin/owner~ 😤' });
        return true;
      }
      const arg = parsed.args[0]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        await ctx.reply({ text: `Usage: ${prefix}photoreact on|off` });
        return true;
      }
      const { setPhotoReact } = await import('./photo-reaction.js');
      await setPhotoReact(ctx.jid, arg === 'on');
      await ctx.reply({ text: arg === 'on' ? '✅ Reaksi foto/stiker diaktifkan~' : '🔇 Reaksi foto/stiker dimatikan~' });
      return true;
    }

    // --- .antilink (tidak butuh bot jadi admin) ---
    if (parsed.cmd === 'antilink') {
      if (!isGroup) {
        await ctx.reply({ text: 'Command ini cuma bisa dipakai di grup ya~' });
        return true;
      }
      const arg = parsed.args[0]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        await ctx.reply({ text: `Usage: ${prefix}antilink on|off` });
        return true;
      }
      const { saveGroup } = await import('../lib/database.js');
      await saveGroup(ctx.jid, { antilink: arg === 'on' });
      await ctx.reply({ text: arg === 'on' ? '✅ Antilink diaktifkan di grup ini~' : '🔇 Antilink dimatikan di grup ini~' });
      return true;
    }

    // --- Mulai dari sini, bot harus admin ---
    if (!isBotAdmin) {
      await ctx.reply({ text: "Aku harus jadi admin dulu baru bisa~ 🥀" });
      return true;
    }

    if (parsed.cmd === 'kick') {
      if (!target) {
        await ctx.reply({ text: "Reply dulu pesan yang mau di-kick ya~" });
        return true;
      }
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
        await ctx.sock.sendMessage(ctx.jid, { text: `✅ @${target.split('@')[0]} berhasil dikeluarkan~`, mentions: [target] }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal mengeluarkan member~" });
      }
      return true;
    }

    if (parsed.cmd === 'promote') {
      if (!target) {
        await ctx.reply({ text: "Reply dulu pesan yang mau di-promote ya~" });
        return true;
      }
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'promote');
        await ctx.sock.sendMessage(ctx.jid, { text: `✅ @${target.split('@')[0]} sekarang jadi admin~`, mentions: [target] }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal promote member~" });
      }
      return true;
    }

    if (parsed.cmd === 'demote') {
      if (!target) {
        await ctx.reply({ text: "Reply dulu pesan yang mau di-demote ya~" });
        return true;
      }
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'demote');
        await ctx.sock.sendMessage(ctx.jid, { text: `✅ @${target.split('@')[0]} dicopot dari admin~`, mentions: [target] }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal demote member~" });
      }
      return true;
    }

    if (parsed.cmd === 'add') {
      let num = parsed.args[0];
      if (!num) {
        await ctx.reply({ text: `Usage: ${prefix}add <nomor>` });
        return true;
      }
      // Bersihkan karakter non-digit
      num = num.replace(/[^0-9]/g, '');
      if (num.startsWith('08')) {
        num = '628' + num.slice(2);
      }
      const addTarget = `${num}@s.whatsapp.net`;
      
      try {
        const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, [addTarget], 'add');
        const status = res[0]?.status;
        if (status === '403' || status === '408' || status === 403 || status === 408) {
          await ctx.reply({ text: `🥀 Gagal tambah ${num}, mungkin settingan privasi-nya ketat~` });
        } else {
          await ctx.sock.sendMessage(ctx.jid, { text: `✅ @${num} berhasil ditambahkan~`, mentions: [addTarget] }, { quoted: ctx.msg });
        }
      } catch (err) {
        await ctx.reply({ text: `🥀 Gagal tambah ${num}, mungkin settingan privasi-nya ketat~` });
      }
      return true;
    }

    if (parsed.cmd === 'mute') {
      try {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
        await ctx.reply({ text: "🔇 Grup dimute, cuma admin yang bisa chat~" });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal mute grup~" });
      }
      return true;
    }

    if (parsed.cmd === 'unmute') {
      try {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
        await ctx.reply({ text: "🔊 Grup dibuka, semua bisa chat lagi~" });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal unmute grup~" });
      }
      return true;
    }

    if (parsed.cmd === 'grouplink') {
      try {
        const code = await ctx.sock.groupInviteCode(ctx.jid);
        await ctx.reply({ text: `🔗 Link grup:\nhttps://chat.whatsapp.com/${code}` });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal ambil link grup~" });
      }
      return true;
    }

    if (parsed.cmd === 'resetlink') {
      try {
        await ctx.sock.groupRevokeInvite(ctx.jid);
        await ctx.reply({ text: "✅ Link grup berhasil direset~" });
      } catch (err) {
        await ctx.reply({ text: "🥀 Gagal reset link grup~" });
      }
      return true;
    }

    // --- .clearsession — hanya owner ---
    if (parsed.cmd === 'clearsession') {
      if (!isOwner) {
        await ctx.reply({ text: 'Hanya owner yang bisa pakai command ini~ 😤' });
        return true;
      }
      const confirmArg = parsed.args[0];
      try {
        const { WaSession } = await import('../lib/db/models.js');
        const totalDocs = await WaSession.countDocuments();
        const keyDocs = await WaSession.countDocuments({ path: { $not: /^creds/ } });

        if (confirmArg !== 'confirm') {
          await ctx.reply({ text: `🔍 Session MongoDB:\nTotal docs: *${totalDocs}*\nSession keys (bukan creds): *${keyDocs}*\n\nKirim *.clearsession confirm* untuk hapus session keys.\n⚠️ creds.json tidak akan dihapus, tidak perlu scan QR ulang.` });
          return true;
        }

        // Hapus semua KECUALI creds.json
        const result = await WaSession.deleteMany({ path: { $not: /^creds/ } });
        console.log(`[CLEARSESSION] Deleted ${result.deletedCount} session key docs`);
        await ctx.reply({ text: `✅ *${result.deletedCount}* session keys dihapus dari MongoDB.\ncreds.json tetap aman ~ tidak perlu scan QR ulang.\n\nBot akan rebuild session otomatis saat pesan berikutnya masuk~ 🔥` });
      } catch (e) {
        await ctx.reply({ text: `🥀 Error clearsession: ${e.message}` });
        console.error('[CLEARSESSION ERROR]', e);
      }
      return true;
    }

    return false;
  }
};
