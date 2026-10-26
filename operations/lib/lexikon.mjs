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
  // Nutzschicht und Format: fuer die Muster-Etiketten (Paketware), Klartext-Metafelder.
  { key: 'nutzschicht', label: 'nutzschicht', displayField: 'value' },
  { key: 'format_cm', label: 'format', displayField: 'value' },
  { key: 'arten', label: 'arten', displayField: 'name' },
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
  route: 'lieferweg', // OWN_STOCK|SUPPLIER_TO_TP|SUPPLIER_DIRECT|SUPPLIER_TO_SITE|SAMPLE_*|NO_PROCUREMENT
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

/**
 * Produktgruppe: productType ("Klickvinyl", "Teppichboden"), sonst
 * templateSuffix, sonst nichts (nie geraten). Der productType geht vor, weil
 * er der Name ist, den Mitarbeiter kennen und nach dem das Control Center
 * filtert; der Vorlagenname ist nur der Notbehelf fuer Produkte ohne Typ.
 * So liefern Live-Abruf und Handexport dieselbe Gruppe, egal ob die Abfrage
 * templateSuffix mitbringt.
 */
function produktgruppe(produkt) {
  const typ = text(produkt.productType);
  if (typ) return typ;
  const suffix = text(produkt.templateSuffix);
  if (suffix) return suffix;
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
  const treffer = selectedOptions.find(o => /^(farbe|dekor|color)$/i.test(String(o?.name ?? '').trim()));
  return treffer ? text(treffer.value) : null;
}

/**
 * Wunschmass-Variante (Zuschnitt nach Mass, z. B. Option "Breite: Wunschmaß"):
 * hat nie eine feste SKU/Artikelnummer/Farbnummer beim Lieferanten, weil erst
 * beim Zuschnitt entsteht, was bestellt wird - das ist keine Datenluecke.
 * Erkennung ueber den Optionswert, nicht ueber fehlende Einkaufsdaten (CLAUDE.md
 * "Produkteigenschaften nicht erfinden" - wir raten nicht, wir lesen die Option).
 */
function istWunschmass(selectedOptions) {
  if (!Array.isArray(selectedOptions)) return false;
  return selectedOptions.some(o => /wunschma/i.test(String(o?.value ?? '')));
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

/**
 * Preis je Verkaufseinheit fuer das Kundengespraech - abgeleitet, nie neu
 * erfunden:
 * - Paketware (qm_pro_paket bekannt): der Shopify-Listenpreis ist der interne
 *   Paketpreis (CLAUDE.md "Produktdaten"), geteilt ergibt er den m²-Preis.
 * - Rollenware (Bestelleinheit lfm): der Listenpreis ist bereits der
 *   m²-Preis - genau der, den die Produktseite als €/m² ausweist. Ohne diesen
 *   Fall stand im Lexikon "€/Stück", was im Kundengespraech falsch ist.
 * - Sonst bleibt der Stueckpreis stehen.
 */
function jaWert(v) {
  const t = String(v ?? '').trim().toLowerCase();
  return t === 'true' || t === 'ja' || t === '1';
}

function preisJeEinheit(preis, qmProPaketText, bestelleinheit = null, preisPro001Qm = null) {
  if (leer(preis)) return null;
  // Ware nach Mass: der Variantenpreis ist der Preis je 0,01 m² (Metafeld
  // custom.preis_pro_001_qm, so rechnet auch die Produktseite). Ohne das
  // stand im Lexikon "ab 0,85 €/m²" statt 85,00 € - Faktor 100 daneben.
  if (jaWert(preisPro001Qm)) return { betrag: Math.round(preis * 100 * 100) / 100, einheit: 'm2' };
  const qm = zahl(qmProPaketText);
  if (qm && qm > 0) return { betrag: Math.round((preis / qm) * 100) / 100, einheit: 'm2' };
  if (String(bestelleinheit || '').toLowerCase() === 'lfm') return { betrag: preis, einheit: 'm2' };
  return { betrag: preis, einheit: 'stueck' };
}

/**
 * Ehrlicher Status fuer einen fehlenden/unvollstaendigen Lieferanten-Link bei
 * einer echten (Nicht-Muster-)Variante. `lieferantSuchen` bildet Lieferanten-
 * kuerzel auf eine lokale Quicksearch-Basis-URL ab (siehe
 * operations/scripts/lexikon-export.mjs, nie im Repository hinterlegt -
 * CLAUDE.md Punkt 8).
 */
function quicksearchLink(basis, begriff) {
  if (!basis || leer(begriff)) return null;
  return `${String(basis).replace(/\/$/, '')}/de-DE/quicksearch?query=${encodeURIComponent(begriff)}`;
}

function linkStatus(einkauf, lieferantSuchen, nameFuerSuche = null) {
  if (!leer(einkauf.url)) return { status: 'vorhanden', grund: null, suchlink: null };
  if (!leer(einkauf.artikelnummer)) {
    return {
      status: 'nur_artikelnummer',
      grund: `Artikelnummer vorhanden, aber kein Link hinterlegt${einkauf.lieferant ? ` (Lieferant ${einkauf.lieferant})` : ''}`,
      suchlink: quicksearchLink(lieferantSuchen?.[einkauf.lieferant], einkauf.artikelnummer),
    };
  }
  // Ohne Artikelnummer bleibt nur der Name. Der Treffer ist nicht garantiert,
  // deshalb heisst der Link "suchen" und nicht "oeffnen" - er erspart dem
  // Mitarbeiter im Kundengespraech trotzdem den Umweg ueber die Startseite.
  const basis = lieferantSuchen?.[einkauf.lieferant] ?? lieferantSuchen?.__standard ?? null;
  const suchlink = quicksearchLink(basis, nameFuerSuche);
  if (!leer(einkauf.lieferant)) {
    return { status: 'fehlt', grund: `Artikelnummer bei Lieferant ${einkauf.lieferant} fehlt noch`, suchlink };
  }
  return { status: 'fehlt', grund: 'kein Lieferantenartikel hinterlegt - keine Einkaufsdaten', suchlink };
}

/**
 * Liest den Handle des verknuepften Musterprodukts aus einer aufgeloesten
 * `einkauf.muster_variante`-Referenz (variant_reference auf die
 * Mustervariante; der Export loest sie zu `{id, product:{handle}}` auf,
 * siehe lexikon-export.mjs). Unaufgeloest (rohe GID als String) liefert
 * nichts - wir raten keinen Handle aus einer ID.
 */
function musterHandleAusEinkaufswert(wert) {
  if (!wert || typeof wert !== 'object') return null;
  return text(wert.product?.handle ?? wert.handle ?? null);
}

/**
 * Verknuepfung Produkt <-> Muster: primaer ueber den Produkt-Handle
 * (Konvention `muster-<handle>` fuer das ganze Produkt), sekundaer ueber die
 * Mustervariante am Einkaufsblock der eigenen Varianten (falls die
 * Namenskonvention nicht greift). Wenn das Produkt selbst ein Musterprodukt
 * ist (Handle beginnt mit `muster-`), verweist es auf sich selbst (bestehendes
 * Verhalten). `musterKandidatenAusVarianten` kommt aus dem Varianten-Mapping.
 */
function musterBlock(produkt, varianten, handleSet, musterKandidatenAusVarianten) {
  const handle = text(produkt.handle);
  const handleIstMuster = typeof handle === 'string' && handle.startsWith('muster-');
  let musterHandle = handleIstMuster ? handle : null;
  if (!musterHandle && handle && handleSet.has(`muster-${handle}`)) musterHandle = `muster-${handle}`;
  if (!musterHandle && musterKandidatenAusVarianten.length) musterHandle = musterKandidatenAusVarianten[0];
  const vorhanden = !!musterHandle || varianten.some(v => skuIstMuster(v.sku));
  return { vorhanden, handle: musterHandle };
}

function istArchiviert(produkt) {
  return String(produkt?.status ?? '').toUpperCase() === 'ARCHIVED';
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
  // Archivierte Produkte gibt es im Shop nicht mehr und gehoeren nicht ins
  // Lexikon (Inhaber 2026-10-05). Der Export laedt Musterprodukte ueber
  // handle:muster-* unabhaengig vom Status, also auch archivierte - sie
  // fallen hier heraus, und ein Verweis auf ein archiviertes Muster zaehlt
  // nicht als vorhandenes Muster.
  const alle = produktListe(exportDaten);
  const archiviert = new Set(alle.filter(istArchiviert).map((p) => text(p.handle)).filter(Boolean));
  const produkte = alle.filter((p) => !istArchiviert(p));
  const jetzt = opt.jetzt ?? new Date();
  const lieferantSuchen = opt.lieferantSuchen ?? {};
  // Fuer die Muster-Verknuepfung ueber den Produkt-Handle (muster-<handle>)
  // muss die Menge ALLER Handles vorab feststehen - nicht nur des eigenen
  // Produkts.
  const handleSet = new Set(produkte.map((p) => text(p.handle)).filter(Boolean));

  // __musterRef traegt die rohe Variantenreferenz aus einkauf.muster_variante
  // bis zur zweiten Runde (Original-Verknuepfung) mit - kein Teil des
  // oeffentlichen Formats, wird am Ende jeder Variante wieder entfernt.
  const ergebnis = produkte.map((p) => {
    const customMap = metafeldMap(p.metafields)?.custom ?? {};
    const handle = text(p.handle);
    const numId = numerischeId(p.id);

    const rohVarianten = Array.isArray(p.variants) ? p.variants
      : Array.isArray(p.variants?.nodes) ? p.variants.nodes
        : [];

    const musterKandidatenAusVarianten = [];
    const varianten = rohVarianten.map((v) => {
      const vMap = metafeldMap(v.metafields);
      const preisWert = v.price ?? v.priceV2?.amount ?? v.priceSet?.shopMoney?.amount;
      const waehrung = v.priceV2?.currencyCode ?? v.priceSet?.shopMoney?.currencyCode ?? (leer(preisWert) ? null : 'EUR');
      const musterVarianteRoh = vMap.einkauf?.muster_variante;
      const musterHandle = musterHandleAusEinkaufswert(musterVarianteRoh);
      if (musterHandle && !archiviert.has(musterHandle)) musterKandidatenAusVarianten.push(musterHandle);
      const musterId = typeof musterVarianteRoh === 'string' && /^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/.test(musterVarianteRoh)
        ? musterVarianteRoh : text(musterVarianteRoh?.id);
      const musterRef = musterId || musterHandle ? { id: musterId, handle: musterHandle } : null;
      const preis = zahl(preisWert);
      const einkauf = einkaufBlock({ einkaufMap: vMap.einkauf, customMap: vMap.custom ?? customMap });
      return {
        id: text(v.id),
        titel: text(v.title),
        sku: text(v.sku),
        farbe: farbeAusOptionen(v.selectedOptions),
        ...(Array.isArray(v.selectedOptions) ? { optionen: v.selectedOptions.map(o => ({ name: text(o.name), wert: text(o.value) })) } : {}),
        preis,
        waehrung: preis === null ? null : waehrung,
        preisJeEinheit: preisJeEinheit(preis, customMap?.qm_pro_paket, einkauf.bestelleinheit, customMap?.preis_pro_001_qm),
        verfuegbar: typeof v.availableForSale === 'boolean' ? v.availableForSale : null,
        // Wunschmass (Zuschnitt nach Mass): SKU/Artikelnummer/Farbnummer sind
        // hier immer leer, weil die Ware erst beim Zuschnitt entsteht - keine
        // Datenluecke. Front-End muss das getrennt von echten Luecken zeigen.
        wunschmass: istWunschmass(v.selectedOptions),
        // Rollenbreite in Metern (custom.rollenbreite an der Variante, z. B.
        // "4.0"). Bei Produkten mit mehreren Breiten steht sie nur dort, nicht
        // am Produkt - ohne sie fand die Mengenhilfe bei 570 Rollenprodukten
        // keine Breite.
        rollenbreiteM: zahl(vMap.custom?.rollenbreite),
        // Bild genau dieser Farbe (Variantenbild); fehlt es, bleibt das Feld weg statt das
        // Produktbild einer anderen Farbe zu zeigen (Muster packen, Verwechslungsgefahr).
        ...(text(v.image?.url) ? { bild: text(v.image.url) } : {}),
        einkauf,
        __musterRef: musterRef,
      };
    });

    return {
      handle,
      titel: text(p.title),
      shopUrl: handle ? `${SHOP_HOST}/products/${handle}` : null,
      adminUrl: numId ? `https://admin.shopify.com/store/${STORE_HANDLE}/products/${numId}` : null,
      status: text(p.status),
      // Nur das Admin-Lesefeld belegt die Veroeffentlichung; kein Ersatz aus dem Handle.
      onlineStoreUrl: text(p.onlineStoreUrl),
      ...(Array.isArray(p.tags) && typeof p.isGiftCard === 'boolean' ? {
        musterRegeln: { tags: [...p.tags], geschenkgutschein: p.isGiftCard,
          basisHandle: text(p.musterBasis?.reference?.handle), vollstaendig: Object.hasOwn(p, 'musterBasis') },
      } : {}),
      produktgruppe: produktgruppe(p),
      // Lieferzeit laut Produktseite (service.lieferzeit), z. B. fuer die Muster-Nachfrage bei
      // Teppich nach Mass. Fehlt das Feld, fehlt der Schluessel - nie raten.
      ...(text(p.lieferzeit?.value) ? { lieferzeit: text(p.lieferzeit.value) } : {}),
      bild: bildUrl(p),
      eigenschaften: eigenschaften(customMap),
      muster: musterBlock(p, varianten, handleSet, musterKandidatenAusVarianten),
      varianten,
    };
  });

  // -- Zweite Runde: Muster <-> Original verknuepfen ------------------
  // Index aller echten (Nicht-Muster-)Varianten quer ueber alle Produkte,
  // gebaut aus dem bereits vollstaendigen ersten Durchlauf.
  const produktByHandle = new Map(ergebnis.map((p) => [p.handle, p]));
  const variantenById = new Map();
  const variantenByArtikelnummer = new Map();
  // Die Muster-SKU ist "M-" plus die SKU der Quellvariante, nicht deren
  // Artikelnummer. Beide stimmen oft ueberein, aber nicht immer: die
  // Lieferantennummer traegt teils eine Null mehr (Shop TEPLORN04_99,
  // Lieferant TEPLORN04_099; Shop TEPDENIA4_119, Lieferant TEPDENIA04_119).
  // Ohne diesen Index fanden 89 Mustervarianten ihr Original nicht und
  // zeigten keinen Weg zum Lieferanten.
  const variantenBySku = new Map();
  const indiziere = (map, key, eintrag) => { const liste = map.get(key) || []; liste.push(eintrag); map.set(key, liste); };
  const eindeutigerTreffer = liste => {
    const je = new Map((liste || []).map(t => [JSON.stringify([t.produkt.handle, t.variante.sku, t.variante.farbe || t.variante.titel]), t]));
    return je.size === 1 ? je.values().next().value : null;
  };
  for (const p of ergebnis) {
    for (const v of p.varianten) {
      if (v.wunschmass || skuIstMuster(v.sku) || p.handle?.startsWith('muster-')) continue;
      const eintrag = { variante: v, produkt: p };
      if (v.id) indiziere(variantenById, v.id, eintrag);
      if (!leer(v.sku)) indiziere(variantenBySku, v.sku, eintrag);
      if (!leer(v.einkauf?.artikelnummer)) {
        indiziere(variantenByArtikelnummer, v.einkauf.artikelnummer, eintrag);
      }
    }
  }

  const bauOriginal = (variante, produkt, quelle) => ({
    gefunden: true,
    quelle,
    variantenId: variante.id,
    sku: variante.sku,
    artikelnummer: variante.einkauf?.artikelnummer ?? null,
    farbnummer: variante.einkauf?.farbnummer ?? null,
    lieferant: variante.einkauf?.lieferant ?? null,
    url: variante.einkauf?.url ?? null,
    // Ohne Direktlink wenigstens die Suche beim Lieferanten - wie bei den
    // echten Varianten (linkStatus), damit auch jedes Muster einen Weg hat.
    suchlink: leer(variante.einkauf?.url) ? linkStatus(variante.einkauf ?? {}, lieferantSuchen, produkt.titel).suchlink : null,
    kollektion: variante.einkauf?.kollektion ?? null,
    hersteller: variante.einkauf?.hersteller ?? null,
    produktTitel: produkt.titel,
    produktHandle: produkt.handle,
  });

  const originalFuer = (musterVariante, musterProdukt) => {
    // Tier 1: einkauf.muster_variante (Variantenreferenz) - am verlaesslichsten.
    const ref = musterVariante.__musterRef;
    if (ref?.id) {
      if (variantenById.has(ref.id)) {
        const treffer = eindeutigerTreffer(variantenById.get(ref.id));
        if (treffer) return bauOriginal(treffer.variante, treffer.produkt, 'muster_variante');
      }
      return { gefunden: false, quelle: 'muster_variante', produktHandle: null,
        grund: 'Die hinterlegte Originalvariante fehlt oder ist kein gueltiger Warenartikel. Originalreferenz pruefen.' };
    }
    // Tier 2: SKU ohne "M-"-Praefix - zuerst gegen die SKUs der echten
    // Varianten (so entsteht die Muster-SKU), dann gegen deren Artikelnummern.
    if (skuIstMuster(musterVariante.sku)) {
      const quellSku = musterVariante.sku.slice(2);
      const kandidaten = variantenBySku.get(quellSku) ?? variantenByArtikelnummer.get(quellSku);
      const treffer = eindeutigerTreffer(kandidaten);
      if (treffer) return bauOriginal(treffer.variante, treffer.produkt, 'sku');
      if (kandidaten?.length) return { gefunden: false, quelle: 'sku', produktHandle: null,
        grund: 'Die Quell-Artikelnummer passt zu mehreren Produkten oder Ausfuehrungen. Originalreferenz pruefen.' };
      return { gefunden: false, quelle: 'sku', produktHandle: null,
        grund: 'Die Muster-SKU hat keine belegte Originalvariante. Originalreferenz pruefen.' };
    }
    // Tier 3: Produkt-Handle ohne "muster-"-Praefix - nur eindeutig, wenn das
    // Zielprodukt genau eine echte Variante mit Artikelnummer hat.
    const handle = text(musterProdukt.handle);
    if (handle && handle.startsWith('muster-')) {
      const zielProdukt = produktByHandle.get(handle.slice('muster-'.length));
      if (zielProdukt) {
        const kandidaten = zielProdukt.varianten.filter((v) => !skuIstMuster(v.sku) && !leer(v.einkauf?.artikelnummer));
        if (kandidaten.length === 1) return bauOriginal(kandidaten[0], zielProdukt, 'handle');
        if (kandidaten.length > 1) {
          return {
            gefunden: false, quelle: 'handle', artikelnummer: null, farbnummer: null, lieferant: null, url: null,
            kollektion: null, hersteller: null, produktTitel: zielProdukt.titel, produktHandle: zielProdukt.handle,
            grund: `Original ueber den Produktnamen gefunden (${zielProdukt.titel}), aber ${kandidaten.length} Farben zur Auswahl - Artikelnummer nicht eindeutig zuordenbar`,
          };
        }
      }
    }
    return {
      gefunden: false, quelle: null, artikelnummer: null, farbnummer: null, lieferant: null, url: null,
      kollektion: null, hersteller: null, produktTitel: null, produktHandle: null,
      grund: 'kein Original beim Lieferanten hinterlegt',
    };
  };

  for (const p of ergebnis) {
    const produktIstMuster = typeof p.handle === 'string' && p.handle.startsWith('muster-');
    // Musterprodukte haben in Shopify selten ein eigenes Bild. Statt eines
    // leeren Kastens zeigt die Liste dann das Bild des Originalprodukts -
    // im Kundengespraech ist genau das gemeint.
    if (!p.bild && produktIstMuster) {
      const original = produktByHandle.get(p.handle.slice('muster-'.length));
      if (original?.bild) p.bild = original.bild;
    }
    p.varianten = p.varianten.map((v) => {
      const { __musterRef, ...variante } = v;
      if (produktIstMuster || skuIstMuster(v.sku)) {
        return { ...variante, original: originalFuer(v, p) };
      }
      return { ...variante, link: linkStatus(variante.einkauf ?? {}, lieferantSuchen, p.titel) };
    });
  }

  gleicherDekorVerknuepfen(ergebnis);

  return { erstellt: jetzt.toISOString(), anzahl: ergebnis.length, produkte: ergebnis };
}

// -- Gleicher Dekor in anderer Vinyl-Art -------------------------------
// Fuer das Muster-Etikett ("Auch als Klickvinyl", Inhaber 2026-10-20). Belegt ist das nur,
// wenn drei Dinge zusammenkommen: derselbe Shop-Name vor dem Gedankenstrich (Serie und Farbe),
// derselbe Lieferant und eine gemeinsame Dekornummer in dessen Artikel- oder Farbnummer
// ("5052" in X-5052-03 und X-RCL5052-03). Ein gleicher Name allein reicht nicht - zwei
// Linien koennen dieselbe Farbbezeichnung fuer verschiedene Dekore tragen.
const DEKOR_NUMMER = /\d{3,}/g;

function dekorKandidat(p) {
  if (String(p.status ?? '').toUpperCase() !== 'ACTIVE' || leer(p.onlineStoreUrl) || String(p.handle ?? '').startsWith('muster-')) return null;
  const arten = String(p.eigenschaften?.arten ?? '').split(/\s*,\s*/).filter(Boolean);
  if (arten.length !== 1 || !/vinyl/i.test(arten[0])) return null;
  const name = normalisieren(String(p.titel ?? '').split(/\s+[–—-]\s+/)[0]).replace(/\s+/g, ' ').trim();
  const echte = p.varianten.filter((v) => !v.wunschmass && !skuIstMuster(v.sku));
  const lieferanten = new Set(echte.map((v) => text(v.einkauf?.lieferant)).filter(Boolean));
  if (!name || lieferanten.size !== 1) return null;
  const nummern = new Set(echte.flatMap((v) => [v.einkauf?.artikelnummer, v.einkauf?.farbnummer])
    .flatMap((w) => String(w ?? '').match(DEKOR_NUMMER) ?? []));
  return nummern.size ? { produkt: p, art: arten[0], schluessel: `${[...lieferanten][0]}|${name}`, nummern } : null;
}

/** Setzt `gleicherDekor: [{art, handle}]` an Produkten mit belegtem Gegenstueck; sonst fehlt das Feld. */
export function gleicherDekorVerknuepfen(produkte) {
  const gruppen = new Map();
  for (const p of produkte) {
    const k = dekorKandidat(p);
    if (k) gruppen.set(k.schluessel, [...(gruppen.get(k.schluessel) ?? []), k]);
  }
  for (const gruppe of gruppen.values()) {
    for (const k of gruppe) {
      const andere = gruppe.filter((o) => o.art.toLowerCase() !== k.art.toLowerCase() && [...o.nummern].some((n) => k.nummern.has(n)));
      if (andere.length) {
        k.produkt.gleicherDekor = andere.map((o) => ({ art: o.art, handle: o.produkt.handle }))
          .sort((a, b) => a.art.localeCompare(b.art, 'de') || a.handle.localeCompare(b.handle));
      }
    }
  }
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
