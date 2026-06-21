/**
 * Dinonaktifkan — menu pakai teks saja, tanpa list/poll
 */
import { extractMenuRowId, formatRowReply } from '../lib/menu-list.js';
import { log } from '../lib/logger.js';

export default {
  name: 'menu-response',
  description: 'Handle response from interactive menu selection',
  disabled: false,
  priority: 10,

  async run(ctx) {
    const rowId = extractMenuRowId(ctx.msg);
    if (!rowId) return false;

    log.info(`Interactive menu selected: ${rowId} from ${ctx.sender.split('@')[0]}`);
    const replyText = formatRowReply(rowId);
    if (replyText) {
      await ctx.reply({ text: replyText });
      return true;
    }
    return false;
  }
};
