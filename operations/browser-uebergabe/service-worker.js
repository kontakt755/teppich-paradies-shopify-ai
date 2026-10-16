import './logik.js';
import './konfiguration.js';

const L = globalThis.TPBrowserUebergabeLogik;
const URSPRUENGE = globalThis.TPBrowserUebergabeKonfiguration.dashboardUrspruenge;
const KEY = 'tp-prozess-uebergaben-v1';
const KANAL = 'empfaenger';
// Nur kurze Speicher-/Chrome-Operationen serialisieren; auf die Webseite wartet der Empfaenger.
let reihe = Promise.resolve();
function seriell(fn) {
  const lauf = reihe.then(fn, fn);
  reihe = lauf.catch(() => {});
  return lauf;
}
async function lade() {
  const wert = (await chrome.storage.session.get(KEY))[KEY];
  return wert && wert.jobs && wert.gesehen ? wert : { jobs: {}, gesehen: {} };
}
async function speichere(s) { await chrome.storage.session.set({ [KEY]: s }); }
function fehler(code) { return { status: 'fehler', code }; }
async function sende(tabId, m, documentId) {
  if (!Number.isInteger(tabId) || !documentId) return;
  try { await chrome.tabs.sendMessage(tabId, m, { documentId }); } catch { /* Geschlossener Tab: keinen Inhalt protokollieren. */ }
}
async function entferne(s, job, code = null, erfolgreich = false) {
  delete s.jobs[job.id];
  await speichere(s);
  await chrome.alarms.clear(`ablauf:${job.id}`);
  await chrome.alarms.clear(`bereit:${job.id}`);
  if (!erfolgreich && job.zielDokument) {
    await sende(job.zielTab, { kanal: KANAL, aktion: 'abbrechen', id: job.id, token: job.token }, job.zielDokument);
  }
  if (code || erfolgreich) {
    await sende(job.quellTab, { kanal: 'dashboard-antwort', id: job.id, status: erfolgreich ? 'eingefuegt' : 'fehler', ...(code ? { code } : {}) }, job.quellDokument);
  }
}
async function bereinige(s, jetzt = Date.now()) {
  for (const job of Object.values(s.jobs)) if (L.abgelaufen(job, jetzt)) await entferne(s, job, 'abgelaufen');
  for (const [id, eintrag] of Object.entries(s.gesehen)) if (eintrag.bis <= jetzt) delete s.gesehen[id];
  await speichere(s);
}

async function bearbeite(m, sender) {
  const s = await lade();
  await bereinige(s);
  if (m?.kanal === 'dashboard') {
    if (!L.dashboardSender(sender, URSPRUENGE, chrome.runtime.id) || !L.nachrichtGueltig(m)) return fehler('ungueltig');
    if (m.aktion === 'status') return { status: 'bereit' };
    if (m.aktion === 'abbrechen') {
      const job = s.jobs[m.id];
      if (job && L.gleicherAbsender(job, sender)) await entferne(s, job, 'abgebrochen');
      else if (!job && !s.gesehen[m.id] && Object.keys(s.gesehen).length < 100) {
        // Ein vor dem Erstellen eingetroffener Abbruch darf spaeter nicht wiederauferstehen.
        s.gesehen[m.id] = { bis: Date.now() + L.TTL };
        await speichere(s);
      }
      return fehler('abgebrochen');
    }
    const blockiert = L.eintragungMoeglich(s.jobs, s.gesehen, m.id);
    if (blockiert) return fehler(blockiert);
    const jetzt = Date.now();
    s.gesehen[m.id] = { bis: jetzt + L.TTL };
    await speichere(s);
    let tab;
    try { tab = await chrome.tabs.create({ url: m.ziel, active: true }); }
    catch { return fehler('begleiter_fehler'); }
    if (!Number.isInteger(tab?.id)) return fehler('begleiter_fehler');
    s.jobs[m.id] = {
      id: m.id, token: crypto.randomUUID(), ziel: m.ziel, text: m.text, bis: jetzt + L.TTL,
      quellTab: sender.tab.id, quellDokument: sender.documentId, zielTab: tab.id,
      zielDokument: null, phase: 'wartet',
    };
    await speichere(s);
    await chrome.alarms.create(`ablauf:${m.id}`, { when: jetzt + L.TTL });
    await chrome.alarms.create(`bereit:${m.id}`, { when: jetzt + 30000 });
    return { status: 'oeffnet' };
  }
  if (m?.kanal !== KANAL || sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.documentId) return fehler('ungueltig');
  if (m.aktion === 'bereit') {
    const job = Object.values(s.jobs).find(j => j.zielTab === sender.tab?.id);
    if (!job) return { status: 'ignorieren' };
    if (sender.url !== job.ziel || !L.projektZiel(sender.url) || job.zielDokument) {
      await entferne(s, job, 'ziel_falsch');
      return fehler('ziel_falsch');
    }
    job.zielDokument = sender.documentId;
    await speichere(s);
    return { status: 'wartet', id: job.id, token: job.token, ziel: job.ziel, bis: job.bis };
  }
  const job = s.jobs[m.id];
  if (L.empfaengerIdentisch(job, sender, m, chrome.runtime.id) && sender.url !== job.ziel) {
    await entferne(s, job, 'ziel_falsch');
    return fehler('ziel_falsch');
  }
  if (!L.gleicherEmpfaenger(job, sender, m, chrome.runtime.id)) return fehler('abgebrochen');
  if (m.aktion === 'holen') {
    if (job.phase !== 'wartet') return fehler('doppelt');
    job.phase = 'ausgeliefert';
    await speichere(s);
    await chrome.alarms.clear(`bereit:${job.id}`);
    return { status: 'einsetzen', id: job.id, token: job.token, ziel: job.ziel, text: job.text, bis: job.bis };
  }
  if (m.aktion === 'ergebnis') {
    const ok = m.ok === true && job.phase === 'ausgeliefert';
    const codes = ['offline', 'ziel_falsch', 'entwurf_vorhanden', 'eingabefeld_fehlt', 'nicht_eingefuegt', 'eingabefeld_nicht_unterstuetzt', 'abgelaufen', 'abgebrochen'];
    await entferne(s, job, ok ? null : (codes.includes(m.code) ? m.code : 'begleiter_fehler'), ok);
    return { angenommen: true };
  }
  return fehler('ungueltig');
}

chrome.runtime.onMessage.addListener((m, sender, antworte) => {
  if (!['dashboard', KANAL].includes(m?.kanal)) return false;
  seriell(() => bearbeite(m, sender)).then(antworte, () => antworte(fehler('begleiter_fehler')));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (!/^(ablauf|bereit):/.test(alarm.name)) return;
  seriell(async () => {
    const s = await lade();
    await bereinige(s);
    const job = s.jobs[alarm.name.split(':')[1]];
    if (job && alarm.name.startsWith('bereit:') && job.phase === 'wartet') await entferne(s, job, 'seite_nicht_bereit');
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  seriell(async () => {
    const s = await lade();
    for (const job of Object.values(s.jobs)) if (job.quellTab === tabId || job.zielTab === tabId) await entferne(s, job, 'abgebrochen');
  }).catch(() => {});
});
// "loading" kann fuer das Erstladen noch nach der Empfaengerbindung eintreffen.
// Es bezeichnet kein Dokument: Im Ziel deshalb nur eine andere URL abbrechen.
// Ein neues Dokument an derselben URL bleibt durch documentId+Token gesperrt;
// der alte Empfaenger stoppt beim pagehide vor einer weiteren DOM-Aenderung.
chrome.tabs.onUpdated.addListener((tabId, aenderung) => {
  if (aenderung.status !== 'loading' && typeof aenderung.url !== 'string') return;
  seriell(async () => {
    const s = await lade();
    for (const job of Object.values(s.jobs)) {
      if ((job.quellTab === tabId && aenderung.status === 'loading')
        || (job.zielTab === tabId && typeof aenderung.url === 'string' && aenderung.url !== job.ziel)) {
        await entferne(s, job, 'abgebrochen');
      }
    }
  }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { seriell(async () => bereinige(await lade())).catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { seriell(async () => bereinige(await lade())).catch(() => {}); });
