/**
 * Menu interaktif — nativeFlow + listMessage (fallback, sering di-drop WA)
 */
import { proto } from '@whiskeysockets/baileys';
import { buildListBody, buildListSections, FOOTER, extractListRowId } from './menu-data.js';
import { log } from './logger.js';
import { sendNativeFlowMenu, relayProto, extractNativeFlowRowId } from './menu-interactive.js';

export {
  FOOTER,
  buildListSections,
  buildListBody,
  formatRowReply,
  extractListRowId,
  ROW_REPLIES
} from './menu-data.js';

export { extractNativeFlowRowId } from './menu-interactive.js';

export function extractMenuRowId(msg) {
  return extractNativeFlowRowId(msg) || extractListRowId(msg);
}

export function buildListMessageProto(stats) {
  const sections = buildListSections();

  return {
    listMessage: proto.Message.ListMessage.fromObject({
      title: 'Hu Tao AI',
      description: buildListBody(stats),
      buttonText: 'Buka Menu',
      footerText: FOOTER,
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      sections: sections.map((sec) => ({
        title: sec.title,
        rows: sec.rows.map((row) => ({
          title: row.title,
          description: row.description || '',
          rowId: row.rowId
        }))
      }))
    }),
    messageContextInfo: { deviceListMetadataVersion: 2 }
  };
}

async function sendLegacyList(sock, jid, quoted, stats) {
  await relayProto(sock, jid, buildListMessageProto(stats), quoted);
  log.success('Interactive menu sent (listMessage legacy)');
  return { ok: true, method: 'listMessage' };
}

/** Coba nativeFlow lalu listMessage — bisa sukses di log tapi tidak tampil di HP */
export async function sendInteractiveList(sock, jid, quotedMsg, stats) {
  const quoted = quotedMsg?.key ? quotedMsg : undefined;

  try {
    return await sendNativeFlowMenu(sock, jid, quoted, stats);
  } catch (err) {
    log.warn(`nativeFlow: ${err.message}`);
  }

  try {
    return await sendLegacyList(sock, jid, quoted, stats);
  } catch (err) {
    log.error(`listMessage: ${err.message}`);
    throw err;
  }
}
