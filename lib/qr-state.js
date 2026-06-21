/** State QR / pairing untuk halaman web (Railway) */
let currentQr = null;
let pairingCode = null;
let waConnected = false;

export function setWhatsAppQr(qr) {
  currentQr = qr;
  pairingCode = null;
}

export function setPairingCode(code) {
  pairingCode = code;
  currentQr = null;
}

export function setWaConnected(connected) {
  waConnected = connected;
  if (connected) {
    currentQr = null;
    pairingCode = null;
  }
}

export function getQrState() {
  return { qr: currentQr, pairingCode, connected: waConnected };
}
