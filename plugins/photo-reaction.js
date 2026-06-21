import fs from 'node:fs/promises';
import { downloadMedia } from '../lib/utils.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../lib/config.js';

const SETTINGS_FILE = '/tmp/photoreact-settings.json';

const PHOTO_SYSTEM_PROMPT = `Kamu adalah Hu Tao — gadis ceria, iseng, dan suka bercanda. Kamu baru saja melihat foto yang dikirim temanmu di WhatsApp.
Bereaksilah seperti teman asli yang spontan: singkat (1-2 kalimat), natural, kadang iseng atau lucu, sesekali pakai bahasa gaul Indonesia. Jangan formal. Langsung komen saja tanpa bilang "saya melihat gambar".
Jangan lebih dari 2 kalimat. Jangan pakai tanda bintang atau markdown.`;

const STICKER_RESPONSES = [
  'wkwk stiker apa tuh 💀',
  'eh stiker itu dari mana dapet 😭',
  'haha relate banget sih 🥀',
  'kok pas banget stikernya lol',
  'stiker jadul itu wkwk',
  'ih lucuu dapet dari mana',
  'ngirim stiker doang ga mau ngomong 😑',
  'stiker doang? pengecut 🔥',
];

const cooldowns = new Map();

async function readSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

async function writeSettings(data) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

export async function setPhotoReact(jid, value) {
  const settings = await readSettings();
  settings[jid] = value;
  await writeSettings(settings);
}

export async function getPhotoReact(jid) {
  const settings = await readSettings();
  return !!settings[jid];
}

export default {
  name: 'photo-reaction',
  async run(ctx) {
    const { msg, jid } = ctx;
    
    if (!(await getPhotoReact(jid))) return;
    if (msg.key?.fromMe) return;
    
    // Check for quoted message (reply)
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) return;

    const imgMsg = msg.message?.imageMessage;
    const stickerMsg = msg.message?.stickerMessage;

    if (!imgMsg && !stickerMsg) return;

    // Check cooldown
    const now = Date.now();
    const lastReact = cooldowns.get(jid) || 0;
    if (now - lastReact < 15000) return;
    
    if (stickerMsg) {
      cooldowns.set(jid, now);
      const response = STICKER_RESPONSES[Math.floor(Math.random() * STICKER_RESPONSES.length)];
      await ctx.reply({ text: response });
      return;
    }

    if (imgMsg) {
      cooldowns.set(jid, now);
      try {
        const fakeMsg = { message: { imageMessage: imgMsg } };
        const { buffer } = await downloadMedia(fakeMsg);
        
        const genAI = new GoogleGenerativeAI(config.geminiKeys[0]);
        const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const result = await visionModel.generateContent([
          { inlineData: { mimeType: 'image/jpeg', data: buffer.toString('base64') } },
          { text: PHOTO_SYSTEM_PROMPT }
        ]);
        await ctx.reply({ text: result.response.text() });
      } catch (error) {
        // Silently ignore errors as requested
      }
    }
  }
};
