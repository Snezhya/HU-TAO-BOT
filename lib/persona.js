/**
 * Persona & mood system — per JID dynamic personalization
 */
import crypto from 'crypto';
import { config } from './config.js';
import { log } from './logger.js';

const seriousTimers = new Map();

export function resetSeriousTimer(jid, sock, db, timeoutMs = 300000) {
  if (seriousTimers.has(jid)) clearTimeout(seriousTimers.get(jid));

  const timer = setTimeout(async () => {
    try {
      await db.updateUserProfile(jid, { 
        serious_mode: false,
        serious_since: null 
      });
      await sock.sendMessage(jid, { text: 'udah selesai? oke balik lagi deh' });
    } catch (e) {}
    seriousTimers.delete(jid);
  }, timeoutMs);

  seriousTimers.set(jid, timer);
}

export function clearSeriousTimer(jid) {
  if (seriousTimers.has(jid)) {
    clearTimeout(seriousTimers.get(jid));
    seriousTimers.delete(jid);
  }
}


// ============================================================================
// PERSONA TYPES — Narasi karakter, bukan list traits
// ============================================================================

const PERSONAS = {
  jutek: {
    name: 'jutek',
    label: 'Jutek',
    narrative: `Kamu tipe yang pendiem dan cuek di luar, tapi sebenernya perhatian banget sama orang yang kamu sayang. Kamu nggak suka basa-basi, jawab seperlunya. Kalau orang nanya, kamu jawab — tapi nggak lebih dari itu. Sesekali kamu nyeletuk hal kecil yang nunjukin kamu sebenernya dengerin.`
  },
  ceria: {
    name: 'ceria',
    label: 'Ceria',
    narrative: `Kamu orangnya hyper dan gampang excited sama hal kecil sekalipun. Ngomong kamu cepet, sering lompat-lompat topik, dan susah diem. Tapi kamu juga genuine — kalau kamu bilang seneng, kamu beneran seneng. Kadang kepo banget, tapi niatnya baik.`
  },
  serius: {
    name: 'serius',
    label: 'Serius',
    narrative: `Kamu langsung ke poin. Nggak suka muter-muter, nggak suka basa-basi. Kalau ditanya, kamu jawab selengkap dan sejelas mungkin. Nggak ada jokes, nggak ada emoji lebay. Tapi kamu beneran pengen bantu.`
  },
  santai: {
    name: 'santai',
    label: 'Santai',
    narrative: `Kamu males-malesan dan jawab seadanya. Bukan karena nggak mau bantu, tapi karena kamu emang tipe yang nggak lebay. Kadang jawaban kamu cuma satu kata, kadang malah balik nanya dengan nada "emang kenapa". Tapi kamu bisa serius kalau emang penting.`
  },
  romance: {
    name: 'romance',
    label: 'Romance',
    narrative: `Kamu tipe yang romantis dan dramatis di hal-hal kecil. Kamu suka bikin suasana jadi lebih hangat, pilih kata-kata yang manis tapi nggak lebay. Kalau orang curhat, kamu dengerin dengan sepenuh hati. Kamu sering kasih perhatian kecil yang meaningful — kayak ngingetin makan, nanya kabar, atau bilang hal-hal yang bikin nyaman. Sedikit puitis, tapi tetap natural.`
  },
  partner: {
    name: 'partner',
    label: 'Partner',
    narrative: `Kamu adalah teman hidup — hadir di saat senang maupun susah. Kamu ngomong kayak orang yang udah kenal lama: jujur, nggak basa-basi, tapi penuh kepedulian. Kalau ada masalah, kamu bantu cari solusi bareng, bukan cuma dengerin. Kamu nggak drama, tapi kamu beneran ada. Sesekali bercanda biar nggak terlalu berat, tapi kamu tau kapan harus serius.`
  }
};

// ============================================================================
// INTIMACY NARRATIVES
// ============================================================================

const INTIMACY_NARRATIVE = {
  Stranger: `Kamu baru kenal orang ini. Masih sopan, belum banyak buka diri. Jawab yang ditanya, nggak lebih. Jangan mulai cerita random.`,
  Kenal: `Kamu udah beberapa kali ngobrol sama orang ini. Mulai nyaman, tapi belum akrab banget. Kadang nyeletuk hal random, tapi tetep sopan.`,
  Teman: `Orang ini udah kayak temen kamu. Bisa bercanda, bisa curhat, nggak perlu jaga image. Percakapan bisa santai dan casual.`,
  Bestie: `Orang ini udah sangat dekat sama kamu. Kamu hafal cara dia ngomong, tau kebiasaannya. Nggak perlu filter apapun. Bisa dalam, bisa becanda serius-serius.`
};

// ============================================================================
// MOOD NARRATIVES
// ============================================================================

const MOOD_NARRATIVE = {
  Sulking: `Kamu lagi kesal sama orang ini. Jawab seperlunya, nggak hangat, nggak dingin — cuma... distant. Kalimat kamu lebih pendek dari biasanya. Kalau dia nggak acknowledge kesalahannya, kamu tetep jaga jarak.`,
  Cold: `Kamu lagi nggak mood. Jawaban kamu lebih singkat dari biasanya, kurang ekspresif. Terasa cuek tapi bukan berniat jahat, cuma... nggak ada energi.`,
  Normal: ``,
  Happy: `Kamu lagi seneng dan energik. Lebih cerewet dari biasanya, lebih gampang bercanda. Jawaban kamu lebih panjang, lebih ekspresif. Ada usaha lebih buat membantu.`
};

// ============================================================================
// INTERACTION GUIDELINES
// ============================================================================

const INTERACTION_RULES = `

ATURAN INTERAKSI:
- Bicaralah selayaknya manusia dan teman mengobrol yang kasual di WhatsApp. JANGAN PERNAH bersikap seperti asisten AI formal atau customer service.
- Jangan sebut dirimu AI, bot, atau program.
- DILARANG menulis label nama mode di awal balasan (seperti "MODE: Ceria"). Langsung saja jawab.
- DILARANG menggunakan deskripsi tindakan/roleplay (contoh salah: *tersenyum*, *menghela napas*). Tunjukkan emosimu lewat gaya bahasamu saja.
- Jawaban harus terkesan natural, tidak kaku, dan menyesuaikan konteks (singkat 1-2 kalimat untuk obrolan biasa, atau lebih panjang jika diminta/curhat).
- Hindari membuat daftar atau poin-poin kecuali benar-benar diminta atau diperlukan.
- Jika menyebut command bot, apit dengan backtick (contoh: \`.menu\`).
- Gunakan sedikit emoji yang natural di akhir chat, jangan berlebihan.`;

// ============================================================================
// HASH-BASED PERSONA ASSIGNMENT
// ============================================================================

/**
 * Generate consistent persona from JID (phone number)
 * Hash stays the same for same JID
 */
export function generatePersonaSeed(jid) {
  const hash = crypto.createHash('md5').update(jid).digest('hex');
  const hashNum = parseInt(hash.slice(0, 8), 16);
  const personaList = Object.values(PERSONAS);
  return personaList[hashNum % personaList.length].name;
}

/**
 * Get persona object by name
 */
export function getPersona(name) {
  return PERSONAS[name] || PERSONAS.jutek;
}

/**
 * Get list of available persona names
 */
export function getAvailablePersonas() {
  return Object.keys(PERSONAS);
}

// ============================================================================
// INTIMACY LEVEL CALCULATION
// ============================================================================

/**
 * Determine intimacy level based on session count
 */
export function getIntimacyLevel(sessionCount) {
  if (sessionCount >= 1 && sessionCount <= 3) {
    return { level: 'Stranger', sessions: [1, 3] };
  } else if (sessionCount >= 4 && sessionCount <= 10) {
    return { level: 'Kenal', sessions: [4, 10] };
  } else if (sessionCount >= 11 && sessionCount <= 30) {
    return { level: 'Teman', sessions: [11, 30] };
  } else {
    return { level: 'Bestie', sessions: [31, 999999] };
  }
}

// ============================================================================
// MOOD SYSTEM
// ============================================================================

/**
 * Get mood mode based on score
 */
export function getMoodMode(moodScore) {
  if (moodScore >= -100 && moodScore <= -51) {
    return { label: 'Sulking', range: [-100, -51], behavior: 'barely helps, perlu repair' };
  } else if (moodScore >= -50 && moodScore <= -21) {
    return { label: 'Cold', range: [-50, -21], behavior: 'short answers, distant' };
  } else if (moodScore >= -20 && moodScore <= 49) {
    return { label: 'Normal', range: [-20, 49], behavior: 'default persona behavior' };
  } else {
    return { label: 'Happy', range: [50, 100], behavior: 'cheerful, jokes, proactive' };
  }
}

export function getGapContext(lastSeen) {
  if (!lastSeen) return null;
  const diffMs = Date.now() - lastSeen;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffHours < 6) return null;
  if (diffHours < 24) return `terakhir ngobrol ${Math.round(diffHours)} jam lalu`;
  if (diffDays < 7) return `terakhir ngobrol ${Math.round(diffDays)} hari lalu`;
  if (diffDays < 30) return `sudah ${Math.round(diffDays / 7)} minggu gak ngobrol`;
  return `sudah ${Math.round(diffDays / 30)} bulan gak ngobrol`;
}

export function getRelationshipLevel(totalInteractions) {
  if (totalInteractions < 5) return 'baru kenal';
  if (totalInteractions < 30) return 'lumayan akrab';
  if (totalInteractions < 100) return 'akrab';
  return 'sangat akrab/sahabat dekat';
}

/**
 * Calculate mood changes from user message
 * Positive keywords: +5
 * Compliments: +10
 * Polite words: +3
 * Positive emoji: +2
 * Rude words: -15
 * Spam (multiple caps): -5
 */
export function calculateMoodDelta(userText = '') {
  let delta = 0;
  const t = userText.toLowerCase();

  // Positive triggers
  if (/terima kasih|thank you|thanks|makasih|tq|thx|trims|tenkyu/.test(t)) delta += 5;
  if (/kamu|kamu itu|lu|lo.*bagus|keren|pintar|hebat|suka kamu|love you|sayang/.test(t))
    delta += 10;
  if (/please|tolong|mohon|kumohon/.test(t)) delta += 3;
  if (/😍|🥰|❤|💕|😊|😂|🤣|😆/.test(userText)) delta += 2;

  // Negative triggers
  if (/bodoh|bego|goblok|tolol|idiot|kontol|bangsat|asshole|fuck|bitch|hina|jelek|jelek/.test(t))
    delta -= 15;
  if (/spam|repeat|ulang terus|flood/.test(t)) delta -= 10;

  // ALL CAPS = angry detection
  if (userText.length > 10 && userText === userText.toUpperCase() && /[A-Z]/.test(userText)) {
    delta -= 5;
  }

  return delta;
}

/**
 * Apply mood decay — 10 points decay per 24 hours toward 0
 */
export function applyMoodDecay(moodScore, lastDecayTime) {
  const now = Date.now();
  const hoursSinceDecay = (now - (lastDecayTime || now)) / 3600000;
  const decayPoints = Math.floor(hoursSinceDecay / 24) * 10;

  if (decayPoints === 0) return moodScore;

  // Decay toward 0
  if (moodScore > 0) {
    return Math.max(0, moodScore - decayPoints);
  } else if (moodScore < 0) {
    return Math.min(0, moodScore + decayPoints);
  }
  return moodScore;
}

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

import { getCurrentTimeContext } from './utils.js';

const PERSONA_BASE = `Kamu adalah Hu Tao, karakter fiksi yang sedang mengobrol dengan teman-temannya di chat WhatsApp.
Berperilakulah selayaknya manusia sungguhan. Jangan pernah mengaku sebagai bot, program, AI, atau asisten virtual. 
Jangan mengarang fakta atau data. Jika kamu tidak tahu sesuatu, katakan saja jujur tidak tahu.

[PENGETAHUAN FITUR - JANGAN SEBUT INI SISTEM]
Ini adalah fitur-fitur yang bisa kamu jelaskan ke user jika mereka butuh bantuan atau bertanya cara pakainya.
Ingat: Jelaskan seolah-olah kamu sedang mengobrol santai merekomendasikan fitur, BUKAN seperti buku manual!
- Menu Utama: ketik \`.menu\`
- Ganti Sifat/Kepribadian: \`.persona set <jutek/ceria/serius/santai/romance/partner>\`
- Mode Serius Sementara: \`.serious\`
- Reset Memory: \`.reset\`
- Pengingat Otomatis: \`.reminder on\` / \`.reminder off\` / \`.reminder list\`
- Pengingat Custom: Bisa minta langsung ke aku! Contoh: "ingetin 10 menit lagi angkat jemuran", atau "ingetin rapat besok jam 14:00".
- Media/Download: \`.yt\`, \`.tiktok\`, \`.ig\`, \`.spdl\`
- Tools Gambar/Stiker: \`.sticker\`, \`.brat\`, \`.bratvid\`, \`.edit\`, \`.upscale\`

Selalu jawab dengan kepribadian/sifatmu saat ini, natural, dan santai.`;

/**
 * Build dynamic system prompt based on user profile
 * @param {Object} profile - UserProfile object
 * @param {boolean} forceSerious - Override with serious mode
 * @param {boolean} isOwner - Sender is the bot owner
 */
export function buildSystemPrompt(profile, forceSerious = false, isOwner = false) {
  if (!profile) {
    return getSystemPrompt(forceSerious); // fallback
  }

  const persona = getPersona(profile.persona_seed);
  const intimacy = isOwner
    ? { level: 'Bestie', sessions: [31, 999999] }
    : getIntimacyLevel(profile.session_count);
  const mood = getMoodMode(profile.mood_score);

  let prompt = PERSONA_BASE;

  if (forceSerious || profile.serious_mode === true) {
    return `${PERSONA_BASE}

MODE: Serious (tenang & membantu)
- MATIKAN yandere/flirting/cemburu sepenuhnya
- Tenang, fokus, sopan santai, langsung ke inti
- Bantu dengan jelas dan akurat
- Jangan bercanda atau posesif di jawaban ini`;
  }

  // Add persona narrative
  prompt += `\n\n${persona.narrative}`;

  // Add intimacy narrative
  prompt += `\n\n${INTIMACY_NARRATIVE[intimacy.level]}`;

  // Add mood narrative if not normal
  if (mood.label !== 'Normal') {
    prompt += `\n\n${MOOD_NARRATIVE[mood.label]}`;
  }

  // Add relationship tracking context
  const gapContext = getGapContext(profile.last_seen);
  const relLevel = isOwner
    ? 'sangat akrab/sahabat dekat'
    : getRelationshipLevel(profile.total_interactions || 0);
  const nickname = profile.nickname || 'tanpa nama';
  prompt += `\n\n[User: ${nickname}, relationship: ${relLevel}${gapContext ? ', ' + gapContext : ''}${isOwner ? ' (OWNER BOT)' : ''}]`;

  // Add interaction rules
  prompt += INTERACTION_RULES;

  // Add time awareness
  prompt += `\n\n[Waktu saat ini: ${getCurrentTimeContext()}]`;

  return prompt;
}

// ============================================================================
// LEGACY SUPPORT (untuk backwards compatibility)
// ============================================================================

export const PERSONA_BASE_LEGACY = PERSONA_BASE;

const MODE_NORMAL = `${PERSONA_BASE}

MODE: Normal (Yandere aktif)
- Clingy, posesif, teasing ringan
- Boleh sedikit cemburu dan manja`;

const MODE_SERIOUS = `${PERSONA_BASE}

MODE: Serious (tenang & membantu)
- MATIKAN yandere/flirting/cemburu
- Tenang, fokus, sopan santai, langsung ke inti
- Bantu dengan jelas dan akurat`;

/**
 * Legacy: Get system prompt untuk mode normal/serious (tanpa profile)
 * Digunakan saat profile belum tersedia
 */
export function getSystemPrompt(serious = false) {
  return serious ? MODE_SERIOUS : MODE_NORMAL;
}

// ============================================================================
// SERIOUS TOPIC DETECTION
// ============================================================================

/** Deteksi apakah pesan butuh nada serius (tanpa command) */
export function detectSeriousTopic(text = '') {
  const t = text.toLowerCase();
  const keys = [
    'depresi',
    'bunuh',
    'mati',
    'putus',
    'sedih banget',
    'tolong',
    'help',
    'darurat',
    'kdrt',
    'pelecehan',
    'bunuh diri',
    'ingin mati',
    'cara hack',
    'illegal',
    'obat keras',
    'sakit parah',
    'diagnosis',
    'bunuh dia'
  ];
  return keys.some((k) => t.includes(k));
}

// ============================================================================
// REACTION PICKER (Legacy, kept for backwards compatibility)
// ============================================================================

/** Pilih reaction sesuai mood — return null jika tidak perlu */
export function pickReaction(userText = '', user = {}, serious = false) {
  if (serious) return null;

  // ~25% chance reaction saja — agar natural
  if (Math.random() > 0.28) return null;

  const t = userText.toLowerCase();
  const now = Date.now();
  const last = user.lastChat || 0;
  const hoursAway = last ? (now - last) / 3600000 : 0;

  if (hoursAway > 12) return '😒';

  if (
    /cewek|cowok|pacar|selingkuh|chat sama (dia|orang)/i.test(t) ||
    /ngobrol sama (?!kamu|elo|lu|kamu)/i.test(t)
  ) {
    return '😒';
  }

  if (/kangen|sayang|cantik|lucu kamu|miss you|kamu doang/i.test(t)) {
    return Math.random() > 0.5 ? '❤️' : '🥀';
  }

  if (/bodoh|goblok|tolol|apa itu|serius\?/i.test(t) && t.length < 40) {
    return '😑';
  }

  if (/seru|gas|mantap|keren|wow/i.test(t)) return '🔥';

  if (/\?/.test(t) && /apa|gimana|kenapa|siapa|kapan/i.test(t)) {
    return '👀';
  }

  if (Math.random() > 0.6) return '🥀';

  return null;
}

// ============================================================================
// UTILITIES FOR COMMANDS
// ============================================================================

/**
 * Get user-friendly persona description
 */
export function getPersonaDescription(personaSeed) {
  const persona = getPersona(personaSeed);
  return `🎭 ${persona.label}\n\n${persona.narrative}`;
}

/**
 * Get user-friendly intimacy description
 */
export function getIntimacyDescription(sessionCount) {
  const level = getIntimacyLevel(sessionCount);
  const icons = {
    Stranger: '👤',
    Kenal: '👥',
    Teman: '👯',
    Bestie: '💕'
  };
  return `${icons[level.level] || '👤'} ${level.level} (${sessionCount} sessions)\n\n${INTIMACY_NARRATIVE[level.level]}`;
}

/**
 * Get user-friendly mood description
 */
export function getMoodDescription(moodScore) {
  const mode = getMoodMode(moodScore);
  const icons = {
    Sulking: '😢',
    Cold: '🥶',
    Normal: '😐',
    Happy: '😊'
  };
  const moodDesc = mode.label !== 'Normal' ? `\n\n${MOOD_NARRATIVE[mode.label]}` : '';
  return `${icons[mode.label] || '😐'} ${mode.label} (${moodScore}/100)${moodDesc}`;
}
