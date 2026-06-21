/**
 * Data menu — sections, teks, balasan row
 */
import { config } from './config.js';

export const FOOTER = 'Hu Tao AI · By Snezhya';

export function buildListSections() {
  const p = config.prefix;

  return [
    {
      title: '🎵 DOWNLOADER',
      rows: [
        { title: 'AIO Download', description: `${p}dl <url>`, rowId: 'menu_dl' },
        { title: 'Spotify Download', description: `${p}spdl <url>`, rowId: 'menu_spdl' },
        { title: 'YouTube', description: `${p}yt <url>`, rowId: 'menu_yt' },
        { title: 'TikTok', description: `${p}tiktok <url>`, rowId: 'menu_tiktok' },
        { title: 'Instagram', description: `${p}ig <url>`, rowId: 'menu_ig' }
      ]
    },
    {
      title: '🤖 AI ASSISTANT',
      rows: [
        { title: 'AI Chat', description: `${p}ai — ngobrol`, rowId: 'menu_ai' },
        { title: 'Serious mode', description: `${p}serious / .serious`, rowId: 'menu_serious' },
        { title: 'Reset Memory', description: `${p}reset`, rowId: 'menu_reset' }
      ]
    },
    {
      title: '🖼️ IMAGE / TOOLS',
      rows: [
        { title: 'Remove Watermark', description: `reply gambar + ${p}rmwm`, rowId: 'menu_rmwm' },
        { title: 'Sticker', description: `reply + ${p}sticker`, rowId: 'menu_sticker' },
        { title: 'Brat Image', description: `${p}brat <teks>`, rowId: 'menu_brat' },
        { title: 'Brat Video', description: `${p}bratvid <teks>`, rowId: 'menu_bratvid' },
        { title: 'Edit Gambar AI', description: `reply + ${p}edit <instruksi>`, rowId: 'menu_edit' },
        { title: 'Image HD (Upscale)', description: `reply + ${p}upscale`, rowId: 'menu_upscale' },
        { title: 'OCR', description: `reply + ${p}ocr`, rowId: 'menu_ocr' },
        { title: 'TTS (VoiceVox)', description: `${p}tts <teks>`, rowId: 'menu_tts' },
        { title: 'TTS AI (Kokoro)', description: `${p}ttsai <teks>`, rowId: 'menu_ttsai' }
      ]
    },
    {
      title: '👥 GROUP MANAGEMENT',
      rows: [
        { title: 'Grup Tools', description: 'welcome · goodbye · antilink', rowId: 'menu_group' }
      ]
    },
    {
      title: '⚙️ SYSTEM / INFO',
      rows: [
        { title: 'Level', description: `${p}level`, rowId: 'menu_level' },
        { title: 'Profile', description: `${p}profile`, rowId: 'menu_profile' },
        { title: 'Matikan Notifikasi Update', description: `${p}nonotif`, rowId: 'menu_nonotif' },
        { title: 'Aktifkan Notifikasi Update', description: `${p}notifon`, rowId: 'menu_notifon' }
      ]
    },
    {
      title: '👑 OWNER',
      rows: [
        { title: 'Broadcast Update', description: `${p}bc [pesan]`, rowId: 'menu_bc' },
        { title: 'Mode', description: `${p}mode self|public`, rowId: 'menu_mode' },
        { title: 'Premium', description: `${p}premium add`, rowId: 'menu_premium' }
      ]
    }
  ];
}

export const ROW_REPLIES = {
  menu_ai: (p) => `*AI Chat*\n${p}ai <pesan>\n\nChat di PM atau @bot di grup.`,
  menu_serious: (p) =>
    `*Serious mode*\n${p}serious — toggle tenang\n${p}serious on|off\n${p}serious <pertanyaan> (sekali, tanpa drama)`,
  menu_reset: (p) => `*Reset*\n${p}reset`,
  menu_dl: (p) => `*AIO Download*\n${p}dl <url>\n\nOtomatis deteksi platform (TikTok, YouTube, Instagram, Twitter, dll).`,
  menu_yt: (p) => `*YouTube*\n${p}yt <url>`,
  menu_tiktok: (p) => `*TikTok*\n${p}tiktok <url>`,
  menu_ig: (p) => `*Instagram*\n${p}ig <url>`,
  menu_sticker: (p) => `*Sticker*\nReply gambar → ${p}sticker`,
  menu_brat: (p) => `*Brat Image*\n${p}brat <teks> — gambar dengan gaya album brat`,
  menu_bratvid: (p) => `*Brat Video*\n${p}bratvid <teks> — video lirik gaya album brat\n\nContoh: ${p}bratvid just friend ygy`,
  menu_edit: (p) => `*Edit Gambar AI*\nReply gambar + ${p}edit <instruksi>\n\nContoh: ${p}edit make the sky pink\n${p}edit remove the background`,
  menu_upscale: (p) => `*Image Upscale (HD)*\nReply gambar → ${p}upscale / ${p}hd`,
  menu_ocr: (p) => `*OCR*\nReply gambar → ${p}ocr`,
  menu_tts: (p) => `*TTS (VoiceVox Anime)*\n${p}tts <teks>`,
  menu_ttsai: (p) => `*TTS AI (Kokoro)*\n${p}ttsai <teks>`,
  menu_level: (p) => `*Level*\n${p}level`,
  menu_profile: (p) => `*Profile*\n${p}profile`,
  menu_mode: (p) => `*Mode* (owner)\n${p}mode self | ${p}mode public`,
  menu_premium: (p) => `*Premium* (owner)\n${p}premium add 628xxx`,
  menu_group: (p) => `*Grup*\n${p}welcome on|off — aktifkan/nonaktifkan sambutan\n${p}goodbye on|off — aktifkan/nonaktifkan perpisahan\n\nAntilink otomatis jika diaktifkan.`,
  menu_spdl: (p) => `*Spotify Downloader*\n${p}spdl <url> — Download lagu dari Spotify`,
  menu_rmwm: (p) => `*Remove Watermark*\nReply gambar → ${p}rmwm — Menghapus watermark dari gambar`,
  menu_nonotif: (p) => `*Matikan Notifikasi Update*\n${p}nonotif`,
  menu_notifon: (p) => `*Aktifkan Notifikasi Update*\n${p}notifon`,
  menu_bc: (p) => `*Broadcast Update*\n${p}bc <pesan> — Mengirim broadcast update ke seluruh subscriber`
};

export function buildListBody(stats) {
  const p = config.prefix;
  const alt = config.altPrefix || '.';

  return `*Hu Tao AI Menu*

${stats.username}
Ping ${stats.ping}ms · Uptime ${stats.runtime}
${stats.totalFeatures} fitur · ${stats.premium}
Mode: ${stats.mode}

Prefix: ${p} / ${alt}`;
}

export function formatRowReply(rowId) {
  const fn = ROW_REPLIES[rowId];
  if (!fn) return null;
  return `${fn(config.prefix)}\n\n_${FOOTER}_`;
}

export function extractListRowId(msg) {
  const rowId = msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (rowId && ROW_REPLIES[rowId]) return rowId;
  return null;
}
