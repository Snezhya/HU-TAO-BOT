/**
 * adm.js — Kelola akses admin grup terhadap setting bot (owner-only)
 *
 * Commands:
 *   .adm enable   — izinkan admin grup mengakses setting bot di chat ini
 *   .adm disable  — larang admin grup mengakses setting bot di chat ini
 *   .adm status   — lihat status akses admin + ringkasan access mode semua fitur
 */

import {
  getAllowAdminToggle,
  setAllowAdminToggle,
  getAccessMode,
  getAllRegisteredFeatures
} from '../lib/feature-toggle.js';

export default {
  name: 'adm',
  aliases: [],
  description: 'Kelola akses admin grup untuk setting bot (owner-only)',
  ownerOnly: true,
  bypassToggle: true,
  groupOnly: false,
  privateOnly: false,
  cooldown: 3,
  xp: 0,

  async run(ctx, args) {
    const action = args[0]?.toLowerCase();
    const jid = ctx.jid;

    // ── .adm status ──────────────────────────────────────────────
    if (action === 'status') {
      const allowed = await getAllowAdminToggle(jid);
      const icon = allowed ? '🟢' : '🔴';

      // Ambil access mode semua fitur terdaftar
      const features = getAllRegisteredFeatures();
      const accessModes = await Promise.all(
        features.map(name => getAccessMode(jid, name))
      );
      let accessList = '';
      features.forEach((name, idx) => {
        const mode = accessModes[idx];
        const modeIcon = mode === 'self' ? '🔐' : '🌐';
        accessList += `  ${idx + 1}. *${name}* — ${modeIcon} ${mode}\n`;
      });

      await ctx.reply({
        text:
          `👑 *Panel Admin*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${icon} Admin Toggle: *${allowed ? 'DIIZINKAN' : 'DIBATASI'}*\n` +
          `_(Admin grup ${allowed ? 'bisa' : 'tidak bisa'} ubah setting bot)_\n` +
          `\n🔐 *Access Mode Per Fitur:*\n` +
          accessList.trimEnd() +
          `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔐 self = hanya owner bot\n` +
          `🌐 public = semua member`
      });
      return;
    }

    // ── .adm enable ────────────────────────────────────────────────────
    if (action === 'enable') {
      const result = await setAllowAdminToggle(jid, true);
      if (!result.ok) {
        await ctx.reply({ text: `❌ Gagal mengubah pengaturan: ${result.message}` });
        return;
      }
      await ctx.reply({
        text: '🟢 Admin grup sekarang bisa mengakses setting bot di chat ini.'
      });
      return;
    }

    // ── .adm disable ───────────────────────────────────────────────────
    if (action === 'disable') {
      const result = await setAllowAdminToggle(jid, false);
      if (!result.ok) {
        await ctx.reply({ text: `❌ Gagal mengubah pengaturan: ${result.message}` });
        return;
      }
      await ctx.reply({
        text: '🔴 Admin grup tidak bisa lagi mengakses setting bot di chat ini.'
      });
      return;
    }

    // ── Help ───────────────────────────────────────────────────────────
    await ctx.reply({
      text:
        `⚙️ *Kelola Akses Admin*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*.adm enable*  — izinkan admin akses setting\n` +
        `*.adm disable* — larang admin akses setting\n` +
        `*.adm status*  — lihat status saat ini\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 Hanya owner yang bisa menjalankan command ini.`
    });
  }
};