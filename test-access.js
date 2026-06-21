import { config, isOwner } from './lib/config.js';
import { canAccess } from './lib/access-gate.js';
import { isFeatureEnabled } from './lib/feature-toggle.js';
import { initDatabase, disconnectDatabase } from './lib/database.js';

async function test() {
  await initDatabase();
  console.log("owners:", config.owners);
  
  const testJid = '6282218320478@s.whatsapp.net'; // Let's guess user's number or just check
  console.log("isOwner test:", isOwner(testJid));
  
  const pingEnabled = await isFeatureEnabled('global', 'ping');
  console.log("ping isFeatureEnabled:", pingEnabled);

  const rvoEnabled = await isFeatureEnabled('global', 'rvo');
  console.log("rvo isFeatureEnabled:", rvoEnabled);

  await disconnectDatabase();
}
test().catch(console.error);
