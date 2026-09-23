// Produktlexikon fuer Mitarbeiter: Shop-Produktname -> Original beim
// Lieferanten samt Direktlink. Reiner Datenteil, keine UI. Die Oberflaeche
// baut ein anderer Agent gegen genau dieses Format (siehe Datenformat unten).
//
// Fehlende Werte sind immer `null`, nie erfunden (CLAUDE.md "Produktdaten").

const SHOP_HOST = 'https://www.teppich-paradies.net';
const STORE_HANDLE = 'sjjyq1-6w';

// Anzeigename je custom.*-Schluessel, Vorbild blocks/tp-produktinfo-tabelle.liquid
// (Format Label::metafield_key::display_field). display_field beschreibt,
// welches Unterfeld eines aufgeloesten Metaobjekt-Werts zu nehmen ist, falls
// der Export das nicht schon zu einem Klartext-String verdichtet hat.
export const EIGENSCHAFTEN_FELDER = Object.freeze([
  { key: 'rollenbreite', label: 'rollenbreite', displayField: 'value' },
  { key: 'qm_pro_paket', label: 'qmProPaket', displayField: 'value' },
  { key: 'florhohe', label: 'florhoehe', displayField: 'name' },
  { key: 'material', label: 'material', displayField: 'name' },
  { key: 'ruckenausstattung', label: 'ruecken', displayField: 'name' },
  { key: 'nutzungsklassen', label: 'nutzungsklasse', displayField: 'nutzungsklasse' },
  { key: 'fusbodenheizung', label: 'fussbodenheizung', displayField: 'fusbodenheizung' },
  { key: 'brandverhalten', label: 'brandverhalten', displayField: 'brandverhalten' },
  { key: 'belagsart', label: 'belagsart', displayField: 'name' },
  { key: 'optik', label: 'optik', displayField: 'optik' },
  { key: 'fasermaterial', label: 'fasermaterial', displayField: 'fasermaterial' },
  { key: 'zimmer', label: 'zimmer', displayField: 'zimmer' },
  { key: 'aufbau', label: 'aufbau', displayField: 'name' },
  { key: 'gesamtstarke', label: 'gesamtstaerke', displayField: 'name' },
  { key: 'poleneinsatzgewicht', label: 'poleneinsatzgewicht', displayField: 'name' },
  { key: 'komfortklasse', label: 'komfortklasse', displayField: 'name' },
  { key: 'trittschallverbesserung', label: 'trittschallverbesserung', displayField: 'name' },
  { key: 'marke', label: 'marke', displayField: 'name' },
]);

// einkauf.* Varianten-Metafelder -> Schluessel im Einkaufsblock der Variante.
export const EINKAUF_FELDER = Object.freeze({
  lieferant: 'lieferant', // metaobject_reference tp_lieferant, Feld "kuerzel"
  artikelnummer: 'artikelnummer',
  farbnummer: 'farbnummer',
  lieferant_produktname: 'produktname',
  lieferant_url: 'url',
  lieferant_kollektion: 'kollektion',
  hersteller: 'hersteller',
  bestelleinheit: 'bestelleinheit',
  procurement_id: 'procurementId',
});

function leer(wert) {
  return wert === null || wert === undefined || String(wert).trim() === '';
}

function text(wert) {
  return leer(wert) ? null : String(wert).trim();
}

function zahl(wert) {
  if (leer(wert)) return null;
  const n = Number(String(wert).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Macht aus einer Metafeld-Liste (`[{namespace,key,value}]`, Connection
 * `{nodes:[...]}` oder bereits `{namespace:{key:wert}}`) ein flaches Objekt
 * `{namespace:{key:wert}}`. `wert` darf ein String, eine Zahl, ein Array
 * (list.*) oder ein aufgeloestes Metaobjekt-Objekt sein - der Export loest
 * Referenzen vorher auf, hier wird nur noch gelesen.
 */
export function metafeldMap(metafields) {
  if (!metafields) return {};
  const liste = Array.isArray(metafields) ? metafields
    : Array.isArray(metafields.nodes) ? metafields.nodes
      : Array.isArray(metafields.edges) ? metafields.edges.map(e => e.node)
        : null;
  if (!liste) return metafields;
  const map = {};
  for (const mf of liste) {
    if (!mf || !mf.namespace || !mf.key) continue;
    map[mf.namespace] ??= {};
    map[mf.namespace][mf.key] = mf.value;
  }
  return map;
}

/** Liest ein einzelnes aufgeloestes Feld aus einem Metaobjekt-Wert oder einer Liste davon. */
function feldWert(rohWert, displayField) {
  if (leer(rohWert)) return null;
  const einzeln = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
      const inner = v[displayField];
      if (inner !== undefined) return typeof inner === 'object' ? (inner.value ?? inner.name ?? null) : inner;
      return v.name ?? v.value ?? null;
    }
    return v;
  };
  if (Array.isArray(rohWert)) {
    const werte = rohWert.map(einzeln).filter(v => !leer(v));
    return werte.length ? werte.join(', ') : null;
  }
  return einzeln(rohWert);
}

function numerischeId(gid) {
  if (leer(gid)) return null;
  const m = String(gid).match(/(\d+)$/);
  return m ? m[1] : String(gid);
}

/** Produktgruppe: templateSuffix, sonst productType, sonst nichts (nie geraten). */
function produktgruppe(produkt) {
  const suffix = text(produkt.templateSuffix);
  if (suffix) return suffix;
  const typ = text(produkt.productType);
  if (typ) return typ;
  return null;
}

function bildUrl(produkt) {
  return produkt?.featuredImage?.url ?? produkt?.featuredMedia?.preview?.image?.url ?? null;
}

function eigenschaften(customMap) {
  const out = {};
  for (const { key, label, displayField } of EIGENSCHAFTEN_FELDER) {
    const wert = feldWert(customMap?.[key], displayField);
    if (!leer(wert)) out[label] = wert;
  }
  return out;
}

function farbeAusOptionen(selectedOptions) {
  if (!Array.isArray(selectedOptions)) return null;
  const treffer = selectedOptions.find(o => /^farbe$|^color$/i.test(String(o?.name ?? '')));
  return treffer ? text(treffer.value) : null;
}

function einkaufBlock({ einkaufMap, customMap }) {
  const out = {};
  for (const [mfKey, zielKey] of Object.entries(EINKAUF_FELDER)) {
    out[zielKey] = mfKey === 'lieferant'
      ? feldWert(einkaufMap?.[mfKey], 'kuerzel')
      : text(einkaufMap?.[mfKey]);
  }
  // marke ist ein Produkt-Metafeld (custom.marke), gehoert inhaltlich zum
  // Einkaufsblock der Variante, weil es Herkunft/Beschaffung beschreibt.
  out.marke = feldWert(customMap?.marke, 'name');
  return out;
}

function skuIstMuster(sku) {
  return typeof sku === 'string' && sku.startsWith('M-');
}

function musterBlock(produkt, varianten) {
  const handleIstMuster = typeof produkt.handle === 'string' && produkt.handle.startsWith('muster-');
  const vorhanden = handleIstMuster || varianten.some(v => skuIstMuster(v.sku));
  return { vorhanden, handle: handleIstMuster ? produkt.handle : null };
}

/** Produktliste aus verschiedenen Export-Huellen ziehen. */
function produktListe(exportDaten) {
  const j = typeof exportDaten === 'string' ? JSON.parse(exportDaten) : exportDaten;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.produkte)) return j.produkte;
  if (Array.isArray(j?.products)) return j.products;
  if (Array.isArray(j?.products?.nodes)) return j.products.nodes;
  if (Array.isArray(j?.data?.products?.nodes)) return j.data.products.nodes;
  throw new Error('aufbereiten: Eingabe hat kein produkte/products-Feld');
}

/**
 * Baut das Lexikon-Modell aus dem Rohexport (Produkte mit Varianten und
 * bereits referenz-aufgeloesten Metafeldern).
 *
 * @param {object|Array|string} exportDaten
 * @param {{jetzt?: Date}} [opt]
 * @returns {{erstellt: string, anzahl: number, produkte: Array}}
 */
export function aufbereiten(exportDaten, opt = {}) {
  const produkte = produktListe(exportDaten);
  const jetzt = opt.jetzt ?? new Date();

  const ergebnis = produkte.map((p) => {
    const customMap = metafeldMap(p.metafields)?.custom ?? {};
    const handle = text(p.handle);
    const numId = numerischeId(p.id);

    const rohVarianten = Array.isArray(p.variants) ? p.variants
      : Array.isArray(p.variants?.nodes) ? p.variants.nodes
        : [];

    const varianten = rohVarianten.map((v) => {
      const vMap = metafeldMap(v.metafields);
      const preisWert = v.price ?? v.priceV2?.amount ?? v.priceSet?.shopMoney?.amount;
      const waehrung = v.priceV2?.currencyCode ?? v.priceSet?.shopMoney?.currencyCode ?? (leer(preisWert) ? null : 'EUR');
      return {
        id: text(v.id),
        titel: text(v.title),
        sku: text(v.sku),
        farbe: farbeAusOptionen(v.selectedOptions),
        preis: zahl(preisWert),
        waehrung: zahl(preisWert) === null ? null : waehrung,
        verfuegbar: typeof v.availableForSale === 'boolean' ? v.availableForSale : null,
        einkauf: einkaufBlock({ einkaufMap: vMap.einkauf, customMap: vMap.custom ?? customMap }),
      };
    });

    return {
      handle,
      titel: text(p.title),
      shopUrl: handle ? `${SHOP_HOST}/products/${handle}` : null,
      adminUrl: numId ? `https://admin.shopify.com/store/${STORE_HANDLE}/products/${numId}` : null,
      status: text(p.status),
      produktgruppe: produktgruppe(p),
      bild: bildUrl(p),
      eigenschaften: eigenschaften(customMap),
      muster: musterBlock(p, varianten),
      varianten,
    };
  });

  return { erstellt: jetzt.toISOString(), anzahl: ergebnis.length, produkte: ergebnis };
}

// -- Suche ------------------------------------------------------------

/** Umlaut-tolerant und case-insensitive normalisieren: ae/oe/ue/ss-Schreibweise. */
export function normalisieren(wert) {
  if (leer(wert)) return '';
  return String(wert)
    .toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss');
}

function treffer(begriffNorm, ...felder) {
  return felder.some((f) => !leer(f) && normalisieren(f).includes(begriffNorm));
}

/**
 * Durchsucht das aufbereitete Modell ueber Titel, Handle, SKU,
 * Lieferanten-Artikelnummer, Farbname und Kollektion.
 *
 * @param {{produkte: Array}} modell  Ergebnis von aufbereiten()
 * @param {string} begriff
 * @returns {Array} passende Produkte (unveraendert aus dem Modell)
 */
export function suche(modell, begriff) {
  const begriffNorm = normalisieren(begriff);
  if (!begriffNorm) return [];
  const produkte = Array.isArray(modell) ? modell : (modell?.produkte ?? []);
  return produkte.filter((p) => {
    if (treffer(begriffNorm, p.titel, p.handle)) return true;
    return (p.varianten ?? []).some((v) => treffer(
      begriffNorm,
      v.sku,
      v.farbe,
      v.einkauf?.artikelnummer,
      v.einkauf?.kollektion,
    ));
  });
}
