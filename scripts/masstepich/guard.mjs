#!/usr/bin/env node
/**
 * Prueft Teppich nach Mass gegen die Regeln des Inhabers (2026-09-11).
 *
 *   npm run masstepich:guard                          # Theme-Dateien
 *   npm run masstepich:guard -- --snapshot <datei>    # zusaetzlich Produktdaten
 *        [--konfig <datei>]                           # interne Konfiguration
 *
 * Theme (immer):
 *   - kein Lieferantenname in Dateien, die Shopify ausliefert (Hash-Abgleich)
 *   - die Storefront liest nie den internen Namespace einkauf.*
 *   - Freigaben werden nur als exakter Vergleich mit "Verfügbar" gelesen
 * Produktdaten (Snapshot, Format siehe plan.mjs):
 *   - service.einfassen / service.raummass nur mit bekannten Werten
 *   - "Verfügbar" nur an freigegebenen Produkten und deren Einfassprodukten
 *   - Raummass-Preis = Meterware-Preis derselben Farbe + Aufschlag
 *   - Einfassprodukte: preis_pro_001_qm, Grenzen, Einfassart, Formen
 *   - kein Lieferantenname in kundensichtbaren Feldern
 * Exit 1 bei jedem Fehler - nichts wird still korrigiert.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import {
  ARTEN, FORMEN, SERVICE_WERTE, VERFUEGBAR, WUNSCH, breiteCm, ladeLieferantenHashes,
  lieferantenTreffer, maxBreiteCm, raummassPreis,
} from './lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const THEME_DIRS = ['assets', 'blocks', 'layout', 'sections', 'snippets', 'templates'];
const TEXT = /\.(liquid|json|js|css|svg)$/;
const DEFAULT_KONFIG = join(os.homedir(), 'teppich-paradies-analyse/kettelservice/masstepich-konfig.json');

function dateien(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? dateien(p) : TEXT.test(n) ? [p] : [];
  });
}

export function pruefeTheme(root = ROOT, hashes = ladeLieferantenHashes()) {
  const fehler = [];
  for (const d of THEME_DIRS) {
    for (const f of dateien(join(root, d))) {
      const rel = f.slice(root.length + 1);
      const text = readFileSync(f, 'utf8');
      const treffer = lieferantenTreffer(text, hashes);
      if (treffer.length) fehler.push(`${rel}: Lieferantenname im ausgelieferten Theme (${treffer.length} Treffer)`);
      if (/metafields\.einkauf\b/.test(text)) fehler.push(`${rel}: liest den internen Namespace einkauf.*`);
      for (const m of text.matchAll(/service\.(einfassen|raummass)(?:\.value)?\s*(==|!=|contains)\s*'([^']*)'/g)) {
        if (m[2] !== '==' || m[3] !== VERFUEGBAR) fehler.push(`${rel}: service.${m[1]} nicht als exakter Vergleich mit "${VERFUEGBAR}" gelesen`);
      }
    }
  }
  return fehler;
}

function mf(obj, key) {
  return obj?.metafields?.[key] ?? null;
}

/**
 * @param {{products: object[]}} snapshot
 * @param {{prozent:number, max_laenge_cm:number, freigabe:{id:string}[], gesperrte_ids?:string[]}} konfig
 */
export function pruefeDaten(snapshot, konfig, hashes = ladeLieferantenHashes()) {
  const fehler = [];
  const frei = new Set((konfig.freigabe || []).map((p) => p.id));
  const gesperrt = new Set(konfig.gesperrte_ids || []);
  const produkte = snapshot.products || [];
  const byId = new Map(produkte.map((p) => [p.id, p]));
  const variantenProdukt = new Map();
  produkte.forEach((p) => (p.variants || []).forEach((v) => variantenProdukt.set(v.id, p)));

  for (const p of produkte) {
    const art = String(mf(p, 'service.einfassung') ?? '').trim().toLowerCase();
    const basisId = mf(p, 'service.einfass_basis');
    const istEinfass = !!mf(p, 'service.einfassung');
    const zulaessig = istEinfass ? frei.has(basisId) : frei.has(p.id);

    const sichtbar = [p.title, p.handle, p.vendor, p.productType, ...(p.tags || []),
      ...(p.options || []).flatMap((o) => [o.name, ...(o.values || [])]),
      ...(p.variants || []).flatMap((v) => [v.sku, v.title]),
      ...Object.entries(p.metafields || {}).filter(([k]) => !k.startsWith('einkauf.')).map(([, v]) => JSON.stringify(v))];
    const treffer = lieferantenTreffer(sichtbar.join(' '), hashes);
    if (treffer.length && (zulaessig || istEinfass)) fehler.push(`${p.title}: Lieferantenname in kundensichtbaren Feldern`);

    for (const v of p.variants || []) {
      for (const feld of ['service.einfassen', 'service.raummass']) {
        const wert = mf(v, feld);
        if (wert == null) continue;
        if (!SERVICE_WERTE.includes(wert)) fehler.push(`${p.title} / ${v.title}: ${feld} = "${wert}" ist kein bekannter Wert`);
        if (wert === VERFUEGBAR && !zulaessig) fehler.push(`${p.title} / ${v.title}: ${feld} = Verfügbar ohne Freigabe`);
        if (wert === VERFUEGBAR && (gesperrt.has(p.id) || gesperrt.has(basisId))) fehler.push(`${p.title}: gesperrter Lieferant mit ${feld} = Verfügbar (Datenfehler)`);
      }
    }

    if (!istEinfass) {
      const wIdx = (p.options || []).findIndex((o) => (o.values || []).some((x) => breiteCm(x) !== null));
      for (const v of p.variants || []) {
        if (wIdx === -1 || !WUNSCH.test(String(v.options?.[wIdx] ?? '').trim())) continue;
        if (mf(v, 'service.raummass') !== VERFUEGBAR) continue;
        const farbe = v.options.filter((_, i) => i !== wIdx).join('|');
        const basis = (p.variants || []).filter((x) => breiteCm(x.options?.[wIdx]) !== null && x.options.filter((_, i) => i !== wIdx).join('|') === farbe);
        const preise = [...new Set(basis.map((x) => Number(x.price)))];
        if (preise.length !== 1) {
          fehler.push(`${p.title} / ${v.title}: Raummass ohne eindeutigen Meterware-Preis (${preise.join(', ') || 'keiner'})`);
        } else if (Math.abs(Number(v.price) - raummassPreis(preise[0], konfig.prozent)) > 0.005) {
          fehler.push(`${p.title} / ${v.title}: Raummass-Preis ${v.price} statt ${raummassPreis(preise[0], konfig.prozent)}`);
        }
      }
      continue;
    }

    if (!ARTEN[art]) fehler.push(`${p.title}: service.einfassung "${mf(p, 'service.einfassung')}" unbekannt`);
    if (mf(p, 'custom.preis_pro_001_qm') !== true) fehler.push(`${p.title}: custom.preis_pro_001_qm fehlt`);
    const basis = byId.get(basisId);
    if (!basis) fehler.push(`${p.title}: service.einfass_basis zeigt auf kein Produkt im Snapshot`);
    const maxB = Number(mf(p, 'service.max_breite_cm'));
    const maxL = Number(mf(p, 'service.max_laenge_cm'));
    if (basis && ARTEN[art]) {
      const wIdx = (basis.options || []).findIndex((o) => (o.values || []).some((x) => breiteCm(x) !== null));
      const rollen = wIdx === -1 ? [] : basis.variants.map((x) => breiteCm(x.options[wIdx])).filter((x) => x);
      const soll = rollen.length ? maxBreiteCm(Math.max(...rollen), art) : null;
      if (soll === null) fehler.push(`${p.title}: Rollenbreite der Meterware unbekannt`);
      else if (maxB !== soll) fehler.push(`${p.title}: max_breite_cm ${maxB} statt ${soll}`);
    }
    if (!(maxL > 0) || maxL > konfig.max_laenge_cm) fehler.push(`${p.title}: max_laenge_cm ${maxL} ausserhalb 1..${konfig.max_laenge_cm}`);
    for (const f of mf(p, 'service.formen') || []) {
      if (!FORMEN.includes(f)) fehler.push(`${p.title}: Form "${f}" unbekannt`);
    }
    for (const v of p.variants || []) {
      const bv = mf(v, 'service.basisvariante');
      if (mf(v, 'service.einfassen') === VERFUEGBAR && (!bv || variantenProdukt.get(bv)?.id !== basisId)) {
        fehler.push(`${p.title} / ${v.title}: service.basisvariante gehoert nicht zur Meterware`);
      }
    }
  }
  return fehler;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fehler = pruefeTheme();
  const snap = arg('--snapshot');
  if (snap) {
    const kPfad = arg('--konfig') || DEFAULT_KONFIG;
    if (!existsSync(kPfad)) {
      console.error(`Konfiguration fehlt: ${kPfad}`);
      process.exit(1);
    }
    fehler.push(...pruefeDaten(JSON.parse(readFileSync(snap, 'utf8')), JSON.parse(readFileSync(kPfad, 'utf8'))));
  }
  fehler.forEach((f) => console.error(`FEHLER  ${f}`));
  console.log(`Masstepich-Guard: ${snap ? 'Theme und Produktdaten' : 'Theme'} geprueft, ${fehler.length} Fehler.`);
  process.exit(fehler.length ? 1 : 0);
}
