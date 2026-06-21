import { setPremium, isPremium } from '../lib/database.js';
import { formatJid } from '../lib/utils.js';

export default {
  name: 'premium',
  description: 'Kelola user premium (owner)',
  ownerOnly: true,

  async run(ctx, args) {
    const action = args[0]?.toLowerCase();
    const number = args[1]?.replace(/\D/g, '');

    if (!action || !number) {
      await ctx.reply({
        text: `Usage:\n!premium add 628xxx\n!premium del 628xxx\n!premium check 628xxx`
      });
      return;
    }

    const jid = formatJid(number);

    if (action === 'add') {
      await setPremium(jid, true);
      await ctx.reply({ text: `✅ ${number} sekarang premium~ 🔥` });
    } else if (action === 'del' || action === 'remove') {
      await setPremium(jid, false);
      await ctx.reply({ text: `❌ Premium ${number} dicabut 🥀` });
    } else if (action === 'check') {
      await ctx.reply({
        text: isPremium(jid) ? `${number} adalah premium 😹` : `${number} bukan premium`
      });
    }
  }
};
