import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initAuthCreds,
  BufferJSON,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { config } from './config.js';
import { log } from './logger.js';
import { isMongoConnected } from './db/connection.js';
import { WaSession } from './db/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultSessionPath = join(__dirname, '..', config.sessionsDir);

// Counter untuk session/decrypt error berturut-turut
let sessionErrorCount = 0;
const SESSION_ERROR_WARN_THRESHOLD = 100;

export function recordSessionError() {
  sessionErrorCount++;
  if (sessionErrorCount === SESSION_ERROR_WARN_THRESHOLD) {
    log.warn(`[Session] ${SESSION_ERROR_WARN_THRESHOLD} session error berturut-turut terdeteksi. Pertimbangkan untuk clear session dan scan ulang jika bot tidak merespons.`);
  }
}

export function resetSessionErrorCount() {
  sessionErrorCount = 0;
}

function fixFileName(file) {
  return file.replace(/\//g, '__').replace(/:/g, '-');
}

async function readMongoFile(file) {
  const path = fixFileName(file);
  const doc = await WaSession.findOne({ path }).lean();
  if (!doc?.data) return null;
  return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
}

async function writeMongoFile(file, data) {
  const path = fixFileName(file);
  const payload = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
  await WaSession.findOneAndUpdate({ path }, { data: payload }, { upsert: true });
}

/**
 * Auth state di MongoDB — session tetap setelah redeploy Railway
 */
async function useMongoAuthState() {
  const creds = (await readMongoFile('creds.json')) || initAuthCreds();

  const saveCreds = async () => {
    await writeMongoFile('creds.json', creds);
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readMongoFile(`${type}-${id}.json`);
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category] || {})) {
              const value = data[category][id];
              const file = `${category}-${id}.json`;
              tasks.push(
                value
                  ? writeMongoFile(file, value)
                  : WaSession.deleteOne({ path: fixFileName(file) })
              );
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds
  };
}

/**
 * Pilih penyimpanan session: mongo (Railway) atau file (lokal)
 */
export async function useAuthState() {
  if (config.sessionStore === 'file') {
    log.info(`Session file: ${defaultSessionPath}`);
    const fileState = await useMultiFileAuthState(defaultSessionPath);
    if (fileState.state.creds?.registered) log.success('Session restored (file)');
    return fileState;
  }

  const useMongo =
    config.sessionStore === 'mongo' ||
    (config.sessionStore === 'auto' && isMongoConnected());

  if (useMongo && isMongoConnected()) {
    const hasCreds = await WaSession.exists({ path: 'creds.json' });
    log.info(hasCreds ? 'Session restored (MongoDB)' : 'Session baru (MongoDB)');
    return useMongoAuthState();
  }

  log.info(`Session file: ${defaultSessionPath}`);
  const fileState = await useMultiFileAuthState(defaultSessionPath);
  const hadSession = fileState.state.creds?.registered;
  if (hadSession) log.success('Session restored (file)');
  return fileState;
}
