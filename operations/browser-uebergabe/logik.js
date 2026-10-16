/* Reine Pruefungen fuer Dashboard, Worker und Empfaenger; keine Ablage oder Netzaufrufe. */
(() => {
  'use strict';
  const TTL = 120000;
  const MAX_TEXT = 200000;
  const MAX_JOBS = 5;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function projektZiel(roh) {
    if (typeof roh !== 'string') return null;
    try {
      const url = new URL(roh);
      if (url.origin !== 'https://chatgpt.com' || url.username || url.password || url.search || url.hash
        || !/^\/g\/g-p-[a-f0-9]{32}\/project$/.test(url.pathname) || url.href !== roh) return null;
      return url.href;
    } catch { return null; }
  }
  function dashboardSender(sender, urspruenge, runtimeId) {
    if (sender?.id !== runtimeId || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !sender.documentId) return false;
    try { return urspruenge.includes(new URL(sender.url).origin); } catch { return false; }
  }
  function nachrichtGueltig(m) {
    if (!m || m.typ !== 'tp-prozess-uebergabe' || m.version !== 1 || !UUID.test(m.id || '')) return false;
    if (!['status', 'einfuegen', 'abbrechen'].includes(m.aktion)) return false;
    if (m.aktion !== 'einfuegen') return m.text === undefined && m.ziel === undefined;
    return Boolean(projektZiel(m.ziel)) && typeof m.text === 'string' && m.text.trim().length > 0 && m.text.length <= MAX_TEXT;
  }
  function gleicherEmpfaenger(job, sender, m, runtimeId) {
    return Boolean(empfaengerIdentisch(job, sender, m, runtimeId) && sender.url === job.ziel);
  }
  function empfaengerIdentisch(job, sender, m, runtimeId) {
    return Boolean(job && sender?.id === runtimeId && sender.frameId === 0
      && sender.tab?.id === job.zielTab && sender.documentId === job.zielDokument
      && m.id === job.id && m.token === job.token);
  }
  function abgelaufen(job, jetzt) { return !job || !Number.isFinite(job.bis) || job.bis <= jetzt; }
  function gleicherAbsender(job, sender) {
    return job.quellTab === sender.tab.id && job.quellDokument === sender.documentId;
  }
  function eintragungMoeglich(jobs, gesehen, id) {
    if (gesehen[id] || jobs[id]) return 'doppelt';
    if (Object.keys(jobs).length >= MAX_JOBS || Object.keys(gesehen).length >= 100) return 'zu_viele';
    return null;
  }
  function feldLeer(text, anhaenge = false) { return typeof text === 'string' && !text.trim() && !anhaenge; }
  function gleicherText(a, b) { return String(a).replace(/\r\n?/g, '\n') === String(b).replace(/\r\n?/g, '\n'); }
  globalThis.TPBrowserUebergabeLogik = Object.freeze({
    TTL, MAX_TEXT, MAX_JOBS, UUID, projektZiel, dashboardSender, nachrichtGueltig,
    gleicherEmpfaenger, empfaengerIdentisch, gleicherAbsender, abgelaufen, eintragungMoeglich, feldLeer, gleicherText,
  });
})();
