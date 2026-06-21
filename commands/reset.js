import { clearMemory } from '../lib/database.js';

export default {
  name: 'reset',
  description: 'Hapus memory chat AI',
  cooldown: 5000,

  async run(ctx) {
    await clearMemory(ctx.sender);
    await ctx.reply({ text: 'Memory chat dihapus~ mulai fresh lagi ya 😹🥀' });
  }
};
