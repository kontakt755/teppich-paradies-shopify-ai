/**
 * Verlegereste als Mustermaterial (Regel 2026-10-21).
 *
 * 1. Teppichboden und Vinyl, die wir bei Lieferant A oder C bestellen und selbst verlegen,
 *    hinterlassen Reste. Die werden aufgehoben, beschriftet und ins Musterlager gelegt - daraus
 *    schneiden wir A5-Muster.
 * 2. Kommt dieselbe Ware von einem anderen Hersteller oder Lieferanten direkt, zaehlt der Rest
 *    nur, wenn A oder C sie ebenfalls fuehrt: dann passt das Muster zu einem Produkt, das wir
 *    ueber A/C verkaufen. Ob das so ist, entscheidet der Abgleich gegen den Lexikon-Export
 *    (Hersteller, Qualitaet beim Lieferanten, Farbnummer) - nie eine Vermutung.
 *
 * Reine Funktionen, keine Dateien, kein Shopify. Lieferanten heissen hier nur A-H.
 */

/** Wo wir Reste immer aufheben. */
export const RESTE_LIEFERANTEN = Object.freeze(['A', 'C']);

/** Produktgruppen (Lexikon) mit Verlegeresten: Teppichboden und Vinyl. */
export const RESTE_GRUPPEN = Object.freeze(['Teppichboden', 'Vinyl von der Rolle', 'Klebevinyl', 'Klickvinyl']);

/**
 * Verlegt wird, was zur Baustelle geht oder mit Verlegung gebucht ist. Direktversand zum Kunden
 * erreicht uns nie, Abholung nimmt der Kunde ganz mit - beides hinterlaesst keinen Rest bei uns.
 */
export function wirdVerlegt(position, auftrag = null) {
  if (position?.route === 'SUPPLIER_DIRECT') return false;
  return position?.route === 'SUPPLIER_TO_SITE' || auftrag?.checks?.verlegung === 'Ja';
}

/**
 * Regel fuer eine Warenposition.
 * @returns {'aufheben'|'abgleichen'|null}  aufheben: A/C-Ware; abgleichen: andere Quelle, erst
 *   pruefen, ob A/C sie fuehrt; null: keine Ware fuer Reste (Muster, Zubehoer, Teppiche ...).
 */
export function restRegel({ lieferant, produktgruppe, istMuster = false } = {}) {
  if (istMuster || !RESTE_GRUPPEN.includes(produktgruppe)) return null;
  return RESTE_LIEFERANTEN.includes(String(lieferant || '').toUpperCase()) ? 'aufheben' : 'abgleichen';
}

// ---------------------------------------------------------------- Abgleich

const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
const woerter = text => String(text ?? '').toLowerCase()
  .replace(/[äöüß]/g, z => UMLAUTE[z])
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(Boolean);

/** Woerter, die jede Qualitaet traegt - sie unterscheiden nichts. */
const ALLGEMEIN = new Set([
  'teppichboden', 'teppich', 'boden', 'bodenbelag', 'vinyl', 'vinylboden', 'designboden', 'design', 'cv', 'pvc',
  'klick', 'click', 'klebe', 'kleben', 'dryback', 'rigid', 'spc', 'lvt', 'rolle', 'rollenware', 'bahnenware',
  'velours', 'schlinge', 'nadelvlies', 'saxony', 'frise', 'shag', 'objekt', 'wohnen', 'living', 'collection', 'kollektion',
  'cm', 'mm', 'm', 'ns', 'breite', 'und', 'mit', 'the', 'de', 'nv', 'bv', 'gmbh', 'kg', 'co', 'ag', 'sa',
]);
/** Rollenbreiten sind keine Qualitaet. */
const BREITEN = new Set(['100', '133', '150', '200', '250', '300', '366', '400', '450', '500']);

/** Unterscheidende Woerter einer Qualitaetsbezeichnung ("Doria 400 cm Sprint 027" -> doria, sprint, 027). */
export function kennwoerter(text) {
  return [...new Set(woerter(text).filter(w => !ALLGEMEIN.has(w) && !BREITEN.has(w) && !/^\d{1,2}$/.test(w) && !/^\d+(cm|mm)$/.test(w)))];
}

/** Rechtsform-, Orts- und Branchenwoerter, die zwei Hersteller nicht gleich machen. */
const HERSTELLER_FUELL = new Set(['europe', 'group', 'industries', 'division', 'carpets', 'floorcoverings', 'flooring', 'holding', 'global', 'handelsname', 'der', 'marke']);

const herstellerWoerter = text => woerter(text).filter(x => x.length > 2 && !ALLGEMEIN.has(x) && !HERSTELLER_FUELL.has(x) && !/^\d+$/.test(x));

/**
 * Gleicher Hersteller: true/false; null, wenn eine Seite keinen Hersteller hat. Ein Kennwort
 * reicht. Ein kurzes Kuerzel (2-4 Buchstaben) zaehlt auch als Anfangsbuchstaben der Namenswoerter
 * ("XY" passt zu "Xantos Yarns Europe NV") - so muss hier kein Herstellername stehen.
 */
export function herstellerPasst(gesucht, vorhanden) {
  const roh = woerter(gesucht);
  const v = herstellerWoerter(vorhanden);
  if (!roh.length || !v.length) return null;
  const vs = new Set(woerter(vorhanden));
  if (roh.length === 1 && /^[a-z]{2,4}$/.test(roh[0]) && !vs.has(roh[0])) return v.map(x => x[0]).join('').startsWith(roh[0]);
  const g = herstellerWoerter(gesucht);
  return g.length ? g.some(x => vs.has(x)) : false;
}

/**
 * Farbnummer zum Vergleichen: reine Ziffern ohne fuehrende Nullen ("021" = "21"), ein Vorsatz
 * wie "FB 31" oder "Nr. 31" faellt weg; gemischte Codes ("2F84") bleiben ganz. Null ohne Ziffern.
 */
export function farbnummerNorm(wert) {
  const s = String(wert ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/\d/.test(s)) return null;
  const m = s.match(/^[A-Z]{0,3}(\d+)$/);
  return m ? String(Number(m[1])) : s;
}

/** Farbnummer einer Variante: das Feld, sonst die Ziffern nach dem letzten "_" der SKU. */
function farbnummerVon(v) {
  return farbnummerNorm(v?.einkauf?.farbnummer) || farbnummerNorm(String(v?.sku ?? '').split('_').slice(1).at(-1));
}

/**
 * Suchindex: alle aktiven Varianten von A und C in den Reste-Gruppen. Musterprodukte und
 * Archiviertes fallen weg - der Rest soll zu etwas passen, das wir verkaufen.
 * @param {object[]} produkte  Lexikon-Export (produkte.json -> produkte)
 */
export function abgleichIndex(produkte = []) {
  const index = [];
  for (const p of produkte || []) {
    if (p?.status && p.status !== 'ACTIVE') continue;
    if (!RESTE_GRUPPEN.includes(p?.produktgruppe)) continue;
    for (const v of p.varianten || []) {
      const e = v?.einkauf || {};
      const lieferant = String(e.lieferant || '').toUpperCase();
      if (!RESTE_LIEFERANTEN.includes(lieferant) || !v.sku) continue;
      const bezeichnung = [e.produktname, e.kollektion, e.marke].filter(Boolean).join(' ');
      index.push({
        handle: p.handle, titel: p.titel, produktgruppe: p.produktgruppe, lieferant,
        hersteller: e.hersteller || null, bezeichnung,
        woerter: new Set([...woerter(bezeichnung), ...woerter(p.titel)]),
        farbe: v.farbe || null, farbnummer: farbnummerVon(v), sku: String(v.sku).trim().toUpperCase(),
      });
    }
  }
  return index;
}

/**
 * Fuehrt A oder C diese Ware? Sucht im Index nach Qualitaet (alle Kennwoerter muessen in der
 * Lieferantenbezeichnung oder im Shop-Titel stehen), optional Hersteller und Farbnummer.
 * Ein anderer Hersteller schliesst aus; fehlt bei A/C der Hersteller, bleibt der Treffer mit
 * `herstellerOffen`.
 *
 * @param {object[]} index  aus abgleichIndex()
 * @param {object} q
 * @param {string} q.qualitaet   z. B. "Doria" oder die Bezeichnung des Herstellers; leer mit
 *   Hersteller: alles von diesem Hersteller bei A/C
 * @param {string} [q.hersteller] z. B. "AW", "Associated Weavers", "ITC"
 * @param {string} [q.farbnummer]
 * @param {'alle'|'eins'} [q.modus]  'eins': ein Kennwort reicht (automatischer Abgleich, dort
 *   sind Hersteller und Farbnummer Pflicht)
 * @returns {{handle, titel, produktgruppe, lieferant, hersteller, bezeichnung, herstellerOffen: boolean, farben: {farbe, farbnummer, sku}[], farbeGefunden: boolean}[]}
 */
export function sucheBeiAC(index = [], { qualitaet = '', hersteller = '', farbnummer = '', modus = 'alle' } = {}) {
  const kenn = kennwoerter(qualitaet);
  const mitHersteller = !!String(hersteller).trim();
  // C fuehrt Herstellerware oft unter eigenem Namen: dann zeigt der Hersteller allein, was es gibt.
  if (!kenn.length && (modus === 'eins' || !mitHersteller)) return [];
  const fn = farbnummerNorm(farbnummer);
  if (modus === 'eins' && (!fn || !mitHersteller)) return [];
  const je = new Map();
  for (const x of index) {
    const getroffen = kenn.filter(w => x.woerter.has(w)).length;
    if (modus === 'eins' ? getroffen < 1 || !kenn.some(w => /[a-z]/.test(w) && x.woerter.has(w)) : getroffen < kenn.length) continue;
    const hp = mitHersteller ? herstellerPasst(hersteller, x.hersteller) : null;
    if (hp === false) continue;
    if ((modus === 'eins' || !kenn.length) && hp !== true) continue;
    if (!je.has(x.handle)) {
      je.set(x.handle, { handle: x.handle, titel: x.titel, produktgruppe: x.produktgruppe, lieferant: x.lieferant, hersteller: x.hersteller,
        bezeichnung: x.bezeichnung, herstellerOffen: hp === null && mitHersteller, farben: new Map(), alle: new Map(), treffer: getroffen });
    }
    const t = je.get(x.handle);
    const farbe = { farbe: x.farbe, farbnummer: x.farbnummer, sku: x.sku };
    if (!t.alle.has(x.sku)) t.alle.set(x.sku, farbe);
    if (fn && x.farbnummer === fn && !t.farben.has(x.sku)) t.farben.set(x.sku, farbe);
  }
  const liste = [...je.values()]
    .filter(t => modus !== 'eins' || t.farben.size)
    .map(({ farben, alle, treffer, ...t }) => ({ ...t, farbeGefunden: farben.size > 0, farben: [...(farben.size ? farben : alle).values()], treffer }));
  return liste
    .sort((a, b) => b.farbeGefunden - a.farbeGefunden || a.herstellerOffen - b.herstellerOffen || b.treffer - a.treffer || String(a.titel).localeCompare(String(b.titel), 'de'))
    .slice(0, 30)
    .map(({ treffer, ...t }) => t);
}

/**
 * Automatischer Abgleich einer Warenposition anderer Quelle gegen A/C: Hersteller, Kennwoerter
 * und Farbnummer aus den Einkaufsfeldern der bestellten Variante (Lexikon). Ohne Hersteller oder
 * Farbnummer kein Treffer - dann bleibt nur die Pruefung von Hand im Musterlager.
 * @param {object[]} index
 * @param {object|null} variante  Lexikon-Variante der Position
 */
export function acTrefferFuer(index, variante) {
  const e = variante?.einkauf || {};
  if (RESTE_LIEFERANTEN.includes(String(e.lieferant || '').toUpperCase())) return [];
  return sucheBeiAC(index, { qualitaet: [e.produktname, e.kollektion].filter(Boolean).join(' '), hersteller: e.hersteller || '', farbnummer: farbnummerVon(variante) || '', modus: 'eins' });
}
