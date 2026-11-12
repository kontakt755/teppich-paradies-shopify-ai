#!/usr/bin/env node
/**
 * Ausschreibungen Bodenbelag im Umkreis Oranienburg (woechentlich, Vorschlag: montags 4:30):
 *
 *   npm run ausschreibungen:pruefen                 # TED + letzte 7 Tagesexporte + RSS bund.de/Berlin
 *   npm run ausschreibungen:pruefen -- --tage 14    # weiter zurueck
 *
 * Nur lesende Abrufe ohne Konto. Schreibt $TP_PRIVAT_DIR/ausschreibungen/status.json;
 * das Control Center zeigt neue Treffer als To-do (wie die Auslauf-Pruefung).
 * Bekanntmachungen des Vergabemarktplatzes Brandenburg kommen ueber oeffentlichevergabe.de
 * mit (am 12.11.2026 an Stichproben belegt), auch nationale unterhalb der EU-Schwelle.
 * Die Vergabeplattform Berlin steht dort nur zum Teil (20 von 50 Feed-Eintraegen) - deshalb
 * zusaetzlich ihr RSS-Feed und die Suche von service.bund.de (sammelt Bund, Laender, Kommunen).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tedAbfrage, ausTed, ausOcds, ausRss, bereinigen, neuSeit } from '../lib/ausschreibungen.mjs';
import { fileURLToPath } from 'node:url';

const TED = 'https://api.ted.europa.eu/v3/notices/search';
const EXPORT = 'https://oeffentlichevergabe.de/api/notice-exports';
// Die Suche von service.bund.de kennt nur ganze Woerter: je Suchwort ein Feed (alle offenen, neueste 100).
const BUND = wort => `https://www.service.bund.de/Content/DE/Ausschreibungen/Suche/Formular.html?nn=4641482&resultsPerPage=100&templateQueryString=${encodeURIComponent(wort)}&sortOrder=dateOfIssue_dt+desc&jobsrss=true`;
const BUND_WOERTER = ['Bodenbelagsarbeiten', 'Bodenbelagarbeiten', 'Bodenbelag', 'Bodenbeläge', 'Teppichboden', 'Linoleum', 'Parkett'];
const BERLIN = 'https://www.berlin.de/vergabeplattform/veroeffentlichungen/bekanntmachungen/feed.rss';

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

function holeRss(url, quelle) {
  // service.bund.de haengt gelegentlich ohne Antwort: kurz warten, einmal wiederholen (mehr nicht, AGENTS.md).
  const xml = execFileSync('curl', ['-s', '-f', '-L', '-m', '20', '--retry', '1', url], { encoding: 'utf8', maxBuffer: 20e6 });
  if (!xml.includes('<rss')) throw new Error('kein RSS in der Antwort');
  return ausRss(xml, quelle);
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
  for (const w of BUND_WOERTER) {
    try { treffer.push(...holeRss(BUND(w), 'service.bund.de')); } catch (e) { ausfaelle.push({ quelle: `service.bund.de ${w}`, grund: e.message.slice(0, 200) }); }
  }
  try { treffer.push(...holeRss(BERLIN, 'berlin.de')); } catch (e) { ausfaelle.push({ quelle: 'berlin.de', grund: e.message.slice(0, 200) }); }
  const ziel = a.ziel || path.join(privatDir(), 'ausschreibungen', 'status.json');
  let vorher = null;
  try { vorher = JSON.parse(fs.readFileSync(ziel, 'utf8')).treffer; } catch { /* erster Lauf */ }
  // Der Berliner Feed zeigt nur die neuesten 50 (rund 5 Tage): Treffer vom letzten Lauf bleiben bis zur Frist stehen.
  treffer.push(...(vorher || []).filter(t => t.quelle === 'berlin.de' && t.frist));
  treffer = bereinigen(treffer, heute);
  const stand = { geprueftAm: jetzt.toISOString(), tage: a.tage, treffer, neu: neuSeit(treffer, vorher), ausfaelle };
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, `${JSON.stringify(stand, null, 2)}\n`);
  for (const t of treffer) {
    const klein = [t.verfahren, t.wert ? `ca. ${Math.round(t.wert).toLocaleString('de-DE')} EUR` : '', t.umfang].filter(Boolean).join(' · ');
    console.log(`${t.frist || '?'}  ${t.titel} - ${t.auftraggeber} (${t.ort}) [${t.quelle}]${klein ? `\n            ${klein}` : ''}`);
  }
  console.log(`${treffer.length} offene Treffer, ${stand.neu.length} neu, ${ausfaelle.length} Ausfaelle -> ${ziel}`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
