/**
 * Menu interaktif — nativeFlowMessage single_select (Baileys 6.7+)
 */
import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';
import { buildListBody, buildListSections, FOOTER } from './menu-data.js';
import { log } from './logger.js';

export function buildNativeSelectSections() {
  return buildListSections().map((sec) => ({
    title: sec.title,
    rows: sec.rows.map((r) => ({
      id: r.rowId,
      title: r.title,
      description: r.description || ''
    }))
  }));
}

export function buildInteractiveMessageProto(stats) {
  const sections = buildNativeSelectSections();

  return {
    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
      body: proto.Message.InteractiveMessage.Body.fromObject({
        text: buildListBody(stats)
      }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({
        text: FOOTER
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        messageVersion: 3,
        buttons: [
          {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: 'Buka Menu',
              sections
            })
          }
        ]
      })
    }),
    messageContextInfo: {
      deviceListMetadataVersion: 2
    }
  };
}

export async function relayProto(sock, jid, messageProto, quoted) {
  const gen = generateWAMessageFromContent(jid, messageProto, {
    userJid: sock.user?.id,
    quoted: quoted?.key ? quoted : undefined,
    timestamp: new Date()
  });

  await sock.relayMessage(jid, gen.message, { messageId: gen.key.id });
  return gen;
}

export async function sendNativeFlowMenu(sock, jid, quoted, stats) {
  const protoMsg = buildInteractiveMessageProto(stats);
  await relayProto(sock, jid, protoMsg, quoted);
  log.success('Interactive menu sent (nativeFlow single_select)');
  return { ok: true, method: 'nativeFlow' };
}

export function extractNativeFlowRowId(msg) {
  const m = msg?.message;
  if (!m) return null;

  const native = m.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (native?.paramsJson) {
    try {
      const p = JSON.parse(native.paramsJson);
      const id = p.id || p.selected_row_id || p.selectedRowId || p.rowId;
      if (id?.startsWith?.('menu_')) return id;
    } catch {
      /* ignore */
    }
  }

  const btn =
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId;
  if (btn?.startsWith?.('menu_')) return btn;

  return null;
}
