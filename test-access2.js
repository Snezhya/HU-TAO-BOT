import { config, isOwner } from './lib/config.js';
import { canAccess } from './lib/access-gate.js';
import { isFeatureEnabled, registerFeatures } from './lib/feature-toggle.js';
import { initDatabase, disconnectDatabase } from './lib/database.js';

async function test() {
  await initDatabase();
  registerFeatures(['ping', 'rvo', 'ai']);
  
  console.log("ping isFeatureEnabled:", await isFeatureEnabled('global', 'ping'));
  console.log("rvo isFeatureEnabled:", await isFeatureEnabled('global', 'rvo'));
  console.log("ai isFeatureEnabled:", await isFeatureEnabled('global', 'ai'));
  
  await disconnectDatabase();
  process.exit(0);
}
test().catch(console.error);
