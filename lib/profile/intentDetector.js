/**
 * Profile Intent Detector
 * Detects natural language commands for profile management
 */

const INTENT_PATTERNS = {
  // Ganti PP dengan gambar yang dikirim/direply
  SET_PP: [
    /ganti\s+(pp|foto\s*profil|profile\s*pic(ture)?)/i,
    /ubah\s+(pp|foto\s*profil|profile\s*pic(ture)?)/i,
    /update\s+(pp|foto\s*profil|profile\s*pic(ture)?)/i,
    /jadik[ae]n\s+.*(pp|foto\s*profil)/i,
    /pakai\s+foto\s+ini/i,
    /set\s+(pp|profile)/i,
    /change\s+(pp|profile)/i,
  ],

  // Simpan gambar ke koleksi PP
  SAVE_PP: [
    /simpan\s+.*(pp|foto\s*profil|koleksi)/i,
    /tambah(kan)?\s+.*(gudang\s*pp|koleksi\s*pp)/i,
    /save\s+.*(pp|profile|koleksi)/i,
    /masukin\s+.*(koleksi|gudang)\s*(pp)?/i,
    /taruh\s+di\s+koleksi/i,
  ],

  // Ganti PP dengan gambar random dari koleksi
  RANDOM_PP: [
    /ganti\s+pp\s+random/i,
    /pilih\s+pp\s+acak/i,
    /random\s+(pp|profile)/i,
    /pakai\s+foto\s+random/i,
    /acak(kan)?\s+(pp|foto\s*profil)/i,
    /pp\s+random/i,
  ],

  // Aktifkan scheduler random PP
  SCHEDULER_ON: [
    /aktifkan\s+pp\s+random/i,
    /ganti\s+pp\s+(otomatis|auto)/i,
    /jadwal(kan)?\s+(pp|foto)/i,
    /auto\s+(pp|profile)/i,
    /pp\s+(otomatis|auto)/i,
    /nyalain\s+(scheduler|jadwal)\s*pp/i,
  ],

  // Matikan scheduler
  SCHEDULER_OFF: [
    /nonaktifkan\s+pp\s+random/i,
    /matikan\s+(scheduler|jadwal|auto)\s*(pp)?/i,
    /stop\s+(pp\s+otomatis|auto\s*pp)/i,
    /matiin\s+(jadwal|auto)\s*(pp)?/i,
    /turn\s+off\s+(pp|profile)/i,
  ],

  // Lihat koleksi PP
  LIST_PP: [
    /lihat?\s+koleksi\s*(pp)?/i,
    /tampil(kan)?\s+koleksi/i,
    /daftar\s+(pp|foto\s*profil)/i,
    /list\s+(pp|koleksi)/i,
    /berapa\s+pp\s+di\s+koleksi/i,
  ],

  // Hapus PP dari koleksi
  DELETE_PP: [
    /hapus\s+(pp|foto)\s*(dari\s+koleksi)?/i,
    /remove\s+(pp|foto)/i,
    /delete\s+(pp|foto)/i,
    /buang\s+(dari\s+koleksi|pp)/i,
  ],
};

/**
 * Parse scheduler interval from text
 * e.g. "tiap 6 jam" → 6
 *      "setiap 12 jam" → 12
 */
export function parseSchedulerInterval(text) {
  const match = text.match(/(?:tiap|setiap|per)\s+(\d+)\s*jam/i);
  if (match) return parseInt(match[1]);
  const matchMenit = text.match(/(?:tiap|setiap|per)\s+(\d+)\s*menit/i);
  if (matchMenit) return parseInt(matchMenit[1]) / 60;
  return null; // default akan digunakan
}

/**
 * Detect intent from text
 * @param {string} text
 * @returns {{ intent: string|null, intervalHours: number|null }}
 */
export function detectIntent(text = '') {
  const t = text.trim();

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some((p) => p.test(t))) {
      const intervalHours = intent === 'SCHEDULER_ON' ? parseSchedulerInterval(t) : null;
      return { intent, intervalHours };
    }
  }

  return { intent: null, intervalHours: null };
}

/**
 * Check if message has image (direct or quoted)
 */
export function extractImageMessage(msg) {
  // Direct image
  if (msg.message?.imageMessage) {
    return msg.message.imageMessage;
  }

  // Quoted image (reply ke gambar)
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.imageMessage) {
    return quoted.imageMessage;
  }

  return null;
}
