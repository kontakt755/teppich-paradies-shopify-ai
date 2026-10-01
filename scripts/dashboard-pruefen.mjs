#!/usr/bin/env node
/**
 * Sichtpruefung des Control Centers im echten Browser - ohne echte Daten zu veraendern.
 *
 *   npm run dashboard:pruefen                          # alle Ansichten bei 1440, 1024, 800, 390, 360 px
 *   npm run dashboard:pruefen -- --ansichten heute,einkauf
 *   npm run dashboard:pruefen -- --aus /tmp/pruefung   # Screenshots dorthin
 *   npm run dashboard:pruefen -- --breiten 390,1440    # nur diese Fensterbreiten
 *   npm run dashboard:pruefen -- --dunkel               # dunkle Ansicht (Standard: hell)
 *   npm run dashboard:pruefen -- --offen                # Instanz nach dem Lauf offen lassen
 *
 * Ablauf:
 *  1. Kopie der privaten Daten ($TP_PRIVAT_DIR, Standard ~/teppich-paradies-analyse) in ein
 *     Temp-Verzeichnis. Grosse, nur gelesene Exporte werden verlinkt, alles, was das Dashboard
 *     beschreibt (Auftragsstatus), wird kopiert. dashboard-passwort.txt wird nie angefasst.
 *  2. Eigene Instanz von scripts/serve-dashboard.mjs auf einem freien Port, nur 127.0.0.1,
 *     mit einem Wegwerf-Passwort (nicht dem echten).
 *  3. Puppeteer: je Ansicht und Fensterbreite Screenshot, JS-Fehler, Seitenhoehe und
 *     seitliches Scrollen. Geprueft wird zweifach: die Seite selbst (scrollWidth > clientWidth)
 *     und einzelne Elemente, die ausserhalb eines eigenen Scroll-Containers ueber den Rand ragen.
 *     Die Breiten decken kleines Android (360), iPhone (390), Tablet hochkant / halbes Fenster
 *     (800), Tablet quer (1024) und den Rechner (1440) ab - die Brueche lagen frueher genau
 *     bei 360 und 800 px, wo nicht gemessen wurde.
 *  4. Bericht nach <aus>/bericht.json und als Tabelle auf die Konsole.
 *     Exit-Code 1 bei JS-Fehlern oder seitlichem Scrollen (egal bei welcher Breite).
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
const ALLE_ANSICHTEN = ['heute', 'einkauf', 'einkauf?tab=produktdaten', 'kunden', 'kunden?tab=bestellungen', 'kunden?tab=warenkoerbe', 'organisation', 'fotos', 'lexikon', 'lexikon?handle=kontura-teppichboden', 'arbeit', 'freigaben', 'ratgeber', 'bereiche', 'insights', 'aktivitaet', 'shopwache', 'team', 'hilfe'];
// Fensterbreiten [Breite, Hoehe, Name]. Die Namen "desktop" und "handy" bleiben fuer die
// beiden Breiten, die es schon immer gab - Screenshots heissen dort wie bisher.
// Seit das Control Center ueber Tailscale vom Handy aus benutzt wird (auch vom Monteur auf
// der Baustelle), ist das Handy kein Sonderfall mehr: jede Ansicht wird bei jeder Breite geprueft.
const BREITEN = [[1440, 900, 'desktop'], [1024, 768, 'b1024'], [800, 1000, 'b800'], [390, 844, 'handy'], [360, 740, 'b360']];
// Grosse Exporte, die das Dashboard nur liest: verlinken statt kopieren.
const NUR_LESEN = ['einkauf-dryrun', 'einkauf-klaerung', 'lexikon'];
// Klein oder beschreibbar: kopieren, damit Klicktests nie die echten Dateien treffen.
const KOPIEREN = ['bestelluebersicht', 'kennzahlen', 'organisation', 'aktualisierung.json', 'auftragsstatus.json'];

function argumente(argv) {
  const a = { ansichten: null, aus: null, offen: false, breiten: null, dunkel: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--ansichten') a.ansichten = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--aus') a.aus = argv[++i];
    else if (k === '--offen') a.offen = true;
    else if (k === '--dunkel') a.dunkel = true;
    else if (k === '--breiten') a.breiten = argv[++i].split(',').map(s => Number(s.trim())).filter(Boolean);
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
    const breiten = args.breiten ? BREITEN.filter(b => args.breiten.includes(b[0])) : BREITEN;
    if (!breiten.length) throw new Error(`--breiten kennt nur ${BREITEN.map(b => b[0]).join(', ')}`);
    await seite.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: args.dunkel ? 'dark' : 'light' }]);
    for (const [breite, hoehe, geraet] of breiten) {
      await seite.setViewport({ width: breite, height: hoehe, deviceScaleFactor: 1 });
      for (const ansicht of ansichten) {
        fehler.length = 0;
        // Nicht auf "networkidle0" warten: fehlt in einem frischen Worktree issues.json, laedt
        // die Seite weiter nach und der Lauf brach mit "Navigation timeout" ab. Stattdessen
        // warten, bis nichts mehr "Lade ..." zeigt, hoechstens aber ein paar Sekunden.
        await seite.goto(`${basis}/#/${ansicht}`, { waitUntil: 'domcontentloaded' });
        await seite.waitForFunction(() => {
          const main = document.querySelector('#main');
          return main && !main.querySelector('.skeleton') && !/Lade\b[^.]{0,40}…/.test(main.textContent);
        }, { timeout: 6000 }).catch(() => { /* bleibt etwas im Ladezustand, zeigt es der Screenshot */ });
        await new Promise(r => setTimeout(r, 700));
        const name = `${geraet}-${ansicht.replace(/[?=&]/g, '_')}`;
        const datei = path.join(aus, `${name}.png`);
        await seite.screenshot({ path: datei, fullPage: true });
        const messung = await seite.evaluate(() => {
          const wurzel = document.scrollingElement || document.documentElement;
          return {
            hoehe: wurzel.scrollHeight,
            // Die Seite selbst darf nie seitlich scrollen - Tabellen nur in ihrem eigenen Rahmen.
            seitenbreite: wurzel.scrollWidth,
            fensterbreite: wurzel.clientWidth,
            ueberstand: [...document.querySelectorAll('body *')]
              .filter(e => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.right > window.innerWidth + 1 && !e.closest('.table-scroll,.table-wrap,.kanban');
              })
              .slice(0, 5).map(e => {
                // Pfad ueber die naechsten Vorfahren mit Klasse/ID, damit die Stelle auffindbar ist.
                const teile = [];
                for (let n = e; n && n !== document.body && teile.length < 4; n = n.parentElement) {
                  const k = n.id ? `#${n.id}` : n.classList.length ? `.${[...n.classList].join('.')}` : '';
                  teile.unshift(`${n.tagName.toLowerCase()}${k}`);
                }
                return `${teile.join(' > ')} (${Math.round(e.getBoundingClientRect().right)} px)`;
              }),
          };
        });
        const ueberlauf = messung.seitenbreite > messung.fensterbreite ? messung.seitenbreite - messung.fensterbreite : 0;
        ergebnisse.push({ geraet, breite, ansicht, datei, hoehe: messung.hoehe, ueberlauf, ueberstand: messung.ueberstand, fehler: [...fehler] });
      }
    }
  } finally {
    await browser?.close();
  }

  const bericht = { erstellt: new Date().toISOString(), basis: args.offen ? basis : null, ergebnisse };
  fs.writeFileSync(path.join(aus, 'bericht.json'), JSON.stringify(bericht, null, 2));
  for (const e of ergebnisse) {
    const probleme = [...e.fehler, ...(e.ueberlauf ? [`Seite scrollt seitlich: ${e.ueberlauf} px zu breit`] : []), ...e.ueberstand.map(u => `zu breit: ${u}`)];
    console.log(`${probleme.length ? 'FEHL' : 'OK  '} ${String(e.breite).padStart(4)} px ${e.ansicht.padEnd(36)} ${String(e.hoehe).padStart(6)} px hoch${probleme.length ? ` - ${probleme.join(' | ')}` : ''}`);
  }
  // Zusammenfassung je Breite: der groesste seitliche Ueberlauf (0 = keine Ansicht scrollt seitlich).
  for (const b of [...new Set(ergebnisse.map(e => e.breite))]) {
    const teil = ergebnisse.filter(e => e.breite === b);
    const schlecht = teil.filter(e => e.ueberlauf || e.ueberstand.length);
    console.log(`Ueberlauf ${String(b).padStart(4)} px: ${schlecht.length ? `${schlecht.length} von ${teil.length} Ansichten, groesster ${Math.max(...teil.map(e => e.ueberlauf))} px` : `0 px auf allen ${teil.length} Ansichten`}`);
  }
  console.log(`\nScreenshots und bericht.json: ${aus}`);
  if (args.offen) console.log(`Pruef-Instanz laeuft weiter: ${basis}  (Passwort: ${passwort}, Daten-Kopie: ${daten}) - beenden mit kill ${server.pid}`);
  const log = serverLog();
  if (/Error|Fehler/.test(log)) console.log(`\nServer-Ausgabe:\n${log.trim()}`);
  const schlecht = ergebnisse.filter(e => e.fehler.length || e.ueberlauf || e.ueberstand.length).length;
  process.exitCode = schlecht ? 1 : 0;
  // Der Server-Kindprozess haelt die Ereignisschleife offen; ohne ausdrueckliches Beenden
  // feuert 'exit' nie und der Lauf blieb nach dem Bericht haengen (Instanz und Kopie blieben).
  aufraeumen();
}

main().catch(e => { console.error(`dashboard:pruefen: ${e.message}`); process.exit(2); });
