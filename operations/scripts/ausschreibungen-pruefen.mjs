#!/usr/bin/env node
/**
 * Ausschreibungen Bodenbelag im Umkreis Oranienburg (woechentlich, Vorschlag: montags 4:30):
 *
 *   npm run ausschreibungen:pruefen                 # TED + letzte 7 Tagesexporte
 *   npm run ausschreibungen:pruefen -- --tage 14    # weiter zurueck
 *
 * Nur lesende Abrufe ohne Konto. Schreibt $TP_PRIVAT_DIR/ausschreibungen/status.json;
 * das Control Center zeigt neue Treffer als To-do (wie die Auslauf-Pruefung).
 * Berliner Vergabeplattform und Vergabemarktplatz Brandenburg haben keine filterbare
 * Schnittstelle - ihre Bekanntmachungen kommen ueber oeffentlichevergabe.de mit.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tedAbfrage, ausTed, ausOcds, bereinigen, neuSeit } from '../lib/ausschreibungen.mjs';
import { fileURLToPath } from 'node:url';

const TED = 'https://api.ted.europa.eu/v3/notices/search';
const EXPORT = 'https://oeffentlichevergabe.de/api/notice-exports';

function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

function argumente(argv) {
  const a = { tage: 7, ziel: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tage') a.tage = Number(argv[++i]);
    else if (argv[i] === '--ziel') a.ziel = argv[++i];
    else throw new Error(`Unbekanntes Argument: ${argv[i]}`);
  }
  if (!(a.tage > 0 && a.tage <= 31)) throw new Error('--tage muss zwischen 1 und 31 liegen');
  return a;
}

const tag = d => d.toISOString().slice(0, 10);

function holeTed(heute) {
  const out = execFileSync('curl', ['-s', '-m', '40', '-X', 'POST', TED, '-H', 'Content-Type: application/json',
    '-d', JSON.stringify(tedAbfrage(heute))], { encoding: 'utf8', maxBuffer: 20e6 });
  return ausTed(JSON.parse(out));
}

/** Tagesexport als ZIP laden und entpacken; Wochenenden ohne Export liefern einfach nichts. */
function holeTag(pubDay, tmp) {
  const zip = path.join(tmp, `${pubDay}.zip`);
  const code = execFileSync('curl', ['-s', '-m', '120', '-o', zip, '-w', '%{http_code}',
    `${EXPORT}?pubDay=${pubDay}&format=ocds.zip`], { encoding: 'utf8' });
  if (code !== '200' || !fs.existsSync(zip) || fs.statSync(zip).size < 100) return [];
  const ordner = path.join(tmp, pubDay);
  fs.mkdirSync(ordner, { recursive: true });
  execFileSync('unzip', ['-o', '-q', zip, '-d', ordner]);
  const treffer = [];
  for (const f of fs.readdirSync(ordner).filter(n => n.endsWith('.json'))) {
    try {
      for (const r of JSON.parse(fs.readFileSync(path.join(ordner, f), 'utf8')).releases || []) {
        const t = ausOcds(r);
        if (t) treffer.push(t);
      }
    } catch { /* kaputte Einzeldatei ueberspringen */ }
  }
  return treffer;
}

export async function main(argv = process.argv.slice(2)) {
  const a = argumente(argv);
  const jetzt = new Date();
  const heute = tag(jetzt);
  const ausfaelle = [];
  let treffer = [];
  try { treffer.push(...holeTed(heute)); } catch (e) { ausfaelle.push({ quelle: 'TED', grund: e.message.slice(0, 200) }); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ausschreibungen-'));
  try {
    for (let i = 1; i <= a.tage; i++) {
      const d = tag(new Date(jetzt.getTime() - i * 864e5));
      try { treffer.push(...holeTag(d, tmp)); } catch (e) { ausfaelle.push({ quelle: `oeffentlichevergabe.de ${d}`, grund: e.message.slice(0, 200) }); }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  treffer = bereinigen(treffer, heute);
  const ziel = a.ziel || path.join(privatDir(), 'ausschreibungen', 'status.json');
  let vorher = null;
  try { vorher = JSON.parse(fs.readFileSync(ziel, 'utf8')).treffer; } catch { /* erster Lauf */ }
  const stand = { geprueftAm: jetzt.toISOString(), tage: a.tage, treffer, neu: neuSeit(treffer, vorher), ausfaelle };
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, `${JSON.stringify(stand, null, 2)}\n`);
  for (const t of treffer) console.log(`${t.frist || '?'}  ${t.titel} - ${t.auftraggeber} (${t.ort}) [${t.quelle}]`);
  console.log(`${treffer.length} offene Treffer, ${stand.neu.length} neu, ${ausfaelle.length} Ausfaelle -> ${ziel}`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
