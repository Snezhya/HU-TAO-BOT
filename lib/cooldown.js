import { config } from './config.js';
import { isPremium } from './database.js';

const map = new Map();

/**
 * @returns {{ ok: boolean, remaining?: number }}
 */
export function checkCooldown(jid, command, customMs) {
  const key = `${jid}:${command}`;
  const now = Date.now();
  const wait =
    customMs ?? (isPremium(jid) ? config.premiumCooldown : config.defaultCooldown);
  const last = map.get(key) || 0;
  const diff = now - last;

  if (diff < wait) {
    return { ok: false, remaining: Math.ceil((wait - diff) / 1000) };
  }

  map.set(key, now);
  return { ok: true };
}

export function resetCooldown(jid, command) {
  map.delete(`${jid}:${command}`);
}
