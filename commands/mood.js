import { getUserProfile } from '../lib/hu-tao-ai.js';
import { getMoodDescription, getMoodMode } from '../lib/persona.js';

export default {
  name: 'mood',
  aliases: [],
  description: 'Lihat mood Hu Tao saat ini',
  cooldown: 2000,

  async run(ctx, args) {
    const jid = ctx.sender;
    const profile = await getUserProfile(jid);

    const moodDesc = getMoodDescription(profile.mood_score);
    const moodMode = getMoodMode(profile.mood_score);

    let response = `*MOOD STATUS* 🎭\n\n${moodDesc}`;

    // Add some personality based on mood
    if (moodMode.label === 'Happy') {
      response += `\n\n✨ Aku lagi super happy! Banyak yang bisa kita bicarain~ 💕`;
    } else if (moodMode.label === 'Normal') {
      response += `\n\n😐 Aku lagi normal aja. Siapa tahu kamu bisa bikin aku lebih bahagia?`;
    } else if (moodMode.label === 'Cold') {
      response += `\n\n🥶 Aku lagi dingin... coba curhat sesuatu yang bagus ke aku ya`;
    } else if (moodMode.label === 'Sulking') {
      response += `\n\n😢 Aku lagi sedih... kamu perlu repair aku...`;
    }

    response += `\n\n_Mood score: ${profile.mood_score}/100_`;

    return ctx.reply({ text: response });
  }
};
