/**
 * Bestellposition -> procurement_item.
 *
 * Liest Varianten-Metafelder Namespace `einkauf` (02-DATA-MODEL.md Abschnitt 2),
 * Produkt-Metafelder `custom.*`, die Grosshaendler-ID-Kaskade der internen
 * Bestellmail und die Line-Item-Properties der Rechner. Fehlendes wird als
 * UNGEKLAERT ausgewiesen, nie geraten.
 *
 * Masspruefung: Nachbau von
 * domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid.
 * Gerechnet wird aus den Massen, nie aus der Property "Flaeche". Gemeldet
 * wird nur "zu wenig"; eine hoehere Menge (Mindestpreis) ist in Ordnung.
 */

import { UNGEKLAERT } from './umrechnung.mjs';
import { istMusterPosition as musterRegel } from './muster.mjs';

export const EINKAUF_KEYS = Object.freeze([
  'procurement_id', 'lieferant', 'hersteller', 'artikelnummer', 'farbnummer',
  'bestelleinheit', 'route', 'route_fallback', 'neutralversand',
  'muster_quelle', 'quellvariante', 'lieferant_url',
]);

export const CUSTOM_KEYS = Object.freeze(['qm_pro_paket', 'rollenbreite', 'stangenlaenge', 'preis_pro_001_qm']);

/**
 * Macht aus Shopify-Metafeldern (Connection `{nodes:[{namespace,key,value}]}`,
 * Array oder bereits verschachteltes Objekt) ein Objekt `{namespace:{key:value}}`.
 */
export function metafeldMap(metafields) {
  if (!metafields) return {};
  const liste = Array.isArray(metafields) ? metafields
    : Array.isArray(metafields.nodes) ? metafields.nodes
      : Array.isArray(metafields.edges) ? metafields.edges.map(e => e.node)
        : null;
  if (!liste) return metafields; // bereits {namespace:{key:value}}
  const map = {};
  for (const mf of liste) {
    if (!mf || !mf.namespace || !mf.key) continue;
    map[mf.namespace] ??= {};
    map[mf.namespace][mf.key] = mf.value;
  }
  return map;
}

function leer(wert) {
  return wert === null || wert === undefined || String(wert).trim() === '';
}

function feld(map, ns, key) {
  const v = map?.[ns]?.[key];
  return leer(v) ? UNGEKLAERT : String(v).trim();
}

function zahlOderUngeklaert(wert) {
  if (leer(wert)) return UNGEKLAERT;
  const n = parseFloat(String(wert).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : UNGEKLAERT;
}

function wahr(wert) {
  return wert === true || wert === 'true';
}

/** Properties (Array `[{key,value}]`, Array `[[k,v]]` oder Objekt) -> Objekt. */
export function propertiesMap(properties) {
  if (!properties) return {};
  if (Array.isArray(properties)) {
    const o = {};
    for (const p of properties) {
      if (Array.isArray(p)) o[p[0]] = p[1];
      else if (p && p.key !== undefined) o[p.key] = p.value;
      else if (p && p.name !== undefined) o[p.name] = p.value;
    }
    return o;
  }
  return { ...properties };
}

function ganzzahlCm(text) {
  if (leer(text)) return 0;
  const n = parseInt(String(text).replace(/cm/gi, '').replace(/Ø/g, '').replace(/\./g, '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** "250 × 350 cm" -> {w:250, l:350}; "Ø 200 cm" -> {w:200, l:200}. */
export function parseMasse(text) {
  if (leer(text)) return null;
  const roh = String(text).replace(/cm/gi, '').replace(/Ø/g, '').trim();
  if (roh.includes('×') || /\sx\s/i.test(roh)) {
    const teile = roh.split(/×|\sx\s/i);
    return { w: ganzzahlCm(teile[0]), l: ganzzahlCm(teile[1]) };
  }
  const w = ganzzahlCm(roh);
  return { w, l: w };
}

/**
 * Grosshaendler-ID-Kaskade: einkauf.artikelnummer (Variante) ->
 * lieferant.lieferant_a_artikelnummer -> lieferant_b_artikelnummer ->
 * grosshandel.sku (Produkt) -> Muster-SKU ohne "M-" (nur ohne Bindestrich).
 */
export function grosshaendlerId({ variantMetafelder, produktMetafelder, sku }) {
  // Seit dem Befuellen der Einkaufsfelder (2026-09-23) steht die gepruefte
  // Artikelnummer direkt an der Variante; sie geht den Altfeldern vor.
  const e = variantMetafelder?.einkauf?.artikelnummer;
  if (!leer(e)) return { id: String(e).trim(), quelle: 'einkauf.artikelnummer' };
  const a = variantMetafelder?.lieferant?.lieferant_a_artikelnummer;
  if (!leer(a)) return { id: String(a).trim(), quelle: 'lieferant.lieferant_a_artikelnummer' };
  const b = variantMetafelder?.lieferant?.lieferant_b_artikelnummer;
  if (!leer(b)) return { id: String(b).trim(), quelle: 'lieferant.lieferant_b_artikelnummer' };
  const g = produktMetafelder?.grosshandel?.sku;
  if (!leer(g)) return { id: String(g).trim(), quelle: 'grosshandel.sku' };
  if (typeof sku === 'string' && sku.startsWith('M-')) {
    const rest = sku.slice(2);
    if (rest && !rest.includes('-')) return { id: rest, quelle: 'muster-sku' };
  }
  return { id: UNGEKLAERT, quelle: null };
}

/**
 * Masspruefung einer Zeile. Gibt {status, soll, einheit, ist} zurueck;
 * status: 'ok' | 'abweichung' | 'unlesbar' | 'waise' | '' (keine berechnete Zeile).
 *
 * @param {object} p
 * @param {object} p.props        Properties als Objekt
 * @param {number} p.quantity     bestellte Menge
 * @param {boolean} p.hundertstel custom.preis_pro_001_qm
 * @param {Array}  [p.alleZeilen] alle Positionen der Bestellung (fuer Kettel-Gruppen)
 */
export function masspruefung({ props, quantity, hundertstel, alleZeilen = [] }) {
  const p = props || {};
  const qty = Number(quantity) || 0;
  const masse = p['Maße'];
  const breite = leer(p['Ihre Breite']) ? p['Rollenbreite'] : p['Ihre Breite'];
  const laenge = p['Gewünschte Länge'];
  const kante = p['Kante umlaufend'];
  const gruppe = p['_Gruppe'];
  const leiste = p['Länge'];
  const form = p['Form'];
  const wmBreite = p['Breite'];
  const wmEinzel = leer(p['Durchmesser']) ? p['Seitenlänge'] : p['Durchmesser'];
  const zu = leer(p['Zu Teppich']) ? p['Zu Teppichboden'] : p['Zu Teppich'];

  const ergebnis = { status: '', soll: 0, einheit: '', ist: qty };
  const bewerten = (soll, einheit, grenze = soll) => {
    ergebnis.soll = soll;
    ergebnis.einheit = einheit;
    ergebnis.status = qty < grenze ? 'abweichung' : 'ok';
  };

  if (!leer(masse) || !leer(laenge)) {
    // Hauptzeile: Flaeche aus den Massen.
    let w; let l; let auf = 99;
    if (!leer(masse)) {
      ({ w, l } = parseMasse(masse));
    } else {
      // Rollenrechner cm-genau rundet kaufmaennisch (Math.round(area*100)).
      auf = 50;
      w = ganzzahlCm(breite);
      l = ganzzahlCm(laenge);
    }
    if (!(w > 0) || !(l > 0)) {
      ergebnis.status = 'unlesbar';
    } else {
      const cm2 = w * l;
      if (hundertstel) bewerten(Math.floor((cm2 + auf) / 100), '× 0,01 m²');
      else bewerten(Math.floor((cm2 + 9999) / 10000), 'm²');
    }
  } else if (!leer(wmEinzel) || !leer(wmBreite)) {
    // Wunschmass-Rechner: echte Flaeche (Kreis/Ellipse), immer 0,01 m2.
    let w; let l;
    if (!leer(wmEinzel)) { w = ganzzahlCm(wmEinzel); l = w; } else { w = ganzzahlCm(wmBreite); l = ganzzahlCm(leiste); }
    if (!(w > 0) || !(l > 0)) {
      ergebnis.status = 'unlesbar';
    } else {
      const cm2 = w * l;
      const soll = (form === 'Rund' || form === 'Oval')
        ? Math.floor((cm2 * 355) / 45200) - 1
        : Math.floor((cm2 + 99) / 100);
      bewerten(soll, '× 0,01 m²');
    }
  } else if (!leer(kante)) {
    // Kettelservice: Mass steht an der Hauptzeile derselben _Gruppe.
    ergebnis.status = 'waise';
    for (const h of alleZeilen) {
      const hp = propertiesMap(h.properties ?? h.customAttributes);
      if (leer(gruppe) || hp['_Gruppe'] !== gruppe || leer(hp['Maße'])) continue;
      const { w, l } = parseMasse(hp['Maße']);
      if (!(w > 0) || !(l > 0)) { ergebnis.status = 'unlesbar'; continue; }
      let soll;
      if (hp['Form'] === 'Rund') {
        soll = Math.floor((w * 355) / 113);
      } else if (hp['Form'] === 'Oval') {
        // Ramanujan ganzzahlig wie in der Mail (Heron-Wurzel, 12 Schritte).
        const n = (3 * w + l) * (3 * l + w);
        let x = 2 * (w + l);
        for (let i = 0; i < 12; i++) x = Math.floor((x + Math.floor(n / x)) / 2);
        soll = Math.floor(((3 * (w + l) - x) * 355) / 226) - 2;
      } else {
        soll = 2 * (w + l);
      }
      bewerten(soll, '× 0,01 m', soll - 1); // 1 cm Spiel fuer die Rundung des Rechners
    }
  } else if (!leer(zu) && !leer(leiste)) {
    // Fussleiste: volle Meter aus der Property "Laenge".
    const soll = Math.ceil(parseFloat(String(leiste).replace('m', '').replace(',', '.').trim()) || 0);
    if (soll <= 0) ergebnis.status = 'unlesbar';
    else bewerten(soll, 'm');
  }

  // Auffangregel: 0,01-m2-Produkte muessen ein Mass tragen.
  if (ergebnis.status === '' && hundertstel) ergebnis.status = 'unlesbar';
  return ergebnis;
}

/**
 * Loest eine Bestellposition zu einem procurement_item auf.
 *
 * @param {object} p
 * @param {object} p.lineItem   {id, sku, quantity, customAttributes|properties, title}
 * @param {object} p.variant    {id, sku, metafields, product:{id, handle, metafields}}
 * @param {Array}  [p.alleZeilen] uebrige Positionen (Kettel-Gruppen)
 */
export function resolveLineItem({ lineItem, variant, alleZeilen = [] } = {}) {
  if (!lineItem) throw new Error('resolveLineItem: lineItem fehlt');
  const props = propertiesMap(lineItem.customAttributes ?? lineItem.properties);
  const vm = metafeldMap(variant?.metafields);
  const pm = metafeldMap(variant?.product?.metafields);
  const sku = lineItem.sku ?? variant?.sku ?? null;

  const einkauf = {};
  for (const key of EINKAUF_KEYS) einkauf[key] = feld(vm, 'einkauf', key);
  if (einkauf.neutralversand === UNGEKLAERT) einkauf.neutralversand = 'UNKNOWN'; // Default laut Datenmodell

  const produkt = {
    id: variant?.product?.id ?? UNGEKLAERT,
    handle: variant?.product?.handle ?? UNGEKLAERT,
    qm_pro_paket: zahlOderUngeklaert(pm?.custom?.qm_pro_paket),
    rollenbreite: zahlOderUngeklaert(vm?.custom?.rollenbreite ?? pm?.custom?.rollenbreite),
    stangenlaenge: zahlOderUngeklaert(pm?.custom?.stangenlaenge),
    preis_pro_001_qm: wahr(pm?.custom?.preis_pro_001_qm),
  };

  const gh = grosshaendlerId({ variantMetafelder: vm, produktMetafelder: pm, sku });

  const masse = parseMasse(props['Maße']);
  const eingaben = {
    masse: masse ? { breiteCm: masse.w, laengeCm: masse.l } : null,
    ausRolleCm: leer(props['Aus Rolle']) ? null : ganzzahlCm(props['Aus Rolle']),
    gewuenschteLaengeCm: leer(props['Gewünschte Länge']) ? null : ganzzahlCm(props['Gewünschte Länge']),
    ihreBreiteCm: leer(props['Ihre Breite']) ? null : ganzzahlCm(props['Ihre Breite']),
    rollenbreiteCm: leer(props['Rollenbreite']) ? null : ganzzahlCm(props['Rollenbreite']),
    // Nur Anzeige - wird nie zum Rechnen benutzt (faelschbar).
    flaecheText: props['Fläche'] ?? props['Fläche (aufgerundet)'] ?? null,
    bedarfQm: leer(props['_bedarf_qm']) ? null : parseFloat(String(props['_bedarf_qm']).replace(',', '.')),
    pakete: leer(props['_pakete']) ? null : parseInt(props['_pakete'], 10),
    quellvarianteId: leer(props['_Quellvariante_ID']) ? null : String(props['_Quellvariante_ID']),
    musterId: leer(props['_Muster_ID']) ? null : String(props['_Muster_ID']),
    gruppe: leer(props['_Gruppe']) ? null : String(props['_Gruppe']),
    farbnummer: leer(props['Farbnummer']) ? null : String(props['Farbnummer']),
  };

  const istMuster = musterRegel({
    sku,
    musterId: eingaben.musterId,
    produktTyp: variant?.product?.productType ?? null,
  });
  // Musterzeile ohne Metafeld-Referenz: die Property ist die einzige Kundensicht.
  if (istMuster && einkauf.quellvariante === UNGEKLAERT && eingaben.quellvarianteId) {
    einkauf.quellvariante = eingaben.quellvarianteId;
    einkauf.quellvariante_quelle = 'property:_Quellvariante_ID';
  }

  const pruefung = masspruefung({ props, quantity: lineItem.quantity, hundertstel: produkt.preis_pro_001_qm, alleZeilen });

  return {
    lineItemId: lineItem.id ?? null,
    sku: sku ?? UNGEKLAERT,
    variantId: variant?.id ?? UNGEKLAERT,
    quantity: Number(lineItem.quantity) || 0,
    istMuster,
    einkauf,
    produkt,
    grosshaendlerId: gh.id,
    grosshaendlerIdQuelle: gh.quelle,
    eingaben,
    masspruefung: pruefung,
  };
}
