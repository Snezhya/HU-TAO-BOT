import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.easemate.ai';
const WASM_URL =
  'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/chat_generator.wasm';

const SESSION_FILE = '/tmp/easemate-session.json';
const MAX_USE_PER_DEVICE = 50;

const ASPECT_RATIO = 'Auto';
const OUTPUT_FILE_TYPE = 'png';

const MODEL_ID = 10041;
const TASK_TYPE = 10041;
const OPERATION_ID = 419;
const OPERATION = 'IMAGE_GENERATION';

const ua =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

let wasm;
let wasmUint8 = null;
let wasmDataView = null;
let wasmLastLen = 0;

const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
const encoder = new TextEncoder();

class Window {}

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function createDeviceId() {
  return randomHex(16);
}

function createTimestamp() {
  return (
    BigInt(Date.now()) * 1000000n +
    BigInt(crypto.randomInt(100000, 999999))
  ).toString();
}

function getExt(filePath) {
  return path.extname(filePath).toLowerCase().replace('.', '');
}

function getMimeType(filePath) {
  const ext = getExt(filePath);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  throw new Error('Format input tidak didukung. Gunakan JPG/JPEG/PNG saja.');
}

function createUploadKey(session, filePath) {
  const ext = getExt(filePath) || 'jpg';
  const safeExt = ext === 'jpeg' ? 'jpg' : ext;
  const hash = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();
  return `pro/${session.deviceId}/${hash}_${ts}.${safeExt}`;
}

function createFreshSession() {
  return {
    deviceId: createDeviceId(),
    identityId: '',
    usedCount: 0,
    rotatedAt: new Date().toISOString(),
  };
}

async function loadSession() {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    const session = JSON.parse(raw);
    if (!session.deviceId || typeof session.usedCount !== 'number') {
      return createFreshSession();
    }
    if (session.usedCount >= MAX_USE_PER_DEVICE) {
      return createFreshSession();
    }
    if (!session.identityId) session.identityId = '';
    return session;
  } catch {
    return createFreshSession();
  }
}

async function saveSession(session) {
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
}

async function markSessionUsed(session, identityId) {
  session.identityId = identityId || session.identityId || '';
  session.usedCount = (session.usedCount || 0) + 1;
  session.updatedAt = new Date().toISOString();
  await saveSession(session);
}

function setupBrowserMock(session) {
  globalThis.Window = Window;

  const localStorage = {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
      this.store.set(key, String(value));
    },
  };

  localStorage.setItem(
    'app-main',
    JSON.stringify({
      visitorId: session.deviceId,
      identityId: session.identityId || '',
      browserLang: 'en-US',
      iResult: {
        os: { name: 'Android' },
        browser: { name: 'Chrome' },
        device: { type: 'mobile' },
      },
    })
  );

  const win = new Window();
  win.location = { origin: 'https://www.easemate.ai' };
  win.localStorage = localStorage;
  globalThis.window = win;
  globalThis.self = win;

  return localStorage;
}

async function loadWasmBytes() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(WASM_URL, {
        headers: { 'user-agent': ua, accept: 'application/wasm,*/*' },
      });
      if (!response.ok) throw new Error(`Gagal download WASM: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(2000);
    }
  }
}

function getWasmMemory() {
  if (wasmUint8 === null || wasmUint8.byteLength === 0) {
    wasmUint8 = new Uint8Array(wasm.memory.buffer);
  }
  return wasmUint8;
}

function getWasmDataView() {
  if (
    wasmDataView === null ||
    wasmDataView.buffer.detached === true ||
    (wasmDataView.buffer.detached === undefined &&
      wasmDataView.buffer !== wasm.memory.buffer)
  ) {
    wasmDataView = new DataView(wasm.memory.buffer);
  }
  return wasmDataView;
}

function readWasmString(ptr, len) {
  ptr = ptr >>> 0;
  return decoder.decode(getWasmMemory().subarray(ptr, ptr + len));
}

function passStringToWasm(text, malloc, realloc) {
  if (realloc === undefined) {
    const buf = encoder.encode(text);
    const ptr = malloc(buf.length, 1) >>> 0;
    getWasmMemory().subarray(ptr, ptr + buf.length).set(buf);
    wasmLastLen = buf.length;
    return ptr;
  }

  let len = text.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getWasmMemory();
  let offset = 0;

  for (; offset < len; offset++) {
    const code = text.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }

  if (offset !== len) {
    if (offset !== 0) text = text.slice(offset);
    ptr = realloc(ptr, len, (len = offset + text.length * 3), 1) >>> 0;
    const view = getWasmMemory().subarray(ptr + offset, ptr + len);
    const ret = encoder.encodeInto(text, view);
    offset += ret.written || 0;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }

  wasmLastLen = offset;
  return ptr;
}

function addExternRef(value) {
  const idx = wasm.__externref_table_alloc();
  wasm.__wbindgen_export_2.set(idx, value);
  return idx;
}

function handleWasmError(fn, args) {
  try {
    return fn.apply(null, args);
  } catch (error) {
    const idx = addExternRef(error);
    wasm.__wbindgen_exn_store(idx);
  }
}

function isNullish(value) {
  return value == null;
}

function createImports() {
  const imports = { wbg: {} };

  imports.wbg.__wbg_call_13410aac570ffff7 = (...args) =>
    handleWasmError((fn, self) => fn.call(self), args);

  imports.wbg.__wbg_getItem_9fc74b31b896f95a = (...args) =>
    handleWasmError((retPtr, storage, keyPtr, keyLen) => {
      const key = readWasmString(keyPtr, keyLen);
      const value = storage.getItem(key);
      const ptr = isNullish(value)
        ? 0
        : passStringToWasm(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len = wasmLastLen;
      getWasmDataView().setInt32(retPtr + 4, len, true);
      getWasmDataView().setInt32(retPtr + 0, ptr, true);
    }, args);

  imports.wbg.__wbg_instanceof_Window_12d20d558ef92592 = (value) => {
    try { return value instanceof Window; } catch { return false; }
  };

  imports.wbg.__wbg_localStorage_9330af8bf39365ba = (...args) =>
    handleWasmError((value) => {
      const storage = value.localStorage;
      return isNullish(storage) ? 0 : addExternRef(storage);
    }, args);

  imports.wbg.__wbg_location_92d89c32ae076cab = (value) => value.location;
  imports.wbg.__wbg_log_6c7b5f4f00b8ce3f = () => {};
  imports.wbg.__wbg_newnoargs_254190557c45b4ec = (ptr, len) =>
    new Function(readWasmString(ptr, len));

  imports.wbg.__wbg_origin_00892013881c6e2b = (...args) =>
    handleWasmError((retPtr, value) => {
      const origin = value.origin;
      const ptr = passStringToWasm(origin, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len = wasmLastLen;
      getWasmDataView().setInt32(retPtr + 4, len, true);
      getWasmDataView().setInt32(retPtr + 0, ptr, true);
    }, args);

  imports.wbg.__wbg_static_accessor_GLOBAL_8921f820c2ce3f12 = () => {
    const value = typeof globalThis === 'undefined' ? null : globalThis;
    return isNullish(value) ? 0 : addExternRef(value);
  };

  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_f0a4409105898184 = () => {
    const value = typeof globalThis === 'undefined' ? null : globalThis;
    return isNullish(value) ? 0 : addExternRef(value);
  };

  imports.wbg.__wbg_static_accessor_SELF_995b214ae681ff99 = () => {
    const value = typeof self === 'undefined' ? null : self;
    return isNullish(value) ? 0 : addExternRef(value);
  };

  imports.wbg.__wbg_static_accessor_WINDOW_cde3890479c675ea = () => {
    const value = typeof window === 'undefined' ? null : window;
    return isNullish(value) ? 0 : addExternRef(value);
  };

  imports.wbg.__wbg_stringify_b98c93d0a190446a = (...args) =>
    handleWasmError((value) => JSON.stringify(value), args);

  imports.wbg.__wbg_wbindgenisnull_f3037694abe4d97a = (value) => value === null;
  imports.wbg.__wbg_wbindgenisobject_307a53c6bd97fbf8 = (value) => typeof value === 'object' && value !== null;
  imports.wbg.__wbg_wbindgenisstring_d4fa939789f003b0 = (value) => typeof value === 'string';
  imports.wbg.__wbg_wbindgenisundefined_c4b71d073b92f3c5 = (value) => value === undefined;

  imports.wbg.__wbg_wbindgenstringget_0f16a6ddddef376f = (retPtr, value) => {
    const text = typeof value === 'string' ? value : undefined;
    let ptr = 0;
    let len = 0;
    if (!isNullish(text)) {
      ptr = passStringToWasm(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      len = wasmLastLen;
    }
    getWasmDataView().setInt32(retPtr + 4, len, true);
    getWasmDataView().setInt32(retPtr + 0, ptr, true);
  };

  imports.wbg.__wbg_wbindgenthrow_451ec1a8469d7eb6 = (ptr, len) => {
    throw new Error(readWasmString(ptr, len));
  };

  imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = (ptr, len) => readWasmString(ptr, len);

  imports.wbg.__wbindgen_init_externref_table = () => {
    const table = wasm.__wbindgen_export_2;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
  };

  return imports;
}

async function initWasm(session) {
  setupBrowserMock(session);
  if (wasm) return;
  try {
    const wasmBytes = await loadWasmBytes();
    const imports = createImports();
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    wasm = instance.exports;
    wasmUint8 = null;
    wasmDataView = null;
    if (wasm.__wbindgen_start) wasm.__wbindgen_start();
  } catch (err) {
    wasm = null;
    throw err;
  }
}

async function getSigns(body) {
  const timestamp = createTimestamp();
  const timestampPtr = passStringToWasm(timestamp, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const timestampLen = wasmLastLen;
  const result = wasm.get_signs(body, timestampPtr, timestampLen);
  const ptr = result[0];
  const len = result[1];
  const text = readWasmString(ptr, len);
  wasm.__wbindgen_free(ptr, len, 1);
  return JSON.parse(text);
}

async function apiPost(session, endpoint, body = {}) {
  await initWasm(session);
  const { sign, timestamp } = await getSigns(body);
  if (!sign || !timestamp) throw new Error('Gagal generate sign dari WASM.');

  const headers = {
    language: 'en-US',
    lang: 'en',
    'device-type': 'web',
    'device-identifier': session.deviceId,
    'device-uuid': session.deviceId,
    'device-platform': 'Android,Chrome',
    'sec-ch-ua-platform': `"Android"`,
    'sec-ch-ua': `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    'sec-ch-ua-mobile': '?1',
    accept: 'application/json',
    'content-type': 'application/json;charset=UTF-8',
    sign,
    timestamp,
    site: 'www.easemate.ai',
    'client-type': 'web',
    'client-name': 'chatpdf',
    'product-code': '888',
    'user-agent': ua,
    origin: 'https://www.easemate.ai',
    referer: 'https://www.easemate.ai/',
  };

  if (session.identityId) headers['identity-id'] = session.identityId;

  const response = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Response bukan JSON: ${text.slice(0, 500)}`);
  }

  return { code: response.status, json };
}

async function ensureIdentity(session) {
  if (session.identityId) return;
  const result = await apiPost(session, '/api2/task/identity_id', {});
  const identityId = result.json?.data?.identity_id;
  if (identityId) {
    session.identityId = identityId;
    await saveSession(session);
    setupBrowserMock(session);
    return;
  }
  throw new Error(`IdentityId tidak ditemukan: ${JSON.stringify(result.json)}`);
}

async function queryUploadUrl(session, filePath) {
  const key = createUploadKey(session, filePath);
  const body = {
    key,
    value: crypto.randomBytes(16).toString('hex'),
  };
  const result = await apiPost(session, '/api2/task/query_upload_url', body);
  if (result.json?.code !== 200) throw new Error(JSON.stringify(result.json));
  const data = result.json?.data || {};
  if (!data.upload_url || !data.download_url) {
    throw new Error(`Upload URL tidak ditemukan: ${JSON.stringify(result.json)}`);
  }
  return {
    s3Name: key,
    uploadUrl: data.upload_url,
    downloadUrl: data.download_url,
  };
}

async function uploadFileToS3(uploadUrl, filePath) {
  const buffer = await fs.readFile(filePath);
  const mime = getMimeType(filePath);
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': mime,
      'content-length': String(buffer.length),
    },
    body: buffer,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Upload S3 gagal: ${response.status} ${text.slice(0, 300)}`);
  }
  return { size: buffer.length, originName: path.basename(filePath) };
}

function createGenerateBody(prompt, uploaded) {
  return {
    model_id: MODEL_ID,
    operation_info: { id: OPERATION_ID, operation: OPERATION },
    object_info: [
      {
        img_info: {
          s3_name: uploaded.s3Name,
          s3_url: uploaded.downloadUrl,
          size: uploaded.size,
          origin_name: uploaded.originName,
        },
      },
    ],
    parameters: JSON.stringify({
      prompt,
      file_type: OUTPUT_FILE_TYPE,
      aspectRatio: ASPECT_RATIO,
    }),
  };
}

function createUnsignedDownloadUrl(rawUrl) {
  const filename = rawUrl.split('/').pop()?.split('?')[0] || 'image.png';
  const url = new URL(rawUrl);
  url.search = '';
  url.searchParams.set('filename', filename);
  return url.toString();
}

async function signUrl(session, rawUrl) {
  const key = createUnsignedDownloadUrl(rawUrl);
  const result = await apiPost(session, '/api2/task/url_sign', { key });
  if (result.json?.code !== 200) throw new Error(JSON.stringify(result.json));
  const signedUrl = result.json?.data?.url;
  if (!signedUrl) throw new Error(`Signed URL tidak ditemukan: ${JSON.stringify(result.json)}`);
  return signedUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createTask(session, prompt, uploaded) {
  const body = createGenerateBody(prompt, uploaded);
  const result = await apiPost(session, '/api2/async/create_generate_image', body);

  if (result.json?.code === 6101) {
    throw new Error('Free token hari ini sudah habis. Coba lagi besok.');
  }
  if (result.json?.code !== 200) throw new Error(JSON.stringify(result.json));

  const taskId = result.json?.data?.taskId;
  if (!taskId) throw new Error(`TaskId tidak ditemukan: ${JSON.stringify(result.json)}`);
  return taskId;
}

async function queryTask(session, taskId) {
  const body = { taskId, task_type: TASK_TYPE };
  const result = await apiPost(session, '/api2/async/query_generate_image', body);
  if (result.json?.code !== 200) throw new Error(JSON.stringify(result.json));
  return result.json?.data || {};
}

/**
 * Edit an image using the EaseMate AI API (free, no API key needed).
 * @param {string} imagePath - Absolute path to input image (JPG/PNG)
 * @param {string} prompt - Editing instruction (e.g. "make the sky pink")
 * @returns {{ Status: boolean, Url?: string, Error?: string }}
 */
export async function editImage(imagePath, prompt) {
  const session = await loadSession();
  await saveSession(session);

  await ensureIdentity(session);

  const uploadInfo = await queryUploadUrl(session, imagePath);
  const uploadedFile = await uploadFileToS3(uploadInfo.uploadUrl, imagePath);

  const uploaded = {
    s3Name: uploadInfo.s3Name,
    downloadUrl: uploadInfo.downloadUrl,
    size: uploadedFile.size,
    originName: uploadedFile.originName,
  };

  const taskId = await createTask(session, prompt, uploaded);

  for (let i = 0; i < 40; i++) {
    const data = await queryTask(session, taskId);

    if (data.status === 'SUCCESS' && data.url) {
      const signedUrl = await signUrl(session, data.url);
      await markSessionUsed(session, session.identityId);
      return { Status: true, Url: signedUrl };
    }

    if (data.status === 'FAILED' || data.status === 'FAILURE') {
      await markSessionUsed(session, session.identityId);
      return { Status: false, Error: data.msg || 'Generate failed' };
    }

    await sleep(3000);
  }

  await markSessionUsed(session, session.identityId);
  return { Status: false, Error: 'Timeout menunggu hasil gambar.' };
}
