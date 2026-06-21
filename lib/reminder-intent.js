/**
 * Deteksi Intent Bahasa Natural untuk Pengingat Pasangan
 * Mendukung format:
 *   - ON/OFF/LIST/ADD/DEL standar
 *   - RELATIVE: "ingetin X menit lagi"
 *   - FROM_TIME: "masak jam 2.27, kalo 30 menit ingetin"
 *   - CLEAR_ALL: "hapus semua pengingat / reminder"
 */

const INTENT_PATTERNS = {
  ON: [
    /^(?:tolong\s+)?(?:aktifkan|nyalain|hidupin)\s+(?:pengingat|reminder)(?:\s+pasangan)?/i,
    /(?:ingetin|reminder)\s+aku\s+terus\s+tiap\s+hari/i,
  ],
  OFF: [
    /^(?:tolong\s+)?(?:matikan|matiin|nonaktifkan|stop)\s+(?:pengingat|reminder)/i,
  ],
  LIST: [
    /^(?:coba\s+)?(?:lihat|cek|tampil|kasih\s+tau|spill)\s+(?:jadwal|pengingat|reminder)/i,
    /jadwal\s+(?:pengingat|reminder)\s+(?:aku|kita)\s+apa\s+aja/i,
  ],
  // Hapus SEMUA reminder / tugas (bukan matiin, hanya hapus jadwal tugas)
  CLEAR_ALL: [
    /hapus\s+semua\s+(?:yang\s+aku\s+suruh\s+)?(?:pengingat|reminder|ingetin|ingat(?:in)?|jadwal)/i,
    /(?:ilangin|buang|clear|reset)\s+semua\s+(?:pengingat|reminder|jadwal|tugas)/i,
    /hapus\s+(?:semua\s+)?(?:pengingat|reminder|jadwal)\s+(?:aku|ku)/i,
  ],
  DEL: [
    /(?:hapus|ilangin|buang)\s+(?:jadwal|pengingat|reminder)\s+(?:nomor\s+|no\.?\s*|ke\s*)(\d+)/i,
  ],
  ADD: [
    // ingetin sarapan jam 07:30 / jam 07:30 ingetin sarapan
    /(?:tambah|tambahin|bikin|jadwalin)?\s*(?:ingetin|ingat)(?:\s+aku)?\s+(makan\s+siang|makan\s+malam|sarapan|bangun|mandi|tidur|ngantuk|nanya\s+kabar)\s+(?:jam|pukul)\s+(\d{1,2}(?:[:.]\d{2})?)/i,
    /(?:jam|pukul)\s+(\d{1,2}(?:[:.]\d{2})?)\s+(?:ingetin|ingat)(?:\s+aku)?\s+(makan\s+siang|makan\s+malam|sarapan|bangun|mandi|tidur|ngantuk|nanya\s+kabar)/i,
  ],
  // "ingetin X menit lagi" / "ingetin lagi X menit" / "ingetin aku X menit lagi"
  RELATIVE: [
    /(?:ingetin|ingat(?:in)?|remind)(?:\s+aku)?\s+(\d+)\s+menit\s+lagi/i,
    /(?:ingetin|ingat(?:in)?|remind)(?:\s+aku)?\s+lagi\s+(\d+)\s+menit/i,
    /(?:ingetin|ingat(?:in)?|remind)(?:\s+aku)?\s+(\d+)\s+jam\s+lagi/i,
    /(?:ingetin|ingat(?:in)?|remind)(?:\s+aku)?\s+lagi\s+(\d+)\s+jam/i,
  ],
  // "masak nasi jam 2.27, kalo 30 menit ingetin"
  // "jam 2.27 masak, 30 menit lagi ingetin"
  FROM_TIME: [
    // jam X, kalo Y menit ingetin <teks opsional>
    /(?:.*?)jam\s+(\d{1,2}[.:]\d{2}|\d{1,2})\s*(?:[,.].*?)?\s*(?:kalo|kalau|setelah|abis)\s+(\d+)\s+menit\s+(?:ingetin|ingat(?:in)?|remind)/i,
    // jam X kalo Y jam ingetin
    /(?:.*?)jam\s+(\d{1,2}[.:]\d{2}|\d{1,2})\s*(?:[,.].*?)?\s*(?:kalo|kalau|setelah|abis)\s+(\d+)\s+jam\s+(?:ingetin|ingat(?:in)?|remind)/i,
    // Y menit dari jam X ingetin
    /(\d+)\s+menit\s+(?:dari|setelah)\s+jam\s+(\d{1,2}[.:]\d{2}|\d{1,2})\s+(?:ingetin|ingat(?:in)?|remind)/i,
  ],
  ADD_TASK: [
    // ingetin tugas matematika besok jam 15:00
    /(?:ingetin|ingat|tambah|jadwalin)(?:\s+aku)?\s+(?:ada\s+)?(tugas|deadline|meeting|acara|ujian|presentasi|kegiatan)\s+(.*?)\s+(besok|lusa|hari\s+ini|hari\s+[a-z]+|tanggal\s+\d{1,2})\s+(?:jam|pukul)\s+(\d{1,2}(?:[:.]\d{2})?)/i,
    // jam 6 malam main epep ingetin hari ini
    /(?:jam|pukul)\s+(\d{1,2}(?:[:.]\d{2})?)(?:\s+(pagi|siang|sore|malam))?\s+(.*?)(?:ingetin|ingat)(?:.*?)(besok|lusa|hari\s+ini|hari\s+[a-z]+|tanggal\s+\d{1,2})/i,
  ],
  SNOOZE: [
    /(?:tunda|snooze|entar|nanti)\s+(\d+)\s+menit/i,
  ],
};

// ============================================================================
// Helpers
// ============================================================================

function parseRelativeDate(dateStr) {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB
  const ds = dateStr.toLowerCase().trim();

  if (ds === 'hari ini' || ds === 'hariini') {
    // tetap hari ini
  } else if (ds === 'besok') {
    d.setDate(d.getDate() + 1);
  } else if (ds === 'lusa') {
    d.setDate(d.getDate() + 2);
  } else if (ds.startsWith('hari ')) {
    const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    const targetDay = days.indexOf(ds.split(' ')[1]);
    if (targetDay !== -1) {
      const currentDay = d.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
    }
  } else if (ds.startsWith('tanggal ')) {
    const dateNum = parseInt(ds.replace('tanggal ', ''));
    if (!isNaN(dateNum)) {
      if (dateNum < d.getDate()) d.setMonth(d.getMonth() + 1);
      d.setDate(dateNum);
    }
  }

  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function normalizeType(rawType) {
  const t = rawType.toLowerCase().replace(/\s+/g, '_');
  if (t === 'makan') return 'makan_siang';
  return t;
}

function normalizeTime(rawTime, period = '') {
  const clean = String(rawTime).replace('.', ':');
  let h, m;
  if (clean.includes(':')) {
    [h, m] = clean.split(':').map(Number);
  } else {
    h = Number(clean);
    m = 0;
  }

  const p = (period || '').toLowerCase();
  if ((p.includes('malam') || p.includes('sore')) && h < 12) h += 12;
  if (p.includes('siang') && h < 12) h += 12;

  return { hour: h, minute: m };
}

/** Hitung WIB sekarang → tambah offset menit → return { hour, minute, dateStr } */
function addMinutesToNow(offsetMinutes) {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  wib.setMinutes(wib.getMinutes() + offsetMinutes);
  return {
    hour:    wib.getUTCHours(),
    minute:  wib.getUTCMinutes(),
    dateStr: wib.toISOString().split('T')[0],
  };
}

/** Hitung dari jam tertentu + offset menit → return { hour, minute, dateStr } */
function addMinutesToTime(baseHour, baseMinute, offsetMinutes) {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  // Set ke jam base (hari ini WIB)
  wib.setUTCHours(baseHour, baseMinute, 0, 0);
  // Kalau base sudah lewat hari ini, tetap pakai hari ini (misal masak barusan)
  wib.setMinutes(wib.getMinutes() + offsetMinutes);
  return {
    hour:    wib.getUTCHours(),
    minute:  wib.getUTCMinutes(),
    dateStr: wib.toISOString().split('T')[0],
  };
}

// ============================================================================
// Main detector
// ============================================================================

export function detectReminderIntent(text = '') {
  const t = text.trim();

  // ---- CLEAR_ALL ----
  for (const pattern of INTENT_PATTERNS.CLEAR_ALL) {
    if (pattern.test(t)) return { intent: 'CLEAR_ALL' };
  }

  // ---- RELATIVE: "ingetin X menit lagi" ----
  for (let i = 0; i < INTENT_PATTERNS.RELATIVE.length; i++) {
    const match = t.match(INTENT_PATTERNS.RELATIVE[i]);
    if (match) {
      const n = parseInt(match[1]);
      const isHour = i >= 2; // pattern index 2,3 adalah "jam"
      const offsetMinutes = isHour ? n * 60 : n;
      const { hour, minute, dateStr } = addMinutesToNow(offsetMinutes);
      return {
        intent: 'RELATIVE',
        hour,
        minute,
        date: dateStr,
        offsetMinutes,
        text: `Pengingat ${isHour ? n + ' jam' : n + ' menit'} dari sekarang`,
      };
    }
  }

  // ---- FROM_TIME: "masak jam 2.27, kalo 30 menit ingetin" ----
  // Pattern 0: jam X, kalo Y menit ingetin
  {
    const m = t.match(INTENT_PATTERNS.FROM_TIME[0]);
    if (m) {
      const baseTime = normalizeTime(m[1]);
      const offsetMin = parseInt(m[2]);
      if (!isNaN(offsetMin) && baseTime.hour >= 0 && baseTime.hour <= 23) {
        const { hour, minute, dateStr } = addMinutesToTime(baseTime.hour, baseTime.minute, offsetMin);
        // Ambil teks konteks (sebelum "kalo X menit")
        const context = t.replace(/jam\s+[\d.:]+/i, '').replace(/[,.].*$/i, '').trim();
        return {
          intent: 'FROM_TIME',
          hour,
          minute,
          date: dateStr,
          offsetMinutes: offsetMin,
          text: context || `pengingat ${offsetMin} menit`,
        };
      }
    }
  }
  // Pattern 1: jam X, kalo Y jam ingetin
  {
    const m = t.match(INTENT_PATTERNS.FROM_TIME[1]);
    if (m) {
      const baseTime = normalizeTime(m[1]);
      const offsetHours = parseInt(m[2]);
      if (!isNaN(offsetHours) && baseTime.hour >= 0 && baseTime.hour <= 23) {
        const { hour, minute, dateStr } = addMinutesToTime(baseTime.hour, baseTime.minute, offsetHours * 60);
        const context = t.replace(/jam\s+[\d.:]+/i, '').replace(/[,.].*$/i, '').trim();
        return {
          intent: 'FROM_TIME',
          hour,
          minute,
          date: dateStr,
          offsetMinutes: offsetHours * 60,
          text: context || `pengingat ${offsetHours} jam`,
        };
      }
    }
  }
  // Pattern 2: Y menit dari jam X ingetin
  {
    const m = t.match(INTENT_PATTERNS.FROM_TIME[2]);
    if (m) {
      const offsetMin = parseInt(m[1]);
      const baseTime = normalizeTime(m[2]);
      if (!isNaN(offsetMin) && baseTime.hour >= 0 && baseTime.hour <= 23) {
        const { hour, minute, dateStr } = addMinutesToTime(baseTime.hour, baseTime.minute, offsetMin);
        return {
          intent: 'FROM_TIME',
          hour,
          minute,
          date: dateStr,
          offsetMinutes: offsetMin,
          text: `pengingat ${offsetMin} menit dari jam ${m[2]}`,
        };
      }
    }
  }

  // ---- ADD (rutinitas) ----
  for (const pattern of INTENT_PATTERNS.ADD) {
    const match = t.match(pattern);
    if (match) {
      let rawTime, rawType;
      if (match[1].match(/\d/)) {
        rawTime = match[1]; rawType = match[2];
      } else {
        rawType = match[1]; rawTime = match[2];
      }
      const time = normalizeTime(rawTime);
      const type = normalizeType(rawType);
      if (time.hour >= 0 && time.hour <= 23 && time.minute >= 0 && time.minute <= 59) {
        return { intent: 'ADD', hour: time.hour, minute: time.minute, type };
      }
    }
  }

  // ---- ADD_TASK ----
  for (let i = 0; i < INTENT_PATTERNS.ADD_TASK.length; i++) {
    const match = t.match(INTENT_PATTERNS.ADD_TASK[i]);
    if (match) {
      let label, title, rawDate, rawTime, period = '';
      if (i === 0) {
        label = match[1]; title = match[2]; rawDate = match[3]; rawTime = match[4];
      } else {
        rawTime = match[1]; period = match[2] || ''; label = 'kegiatan'; title = match[3]; rawDate = match[4];
      }
      const time = normalizeTime(rawTime, period);
      const dateStr = parseRelativeDate(rawDate);
      if (time.hour >= 0 && time.hour <= 23 && time.minute >= 0 && time.minute <= 59) {
        return {
          intent: 'ADD_TASK',
          hour: time.hour,
          minute: time.minute,
          date: dateStr,
          text: `${label} ${title}`.trim(),
          isTask: true,
        };
      }
    }
  }

  // ---- SNOOZE ----
  for (const pattern of INTENT_PATTERNS.SNOOZE) {
    const match = t.match(pattern);
    if (match) return { intent: 'SNOOZE', minutes: parseInt(match[1]) };
  }

  // ---- DEL ----
  for (const pattern of INTENT_PATTERNS.DEL) {
    const match = t.match(pattern);
    if (match) return { intent: 'DEL', index: parseInt(match[1]) };
  }

  // ---- ON / OFF / LIST ----
  for (const pattern of INTENT_PATTERNS.ON) if (pattern.test(t)) return { intent: 'ON' };
  for (const pattern of INTENT_PATTERNS.OFF) if (pattern.test(t)) return { intent: 'OFF' };
  for (const pattern of INTENT_PATTERNS.LIST) if (pattern.test(t)) return { intent: 'LIST' };

  return { intent: null };
}