#!/usr/bin/env node
/** Nur lesende Linkpruefung (w-363): vorhandene Listen fortsetzen, nichts neu sammeln. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ABSTAND_MS = 1000;
const PAUSE_NACH = 50;
const PAUSE_MS = 60_000;
const SPEICHERN_NACH = 10;
const MAX_SPRUENGE = 6;
const TIMEOUT_MS = 30_000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ENDE = Symbol('Endzeit');
const LIMIT = Symbol('429');

export function argumente(argv) {
  const optionen = { bis: '06:00' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--bis') {
      optionen.bis = argv[++i];
      if (!optionen.bis) throw new Error('--bis braucht HH:MM');
    } else if (arg === '--ab-links' || arg === '--ab-sitemap') {
      const wert = argv[++i];
      if (!/^\d+$/.test(wert ?? '') || !Number.isSafeInteger(Number(wert))) {
        throw new Error(`${arg} braucht einen nichtnegativen ganzzahligen Index`);
      }
      optionen[arg === '--ab-links' ? 'abLinks' : 'abSitemap'] = Number(wert);
    } else throw new Error(`Unbekanntes Argument: ${arg}`);
  }
  endzeit(Date.now(), optionen.bis);
  return optionen;
}

/** Ortszeit; nach der Endzeit ist das naechste Kalenderdatum gemeint. */
export function endzeit(start, bis = '06:00') {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(bis)) throw new Error('--bis braucht HH:MM (00:00 bis 23:59)');
  const [stunde, minute] = bis.split(':').map(Number);
  const ende = new Date(start);
  ende.setHours(stunde, minute, 0, 0);
  if (+ende < +start) ende.setDate(ende.getDate() + 1);
  return +ende;
}

function lesen(dir, datei, optional = false) {
  let daten;
  try { daten = JSON.parse(fs.readFileSync(path.join(dir, datei), 'utf8')); }
  catch (e) { if (optional && e.code === 'ENOENT') return []; throw e; }
  if (!Array.isArray(daten)) throw new Error(`${datei} muss eine Liste sein`);
  return daten;
}

function speichern(dir, datei, daten) {
  const ziel = path.join(dir, datei);
  const tmp = `${ziel}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(daten, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, ziel);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export async function linkpruefung({
  dir = process.env.LINKPRUEFUNG_DIR || path.join(process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'linkpruefung-2026-11-11'),
  bis = '06:00', abLinks, abSitemap,
} = {}, {
  fetch = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  log = console.log,
} = {}) {
  const ende = endzeit(+now(), bis);
  const links = lesen(dir, 'links.json');
  const sitemap = lesen(dir, 'sitemap-urls.json');
  const linksStatus = lesen(dir, 'links-status.json', true);
  const sitemapStatus = lesen(dir, 'sitemap-status.json', true);
  // Beide Indizes pruefen, bevor eine Datei gekuerzt wird.
  for (const [art, index, stand, eingabe] of [
    ['links', abLinks, linksStatus, links], ['sitemap', abSitemap, sitemapStatus, sitemap],
  ]) {
    if (stand.length > eingabe.length) throw new Error(`${art}: mehr Ergebnisse als Eingaben`);
    if (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index > stand.length)) {
      throw new Error(`--ab-${art}: Index ${index} groesser als vorhandener Stand ${stand.length} oder ungueltig`);
    }
  }
  if (abLinks !== undefined) linksStatus.length = abLinks;
  if (abSitemap !== undefined) sitemapStatus.length = abSitemap;
  const standSpeichern = () => {
    speichern(dir, 'links-status.json', linksStatus);
    speichern(dir, 'sitemap-status.json', sitemapStatus);
  };
  let anfragen = 0;
  let letzterAbruf = null;
  let neueErgebnisse = 0;
  let exitCode = 0;

  async function warte(ms) {
    const rest = ende - +now();
    if (rest <= 0) throw ENDE;
    await sleep(Math.min(ms, rest));
    if (+now() >= ende) throw ENDE;
  }

  async function abruf(url) {
    if (+now() >= ende) throw ENDE;
    if (anfragen > 0 && anfragen % PAUSE_NACH === 0) await warte(PAUSE_MS);
    if (letzterAbruf !== null) {
      const rest = ABSTAND_MS - (+now() - letzterAbruf);
      if (rest > 0) await warte(rest);
    }
    if (+now() >= ende) throw ENDE;
    letzterAbruf = +now();
    anfragen++;
    let antwort;
    try {
      antwort = await fetch(url, {
        method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, ende - +now()))),
      });
    } catch (e) {
      // Ein durch die Endzeit abgebrochener Abruf bleibt fuer die naechste Nacht offen.
      if (+now() >= ende) throw ENDE;
      throw e;
    }
    // Nur Header brauchen; den Body weder laden noch sammeln.
    try { await antwort.body?.cancel(); } catch { /* Header bleiben verwertbar. */ }
    if (antwort.status === 429) throw LIMIT;
    return { status: antwort.status, loc: antwort.headers.get('location') || '' };
  }

  async function pruefeLink(link) {
    let final = link.l;
    const chain = [];
    try {
      for (let sprung = 0; ; sprung++) {
        const { status, loc } = await abruf(final);
        if (![301, 302, 303, 307, 308].includes(status) || !loc || sprung >= MAX_SPRUENGE) {
          return { ...link, status, chain, final };
        }
        const ziel = new URL(loc, final).href;
        chain.push(status, ziel);
        final = ziel;
      }
    } catch (e) {
      if (e === ENDE || e === LIMIT) throw e;
      return { ...link, status: 'ERR', chain, final, error: e.message };
    }
  }

  try {
    // Auch eine ausdrueckliche Kuerzung ist vor dem ersten Abruf dauerhaft.
    standSpeichern();
    // Nach einer Kuerzung ist ein alter Abschlussbericht nicht mehr aktuell.
    if (linksStatus.length < links.length || sitemapStatus.length < sitemap.length) {
      fs.rmSync(path.join(dir, 'befunde.json'), { force: true });
    }
    for (const art of ['links', 'sitemap']) {
      const eingabe = art === 'links' ? links : sitemap;
      const stand = art === 'links' ? linksStatus : sitemapStatus;
      while (stand.length < eingabe.length) {
        const eintrag = eingabe[stand.length];
        let ergebnis;
        try {
          if (art === 'links') ergebnis = await pruefeLink(eintrag);
          else {
            try { ergebnis = { ...eintrag, ...await abruf(eintrag.u) }; }
            catch (e) {
              if (e === ENDE || e === LIMIT) throw e;
              ergebnis = { ...eintrag, status: 'ERR', loc: '', error: e.message };
            }
          }
        } catch (e) {
          if (e === LIMIT) { log(`429 bei ${art} ${stand.length}`); exitCode = 2; }
          else if (e !== ENDE) throw e;
          return { exitCode };
        }
        stand.push(ergebnis);
        if (++neueErgebnisse % SPEICHERN_NACH === 0) standSpeichern();
      }
    }
    const befunde = [
      ...linksStatus.filter(e => e.status !== 200 || e.chain?.length).map(e => ({ ...e, art: 'link' })),
      ...sitemapStatus.filter(e => e.status !== 200 || e.chain?.length).map(e => ({ ...e, art: 'sitemap' })),
    ];
    speichern(dir, 'befunde.json', befunde);
    log(`fertig: ${links.length} Links, ${sitemap.length} Sitemap-URLs, ${befunde.length} Befunde`);
    return { exitCode };
  } finally {
    try { standSpeichern(); }
    finally { log(`Stand: links ${linksStatus.length}/${links.length}, sitemap ${sitemapStatus.length}/${sitemap.length}`); }
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = (await linkpruefung(argumente(process.argv.slice(2)))).exitCode; }
  catch (e) { console.error(`Linkpruefung: ${e.message}`); process.exitCode = 1; }
}
