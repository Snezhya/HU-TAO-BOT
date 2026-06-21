/**
 * setting.js — Kelola feature toggle per chat (Public Bot)
 *
 * Commands:
 *   .setting / .status          — tampilkan daftar fitur + status
 *   .enable <nama>              — aktifkan fitur by nama
 *   .disable <nama>             — matikan fitur by nama
 *   .on <nomor> [nomor2 ...]    — aktifkan by nomor urut
 *   .off <nomor> [nomor2 ...]   — matikan by nomor urut
 *
 * Siapa yang bisa toggle:
 *   - owner (selalu bisa)
 *   - admin grup (kecuali fitur owner-only seperti rvo)
 */

import {
  getAllRegisteredFeatures,
  getSettings,
  setFeature,
  setFeatures,
  isOwnerOnlyToggle
} from '../lib/feature-toggle.js';

// Separator visual
const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━';

/**
 * Resolve apakah sender adalah admin grup (cek metadata Baileys).
 * Mengembalikan false jika bukan grup atau gagal fetch metadata.
 */
async function resolveIsAdmin(ctx) {
  if (!ctx.group) return false;
  try {
    const meta = await ctx.sock.groupMetadata(ctx.jid);
    const admins = meta.participants.filter(p => p.admin).map(p => p.id);
    return admins.includes(ctx.sender);
  } catch {
    return false;
  }
}

/**
 * Cek apakah sender berhak toggle fitur tertentu.
 * - Owner → selalu bisa
 * - Admin grup → bisa, KECUALI fitur owner-only
 */
async function canToggle(ctx, featureName) {
  if (ctx.isOwner) return true;
  if (isOwnerOnlyToggle(featureName)) return false; // fitur owner-only, bukan owner = tolak
  return await resolveIsAdmin(ctx);
}

/**
 * Cek apakah sender berhak akses setting (lihat/toggle apapun).
 * - Owner selalu bisa
 * - Admin grup bisa
 */
async function hasSettingAccess(ctx) {
  if (ctx.isOwner) return true;
  return await resolveIsAdmin(ctx);
}

/** Bangun teks tampilan setting */
async function buildSettingText(jid) {
  const features = getAllRegisteredFeatures();
  const settings = await getSettings(jid);

  let list = '';
  features.forEach((name, idx) => {
    const isOn = settings[name] ?? true;
    list += `${idx + 1}. ${name} : ${isOn ? '🟢 ON' : '🔴 OFF'}\n`;
  });

  return (
    `⚙️ *Setting Bot*\n` +
    `${SEP}\n` +
    list.trimEnd() +
    `\n${SEP}\n` +
    `💡 .enable <nama> | .disable <nama>\n` +
    `💡 .on <nomor> | .off <nomor>`
  );
}

export default {
  name: 'setting',
  aliases: ['status', 'enable', 'disable', 'on', 'off'],
  description: 'Kelola fitur bot per chat',
  bypassToggle: true, // command ini SELALU bisa diakses
  ownerOnly: false,
  groupOnly: false,
  privateOnly: false,
  cooldown: 3,
  xp: 0,

  async run(ctx, args, parsed) {
    const cmd = parsed?.cmd || 'setting';
    const jid = ctx.jid;

    // ── .setting / .status ─────────────────────────────────────────────
    if (cmd === 'setting' || cmd === 'status') {
      if (!(await hasSettingAccess(ctx))) {
        await ctx.reply({ text: '❌ Hanya owner atau admin grup yang bisa melihat setting.' });
        return;
      }
      const text = await buildSettingText(jid);
      await ctx.reply({ text });
      return;
    }

    // ── .enable / .disable ─────────────────────────────────────────────
    if (cmd === 'enable' || cmd === 'disable') {
      const enabled = cmd === 'enable';
      const targetName = args[0]?.toLowerCase();

      if (!targetName) {
        await ctx.reply({ text: `❗ Contoh: *.${cmd} ai*` });
        return;
      }

      if (!(await canToggle(ctx, targetName))) {
        const reason = isOwnerOnlyToggle(targetName)
          ? `Fitur *${targetName}* hanya bisa diubah oleh owner.`
          : 'Hanya owner atau admin grup yang bisa ubah setting.';
        await ctx.reply({ text: `❌ ${reason}` });
        return;
      }

      const result = await setFeature(jid, targetName, enabled);
      if (!result.ok) {
        await ctx.reply({ text: `❌ ${result.message}` });
        return;
      }

      const icon = enabled ? '🟢' : '🔴';
      await ctx.reply({ text: `${icon} Fitur *${targetName}* berhasil di-${enabled ? 'aktifkan' : 'matikan'}.` });
      return;
    }

    // ── .on / .off (by nomor) ──────────────────────────────────────────
    if (cmd === 'on' || cmd === 'off') {
      const enabled = cmd === 'on';
      const features = getAllRegisteredFeatures();

      if (!args.length) {
        await ctx.reply({ text: `❗ Contoh: *.${cmd} 1 3 5*` });
        return;
      }

      // Parse nomor
      const numbers = args.map(a => parseInt(a, 10)).filter(n => !isNaN(n));
      if (!numbers.length) {
        await ctx.reply({ text: '❗ Masukkan nomor fitur yang valid.' });
        return;
      }

      // Validasi range
      const outOfRange = numbers.filter(n => n < 1 || n > features.length);
      if (outOfRange.length) {
        await ctx.reply({ text: `❌ Nomor tidak valid: ${outOfRange.join(', ')} (range 1–${features.length})` });
        return;
      }

      // Resolve nama fitur dari nomor
      const targets = numbers.map(n => features[n - 1]);

      // Cek akses per fitur
      const denied = [];
      for (const name of targets) {
        if (!(await canToggle(ctx, name))) denied.push(name);
      }

      if (denied.length === targets.length) {
        await ctx.reply({ text: `❌ Tidak punya izin untuk mengubah: ${denied.map(d => `*${d}*`).join(', ')}` });
        return;
      }

      // Set yang diizinkan
      const allowed = targets.filter(t => !denied.includes(t));
      const updates = {};
      for (const name of allowed) updates[name] = enabled;

      const result = await setFeatures(jid, updates);
      if (!result.ok) {
        await ctx.reply({ text: `❌ ${result.message}` });
        return;
      }

      const icon = enabled ? '🟢' : '🔴';
      let replyText = `${icon} Berhasil di-${enabled ? 'aktifkan' : 'matikan'}: ${allowed.map(n => `*${n}*`).join(', ')}`;
      if (denied.length) replyText += `\n⚠️ Dilewati (no akses): ${denied.map(d => `*${d}*`).join(', ')}`;

      await ctx.reply({ text: replyText });
      return;
    }
  }
};