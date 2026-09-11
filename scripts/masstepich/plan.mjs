#!/usr/bin/env node
/**
 * Erzeugt den Aenderungsplan fuer Teppich nach Mass - fuehrt nichts aus.
 *
 *   npm run masstepich:plan -- --snapshot <produkte.json> [--konfig <datei>] [--out <datei>]
 *
 * Eingabe: Snapshot der freigegebenen Produkte aus der Admin API
 *   { products: [{ id, title, handle, vendor, status, metafields: {"ns.key": wert},
 *     options: [{ name, values }], variants: [{ id, title, sku, price, options,
 *     mediaId, imageUrl, metafields: {...} }] }] }
 * und die interne Konfiguration: Freigabeliste je Produkt MIT Variantenliste
 * (Regel 5/8 - freigegeben ist die Variante, nicht das Produkt), Aufschlag,
 * Preise, Lieferantennamen.
 *
 * Regel 9: bei jedem Konflikt wird fuer diese Farbe bzw. dieses Produkt nichts
 * geplant - der Mensch entscheidet. Ausgefuehrt wird der Plan erst nach
 * Freigabe, danach prueft guard.mjs das Ergebnis.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ARTEN, FORMEN, KONFIG_STANDARD, SERVICE_WERTE, VERFUEGBAR, WUNSCH, WUNSCHMASS, breiteCm, eigeneSku,
  handleSlug, kurzname, lieferantenTreffer, maxBreiteCm, namenSet, raummassPreis,
} from './lib.mjs';

function breitenIndex(p) {
  return (p.options || []).findIndex((o) => {
    const vals = o.values || [];
    const breiten = vals.filter((v) => breiteCm(v) !== null);
    return breiten.length > 0 && breiten.length + vals.filter((v) => WUNSCH.test(String(v).trim())).length === vals.length;
  });
}

function farbnummer(v) {
  const m = v.metafields || {};
  if (m['custom.farbcode']) return String(m['custom.farbcode']).trim();
  const sku = String(v.sku || '');
  if (sku.includes('_')) {
    const s = sku.split('_').pop().trim();
    if (s && s.length <= 10) return s;
  }
  return '';
}

/** Preis je 0,01 m2 aus einem m2-Preis; nur volle Euro sind exakt darstellbar. */
export function hundertstelPreis(m2Preis) {
  const cent = Math.round(Number(m2Preis) * 100);
  return cent % 100 === 0 ? cent / 10000 : null;
}

function preisFuer(konfig, art, produktId) {
  const w = konfig.preise?.[art];
  if (w == null) return null;
  if (typeof w === 'number') return w;
  return w[produktId] ?? null;
}

export function erstellePlan(snapshot, konfig, namen = namenSet(konfig.lieferantennamen)) {
  const byId = new Map((snapshot.products || []).map((p) => [p.id, p]));
  const gesperrt = new Set(konfig.gesperrte_ids || []);
  const plan = {
    erstellt: new Date().toISOString(),
    regeln: { aufschlag_prozent: konfig.prozent, max_laenge_cm: konfig.max_laenge_cm, formen: konfig.formen || FORMEN },
    breitenoption: [],
    einfassen_setzen: [],
    wunschmass_anlegen: [],
    einfassprodukte: [],
    konflikte: [],
  };
  const konflikt = (p, grund, farbe) => plan.konflikte.push({ produktId: p.id ?? p, titel: p.title ?? '', farbe: farbe ?? null, grund });

  for (const f of konfig.freigabe || []) {
    const p = byId.get(f.id);
    if (!p) { konflikt(f.id, 'freigegeben, aber nicht im Snapshot'); continue; }
    const freiVarianten = new Set(f.varianten || []);
    if (!freiVarianten.size) { konflikt(p, 'Freigabe ohne Variantenliste - freigegeben wird je Variante (Regel 5/8)'); continue; }
    if (gesperrt.has(p.id)) { konflikt(p, 'Produkt eines gesperrten Lieferanten in der Freigabeliste - Datenfehler, nichts geplant'); continue; }
    if (p.metafields?.['custom.preis_pro_001_qm'] === true) { konflikt(p, 'Meterware rechnet pro 0,01 m² - Raummass-Preis dafuer nicht vorgesehen'); continue; }
    if (lieferantenTreffer([p.title, p.handle, p.vendor].join(' '), namen).length) {
      konflikt(p, 'Lieferantenname in Titel, Handle oder Hersteller - erst bereinigen');
      continue;
    }

    const name = kurzname(p.title);
    let wIdx = breitenIndex(p);
    let produktRolle = null;
    if (wIdx === -1) {
      const m = Number(p.metafields?.['custom.rollenbreite'] ?? p.variants?.[0]?.metafields?.['custom.rollenbreite']);
      if (!(m > 0)) { konflikt(p, 'keine Breitenoption und keine custom.rollenbreite'); continue; }
      produktRolle = Math.round(m * 100);
      plan.breitenoption.push({ produktId: p.id, titel: p.title, option: 'Breite', wert: `${produktRolle} cm`, strategie: 'LEAVE_AS_IS' });
      wIdx = (p.options || []).length;
    }

    const gruppen = new Map();
    for (const v of p.variants || []) {
      const opts = [...v.options];
      const key = opts.filter((_, i) => i !== wIdx).join(' / ');
      if (!gruppen.has(key)) gruppen.set(key, { basis: [], wunsch: null, werte: opts.filter((_, i) => i !== wIdx) });
      const g = gruppen.get(key);
      if (WUNSCH.test(String(opts[wIdx] ?? '').trim())) g.wunsch = v; else g.basis.push(v);
    }

    const einfassVarianten = [];
    const farbRollen = new Set();
    for (const [farbe, g] of gruppen) {
      if (!g.basis.length) { konflikt(p, 'nur eine Wunschmaß-Variante, keine Meterware', farbe); continue; }
      // Regel 4/5: nur Varianten aus der Freigabeliste - eine neue Farbe wird nicht mitgenommen.
      const neu = g.basis.filter((v) => !freiVarianten.has(v.id));
      if (neu.length) { konflikt(p, `${neu.length} Variante(n) nicht in der Freigabeliste (neu seit der Freigabe?)`, farbe); continue; }
      const preise = [...new Set(g.basis.map((v) => Number(v.price)))];
      if (preise.length !== 1 || !(preise[0] > 0)) { konflikt(p, `Meterware-Preis nicht eindeutig (${preise.join(', ')})`, farbe); continue; }
      // Von Hand gesetzte Werte - auch an einer vorhandenen Wunschmass-Variante - gehen vor.
      const handWerte = [
        ...g.basis.map((v) => v.metafields?.['service.einfassen']),
        g.wunsch?.metafields?.['service.einfassen'],
        g.wunsch?.metafields?.['service.raummass'],
      ].filter((x) => x && x !== VERFUEGBAR);
      if (handWerte.length) {
        const bekannt = handWerte.every((x) => SERVICE_WERTE.includes(x));
        konflikt(p, bekannt ? `von Hand auf "${handWerte[0]}" gesetzt` : `unbekannter Wert "${handWerte[0]}"`, farbe);
        continue;
      }
      const soll = raummassPreis(preise[0], konfig.prozent);
      if (g.wunsch && Math.abs(Number(g.wunsch.price) - soll) > 0.005) {
        konflikt(p, `vorhandene Wunschmaß-Variante kostet ${g.wunsch.price} statt ${soll}`, farbe);
        continue;
      }
      const rollen = g.basis.map((v) => breiteCm(v.options[wIdx])).filter((x) => x);
      const farbRolle = rollen.length ? Math.max(...rollen) : produktRolle;
      if (!(farbRolle > 0)) { konflikt(p, 'Rollenbreite der Farbe unbekannt', farbe); continue; }

      const nr = farbnummer(g.basis[0]);
      g.basis.filter((v) => v.metafields?.['service.einfassen'] !== VERFUEGBAR)
        .forEach((v) => plan.einfassen_setzen.push({ variantId: v.id, produktId: p.id, farbe, feld: 'service.einfassen', wert: VERFUEGBAR }));

      const optionValues = [...g.werte];
      optionValues.splice(wIdx, 0, WUNSCHMASS);
      const vorlage = g.basis[0];
      if (g.wunsch) {
        ['service.einfassen', 'service.raummass'].filter((feld) => g.wunsch.metafields?.[feld] !== VERFUEGBAR)
          .forEach((feld) => plan.einfassen_setzen.push({ variantId: g.wunsch.id, produktId: p.id, farbe, feld, wert: VERFUEGBAR }));
      } else {
        // custom.farbcode und custom.farbe kopiert die Ausfuehrung von der
        // Meterware-Variante - die Farbnummer wird nie aus der SKU geraten.
        plan.wunschmass_anlegen.push({
          produktId: p.id, titel: p.title, farbe, optionValues, price: soll.toFixed(2),
          meterwarePreis: preise[0], rolleCm: farbRolle, sku: eigeneSku('RM', name, nr || farbe), mediaId: vorlage.mediaId ?? null,
          inventoryPolicy: vorlage.inventoryPolicy ?? null,
          metafields: { 'service.raummass': VERFUEGBAR, 'service.einfassen': VERFUEGBAR },
          kopiere_metafelder_von: vorlage.id, kopiere_felder: ['custom.farbcode', 'custom.farbe'],
        });
      }
      farbRollen.add(farbRolle);
      const breiteste = g.basis.reduce((a, v) => ((breiteCm(v.options[wIdx]) ?? 0) > (breiteCm(a.options[wIdx]) ?? 0) ? v : a), g.basis[0]);
      einfassVarianten.push({ farbe, werte: g.werte, farbnummer: nr, basisVarianteId: breiteste.id, imageUrl: breiteste.imageUrl ?? vorlage.imageUrl ?? null });
    }
    if (!einfassVarianten.length) continue;
    // Die Grenze eines Einfassprodukts gilt fuer alle Farben. Haben die Farben
    // verschieden breite Rollen, wuerde eine Farbe mehr erlauben, als ihre Rolle hat.
    if (farbRollen.size > 1) {
      konflikt(p, `Farben mit verschieden breiten Rollen (${[...farbRollen].sort((a, b) => a - b).join(' / ')} cm) - Einfassprodukte nicht geplant`);
      continue;
    }
    const maxRolle = [...farbRollen][0];

    for (const [art, a] of Object.entries(ARTEN)) {
      const m2 = preisFuer(konfig, art, p.id);
      const je001 = m2 == null ? null : hundertstelPreis(m2);
      if (m2 != null && je001 == null) konflikt(p, `${a.wert}: ${m2} €/m² ist pro 0,01 m² nicht exakt - nur volle Euro je m²`);
      plan.einfassprodukte.push({
        basisProduktId: p.id, art, titel: a.titel(name), handle: `${handleSlug(name)}-${a.handle}-nach-mass`,
        status: 'DRAFT', templateSuffix: 'einfassung', productType: 'Teppich nach Maß', vendor: p.vendor,
        plan_status: je001 == null ? 'wartet_auf_preis' : 'bereit',
        metafields: {
          'service.einfassung': a.wert,
          'service.max_breite_cm': maxBreiteCm(maxRolle, art),
          'service.max_laenge_cm': konfig.max_laenge_cm,
          'service.formen': konfig.formen || FORMEN,
          'service.einfass_basis': p.id,
          'service.mindestpreis': konfig.mindestpreis?.[art] ?? null,
          'custom.preis_pro_001_qm': true,
        },
        varianten: einfassVarianten.map((v) => ({
          optionValues: [v.werte.join(' / ')], sku: eigeneSku(a.kurz, name, v.farbnummer || v.farbe),
          price: je001 == null ? null : je001.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''),
          imageUrl: v.imageUrl,
          metafields: { 'service.einfassen': VERFUEGBAR, 'service.basisvariante': v.basisVarianteId },
          kopiere_metafelder_von: v.basisVarianteId, kopiere_felder: ['custom.farbcode', 'custom.farbe'],
        })),
      });
    }
  }

  plan.zusammenfassung = {
    freigegeben: (konfig.freigabe || []).length,
    breitenoption: plan.breitenoption.length,
    einfassen_setzen: plan.einfassen_setzen.length,
    wunschmass_anlegen: plan.wunschmass_anlegen.length,
    einfassprodukte: plan.einfassprodukte.length,
    einfassvarianten: plan.einfassprodukte.reduce((s, e) => s + e.varianten.length, 0),
    wartet_auf_preis: plan.einfassprodukte.filter((e) => e.plan_status === 'wartet_auf_preis').length,
    konflikte: plan.konflikte.length,
  };
  return plan;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snap = arg('--snapshot');
  const kPfad = arg('--konfig') || process.env.TP_MASSTEPICH_KONFIG || KONFIG_STANDARD;
  if (!snap || !existsSync(snap) || !existsSync(kPfad)) {
    console.error('Aufruf: npm run masstepich:plan -- --snapshot <datei> [--konfig <datei>] [--out <datei>]');
    process.exit(1);
  }
  const plan = erstellePlan(JSON.parse(readFileSync(snap, 'utf8')), JSON.parse(readFileSync(kPfad, 'utf8')));
  const out = arg('--out') || join(kPfad, '..', `masstepich-plan-${plan.erstellt.slice(0, 10)}.json`);
  writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(plan.zusammenfassung, null, 2));
  plan.konflikte.forEach((k) => console.log(`KONFLIKT  ${k.titel}${k.farbe ? ` / ${k.farbe}` : ''}: ${k.grund}`));
  console.log(`Plan: ${out} - nichts ausgefuehrt.`);
}
