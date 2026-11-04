/**
 * Alte Arbeitsordner mit Bestellexporten (w-169, Inhaber 28.10.: 30-Tage-Loeschung).
 * Die Tagessicherung ist hier KEIN Rueckweg: Diese Ordner gehoeren nicht zu SICHERUNGSPFADE.
 * Darum zwei Stufen: faellige Ordner erst in den Papierkorb, von dort zurueck oder nach Ablauf
 * einer zweiten Frist endgueltig weg. Es zaehlt nur die feste Liste, nie ein Suchmuster.
 */
import fs from 'node:fs';
import path from 'node:path';

export const FRIST_TAGE = 30;
export const PAPIERKORB_TAGE = 7;
export const PAPIERKORB = 'altexporte-papierkorb';
export const PROTOKOLL = 'altexporte-protokoll.jsonl';
const TAG_MS = 86_400_000;

/** Liest einen Ordner, ohne Verknuepfungen zu folgen: juengste Aenderung, Groesse, Dateizahl. */
function ordnerStand(wurzel) {
  let juengsteMs = fs.lstatSync(wurzel).mtimeMs;
  let bytes = 0, dateien = 0;
  const offen = [wurzel];
  while (offen.length) {
    const eltern = offen.pop();
    for (const eintrag of fs.readdirSync(eltern, { withFileTypes: true })) {
      const pfad = path.join(eltern, eintrag.name);
      const st = fs.lstatSync(pfad);
      juengsteMs = Math.max(juengsteMs, st.mtimeMs);
      if (eintrag.isDirectory()) offen.push(pfad);
      else { bytes += st.size; dateien += 1; }
    }
  }
  return { juengsteMs, bytes, dateien };
}

/** Darf der Name ueberhaupt behandelt werden? Nur direkte Unterordner, nie gesicherte Betriebsdaten. */
export function nameSperre(name, geschuetzt = []) {
  if (typeof name !== 'string' || !name || name.startsWith('.') || name.includes('/') || name.includes('\\')) return 'kein einfacher Ordnername';
  if (name === PAPIERKORB) return 'Papierkorb selbst';
  if (geschuetzt.some(p => p.split('/')[0] === name)) return 'gehoert zur Tagessicherung';
  return null;
}

/**
 * Stand je Ordner der Liste, aendert nichts.
 * @returns {{name, stand: 'faellig'|'zu-jung'|'fehlt'|'gesperrt', grund?, juengste?, bytes?, dateien?, faelligAb?}[]}
 */
export function pruefeListe({ privatDir, liste, geschuetzt = [], jetzt = new Date(), fristTage = FRIST_TAGE }) {
  return liste.map(name => {
    const sperre = nameSperre(name, geschuetzt);
    if (sperre) return { name, stand: 'gesperrt', grund: sperre };
    const pfad = path.join(privatDir, name);
    let st;
    try { st = fs.lstatSync(pfad); } catch (e) { if (e.code === 'ENOENT') return { name, stand: 'fehlt' }; throw e; }
    if (!st.isDirectory()) return { name, stand: 'gesperrt', grund: st.isSymbolicLink() ? 'Verknuepfung' : 'kein Ordner' };
    const { juengsteMs, bytes, dateien } = ordnerStand(pfad);
    const faelligAbMs = juengsteMs + fristTage * TAG_MS;
    return {
      name, stand: jetzt.getTime() >= faelligAbMs ? 'faellig' : 'zu-jung', bytes, dateien,
      juengste: new Date(juengsteMs).toISOString(), faelligAb: new Date(faelligAbMs).toISOString(),
    };
  });
}

function protokolliere(privatDir, eintrag) {
  fs.appendFileSync(path.join(privatDir, PROTOKOLL), `${JSON.stringify(eintrag)}\n`, { mode: 0o600 });
}

/** Stufe 1: faellige Ordner in den Papierkorb (Umbenennen, gleiche Platte). Nur Eigentuemer darf lesen. */
export function inPapierkorb({ privatDir, befund, jetzt = new Date() }) {
  const korb = path.join(privatDir, PAPIERKORB);
  fs.mkdirSync(korb, { recursive: true, mode: 0o700 });
  fs.chmodSync(korb, 0o700);
  const verschoben = [];
  for (const b of befund.filter(x => x.stand === 'faellig')) {
    const ziel = path.join(korb, b.name);
    if (fs.existsSync(ziel)) throw new Error(`Liegt schon im Papierkorb: ${b.name}`);
    fs.renameSync(path.join(privatDir, b.name), ziel);
    // Die Aenderungszeit des Ordners zaehlt ab jetzt als Beginn der Papierkorb-Frist.
    fs.utimesSync(ziel, jetzt, jetzt);
    protokolliere(privatDir, { am: jetzt.toISOString(), was: 'papierkorb', name: b.name, bytes: b.bytes, dateien: b.dateien });
    verschoben.push(b.name);
  }
  return verschoben;
}

/** Rueckweg: Ordner aus dem Papierkorb an seinen alten Platz. */
export function zurueckholen({ privatDir, name, jetzt = new Date() }) {
  const sperre = nameSperre(name);
  if (sperre) throw new Error(`${name}: ${sperre}`);
  const von = path.join(privatDir, PAPIERKORB, name), nach = path.join(privatDir, name);
  if (!fs.existsSync(von)) throw new Error(`Nicht im Papierkorb: ${name}`);
  if (fs.existsSync(nach)) throw new Error(`Am alten Platz liegt schon etwas: ${name}`);
  fs.renameSync(von, nach);
  protokolliere(privatDir, { am: jetzt.toISOString(), was: 'zurueck', name });
}

/** Papierkorb-Inhalt mit Ablauf der zweiten Frist, aendert nichts. */
export function papierkorbStand({ privatDir, jetzt = new Date(), tage = PAPIERKORB_TAGE }) {
  const korb = path.join(privatDir, PAPIERKORB);
  if (!fs.existsSync(korb)) return [];
  return fs.readdirSync(korb, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => {
    const seit = fs.lstatSync(path.join(korb, e.name)).mtimeMs;
    return { name: e.name, seit: new Date(seit).toISOString(), abgelaufen: jetzt.getTime() >= seit + tage * TAG_MS };
  });
}

/** Stufe 2: nur abgelaufene Eintraege des Papierkorbs entfernen. Nicht rueckholbar. */
export function papierkorbLeeren({ privatDir, jetzt = new Date(), tage = PAPIERKORB_TAGE }) {
  const entfernt = [];
  for (const e of papierkorbStand({ privatDir, jetzt, tage }).filter(x => x.abgelaufen)) {
    fs.rmSync(path.join(privatDir, PAPIERKORB, e.name), { recursive: true });
    protokolliere(privatDir, { am: jetzt.toISOString(), was: 'endgueltig', name: e.name });
    entfernt.push(e.name);
  }
  return entfernt;
}
