/**
 * Produkt-Reels aus einem scharfen Shop-Bild (Inhaberentscheidung 16.10.2026: keine KI-Videos -
 * Bewegung nur durch einen langsamen Zoom auf dem Standbild, Texte und Preis animiert).
 *
 * Ablauf (Redaktion, REDAKTION.md Abschnitt 3c):
 *   1. `reel-kandidaten`: Produkte ohne Aktion und ohne Auslauf, mit einem Raumbild, das laut
 *      Bildrechte-Liste auch fuer Werbung freigegeben ist und gross genug fuer den Zoom.
 *   2. Auftrag schreiben (Ausschnitt, Anker, Produktflaeche, Zeilen, Belege); `reel-vorschau` zeigt ihn.
 *   3. `produkt-reel`: Preise live pruefen, rendern, Schaerfe messen, Beitrag in die Freigabe legen.
 * Unmittelbar vor dem Veroeffentlichen prueft der Publisher die Preise noch einmal live
 * (`produktReelSperren`) - im Video steht ein fester Preis, der Shop kann sich bis dahin geaendert haben.
 *
 * Gezeichnet und gemessen wird in Python (werkzeuge/reel_zoom.py, numpy/OpenCV/Pillow ueber `uv`).
 */

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { autoFreigabeMoeglich, pruefe } from './freigabe.mjs';
import { BETRIEB } from './konfig.mjs';
import { medienDir, privatDir, REPO, socialDir } from './pfade.mjs';
import { ffmpegPfad } from './reel.mjs';
import { normalisiere } from './shop-quelle.mjs';
import { INHALT_STATUS, PLATTFORMEN } from './status.mjs';
import { hashtags, pruefeText, shopLink } from './texte.mjs';
import { kurzTitel } from './werkstatt.mjs';

const starte = promisify(execFile);
const TAG = 24 * 60 * 60 * 1000;

export const REEL_REGELN = Object.freeze({
  ruheTage: 45,          // dasselbe Produkt hoechstens alle 45 Tage
  mindestKante: 2000,    // lange Bildkante: der Zoom braucht Reserve, sonst wird hochgerechnet
  maxAlterTage: 10,      // so alt darf der Preisstand im Video beim Veroeffentlichen hoechstens sein
});

export class ReelFehler extends Error {}

// --- Bildrechte ---------------------------------------------------------------

export const bildrechtePfad = (env = process.env) => path.join(privatDir(env), 'bildrechte', 'bildrechte.csv');

/** CSV mit Anfuehrungszeichen (RFC 4180), Trenner Semikolon wie in der Bildrechte-Liste. */
export function leseCsv(text, trenner = ';') {
  const zeilen = []; let zeile = []; let feld = ''; let inAnf = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inAnf) {
      if (c === '"' && s[i + 1] === '"') { feld += '"'; i += 1; } else if (c === '"') inAnf = false; else feld += c;
    } else if (c === '"') inAnf = true;
    else if (c === trenner) { zeile.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      zeile.push(feld); feld = '';
      if (zeile.some(f => f !== '')) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some(f => f !== '')) zeilen.push(zeile);
  const [kopf = [], ...rest] = zeilen;
  return rest.map(z => Object.fromEntries(kopf.map((k, i) => [k, z[i] ?? ''])));
}

const mediumNummer = id => String(id ?? '').replace(/^gid:\/\/shopify\/MediaImage\//, '');

export function ladeBildrechte(datei = bildrechtePfad()) {
  if (!fs.existsSync(datei)) throw new ReelFehler(`Bildrechte-Liste fehlt: ${datei}`);
  const zeilen = leseCsv(fs.readFileSync(datei, 'utf8'));
  const nachMedium = new Map(); const nachHandle = new Map();
  for (const z of zeilen) {
    nachMedium.set(mediumNummer(z.media_id), z);
    if (!nachHandle.has(z.produkt_handle)) nachHandle.set(z.produkt_handle, []);
    nachHandle.get(z.produkt_handle).push(z);
  }
  return { nachMedium, nachHandle };
}

/**
 * Darf das Bild in Werbung? Nur mit ausdruecklicher Werbefreigabe (Inhaber 10.10.2026) - "Freigabe
 * Hersteller" und die Website-Freigaben einzelner Lieferanten gelten nur fuer den Shop.
 * `bearbeitet`: KI-bearbeitet oder umgefaerbt - die Farbe kann vom echten Produkt abweichen, deshalb
 * vorher gegen das Musterfoto abgleichen (bei Juniva 16.10. so ein Fehler gefunden).
 */
export function werbeFreigabe(zeile) {
  if (!zeile) return { erlaubt: false, bearbeitet: false, grund: 'nicht in der Bildrechte-Liste' };
  const lizenz = String(zeile.lizenz ?? ''); const bearbeitung = String(zeile.bearbeitet ?? '');
  const bearbeitet = /\bKI\b|KI-/.test(lizenz) || /\bKI\b|KI-|higgsfield|nano banana|umgef(ae|ä)rbt/i.test(bearbeitung);
  if (!['geprueft', 'freigegeben'].includes(zeile.status)) return { erlaubt: false, bearbeitet, grund: `Status ${zeile.status || 'leer'}` };
  if (!/Werbung erlaubt|Bildrechte inkl\. KI/.test(lizenz)) return { erlaubt: false, bearbeitet, grund: `nur Shop (${lizenz || 'ohne Lizenz'})` };
  return { erlaubt: true, bearbeitet, grund: null, lizenz };
}

/** Dateiname eines Shopify-Bildes ohne Abfrage und ohne den Zusatz, den Shopify bei gleichen Namen anhaengt. */
export function bildName(src) {
  return String(src ?? '').split('?')[0].split('/').pop().toLowerCase()
    .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.\w+$)/, '');
}

// --- Kandidaten ---------------------------------------------------------------

const AKTION = ['auslauf', 'angebot'];

/**
 * Welche Produkte taugen gerade fuer ein Reel? Aus dem Produktfeed (products.json), der
 * Bildrechte-Liste und dem Stand der Datenbank (wann zuletzt beworben).
 */
export function reelKandidaten({ feed, bildrechte, stand = new Map(), nachfrage = new Map(), jetzt = new Date(), regeln = REEL_REGELN }) {
  const aus = [];
  for (const p of feed) {
    const tags = (p.tags ?? []).map(t => String(t).toLowerCase());
    if (tags.some(t => AKTION.includes(t))) continue;
    const varianten = p.variants ?? [];
    if (!varianten.some(v => v.available)) continue;
    if (varianten.some(v => Number(v.compare_at_price) > Number(v.price))) continue;
    if (/^muster\b/i.test(p.title ?? '') || /^muster-/.test(p.handle)) continue;
    const n = normalisiere(p);
    if (n.zubehoer) continue;
    const zuletzt = stand.get(p.handle)?.zuletzt_beworben;
    if (zuletzt && jetzt.getTime() - new Date(zuletzt).getTime() < regeln.ruheTage * TAG) continue;

    const imShop = new Map((p.images ?? []).map(b => [bildName(b.src), b]));
    const bilder = [];
    for (const z of bildrechte.nachHandle.get(p.handle) ?? []) {
      const f = werbeFreigabe(z);
      if (!f.erlaubt) continue;
      if (!(z.bildtyp === 'raum' || /raum/i.test(z.datei))) continue;
      const bild = imShop.get(bildName(z.datei));
      if (!bild) continue;   // nicht mehr am Produkt
      const breite = Number(bild.width) || Number(z.breite) || 0; const hoehe = Number(bild.height) || Number(z.hoehe) || 0;
      if (Math.max(breite, hoehe) < regeln.mindestKante) continue;
      bilder.push({ src: bild.src.split('?')[0], breite, hoehe, alt: bild.alt ?? null, mediaId: mediumNummer(z.media_id), lizenz: f.lizenz, bearbeitet: f.bearbeitet, varianten: bild.variant_ids ?? [] });
    }
    if (!bilder.length) continue;
    bilder.sort((a, b) => Number(a.bearbeitet) - Number(b.bearbeitet) || Math.max(b.breite, b.hoehe) - Math.max(a.breite, a.hoehe));
    aus.push({
      handle: p.handle, titel: p.title, typ: p.product_type ?? '', url: `${BETRIEB.shop}/products/${p.handle}`, familie: n.familie,
      echtesFoto: !bilder[0].bearbeitet, nachfrage: nachfrage.get(n.familienName.toLowerCase()) ?? 0,
      zuletztBeworben: zuletzt ?? null, bilder,
      varianten: varianten.map(v => ({ id: v.id, titel: v.title, preis: Number(v.price), verfuegbar: Boolean(v.available) })),
    });
  }
  // Echte Fotos zuerst (ohne Abgleich mit dem Musterfoto verwendbar), dann was Kunden als Muster bestellen.
  // Je Serie nur ein Vorschlag - sonst stuenden drei Dekore derselben Diele untereinander.
  const gesehen = new Set();
  return aus
    .sort((a, b) => Number(b.echtesFoto) - Number(a.echtesFoto) || b.nachfrage - a.nachfrage || a.titel.localeCompare(b.titel, 'de'))
    .filter(k => !gesehen.has(k.familie) && gesehen.add(k.familie));
}

// --- Auftrag ------------------------------------------------------------------

export const euro = betrag => Number(betrag).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const runde = x => Math.round(x * 10) / 10;

/**
 * Vorschlag fuer einen Auftrag. Ausschnitt 4:5 ueber die volle Bildhoehe, Anker und Produktflaeche
 * im unteren Drittel (dort liegt meist der Boden) - die Redaktion prueft das mit `reel-vorschau`.
 * Preise: die Variante, zu der das Bild gehoert (sonst die guenstigste); bei Paketware Paket- UND
 * Quadratmeterpreis (Inhaber 16.10.2026), m²-Preis aus dem Produktlexikon.
 */
export function auftragVorlage(kandidat, bild = kandidat.bilder[0], { lexikon = new Map() } = {}) {
  const { breite, hoehe } = bild;
  let b; let h; let x; let y;
  if (breite / hoehe > 0.8) { h = hoehe; b = hoehe * 0.8; x = (breite - b) / 2; y = 0; } else { b = breite; h = breite * 1.25; x = 0; y = hoehe - h; }
  const zumBild = kandidat.varianten.filter(v => bild.varianten.includes(v.id) && v.verfuegbar);
  const auswahl = (zumBild.length ? zumBild : kandidat.varianten.filter(v => v.verfuegbar));
  const variante = auswahl.reduce((a, v) => (v.preis < a.preis ? v : a), auswahl[0]);
  const jeM2 = lexikon.get(kandidat.handle);
  // "Arvento Eiche Natur geölt – Parkett-Landhausdiele 220 × 20,9 cm" -> "Arvento Eiche Natur geölt"
  const zeilen = { kicker: kandidat.typ, name: kurzTitel(kandidat.titel).split(/\s[–—-]\s/)[0], preis: '', preis_zusatz: '', merkmale: '' };
  const belege = [];
  if (jeM2?.einheit === 'm2' && jeM2.betrag > 0) {
    zeilen.preis = `${euro(jeM2.betrag)} €/m²`;
    belege.push(zeilen.preis);
    if (Math.abs(variante.preis - jeM2.betrag) > 0.005) {
      const flaeche = (variante.preis / jeM2.betrag).toLocaleString('de-DE', { maximumFractionDigits: 3 });
      zeilen.preis_zusatz = `${euro(variante.preis)} € pro Paket (${flaeche} m²)`;
      belege.push(`${flaeche} m²`);
    }
  } else {
    zeilen.preis = `${euro(variante.preis)} €`;
  }
  return {
    _hinweis: 'Ausschnitt, Anker und Produktflaeche mit reel-vorschau pruefen. preis_zusatz und merkmale nur mit Angaben, die so auf der Produktseite stehen - jede davon unter belege.',
    handle: kandidat.handle,
    standbild: bild.src,
    ausschnitt: [runde(x), runde(y), runde(b), runde(h)],
    zoom: [1.0, 1.08],
    anker: [runde(x + b / 2), runde(y + h * 0.78)],
    produktflaeche: [runde(x + b * 0.1), runde(y + h * 0.62), runde(x + b * 0.9), runde(y + h * 0.95)],
    varianten: { [variante.titel]: euro(variante.preis) },
    belege,
    zeilen,
    ...(bild.bearbeitet ? { ki_abgleich: '' } : {}),
  };
}

const BETRAG = /\d{1,3}(?:\.\d{3})*,\d{2}(?=\s?€)/g;

/** Was sich ohne Shop pruefen laesst: Felder vollstaendig, jeder Eurobetrag belegt, keine Aktionssprache. */
export function pruefeAuftrag(a) {
  const fehler = [];
  if (!a || typeof a !== 'object') return ['Auftrag ist kein JSON-Objekt'];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(a.handle ?? '')) fehler.push('handle fehlt oder ist ungültig');
  if (!a.standbild) fehler.push('standbild fehlt');
  const zahlen = (wert, n) => Array.isArray(wert) && wert.length === n && wert.every(Number.isFinite);
  if (!zahlen(a.ausschnitt, 4)) fehler.push('ausschnitt: [x, y, breite, hoehe] fehlt');
  if (!zahlen(a.produktflaeche, 4)) fehler.push('produktflaeche: [x0, y0, x1, y1] fehlt');
  if (a.anker !== undefined && !zahlen(a.anker, 2)) fehler.push('anker: [x, y]');
  if (a.zoom !== undefined && !(zahlen(a.zoom, 2) && a.zoom[0] >= 1 && a.zoom[1] > a.zoom[0] && a.zoom[1] <= 1.15)) fehler.push('zoom: [1.0, hoechstens 1.15]');
  const z = a.zeilen ?? {};
  for (const k of ['kicker', 'name', 'preis', 'preis_zusatz', 'merkmale']) if (!String(z[k] ?? '').trim()) fehler.push(`zeilen.${k} fehlt`);
  const varianten = a.varianten && typeof a.varianten === 'object' ? a.varianten : {};
  if (!Object.keys(varianten).length) fehler.push('varianten: mindestens die gezeigte Variante mit Preis');
  for (const [titel, preis] of Object.entries(varianten)) if (!/^\d{1,3}(\.\d{3})*,\d{2}$/.test(String(preis))) fehler.push(`varianten["${titel}"]: Preis wie „44,90“`);
  const belege = Array.isArray(a.belege) ? a.belege.map(String) : [];
  if (!belege.length) fehler.push('belege fehlen – jede Angabe im Bild muss auf der Produktseite stehen');
  const alleZeilen = Object.values(z).join(' ');
  for (const betrag of alleZeilen.match(BETRAG) ?? []) {
    if (!belege.some(b => b.includes(betrag)) && !Object.values(varianten).includes(betrag)) fehler.push(`Betrag ${betrag} € ist weder belegt noch Variantenpreis`);
  }
  if (/%|statt|UVP|reduziert|Aktion|Rabatt|sparen/i.test(alleZeilen)) fehler.push('Reels zeigen keine Aktionen (kein %, statt, UVP, Rabatt) – dafür gibt es die Vorlage angebot');
  return fehler;
}

// --- Live-Pruefung ------------------------------------------------------------

const ENTITAETEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', euro: '€', sup2: '²', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', times: '×', middot: '·' };

/** Sichtbarer Text im <main> der Produktseite - dort stehen Preis, Grundpreis und Eigenschaften. */
export function hauptText(html) {
  const m = /<main\b[\s\S]*?<\/main>/i.exec(String(html));
  if (!m) return null;
  return m[0]
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+\d?);/gi, (g, n) => ENTITAETEN[n] ?? g)
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const pause = ms => new Promise(r => setTimeout(r, ms));

/**
 * Holt Produktdaten (/products/<handle>.js) und den Seitentext. Der Shop zeigt bei schnellen
 * Abrufen eine Bot-Pruefung statt der Daten - deshalb nacheinander und mit Pause, und eine
 * HTML-Antwort gilt als Fehler, nie als Produkt.
 */
export async function liveDaten(handle, { holen = globalThis.fetch, basis = BETRIEB.shop, pauseMs = 800 } = {}) {
  const kopf = { 'User-Agent': 'Mozilla/5.0 (Teppich Paradies Social-Reel-Pruefung)' };
  const js = await holen(`${basis}/products/${handle}.js`, { headers: { ...kopf, Accept: 'application/json' } });
  if (js.status === 404) return { fehlt: true };
  if (!js.ok) throw new ReelFehler(`Shop antwortet mit HTTP ${js.status} auf ${handle}.js`);
  const roh = await js.text();
  if (roh.trimStart().startsWith('<')) throw new ReelFehler('Shop zeigt eine Bot-Prüfung statt der Produktdaten – später erneut versuchen');
  const produkt = JSON.parse(roh);
  if (pauseMs) await pause(pauseMs);
  const seite = await holen(`${basis}/products/${handle}`, { headers: { ...kopf, Accept: 'text/html' } });
  if (!seite.ok) throw new ReelFehler(`Produktseite ${handle}: HTTP ${seite.status}`);
  const text = hauptText(await seite.text());
  if (!text) throw new ReelFehler('Produktseite ohne <main> – vermutlich Bot-Prüfung, später erneut versuchen');
  return { produkt, text };
}

/** Stimmt der Auftrag mit dem Shop von jetzt ueberein? Liefert die Abweichungen. */
export function pruefeLive(auftrag, { produkt, text, fehlt = false }) {
  if (fehlt) return ['Produkt ist nicht mehr im Shop'];
  const fehler = [];
  if (!produkt.available) fehler.push('Produkt ist nicht verfügbar');
  const tags = (produkt.tags ?? []).map(t => String(t).toLowerCase());
  for (const t of AKTION) if (tags.includes(t)) fehler.push(`Tag „${t}“ gesetzt – kein Produkt-Reel`);
  for (const [titel, preis] of Object.entries(auftrag.varianten ?? {})) {
    const v = (produkt.variants ?? []).find(x => x.title === titel);
    if (!v) { fehler.push(`Variante „${titel}“ gibt es nicht mehr`); continue; }
    const ist = euro(v.price / 100);
    if (ist !== preis) fehler.push(`${titel}: Preis ${ist} € statt ${preis} €`);
    if (!v.available) fehler.push(`${titel}: nicht verfügbar`);
    if (v.compare_at_price && v.compare_at_price > v.price) fehler.push(`${titel}: hat einen Vergleichspreis (Aktion)`);
  }
  for (const b of auftrag.belege ?? []) if (!text.includes(String(b).replace(/[  ]/g, ' '))) fehler.push(`steht nicht (mehr) auf der Produktseite: „${b}“`);
  return fehler;
}

// --- Werkzeug (Python) --------------------------------------------------------

function finde(kandidaten, name) {
  for (const k of kandidaten) if (k && fs.existsSync(k)) return k;
  try { return execFileSync('/usr/bin/which', [name], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}

/** Wie das Python-Werkzeug gestartet wird: SOCIAL_REEL_PYTHON (eine Umgebung mit numpy/OpenCV/Pillow) oder uv. */
export function reelWerkzeug(env = process.env) {
  const skript = path.join(REPO, 'social', 'werkzeuge', 'reel_zoom.py');
  if (env.SOCIAL_REEL_PYTHON) return { befehl: env.SOCIAL_REEL_PYTHON, args: [skript] };
  const uv = finde(['/opt/homebrew/bin/uv', '/usr/local/bin/uv', path.join(os.homedir(), '.local', 'bin', 'uv'), path.join(os.homedir(), '.cargo', 'bin', 'uv')], 'uv');
  return uv ? { befehl: uv, args: ['run', '--quiet', '--script', skript] } : null;
}

/** Schrift (Inter) und Logo liegen privat, nicht im Repository - einmal einrichten, siehe REDAKTION.md. */
export function werkzeugDateien(dir = socialDir(), env = process.env) {
  return {
    schrift: env.SOCIAL_REEL_SCHRIFT || path.join(dir, 'werkzeug', 'inter-variable-font.woff2'),
    logo: env.SOCIAL_REEL_LOGO || path.join(dir, 'werkzeug', 'logo.png'),
  };
}

/** Startet reel_zoom.py und liefert dessen JSON-Ergebnis (letzte Ausgabezeile). */
export async function rufeWerkzeug(modus, auftragDatei, { dir = socialDir(), env = process.env, ausfuehren = starte } = {}) {
  const w = reelWerkzeug(env);
  if (!w) throw new ReelFehler('Weder uv noch SOCIAL_REEL_PYTHON gefunden (brew install uv)');
  const { schrift, logo } = werkzeugDateien(dir, env);
  const ffmpeg = ffmpegPfad();
  if (modus === 'rendern' && !ffmpeg) throw new ReelFehler('ffmpeg ist nicht installiert (brew install ffmpeg)');
  const args = [...w.args, modus, auftragDatei, '--schrift', schrift, '--logo', logo, ...(ffmpeg ? ['--ffmpeg', ffmpeg] : [])];
  let stdout;
  try {
    ({ stdout } = await ausfuehren(w.befehl, args, { timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }));
  } catch (e) {
    stdout = e.stdout;
    if (!stdout) throw new ReelFehler(`reel_zoom.py: ${String(e.stderr || e.message).trim().split('\n').slice(-3).join(' ')}`);
  }
  const zeile = String(stdout).trim().split('\n').pop();
  let ergebnis;
  try { ergebnis = JSON.parse(zeile); } catch { throw new ReelFehler(`reel_zoom.py lieferte kein Ergebnis: ${zeile.slice(0, 200)}`); }
  if (ergebnis.fehler) throw new ReelFehler(`Auftrag: ${ergebnis.fehler}`);
  return ergebnis;
}

/** Laedt das Originalbild vom Shop-CDN (ohne Groessenangabe = volle Aufloesung). */
export async function ladeStandbild(src, ziel, { holen = globalThis.fetch } = {}) {
  const url = new URL(src);
  if (url.hostname !== 'cdn.shopify.com' && !url.hostname.endsWith('teppich-paradies.net')) throw new ReelFehler('Standbild nur aus dem eigenen Shop (cdn.shopify.com)');
  url.searchParams.delete('width'); url.searchParams.delete('height');
  const r = await holen(url.toString());
  if (!r.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) throw new ReelFehler(`Standbild nicht ladbar (HTTP ${r.status})`);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, Buffer.from(await r.arrayBuffer()));
  return ziel;
}

const heute = jetzt => jetzt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
const tagIso = jetzt => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);

/**
 * Welches Bild zeigt das Reel, und darf es in Werbung? Shop-Bilder werden an ihren Medien-IDs in der
 * Bildrechte-Liste nachgeschlagen; ein eigenes Bild (lokale Datei) braucht `bildrecht` und den Inhaber.
 */
export function bildPruefen(auftrag, produkt, bildrechte) {
  if (/^https?:\/\//.test(auftrag.standbild)) {
    const name = bildName(auftrag.standbild);
    const medium = (produkt.media ?? []).find(m => bildName(m.src) === name);
    if (!medium) throw new ReelFehler('Das Standbild gehört nicht (mehr) zu diesem Produkt');
    const f = werbeFreigabe(bildrechte.nachMedium.get(String(medium.id)));
    if (!f.erlaubt) throw new ReelFehler(`Bild nicht für Werbung freigegeben: ${f.grund}`);
    if (f.bearbeitet && String(auftrag.ki_abgleich ?? '').trim().length < 20) {
      throw new ReelFehler('Raumbild ist KI-bearbeitet oder umgefärbt: erst neben das echte Musterfoto legen (Struktur und Farbton) und das Ergebnis in ki_abgleich eintragen');
    }
    return { src: auftrag.standbild.split('?')[0], mediaId: String(medium.id), alt: medium.alt ?? null, lizenz: f.lizenz, bearbeitet: f.bearbeitet, kiAbgleich: f.bearbeitet ? auftrag.ki_abgleich : null, bildrechtGeprueft: true };
  }
  if (!fs.existsSync(auftrag.standbild)) throw new ReelFehler(`Standbild fehlt: ${auftrag.standbild}`);
  if (String(auftrag.bildrecht ?? '').trim().length < 10) throw new ReelFehler('Eigenes Standbild: in bildrecht eintragen, woher es stammt und wer es freigegeben hat');
  return { src: null, mediaId: null, alt: null, lizenz: auftrag.bildrecht, bearbeitet: Boolean(auftrag.ki_abgleich), kiAbgleich: auftrag.ki_abgleich ?? null, bildrechtGeprueft: false };
}

/** Bereitet die Dateien eines Auftrags vor (Standbild laden, Pfade setzen) und schreibt auftrag.json. */
async function arbeitsauftrag(auftrag, ordner, { holen, jetzt }) {
  fs.mkdirSync(ordner, { recursive: true });
  const standbild = path.join(ordner, `standbild${/^https?:\/\//.test(auftrag.standbild) ? '.jpg' : path.extname(auftrag.standbild).toLowerCase()}`);
  if (/^https?:\/\//.test(auftrag.standbild)) await ladeStandbild(auftrag.standbild, standbild, { holen });
  else if (path.resolve(auftrag.standbild) !== standbild) fs.copyFileSync(auftrag.standbild, standbild);
  const fertig = {
    ...auftrag, standbild, stand: heute(jetzt),
    aus: path.join(ordner, 'reel.mp4'), pruefblatt: path.join(ordner, 'pruefblatt.jpg'),
  };
  const datei = path.join(ordner, 'auftrag.json');
  fs.writeFileSync(datei, JSON.stringify(fertig, null, 1));
  return { fertig, datei };
}

/** Nur ansehen: drei Reel-Bilder und das Standbild mit Ausschnitt, Zoom-Ende, Produktflaeche und Anker. */
export async function reelVorschau(auftrag, { holen = globalThis.fetch, werkzeug = rufeWerkzeug, dir = socialDir(), env = process.env, jetzt = new Date() } = {}) {
  const ordner = path.join(medienDir(dir), 'produkt-reel', `vorschau-${auftrag.handle}`);
  const { datei } = await arbeitsauftrag(auftrag, ordner, { holen, jetzt });
  return werkzeug('vorschau', datei, { dir, env });
}

/**
 * Baut ein Produkt-Reel und legt es in die Freigabe. Bricht ab, bevor etwas angelegt wird, wenn der
 * Shop etwas anderes sagt als der Auftrag, das Bild nicht fuer Werbung freigegeben ist oder das Video
 * weicher ist als das Standbild (dann bleiben Video und Pruefblatt zum Ansehen liegen).
 */
export async function erstelleProduktReel(db, { auftrag, text, plattformen = PLATTFORMEN, von = 'redaktion' }, {
  holen = globalThis.fetch, werkzeug = rufeWerkzeug, bildrechte = null, dir = socialDir(), env = process.env, jetzt = new Date(), pauseMs = 800,
} = {}) {
  const fehler = pruefeAuftrag(auftrag);
  if (fehler.length) throw new ReelFehler(`Auftrag unvollständig: ${fehler.join(' · ')}`);
  const live = await liveDaten(auftrag.handle, { holen, pauseMs });
  const abweichung = pruefeLive(auftrag, live);
  if (abweichung.length) throw new ReelFehler(`Live-Prüfung: ${abweichung.join(' · ')}`);
  const bild = bildPruefen(auftrag, live.produkt, bildrechte ?? ladeBildrechte());

  const bodenart = live.produkt.type || '';
  const tags = hashtags({ bodenart, typ: 'produkt_reel' });
  const beitragText = String(text ?? '').trim();
  const textPruefung = pruefeText(beitragText, { hashtags: tags });
  if (!textPruefung.ok) throw new ReelFehler(`Text abgelehnt: ${textPruefung.fehler.join(' · ')}`);

  const schluessel = `produkt-reel:${auftrag.handle}:${tagIso(jetzt)}`;
  const vorhanden = db.sql.prepare('SELECT id FROM inhalt WHERE schluessel = ?').get(schluessel);
  if (vorhanden) throw new ReelFehler(`Heute gibt es schon ein Reel zu ${auftrag.handle} (Inhalt #${vorhanden.id})`);

  const ordner = path.join(medienDir(dir), 'produkt-reel', `${tagIso(jetzt)}-${auftrag.handle}`);
  const { fertig, datei } = await arbeitsauftrag(auftrag, ordner, { holen, jetzt });
  const ergebnis = await werkzeug('rendern', datei, { dir, env });
  if (!ergebnis.ok) throw new ReelFehler(`Schärfeprüfung nicht bestanden: ${ergebnis.gruende.join(' · ')} – Prüfblatt: ${fertig.pruefblatt}`);

  const url = `${BETRIEB.shop}/products/${auftrag.handle}`;
  const { id: inhaltId } = db.inhaltAnlegen({
    quelle: 'shopify', typ: 'produkt_reel', schluessel,
    titel: `Produkt-Reel: ${auftrag.zeilen.name}`, bodenart, produkt_handle: auftrag.handle, produkt_titel: live.produkt.title,
    einwilligung: true, eingereicht_von: von, punkte: 30,
    daten: {
      url, stand: tagIso(jetzt), auftrag: { ...auftrag, stand: fertig.stand }, bild, bildrechtGeprueft: bild.bildrechtGeprueft,
      pruefung: { ok: ergebnis.ok, ganzesVideo: ergebnis.ganzes_video, zeitpunkte: ergebnis.zeitpunkte },
    },
  });
  const rel = p => path.relative(dir, p);
  const mediumId = db.mediumAnlegen(inhaltId, {
    art: 'bild', rolle: 'raum', url: bild.src, pfad: rel(fertig.standbild),
    beschriftung: bild.alt, pruefung: 'ok', datenschutz: 'ok', reihenfolge: 0,
  });
  const id = db.beitragAnlegen({
    inhalt_id: inhaltId, format: 'reel', plattformen: plattformen.filter(p => PLATTFORMEN.includes(p)), vorlage: 'reel_zoom',
    text: beitragText, hashtags: tags.join(' '),
    medien: [
      { pfad: rel(fertig.aus), art: 'video', vorlage: 'reel_zoom', quellen: [mediumId] },
      // Wird nie veroeffentlicht - steht in der Zentrale neben dem Video, damit man die Schaerfe sieht.
      { pfad: rel(fertig.pruefblatt), art: 'pruefung', vorlage: 'pruefblatt', quellen: [] },
    ],
  });
  let beitrag = db.beitragAendern(id, { link: shopLink(url, { beitragId: id, plattform: 'facebook' }) });
  let inhalt = db.inhaltAendern(inhaltId, { status: INHALT_STATUS.IN_PRUEFUNG });
  inhalt = db.inhaltAendern(inhaltId, { status: INHALT_STATUS.CONTENT_ERSTELLT });
  const medien = db.medien(inhaltId);
  beitrag = db.beitragAendern(id, { hinweise: pruefe({ beitrag, inhalt, medien }), auto_freigabe: autoFreigabeMoeglich({ beitrag, inhalt, medien }, env) });
  db.ereignis(von, 'entwurf-erstellt', `beitrag:${id}`, { inhalt: inhaltId, format: 'reel', vorlage: 'reel_zoom', handle: auftrag.handle });
  return { beitrag, inhalt, pruefung: ergebnis };
}

/**
 * Letzte Pruefung vor dem Veroeffentlichen: Preisstand nicht zu alt, Shop unveraendert.
 * Jede Abweichung ist eine Sperre - der Beitrag geht zurueck in die Freigabe.
 */
export async function produktReelSperren(inhalt, { holen = globalThis.fetch, jetzt = new Date(), regeln = REEL_REGELN, pauseMs = 800 } = {}) {
  const d = inhalt.daten ?? {};
  if (!d.auftrag) return ['Produkt-Reel ohne Auftrag – neu bauen'];
  const alter = (jetzt.getTime() - new Date(`${d.stand}T12:00:00Z`).getTime()) / TAG;
  if (!(alter <= regeln.maxAlterTage)) return [`Preisstand vom ${d.auftrag.stand ?? d.stand} ist älter als ${regeln.maxAlterTage} Tage – Reel neu bauen`];
  try {
    const live = await liveDaten(d.auftrag.handle, { holen, pauseMs });
    return pruefeLive(d.auftrag, live).map(f => `Live-Prüfung: ${f}`);
  } catch (e) {
    return [`Live-Prüfung nicht möglich: ${e.message}`];
  }
}
