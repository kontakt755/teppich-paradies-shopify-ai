#!/usr/bin/env node
/**
 * Auslauf-Pruefung (woechentlich, LaunchAgent net.teppich-paradies.auslauf):
 *
 *   npm run auslauf:pruefen                    # alle online pruefbaren Lieferanten
 *   npm run auslauf:pruefen -- --nur C,E       # nur diese
 *   npm run auslauf:pruefen -- --hoechstens 20 # je Lieferant nur die ersten 20 (Probelauf)
 *
 * Liest den Lexikon-Export ($TP_PRIVAT_DIR/lexikon/produkte.json), fragt bei
 * jedem Lieferanten ab, ob es den Artikel noch gibt, und schreibt
 * $TP_PRIVAT_DIR/auslauf/status.json - das Control Center zeigt Befunde als
 * To-do. Nur lesende Abrufe, nichts wird im Shop geaendert.
 *
 * Lieferantenadressen stehen nicht im Repository: A kommt aus
 * $TP_PRIVAT_DIR/lieferantendaten/lieferant-a.env, C/D/E aus den
 * Einkaufslinks des Lexikons.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PRUEFBAR, pruefziele, bewerteSeite, bewerteSuche, zusammenfassen, gesamtStand,
} from '../lib/auslauf.mjs';

const PAUSE_MS = 300;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const warte = ms => new Promise(r => setTimeout(r, ms));

export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function argumente(argv) {
  const a = { nur: PRUEFBAR, hoechstens: Infinity, ziel: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--nur') a.nur = String(argv[++i] || '').toUpperCase().split(',').filter(Boolean);
    else if (k === '--hoechstens') a.hoechstens = Number(argv[++i]);
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  const falsch = a.nur.filter(l => !PRUEFBAR.includes(l));
  if (falsch.length) throw new Error(`--nur kennt nur ${PRUEFBAR.join(',')} (nicht ${falsch.join(',')})`);
  if (!(a.hoechstens > 0)) throw new Error('--hoechstens muss eine Zahl > 0 sein');
  return a;
}

function curl(args) {
  return execFileSync('curl', ['-s', '-m', '25', '-A', UA, ...args], { encoding: 'utf8', maxBuffer: 40e6 });
}

/** Seite holen: Status und Inhalt. Fehler werden zum Ergebnis, nicht zum Abbruch. */
function holeSeite(url) {
  try {
    const out = curl(['-L', '-w', '\n@@%{http_code}', url]);
    const i = out.lastIndexOf('\n@@');
    return { code: Number(out.slice(i + 3)) || 0, body: out.slice(0, i) };
  } catch {
    return { code: 0, body: '' };
  }
}

async function pruefeSeiten(lf, ziele) {
  const erg = [];
  for (const z of ziele) {
    erg.push({ ...z, ...bewerteSeite(lf, { ...holeSeite(z.url), kennung: z.kennung }) });
    await warte(PAUSE_MS);
  }
  return erg;
}

/** A: Schnellsuche mit Sitzungs-Cookie, exakter Treffer auf bis zu 8 Ergebnisseiten. */
async function pruefeA(ziele, dir) {
  const env = path.join(dir, 'lieferantendaten', 'lieferant-a.env');
  const basis = fs.existsSync(env) && fs.readFileSync(env, 'utf8').match(/^LIEFERANT_A_BASIS=(.+)$/m)?.[1]?.trim();
  if (!basis) return ziele.map(z => ({ ...z, ergebnis: 'fehler', grund: `${env} fehlt` }));
  const jar = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auslauf-a-')), 'cookies');
  const hole = u => curl(['-c', jar, '-b', jar, u]);
  try { hole(`${basis}/shop-select`); hole(`${basis}/de-DE/`); } catch { /* zeigt sich an den Abrufen */ }
  const erg = [];
  for (const z of ziele) {
    let ergebnis;
    try {
      let gefunden = false;
      for (let seite = 1; seite <= 8 && !gefunden; seite++) {
        const j = JSON.parse(hole(`${basis}/de-DE/quicksearch?query=${encodeURIComponent(z.kennung)}&page=${seite}`));
        gefunden = (j.products?.data ?? []).some(x => x.material_number === z.kennung);
        if (seite >= (j.products?.meta?.last_page ?? 1)) break;
        await warte(250);
      }
      ergebnis = bewerteSuche({ gefunden });
    } catch (e) {
      ergebnis = bewerteSuche({ fehler: String(e.message).slice(0, 80) });
    }
    erg.push({ ...z, ...ergebnis });
    await warte(PAUSE_MS);
  }
  fs.rmSync(path.dirname(jar), { recursive: true, force: true });
  return erg;
}

/**
 * D lehnt Abrufe ohne Browser ab ("Request Rejected"). Ein Headless-Browser
 * oeffnet die Startseite und ruft die Produktseiten von dort per fetch ab.
 */
async function pruefeD(ziele) {
  if (!ziele.length) return [];
  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; } catch {
    return ziele.map(z => ({ ...z, ergebnis: 'fehler', grund: 'puppeteer fehlt (npm ci)' }));
  }
  const origin = new URL(ziele[0].url).origin;
  const browser = await puppeteer.launch({ headless: true });
  const erg = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(`${origin}/de/de/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (const z of ziele) {
      const u = new URL(z.url);
      let antwort = { code: 0, body: '' };
      if (u.origin === origin) {
        antwort = await page.evaluate(async p => {
          try { const r = await fetch(p); return { code: r.status, body: await r.text() }; } catch { return { code: 0, body: '' }; }
        }, u.pathname + u.search).catch(() => ({ code: 0, body: '' }));
      }
      erg.push({ ...z, ...bewerteSeite('D', { ...antwort, kennung: z.kennung }) });
      await warte(PAUSE_MS);
    }
  } finally {
    await browser.close();
  }
  return erg;
}

export async function main(argv = process.argv.slice(2)) {
  const a = argumente(argv);
  if (a.hilfe) {
    console.log('npm run auslauf:pruefen [-- --nur A,C,D,E] [--hoechstens N] [--ziel datei]');
    return;
  }
  const dir = privatDir();
  const lexikon = path.join(dir, 'lexikon', 'produkte.json');
  if (!fs.existsSync(lexikon)) throw new Error(`${lexikon} fehlt - erst npm run lexikon:export`);
  const start = Date.now();
  const lex = JSON.parse(fs.readFileSync(lexikon, 'utf8'));
  const ziele = pruefziele(lex.produkte);
  const teile = [];
  for (const lf of a.nur) {
    const liste = ziele[lf].slice(0, a.hoechstens);
    const t0 = Date.now();
    const erg = lf === 'A' ? await pruefeA(liste, dir) : lf === 'D' ? await pruefeD(liste) : await pruefeSeiten(lf, liste);
    const teil = zusammenfassen(lf, erg);
    teile.push(teil);
    console.log(`${new Date().toISOString()} ${lf}: ${teil.geprueft} geprueft, ${teil.befunde.length} Befunde, ${teil.fehler} Fehler${teil.ausfall ? ` - AUSFALL: ${teil.ausfall}` : ''} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  const stand = gesamtStand(teile, {
    ohneOnline: ziele.ohneOnline,
    geprueftAm: new Date().toISOString(),
    dauerSek: Math.round((Date.now() - start) / 1000),
  });
  stand.lexikonStand = lex.erstellt || fs.statSync(lexikon).mtime.toISOString();
  const ziel = a.ziel || path.join(dir, 'auslauf', 'status.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, `${JSON.stringify(stand, null, 2)}\n`);
  for (const b of stand.befunde) console.log(`  ${b.lieferant} ${b.ergebnis}: ${b.kennung || b.url} -> ${b.handles.join(', ')} (${b.grund})`);
  console.log(`Ampel ${stand.ampel}, ${stand.befunde.length} Befunde -> ${ziel}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
