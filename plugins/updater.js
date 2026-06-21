import { parseCommand } from '../lib/utils.js';
import { config, isOwner } from '../lib/config.js';
import { saveUser, getAllUsers } from '../lib/database.js';

export default {
  name: 'updater',
  description: 'Pengaturan notifikasi update bot dan broadcast update',
  priority: 5,

  async run(ctx) {
    const parsed = parseCommand(ctx.text, config.prefix);
    if (!parsed) return false;

    const { cmd, args } = parsed;

    if (cmd === 'nonotif') {
      await saveUser(ctx.sender, { notifUpdate: false });
      await ctx.reply({
        text: `💤 Oke, notifikasi update bot telah dimatikan ya~ Kamu nggak bakal dapet notif lagi. Kalo mau aktifin lagi tinggal ketik *${config.prefix}notifon* 🥀`
      });
      return true;
    }

    if (cmd === 'notifon') {
      await saveUser(ctx.sender, { notifUpdate: true });
      await ctx.reply({
        text: '🔔 Yeay! Notifikasi update bot telah diaktifkan kembali. Kamu bakal dapet info update fitur-fitur baru ke depannya! ✨'
      });
      return true;
    }

    if (cmd === 'bc' || cmd === 'bcupdate') {
      if (!isOwner(ctx.sender)) {
        return false; // Biar tidak tabrakan dengan plugin lain yang mungkin menangani .bc jika ada
      }

      const text = args.join(' ');
      if (!text) {
        await ctx.reply({
          text: `❌ Masukkan pesan update!\nContoh:\n${config.prefix}bc ✨ Fitur baru:\n  → .spdl [url] (Spotify DL)\n  → .rmwm (Remove WM)\n\n🛠️ Perbaikan:\n  → Fix update notif`
        });
        return true;
      }

      const users = await getAllUsers();
      const targetUsers = users.filter((u) => u.jid && !u.jid.endsWith('@g.us') && u.notifUpdate !== false);

      if (targetUsers.length === 0) {
        await ctx.reply({ text: '❌ Tidak ada user terdaftar yang mengaktifkan notifikasi update.' });
        return true;
      }

      await ctx.reply({ text: `📢 Mengirim broadcast update ke ${targetUsers.length} user...` });

      let successCount = 0;
      let failCount = 0;

      // Format update banner sesuai request user
      const formattedMessage = `╔══════════════════════════╗
║   🔔 UPDATE BOT TERBARU   ║
╚══════════════════════════╝

Halo! Ada kabar baru nih dari bot kita~ 🎉

${text}

Ketik *${config.prefix}menu* untuk lihat semua fitur terbaru!

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
💤 Ketik *${config.prefix}nonotif* kalau nggak mau
   dapet notifikasi update selanjutnya.
   (bisa diaktifkan lagi kapan aja~)`;

      for (const u of targetUsers) {
        try {
          await ctx.sock.sendMessage(u.jid, { text: formattedMessage });
          successCount++;
          // Jeda agar tidak terkena spam limit
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (err) {
          failCount++;
        }
      }

      await ctx.reply({
        text: `✅ Broadcast selesai!\n🚀 Sukses: ${successCount}\n❌ Gagal: ${failCount}`
      });
      return true;
    }

    return false;
  }
};