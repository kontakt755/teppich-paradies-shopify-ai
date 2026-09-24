#!/usr/bin/env node
/**
 * Sichtpruefung des Control Centers im echten Browser - ohne echte Daten zu veraendern.
 *
 *   npm run dashboard:pruefen                          # alle Ansichten, Desktop + Handy
 *   npm run dashboard:pruefen -- --ansichten heute,einkauf
 *   npm run dashboard:pruefen -- --aus /tmp/pruefung   # Screenshots dorthin
 *   npm run dashboard:pruefen -- --offen                # Instanz nach dem Lauf offen lassen
 *
 * Ablauf:
 *  1. Kopie der privaten Daten ($TP_PRIVAT_DIR, Standard ~/teppich-paradies-analyse) in ein
 *     Temp-Verzeichnis. Grosse, nur gelesene Exporte werden verlinkt, alles, was das Dashboard
 *     beschreibt (Auftragsstatus), wird kopiert. dashboard-passwort.txt wird nie angefasst.
 *  2. Eigene Instanz von scripts/serve-dashboard.mjs auf einem freien Port, nur 127.0.0.1,
 *     mit einem Wegwerf-Passwort (nicht dem echten).
 *  3. Puppeteer: je Ansicht Screenshot (1440 px und 390 px), JS-Fehler, seitliches Scrollen
 *     (Elemente breiter als der Bildschirm ausserhalb von Scroll-Containern), Seitenhoehe.
 *  4. Bericht nach <aus>/bericht.json und als Tabelle auf die Konsole.
 *     Exit-Code 1 bei JS-Fehlern oder seitlichem Scrollen.
 *
 * Klicktests (Status setzen, Dialoge) gehoeren ebenfalls gegen diese Kopie - mit --offen
 * bleibt die Instanz dafuer stehen; Adresse und Passwort stehen dann in der Ausgabe.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ALLE_ANSICHTEN = ['heute', 'einkauf', 'einkauf?tab=produktdaten', 'arbeit', 'lexikon', 'freigaben', 'ratgeber', 'bereiche', 'insights', 'aktivitaet'];
const HANDY_ANSICHTEN = ['heute', 'einkauf', 'arbeit'];
// Grosse Exporte, die das Dashboard nur liest: verlinken statt kopieren.
const NUR_LESEN = ['einkauf-dryrun', 'einkauf-klaerung', 'lexikon'];
// Klein oder beschreibbar: kopieren, damit Klicktests nie die echten Dateien treffen.
const KOPIEREN = ['bestelluebersicht', 'kennzahlen', 'aktualisierung.json', 'auftragsstatus.json'];

function argumente(argv) {
  const a = { ansichten: null, aus: null, offen: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--ansichten') a.ansichten = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--aus') a.aus = argv[++i];
    else if (k === '--offen') a.offen = true;
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  return a;
}

function freierPort() {
  return new Promise((ok, fehler) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
    s.on('error', fehler);
  });
}

function datenKopie(quelle) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-daten-'));
  for (const n of NUR_LESEN) if (fs.existsSync(path.join(quelle, n))) fs.symlinkSync(path.join(quelle, n), path.join(ziel, n));
  for (const n of KOPIEREN) if (fs.existsSync(path.join(quelle, n))) fs.cpSync(path.join(quelle, n), path.join(ziel, n), { recursive: true });
  return ziel;
}

async function warteAufServer(url, ms = 20_000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* startet noch */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server unter ${url} antwortet nicht`);
}

async function main() {
  const args = argumente(process.argv.slice(2));
  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; }
  catch { throw new Error('puppeteer fehlt - im Repository-Root `npm install` ausfuehren (Worktree: node_modules verlinken).'); }

  const quelle = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
  const daten = datenKopie(quelle);
  const aus = args.aus || fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-pruefung-'));
  fs.mkdirSync(aus, { recursive: true });
  const port = await freierPort();
  const passwort = randomBytes(12).toString('hex');
  const basis = `http://127.0.0.1:${port}`;

  // Ausgabe in eine Datei statt in eine Pipe: mit --offen muss der Server das Ende dieses
  // Prozesses ueberleben (eine Pipe zum beendeten Elternprozess wuerde ihn mitreissen).
  const logDatei = path.join(daten, 'server.log');
  const logFd = fs.openSync(logDatei, 'a');
  const server = spawn(process.execPath, [path.join(REPO, 'scripts/serve-dashboard.mjs')], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), TP_DASHBOARD_HOST: '127.0.0.1', TP_PRIVAT_DIR: daten, TP_DASHBOARD_PASSWORT: passwort },
    stdio: ['ignore', logFd, logFd],
    detached: args.offen,
  });
  if (args.offen) server.unref();
  const serverLog = () => { try { return fs.readFileSync(logDatei, 'utf8'); } catch { return ''; } };

  const aufraeumen = () => {
    if (!args.offen) { server.kill(); fs.rmSync(daten, { recursive: true, force: true }); }
  };
  // Auch bei Fehlern im Lauf: Instanz beenden und Datenkopie loeschen (ausser mit --offen).
  process.on('exit', aufraeumen);
  process.on('SIGINT', () => { args.offen = false; process.exit(130); });

  const ergebnisse = [];
  let browser;
  try {
    await warteAufServer(`${basis}/login`);
    browser = await puppeteer.launch({ headless: true });
    const seite = await browser.newPage();
    const fehler = [];
    seite.on('pageerror', e => fehler.push(`pageerror: ${e.message}`));
    seite.on('console', m => { if (m.type() === 'error') fehler.push(`console: ${m.text()}`); });
    await seite.goto(`${basis}/login`);
    const login = await seite.evaluate(async pw => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passwort: pw }) })).status, passwort);
    if (login !== 200) throw new Error(`Anmeldung an der Pruef-Instanz fehlgeschlagen (HTTP ${login})`);

    const ansichten = args.ansichten || ALLE_ANSICHTEN;
    for (const [breite, hoehe, geraet, liste] of [[1440, 900, 'desktop', ansichten], [390, 844, 'handy', ansichten.filter(v => HANDY_ANSICHTEN.includes(v.split('?')[0]) || args.ansichten)]]) {
      await seite.setViewport({ width: breite, height: hoehe, deviceScaleFactor: 1 });
      for (const ansicht of liste) {
        fehler.length = 0;
        await seite.goto(`${basis}/#/${ansicht}`, { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 900));
        const name = `${geraet}-${ansicht.replace(/[?=&]/g, '_')}`;
        const datei = path.join(aus, `${name}.png`);
        await seite.screenshot({ path: datei, fullPage: true });
        const messung = await seite.evaluate(() => ({
          hoehe: document.documentElement.scrollHeight,
          ueberstand: [...document.querySelectorAll('body *')]
            .filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-scroll,.table-wrap,.tabs,.kanban,.chips'))
            .slice(0, 5).map(e => {
              // Pfad ueber die naechsten Vorfahren mit Klasse/ID, damit die Stelle auffindbar ist.
              const teile = [];
              for (let n = e; n && n !== document.body && teile.length < 4; n = n.parentElement) {
                const k = n.id ? `#${n.id}` : n.classList.length ? `.${[...n.classList].join('.')}` : '';
                teile.unshift(`${n.tagName.toLowerCase()}${k}`);
              }
              return `${teile.join(' > ')} (${Math.round(e.getBoundingClientRect().right)} px)`;
            }),
        }));
        ergebnisse.push({ geraet, ansicht, datei, hoehe: messung.hoehe, ueberstand: messung.ueberstand, fehler: [...fehler] });
      }
    }
  } finally {
    await browser?.close();
  }

  const bericht = { erstellt: new Date().toISOString(), basis: args.offen ? basis : null, ergebnisse };
  fs.writeFileSync(path.join(aus, 'bericht.json'), JSON.stringify(bericht, null, 2));
  for (const e of ergebnisse) {
    const probleme = [...e.fehler, ...e.ueberstand.map(u => `zu breit: ${u}`)];
    console.log(`${probleme.length ? 'FEHL' : 'OK  '} ${e.geraet.padEnd(7)} ${e.ansicht.padEnd(26)} ${String(e.hoehe).padStart(6)} px${probleme.length ? ` - ${probleme.join(' | ')}` : ''}`);
  }
  console.log(`\nScreenshots und bericht.json: ${aus}`);
  if (args.offen) console.log(`Pruef-Instanz laeuft weiter: ${basis}  (Passwort: ${passwort}, Daten-Kopie: ${daten}) - beenden mit kill ${server.pid}`);
  const log = serverLog();
  if (/Error|Fehler/.test(log)) console.log(`\nServer-Ausgabe:\n${log.trim()}`);
  const schlecht = ergebnisse.filter(e => e.fehler.length || e.ueberstand.length).length;
  process.exitCode = schlecht ? 1 : 0;
  // Der Server-Kindprozess haelt die Ereignisschleife offen; ohne ausdrueckliches Beenden
  // feuert 'exit' nie und der Lauf blieb nach dem Bericht haengen (Instanz und Kopie blieben).
  aufraeumen();
}

main().catch(e => { console.error(`dashboard:pruefen: ${e.message}`); process.exit(2); });
