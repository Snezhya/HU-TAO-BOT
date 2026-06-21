import { getUser, isPremium } from '../lib/database.js';

export default {
  name: 'profile',
  aliases: ['me'],
  description: 'Profil user',

  async run(ctx) {
    const user = await getUser(ctx.sender);
    const premium = isPremium(ctx.sender);

    await ctx.reply({
      text: `╭ *Profile* 🥀
┃ Nomor: ${ctx.sender.split('@')[0]}
┃ Level: ${user.level}
┃ XP: ${user.xp}
┃ Premium: ${premium ? '✅' : '❌'}
┃ Memory chat: ${user.memory.length} pesan
╰ Makin deket sama Hu Tao ya~ 🔥`
    });
  }
};
