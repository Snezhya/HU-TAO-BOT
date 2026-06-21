import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { config } from './config.js';
import { getSystemPrompt, buildSystemPrompt } from './persona.js';
import { log } from './logger.js';

/**
 * Gemini model cache — per (model, keyIndex) tuple
 * Models & keys bisa rotate, cache membantu reuse initialized models
 */
const geminiModelCache = new Map();

/**
 * Current Gemini state — untuk rotation logic
 */
let rrKeyIdx = 0;
let currentModelIdx = 0;

function getNextGeminiKeyIdx() {
  const totalKeys = config.geminiKeys?.length || (config.geminiKey ? 1 : 0);
  if (totalKeys <= 1) return 0;
  rrKeyIdx = (rrKeyIdx + 1) % totalKeys;
  return rrKeyIdx;
}

async function chatGemini(messages, userText, systemPrompt) {
  const keyIdx = getNextGeminiKeyIdx();
  const modelIdx = currentModelIdx % (config.geminiModels?.length || 1);

  const apiKey = config.geminiKeys?.[keyIdx] || config.geminiKey;
  const modelName = config.geminiModels?.[modelIdx] || 'gemini-2.5-flash-lite';
  
  const cacheKey = `${keyIdx}:${modelIdx}`;
  let model;
  
  if (geminiModelCache.has(cacheKey)) {
    model = geminiModelCache.get(cacheKey);
  } else {
    const genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: modelName });
    geminiModelCache.set(cacheKey, model);
  }

  if (!model) throw new Error('Gemini API key & model tidak diset');

  // Inject system prompt as first exchange in history
  // Gemini respects conversation history better than systemInstruction
  const history = [
    {
      role: 'user',
      parts: [{ text: `[SISTEM]\n${systemPrompt}\n\nMengerti semua instruksi di atas?` }]
    },
    {
      role: 'model',
      parts: [{ text: 'mengerti.' }]
    },
    // Add existing conversation history
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ];

  const chat = model.startChat({
    history,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.85
    }
  });

  const result = await chat.sendMessage(userText);
  return result.response.text();
}

async function chatGroq(messages, userText, systemPrompt) {
  if (!config.groqKey) throw new Error('Groq API key tidak diset');

  const body = {
    model: config.groqModel,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })),
      { role: 'user', content: userText }
    ],
    temperature: 0.85,
    max_tokens: 512
  };

  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    body,
    {
      headers: {
        Authorization: `Bearer ${config.groqKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Generate AI response — Gemini first, Groq fallback
 * @param {Array} memory - Chat memory
 * @param {string} userText - User input text
 * @param {{ systemPrompt?: string, profile?: Object, serious?: boolean }} options
 */
export async function generateAI(memory, userText, options = {}) {
  let systemPrompt = options.systemPrompt;

  // Build system prompt from profile if provided and no explicit systemPrompt
  if (!systemPrompt && options.profile) {
    systemPrompt = buildSystemPrompt(options.profile, options.serious);
  } else if (!systemPrompt) {
    systemPrompt = getSystemPrompt(options.serious || false);
  }

  const start = Date.now();
  const messages = memory.map((m) => ({ role: m.role, content: m.content }));

  try {
    const text = await chatGroq(messages, userText, systemPrompt);
    log.ai('Groq', Date.now() - start);
    return { text, provider: 'groq' };
  } catch (err) {
    log.warn(`Groq gagal: ${err.message} — fallback ke Gemini`);

    let lastErr;
    const maxTries = Math.min(3, (config.geminiKeys?.length || 1) * (config.geminiModels?.length || 1));
    
    for (let i = 0; i < maxTries; i++) {
      try {
        const text = await chatGemini(messages, userText, systemPrompt);
        const modelName = config.geminiModels?.[currentModelIdx % (config.geminiModels?.length || 1)] || 'gemini-2.5-flash-lite';
        log.ai(`Gemini (${modelName})`, Date.now() - start);
        return { text, provider: 'gemini' };
      } catch (err2) {
        const modelName = config.geminiModels?.[currentModelIdx % (config.geminiModels?.length || 1)] || 'gemini-2.5-flash-lite';
        log.error(`Gemini (${modelName}) gagal (percobaan ${i + 1}): ${err2.message}`);
        currentModelIdx++; // Pindah ke model berikutnya jika gagal
        lastErr = err2;
      }
    }
    throw new Error('Hu Tao lagi pusing (API Limit Penuh), coba lagi sebentar ya 🥀');
  }
}
