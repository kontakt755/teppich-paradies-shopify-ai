/** Gemeinsame private Druckliste: unveraenderliche Etiketten und explizite Druckreservierungen. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = ['offen', 'in_druck', 'gedruckt', 'entfernt'];
const AKTIONEN = ['hinzufuegen', 'bestellung_hinzufuegen', 'reservieren', 'freigeben', 'erledigen', 'entfernen'];
const SPERRE_ALT_MS = 30_000;
const objekt = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = v => typeof v === 'string' && UUID.test(v);
const text = (v, max, leer = false) => typeof v === 'string' && v.length <= max && (leer || v.trim().length > 0);
const datum = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const revision = v => Number.isSafeInteger(v) && v > 0;
const kopie = v => structuredClone(v);

export class MusterDrucklisteFehler extends Error {
  constructor(status, message) { super(message); this.name = 'MusterDrucklisteFehler'; this.status = status; this.statusCode = status; }
}
const fehler = (status, meldung) => { throw new MusterDrucklisteFehler(status, meldung); };
const ablageFehler = () => fehler(500, 'Die Druckliste ist nicht lesbar oder beschädigt. Es wurde nichts verändert. Bitte die Ablage prüfen oder aus der Sicherung wiederherstellen.');

export function musterDrucklistePfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'muster-druckliste.json');
}

function etikettGueltig(e) {
  if (!objekt(e) || !text(e.serie, 300) || !text(e.farbe, 300) || !text(e.sku, 200, true) || !text(e.url, 1000)
    || !Array.isArray(e.technik) || e.technik.length > 8 || !Array.isArray(e.fehlt) || e.fehlt.length) return false;
  try { const url = new URL(e.url); if (url.protocol !== 'https:' || url.username || url.password) return false; } catch { return false; }
  return e.technik.every(z => objekt(z) && text(z.label, 160) && text(z.wert, 500));
}

function snapshotGueltig(e) {
  return objekt(e) && uuid(e.id) && text(e.produktHandle, 240) && /^[a-z0-9][a-z0-9-]*$/i.test(e.produktHandle)
    && text(e.produktTitel, 500) && text(e.bezeichnung, 500) && etikettGueltig(e.etikett)
    && Number.isInteger(e.anzahl) && e.anzahl >= 1 && e.anzahl <= 20;
}

const quellKey = q => JSON.stringify([q.orderId, q.lineItemId]);
function quelleGueltig(q) {
  return objekt(q) && q.art === 'musterbestellung' && text(q.orderId, 200) && text(q.lineItemId, 200)
    && text(q.orderName, 100) && Number.isInteger(q.bestellmenge) && q.bestellmenge >= 1 && q.bestellmenge <= 20
    && Object.keys(q).every(k => ['art', 'orderId', 'lineItemId', 'orderName', 'bestellmenge'].includes(k));
}

/** Bestellreferenz bleibt ausserhalb des Druckbilds; ein alter Stand wird nie still ersetzt. */
export function gleicheBestellungsVormerkung(alt, neu) {
  return !!alt?.quelle && !!neu?.quelle && quellKey(alt.quelle) === quellKey(neu.quelle)
    && alt.quelle.bestellmenge === neu.quelle.bestellmenge && hash(alt.etikett) === hash(neu.etikett);
}

function druckauftragGueltig(d) { return objekt(d) && uuid(d.id) && text(d.von, 200) && datum(d.am); }
function eintragGueltig(e) {
  if (!snapshotGueltig(e) || !STATUS.includes(e.status) || !revision(e.revision)
    || !datum(e.erstelltAm) || !text(e.erstelltVon, 200) || !datum(e.geaendertAm) || !text(e.geaendertVon, 200)
    || (e.quelle !== undefined && (!quelleGueltig(e.quelle) || e.anzahl > e.quelle.bestellmenge))) return false;
  if (e.druckauftrag !== null && !druckauftragGueltig(e.druckauftrag)) return false;
  if (e.status === 'in_druck' && !e.druckauftrag) return false;
  if (['offen', 'entfernt'].includes(e.status) && e.druckauftrag) return false;
  if (e.status === 'gedruckt' && (!datum(e.gedrucktAm) || !text(e.gedrucktVon, 200))) return false;
  if (e.status === 'entfernt' && (!datum(e.entferntAm) || !text(e.entferntVon, 200))) return false;
  return true;
}

function leseAblage(file) {
  let roh;
  try { roh = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return { schema: 1, eintraege: [], vorgaenge: [] };
    return ablageFehler();
  }
  let daten;
  try { daten = JSON.parse(roh); } catch { return ablageFehler(); }
  if (!objekt(daten) || daten.schema !== 1 || !Array.isArray(daten.eintraege) || !Array.isArray(daten.vorgaenge)
    || daten.vorgaenge.length > 1000 || !daten.eintraege.every(eintragGueltig)
    || new Set(daten.eintraege.map(e => e.id)).size !== daten.eintraege.length
    || !daten.vorgaenge.every(v => objekt(v) && uuid(v.id) && /^[a-f0-9]{64}$/.test(v.hash) && datum(v.am))
    || new Set(daten.vorgaenge.map(v => v.id)).size !== daten.vorgaenge.length) return ablageFehler();
  const quellen = daten.eintraege.filter(e => e.quelle).map(e => quellKey(e.quelle));
  if (new Set(quellen).size !== quellen.length) return ablageFehler();
  return daten;
}

/** GET ist rein lesend; nur ENOENT bedeutet eine noch leere Liste. */
export function leseMusterDruckliste({ privatDir } = {}) {
  const daten = leseAblage(musterDrucklistePfad(privatDir));
  return { schema: 1, eintraege: daten.eintraege };
}

function actorText(actor) {
  const von = typeof actor === 'string' ? actor : actor?.name || actor?.anzeigename || actor?.id;
  if (!text(von, 200)) fehler(400, 'Der angemeldete Mitarbeiter fehlt.');
  return von;
}

function normalisiereEingabe({ aktion, vorgangId, eintrag, eintraege, druckauftragId }) {
  if (!AKTIONEN.includes(aktion) || !uuid(vorgangId)) fehler(400, 'Aktion oder Vorgangskennung ist ungültig.');
  vorgangId = vorgangId.toLowerCase();
  if (aktion === 'bestellung_hinzufuegen') {
    if (eintrag !== undefined || druckauftragId !== undefined || !Array.isArray(eintraege) || !eintraege.length || eintraege.length > 100
      || !eintraege.every(e => snapshotGueltig(e) && quelleGueltig(e.quelle) && e.anzahl <= e.quelle.bestellmenge)
      || new Set(eintraege.map(e => e.id.toLowerCase())).size !== eintraege.length
      || new Set(eintraege.map(e => quellKey(e.quelle))).size !== eintraege.length) fehler(400, 'Die Musteretiketten dieser Bestellung sind unvollständig oder ungültig.');
    return { aktion, vorgangId, eintraege: eintraege.map(({ id, produktHandle, produktTitel, bezeichnung, etikett, anzahl, quelle }) => ({ id: id.toLowerCase(), produktHandle, produktTitel, bezeichnung, etikett: kopie(etikett), anzahl, quelle: kopie(quelle) })).sort((a, b) => a.id.localeCompare(b.id)) };
  }
  if (aktion === 'hinzufuegen') {
    if (!snapshotGueltig(eintrag) || eintraege !== undefined || druckauftragId !== undefined) fehler(400, 'Das Etikett ist unvollständig oder die Anzahl liegt nicht zwischen 1 und 20.');
    const { id, produktHandle, produktTitel, bezeichnung, etikett, anzahl } = eintrag;
    return { aktion, vorgangId, eintrag: { id: id.toLowerCase(), produktHandle, produktTitel, bezeichnung, etikett: kopie(etikett), anzahl } };
  }
  if (eintrag !== undefined || !Array.isArray(eintraege) || !eintraege.length || eintraege.length > 100
    || !eintraege.every(e => objekt(e) && uuid(e.id) && revision(e.revision))
    || new Set(eintraege.map(e => e.id.toLowerCase())).size !== eintraege.length) fehler(400, 'Bitte eine gültige Auswahl mit aktuellem Stand übergeben.');
  if (aktion === 'entfernen' ? druckauftragId !== undefined : !uuid(druckauftragId)) fehler(400, 'Die Druckauftragskennung ist ungültig.');
  const auswahl = eintraege.map(({ id, revision }) => ({ id: id.toLowerCase(), revision })).sort((a, b) => a.id.localeCompare(b.id));
  return { aktion, vorgangId, eintraege: auswahl, ...(druckauftragId ? { druckauftragId: druckauftragId.toLowerCase() } : {}) };
}

function sortiert(v) {
  if (Array.isArray(v)) return v.map(sortiert);
  if (!objekt(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortiert(v[k])]));
}
const hash = v => createHash('sha256').update(JSON.stringify(sortiert(v))).digest('hex');

function schreibeAtomar(file, daten) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(daten, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, file);
  } catch {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* urspruenglicher Fehler bleibt */ } }
    try { fs.unlinkSync(tmp); } catch { /* keine fremde Datei entfernen */ }
    fehler(500, 'Die Druckliste konnte nicht gespeichert werden. Bitte erneut laden und den Stand prüfen.');
  }
}

/** Vor dem atomaren Beanspruchen vollstaendig schreiben: auch ein Absturz erzeugt keine leere Sperre. */
function beansprucheSperre(lock) {
  const besitz = { pid: process.pid, kennung: randomUUID(), am: new Date().toISOString() };
  const tmp = `${lock}.${besitz.kennung}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(besitz), { flag: 'wx', mode: 0o600 });
    fs.linkSync(tmp, lock);
  } finally { try { fs.unlinkSync(tmp); } catch { /* eine nicht erzeugte Datei bleibt unangetastet */ } }
  return besitz;
}

function leseSperre(lock) {
  try {
    const roh = fs.readFileSync(lock, 'utf8'), st = fs.statSync(lock), daten = JSON.parse(roh);
    return { roh, st, daten };
  } catch { return null; }
}

function verwaist(sperre) {
  if (!sperre || Date.now() - sperre.st.mtimeMs <= SPERRE_ALT_MS || !Number.isInteger(sperre.daten?.pid)
    || sperre.daten.pid <= 0 || !uuid(sperre.daten.kennung)) return false;
  try { process.kill(sperre.daten.pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
}

function entferneSperre(lock, vorher) {
  const jetzt = leseSperre(lock);
  if (!jetzt || jetzt.roh !== vorher.roh || jetzt.st.ino !== vorher.st.ino || jetzt.st.dev !== vorher.st.dev) return false;
  fs.unlinkSync(lock);
  return true;
}

function eigeneSperreFreigeben(lock, besitz) {
  try {
    const sperre = leseSperre(lock);
    if (sperre?.daten?.kennung === besitz.kennung && sperre.daten.pid === besitz.pid) entferneSperre(lock, sperre);
  } catch { /* eine inzwischen fremde/fehlende Sperre respektieren */ }
}

/** Verwaiste Dateisperren raeumen; niemals Eintraege mit Status in_druck freigeben. */
function raeumeVerwaisteSperre(lock) {
  const wache = `${lock}.raeumen`;
  let besitz;
  for (let versuch = 0; versuch < 2; versuch++) {
    try { besitz = beansprucheSperre(wache); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const alteWache = leseSperre(wache);
      if (versuch || !verwaist(alteWache) || !entferneSperre(wache, alteWache)) return false;
    }
  }
  try {
    const alteSperre = leseSperre(lock);
    return verwaist(alteSperre) && entferneSperre(lock, alteSperre);
  } finally { eigeneSperreFreigeben(wache, besitz); }
}

/** Kurzer exklusiver Dateilock, prozessuebergreifend und ohne asynchronen Mutationsabschnitt. */
function mitSperre(file, fn) {
  const lock = `${file}.lock`;
  let besitz;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    for (let versuch = 0; versuch < 2; versuch++) {
      try { besitz = beansprucheSperre(lock); break; } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        if (!versuch && raeumeVerwaisteSperre(lock)) continue;
        fehler(409, 'Die Druckliste wird gerade geändert. Bitte erneut versuchen.');
      }
    }
  } catch (e) {
    if (e instanceof MusterDrucklisteFehler) throw e;
    fehler(500, 'Die Druckliste kann gerade nicht gespeichert werden.');
  }
  try { return fn(); } finally { eigeneSperreFreigeben(lock, besitz); }
}

/**
 * Alle Statuswechsel gelten fuer exakte Revisionen, gemeinsam oder gar nicht.
 * Nur ein bestaetigter Aufruf von `erledigen` markiert gedruckt; Hardware wird hier nie angesprochen.
 */
export function aendereMusterDruckliste({ privatDir, actor, now = new Date(), ...eingabe } = {}) {
  const von = actorText(actor), am = new Date(typeof now === 'function' ? now() : now).toISOString();
  const auftrag = normalisiereEingabe(eingabe), vorgangsHash = hash(auftrag);
  const file = musterDrucklistePfad(privatDir);
  return mitSperre(file, () => {
    const daten = leseAblage(file);
    const vorher = daten.vorgaenge.find(v => v.id === auftrag.vorgangId);
    if (vorher) {
      if (vorher.hash !== vorgangsHash) fehler(409, 'Diese Vorgangskennung wurde bereits für eine andere Änderung verwendet. Bitte die Liste erneut laden.');
      return { schema: 1, eintraege: daten.eintraege, wiederholt: true, ...(auftrag.aktion === 'bestellung_hinzufuegen' ? { neu: 0, bereits: auftrag.eintraege.length } : {}) };
    }
    let neu = 0, bereits = 0;
    if (auftrag.aktion === 'hinzufuegen') {
      if (daten.eintraege.some(e => e.id === auftrag.eintrag.id)) fehler(409, 'Dieser Eintrag ist bereits vorhanden. Bitte die Liste erneut laden.');
      daten.eintraege.push({ ...auftrag.eintrag, status: 'offen', revision: 1, erstelltAm: am, erstelltVon: von, geaendertAm: am, geaendertVon: von, druckauftrag: null });
    } else if (auftrag.aktion === 'bestellung_hinzufuegen') {
      // Erst alle Quellen pruefen, dann gemeinsam schreiben: ein Konflikt laesst alles unveraendert.
      const neue = [];
      for (const e of auftrag.eintraege) {
        const alt = daten.eintraege.find(a => a.quelle && quellKey(a.quelle) === quellKey(e.quelle));
        if (alt) {
          if (!gleicheBestellungsVormerkung(alt, e)) fehler(409, 'Bestellung oder Produktdaten wurden seit dem Vormerken geändert. Bitte die bestehende Druckliste prüfen.');
          bereits++;
        } else {
          if (daten.eintraege.some(a => a.id === e.id)) fehler(409, 'Diese Etikettenkennung ist bereits vergeben. Bitte die Druckliste prüfen.');
          neue.push(e);
        }
      }
      neu = neue.length;
      daten.eintraege.push(...neue.map(e => ({ ...e, status: 'offen', revision: 1, erstelltAm: am, erstelltVon: von, geaendertAm: am, geaendertVon: von, druckauftrag: null })));
    } else {
      const auswahl = auftrag.eintraege.map(ref => {
        const e = daten.eintraege.find(e => e.id === ref.id);
        if (!e || e.revision !== ref.revision) fehler(409, 'Die Auswahl hat sich inzwischen geändert. Bitte die Liste erneut laden.');
        if (['reservieren', 'entfernen'].includes(auftrag.aktion) ? e.status !== 'offen' : e.status !== 'in_druck' || e.druckauftrag?.id !== auftrag.druckauftragId) {
          fehler(409, 'Ein Eintrag ist bereits reserviert oder abgeschlossen. Bitte die Liste erneut laden.');
        }
        return e;
      });
      if (auswahl.reduce((n, e) => n + e.anzahl, 0) > 100) fehler(400, 'Bitte höchstens 100 Etiketten auf einmal auswählen.');
      if (auftrag.aktion === 'reservieren' && daten.eintraege.some(e => e.druckauftrag?.id === auftrag.druckauftragId)) {
        fehler(409, 'Diese Druckauftragskennung wird bereits verwendet. Bitte die Liste erneut laden.');
      }
      for (const e of auswahl) {
        e.revision++; e.geaendertAm = am; e.geaendertVon = von;
        if (auftrag.aktion === 'reservieren') { e.status = 'in_druck'; e.druckauftrag = { id: auftrag.druckauftragId, von, am }; }
        if (auftrag.aktion === 'freigeben') { e.status = 'offen'; e.druckauftrag = null; }
        if (auftrag.aktion === 'erledigen') { e.status = 'gedruckt'; e.gedrucktAm = am; e.gedrucktVon = von; }
        if (auftrag.aktion === 'entfernen') { e.status = 'entfernt'; e.entferntAm = am; e.entferntVon = von; }
      }
    }
    daten.vorgaenge = [...daten.vorgaenge, { id: auftrag.vorgangId, hash: vorgangsHash, am }].slice(-1000);
    schreibeAtomar(file, daten);
    return { schema: 1, eintraege: daten.eintraege, wiederholt: false, ...(auftrag.aktion === 'bestellung_hinzufuegen' ? { neu, bereits } : {}) };
  });
}
