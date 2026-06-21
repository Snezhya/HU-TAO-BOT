import makeWASocket, {
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config, setBotNumber } from './config.js';
import { log } from './logger.js';
import { useAuthState, recordSessionError, resetSessionErrorCount } from './auth-store.js';
import { setWhatsAppQr, setPairingCode, setWaConnected } from './qr-state.js';
import { logQrUrl } from './qr-routes.js';

let sockInstance = null;
let reconnectTimer = null;
let connecting = false;

export function getSocket() {
  return sockInstance;
}

export async function connectWhatsApp(onMessage, onGroupUpdate) {
  if (connecting) return sockInstance;
  connecting = true;

  try {
    const { state, saveCreds } = await useAuthState();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Hu Tao AI', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true
    });

    sockInstance = sock;
    let pairingRequested = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (
        connection === 'connecting' &&
        config.loginMethod === 'pairing' &&
        !state.creds.registered &&
        !pairingRequested
      ) {
        pairingRequested = true;
        if (!config.pairingPhone) {
          log.error('PAIRING_PHONE belum diset di .env');
        } else {
          try {
            const code = await sock.requestPairingCode(config.pairingPhone);
            setPairingCode(code);
            log.success(`Pairing code: ${code}`);
            log.info('WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon');
            log.info(`Atau buka: ${logQrUrl()}`);
          } catch (err) {
            log.error(`Pairing gagal: ${err.message}`);
          }
        }
      }

      if (qr && config.loginMethod === 'qr') {
        setWhatsAppQr(qr);
        log.info('Scan QR di WhatsApp → Linked Devices');
        qrcode.generate(qr, { small: true });
        log.info(`Atau buka di browser: ${logQrUrl()}`);
      }

      if (connection === 'close') {
        const code =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.statusCode;
        log.warn(`WhatsApp disconnected (code: ${code})`);

        sockInstance = null;
        setWaConnected(false);

        if (code === DisconnectReason.loggedOut) {
          log.error('Logout — hapus session DB/file dan scan ulang');
        } else if (code === DisconnectReason.connectionReplaced) {
          log.error('Session dipakai di tempat lain (connectionReplaced). Bot berhenti reconnect untuk menghindari loop.');
          log.error('Pastikan hanya satu instance bot yang berjalan (Railway atau lokal, bukan keduanya).');
          // Jangan reconnect — akan menyebabkan infinite loop
        } else if (code === DisconnectReason.forbidden || code === DisconnectReason.badSession) {
          log.error(`Session bermasalah (code: ${code}) — hapus session dan scan ulang QR.`);
          // Jangan reconnect — session tidak valid
        } else {
          scheduleReconnect(onMessage, onGroupUpdate);
        }
      }

      if (connection === 'open') {
        setWaConnected(true);
        resetSessionErrorCount(); // reset counter saat koneksi berhasil
        log.success('WhatsApp connected');
        log.success(`${config.botName} online! 🔥🥀`);
        const me = sock.user?.id?.split(':')[0];
        log.info(`Nomor bot: ${me}`);
        if (me) setBotNumber(me);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
        if (msg.messageStubType || !Object.keys(msg.message).length) continue;

        try {
          await onMessage(sock, msg);
        } catch (err) {
          const msgText = err.message || '';
          const isCryptoErr =
            msgText.includes('Bad MAC') ||
            msgText.includes('MessageCounterError') ||
            msgText.includes('Key used already') ||
            msgText.includes('Failed to decrypt') ||
            msgText.includes('Session');
          if (isCryptoErr) {
            recordSessionError();
            log.warn(`[Decrypt] ${msgText.slice(0, 100)}`);
          } else {
            log.error(`Message handler: ${msgText}`);
          }
        }
      }
    });

    // Register group-events listener setiap kali socket baru terbuat
    if (typeof onGroupUpdate === 'function') {
      onGroupUpdate(sock);
    }

    return sock;
  } finally {
    connecting = false;
  }
}

function scheduleReconnect(onMessage, onGroupUpdate) {
  if (reconnectTimer) return;
  log.info(`Reconnecting in ${config.reconnectDelayMs / 1000}s...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectWhatsApp(onMessage, onGroupUpdate);
    } catch (err) {
      log.error(`Reconnect gagal: ${err.message}`);
      scheduleReconnect(onMessage, onGroupUpdate);
    }
  }, config.reconnectDelayMs);
}

export async function closeWhatsApp() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sockInstance) {
    try {
      sockInstance.end(undefined);
    } catch {
      /* ignore */
    }
    sockInstance = null;
  }
}
