/**
 * Respons AI Hu Tao terpusat — persona, reaction, memory, mood system
 */
import { config } from './config.js';
import { generateAI } from './ai.js';
import { log } from './logger.js';
import { getUser, addMemory, saveUser, persistDb } from './database.js';
import { withTyping } from './handler.js';
import { isFeatureEnabled } from './feature-toggle.js';
import {
  getSystemPrompt,
  buildSystemPrompt,
  detectSeriousTopic,
  pickReaction,
  generatePersonaSeed,
  calculateMoodDelta,
  applyMoodDecay,
  resetSeriousTimer,
  getGapContext,
  getRelationshipLevel
} from './persona.js';
import { isOwner } from './config.js';
import { getPendingReminderCtx, clearPendingReminderCtx } from './reminder.js';
import { UserProfile, GroupMemory } from './db/models.js';

/** Resolve mode untuk pesan ini */
export function resolveSeriousMode(profile, userText, forceSerious = false) {
  if (forceSerious) return true;
  if (profile?.serious_mode) return true;
  if (detectSeriousTopic(userText)) return true;
  return false;
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create user profile (persona, mood, intimacy)
 */
export async function getUserProfile(jid) {
  try {
    let profile = await UserProfile.findOne({ jid });
    if (!profile) {
      // New user — default persona: ceria
      profile = await UserProfile.create({
        jid,
        persona_seed: 'ceria',
        session_count: 0,
        mood_score: 20,
        first_seen: Date.now(),
        last_seen: Date.now(),
        last_mood_decay: Date.now()
      });
    }
    return profile.toObject ? profile.toObject() : profile;
  } catch (err) {
    console.warn(`Failed to get/create user profile: ${err.message}`);
    return {
      jid,
      persona_seed: 'ceria',
      session_count: 0,
      mood_score: 20,
      first_seen: Date.now(),
      last_seen: Date.now(),
      last_mood_decay: Date.now()
    };
  }
}

/**
 * Update user profile (mood, session count, etc)
 */
export async function updateUserProfile(jid, updates) {
  try {
    const profile = await UserProfile.findOneAndUpdate({ jid }, updates, {
      new: true,
      upsert: true
    });
    return profile.toObject ? profile.toObject() : profile;
  } catch (err) {
    console.warn(`Failed to update user profile: ${err.message}`);
    return null;
  }
}

/**
 * Increment session count and apply mood decay
 */
export async function incrementSession(jid) {
  let profile = await getUserProfile(jid);
  
  // Apply mood decay
  const decayedMood = applyMoodDecay(profile.mood_score, profile.last_mood_decay);
  
  // Increment session count
  const newSessionCount = (profile.session_count || 0) + 1;
  
  // Relationship tracking — compute gap BEFORE updating last_seen
  const gapDays = profile.last_seen
    ? (Date.now() - profile.last_seen) / (1000 * 60 * 60 * 24)
    : 0;
  const longestGap = profile.longest_gap_days || 0;
  const newLongestGap = gapDays > longestGap ? gapDays : longestGap;
  const newTotalInteractions = (profile.total_interactions || 0) + 1;

  const updated = await updateUserProfile(jid, {
    session_count: newSessionCount,
    mood_score: decayedMood,
    last_seen: Date.now(),
    last_mood_decay: Date.now(),
    longest_gap_days: newLongestGap,
    total_interactions: newTotalInteractions
  });
  
  return updated || profile;
}

/**
 * Update mood based on user message content
 */
export async function updateMoodFromMessage(jid, userText) {
  let profile = await getUserProfile(jid);
  
  // Calculate mood delta from message
  const moodDelta = calculateMoodDelta(userText);
  if (moodDelta === 0) return profile;
  
  // Apply delta with bounds
  const newMood = Math.max(-100, Math.min(100, profile.mood_score + moodDelta));
  
  const updated = await updateUserProfile(jid, {
    mood_score: newMood,
    last_mood_decay: Date.now()
  });
  
  return updated || profile;
}

// ============================================================================
// MAIN CHAT HANDLER
// ============================================================================

/**
 * Chat Hu Tao lengkap: reaction (kadang) + AI + memory + mood tracking
 */
export async function respondHuTao(ctx, sender, userText, opts = {}) {
  const user = await getUser(sender);
  const isFirstEver = !(await UserProfile.exists({ jid: sender }));
  let profile = await incrementSession(sender); // Increment session + apply decay

  // Check if this is a group and groupmemory is enabled
  const isGroup = ctx.jid.endsWith('@g.us');
  const useGroupMemory = isGroup && await isFeatureEnabled(ctx.jid, 'groupmemory');

  // Get sender name for group memory
  const senderName = ctx.msg?.pushName || sender.split('@')[0];

  // Welcome message untuk user baru — gaya ceria
  if (isFirstEver) {
    const personaList = [
      '*jutek* — pendiem, cuek di luar tapi peduli',
      '*ceria* — bawel, hyper, excited mulu (ini defaultku!)',
      '*serius* — to the point, no basa-basi',
      '*santai* — males-malesan, jawab seadanya',
      '*romance* — hangat, manis, sedikit puitis',
      '*partner* — teman hidup, selalu ada buat kamu',
    ];
    const welcomeMsg = [
      'haii!! ada orang baru nih, seneng banget ketemu kamu! ✨🌸',
      '',
      'aku Hu Tao~ sekarang aku lagi mode *Ceria* (yang paling bawel, jangan kaget hehe)',
      '',
      '👥 *Sifat / Kepribadianku:*',
      'Kamu bisa ganti sifat aku kapanpun dengan `.persona set <mode>`',
      '',
      ...personaList.map(p => `• ${p}`),
      '',
      '🔔 *Fitur Pengingat Pasangan:*',
      'Aku bisa ngingetin kamu makan, mandi, tidur, dan lainnya otomatis!',
      'Aktifkan dengan: `.reminder on`',
      '',
      '📋 *Buat lihat semua fitur:* `.menu`',
      '',
      'yuk ngobrol dulu, mau nanya apa atau cerita apa nih? 🌸',
    ].join('\n');
    await ctx.reply({ text: welcomeMsg });
  }

  // Update mood based on message content (before AI response)
  profile = await updateMoodFromMessage(sender, userText);

  const db = { updateUserProfile };

  // Check timeout resumption
  const quotedText = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                     ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';
                     
  const isReplyingToTimeout = quotedText.includes('udah selesai? oke balik lagi deh');
  const txtLower = userText.toLowerCase();
  const resumeWords = ['belum', 'lanjut', 'masih', 'bentar', 'tunggu', 'belum selesai'];
  const wantsToResume = resumeWords.some(w => txtLower.includes(w));

  if (isReplyingToTimeout && wantsToResume) {
      profile = await updateUserProfile(sender, { serious_mode: true, serious_since: Date.now() });
      resetSeriousTimer(sender, ctx.sock, db);
      await ctx.reply({ text: 'oke lanjut' });
      return { reply: 'oke lanjut', serious: true, profile };
  }
  
  if (profile.serious_mode) {
      resetSeriousTimer(sender, ctx.sock, db);
  }

  const serious = resolveSeriousMode(profile, userText, opts.forceSerious);
  
  // Memory handling: per-user vs per-group
  let memory = user.memory || [];
  let groupMessages = [];

  if (useGroupMemory) {
    // Fetch group memory
    let groupMem = await GroupMemory.findOne({ jid: ctx.jid });
    if (!groupMem) {
      groupMem = await GroupMemory.create({ jid: ctx.jid, messages: [] });
    }
    // Use group messages as context (formatted with sender names)
    groupMessages = groupMem.messages.slice(-(config.maxMemory || 20));
    memory = []; // Clear user memory, use group memory instead
  }

  const reaction = opts.skipReaction ? null : pickReaction(userText, user, serious);
  if (reaction) {
    try {
      await ctx.react(reaction);
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    } catch {
      /* ignore */
    }
  }

  // Build system prompt using dynamic profile
  const freshProfile = await getUserProfile(sender);
  const senderIsOwner = isOwner(sender);
  let systemPrompt;
  if (serious) {
    systemPrompt = buildSystemPrompt(freshProfile, true, senderIsOwner);
  } else {
    systemPrompt = buildSystemPrompt(freshProfile, false, senderIsOwner);
  }

  // If using group memory, inject group history into prompt
  if (useGroupMemory) {
    if (groupMessages.length > 0) {
      const groupHistoryText = groupMessages.map(m =>
        m.role === 'user' ? `${m.senderName}: ${m.content}` : `Hu Tao: ${m.content}`
      ).join('\n');
      systemPrompt += `\n\n[RIWAYAT GRUP]\n${groupHistoryText}`;
    }
    
    systemPrompt += `\n\n[KONTEKS GRUP] Ini grup isi BANYAK orang berbeda, bukan cuma 1 orang. Sifat sayang/posesif kamu itu personal per-individu — JANGAN klaim satu orang sebagai "satu-satunya/paling spesial" kalau di grup yang sama ada orang lain yang juga kamu perhatiin. Pesan yang baru masuk ini dari "${senderName}" — fokusin respon ke dia, jangan campur aduk sama perasaan kamu ke orang lain di grup kecuali emang nyambung sama konteks obrolan saat ini.`;
  }

  // Inject reminder context agar AI bisa lanjut percakapan natural setelah kirim reminder
  const reminderCtx = getPendingReminderCtx(sender);
  if (reminderCtx) {
    clearPendingReminderCtx(sender);
    systemPrompt += `\n\n[KONTEKS PENGINGAT] Kamu baru saja mengirim pesan pengingat ke user ini: "${reminderCtx.text}" (tipe: ${reminderCtx.type}). User sekarang membalas pesan pengingat itu. Lanjutkan percakapan secara natural — tanyakan apakah sudah dilakukan, berikan respons sesuai, dll. Jangan mulai dari nol seolah tidak ada konteks sebelumnya.`;
  }

  log.info(`[PERSONA] ${freshProfile.persona_seed} | mood: ${freshProfile.mood_score} | sessions: ${freshProfile.session_count}`);
  log.info(`[PROMPT PREVIEW] ${systemPrompt.slice(0, 100)}`);

  // Tag pesan yang baru masuk dengan nama pengirim (khusus mode group memory)
  const promptUserText = useGroupMemory ? `${senderName}: ${userText}` : userText;

  let reply;
  try {
    const result = await withTyping(ctx.sock, ctx.jid, () =>
      generateAI(memory, promptUserText, { systemPrompt, profile: freshProfile, serious })
    );
    reply = cleanReply(result.text);
  } catch (err) {
    throw err;
  }

  // Apply native mentions if group memory is used
  let replyOptions = { text: reply };
  if (useGroupMemory && groupMessages.length > 0) {
    const { text: newText, mentions } = applyNativeMentions(reply, groupMessages);
    replyOptions.text = newText;
    if (mentions.length > 0) {
      replyOptions.mentions = mentions;
    }
  }

  // Save memory
  if (useGroupMemory) {
    // Save to group memory
    await GroupMemory.findOneAndUpdate(
      { jid: ctx.jid },
      {
        $push: {
          messages: {
            $each: [
              { sender, senderName, role: 'user', content: userText, timestamp: Date.now() },
              { sender: ctx.sock.user?.id || 'bot', senderName: 'Hu Tao', role: 'assistant', content: reply, timestamp: Date.now() }
            ],
            $slice: -(config.maxMemory * 2 || 40) // Keep more messages for group
          }
        }
      }
    );
  } else {
    // Legacy per-user memory
    addMemory(sender, 'user', userText, config.maxMemory);
    addMemory(sender, 'assistant', reply, config.maxMemory);
  }
  await saveUser(sender, { lastChat: Date.now() });
  await persistDb();

  await ctx.reply(replyOptions);

  return { reply, serious, reaction, profile };
}

/** Apply WhatsApp native mentions by scanning reply for sender names */
function applyNativeMentions(replyText, groupMessages) {
  const mentions = [];
  let text = replyText;
  const seen = new Set();
  
  for (const m of groupMessages) {
    if (m.role !== 'user' || !m.senderName || seen.has(m.senderName)) continue;
    seen.add(m.senderName);
    
    const escapedName = m.senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'ig');
    
    if (regex.test(text)) {
      const num = m.sender.split('@')[0].split(':')[0];
      text = text.replace(regex, `@${num}`);
      mentions.push(m.sender);
    }
  }
  
  return { text, mentions };
}

/** Bersihkan emoji reaction di awal jika model meniru format */
function cleanReply(text) {
  if (!text) return text;
  return text
    .replace(/^[\s]*[😒🥀😑🔥❤️👀]+\s*/u, '')
    .replace(/\n*_?~?backup brain_?\s*🥀?/gi, '')
    .replace(/\n*_?~?HU TAO_?\s*$/gi, '')
    .trim();
}
