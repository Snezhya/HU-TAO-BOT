/**
 * !menu / .menu / !help — menu teks
 */
import { showFullMenu } from '../lib/menu.js';
import { log } from '../lib/logger.js';

export default {
  name: 'menu',
  aliases: ['help', 'bot', 'm'],
  description: 'Menu gambar + teks Hu Tao AI',
  cooldown: 3000,

  async run(ctx) {
    try {
      await showFullMenu(ctx);
    } catch (err) {
      log.error(`menu: ${err.message}`);
      await ctx.reply({ text: `Menu error: ${err.message}` });
    }
  }
};
