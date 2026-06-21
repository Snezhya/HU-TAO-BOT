import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from './logger.js';
import { registerFeatures } from './feature-toggle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/**
 * Load semua module dari folder (commands / plugins)
 * @param {'commands'|'plugins'} folder
 */
export async function loadModules(folder) {
  const dir = join(root, folder);
  let files = [];
  try {
    files = await readdir(dir);
  } catch {
    log.warn(`Folder ${folder}/ tidak ditemukan`);
    return [];
  }

  const modules = [];
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    try {
      const mod = await import(pathToFileURL(join(dir, file)).href);
      const entry = mod.default || mod;
      if (!entry?.name) {
        log.warn(`Skip ${folder}/${file} — tidak ada export name`);
        continue;
      }
      modules.push(entry);
      log.success(`Loaded ${folder}: ${entry.name}`);
    } catch (err) {
      log.error(`Gagal load ${folder}/${file}: ${err.message}`);
    }
  }
  return modules;
}

/**
 * Daftarkan semua fitur dari commands + plugins ke feature-toggle registry.
 * Dipanggil sekali setelah kedua folder selesai di-load.
 * @param {object[]} commandModules
 * @param {object[]} pluginModules
 */
export function registerAllFeatures(commandModules, pluginModules) {
  const names = [...commandModules, ...pluginModules]
    .map(m => m.name)
    .filter(Boolean);
  // Virtual features not tied to a specific command/plugin module
  names.push('groupmemory');
  registerFeatures(names);
}
