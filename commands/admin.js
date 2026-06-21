import { config } from '../lib/config.js';
import { setPremium, setSettings } from '../lib/database.js';
import { formatJid } from '../lib/utils.js';

export default {
  name: 'mode',
  description: 'Ubah mode bot self/public (owner)',
  ownerOnly: true,

  async run(ctx, args) {
    const mode = args[0]?.toLowerCase();
    if (!['self', 'public'].includes(mode)) {
      await ctx.reply({
        text: `Mode sekarang: *${config.mode}*\nPakai: ${config.prefix}mode self|public`
      });
      return;
    }
    config.mode = mode;
    await setSettings({ mode });
    await ctx.reply({ text: `Mode diubah ke *${mode}* 🔥` });
  }
};
