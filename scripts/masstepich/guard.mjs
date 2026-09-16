#!/usr/bin/env node
/**
 * Prueft Teppich nach Mass gegen die Regeln des Inhabers (2026-09-11).
 *
 *   npm run masstepich:guard                          # Theme-Dateien
 *   npm run masstepich:guard -- --snapshot <datei>    # zusaetzlich Produktdaten
 *        [--konfig <datei>]                           # interne Konfiguration
 *
 * Theme (immer):
 *   - kein Lieferantenname in Dateien, die Shopify ausliefert. Die Namensliste
 *     liegt nur intern (Konfiguration oder TP_LIEFERANTEN_NAMEN); fehlt sie,
 *     wird das ausdruecklich gemeldet statt still zu bestehen.
 *   - die Storefront liest nie den internen Namespace einkauf.*
 *   - Freigaben werden nur als exakter Vergleich mit "Verfügbar" gelesen
 * Produktdaten (Snapshot, Format siehe plan.mjs):
 *   - service.einfassen / service.raummass nur mit bekannten Werten
 *   - "Verfügbar" nur an freigegebenen VARIANTEN (Regel 4/5/8); eine
 *     Wunschmass-Variante nur, wenn alle Meterware-Varianten ihrer Farbe
 *     freigegeben sind; eine Einfassvariante nur ueber ihre Basisvariante
 *   - Raummass-Preis = Meterware-Preis derselben Farbe + Aufschlag
 *   - Einfassprodukte: preis_pro_001_qm, Grenzen je Rollenbreite, Einfassart, Formen
 *   - kein Lieferantenname in kundensichtbaren Feldern
 * Exit 1 bei jedem Fehler - nichts wird still korrigiert.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ARTEN, FORMEN, KONFIG_STANDARD, SERVICE_WERTE, VERFUEGBAR, WUNSCH, breiteCm, ladeLieferantenNamen,
  lieferantenTreffer, maxBreiteCm, namenSet, raummassPreis,
} from './lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const THEME_DIRS = ['assets', 'blocks', 'layout', 'sections', 'snippets', 'templates'];
const TEXT = /\.(liquid|json|js|css|svg)$/;

function dateien(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? dateien(p) : TEXT.test(n) ? [p] : [];
  });
}

export function pruefeTheme(root = ROOT, namen = ladeLieferantenNamen()) {
  const fehler = [];
  for (const d of THEME_DIRS) {
    for (const f of dateien(join(root, d))) {
      const rel = f.slice(root.length + 1);
      const text = readFileSync(f, 'utf8');
      if (lieferantenTreffer(text, namen).length) fehler.push(`${rel}: Lieferantenname im ausgelieferten Theme`);
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

function breitenIndex(p) {
  return (p.options || []).findIndex((o) => (o.values || []).some((x) => breiteCm(x) !== null));
}

/** Groesste Rollenbreite je Farbe (Schluessel = uebrige Optionswerte). */
function rollenJeFarbe(p) {
  const wIdx = breitenIndex(p);
  const jeFarbe = new Map();
  if (wIdx === -1) {
    const m = Number(mf(p, 'custom.rollenbreite'));
    if (m > 0) jeFarbe.set('*', Math.round(m * 100));
    return jeFarbe;
  }
  for (const v of p.variants || []) {
    const b = breiteCm(v.options?.[wIdx]);
    if (!b) continue;
    const farbe = v.options.filter((_, i) => i !== wIdx).join('|');
    jeFarbe.set(farbe, Math.max(jeFarbe.get(farbe) || 0, b));
  }
  return jeFarbe;
}

/**
 * @param {{products: object[]}} snapshot
 * @param {{prozent:number, max_laenge_cm:number, freigabe:{id:string, varianten:string[]}[], gesperrte_ids?:string[], lieferantennamen?:string[]}} konfig
 */
export function pruefeDaten(snapshot, konfig, namen = namenSet(konfig.lieferantennamen)) {
  const fehler = [];
  const freiProdukte = new Set((konfig.freigabe || []).map((p) => p.id));
  const freiVarianten = new Set((konfig.freigabe || []).flatMap((p) => p.varianten || []));
  const gesperrt = new Set(konfig.gesperrte_ids || []);
  const produkte = snapshot.products || [];
  const byId = new Map(produkte.map((p) => [p.id, p]));
  const variantenProdukt = new Map();
  produkte.forEach((p) => (p.variants || []).forEach((v) => variantenProdukt.set(v.id, p)));

  for (const p of produkte) {
    const art = String(mf(p, 'service.einfassung') ?? '').trim().toLowerCase();
    const basisId = mf(p, 'service.einfass_basis');
    const istEinfass = !!mf(p, 'service.einfassung');

    const sichtbar = [p.title, p.handle, p.vendor, p.productType, ...(p.tags || []),
      ...(p.options || []).flatMap((o) => [o.name, ...(o.values || [])]),
      ...(p.variants || []).flatMap((v) => [v.sku, v.title]),
      ...Object.entries(p.metafields || {}).filter(([k]) => !k.startsWith('einkauf.')).map(([, v]) => JSON.stringify(v))];
    if ((freiProdukte.has(p.id) || istEinfass) && lieferantenTreffer(sichtbar.join(' '), namen).length) {
      fehler.push(`${p.title}: Lieferantenname in kundensichtbaren Feldern`);
    }

    const wIdx = breitenIndex(p);
    for (const v of p.variants || []) {
      for (const feld of ['service.einfassen', 'service.raummass']) {
        const wert = mf(v, feld);
        if (wert == null) continue;
        if (!SERVICE_WERTE.includes(wert)) { fehler.push(`${p.title} / ${v.title}: ${feld} = "${wert}" ist kein bekannter Wert`); continue; }
        if (wert !== VERFUEGBAR) continue;
        if (gesperrt.has(p.id) || gesperrt.has(basisId)) { fehler.push(`${p.title}: gesperrter Lieferant mit ${feld} = Verfügbar (Datenfehler)`); continue; }
        if (istEinfass) {
          const bv = mf(v, 'service.basisvariante');
          if (!bv || !freiVarianten.has(bv)) fehler.push(`${p.title} / ${v.title}: ${feld} = Verfügbar, aber die Basisvariante ist nicht freigegeben`);
          continue;
        }
        const istWunsch = wIdx !== -1 && WUNSCH.test(String(v.options?.[wIdx] ?? '').trim());
        if (feld === 'service.raummass' && !istWunsch) { fehler.push(`${p.title} / ${v.title}: service.raummass gehört nur an Wunschmaß-Varianten`); continue; }
        if (!istWunsch) {
          if (!freiVarianten.has(v.id)) fehler.push(`${p.title} / ${v.title}: ${feld} = Verfügbar ohne Freigabe dieser Variante`);
          continue;
        }
        const farbe = v.options.filter((_, i) => i !== wIdx).join('|');
        const basis = (p.variants || []).filter((x) => x !== v && x.options.filter((_, i) => i !== wIdx).join('|') === farbe);
        if (!basis.length || !basis.every((x) => freiVarianten.has(x.id))) {
          fehler.push(`${p.title} / ${v.title}: ${feld} = Verfügbar, aber die Farbe ist nicht vollständig freigegeben`);
        }
      }
    }

    if (!istEinfass) {
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
      const rollen = [...new Set(rollenJeFarbe(basis).values())];
      if (!rollen.length) fehler.push(`${p.title}: Rollenbreite der Meterware unbekannt`);
      else if (rollen.length > 1) fehler.push(`${p.title}: Farben der Meterware mit verschieden breiten Rollen (${rollen.join(' / ')} cm)`);
      else if (maxB !== maxBreiteCm(rollen[0], art)) fehler.push(`${p.title}: max_breite_cm ${maxB} statt ${maxBreiteCm(rollen[0], art)}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const namen = ladeLieferantenNamen();
  const fehler = pruefeTheme(ROOT, namen);
  if (!namen) console.warn('HINWEIS  Namensprüfung übersprungen: keine interne Liste (TP_LIEFERANTEN_NAMEN oder Konfiguration).');
  const snap = arg('--snapshot');
  if (snap) {
    const kPfad = arg('--konfig') || process.env.TP_MASSTEPICH_KONFIG || KONFIG_STANDARD;
    if (!existsSync(kPfad)) {
      console.error(`Konfiguration fehlt: ${kPfad}`);
      process.exit(1);
    }
    fehler.push(...pruefeDaten(JSON.parse(readFileSync(snap, 'utf8')), JSON.parse(readFileSync(kPfad, 'utf8'))));
  }
  fehler.forEach((f) => console.error(`FEHLER  ${f}`));
  console.log(`Masstepich-Guard: ${snap ? 'Theme und Produktdaten' : 'Theme'} geprueft${namen ? '' : ' (ohne Namensliste)'}, ${fehler.length} Fehler.`);
  process.exit(fehler.length ? 1 : 0);
}
