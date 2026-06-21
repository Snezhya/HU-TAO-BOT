/** Waktu boot bot — untuk runtime di menu */
let bootAt = Date.now();

export function setBootAt(ts = Date.now()) {
  bootAt = ts;
}

export function getRuntime() {
  const sec = Math.floor((Date.now() - bootAt) / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}h ${h}m ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
