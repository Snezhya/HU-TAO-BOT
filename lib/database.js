/**
 * Database facade — MongoDB Atlas (utama) + memory/JSON fallback
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { log } from './logger.js';
import { connectMongo, disconnectMongo, isMongoConnected, isMongoConfigured } from './db/connection.js';
import { User, Group, BotSettings } from './db/models.js';
import { MemoryStore } from './db/memory-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyJsonPath = join(__dirname, '..', 'database', 'data.json');

/** @type {'mongodb'|'memory'} */
let dbMode = 'memory';
let memory = new MemoryStore();
const userCache = new Map();
const groupCache = new Map();
let settingsCache = { mode: config.mode, antilink: true };
const dirtyUsers = new Set();
let flushTimer = null;
let settingsDirty = false;

function normalizeJid(jid) {
  const str = String(jid).trim().toLowerCase();
  if (str.includes('@g.us')) {
    return str.split('@')[0] + '@g.us';
  }
  if (str.includes('@lid')) {
    return str.split('@')[0] + '@lid';
  }
  return str.split('@')[0].replace(/\D/g, '') + '@s.whatsapp.net';
}

function defaultUser(jid) {
  return {
    jid,
    xp: 0,
    level: 1,
    messages: 0,
    memory: [],
    lastChat: null,
    seriousMode: false,
    premium: false,
    registeredAt: Date.now(),
    notifUpdate: true
  };
}

function userFromDoc(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    jid: o.jid,
    xp: o.xp ?? 0,
    level: o.level ?? 1,
    messages: o.messages ?? 0,
    memory: o.memory ?? [],
    lastChat: o.lastChat ?? null,
    seriousMode: !!o.seriousMode,
    premium: !!o.premium,
    registeredAt: o.registeredAt ?? Date.now(),
    notifUpdate: o.notifUpdate ?? true
  };
}

export function getDbMode() {
  return dbMode;
}

export function isDbReady() {
  return dbMode === 'mongodb' ? isMongoConnected() : true;
}

/** @deprecated — gunakan getSettings(); tetap ada untuk kompatibilitas */
export function getDb() {
  return {
    data: {
      users: Object.fromEntries(userCache),
      premium: [...userCache.values()].filter((u) => u.premium).map((u) => u.jid),
      groups: Object.fromEntries(groupCache),
      settings: settingsCache
    }
  };
}

async function loadSettings() {
  if (dbMode === 'mongodb') {
    let doc = await BotSettings.findOne({ key: 'main' }).lean();
    if (!doc) {
      doc = await BotSettings.create({
        key: 'main',
        mode: config.mode,
        antilink: true
      });
    }
    settingsCache = { mode: doc.mode, antilink: doc.antilink };
  } else {
    settingsCache = { ...memory.data.settings };
  }
  if (settingsCache.mode) config.mode = settingsCache.mode;
}

async function migrateLegacyJson() {
  if (!existsSync(legacyJsonPath)) return;
  try {
    const raw = JSON.parse(readFileSync(legacyJsonPath, 'utf8'));
    let count = 0;

    if (dbMode === 'mongodb') {
      const existing = await User.countDocuments();
      if (existing > 0) return;

      for (const [id, u] of Object.entries(raw.users || {})) {
        const jid = normalizeJid(u.jid || id);
        await User.create({
          jid,
          xp: u.xp ?? 0,
          level: u.level ?? 1,
          messages: u.messages ?? 0,
          memory: u.memory ?? [],
          lastChat: u.lastChat ?? null,
          seriousMode: !!u.seriousMode,
          premium: (raw.premium || []).includes(jid),
          registeredAt: u.registeredAt ?? Date.now()
        });
        count++;
      }

      if (raw.settings) {
        await BotSettings.findOneAndUpdate(
          { key: 'main' },
          { mode: raw.settings.mode || 'public', antilink: raw.settings.antilink !== false },
          { upsert: true }
        );
      }

      log.success(`Migrasi lowdb → MongoDB: ${count} user`);
    } else {
      memory.data = { ...memory.data, ...raw };
      memory.markDirty();
      memory.saveToDisk();
      log.success('Legacy data.json dimuat ke memory fallback');
    }
  } catch (err) {
    log.warn(`Migrasi JSON gagal: ${err.message}`);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushDatabase();
  }, config.dbFlushIntervalMs);
}

async function runJidMigration() {
  log.info('Menjalankan migrasi JID database...');
  let migratedCount = 0;
  if (dbMode === 'mongodb') {
    const users = await User.find({}).lean();
    for (const u of users) {
      const oldJid = u.jid;
      const newJid = normalizeJid(oldJid);
      if (oldJid !== newJid) {
        log.info(`Migrasi JID MongoDB: ${oldJid} -> ${newJid}`);
        const existing = await User.findOne({ jid: newJid }).lean();
        if (existing) {
          const mergedXp = (u.xp || 0) + (existing.xp || 0);
          const mergedMessages = (u.messages || 0) + (existing.messages || 0);
          const mergedLevel = Math.max(u.level || 1, existing.level || 1);
          const mergedPremium = !!u.premium || !!existing.premium;
          const mergedSeriousMode = !!u.seriousMode || !!existing.seriousMode;
          const mergedNotifUpdate = u.notifUpdate !== false && existing.notifUpdate !== false;
          const mergedMemory = [...(existing.memory || []), ...(u.memory || [])].slice(-config.maxMemory);

          await User.updateOne(
            { jid: newJid },
            {
              $set: {
                xp: mergedXp,
                messages: mergedMessages,
                level: mergedLevel,
                premium: mergedPremium,
                seriousMode: mergedSeriousMode,
                notifUpdate: mergedNotifUpdate,
                memory: mergedMemory
              }
            }
          );
          await User.deleteOne({ jid: oldJid });
        } else {
          await User.updateOne({ jid: oldJid }, { $set: { jid: newJid } });
        }
        migratedCount++;
      }
    }
  } else {
    // Memory mode
    const users = Object.keys(memory.data.users || {});
    for (const oldJid of users) {
      const newJid = normalizeJid(oldJid);
      if (oldJid !== newJid) {
        log.info(`Migrasi JID Memory: ${oldJid} -> ${newJid}`);
        const u = memory.data.users[oldJid];
        const existing = memory.data.users[newJid];
        if (existing) {
          existing.xp = (u.xp || 0) + (existing.xp || 0);
          existing.messages = (u.messages || 0) + (existing.messages || 0);
          existing.level = Math.max(u.level || 1, existing.level || 1);
          existing.premium = !!u.premium || !!existing.premium;
          existing.seriousMode = !!u.seriousMode || !!existing.seriousMode;
          existing.notifUpdate = u.notifUpdate !== false && existing.notifUpdate !== false;
          existing.memory = [...(existing.memory || []), ...(u.memory || [])].slice(-config.maxMemory);

          delete memory.data.users[oldJid];
        } else {
          u.jid = newJid;
          memory.data.users[newJid] = u;
          delete memory.data.users[oldJid];
        }
        migratedCount++;
      }
    }
    if (Array.isArray(memory.data.premium)) {
      memory.data.premium = [...new Set(memory.data.premium.map(normalizeJid))];
    }
    if (migratedCount > 0) {
      memory.markDirty();
      memory.saveToDisk();
    }
  }
  log.success(`Migrasi JID selesai. Total dimigrasi: ${migratedCount} user`);
}

export async function initDatabase() {
  memory = new MemoryStore();
  memory.loadFromDisk();
  userCache.clear();
  groupCache.clear();
  dirtyUsers.clear();

  const mongoOk = isMongoConfigured() && (await connectMongo());
  dbMode = mongoOk ? 'mongodb' : 'memory';

  if (dbMode === 'memory') {
    log.warn('Database mode: memory (+ backup JSON jika bisa ditulis)');
  }

  await migrateLegacyJson();
  await loadSettings();
  await runJidMigration();

  setInterval(() => {
    flushDatabase().catch(() => {});
  }, config.dbFlushIntervalMs);

  return dbMode;
}

export async function flushDatabase() {
  if (dbMode === 'mongodb' && isMongoConnected()) {
    const ops = [];

    for (const jid of dirtyUsers) {
      const user = userCache.get(jid);
      if (!user) continue;
      ops.push(
        User.findOneAndUpdate(
          { jid },
          {
            jid,
            xp: user.xp,
            level: user.level,
            messages: user.messages,
            memory: user.memory,
            lastChat: user.lastChat,
            seriousMode: user.seriousMode,
            premium: user.premium,
            registeredAt: user.registeredAt,
            notifUpdate: user.notifUpdate
          },
          { upsert: true }
        )
      );
    }
    dirtyUsers.clear();

    if (settingsDirty) {
      ops.push(
        BotSettings.findOneAndUpdate(
          { key: 'main' },
          { key: 'main', mode: settingsCache.mode, antilink: settingsCache.antilink },
          { upsert: true }
        )
      );
      settingsDirty = false;
    }

    if (ops.length) await Promise.all(ops);
  } else {
    for (const [jid, user] of userCache) {
      memory.data.users[jid] = user;
      if (user.premium && !memory.data.premium.includes(jid)) {
        memory.data.premium.push(jid);
      }
      if (!user.premium) {
        memory.data.premium = memory.data.premium.filter((x) => x !== jid);
      }
    }
    memory.data.settings = settingsCache;
    memory.markDirty();
    memory.saveToDisk();
    dirtyUsers.clear();
    settingsDirty = false;
  }
}

export async function persistDb() {
  await flushDatabase();
}

export async function disconnectDatabase() {
  await flushDatabase();
  await disconnectMongo();
}

export async function getSettings() {
  return { ...settingsCache };
}

export async function setSettings(patch) {
  Object.assign(settingsCache, patch);
  if (patch.mode) config.mode = patch.mode;
  settingsDirty = true;
  scheduleFlush();
}

export async function getGroup(gid) {
  const id = String(gid);
  if (groupCache.has(id)) return groupCache.get(id);

  if (dbMode === 'mongodb') {
    let doc = await Group.findOne({ gid: id }).lean();
    if (!doc) {
      doc = { gid: id, antilink: null, welcome: true, goodbye: true };
      await Group.create(doc);
    }
    groupCache.set(id, doc);
    return doc;
  }

  const g = memory.data.groups[id] || { gid: id, antilink: null, welcome: true, goodbye: true };
  groupCache.set(id, g);
  return g;
}

export async function saveGroup(gid, patch) {
  const id = String(gid);
  const group = await getGroup(id);
  Object.assign(group, patch);
  groupCache.set(id, group);

  if (dbMode === 'mongodb') {
    await Group.findOneAndUpdate({ gid: id }, group, { upsert: true });
  } else {
    memory.data.groups[id] = group;
    memory.markDirty();
    scheduleFlush();
  }
  return group;
}

export async function getUser(jid) {
  const id = normalizeJid(jid);
  if (userCache.has(id)) return userCache.get(id);

  if (dbMode === 'mongodb') {
    let doc = await User.findOne({ jid: id });
    if (!doc) {
      doc = await User.create(defaultUser(id));
    }
    const user = userFromDoc(doc);
    userCache.set(id, user);
    return user;
  }

  const raw = memory.data.users[id];
  const user = raw
    ? {
        ...defaultUser(id),
        ...raw,
        jid: id,
        premium: (memory.data.premium || []).includes(id) || !!raw.premium
      }
    : defaultUser(id);
  memory.data.users[id] = user;
  userCache.set(id, user);
  return user;
}

export async function saveUser(jid, patch) {
  const id = normalizeJid(jid);
  const user = await getUser(id);
  Object.assign(user, patch);
  userCache.set(id, user);
  dirtyUsers.add(id);
  scheduleFlush();
  return user;
}

export function addMemory(jid, role, content, max = config.maxMemory) {
  const id = normalizeJid(jid);
  let user = userCache.get(id);
  if (!user) {
    user = defaultUser(id);
    userCache.set(id, user);
  }
  user.memory.push({ role, content, at: Date.now() });
  if (user.memory.length > max) user.memory = user.memory.slice(-max);
  dirtyUsers.add(id);
  scheduleFlush();
  return user.memory;
}

export async function clearMemory(jid) {
  await saveUser(jid, { memory: [] });
}

export function isPremium(jid) {
  const id = normalizeJid(jid);
  const cached = userCache.get(id);
  if (cached) return !!cached.premium;
  if (dbMode === 'memory') return (memory.data.premium || []).includes(id);
  return false;
}

export async function setPremium(jid, status = true) {
  const id = normalizeJid(jid);
  await saveUser(id, { premium: !!status });
}

export async function addXp(jid, amount = 5) {
  const user = await getUser(jid);
  user.messages += 1;
  user.xp += amount;
  const needed = user.level * 100;
  let leveledUp = false;
  if (user.xp >= needed) {
    user.level += 1;
    user.xp -= needed;
    leveledUp = true;
  }
  dirtyUsers.add(user.jid);
  scheduleFlush();
  return { leveledUp, level: user.level };
}

export async function getAllUsers() {
  if (dbMode === 'mongodb') {
    return await User.find({}, 'jid notifUpdate').lean();
  } else {
    return Object.values(memory.data.users || {}).map(u => ({
      jid: u.jid,
      notifUpdate: u.notifUpdate ?? true
    }));
  }
}
