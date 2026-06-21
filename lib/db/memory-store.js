import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupPath = join(__dirname, '..', '..', 'database', 'data.json');

const defaultData = {
  users: {},
  premium: [],
  groups: {},
  settings: { mode: 'public', antilink: true }
};

/** Fallback in-memory saat MongoDB tidak tersedia */
export class MemoryStore {
  constructor() {
    this.data = structuredClone(defaultData);
    this.dirty = false;
  }

  loadFromDisk() {
    try {
      if (!existsSync(backupPath)) return;
      const raw = readFileSync(backupPath, 'utf8');
      this.data = { ...defaultData, ...JSON.parse(raw) };
    } catch {
      /* ignore corrupt file */
    }
  }

  saveToDisk() {
    if (!this.dirty) return;
    try {
      const dir = dirname(backupPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf8');
      this.dirty = false;
    } catch {
      /* ignore write errors on read-only FS (Railway without volume) */
    }
  }

  markDirty() {
    this.dirty = true;
  }
}
