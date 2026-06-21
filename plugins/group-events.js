import { getGroup } from '../lib/database.js';

// ═══════════════════════════════════════════
//          PESAN PER SKENARIO
// ═══════════════════════════════════════════

const msgs = {
  // Masuk sendiri / diundang lewat link
  joined: [
    '👋 Hai {user}! Selamat datang di grup~\nHu Tao pantau kamu ya 😹🔥',
    '🌸 Ooo ada member baru, {user}! Jangan kabur, Hu Tao clingy nih~ 🥀',
    '🔥 Welcome {user}! Patuh aturan grup atau Hu Tao yang urus 😈'
  ],

  // Ditambahkan oleh admin
  added: [
    '👋 Selamat datang {user}!\nKamu diundang oleh {actor}, sambut ya~ 🔥',
    '🌸 Hei {user}! Diajak sama {actor} buat gabung. Welcome welcome~ 🥀',
    '😹 Ada tamu baru nih! {user} dibawa masuk sama {actor}. Selamat datang!'
  ],

  // Keluar sendiri
  left: [
    '🥀 Bye {user}... Hu Tao sedih tapi gapapa~',
    '😹 {user} cabut sendiri. Semoga betah di luar sana~',
    '👋 {user} udah pergi. Sampai jumpa ya, jangan lupa Hu Tao! 🔥'
  ],

  // Di-kick / di-ban oleh admin
  kicked: [
    '🚪 {user} kena kick sama {actor}. Bye bye~ 😹',
    '💀 {actor} ngeluarin {user} dari grup. See you never~ 🥀',
    '🔥 {user} di-removed sama {actor}. Jangan balik ya~ 😈'
  ],

  // Dijadikan admin
  promoted: [
    '⭐ Selamat {user} jadi admin baru! Dipromosiin sama {actor}~ 🔥',
    '👑 {user} naik jabatan jadi admin! Terima kasih {actor} udah percaya 🥀',
    '🎉 {actor} promosiin {user} jadi admin. Selamat menjabat~ 😹'
  ],

  // Dicopot dari admin
  demoted: [
    '📉 {user} dicopot dari admin sama {actor}. Masa jabatan berakhir~ 🥀',
    '😬 {actor} nurunin {user} dari admin. Tetap semangat~ 🔥',
    '👋 {user} bukan admin lagi setelah keputusan {actor}. Oke~'
  ]
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmt(template, user, actor) {
  return template
    .replace('{user}', user)
    .replace('{actor}', actor || 'admin');
}

function getTag(jid) {
  return `@${jid.split('@')[0]}`;
}

// ═══════════════════════════════════════════
//     PLUGIN STUB (diperlukan oleh loader)
// ═══════════════════════════════════════════

export default {
  name: 'group-events',
  description: 'Welcome, goodbye, kick, promote & demote di grup',
  priority: 2,
  async run() {
    return false;
  }
};

// ═══════════════════════════════════════════
//        SETUP EVENT LISTENER
// ═══════════════════════════════════════════

export function setupGroupEvents(sock) {
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action, author } = update;

    // Hanya grup WhatsApp
    if (!id.endsWith('@g.us')) return;

    try {
      const group = await getGroup(id);
      // welcome & goodbye default ON — hanya skip jika EKSPLISIT di-off
      const welcomeOn = group?.welcome !== false;
      const goodbyeOn = group?.goodbye !== false;

      for (const participant of participants) {
        const userTag = getTag(participant);
        const actorTag = author ? getTag(author) : 'admin';
        const mentions = [participant, ...(author ? [author] : [])];

        let text = '';

        if (action === 'add') {
          // Cek apakah ada aktor yang menambahkan (admin yang menambah) atau join sendiri
          if (author && author !== participant) {
            // Ditambahkan oleh admin
            if (!welcomeOn) continue;
            text = fmt(pick(msgs.added), userTag, actorTag);
          } else {
            // Join sendiri via link undangan
            if (!welcomeOn) continue;
            text = fmt(pick(msgs.joined), userTag, actorTag);
          }
        } else if (action === 'remove') {
          // Cek apakah ada admin yang me-remove atau keluar sendiri
          if (author && author !== participant) {
            // Di-kick oleh admin
            if (!goodbyeOn) continue;
            text = fmt(pick(msgs.kicked), userTag, actorTag);
          } else {
            // Keluar sendiri
            if (!goodbyeOn) continue;
            text = fmt(pick(msgs.left), userTag, actorTag);
          }
        } else if (action === 'promote') {
          // Dijadikan admin
          text = fmt(pick(msgs.promoted), userTag, actorTag);
        } else if (action === 'demote') {
          // Dicopot dari admin
          text = fmt(pick(msgs.demoted), userTag, actorTag);
        } else {
          continue;
        }

        if (text) {
          await sock.sendMessage(id, { text, mentions });
        }
      }
    } catch (err) {
      // Diam saja jika ada error
    }
  });
}
