/** Nachrichtenaustausch mit dem Chrome-Begleiter; keine Ablage, Zwischenablage oder API. */
export const UEBERGABE_TYP = 'tp-prozess-uebergabe';
export const UEBERGABE_ANTWORT_TYP = 'tp-prozess-uebergabe-antwort';

export function istChatgptProjektZiel(wert) {
  return typeof wert === 'string' && /^https:\/\/chatgpt\.com\/g\/g-p-[a-f0-9]{32}\/project$/.test(wert);
}

/** getRandomValues funktioniert auch am lokalen HTTP-Dashboard. */
export function neueUebergabeId(quelle = globalThis.crypto) {
  if (typeof quelle?.getRandomValues !== 'function') throw new Error('Zufallsquelle fehlt');
  const bytes = quelle.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const FEHLER_TEXTE = Object.freeze({
  begleiter_fehlt: 'Der Chrome-Begleiter antwortet noch nicht. Der Inhaber richtet ihn einmalig in Chrome am Computer ein.',
  browser_nicht_unterstuetzt: 'Die Direktübergabe braucht Chrome am Computer mit dem eingerichteten Begleiter.',
  zeitlimit: 'Die Übergabe dauert zu lange und wurde gestoppt. Bitte in ChatGPT prüfen, ob der Text schon als Entwurf eingefügt wurde.',
  ungueltig: 'Ziel oder Text ist ungültig. Bitte die Projektverknüpfung und deine Angaben prüfen.',
  klick_fehlt: 'Bitte „Im Projekt einfügen“ selbst anklicken.',
  ziel_falsch: 'Das geöffnete ChatGPT-Projekt passt nicht zur Verknüpfung. Bitte die Projektadresse prüfen.',
  doppelt: 'Diese Übergabe wird bereits bearbeitet. Bitte den geöffneten ChatGPT-Entwurf prüfen.',
  zu_viele: 'Es laufen bereits mehrere Übergaben. Bitte kurz warten und erneut versuchen.',
  abgelaufen: 'Die Übergabe ist abgelaufen. Bitte den Entwurf in ChatGPT prüfen und bei Bedarf erneut einfügen.',
  abgebrochen: 'Die Übergabe wurde gestoppt. Bereits eingefügter Text bleibt als Entwurf in ChatGPT.',
  anmeldung_noetig: 'Bitte in ChatGPT anmelden und die Übergabe danach erneut starten.',
  seite_nicht_bereit: 'ChatGPT ist noch nicht bereit. Bitte die Projektseite öffnen, die Anmeldung prüfen und erneut versuchen.',
  offline: 'ChatGPT konnte nicht geöffnet werden. Bitte die Verbindung prüfen und erneut versuchen.',
  entwurf_vorhanden: 'In ChatGPT steht bereits ein Entwurf. Er wurde nicht überschrieben. Bitte dort prüfen und dann erneut versuchen.',
  eingabefeld_fehlt: 'Das Eingabefeld in ChatGPT wurde nicht gefunden. Bitte die manuelle Alternative verwenden.',
  nicht_eingefuegt: 'Das Einfügen konnte nicht bestätigt werden. Bitte den Entwurf in ChatGPT prüfen und bei Bedarf die manuelle Alternative verwenden.',
  begleiter_fehler: 'Der Begleiter konnte den Text nicht einfügen. Bitte den Entwurf in ChatGPT prüfen oder die manuelle Alternative verwenden.',
});

export function uebergabeFehlerText(code) {
  return Object.hasOwn(FEHLER_TEXTE, code) ? FEHLER_TEXTE[code] : FEHLER_TEXTE.begleiter_fehler;
}

/**
 * Eigene IDs fuer Statusprobe und Auftrag. Ein Auftrag speichert nur ID und Timer,
 * nie den Text. Abbrechen entfernt die ID vor der Nachricht; spaete Antworten gelten nicht.
 */
export function erstelleProzessUebergabe({
  fenster = globalThis.window, zufall = fenster?.crypto || globalThis.crypto,
  setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout,
  zeitlimitMs = 45000, pruefzeitMs = 1500, onStatus = () => {},
} = {}) {
  const origin = fenster?.location?.origin;
  const verfuegbar = Boolean(fenster?.postMessage && fenster?.addEventListener && /^https?:\/\//.test(origin || '') && zufall?.getRandomValues);
  let ping = null;
  let aktiv = null;
  let bereit = false;
  let beendet = false;
  const melde = (status, code = null, aktion = 'einfuegen') => onStatus({ status, code, aktion });
  const sende = (aktion, id, daten = {}) => fenster.postMessage({ typ: UEBERGABE_TYP, version: 1, aktion, id, ...daten }, origin);
  function loeschePing() {
    if (ping) clearTimer(ping.timer);
    ping = null;
  }
  function loescheAuftrag() {
    const alt = aktiv;
    aktiv = null;
    if (alt) clearTimer(alt.timer);
    return alt;
  }
  function abbrechen() {
    const alt = loescheAuftrag();
    if (!alt) return false;
    try { sende('abbrechen', alt.id); } catch { /* Kein neuer Versuch mit verworfenem Kontext. */ }
    return true;
  }
  function antwort(event) {
    if (beendet || event.source !== fenster || event.origin !== origin) return;
    const d = event.data;
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.typ !== UEBERGABE_ANTWORT_TYP || d.version !== 1 || typeof d.id !== 'string') return;
    if (ping?.id === d.id && ['bereit', 'fehler'].includes(d.status)) {
      loeschePing();
      bereit = d.status === 'bereit';
      melde(d.status, typeof d.code === 'string' ? d.code : null, 'status');
    } else if (aktiv?.id === d.id && ['oeffnet', 'eingefuegt', 'fehler'].includes(d.status)) {
      if (d.status !== 'oeffnet') loescheAuftrag();
      melde(d.status, typeof d.code === 'string' ? d.code : null);
    }
  }
  if (verfuegbar) fenster.addEventListener('message', antwort);
  return {
    get laeuft() { return aktiv !== null; },
    get bereit() { return bereit; },
    pruefen() {
      if (beendet || aktiv) return false;
      if (!verfuegbar) { melde('fehler', 'browser_nicht_unterstuetzt', 'status'); return false; }
      loeschePing();
      bereit = false;
      const id = neueUebergabeId(zufall);
      ping = { id, timer: setTimer(() => {
        if (ping?.id !== id) return;
        loeschePing();
        melde('fehler', 'begleiter_fehlt', 'status');
      }, pruefzeitMs) };
      melde('prueft', null, 'status');
      try { sende('status', id); return true; }
      catch { loeschePing(); melde('fehler', 'begleiter_fehlt', 'status'); return false; }
    },
    einfuegen(ziel, text) {
      if (beendet || aktiv) return false;
      if (!verfuegbar || !bereit) { melde('fehler', 'begleiter_fehlt'); return false; }
      if (!istChatgptProjektZiel(ziel) || typeof text !== 'string' || !text.trim() || text.length > 200000) {
        melde('fehler', 'ungueltig'); return false;
      }
      const id = neueUebergabeId(zufall);
      aktiv = { id, timer: setTimer(() => {
        if (aktiv?.id !== id) return;
        abbrechen();
        melde('fehler', 'zeitlimit');
      }, zeitlimitMs) };
      melde('startet');
      try { sende('einfuegen', id, { ziel, text }); return true; }
      catch { loescheAuftrag(); melde('fehler', 'begleiter_fehler'); return false; }
    },
    abbrechen,
    beenden() {
      abbrechen();
      loeschePing();
      bereit = false;
      beendet = true;
      if (verfuegbar) fenster.removeEventListener('message', antwort);
    },
  };
}
