#!/usr/bin/env node
/**
 * Hoeflicher Abruf der Lieferant-A-Produktseiten fuer den Anreicherungs-Cache.
 * Nachbau von `~/teppich-paradies-analyse/einkauf-kollektion/crawler.py` als
 * getesteter Teil des Repositorys: eine Seite je 120 s (robots.txt
 * Crawl-delay), fortsetzbar - fertige Seiten werden nie erneut geholt.
 *
 *   npm run lieferantenseiten:holen              # laeuft weiter, bis alles geholt ist
 *   npm run lieferantenseiten:holen -- --stand    # nur zaehlen, kein Abruf
 *   npm run lieferantenseiten:holen -- --einmal   # genau eine Seite, dann beenden (Tests/Debug)
 *
 * Die echte Basis-URL kommt ausschliesslich aus lokalen Dateien unter
 * $TP_PRIVAT_DIR/lieferantendaten/ (lieferant-a.env, LIEFERANT_A_BASIS=...) -
 * im Repository steht nur die Beispieldomain lieferant-a.example
 * (CLAUDE.md Punkt 8, .claude/skills/lieferant-a-recherche/SKILL.md).
 *
 * SIGTERM/SIGINT beenden sauber nach der aktuell laufenden Seite (nie mitten
 * im Schreiben des Caches) - gleiches Muster wie operations/scripts/sync-dienst.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');
export const DELAY_MS = 120_000;

// Attributtabelle der Produktseite: <div class="product-attribute-name">Name</div>
// <div class="col-8 col-lg-9 ...">Wert</div> - gleiches Muster wie crawler.py.
const ATTR_RE = /product-attribute-name">(.*?)<\/div>\s*<div class="col-8 col-lg-9[^"]*">(.*?)<\/div>/gs;
const TAG_RE = /<[^>]+>/g;

function ohneTags(html) {
  return html.replace(TAG_RE, '').trim();
}

export function attributeAuslesen(html) {
  const attrs = {};
  for (const m of html.matchAll(ATTR_RE)) attrs[ohneTags(m[1])] = ohneTags(m[2]);
  return attrs;
}

/** Baut den Cache-Eintrag einer Seite aus ihrem HTML, wie crawler.py `auswerten`. */
export function seiteAuswerten({ html, pid, basis, jetzt = () => new Date() }) {
  const attrs = attributeAuslesen(html);
  return {
    product_id: pid,
    url: `${basis}/de-DE/product/${pid}`,
    kollektion: attrs['Kollektionsname'] ?? attrs['Kollektion'] ?? null,
    marke: attrs['Marke'] ?? null,
    attrs,
    fetched_at: jetzt().toISOString(),
  };
}

/** LIEFERANT_A_BASIS aus lieferant-a.env lesen (kein Klarname im Repo, CLAUDE.md Punkt 8). */
export function basisAusEnvDatei(pfad) {
  if (!fs.existsSync(pfad)) throw new Error(`${pfad} fehlt - LIEFERANT_A_BASIS=https://lieferant-a.example muss dort stehen (.claude/skills/lieferant-a-recherche/SKILL.md), nie im Repository`);
  for (const zeile of fs.readFileSync(pfad, 'utf8').split(/\r?\n/)) {
    const m = /^LIEFERANT_A_BASIS=(.*)$/.exec(zeile.trim());
    if (m) return m[1].trim().replace(/\/$/, '');
  }
  throw new Error(`LIEFERANT_A_BASIS fehlt in ${pfad}`);
}

/**
 * Zu holende Produktseiten-IDs aus dem Katalog-Abgleich: jede SKU mit genau
 * einem Treffer liefert die Lieferantenseiten-ID aus der Treffer-URL, ohne
 * Duplikate - gleiche Logik wie crawler.py `ids()`.
 */
export function idsAusKatalog(katalog) {
  const gesehen = new Set();
  const raus = [];
  for (const eintrag of Object.values(katalog || {})) {
    const url = eintrag?.match?.url || '';
    const pid = url.split('/').filter(Boolean).pop();
    if (pid && /^\d+$/.test(pid) && !gesehen.has(pid)) {
      gesehen.add(pid);
      raus.push(pid);
    }
  }
  return raus;
}

function ladeJson(pfad, standard) {
  if (!fs.existsSync(pfad)) return standard;
  return JSON.parse(fs.readFileSync(pfad, 'utf8'));
}

function sichern(pfad, daten) {
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  const tmp = `${pfad}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 1));
  fs.renameSync(tmp, pfad);
}

function neuesteDatei(verzeichnis, muster) {
  if (!fs.existsSync(verzeichnis)) return null;
  const treffer = fs.readdirSync(verzeichnis).filter((n) => muster.test(n)).sort();
  return treffer.length ? path.join(verzeichnis, treffer[treffer.length - 1]) : null;
}

/** Wartezeit, die per AbortSignal vorzeitig abgebrochen werden kann (sync-dienst.mjs-Muster). */
function warten(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** Eine Session herstellen (Cookies), wie crawler.py `sitzung()`. */
async function sitzungHerstellen({ basis, fetch, cookieJar }) {
  for (const pfad of ['/shop-select', '/de-DE/']) {
    // eslint-disable-next-line no-await-in-loop -- zwei Aufrufe, bewusst nacheinander fuer dieselbe Session.
    const res = await fetch(basis + pfad, { headers: cookieJar.header() ? { cookie: cookieJar.header() } : {} });
    cookieJar.uebernehmen(res.headers?.get?.('set-cookie'));
  }
}

/** Minimaler Cookie-Jar fuer die Session (kein Login, nur Sitzungscookie). */
function cookieJarErzeugen() {
  const cookies = new Map();
  return {
    uebernehmen(setCookie) {
      if (!setCookie) return;
      const [paar] = String(setCookie).split(';');
      const [k, v] = paar.split('=');
      if (k && v !== undefined) cookies.set(k.trim(), v.trim());
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function seiteHolen({ basis, pid, fetch, cookieJar }) {
  const res = await fetch(`${basis}/de-DE/product/${pid}`, { headers: cookieJar.header() ? { cookie: cookieJar.header() } : {} });
  cookieJar.uebernehmen(res.headers?.get?.('set-cookie'));
  return res.text();
}

/**
 * Holt alle noch fehlenden Seiten, eine je `delayMs`, und schreibt jede
 * sofort in den Cache (fortsetzbar bei Abbruch). Bricht nie wegen einer
 * einzelnen fehlerhaften Seite ab (wie crawler.py: Fehler wird geloggt, die
 * Schleife laeuft weiter).
 */
export async function laufen({
  basis,
  ids,
  cachePfad,
  fetch = globalThis.fetch,
  delayMs = DELAY_MS,
  signal,
  einmal = false,
  protokoll = console,
}) {
  const cache = ladeJson(cachePfad, {});
  const offen = ids.filter((pid) => !cache[pid]);
  if (!offen.length) {
    protokoll.log?.('Nichts offen - alle Seiten im Cache.');
    return { geholt: 0, cache };
  }
  const cookieJar = cookieJarErzeugen();
  await sitzungHerstellen({ basis, fetch, cookieJar });

  let geholt = 0;
  for (let i = 0; i < offen.length; i++) {
    if (signal?.aborted) break;
    const pid = offen[i];
    try {
      let html = await seiteHolen({ basis, pid, fetch, cookieJar });
      let daten = seiteAuswerten({ html, pid, basis });
      if (!Object.keys(daten.attrs).length) {
        // Leere Antwort: Session ist vermutlich abgelaufen - einmal erneuern und erneut versuchen (wie crawler.py).
        await sitzungHerstellen({ basis, fetch, cookieJar });
        html = await seiteHolen({ basis, pid, fetch, cookieJar });
        daten = seiteAuswerten({ html, pid, basis });
      }
      cache[pid] = daten;
      sichern(cachePfad, cache);
      geholt += 1;
      protokoll.log?.(`${i + 1}/${offen.length} ${pid} kollektion=${JSON.stringify(daten.kollektion)}`);
    } catch (err) {
      protokoll.error?.(`${pid} FEHLER ${err.message}`);
    }
    if (einmal || i === offen.length - 1) break;
    // eslint-disable-next-line no-await-in-loop -- Crawl-delay: bewusst eine Seite nach der anderen.
    await warten(delayMs, signal);
  }
  return { geholt, cache };
}

export function argumente(argv) {
  const a = { privatDir: null, stand: false, einmal: false, hilfe: false };
  for (const k of argv) {
    if (k === '--stand') a.stand = true;
    else if (k === '--einmal') a.einmal = true;
    else if (k === '--privat-dir') a.privatDir = true; // Wert folgt separat, siehe main()
    else if (k === '--help' || k === '-h') a.hilfe = true;
  }
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--privat-dir') a.privatDir = argv[i + 1];
  return a;
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run lieferantenseiten:holen -- [--stand] [--einmal] [--privat-dir <pfad>]');
    return;
  }
  const privatDir = a.privatDir || process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
  const lieferantenDir = path.join(privatDir, 'lieferantendaten');
  const envPfad = path.join(lieferantenDir, 'lieferant-a.env');
  const katalogPfad = neuesteDatei(lieferantenDir, /^lieferant-a-katalog-.*\.json$/);
  if (!katalogPfad) throw new Error(`Kein Katalog-Abgleich unter ${lieferantenDir} (lieferant-a-recherche-Skill vorher laufen lassen)`);
  const cachePfad = neuesteDatei(lieferantenDir, /^lieferant-a-produktseiten-.*\.json$/)
    || path.join(lieferantenDir, `lieferant-a-produktseiten-${new Date().toISOString().slice(0, 10)}.json`);

  const basis = basisAusEnvDatei(envPfad);
  const katalog = ladeJson(katalogPfad, {});
  const ids = idsAusKatalog(katalog);
  const cache = ladeJson(cachePfad, {});
  const offen = ids.filter((pid) => !cache[pid]);

  if (a.stand) {
    const mit = Object.values(cache).filter((v) => v.kollektion).length;
    const stunden = (offen.length * DELAY_MS) / 3_600_000;
    console.log(`${Object.keys(cache).length}/${ids.length} Seiten geholt, davon ${mit} mit Kollektion, ${offen.length} offen (${stunden.toFixed(1)} h Restlaufzeit)`);
    return;
  }

  const controller = new AbortController();
  const beenden = (signal) => { console.log(`${signal} empfangen - beende nach der aktuellen Seite`); controller.abort(); };
  process.once('SIGTERM', () => beenden('SIGTERM'));
  process.once('SIGINT', () => beenden('SIGINT'));

  const { geholt } = await laufen({ basis, ids, cachePfad, signal: controller.signal, einmal: a.einmal });
  console.log(`Fertig - ${geholt} Seite(n) in diesem Lauf geholt. Cache: ${cachePfad}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
