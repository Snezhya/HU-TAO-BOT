import express from 'express';
import { config } from './config.js';
import { log } from './logger.js';
import { getDbMode, isDbReady } from './database.js';
import { isMongoConnected } from './db/connection.js';
import { registerQrRoutes, getPublicBase } from './qr-routes.js';
import { getQrState } from './qr-state.js';

let serverReady = false;

export function startExpress(sockRef = { current: null }) {
  if (!config.expressEnabled) return null;

  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => {
    const waOk = !!sockRef.current?.user;
    const base = getPublicBase(req);
    const qrUrl = `${base}/qr`;

    if (!waOk && req.accepts('html')) {
      return res.redirect('/qr');
    }

    res.json({
      bot: config.botName,
      status: 'online',
      mode: config.mode,
      database: getDbMode(),
      mongo: isMongoConnected(),
      whatsapp: waOk,
      uptime: process.uptime(),
      env: config.nodeEnv,
      scanWhatsApp: waOk ? null : qrUrl,
      petunjuk: waOk
        ? 'WhatsApp sudah connect'
        : `Buka ${qrUrl} di browser untuk scan QR (bukan URL ini)`
    });
  });

  app.get('/login', (_, res) => res.redirect('/qr'));

  app.get('/health', (_, res) => {
    const waOk = !!sockRef.current?.user;
    res.status(serverReady ? 200 : 503).json({
      ok: serverReady,
      whatsapp: waOk,
      database: getDbMode(),
      mongo: isMongoConnected(),
      scanWhatsApp: !waOk ? '/qr' : undefined
    });
  });

  app.get('/ready', (_, res) => {
    const waOk = !!sockRef.current?.user;
    const dbOk = isDbReady();
    const ok = serverReady && waOk && dbOk;
    res.status(ok ? 200 : 503).json({
      ok,
      whatsapp: waOk,
      database: getDbMode(),
      mongo: isMongoConnected(),
      user: sockRef.current?.user?.id?.split(':')[0] || null
    });
  });

  registerQrRoutes(app);

  const server = app.listen(config.port, '0.0.0.0', () => {
    serverReady = true;
    log.success(`Express → 0.0.0.0:${config.port}`);
    log.info(`Scan WA: /qr  |  Health: /health`);
    if (config.isRailway) {
      log.success('Railway healthcheck OK');
      const { connected } = getQrState();
      if (!connected) {
        const url = config.publicUrl ? `${config.publicUrl}/qr` : '/qr (generate Railway domain dulu)';
        log.info(`Scan WhatsApp di browser: ${url}`);
      }
    }
  });

  return server;
}
