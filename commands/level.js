import { getUser } from '../lib/database.js';
import { levelBar } from '../lib/utils.js';

export default {
  name: 'level',
  aliases: ['rank', 'xp'],
  description: 'Lihat level & XP',

  async run(ctx) {
    const user = await getUser(ctx.sender);
    const needed = user.level * 100;
    const bar = levelBar(user.xp, user.level);

    await ctx.reply({
      text: `╭ *Level Info* 🔥
┃ Level: *${user.level}*
┃ XP: ${user.xp}/${needed}
┃ ${bar}
┃ Pesan: ${user.messages}
╰ Hu Tao inget kamu kok~ 😹`
    });
  }
};
