import { getUserProfile, updateUserProfile } from '../lib/hu-tao-ai.js';
import {
  getPersonaDescription,
  getIntimacyDescription,
  getMoodDescription,
  getMoodMode,
  getAvailablePersonas
} from '../lib/persona.js';
import { isOwner } from '../lib/config.js';

export default {
  name: 'persona',
  aliases: ['pers'],
  description: 'Lihat persona & mood kamu',
  cooldown: 3000,

  async run(ctx, args) {
    const jid = ctx.sender;
    const profile = await getUserProfile(jid);

    if (args[0] === 'reset') {
      // Reset mood (admin/owner only)
      if (!ctx.isOwner && !isOwner(ctx.sender)) {
        return ctx.reply({ text: '❌ Hanya owner yang bisa reset mood' });
      }

      await updateUserProfile(jid, { mood_score: 0 });
      return ctx.reply({
        text: '✅ Mood direset ke 0 (normal)\n\nAyo kita mulai fresh~'
      });
    }

    if (args[0] === 'set') {
      if (ctx.isGroup && !ctx.isAdmin && !ctx.isOwner && !isOwner(ctx.sender)) {
        return ctx.reply({ text: '❌ Di grup, hanya Admin atau Owner yang bisa mengganti kepribadian ku!' });
      }

      const mode = args[1]?.toLowerCase();
      const available = getAvailablePersonas();
      
      if (!mode || !available.includes(mode)) {
        return ctx.reply({ 
          text: `❌ Mode tidak ditemukan.\n\nMode yang tersedia:\n${available.map(m => `- ${m}`).join('\n')}`
        });
      }
      
      await updateUserProfile(jid, { persona_seed: mode });
      return ctx.reply({ text: `✅ Kepribadian berhasil diubah ke: *${mode}*` });
    }

    // Show current persona, intimacy, mood
    const personaDesc = getPersonaDescription(profile.persona_seed);
    const intimacyDesc = getIntimacyDescription(profile.session_count);
    const moodDesc = getMoodDescription(profile.mood_score);

    const moodMode = getMoodMode(profile.mood_score);
    let hint = '';
    if (moodMode.label === 'Sulking' && profile.mood_score < -50) {
      hint = '\n\n💔 *kayaknya kita perlu ngobrol baik-baik dulu deh...*';
    }

    const message = `
*PERSONA PROFILE* 👤

${personaDesc}

${intimacyDesc}

${moodDesc}${hint}

_Gunakan .persona set <mode> untuk mengganti kepribadian_
_Gunakan .persona reset untuk reset mood (admin only)_
`.trim();

    return ctx.reply({ text: message });
  }
};
