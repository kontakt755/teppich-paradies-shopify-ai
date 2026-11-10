/**
 * Pruefroutine nach Importen (Werkbank w-012).
 *
 * Prueft neu angelegte Produkte gegen die Regeln aus
 * .claude/skills/produktimport/SKILL.md,
 * domains/shopify/produktimport-arbeitsweise.md (Abschnitt 9: kein Musterservice) und
 * domains/shopify/benachrichtigungen/musterartikel.md - und gegen das, was
 * die uebrigen Produkte derselben Produktart tragen. Eine feste Liste
 * Pflicht-Filterfelder je Produktart gibt es nicht (Search & Discovery wird im
 * Admin gepflegt); die Mehrheit der Produktart ist deshalb der Massstab:
 * Ein Feld, das mindestens 80 % der Vergleichsprodukte tragen, fehlt einem
 * neuen Produkt vermutlich.
 *
 * Reine Funktionen ohne Netz - Laden und Ausgabe stehen in
 * operations/scripts/import-pruefen.mjs.
 */

/** Optionen, die eine Farbauswahl sind - wie OPTION_NAMES in assets/tp-sample-checkout-core.js. */
export const FARBOPTIONEN = Object.freeze(['farbe', 'dekor', 'color']);

/** Ab diesem Anteil der Vergleichsprodukte gilt ein Metafeld als ueblich. */
export const UEBLICH_AB = 0.8;
/** Darunter ist eine Produktart zu klein fuer einen Vergleich. */
export const MIN_VERGLEICH = 5;
/** Fehlende SKUs zaehlen nur, wo die Produktart sonst so gut wie immer SKUs traegt. */
export const SKU_UEBLICH_AB = 0.95;
/** Variantenbilder fehlen nur dort, wo die Produktart sie sonst ueberwiegend hat. */
export const BILD_UEBLICH_AB = 0.5;

/** Florklasse aus der Polhoehe: bis 5,0 mm Kurzflor, unter 10 mm Mittelflor, ab 10 mm Hochflor (Inhaber 07.10.2026). */
export function florklasseAusMm(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n <= 5 ? 'Kurzflor' : n < 10 ? 'Mittelflor' : 'Hochflor';
}

const MUSTER_PRAEFIX = 'muster-';

const klein = (s) => String(s ?? '').trim().toLowerCase();

export function istMusterProdukt(p) {
  return String(p.handle ?? '').startsWith(MUSTER_PRAEFIX) || klein(p.productType) === 'musterservice';
}

/**
 * Zusatzpositionen im Warenkorb, keine Kundenseite: UNLISTED mit Tag service
 * (Kettelservice, Wunschmass-Pauschale) und die Einfassungen der Marken-Teppiche
 * nach Mass (Tag marken-einfassung, nur in intern-* Sammlungen).
 */
export function istHilfsprodukt(p) {
  const tags = (p.tags ?? []).map(klein);
  if (tags.includes('marken-einfassung')) return true;
  return p.status === 'UNLISTED' && tags.includes('service');
}

/** Wortgleich zu canSample in assets/tp-sample-checkout-core.js. */
export function musterMoeglich(p) {
  if (['laminat', 'parkett', 'kork'].includes(klein(p.productType))) return false;
  return !(p.tags ?? []).some((t) => ['zubehoer', 'ohne-muster'].includes(klein(t)));
}

/**
 * Teppichfliesen, Teppichplanken und Sauberlauf-Fliesen haben seit 2026-11-06 keinen
 * Musterservice (domains/shopify/produktimport-arbeitsweise.md, Abschnitt 9).
 * Ihre Produktart ist "Teppichboden" wie bei Rollenware; erkennbar sind sie am Tag,
 * am Namen oder an der Kategorie. Im Bestand vom 2026-11-06 treffen Name und Kategorie
 * dieselben 69 Produkte, dem Tag fehlt eines davon - deshalb alle drei Merkmale.
 * Sauberlaufmatten und Sauberlauf von der Rolle gehoeren nicht dazu.
 */
export const FLIESEN_TAG = 'art: teppichfliese';
export const FLIESEN_NAME = /teppichfliese|teppichplanke|sauberlauf[- ]?fliese/i;
/** Dieselben Kategorien wie tp_paket_kollektionen in snippets/sorting.liquid. */
export const FLIESEN_SAMMLUNGEN = Object.freeze(['teppichfliesen', 'teppichfliesen-50x50', 'teppichfliesen-nadelfilz', 'teppichplanken', 'auslauf-teppichfliesen']);

export function istTeppichfliese(p) {
  if (istMusterProdukt(p)) return false;
  if ((p.tags ?? []).some((t) => klein(t) === FLIESEN_TAG)) return true;
  if (FLIESEN_NAME.test(`${p.title ?? ''} ${p.handle ?? ''}`)) return true;
  return (p.collections ?? []).some((h) => FLIESEN_SAMMLUNGEN.includes(h));
}

/** Kein Musterservice: Tag ohne-muster (gilt je Kollektion fuer alle Warenprodukte) oder Teppichfliese. */
export function ohneMusterservice(p) {
  return (p.tags ?? []).some((t) => klein(t) === 'ohne-muster') || istTeppichfliese(p);
}

/** In diesen Zustaenden ist ein Musterprodukt fuer Kunden erreichbar; DRAFT und ARCHIVED sind es nicht. */
export const MUSTER_ERREICHBAR = Object.freeze(['ACTIVE', 'UNLISTED']);

export function farbOption(p) {
  return (p.options ?? []).find((o) => FARBOPTIONEN.includes(klein(o.name))) ?? null;
}

function farbeDerVariante(v, optionName) {
  return (v.selectedOptions ?? []).find((o) => klein(o.name) === klein(optionName))?.value ?? null;
}

/** Interne Sammlungen (intern-*) sind keine Kategorie, in der Kunden das Produkt finden. */
export function kategorieSammlungen(p) {
  return (p.collections ?? []).filter((h) => !String(h).startsWith('intern-'));
}

/**
 * Einfassungsart eines Marken-Teppichs nach Mass (Paspel, Cover, Deluxe):
 * erreichbar ueber das Hauptprodukt, bewusst in keiner Kategorie - sonst
 * stuende jede Qualitaet mehrfach im Raster (Fehleranalyse 13.10.).
 */
export function istEinfassungsart(p) {
  return (p.tags ?? []).some((t) => klein(t) === 'marken-einfassung');
}

/**
 * Welche custom-Metafelder sind in einer Produktart ueblich?
 * @returns {Map<string, {anzahl:number, produkt:Set<string>, variante:Set<string>, skuAnteil:number}>}
 */
export function ueblicheFelder(produkte, { ab = UEBLICH_AB, min = MIN_VERGLEICH } = {}) {
  const jeArt = new Map();
  for (const p of produkte) {
    if (istMusterProdukt(p) || p.status === 'DRAFT') continue;
    const art = p.productType || '';
    if (!jeArt.has(art)) jeArt.set(art, []);
    jeArt.get(art).push(p);
  }
  const ergebnis = new Map();
  for (const [art, liste] of jeArt) {
    if (liste.length < min) continue;
    const pZaehler = new Map();
    const vZaehler = new Map();
    let vGesamt = 0;
    let mitSku = 0;
    let mitBild = 0;
    for (const p of liste) {
      for (const k of new Set(Object.keys(p.custom ?? {}))) pZaehler.set(k, (pZaehler.get(k) ?? 0) + 1);
      for (const v of p.variants ?? []) {
        vGesamt += 1;
        if (String(v.sku ?? '').trim()) mitSku += 1;
        if (v.image) mitBild += 1;
        for (const k of new Set(Object.keys(v.custom ?? {}))) vZaehler.set(k, (vZaehler.get(k) ?? 0) + 1);
      }
    }
    const produkt = new Set([...pZaehler].filter(([, n]) => n / liste.length >= ab).map(([k]) => k));
    const variante = new Set([...vZaehler].filter(([, n]) => vGesamt && n / vGesamt >= ab).map(([k]) => k));
    ergebnis.set(art, { anzahl: liste.length, produkt, variante, skuAnteil: vGesamt ? mitSku / vGesamt : 1, bildAnteil: vGesamt ? mitBild / vGesamt : 1 });
  }
  return ergebnis;
}

/**
 * Lieferanten mit muster.nachBezeichnung kennen unsere Artikelnummer nicht: ohne einkauf.farbname an der
 * Quellvariante haelt die Musterautomatik das Muster zurueck (Stillstand 31.10., 17 Muster).
 */
function ohneBezeichnung(p, nachBezeichnung) {
  return (p.variants ?? []).filter((v) => nachBezeichnung.has(v.einkaufLieferant) && !v.einkaufFarbname);
}
const lieferantenVon = (varianten) => [...new Set(varianten.map((v) => v.einkaufLieferant))].sort().join(', ');

function befund(p, stufe, regel, text) {
  return { handle: p.handle, titel: p.title, produktart: p.productType || '', stufe, regel, text };
}

/** Farben des Produkts, die sein Musterprodukt nicht fuehrt - die Bestellung faellt dort auf kostenloses-muster. */
function musterFarbBefund(p, muster, option) {
  const vorhanden = new Set((muster.variants ?? []).map((v) => klein(farbeDerVariante(v, option.name) ?? v.title)));
  const fehlend = option.values.filter((w) => !vorhanden.has(klein(w)));
  if (!fehlend.length) return null;
  return befund(p, 'fehler', 'muster-farben', `Muster ohne ${fehlend.length} Farbe(n): ${fehlend.slice(0, 5).join(', ')}${fehlend.length > 5 ? ' ...' : ''}`);
}

/**
 * Der Shop boete fuer eine Teppichfliese noch Muster an. Gemeldet wird der fehlende Tag,
 * nicht ein fehlendes Musterprodukt - sonst legt der naechste Import wieder eins an.
 */
function fliesenBefund(p) {
  return befund(p, 'fehler', 'muster-teppichfliese', 'Teppichfliese ohne Tag ohne-muster - Teppichfliesen, -planken und Sauberlauf-Fliesen haben keinen Musterservice: Tag setzen, kein Musterprodukt anlegen');
}

/**
 * Ware ohne Musterservice, deren Musterprodukt noch erreichbar ist (Regel "ganze Kollektion
 * ohne Muster": Tag ohne-muster an der Ware, Musterprodukt auf DRAFT). Archivierte Ware
 * regelt die Auslaufregel.
 */
function musterTrotzdemBefund(p, nachHandle) {
  if (istMusterProdukt(p) || p.status === 'ARCHIVED' || !ohneMusterservice(p)) return null;
  const muster = nachHandle.get(MUSTER_PRAEFIX + p.handle);
  if (!muster || !MUSTER_ERREICHBAR.includes(muster.status)) return null;
  return befund(p, 'fehler', 'muster-trotz-ohne-muster', `kein Musterservice, aber Musterprodukt ${muster.handle} steht noch auf ${muster.status} - auf DRAFT stellen`);
}

/**
 * @param {object} eingabe
 * @param {object[]} eingabe.produkte  alle Produkte des Shops (normalisiert, siehe normalisiere())
 * @param {string}   eingabe.seit      JJJJ-MM-TT - geprueft wird, was ab diesem Tag angelegt wurde
 * @param {string[]} [eingabe.handles] statt `seit` genau diese Produkte pruefen
 * @returns {{geprueft:number, befunde:object[]}}
 */
export function pruefeImporte({ produkte, seit, handles = null, nachBezeichnung = new Set() }) {
  const nachHandle = new Map(produkte.map((p) => [p.handle, p]));
  const neu = handles
    ? handles.map((h) => nachHandle.get(h)).filter(Boolean)
    : produkte.filter((p) => String(p.createdAt ?? '').slice(0, 10) >= seit);
  // Massstab sind die schon vorhandenen Produkte der Produktart - sonst
  // setzt ein grosser fehlerhafter Import seine eigene Norm. Ist eine
  // Produktart ganz neu, vergleicht der Import sich mit sich selbst.
  const neuSet = new Set(neu);
  const ueblichAlt = ueblicheFelder(produkte.filter((p) => !neuSet.has(p)));
  const ueblichAlle = ueblicheFelder(produkte);

  // SKUs im ganzen Shop, um Dubletten neuer Varianten zu finden.
  const skuZaehler = new Map();
  for (const p of produkte) for (const v of p.variants ?? []) {
    const s = String(v.sku ?? '').trim();
    if (s) skuZaehler.set(s, (skuZaehler.get(s) ?? 0) + 1);
  }

  const befunde = [];
  // Ein erreichbares Musterprodukt trotz fehlendem Musterservice wird je Ware einmal gemeldet -
  // neue Ware, ihr neues Musterprodukt und der Abgleich des Bestands fuehren alle hierher.
  const gemeldet = new Set();
  const meldeMusterTrotzdem = (ware) => {
    if (!ware || gemeldet.has(ware.handle)) return;
    gemeldet.add(ware.handle);
    const b = musterTrotzdemBefund(ware, nachHandle);
    if (b) befunde.push(b);
  };
  for (const p of neu) {
    if (istMusterProdukt(p)) {
      befunde.push(...pruefeMuster(p, nachHandle));
      meldeMusterTrotzdem(quelleVon(p, nachHandle));
      continue;
    }
    // Archiviert = fuer Kunden weg (Auslauf, verworfene Lieferanten-Entwuerfe, alte Tests).
    // Ein fehlendes Bild oder Preis 0 schadet dort niemandem.
    if (p.status === 'ARCHIVED') continue;
    // Testprodukte (Tag test, UNLISTED) sind Werkzeug fuer Theme-Tests, keine Kundenseite.
    if ((p.tags ?? []).some((t) => klein(t) === 'test') && p.status !== 'ACTIVE') continue;
    // Versteckte Hilfsprodukte (Kettelservice, Wunschmass-Pauschale) haengen
    // als Zusatzzeile an einer anderen Position - ohne Bild und Kategorie gewollt.
    if (istHilfsprodukt(p)) continue;
    // Archiviert = aus dem Shop genommen (Auslauf, Dublette): nichts zu pruefen.
    if (p.status === 'ARCHIVED') continue;

    if (p.status === 'DRAFT') befunde.push(befund(p, 'hinweis', 'entwurf', 'Entwurf - im Shop nicht sichtbar'));
    if (p.status === 'ACTIVE' && !p.onlineStoreUrl) {
      befunde.push(befund(p, 'fehler', 'nicht-veroeffentlicht', 'aktiv, aber nicht im Onlineshop veroeffentlicht (publishablePublish fehlt)'));
    }
    if (!p.productType) befunde.push(befund(p, 'fehler', 'produktart', 'keine Produktart (productType)'));
    if (!p.mediaCount) befunde.push(befund(p, p.status === 'DRAFT' ? 'hinweis' : 'fehler', 'bilder', 'keine Bilder'));
    if (p.status !== 'DRAFT' && !istEinfassungsart(p) && kategorieSammlungen(p).length === 0) {
      befunde.push(befund(p, 'fehler', 'kategorie', 'in keiner Kategorie (nur intern-* oder gar keine Sammlung)'));
    }
    if (!p.category || p.category === 'Uncategorized') {
      befunde.push(befund(p, 'hinweis', 'shopify-kategorie', 'Shopify-Produktkategorie fehlt (Uncategorized)'));
    }

    // Die Hoehenkategorien sollen auf custom.florklasse filtern (w-178): Rollenware mit
    // Florhoehe, aber ohne passende Klasse faellt dann aus Kurz-/Mittel-/Hochflor.
    const sollKlasse = p.productType === 'Teppichboden' && !/fliese|planke/i.test(p.title ?? '') ? florklasseAusMm(p.custom?.florhoehe_mm) : null;
    if (sollKlasse && p.custom?.florklasse !== sollKlasse) {
      befunde.push(befund(p, 'fehler', 'florklasse', `custom.florklasse ${p.custom?.florklasse ? `"${p.custom.florklasse}"` : 'fehlt'}, aus ${p.custom.florhoehe_mm} mm folgt ${sollKlasse}`));
    }

    const varianten = p.variants ?? [];
    const art = p.productType || '';
    const vergleich = ueblichAlt.get(art) ?? ueblichAlle.get(art);
    // Wunschmass-/Raummass-Varianten tragen bewusst keine SKU - gemeldet wird
    // nur, wo die Produktart sonst durchgehend SKUs fuehrt.
    const ohneSku = varianten.filter((v) => !String(v.sku ?? '').trim());
    if (ohneSku.length && (vergleich ? vergleich.skuAnteil >= SKU_UEBLICH_AB : true)) {
      befunde.push(befund(p, 'fehler', 'sku', `${ohneSku.length} Variante(n) ohne SKU`));
    }
    const doppelt = [...new Set(varianten.map((v) => String(v.sku ?? '').trim()).filter((s) => s && skuZaehler.get(s) > 1))];
    if (doppelt.length) befunde.push(befund(p, 'fehler', 'sku-doppelt', `SKU mehrfach im Shop: ${doppelt.slice(0, 5).join(', ')}${doppelt.length > 5 ? ' ...' : ''}`));
    const ohnePreis = varianten.filter((v) => !(Number(v.price) > 0));
    if (ohnePreis.length) befunde.push(befund(p, 'fehler', 'preis', `${ohnePreis.length} Variante(n) mit Preis 0`));

    // Profile fuehren ein Bild fuer alle Farben; gemeldet wird nur, wo die
    // Produktart sonst Variantenbilder traegt.
    const option = farbOption(p);
    if (option && (vergleich ? vergleich.bildAnteil >= BILD_UEBLICH_AB : true)) {
      const ohneBild = varianten.filter((v) => !v.image);
      if (ohneBild.length) {
        befunde.push(befund(p, 'fehler', 'variantenbild', `${ohneBild.length} von ${varianten.length} Farbvarianten ohne Variantenbild (z. B. ${farbeDerVariante(ohneBild[0], option.name)})`));
      }
    }

    if (vergleich) {
      const fehlt = [...vergleich.produkt].filter((k) => !(k in (p.custom ?? {})));
      if (fehlt.length) {
        befunde.push(befund(p, 'hinweis', 'filterfelder', `fehlt, was ${Math.round(UEBLICH_AB * 100)} % der ${vergleich.anzahl} ${p.productType}-Produkte tragen: custom.${fehlt.join(', custom.')}`));
      }
      const vFehlt = [...vergleich.variante].filter((k) => varianten.some((v) => !(k in (v.custom ?? {}))));
      if (vFehlt.length) {
        befunde.push(befund(p, 'hinweis', 'variantenfelder', `Varianten ohne ueblich gefuelltes custom.${vFehlt.join(', custom.')}`));
      }
    }

    // Teppichfliesen haben keinen Musterservice: statt Musterprodukt und Farbnamen zaehlt dort der Tag.
    const fliese = istTeppichfliese(p);
    if (fliese && musterMoeglich(p)) befunde.push(fliesenBefund(p));
    meldeMusterTrotzdem(p);
    const musterservice = musterMoeglich(p) && !fliese;

    const ohneName = musterservice ? ohneBezeichnung(p, nachBezeichnung) : [];
    if (ohneName.length) befunde.push(befund(p, 'fehler', 'muster-bezeichnung', `${ohneName.length} Variante(n) von Lieferant ${lieferantenVon(ohneName)} ohne einkauf.farbname - die Musterautomatik bestellt deren Muster nicht`));

    if (option && musterservice && p.status !== 'DRAFT') {
      const muster = nachHandle.get(MUSTER_PRAEFIX + p.handle);
      if (!muster) {
        befunde.push(befund(p, 'fehler', 'muster-fehlt', `kein Musterprodukt ${MUSTER_PRAEFIX}${p.handle} - der Konfigurator faellt still auf kostenloses-muster zurueck (sonst Tag ohne-muster setzen)`));
      } else {
        const b = musterFarbBefund(p, muster, option);
        if (b) befunde.push(b);
      }
    }
  }
  // Farben kommen auch an alten Produkten dazu - deren Musterprodukt waechst
  // nicht mit (Alvento/Zafira/Cortessa, Fehleranalyse 13.10.). Deshalb den
  // Musterabgleich fuer alle aktiven Produkte, nicht nur fuer die neuen.
  if (!handles) {
    const altOhneName = [];
    for (const p of produkte) {
      if (neuSet.has(p) || istMusterProdukt(p)) continue;
      // Kein Musterservice gilt fuer den ganzen Bestand, auch fuer versteckte Ware (Raummass ist UNLISTED):
      // Eine Kollektion wird spaeter herausgenommen, ein Musterprodukt bleibt dabei leicht stehen.
      meldeMusterTrotzdem(p);
      if (p.status !== 'ACTIVE') continue;
      if (istTeppichfliese(p)) {
        if (musterMoeglich(p)) befunde.push(fliesenBefund(p));
        continue;
      }
      if (!musterMoeglich(p)) continue;
      if (!istHilfsprodukt(p)) {
        const ohne = ohneBezeichnung(p, nachBezeichnung);
        if (ohne.length) altOhneName.push({ handle: p.handle, ohne });
      }
      const option = farbOption(p);
      const muster = option && nachHandle.get(MUSTER_PRAEFIX + p.handle);
      const b = muster && musterFarbBefund(p, muster, option);
      if (b) befunde.push(b);
    }
    // Eine Zeile statt hunderter: der Altbestand soll den Bericht zum neuen Import nicht zudecken.
    if (altOhneName.length) {
      const varianten = altOhneName.flatMap((a) => a.ohne);
      befunde.push(befund({ handle: 'altbestand' }, 'hinweis', 'muster-bezeichnung', `${varianten.length} Varianten in ${altOhneName.length} aktiven Produkten von Lieferant ${lieferantenVon(varianten)} ohne einkauf.farbname - deren Muster haelt die Musterautomatik zurueck (z. B. ${altOhneName.slice(0, 3).map((a) => a.handle).join(', ')})`));
    }
  }
  // Ein Entwurf ist im Shop unsichtbar: seine Luecken sind Arbeitsstand
  // (z. B. Vorlage Sonderposten mit Preis 0), kein Fehler fuer Kunden.
  for (const b of befunde) if (nachHandle.get(b.handle)?.status === 'DRAFT') b.stufe = 'hinweis';
  return { geprueft: neu.length, befunde };
}

/** Quellprodukt eines Musterprodukts: derselbe Handle ohne muster-. */
function quelleVon(m, nachHandle) {
  const handle = String(m.handle ?? '');
  return handle.startsWith(MUSTER_PRAEFIX) ? nachHandle.get(handle.slice(MUSTER_PRAEFIX.length)) : undefined;
}

/** Musterprodukt laut domains/shopify/benachrichtigungen/musterartikel.md. */
export function pruefeMuster(m, nachHandle) {
  const befunde = [];
  const quelle = quelleVon(m, nachHandle);
  // Auslaufregel (AGENTS.md, Produktdaten): Quelle archiviert -> Muster mit archiviert. Das ist kein Befund.
  if (m.status === 'ARCHIVED' && (!quelle || quelle.status === 'ARCHIVED')) return befunde;
  // Quelle ohne Musterservice (Tag ohne-muster, Teppichfliese): das Musterprodukt ruht auf DRAFT,
  // unveroeffentlicht ist dort gewollt. Steht es noch auf ACTIVE oder UNLISTED, meldet
  // pruefeImporte das an der Quelle (muster-trotz-ohne-muster).
  if (quelle && quelle.status !== 'ARCHIVED' && ohneMusterservice(quelle)) return befunde;
  // Das Sammelmuster ist keine Kopie eines Quellprodukts und traegt bewusst eine eigene SKU.
  if (m.handle === 'kostenloses-muster') return befunde;
  if (!quelle && m.handle !== 'kostenloses-muster') befunde.push(befund(m, 'hinweis', 'muster-quelle', 'kein Quellprodukt mit gleichem Handle ohne muster-'));
  if (m.status !== 'UNLISTED') befunde.push(befund(m, 'hinweis', 'muster-status', `Status ${m.status} statt UNLISTED`));
  if (!m.onlineStoreUrl) befunde.push(befund(m, 'fehler', 'muster-nicht-veroeffentlicht', 'nicht im Onlineshop veroeffentlicht - Musterbestellung scheitert'));
  const varianten = m.variants ?? [];
  const mitPreis = varianten.filter((v) => Number(v.price) !== 0);
  if (mitPreis.length) befunde.push(befund(m, 'fehler', 'muster-preis', `${mitPreis.length} Mustervariante(n) nicht 0,00 EUR`));
  const ohneM = varianten.filter((v) => !String(v.sku ?? '').toUpperCase().startsWith('M-'));
  if (ohneM.length) befunde.push(befund(m, 'fehler', 'muster-sku', `${ohneM.length} Mustervariante(n) ohne SKU-Praefix M-`));
  return befunde;
}

/**
 * JSONL einer bulkOperationRunQuery (BULK_QUERY im Skript) zu normalisierten
 * Produkten. Zeilen mit __parentId haengen an Produkt oder Variante.
 */
export function jsonlZuProdukten(text) {
  const produkte = new Map();
  const varianten = new Map();
  for (const zeile of String(text).split('\n')) {
    if (!zeile.trim()) continue;
    const o = JSON.parse(zeile);
    const id = String(o.id ?? '');
    if (!o.__parentId && id.includes('/Product/')) {
      produkte.set(id, normalisiereProdukt(o));
    } else if (id.includes('/ProductVariant/')) {
      const v = { id, sku: o.sku ?? '', title: o.title ?? '', price: o.price, image: o.image?.url ?? null, selectedOptions: o.selectedOptions ?? [], custom: {},
        einkaufLieferant: o.einkaufLieferant?.reference?.kuerzel?.value ?? null, einkaufFarbname: String(o.einkaufFarbname?.value ?? '').trim() || null };
      varianten.set(id, v);
      produkte.get(o.__parentId)?.variants.push(v);
    } else if (id.includes('/Collection/')) {
      produkte.get(o.__parentId)?.collections.push(o.handle);
    } else if (typeof o.key === 'string') {
      const ziel = produkte.get(o.__parentId) ?? varianten.get(o.__parentId);
      if (ziel && o.value != null && String(o.value).trim() !== '' && o.value !== '[]') ziel.custom[o.key] = o.value;
    }
  }
  return [...produkte.values()];
}

function normalisiereProdukt(o) {
  return {
    id: o.id,
    handle: o.handle,
    title: o.title,
    status: o.status,
    productType: o.productType ?? '',
    tags: o.tags ?? [],
    createdAt: o.createdAt,
    onlineStoreUrl: o.onlineStoreUrl ?? null,
    category: o.category?.fullName ?? null,
    mediaCount: o.mediaCount?.count ?? 0,
    options: (o.options ?? []).map((x) => ({ name: x.name, values: x.values ?? [] })),
    collections: [],
    custom: {},
    variants: [],
  };
}

/** Text fuer die Konsole: je Produkt eine Zeile pro Befund, Fehler zuerst. */
export function bericht({ geprueft, befunde }, { seit } = {}) {
  const fehler = befunde.filter((b) => b.stufe === 'fehler');
  const hinweise = befunde.filter((b) => b.stufe === 'hinweis');
  const produkteMitFehler = new Set(fehler.map((b) => b.handle)).size;
  const zeilen = [
    `Importpruefung${seit ? ` ab ${seit}` : ''}: ${geprueft} Produkte geprueft, ${fehler.length} Fehler in ${produkteMitFehler} Produkten, ${hinweise.length} Hinweise.`,
  ];
  const nachRegel = new Map();
  for (const b of befunde) nachRegel.set(`${b.stufe}:${b.regel}`, (nachRegel.get(`${b.stufe}:${b.regel}`) ?? 0) + 1);
  if (nachRegel.size) zeilen.push('', 'Je Regel: ' + [...nachRegel].sort().map(([k, n]) => `${k} ${n}`).join(' | '));
  for (const [titel, liste] of [['FEHLER', fehler], ['HINWEISE', hinweise]]) {
    if (!liste.length) continue;
    zeilen.push('', titel);
    for (const b of [...liste].sort((a, c) => a.handle.localeCompare(c.handle))) zeilen.push(`  ${b.handle}  [${b.regel}]  ${b.text}`);
  }
  return zeilen.join('\n');
}
