/**
 * Ablage der Lieferantenbelege aus dem Firmenpostfach (AB, Lieferschein, Avis, Storno).
 *
 * Rein lokal unter $TP_PRIVAT_DIR/lieferbelege/belege.json - die Belege tragen Kundennamen
 * (Kommission) und gehoeren nie ins Repository. Zwei Schreiber: der Import des geplanten
 * Postfach-Laufs (operations/scripts/lieferbelege.mjs) und die Entscheidungen im Dashboard
 * (zuordnen, kein Shop-Auftrag, erledigt). Ein atomarer Rename allein verhindert keine
 * verlorenen Aenderungen zwischen zwei Prozessen - deshalb laeuft jedes Lesen-Aendern-Schreiben
 * unter einer Sperrdatei (mitSperre).
 *
 * In auftragsstatus.json wird hier nie geschrieben: ein Beleg ist ein Hinweis, der Stand einer
 * Position aendert sich nur ueber die vorhandenen, geprueften Wege (Einkauf, Versand-Dialog).
 *
 * Aufbau:
 *   belege   { <mailId>: { id, threadId, datum, von, domain, betreff, auszug, anhaenge, quelle,
 *              art, artGrund, refs, viewUrl, aufgenommenAm, entscheidung, erledigt, quittiert } }
 *            quittiert { <orderId>: { am, von } } - erledigt nur fuer diese Bestellung (Sammelbeleg)
 *   absender { <domain>: { art: 'kein_shop'|'lieferant', lieferant?, von, am } }
 *   geprueft { <mailId>: { am, grund } }   Mails ohne Beleg - nicht jeden Lauf neu ansehen
 *   laeufe   [ { am, gelesen, neu, uebersprungen, bereiche, vollstaendig } ]  (die letzten 60)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { klassifiziere, referenzen, domainVon, aktuellerTeil, ARTEN } from '../../docs/ai-dashboard/lib/lieferbelege.mjs';

export const LAEUFE_MAX = 60;
export const GEPRUEFT_MAX = 5000;
const SPERRE_WARTEN_MS = 3000;
const SPERRE_ALT_MS = 30_000;

export class LieferbelegFehler extends Error {}

export function lieferbelegePfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'lieferbelege', 'belege.json');
}

const leer = () => ({ version: 1, belege: {}, absender: {}, geprueft: {}, laeufe: [] });
const istObjekt = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Fehlende Datei = leer. Unlesbar oder beschaedigt = Fehler - nie still leer weiterschreiben. */
export function leseBelege(datei) {
  let roh;
  try { roh = fs.readFileSync(datei, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return leer();
    throw new LieferbelegFehler(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  // Nur eine FEHLENDE Datei ist leer. Eine leere oder unvollstaendige Datei ist ein Schaden -
  // sonst schriebe der naechste Import eine leere Ablage regulaer darueber (Codex-Review #1432).
  let d;
  try { d = JSON.parse(roh); } catch { throw new LieferbelegFehler(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`); }
  const belegeOk = istObjekt(d?.belege) && Object.values(d.belege).every(b => istObjekt(b) && typeof b.id === 'string');
  if (!istObjekt(d) || d.version !== 1 || !belegeOk || !istObjekt(d.absender) || !istObjekt(d.geprueft) || !Array.isArray(d.laeufe)) {
    throw new LieferbelegFehler(`${path.basename(datei)} ist beschädigt (ungültiger Aufbau) – bitte aus der Sicherung holen`);
  }
  return { version: 1, belege: d.belege, absender: d.absender, geprueft: d.geprueft, laeufe: d.laeufe };
}

function schreibe(datei, daten) {
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  const tmp = `${datei}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, datei);
}

function warte(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function lebt(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

function leseSperre(sperre) {
  try { return JSON.parse(fs.readFileSync(sperre, 'utf8')); } catch { return null; }
}

/**
 * Verwaiste Sperre entfernen - nur unter einer eigenen Raeum-Sperre, damit nicht zwei Prozesse
 * gleichzeitig pruefen und der langsamere die frische Sperre des schnelleren loescht
 * (Codex-Nachpruefung #1432). Gibt true zurueck, wenn ein neuer Versuch lohnt.
 */
function raeumeVerwaisteSperre(sperre) {
  const wache = `${sperre}.raeumen`;
  let fd;
  try { fd = fs.openSync(wache, 'wx'); } catch (e) {
    if (e?.code !== 'EEXIST') throw e;
    // Die Raeum-Sperre selbst bleibt nur nach einem Absturz mitten im Raeumen liegen.
    try { if (Date.now() - fs.statSync(wache).mtimeMs > SPERRE_ALT_MS) fs.unlinkSync(wache); } catch { /* schon weg */ }
    return false;
  }
  try {
    const st = fs.statSync(sperre);
    if (Date.now() - st.mtimeMs <= SPERRE_ALT_MS || lebt(leseSperre(sperre)?.pid)) return false;
    fs.unlinkSync(sperre);
    return true;
  } catch { return true; /* Sperre ist schon weg */ } finally {
    fs.closeSync(fd);
    try { fs.unlinkSync(wache); } catch { /* schon weg */ }
  }
}

/**
 * Lesen-Aendern-Schreiben unter einer Sperrdatei. Synchron und kurz: haelt die Sperre nur fuer
 * eine Aenderung. Die Sperre traegt Prozess und Kennung; uebernommen wird sie nur, wenn sie aelter
 * als 30 s ist UND ihr Prozess nicht mehr lebt, freigegeben nur die eigene (Codex-Review #1432).
 * @param {string} datei
 * @param {(daten: object) => any} aendern  aendert `daten` und gibt das Ergebnis zurueck
 */
export function mitSperre(datei, aendern) {
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  const sperre = `${datei}.lock`;
  const kennung = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const bis = Date.now() + SPERRE_WARTEN_MS;
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(sperre, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, kennung, am: new Date().toISOString() }));
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
      if (raeumeVerwaisteSperre(sperre)) continue;
      if (Date.now() > bis) throw new LieferbelegFehler('Die Belegablage ist gerade gesperrt (ein anderer Vorgang schreibt) – bitte gleich noch einmal versuchen.');
      warte(50);
    }
  }
  try {
    const daten = leseBelege(datei);
    const ergebnis = aendern(daten);
    schreibe(datei, daten);
    return ergebnis;
  } finally {
    fs.closeSync(fd);
    if (leseSperre(sperre)?.kennung === kennung) { try { fs.unlinkSync(sperre); } catch { /* schon weg */ } }
  }
}

/** Fuer den Postfach-Lauf: welche Mails kennen wir schon, nach welchen Absendern soll er suchen, seit wann? */
export function bekannt({ privatDir, domains = [] } = {}) {
  const d = leseBelege(lieferbelegePfad(privatDir));
  const letzter = d.laeufe.filter(l => l.vollstaendig).at(-1) || null;
  const bekannteDomains = new Set([...domains, ...Object.values(d.belege).map(b => b.domain).filter(Boolean)]);
  for (const [domain, e] of Object.entries(d.absender)) if (e?.art === 'kein_shop') bekannteDomains.delete(domain);
  return {
    // Zurueckgestellte (unbekannter Absender) bietet der Lauf erneut an, solange sie im Suchzeitraum liegen.
    mailIds: [...new Set([...Object.keys(d.belege), ...Object.entries(d.geprueft).filter(([, g]) => g?.grund !== GRUND_UNBEKANNT).map(([id]) => id)])].sort(),
    domains: [...bekannteDomains].sort(),
    letzterLauf: letzter?.am || null,
  };
}

const QUELLEN = ['label', 'lieferant', 'stichwort'];
/** Grund fuer Mails aus der Stichwortsuche von (noch) unbekannten Absendern - sie werden erneut geprueft. */
export const GRUND_UNBEKANNT = 'Absender ist kein bekannter Lieferant';

/** Gehoert die Domain (oder eine Oberdomain) zu den bekannten? "versand.lieferant-a.example" -> ja. */
function domainBekannt(domain, bekannte) {
  if (!domain) return false;
  for (const d of bekannte) if (domain === d || domain.endsWith(`.${d}`)) return true;
  return false;
}
const kurz = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Mails des Postfach-Laufs uebernehmen. Jede Mail einmal (mailId); was kein Beleg ist, merkt
 * sich `geprueft`. Eine Mail aus der Stichwortsuche (z. B. "storniert" im Posteingang) wird nur
 * uebernommen, wenn ihr Absender schon als Lieferant bekannt ist - sonst koennte die Stornomail
 * eines Kunden als Lieferantenstorno erscheinen.
 *
 * @param {object[]} mails  [{ id, threadId, von, datum, betreff, text, anhaenge, quelle, viewUrl }]
 * @param {object} opt
 * @param {string[]} [opt.lieferantenDomains]  Domains aus den Stammdaten
 * @param {object} [opt.lauf]  { bereiche: string[], vollstaendig: boolean } - was der Lauf gelesen hat
 */
export function uebernehmen(mails, { privatDir, jetzt = new Date(), lieferantenDomains = [], lauf = {} } = {}) {
  const datei = lieferbelegePfad(privatDir);
  return mitSperre(datei, (d) => {
    const ergebnis = { neu: [], uebersprungen: [] };
    const bekannteDomains = new Set([...lieferantenDomains, ...Object.values(d.belege).map(b => b.domain).filter(Boolean)]);
    const merke = (id, grund) => { d.geprueft[id] = { am: jetzt.toISOString(), grund }; ergebnis.uebersprungen.push({ mailId: id, grund }); };
    const liste = Array.isArray(mails) ? mails : [];
    for (const m of liste) {
      const id = kurz(m?.id, 100);
      if (!id) { ergebnis.uebersprungen.push({ mailId: null, grund: 'Mail ohne ID' }); continue; }
      // Zurueckgestellt (unbekannter Absender): erneut pruefen - vielleicht kennen wir ihn inzwischen.
      if (d.belege[id] || (d.geprueft[id] && d.geprueft[id].grund !== GRUND_UNBEKANNT)) continue;
      const domain = domainVon(m.von);
      const quelle = QUELLEN.includes(m.quelle) ? m.quelle : 'stichwort';
      const anhaenge = (Array.isArray(m.anhaenge) ? m.anhaenge : []).map(a => kurz(a, 160)).filter(Boolean).slice(0, 10);
      const mail = { von: m.von, betreff: m.betreff, text: m.text, anhaenge };
      const { art, grund } = klassifiziere(mail);
      if (!ARTEN.includes(art)) { merke(id, grund); continue; }
      if (quelle === 'stichwort' && !domainBekannt(domain, bekannteDomains)) { merke(id, GRUND_UNBEKANNT); continue; }
      delete d.geprueft[id];
      const datum = Number.isFinite(Date.parse(m.datum)) ? new Date(m.datum).toISOString() : jetzt.toISOString();
      d.belege[id] = {
        id, threadId: kurz(m.threadId, 100) || null, datum, von: kurz(m.von, 200), domain,
        betreff: kurz(m.betreff, 300), auszug: kurz(aktuellerTeil(m.text), 400), anhaenge, quelle,
        art, artGrund: grund, refs: referenzen(mail),
        viewUrl: /^https:\/\/mail\.google\.com\//.test(String(m.viewUrl || '')) ? String(m.viewUrl).slice(0, 500) : null,
        aufgenommenAm: jetzt.toISOString(), entscheidung: null, erledigt: null,
      };
      if (domain) bekannteDomains.add(domain);
      ergebnis.neu.push({ mailId: id, art });
    }
    // Aelteste Pruefvermerke zuerst weg - die Mails sind dann ohnehin aus dem Suchzeitraum.
    const geprueft = Object.entries(d.geprueft);
    if (geprueft.length > GEPRUEFT_MAX) d.geprueft = Object.fromEntries(geprueft.sort((a, b) => String(a[1].am).localeCompare(String(b[1].am))).slice(-GEPRUEFT_MAX));
    d.laeufe.push({
      am: jetzt.toISOString(), gelesen: liste.length, neu: ergebnis.neu.length, uebersprungen: ergebnis.uebersprungen.length,
      bereiche: (Array.isArray(lauf.bereiche) ? lauf.bereiche : []).map(b => kurz(b, 40)).slice(0, 10),
      vollstaendig: lauf.vollstaendig !== false,
    });
    d.laeufe = d.laeufe.slice(-LAEUFE_MAX);
    return ergebnis;
  });
}

export const AKTIONEN = Object.freeze(['zuordnen', 'ablehnen', 'kein_shop', 'loesen', 'erledigt', 'wieder_offen', 'absender_kein_shop', 'absender_zuruecksetzen']);

/**
 * Entscheidung aus dem Dashboard. Person kommt aus der Sitzung, nie aus dem Koerper.
 * @param {{aktion: string, mailId?: string, orderIds?: string[], domain?: string, notiz?: string}} p
 * @param {{person: string, jetzt?: Date, gueltigeOrderIds?: Set<string>, gueltigeLieferanten?: Set<string>,
 *   lieferantenJeAuftrag?: Map<string, string[]>, absenderLieferant?: (beleg: object) => string|null}} opt
 *   lieferantenJeAuftrag/absenderLieferant: ein gewaehlter Lieferant muss in jeder Bestellung
 *   Ware haben; ist der Absender unbekannt und hat eine Bestellung mehrere, muss einer gewaehlt sein.
 */
export function entscheide(datei, p = {}, { person, jetzt = new Date(), gueltigeOrderIds = null, gueltigeLieferanten = null, lieferantenJeAuftrag = null, absenderLieferant = null } = {}) {
  if (!person) throw new LieferbelegFehler('Person fehlt');
  const aktion = String(p.aktion || '');
  if (!AKTIONEN.includes(aktion)) throw new LieferbelegFehler(`Unbekannte Aktion „${kurz(aktion, 40)}“`);
  const am = jetzt.toISOString();
  return mitSperre(datei, (d) => {
    if (aktion.startsWith('absender_')) {
      const domain = String(p.domain || '').trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new LieferbelegFehler('Absender-Domain fehlt oder ist ungültig');
      if (aktion === 'absender_kein_shop') d.absender[domain] = { art: 'kein_shop', von: person, am };
      else delete d.absender[domain];
      return { domain, absender: d.absender[domain] || null };
    }
    const b = d.belege[String(p.mailId || '')];
    if (!b) throw new LieferbelegFehler('Beleg nicht gefunden');
    const notiz = kurz(p.notiz, 300) || null;
    if (aktion === 'zuordnen') {
      const ids = [...new Set((Array.isArray(p.orderIds) ? p.orderIds : []).map(String).filter(Boolean))].slice(0, 10);
      if (!ids.length) throw new LieferbelegFehler('Keine Bestellung gewählt');
      if (gueltigeOrderIds && ids.some(id => !gueltigeOrderIds.has(id))) throw new LieferbelegFehler('Bestellung nicht gefunden');
      // Von welchem Lieferanten? Nur noetig, wenn der Absender unbekannt ist und die Bestellung mehrere hat.
      const lieferant = p.lieferant ? String(p.lieferant).slice(0, 40) : null;
      if (lieferant && gueltigeLieferanten && !gueltigeLieferanten.has(lieferant)) throw new LieferbelegFehler('Lieferant nicht gefunden');
      if (lieferantenJeAuftrag) {
        // Sonst haengt der Beleg an keiner Zeile im Abgleich - ein Storno waere unsichtbar (Codex-Nachpruefung #1432).
        if (lieferant && ids.some(id => !(lieferantenJeAuftrag.get(id) || []).includes(lieferant))) throw new LieferbelegFehler('Dieser Lieferant liefert für die gewählte Bestellung nichts – bitte den richtigen wählen.');
        if (!lieferant && absenderLieferant && !absenderLieferant(b) && ids.some(id => (lieferantenJeAuftrag.get(id) || []).length > 1)) throw new LieferbelegFehler('Bitte wählen, von welchem Lieferanten der Beleg ist – die Bestellung hat Ware von mehreren.');
      }
      b.entscheidung = { art: 'zugeordnet', orderIds: ids, ...(lieferant ? { lieferant } : {}), von: person, am, vorher: b.entscheidung || null };
    } else if (aktion === 'ablehnen') {
      // "Passt nicht": diese Vorschlaege nicht wieder anbieten, die Mail bleibt offen.
      const ids = [...new Set((Array.isArray(p.orderIds) ? p.orderIds : []).map(String).filter(Boolean))].slice(0, 10);
      const schon = b.entscheidung?.art === 'abgelehnt' ? b.entscheidung.orderIds || [] : [];
      b.entscheidung = { art: 'abgelehnt', orderIds: [...new Set([...schon, ...ids])], von: person, am };
    } else if (aktion === 'kein_shop') b.entscheidung = { art: 'kein_shop', von: person, am, notiz };
    else if (aktion === 'loesen') b.entscheidung = null;
    // Mit orderId: nur fuer diese Bestellung quittiert (Sammelbeleg ueber mehrere Auftraege).
    else if (aktion === 'erledigt' && p.orderId) b.quittiert = { ...(b.quittiert || {}), [String(p.orderId).slice(0, 100)]: { am, von: person, notiz } };
    else if (aktion === 'erledigt') b.erledigt = { am, von: person, notiz };
    else if (aktion === 'wieder_offen') { b.erledigt = null; b.quittiert = null; }
    return { beleg: b };
  });
}
