import dotenv from 'dotenv';

dotenv.config();

const parseList = (str = '') =>
  str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  botName: process.env.BOT_NAME || 'Hu Tao AI',
  prefix: process.env.PREFIX || '!',
  owner: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
  // Multi-owner: OWNERS env = koma-separated, gabungkan dengan OWNER_NUMBER
  owners: (() => {
    const list = [];
    const primary = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
    if (primary) list.push(primary);
    const extra = parseList(process.env.OWNERS || '');
    for (const n of extra) {
      const clean = n.replace(/\D/g, '');
      if (clean && !list.includes(clean)) list.push(clean);
    }
    return list;
  })(),
  ownerLids: parseList(process.env.OWNER_LIDS || ''),
  mode: process.env.BOT_MODE || 'public', // self | public

  /** Satu key (legacy) atau banyak via GEMINI_API_KEYS (koma) */
  geminiKeys: (() => {
    const multi = parseList(process.env.GEMINI_API_KEYS);
    const single = (process.env.GEMINI_API_KEY || '').trim();
    if (multi.length) return multi;
    return single ? [single] : [];
  })(),
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiEnabled: process.env.GEMINI_ENABLED !== 'false',
  /** Model aktif di free tier (hindari 1.5 — sering 404) */
  geminiModels: (() => {
    const fromEnv = parseList(process.env.GEMINI_MODELS);
    if (fromEnv.length) return fromEnv;
    const single = (process.env.GEMINI_MODEL || '').trim();
    if (single) return [single];
    return ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];
  })(),
  /** Maks key dicoba per model (kurangi spam request) */
  geminiMaxKeysPerModel: Math.max(1, Number(process.env.GEMINI_MAX_KEYS_PER_MODEL) || 2),
  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  loginMethod: process.env.LOGIN_METHOD || 'qr', // qr | pairing
  pairingPhone: (process.env.PAIRING_PHONE || '').replace(/\D/g, ''),

  nodeEnv: process.env.NODE_ENV || 'development',
  isRailway:
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_PROJECT_ID ||
    !!process.env.RAILWAY_SERVICE_NAME,

  mongodbUri: process.env.MONGODB_URI || '',
  /** auto | mongo | file */
  sessionStore: process.env.SESSION_STORE || 'auto',
  sessionsDir: process.env.SESSIONS_DIR || 'sessions',
  reconnectDelayMs: Number(process.env.RECONNECT_DELAY_MS) || 5000,
  dbReconnectDelayMs: Number(process.env.DB_RECONNECT_DELAY_MS) || 10000,
  dbFlushIntervalMs: Number(process.env.DB_FLUSH_INTERVAL_MS) || 5000,

  port: Number(process.env.PORT) || 3000,
  /** URL publik Railway — untuk link /qr */
  publicUrl:
    process.env.PUBLIC_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : ''),
  expressEnabled: process.env.EXPRESS_ENABLED !== 'false',

  maxMemory: Number(process.env.MAX_MEMORY_MESSAGES) || 10,
  defaultCooldown: Number(process.env.DEFAULT_COOLDOWN_MS) || 3000,
  premiumCooldown: Number(process.env.PREMIUM_COOLDOWN_MS) || 1000,

  antilinkGroups: parseList(process.env.ANTILINK_GROUPS),
  ytdlApi: process.env.YTDL_API || '',

  altPrefix: process.env.ALT_PREFIX || '.',
  timezone: process.env.TIMEZONE || 'Asia/Jakarta',

  // Menu assets — path relatif ke assets/menu/ atau URL penuh
  menu: {
    style: process.env.MENU_STYLE || 'auto',
    interactive: process.env.MENU_INTERACTIVE !== 'false',
    bannerImage: process.env.MENU_BANNER_IMAGE || '',
    thumbnail: process.env.MENU_THUMBNAIL || '',
    thumbnailUrl: process.env.MENU_THUMBNAIL_URL || '',
    sourceUrl: process.env.MENU_SOURCE_URL || ''
  },

  // Persona lengkap di lib/persona.js
};

// Nomor bot aktif — diisi setelah connect
export let botNumber = '';
export function setBotNumber(num) {
  botNumber = String(num).replace(/\D/g, '');
}

export function normalizeJid(jid) {
  return String(jid).replace(/@.*$/, '').replace(/[^0-9]/g, '') || '';
}

export const isOwner = (jid) => {
  const senderNum = normalizeJid(jid);

  // Bot's own number is always owner
  if (botNumber && senderNum === normalizeJid(botNumber)) return true;

  // Check against ownerLids if it's a LID
  if (String(jid).includes('@lid')) {
    if (config.ownerLids.some(o => normalizeJid(o) === senderNum)) return true;
  }

  // Check against all owners in list
  return config.owners.some(o => {
    const normO = normalizeJid(o);
    return senderNum === normO || senderNum.endsWith(normO) || normO.endsWith(senderNum);
  });
};

export const isSelfMode = () => config.mode === 'self';
