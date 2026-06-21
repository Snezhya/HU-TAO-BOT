/**
 * Sembunyikan log bising libsignal ("Closing session: SessionEntry")
 * Bukan error bot — normal saat rotasi sesi enkripsi WhatsApp.
 */
export function silenceSignalSessionLogs() {
  const skip = (args) => {
    const first = args[0];
    if (typeof first === 'string') {
      if (first.includes('Closing session')) return true;
      if (first.includes('Opening session')) return true;
      if (first.includes('Session already')) return true;
    }
    if (first?.constructor?.name === 'SessionEntry') return true;
    if (first?._chains && first?.registrationId != null) return true;
    return false;
  };

  for (const method of ['info', 'log']) {
    const orig = console[method].bind(console);
    console[method] = (...args) => {
      if (skip(args)) return;
      orig(...args);
    };
  }
}
