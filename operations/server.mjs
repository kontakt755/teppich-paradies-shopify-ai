#!/usr/bin/env node
/**
 * Lokaler Server fuer das Auftragsband (Phase 3b).
 *
 *   npm run operations:band -- --input <orders.json> [--port 8123]
 *   npm run operations:band -- --live [--tage 60]
 *
 * Bindet ausschliesslich an 127.0.0.1 (wie scripts/serve-dashboard.mjs).
 * Schreibende Requests nur als POST mit application/json und passendem
 * Host/Origin - ein fremder Tab kann die API nicht per Formular ansprechen.
 *
 * ROLLEN (Stufe 1, ohne Anmeldung): Umgebungsvariable OPS_ROLLE, Standard
 * "leitung". Das ist bewusst nur eine Sichtbarkeitsschranke auf einem
 * Rechner, der schon im Netz des Betriebs steht. Eine echte Anmeldung
 * (Benutzerliste ausserhalb des Repos, gehashte Passwoerter, serverseitige
 * Pruefung) ist Entscheidung D11 und noch nicht freigegeben
 * (audit/tp-operations-v3/05-DECISIONS.md).
 *
 * Es werden keine Bestelldaten ins Repository geschrieben. Zustandswechsel
 * gehen ausschliesslich ueber state/speicher.mjs (.router/, gitignored);
 * nach Shopify wird nichts geschrieben.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { warteschlange, auftragskarte, suche } from './lib/auftragsband.mjs';
import { erzeugeSpeicher } from './state/speicher.mjs';
import { AUFTRAG_STATUS, uebergangErlaubt } from './lib/status.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const UI = path.resolve(HIER, 'ui');
const HOST = '127.0.0.1';
const STANDARD_PORT = 8123;
const MAX_BODY = 64 * 1024;

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** Bereiche, die eine Rolle sehen darf. */
export const ROLLEN = Object.freeze({
  leitung: ['auftraege_lesen', 'auftraege_schreiben', 'beratung', 'einkauf', 'muster', 'versand', 'suche'],
  verkauf: ['auftraege_lesen', 'auftraege_schreiben', 'beratung', 'suche'],
  einkauf: ['einkauf', 'suche'],
  lager: ['muster', 'versand'],
  kundenservice: ['auftraege_lesen', 'suche'],
});

export const STANDARD_ROLLE = 'leitung';

/** Aktion -> Zielstatus. */
export const AKTIONEN = Object.freeze({
  freigeben: AUFTRAG_STATUS.FREIGEGEBEN,
  spaeter: AUFTRAG_STATUS.SPAETER,
  problem: AUFTRAG_STATUS.PROBLEM,
});

/**
 * Weg von `von` nach `nach`, geprueft gegen UEBERGAENGE aus lib/status.mjs.
 * Erlaubt ist der direkte Uebergang und genau eine Ausnahme: das Oeffnen der
 * Auftragskarte IST die Pruefung, deshalb darf FREIGEBEN ueber PRUEFUNG
 * laufen (NEU/BERATUNG_OFFEN/MASS_PRUEFUNG_OFFEN -> PRUEFUNG -> FREIGEGEBEN).
 * Es wird kein Weg ueber SPAETER oder PROBLEM gesucht - das waere eine
 * erfundene Regel. Kein Weg -> null.
 */
export function uebergangsPfad(von, nach) {
  if (von === nach) return null;
  if (uebergangErlaubt(von, nach)) return [nach];
  const zwischen = AUFTRAG_STATUS.PRUEFUNG;
  if (nach === AUFTRAG_STATUS.FREIGEGEBEN && uebergangErlaubt(von, zwischen) && uebergangErlaubt(zwischen, nach)) {
    return [zwischen, nach];
  }
  return null;
}

export function bereicheFuer(rolle) {
  return ROLLEN[rolle] || null;
}

export function darf(rolle, bereich) {
  const b = bereicheFuer(rolle);
  if (!b) return false;
  return b.includes(bereich);
}

// --- Argumente: gleiche Konventionen wie scripts/bestelluebersicht.mjs ---

export function argumente(argv) {
  const a = { input: null, live: false, tage: 60, port: Number(process.env.PORT || STANDARD_PORT), hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--input') a.input = argv[++i];
    else if (k === '--live') a.live = true;
    else if (k === '--tage') a.tage = Number(argv[++i]);
    else if (k === '--port') a.port = Number(argv[++i]);
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!a.hilfe && !a.input && !a.live) throw new Error('--input <datei> oder --live angeben');
  if (!(a.tage > 0)) throw new Error('--tage muss > 0 sein');
  if (!(a.port >= 0)) throw new Error('--port muss >= 0 sein');
  return a;
}

export function ladeExport(text) {
  const j = JSON.parse(text);
  if (Array.isArray(j)) return { orders: j };
  if (j?.data?.orders) return { orders: j.data.orders.nodes ?? [], quellvarianten: j.quellvarianten ?? [] };
  if (Array.isArray(j?.orders)) return j;
  if (Array.isArray(j?.orders?.nodes)) return { ...j, orders: j.orders.nodes };
  throw new Error('Eingabe hat kein orders-Feld');
}

async function ladeLive(tage) {
  const { erzeugeProxy } = await import('./sync/zugang.mjs');
  const { fetchOrdersSince } = await import('./sync/orders.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - --input mit MCP-Export nutzen');
  const seit = new Date(Date.now() - tage * 86400000).toISOString();
  const r = await fetchOrdersSince(proxy, seit);
  return { orders: r.orders };
}

export async function ladeDaten(a) {
  if (a.live) return { daten: await ladeLive(a.tage), quelle: { art: 'live', stand: new Date().toISOString(), datei: null } };
  const text = fs.readFileSync(a.input, 'utf8');
  return { daten: ladeExport(text), quelle: { art: 'momentaufnahme', stand: fs.statSync(a.input).mtime.toISOString(), datei: path.basename(a.input) } };
}

// --- HTTP ---

function sende(res, status, body, typ = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

export function gleicheHerkunft(req) {
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return false;
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return false;
  return true;
}

function leseJson(req) {
  return new Promise((ok, fehler) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) { fehler(Object.assign(new Error('Nur application/json'), { status: 415 })); return; }
    let groesse = 0; const stuecke = [];
    req.on('data', c => {
      groesse += c.length;
      if (groesse > MAX_BODY) { req.destroy(); fehler(Object.assign(new Error('Request zu gross'), { status: 413 })); } else stuecke.push(c);
    });
    req.on('end', () => { try { ok(stuecke.length ? JSON.parse(Buffer.concat(stuecke).toString('utf8')) : {}); } catch { fehler(Object.assign(new Error('Ungueltiges JSON'), { status: 400 })); } });
    req.on('error', fehler);
  });
}

/**
 * Baut den Request-Handler. Fuer Tests injizierbar.
 *
 * @param {object} p
 * @param {object} p.daten     {orders, quellvarianten}
 * @param {object} p.quelle    {art, stand, datei}
 * @param {string} [p.rolle]
 * @param {object} [p.speicher]  Ergebnis von erzeugeSpeicher()
 */
export function erzeugeHandler({ daten, quelle, rolle = process.env.OPS_ROLLE || STANDARD_ROLLE, speicher = erzeugeSpeicher() } = {}) {
  if (!bereicheFuer(rolle)) throw new Error(`Unbekannte Rolle: ${rolle} (erlaubt: ${Object.keys(ROLLEN).join(', ')})`);

  const orders = daten?.orders ?? [];
  const findeOrder = name => orders.find(o => String(o?.name) === String(name)) || null;

  function verboten(res, bereich) {
    sende(res, 403, { error: `Rolle ${rolle} darf den Bereich ${bereich} nicht nutzen. Erlaubt: ${bereicheFuer(rolle).join(', ')}.` });
  }

  async function api(req, res, pfad, url) {
    // Routing-Regex: nur diese Pfade existieren.
    const m = pfad.match(/^\/api\/(?:(kontext|warteschlange|suche)|auftrag\/([^/]+)(?:\/(freigeben|spaeter|problem))?)$/);
    if (!m) { sende(res, 404, { error: 'Unbekannter API-Pfad' }); return; }
    const [, einfach, auftragRoh, aktion] = m;
    const auftragName = auftragRoh ? decodeURIComponent(auftragRoh) : null;
    const schreibend = !!aktion;

    if (schreibend) {
      if (req.method !== 'POST') { sende(res, 405, { error: 'POST erwartet' }); return; }
      if (!gleicheHerkunft(req)) { sende(res, 403, { error: 'Nur lokal erlaubt' }); return; }
      if (!darf(rolle, 'auftraege_schreiben')) { verboten(res, 'auftraege_schreiben'); return; }
    } else if (req.method !== 'GET') { sende(res, 405, { error: 'GET erwartet' }); return; }

    if (einfach === 'kontext') {
      sende(res, 200, { rolle, quelle, anzahl: orders.length, bereiche: bereicheFuer(rolle) });
      return;
    }
    if (einfach === 'warteschlange') {
      if (!darf(rolle, 'auftraege_lesen')) { verboten(res, 'auftraege_lesen'); return; }
      const liste = warteschlange(daten, speicher.alleStaende(), { rolle });
      sende(res, 200, { anzahl: liste.length, auftraege: liste.map(a => ({ name: a.name, datum: a.datum, status: a.status, ampel: a.ampel, hinweise: a.hinweise })) });
      return;
    }
    if (einfach === 'suche') {
      if (!darf(rolle, 'suche')) { verboten(res, 'suche'); return; }
      const q = url.searchParams.get('q') || '';
      sende(res, 200, { begriff: q, treffer: suche(daten, q).map(t => ({ name: t.name, treffer: t.treffer })) });
      return;
    }

    const order = findeOrder(auftragName);
    if (!order) { sende(res, 404, { error: `Auftrag ${auftragName} nicht in der Datenquelle` }); return; }

    if (!aktion) {
      if (!darf(rolle, 'auftraege_lesen')) { verboten(res, 'auftraege_lesen'); return; }
      sende(res, 200, auftragskarte(order, { staende: speicher.alleStaende(), quellvarianten: daten.quellvarianten ?? [] }));
      return;
    }

    const body = await leseJson(req);
    const von = String(body?.von ?? '').trim();
    if (!von) { sende(res, 400, { error: 'Feld "von" (Mitarbeitername) fehlt' }); return; }
    const grund = body?.grund ? String(body.grund) : null;
    if (aktion === 'problem' && !grund) { sende(res, 400, { error: 'PROBLEM braucht einen Grund' }); return; }

    const zielStatus = AKTIONEN[aktion];
    const gespeichert = speicher.stand(auftragName);
    const jetztStatus = gespeichert ? gespeichert.status
      : auftragskarte(order, { quellvarianten: daten.quellvarianten ?? [] }).status;
    const weg = uebergangsPfad(jetztStatus, zielStatus);
    if (!weg) { sende(res, 409, { error: `Uebergang ${jetztStatus} -> ${zielStatus} ist nicht erlaubt (${auftragName})` }); return; }

    let eintrag;
    try {
      // Zwischenschritte entstehen, weil das Auftragsband selbst die Pruefung
      // ist: NEU -> PRUEFUNG -> FREIGEGEBEN. Der Verlauf bleibt dadurch
      // luckenlos; die Aktion selbst schreibt genau einen Eintrag.
      for (const schritt of weg) {
        const letzter = schritt === zielStatus;
        eintrag = speicher.notiere({ auftrag: auftragName, status: schritt, von, grund: letzter ? grund : 'Zwischenschritt Auftragsband' });
      }
    } catch (err) {
      sende(res, 409, { error: err.message });
      return;
    }

    const liste = warteschlange(daten, speicher.alleStaende(), { rolle });
    const naechster = liste.find(a => a.name !== auftragName) || null;
    sende(res, 200, { ok: true, eintrag, naechster: naechster ? naechster.name : null });
  }

  async function statisch(req, res, pfad) {
    if (req.method !== 'GET') { sende(res, 405, 'GET erwartet', 'text/plain; charset=utf-8'); return; }
    const roh = pfad === '/' ? '/auftragsband.html' : pfad.replace(/^\/ui\//, '/');
    const rel = path.normalize(roh).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const datei = path.resolve(UI, rel);
    if (datei !== UI && !datei.startsWith(UI + path.sep)) { sende(res, 403, '403 - ausserhalb von operations/ui', 'text/plain; charset=utf-8'); return; }
    try {
      const inhalt = await readFile(datei);
      sende(res, 200, inhalt, TYPEN[path.extname(datei)] || 'application/octet-stream');
    } catch {
      sende(res, 404, '404 - nicht gefunden', 'text/plain; charset=utf-8');
    }
  }

  return function handler(req, res) {
    let url;
    try { url = new URL(req.url || '/', `http://${HOST}`); } catch { url = new URL('/', `http://${HOST}`); }
    let pfad;
    try { pfad = decodeURIComponent(url.pathname); } catch { pfad = url.pathname; }
    const weiter = pfad.startsWith('/api/')
      ? api(req, res, pfad, url)
      : (pfad === '/' || pfad.startsWith('/ui/')) ? statisch(req, res, pfad)
        : Promise.resolve(sende(res, 404, '404 - nicht gefunden', 'text/plain; charset=utf-8'));
    Promise.resolve(weiter).catch(err => {
      const status = err?.status || 500;
      const msg = String(err?.message || err).split('\n')[0].slice(0, 300);
      if (status === 500) console.error(`[ops] ${pfad}: ${msg}`);
      if (!res.headersSent) sende(res, status, { error: msg });
    });
  };
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run operations:band -- --input <orders.json> | --live [--tage 60] [--port 8123]');
    console.log('Rolle ueber OPS_ROLLE: ' + Object.keys(ROLLEN).join(', '));
    return;
  }
  const rolle = process.env.OPS_ROLLE || STANDARD_ROLLE;
  const { daten, quelle } = await ladeDaten(a);
  const speicher = erzeugeSpeicher();
  const handler = erzeugeHandler({ daten, quelle, rolle, speicher });
  createServer(handler).listen(a.port, HOST, () => {
    console.log(`Auftragsband: http://${HOST}:${a.port}`);
    console.log(`Rolle ${rolle} · Bereiche ${bereicheFuer(rolle).join(', ')}`);
    console.log(`Quelle ${quelle.art}${quelle.datei ? ` (${quelle.datei})` : ''} · ${daten.orders?.length ?? 0} Bestellungen · Zustand ${speicher.datei}`);
    console.log('Es wird nichts nach Shopify geschrieben.');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
