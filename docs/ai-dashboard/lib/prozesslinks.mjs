/** Gemeinsame, reine Validierung fuer private App-/Projektverknuepfungen. */
export const ANBIETER = Object.freeze(['chatgpt', 'claude', 'codex']);
export const PROZESSE = Object.freeze(['email', 'angebot', 'recherche']);
const HOSTS = Object.freeze({ chatgpt: 'chatgpt.com', claude: 'claude.ai' });
const STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f]/u;

export class ProzesslinksFehler extends Error {}

export function standardProzesslinks() {
  return {
    standardAnbieter: 'chatgpt',
    ziele: Object.fromEntries(PROZESSE.map(prozess => [prozess, Object.fromEntries(ANBIETER.map(anbieter => [anbieter, '']))])),
  };
}

function objekt(wert) {
  return wert !== null && typeof wert === 'object' && !Array.isArray(wert);
}

function festeFelder(wert, felder, bereich) {
  if (!objekt(wert) || Object.keys(wert).length !== felder.length || !felder.every(feld => Object.hasOwn(wert, feld))) {
    throw new ProzesslinksFehler(`${bereich}: bitte nur die vorgesehenen Felder ausfüllen.`);
  }
}

function dekodiert(wert) {
  try { return decodeURIComponent(wert); }
  catch { throw new ProzesslinksFehler('Die Adresse enthält eine ungültige Zeichenkodierung.'); }
}

function httpsZiel(url, host = null) {
  return url.protocol === 'https:' && (!host || url.hostname === host)
    && !url.username && !url.password && !url.port && !url.search && !url.hash;
}

function vollstaendigerPfad(wert) {
  return /^(?:\/|[a-zA-Z]:[\\/])/.test(wert);
}

/** Nur Navigation: Abfrage-/Fragmenttexte koennten Kundendaten weiterreichen. */
export function pruefeProzesslink(anbieter, eingabe) {
  if (!ANBIETER.includes(anbieter)) throw new ProzesslinksFehler('Unbekannter Anbieter.');
  if (typeof eingabe !== 'string' || eingabe.length > 2048 || STEUERZEICHEN.test(eingabe)) {
    throw new ProzesslinksFehler('Bitte eine gültige Projekt- oder App-Adresse eingeben.');
  }
  const wert = eingabe.trim();
  if (!wert) return '';
  if (/\s/u.test(wert) || STEUERZEICHEN.test(dekodiert(wert))) {
    throw new ProzesslinksFehler('Die Adresse enthält unerlaubte Leer- oder Steuerzeichen.');
  }
  let url;
  try { url = new URL(wert); }
  catch { throw new ProzesslinksFehler('Bitte eine vollständige Projekt- oder App-Adresse eingeben.'); }
  if (url.username || url.password || url.hash || url.port || wert.includes('\\')) {
    throw new ProzesslinksFehler('Adressen mit Zugangsdaten, Port oder Textfragment sind nicht erlaubt.');
  }
  if (anbieter === 'claude' && url.protocol === 'claude:') {
    if (url.hostname === 'claude.ai' && !url.search
      && (/^\/new$/.test(url.pathname) || /^\/project\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.pathname))) {
      return url.href;
    }
    const felder = [...url.searchParams];
    if (url.hostname === 'code' && url.pathname === '/new' && felder.length === 1
      && felder[0][0] === 'folder' && vollstaendigerPfad(felder[0][1]) && !STEUERZEICHEN.test(felder[0][1])) {
      return url.href;
    }
    throw new ProzesslinksFehler('Bitte eine Claude-App-Adresse für einen neuen Chat, ein Projekt oder einen lokalen Projektordner verwenden.');
  }
  if (anbieter !== 'codex') {
    if (!httpsZiel(url, HOSTS[anbieter])) {
      throw new ProzesslinksFehler(`Bitte eine HTTPS-Adresse von ${HOSTS[anbieter]} ohne Abfrage oder Textfragment verwenden.`);
    }
    return url.href;
  }

  // Offizielle App-Navigation. Nur Pfad/Repository-Ziel, nie Prompt oder Kontext.
  const routeErlaubt = (url.hostname === 'threads' && /^\/(?:new|[a-zA-Z0-9_-]+)$/.test(url.pathname))
    || (url.hostname === 'new' && url.pathname === '');
  if (url.protocol !== 'codex:' || !routeErlaubt) {
    throw new ProzesslinksFehler('Bitte eine Codex-App-Adresse für einen neuen oder vorhandenen Chat verwenden.');
  }
  if ((url.hostname === 'new' && !url.search)
    || (url.hostname === 'threads' && url.pathname !== '/new' && url.search)) {
    throw new ProzesslinksFehler('Projektpfad und Repository-Adresse sind nur für einen neuen Codex-Chat erlaubt. codex://new braucht eines dieser Ziele.');
  }
  const gesehen = new Set();
  for (const [feld, inhalt] of url.searchParams) {
    if (!['path', 'originUrl'].includes(feld) || gesehen.has(feld) || !inhalt || STEUERZEICHEN.test(inhalt)) {
      throw new ProzesslinksFehler('Codex-Links dürfen nur einen Projektpfad und eine Repository-Adresse enthalten.');
    }
    gesehen.add(feld);
    if (feld === 'path' && !vollstaendigerPfad(inhalt)) {
      throw new ProzesslinksFehler('Der Codex-Projektpfad muss vollständig sein.');
    }
    if (feld === 'originUrl') {
      let origin;
      try { origin = new URL(inhalt); } catch { /* klare Eingabemeldung unten */ }
      if (!origin || !httpsZiel(origin) || STEUERZEICHEN.test(dekodiert(inhalt))) {
        throw new ProzesslinksFehler('Die Repository-Adresse muss eine HTTPS-Adresse ohne Zugangsdaten oder Abfrage sein.');
      }
    }
  }
  return url.href;
}

export function pruefeProzesslinks(daten) {
  festeFelder(daten, ['standardAnbieter', 'ziele'], 'Prozessverknüpfungen');
  if (!ANBIETER.includes(daten.standardAnbieter)) throw new ProzesslinksFehler('Bitte einen vorgesehenen Standardanbieter wählen.');
  festeFelder(daten.ziele, PROZESSE, 'Prozesse');
  const ziele = {};
  for (const prozess of PROZESSE) {
    festeFelder(daten.ziele[prozess], ANBIETER, 'Anbieter');
    ziele[prozess] = Object.fromEntries(ANBIETER.map(anbieter => [anbieter, pruefeProzesslink(anbieter, daten.ziele[prozess][anbieter])]));
  }
  return { standardAnbieter: daten.standardAnbieter, ziele };
}

/** Fuer die Oberflaeche: ein leeres Ziel ist noch keine Verknuepfung. */
export function istProzessZiel(anbieter, wert) {
  try { return Boolean(pruefeProzesslink(anbieter, wert)); }
  catch { return false; }
}
