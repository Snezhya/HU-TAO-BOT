import { respondHuTao } from '../lib/hu-tao-ai.js';
import { log } from '../lib/logger.js';

export default {
  name: 'ai',
  aliases: ['chat', 'tanya'],
  description: 'Chat dengan Hu Tao AI',
  cooldown: 3000,

  async run(ctx, args) {
    const prompt = args.join(' ') || 'Halo~';
    try {
      await respondHuTao(ctx, ctx.sender, prompt);
    } catch (err) {
      log.error(`ai command: ${err.message}`);
      await ctx.reply({ text: err.message || 'Hu Tao lagi pusing 🥀' });
    }
  }
};
