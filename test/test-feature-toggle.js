/**
 * test-feature-toggle.js — Unit test untuk feature toggle
 */

// smoke.js uses: import { initDatabase, getUser, addXp, getDbMode } from '../lib/database.js';
import { initDatabase as initDb, getDbMode } from '../lib/database.js';
import { loadModules, registerAllFeatures } from '../lib/loader.js';
import {
  isFeatureEnabled,
  getSettings,
  setFeature,
  setFeatures,
  getAllRegisteredFeatures
} from '../lib/feature-toggle.js';
import { ChatSettings } from '../lib/db/models.js';

async function run() {
  console.log('🧪 Starting Feature Toggle Tests...');
  const mode = await initDb();
  console.log(`DB Mode: ${mode}`);

  // Load modules to populate registeredFeatures
  const [commands, plugins] = await Promise.all([
    loadModules('commands'),
    loadModules('plugins')
  ]);
  registerAllFeatures(commands, plugins);

  const features = getAllRegisteredFeatures();
  console.log(`Registered ${features.length} features.`);

  const testJid = 'test-chat-jid@s.whatsapp.net';

  // Cleanup existing test settings if any
  await ChatSettings.deleteOne({ jid: testJid });

  // 1. Check defaults
  console.log('\n--- 1. Testing Defaults ---');
  const initialSettings = await getSettings(testJid);
  console.log('Default AI:', initialSettings.ai);
  console.log('Default RVO:', initialSettings.rvo);

  if (initialSettings.ai !== false) throw new Error('Default AI should be false');
  if (initialSettings.rvo !== true) throw new Error('Default RVO should be true');
  console.log('✓ Default settings match specifications.');

  // 2. Enable one feature
  console.log('\n--- 2. Testing setFeature (enable AI) ---');
  const setRes = await setFeature(testJid, 'ai', true);
  if (!setRes.ok) throw new Error('Failed to set feature: ' + setRes.message);

  const updatedSettings = await getSettings(testJid);
  console.log('Updated AI status:', updatedSettings.ai);
  if (updatedSettings.ai !== true) throw new Error('AI should be enabled now');
  console.log('✓ setFeature works.');

  // 3. Update multiple features
  console.log('\n--- 3. Testing setFeatures ---');
  const multiRes = await setFeatures(testJid, { ai: false, rvo: false });
  if (!multiRes.ok) throw new Error('Failed to set multiple features: ' + multiRes.message);

  const finalSettings = await getSettings(testJid);
  console.log('Final AI status:', finalSettings.ai);
  console.log('Final RVO status:', finalSettings.rvo);
  if (finalSettings.ai !== false || finalSettings.rvo !== false) {
    throw new Error('Multiple features update failed');
  }
  console.log('✓ setFeatures works.');

  // Cleanup
  await ChatSettings.deleteOne({ jid: testJid });
  console.log('\n✓ Cleanup complete.');
  console.log('🎉 All Feature Toggle Tests Passed Successfully!');
}

run()
  .catch(err => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    // Terminate script cleanly
    process.exit(0);
  });