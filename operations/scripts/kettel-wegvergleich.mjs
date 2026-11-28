#!/usr/bin/env node
/**
 * Wegvergleich grosser Kettelteppich (#2225), nur Rechnung, schreibt nichts.
 *   Weg A: Rohware im Fertigmass + Zugabe, eigener Kettler, Versand per Spedition (GEL)
 *   Weg B: beim Lieferanten fertig gekettelt, Direktversand
 * Eingaben mit Quelle: docs/analyse/kettel-wegvergleich-eingaben.json
 *   node operations/scripts/kettel-wegvergleich.mjs [--eigens]
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const STANDARD = [[2, 3], [3, 4], [4, 5]];

export function vergleiche(eingaben, { groessen = STANDARD, fahrt = 'gebuendelt' } = {}) {
  return groessen.map(([b, l]) => {
    const offen = [];
    const w = key => {
      const x = eingaben.werte[key]?.wert;
      if (typeof x !== 'number') offen.push(`${key} fehlt`);
      return x;
    };
    const flaeche = b * l, umfang = 2 * (b + l), ek = w('ekRohwareJeM2'), z = w('zugabeM');
    const gel = eingaben.gel[`${b}x${l}`]?.wert;
    if (typeof gel !== 'number') offen.push(`GEL-Preis fuer ${b}x${l} fehlt`);
    const a = {
      material: (b + z) * (l + z) * ek,
      ketteln: umfang * (flaeche > 6 ? w('kettlerAb6qmJeLfm') : w('kettlerBis6qmJeLfm')),
      arbeit: w('arbeitMin') / 60 * w('stundensatz'),
      fahrt: w(fahrt === 'eigens' ? 'fahrtEigens' : 'fahrtGebuendelt'),
      versand: gel,
    };
    const materialB = flaeche * ek;
    const bWeg = {
      material: materialB,
      ketteln: umfang * w('lieferantKettelnJeLfm'),
      fracht: w('lieferantFracht'),
      mindermenge: materialB < w('lieferantMindermengeUnterEk') ? w('lieferantMindermenge') : 0,
    };
    const summe = o => { const s = Object.values(o).reduce((x, y) => x + y, 0); return Number.isFinite(s) ? s : null; };
    const sa = offen.length ? null : summe(a), sb = offen.length ? null : summe(bWeg);
    const fertig = sa !== null && sb !== null;
    const rund = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, Number.isFinite(x) ? r2(x) : null]));
    return {
      groesse: `${b}x${l}`, flaecheM2: flaeche, umfangM: umfang,
      a: { ...rund(a), summe: sa === null ? null : r2(sa) },
      b: { ...rund(bWeg), summe: sb === null ? null : r2(sb) },
      differenz: fertig ? r2(sa - sb) : null,
      guenstiger: fertig ? (sa < sb ? 'A' : 'B') : null,
      // Bis zu dieser Fracht des Lieferanten bleibt Weg B guenstiger (seine Fracht ist am wenigsten belegt).
      frachtGleichstandB: fertig ? r2(sa - (sb - bWeg.fracht)) : null,
      offen,
    };
  });
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eingaben = JSON.parse(fs.readFileSync(new URL('../../docs/analyse/kettel-wegvergleich-eingaben.json', import.meta.url), 'utf8'));
  const fahrt = process.argv.includes('--eigens') ? 'eigens' : 'gebuendelt';
  const e = x => x === null ? '–' : `${Math.round(x)} €`;
  console.log(`Fahrt zum Kettler: ${fahrt}\n`);
  console.log('| Größe | m² | Weg A (Material/Ketteln/Arbeit/Fahrt/GEL) | Summe A | Weg B (Material/Ketteln/Fracht/Mindermenge) | Summe B | günstiger | Fracht-Gleichstand B |');
  console.log('|---|---:|---|---:|---|---:|---|---:|');
  for (const r of vergleiche(eingaben, { fahrt })) {
    const teile = o => Object.entries(o).filter(([k]) => k !== 'summe').map(([, x]) => e(x)).join(' / ');
    console.log(`| ${r.groesse} | ${r.flaecheM2} | ${teile(r.a)} | ${e(r.a.summe)} | ${teile(r.b)} | ${e(r.b.summe)} | ${r.guenstiger ?? 'offen: ' + r.offen.join(', ')} | ${e(r.frachtGleichstandB)} |`);
  }
}
