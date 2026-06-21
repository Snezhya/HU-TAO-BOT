import axios from 'axios';
const BASE = 'https://downr.org';
const ANALYTICS = `${BASE}/.netlify/functions/analytics`;
const DOWNLOAD = `${BASE}/.netlify/functions/download`;
const NYT = `${BASE}/.netlify/functions/nyt`;
const UA = 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36';

function parseCookie(setCookie = []) { return setCookie.map(v => v.split(';')[0]).join('; '); }
function parseData(data) { if (typeof data !== 'string') return data; try { return JSON.parse(data.trim()); } catch { return data.trim(); } }
function isOk(status, data) {
  const isObject = data && typeof data === 'object';
  if (status < 200 || status >= 300) return false;
  if (!data || data === 'error' || data === 'failed' || data === 'user_retry_required') return false;
  if (isObject && (data.error === true || data.status === false || data.success === false)) return false;
  return true;
}

async function getCookie() {
  const res = await axios.get(ANALYTICS, { validateStatus: () => true, headers: { 'user-agent': UA }});
  return parseCookie(res.headers['set-cookie'] || []);
}

async function postEndpoint(endpoint, url, cookie = '') {
  const res = await axios.post(endpoint, { url }, {
    validateStatus: () => true,
    headers: { 'content-type': 'application/json', cookie, origin: BASE, referer: `${BASE}/`, 'user-agent': UA }
  });
  return { endpoint, status: res.status, data: parseData(res.data) };
}

async function downr(url) {
  let cookie = await getCookie();
  let result = await postEndpoint(DOWNLOAD, url, cookie);
  if (isOk(result.status, result.data)) return result.data;
  cookie = await getCookie();
  result = await postEndpoint(DOWNLOAD, url, cookie);
  if (isOk(result.status, result.data)) return result.data;
  result = await postEndpoint(NYT, url, cookie);
  return result.data;
}

downr('https://www.instagram.com/reel/C8P1r2gS2tY/').then(console.log).catch(console.error);
