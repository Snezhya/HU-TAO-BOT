/**
 * Smoke test — config, database, loader (tanpa WhatsApp)
 */
import { config } from '../lib/config.js';
import { initDatabase, getUser, addXp, getDbMode } from '../lib/database.js';
import { loadModules } from '../lib/loader.js';
import { generateAI } from '../lib/ai.js';
import { parseCommand } from '../lib/utils.js';
import { getSystemPrompt } from '../lib/persona.js';

const results = [];

function assert(name, condition, detail = '') {
  if (condition) {
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
  }
}

console.log('\n🥀 Hu Tao AI — Smoke Test\n');

assert('BOT_NAME loaded', config.botName === 'Hu Tao AI');
assert('PREFIX loaded', config.prefix === '!');
assert('OWNER_NUMBER set', config.owner.length >= 10);
assert('persona prompt Hu Tao', getSystemPrompt(false).includes('Hu Tao'));

const parsed = parseCommand('!ping', '!');
assert('parseCommand works', parsed?.cmd === 'ping');

const mode = await initDatabase();
assert('database initialized', ['mongodb', 'memory'].includes(mode), `mode=${mode}`);
console.log(`  → DB mode: ${getDbMode()}`);

const user = await getUser('6281234567890@s.whatsapp.net');
assert('database user created', !!user.jid);
const lvl = await addXp('6281234567890@s.whatsapp.net', 50);
assert('leveling works', typeof lvl.level === 'number');

const commands = await loadModules('commands');
const plugins = await loadModules('plugins');
assert('commands loaded', commands.length >= 5, `got ${commands.length}`);
assert('plugins loaded', plugins.length >= 5, `got ${plugins.length}`);

const runAiTest = process.argv.includes('--ai');
if (runAiTest) {
  console.log('\n  → Testing AI (Gemini/Groq)...');
  try {
    const { text, provider } = await generateAI([], 'Balas singkat satu kalimat: halo');
    assert('AI response', text.length > 0, 'empty response');
    assert('AI provider', ['gemini', 'groq'].includes(provider));
    console.log(`    Provider: ${provider}`);
    console.log(`    Preview: ${text.slice(0, 80)}...`);
  } catch (err) {
    assert('AI response', false, err.message);
  }
} else {
  console.log('\n  ⏭ AI test skipped (jalankan: npm run test:ai)');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(40)}`);
console.log(`Passed: ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  console.error('Failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
console.log('All smoke tests passed 🔥\n');
