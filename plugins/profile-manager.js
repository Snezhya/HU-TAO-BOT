/**
 * AI Profile Manager Plugin
 * Intercepts natural language profile management commands
 * Only accessible by admin/owner
 */
import { detectIntent, extractImageMessage } from '../lib/profile/intentDetector.js';
import { downloadImageBuffer, updateProfilePicture } from '../lib/profile/profileManager.js';
import {
  saveToCollection,
  getRandomFromCollection,
  getCollectionInfo,
  deleteFromCollection,
} from '../lib/profile/storage.js';
import { startScheduler, stopScheduler, isSchedulerActive } from '../lib/profile/scheduler.js';
import { isOwner } from '../lib/config.js';
import { log } from '../lib/logger.js';

// Respons Hu Tao sesuai persona (random dari pool)
const RESPONSES = {
  SET_PP_SUCCESS: [
    'udah diganti~ suka ga? 🥀',
    'oke, udah aku pasang. gimana menurut kamu?',
    'selesai! foto baruku keren kan? ✨',
    'pp nya udah ganti, puas?',
  ],
  SAVE_SUCCESS: [
    'oke, udah aku simpen ke koleksi 📁',
    'tersimpan~ koleksi pp-nya makin banyak 🥀',
    'masuk koleksi deh, makasih fotonya',
  ],
  RANDOM_SUCCESS: [
    'nih, aku pilih yang ini secara acak~ 🎲',
    'udah diganti random, semoga cocok 🥀',
    'dipilih pake teknik milih buta, hasilnya begini wkwk',
  ],
  EMPTY_COLLECTION: [
    'koleksinya masih kosong nih, simpan foto dulu dong 🥀',
    'belum ada foto di koleksi, kirim dulu ya',
    'gudang ppnya kosong... simpan dulu sana',
  ],
  NO_IMAGE: [
    'kirim atau reply gambarnya dulu kek 😑',
    'mana fotonya? kirim bareng pesannya atau reply ke gambar',
    'butuh gambarnya buat aku ganti pp, mana?',
  ],
  ERROR: [
    'gagal nih, coba lagi nanti 🥀',
    'ada yang error, maaf ya',
    'gagal diproses, kayaknya ada masalah teknis',
  ],
  SCHEDULER_ON: (hours) => [
    `oke, aku bakal ganti pp otomatis setiap *${hours} jam* 🕐`,
    `jadwal aktif! pp akan ganti sendiri tiap ${hours} jam`,
    `auto pp aktif~ setiap ${hours} jam aku ganti sendiri 🔄`,
  ],
  SCHEDULER_OFF: [
    'pp otomatis dimatiin deh 🔕',
    'jadwal dihentikan, pp nggak bakal ganti sendiri lagi',
    'oke, auto pp off',
  ],
  NOT_AUTHORIZED: [
    'eh, kamu siapa? ini buat admin aja 😒',
    'nggak sembarang orang bisa ngatur pp aku!',
    'hanya admin/owner yang bisa ubah profile 🥀',
  ],
};

function pickRandom(arr) {
  if (typeof arr === 'function') return arr;
  return arr[Math.floor(Math.random() * arr.length)];
}

function reply(pool, ...args) {
  const item = pickRandom(pool);
  if (typeof item === 'function') return item(...args);
  return item;
}

export default {
  name: 'profile-manager',
  priority: 5, // sebelum plugin AI chat biasa

  async run(ctx) {
    const { msg, text, sender, sock, jid } = ctx;

    // Hanya proses jika ada teks yang kemungkinan terkait profile
    if (!text) return false;

    const { intent, intervalHours } = detectIntent(text);
    if (!intent) return false;

    // Cek autorisasi
    const isAdmin = ctx.isAdmin || ctx.isOwner || isOwner(sender);
    if (!isAdmin) {
      await ctx.reply({ text: reply(RESPONSES.NOT_AUTHORIZED) });
      return true;
    }

    log.info(`[PROFILE MANAGER] Intent: ${intent} | Sender: ${sender.split('@')[0]}`);

    try {
      switch (intent) {
        case 'SET_PP': {
          const imageMsg = extractImageMessage(msg);
          if (!imageMsg) {
            await ctx.reply({ text: reply(RESPONSES.NO_IMAGE) });
            return true;
          }
          await ctx.sendTyping();
          const buffer = await downloadImageBuffer(imageMsg);
          await updateProfilePicture(sock, buffer);
          await ctx.reply({ text: reply(RESPONSES.SET_PP_SUCCESS) });
          return true;
        }

        case 'SAVE_PP': {
          const imageMsg = extractImageMessage(msg);
          if (!imageMsg) {
            await ctx.reply({ text: reply(RESPONSES.NO_IMAGE) });
            return true;
          }
          await ctx.sendTyping();
          const buffer = await downloadImageBuffer(imageMsg);
          const { id, total } = await saveToCollection(buffer, sender);
          await ctx.reply({
            text: `${reply(RESPONSES.SAVE_SUCCESS)}\n\n📁 ID: \`${id}\` | Total koleksi: *${total}* foto`,
          });
          return true;
        }

        case 'RANDOM_PP': {
          const buffer = await getRandomFromCollection();
          if (!buffer) {
            await ctx.reply({ text: reply(RESPONSES.EMPTY_COLLECTION) });
            return true;
          }
          await ctx.sendTyping();
          await updateProfilePicture(sock, buffer);
          await ctx.reply({ text: reply(RESPONSES.RANDOM_SUCCESS) });
          return true;
        }

        case 'SCHEDULER_ON': {
          const hours = intervalHours || 6;
          await startScheduler(sock, hours);
          await ctx.reply({ text: reply(RESPONSES.SCHEDULER_ON)(hours) });
          return true;
        }

        case 'SCHEDULER_OFF': {
          await stopScheduler();
          await ctx.reply({ text: reply(RESPONSES.SCHEDULER_OFF) });
          return true;
        }

        case 'LIST_PP': {
          const info = await getCollectionInfo();
          if (info.total === 0) {
            await ctx.reply({ text: reply(RESPONSES.EMPTY_COLLECTION) });
            return true;
          }
          const list = info.items.map((i) => `${i.index}. \`${i.id}\` — ${i.addedAt} oleh ${i.addedBy}`).join('\n');
          const schedulerStatus = isSchedulerActive() ? '🟢 Aktif' : '🔴 Nonaktif';
          await ctx.reply({
            text: `*📁 KOLEKSI PP* (${info.total}/${info.max})\n\n${list}\n\n⏰ Auto PP: ${schedulerStatus}`,
          });
          return true;
        }

        case 'DELETE_PP': {
          // Cari angka dari teks (hapus pp 3)
          const numMatch = text.match(/\d+/);
          if (!numMatch) {
            await ctx.reply({ text: 'Sebutin nomor foto yang mau dihapus, contoh: *hapus pp 2*' });
            return true;
          }
          const ok = await deleteFromCollection(parseInt(numMatch[0]));
          await ctx.reply({
            text: ok ? `✅ Foto no. ${numMatch[0]} berhasil dihapus dari koleksi.` : '❌ Nomor tidak ditemukan di koleksi.',
          });
          return true;
        }

        default:
          return false;
      }
    } catch (err) {
      log.error(`[PROFILE MANAGER] Error pada intent ${intent}: ${err.message}`);
      await ctx.reply({ text: reply(RESPONSES.ERROR) });
      return true;
    }
  },
};
