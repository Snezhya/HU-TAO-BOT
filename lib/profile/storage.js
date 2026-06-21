/**
 * Profile Storage
 * Manages PP collection using JSON file + memory cache
 * Stores image data as base64 for Railway/VPS compatibility
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { log } from '../logger.js';

const STORAGE_PATH = process.env.PP_STORAGE_PATH || '/tmp/hutao-pp-collection.json';
const MAX_COLLECTION_SIZE = 30; // maks 30 foto di koleksi

let cache = null;

function defaultStore() {
  return {
    collection: [],   // [{ id, addedAt, addedBy, data: 'base64...' }]
    scheduler: {
      enabled: false,
      intervalHours: 6,
      lastChanged: null,
    },
  };
}

async function load() {
  if (cache) return cache;
  if (!existsSync(STORAGE_PATH)) {
    cache = defaultStore();
    return cache;
  }
  try {
    const raw = await fs.readFile(STORAGE_PATH, 'utf-8');
    cache = { ...defaultStore(), ...JSON.parse(raw) };
  } catch {
    cache = defaultStore();
  }
  return cache;
}

async function save() {
  if (!cache) return;
  await fs.writeFile(STORAGE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Simpan gambar (buffer) ke koleksi PP
 * @param {Buffer} buffer - Image buffer
 * @param {string} addedBy - JID yang menyimpan
 * @returns {{ id: string, total: number }}
 */
export async function saveToCollection(buffer, addedBy) {
  const store = await load();

  if (store.collection.length >= MAX_COLLECTION_SIZE) {
    // Hapus yang paling lama
    store.collection.shift();
  }

  const id = `pp_${Date.now()}`;
  store.collection.push({
    id,
    addedAt: Date.now(),
    addedBy,
    data: buffer.toString('base64'),
  });

  await save();
  log.info(`[PP STORAGE] Disimpan: ${id} oleh ${addedBy} | Total: ${store.collection.length}`);
  return { id, total: store.collection.length };
}

/**
 * Ambil satu gambar random dari koleksi
 * @returns {Buffer|null}
 */
export async function getRandomFromCollection() {
  const store = await load();
  if (!store.collection.length) return null;

  const item = store.collection[Math.floor(Math.random() * store.collection.length)];
  return Buffer.from(item.data, 'base64');
}

/**
 * Hapus item dari koleksi berdasarkan index (1-based)
 */
export async function deleteFromCollection(index) {
  const store = await load();
  const idx = index - 1;
  if (idx < 0 || idx >= store.collection.length) return false;
  const removed = store.collection.splice(idx, 1);
  await save();
  log.info(`[PP STORAGE] Dihapus: ${removed[0]?.id}`);
  return true;
}

/**
 * Ambil info koleksi (tanpa data gambar)
 */
export async function getCollectionInfo() {
  const store = await load();
  return {
    total: store.collection.length,
    max: MAX_COLLECTION_SIZE,
    items: store.collection.map((item, i) => ({
      index: i + 1,
      id: item.id,
      addedAt: new Date(item.addedAt).toLocaleString('id-ID'),
      addedBy: item.addedBy?.split('@')[0],
    })),
  };
}

/**
 * Simpan/baca konfigurasi scheduler
 */
export async function getSchedulerConfig() {
  const store = await load();
  return { ...store.scheduler };
}

export async function setSchedulerConfig(patch) {
  const store = await load();
  Object.assign(store.scheduler, patch);
  await save();
  return { ...store.scheduler };
}
