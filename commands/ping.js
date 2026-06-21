export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Cek latency bot',

  async run(ctx) {
    const start = Date.now();
    const sent = await ctx.reply({ text: '🏓 Pong...' });
    const ms = Date.now() - start;
    await ctx.sock.sendMessage(ctx.jid, {
      text: `🏓 Pong! *${ms}ms* — Hu Tao masih sehat 🔥`,
      edit: sent.key
    });
  }
};
