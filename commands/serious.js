/**
 * .serious / !serious — toggle mode tenang & fokus
 */
import { resetSeriousTimer, clearSeriousTimer } from '../lib/persona.js';
import { getUserProfile, updateUserProfile } from '../lib/hu-tao-ai.js';
import { isOwner } from '../lib/config.js';

export default {
  name: 'serious',
  aliases: ['normal'],
  description: 'Toggle mode serious / normal',
  cooldown: 2000,

  async run(ctx, args, parsed) {
    const sub = args[0]?.toLowerCase();
    const commandName = parsed?.cmd?.toLowerCase() || 'serious';
    const profile = await getUserProfile(ctx.sender);
    const db = { updateUserProfile };

    if (sub === 'status') {
      await ctx.reply({
        text: profile.serious_mode
          ? 'Mode sekarang: *serious* (tenang & fokus)'
          : 'Mode sekarang: *normal* (sesuai kepribadian)'
      });
      return;
    }

    if (ctx.isGroup && !ctx.isAdmin && !ctx.isOwner && !isOwner(ctx.sender)) {
      return ctx.reply({ text: '❌ Di grup, hanya Admin atau Owner yang bisa mengubah mode bot!' });
    }

    let turnOn = true;
    
    // Determine target state based on command/alias
    if (commandName === 'normal' || sub === 'off') {
        turnOn = false;
    } else if (commandName === 'serious' || sub === 'on') {
        turnOn = true;
    }

    // Check if already in target state
    if (turnOn && profile.serious_mode) {
        return ctx.reply({ text: 'Aku sudah dalam mode serius.\nKetik *.normal* untuk kembali ke mode biasa.' });
    }
    
    if (!turnOn && !profile.serious_mode) {
        return ctx.reply({ text: 'Aku sudah dalam mode biasa.\nKetik *.serious* untuk beralih ke mode serius.' });
    }

    // Apply state
    if (turnOn) {
      await updateUserProfile(ctx.sender, {
        serious_mode: true,
        serious_since: Date.now()
      });
      resetSeriousTimer(ctx.sender, ctx.sock, db);
      await ctx.reply({ text: 'Oke, mode serius diaktifkan. Aku siap membantu.' });
    } else {
      await updateUserProfile(ctx.sender, {
        serious_mode: false,
        serious_since: null
      });
      clearSeriousTimer(ctx.sender);
      await ctx.reply({ text: 'Mode biasa dikembalikan~ Kepribadian normal aktif lagi! 🥀' });
    }
  }
};
