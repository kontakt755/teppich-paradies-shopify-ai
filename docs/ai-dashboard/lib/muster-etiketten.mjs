/**
 * Muster-Etiketten fuer den Etikettendrucker (Niimbot B1, 50 x 50 mm): welche Angaben auf ein
 * Etikett kommen und wo sie stehen. Reine Funktionen ohne DOM - der Browser zeichnet danach
 * (bausteine/etiketten-druck.mjs), die Tests pruefen Daten und Layout ohne Drucker.
 *
 * Bei Paketware steht zuerst die Art (custom.arten, z. B. "Klickvinyl").
 *
 * Layout (Inhaber 2026-10-20, 400 x 400 px, schwarz/weiss): oben der Shopname als Absender,
 * darunter Serie gross, Farbe, bei Paketware (Vinyl/Designboden) eine Trennlinie und links
 * Staerke/Nutzschicht, Nutzungsklassen und Format, rechts der QR-Code zur Produktseite; sonst
 * steht der QR-Code groesser in der Mitte. Unten "Art.-Nr." mit der SKU der echten Produktvariante -
 * nie die SKU des Musterartikels, nie ein Lieferantenname.
 *
 * Nur was Bestellung und Produktlexikon hergeben. Fehlt etwas, bleibt das Feld leer (Technikzeile
 * faellt weg) und die Vorschau markiert es.
 */
import { musterTitel } from './bestellinhalt.mjs';

export const SHOP_URL = 'https://www.teppich-paradies.net';
export const ABSENDER = 'www.teppich-paradies.net';

/**
 * 50 x 50 mm bei 203 dpi = 400 x 400 px (NiimBlue-Vorgabe fuer B1 50 x 50). Druckrichtung "top"
 * laut niimbluelib (printer_models): das Bild geht ungedreht raus. Der Druckkopf hat 384 px -
 * der Rand von 18 px haelt alles Wichtige im bedruckbaren Bereich.
 */
export const ETIKETT = { breite: 400, hoehe: 400, rand: 18, dichteStandard: 3, dichteMin: 1, dichteMax: 5 };

const leer = v => v === null || v === undefined || String(v).trim() === '' || ['–', '-', 'UNGEKLAERT', 'Default Title'].includes(String(v).trim());
const text = v => (leer(v) ? '' : String(v).trim());
/** SKU eines Musterartikels (eigenes Musterprodukt oder Sammelprodukt "Kostenloses Muster"). */
const istMusterSku = s => /^(TP-MUSTER|M-)/i.test(text(s));

/** Produktseite zum Handle. Ein eigenes Musterprodukt heisst "muster-<handle>" - der QR-Code soll zum Original. */
export function produktUrl(handle) {
  const h = originalHandle(handle);
  return h ? `${SHOP_URL}/products/${h}` : '';
}

export function originalHandle(handle) {
  const h = text(handle).replace(/^muster-/, '');
  return /^[a-z0-9][a-z0-9-]*$/i.test(h) ? h : '';
}

const WARENGRUPPE = /\s+(Teppichboden|Teppichfliesen?|Teppich|Vinylboden|Vinyl|Designboden|Designbelag|Klickvinyl|Klick-Vinyl|Laminat|Linoleum|PVC-Boden|PVC|Parkett|Kork(boden)?|Nadelvlies|Sauberlaufmatte|Läufer)\b.*$/i;

/**
 * Serie und Farbe aus Produkttitel, Farbe und Marke (custom.marke): "Solenta Eiche Dunkelbraun –
 * Klickvinyl" -> Serie "Solenta". Der Teil vor dem Gedankenstrich, ohne Farbe und Warengruppe.
 * Ist die Farbe der ganze Titelteil (Variante ohne eigene Farbe), traegt die Marke vorn die
 * Serie und der Rest ist die Farbe - nur wenn der Titel wirklich mit der Marke beginnt, sonst
 * bleibt die Farbe leer statt doppelt.
 * @returns {{serie: string, farbe: string}}
 */
export function serieUndFarbe(titel, farbe, marke = '') {
  const teil = musterTitel(titel).split(/\s+[–—-]\s+/)[0].trim();
  const f = text(farbe);
  const m = text(marke);
  const klein = x => x.toLowerCase();
  if (!f || klein(f) === klein(teil)) {
    if (m && klein(teil).startsWith(`${klein(m)} `)) return { serie: m, farbe: teil.slice(m.length).trim() };
    if (f) return { serie: teil.replace(WARENGRUPPE, '').trim() || teil, farbe: '' };
  }
  let s = teil;
  if (f) { const i = klein(s).indexOf(klein(f)); if (i > 0) s = s.slice(0, i); }
  s = s.replace(WARENGRUPPE, '').trim();
  return { serie: s || teil, farbe: f };
}

export const serieAus = (titel, farbe) => serieUndFarbe(titel, farbe).serie;

/** "Klasse 23 (Wohnen, stark), Klasse 32 (Gewerbe, normal)" -> "23 / 32". */
export function klassenNummern(wert) {
  const n = [...String(wert ?? '').matchAll(/(?:Klasse\s*)?\b(\d{2})\b/gi)].map(m => m[1]);
  return [...new Set(n)].join(' / ');
}

/** Technikzeilen fuer Paketware aus den Lexikon-Eigenschaften; fehlende Zeilen fallen weg. */
export function technikZeilen(eig = {}) {
  if (leer(eig?.qmProPaket)) return [];
  const z = [];
  // custom.arten (Metaobjekt-Liste, im Lexikon schon Klartext): "Klickvinyl" oder mehrere.
  const art = text(eig.arten).split(/\s*,\s*/).filter(Boolean).join(' / ');
  if (art) z.push({ label: 'Art', wert: art });
  const st = text(eig.gesamtstaerke), ns = text(eig.nutzschicht);
  if (st || ns) z.push({ label: st && ns ? 'Stärke / Nutzschicht' : st ? 'Stärke' : 'Nutzschicht', wert: [st, ns].filter(Boolean).join(' / ') });
  const kl = klassenNummern(eig.nutzungsklasse);
  if (kl) z.push({ label: 'Nutzungsklasse', wert: kl });
  const fo = text(eig.format);
  if (fo) z.push({ label: 'Format', wert: fo });
  return z;
}

/** Ein Etikett aus Werten (Bestellposition oder Eingabe von Hand). `fehlt` nennt leere Pflichtfelder; ohne SKU entfaellt die Art.-Nr.-Zeile ohne Hinweis. */
export function etikett({ serie, farbe, sku, handle, technik = [] } = {}) {
  const e = { serie: text(serie), farbe: text(farbe), sku: istMusterSku(sku) ? '' : text(sku), url: produktUrl(handle), technik: technik || [] };
  e.fehlt = [['serie', 'Serie'], ['farbe', 'Farbe'], ['url', 'Produktseite']].filter(([k]) => !e[k]).map(([, l]) => l);
  return e;
}

/** Welches Lexikon-Produkt gehoert zur Musterposition? Handle des Originals (nie des Musterartikels). */
export function handleFuerPosition(p) {
  return originalHandle(p?.musterQuelle?.produktHandle) || originalHandle(p?.handle);
}

/**
 * Variante des Originals: zuerst ueber die SKU der Quellvariante, dann ueber die Farbe, bei
 * genau einer Variante diese. Sonst null - lieber leer als die falsche Artikelnummer.
 */
export function varianteFuer(p, produkt) {
  const v = produkt?.varianten || [];
  const qSku = text(p?.musterQuelle?.sku);
  if (qSku) { const t = v.find(x => text(x.sku) === qSku); if (t) return t; }
  const f = text(p?.farbe).toLowerCase();
  if (f) { const t = v.filter(x => text(x.farbe).toLowerCase() === f); if (t.length === 1 || (t.length > 1 && new Set(t.map(x => x.sku)).size === 1)) return t[0]; }
  return v.length === 1 ? v[0] : null;
}

/** Etikett fuer eine Musterposition; `produkt` ist der Lexikon-Eintrag des Originals (oder null). */
export function etikettFuerPosition(p, produkt = null) {
  const variante = varianteFuer(p, produkt);
  const farbe = text(variante?.farbe) || text(p?.farbe);
  const titel = text(produkt?.titel) || text(p?.musterQuelle?.titel).split(/\s+[–—]\s+/)[0] || p?.titel;
  const sf = serieUndFarbe(titel, farbe, produkt?.eigenschaften?.marke);
  return etikett({
    serie: sf.serie,
    farbe: sf.farbe,
    sku: text(variante?.sku) || text(p?.musterQuelle?.sku),
    handle: handleFuerPosition(p),
    technik: technikZeilen(produkt?.eigenschaften),
  });
}

/** Etiketten fuer alle Muster einer Bestellung, eins je bestelltem Stueck. `produkte`: Map handle -> Lexikon-Eintrag. */
export function etikettenAusPositionen(positionen = [], produkte = new Map()) {
  const liste = [];
  for (const p of positionen || []) {
    if (!p?.istMuster) continue;
    const e = etikettFuerPosition(p, produkte.get(handleFuerPosition(p)) || null);
    const n = Number.isInteger(p.mengeBestellt) && p.mengeBestellt > 0 ? Math.min(p.mengeBestellt, 20) : 1;
    for (let i = 0; i < n; i++) liste.push(e);
  }
  return liste;
}

/**
 * Text in Zeilen brechen, die hoechstens `breite` messen (`mass(text)` liefert die Breite in px).
 * Zu viele Zeilen: die letzte endet auf "…". Ein einzelnes zu langes Wort wird hart getrennt.
 */
export function umbrechen(textWert, breite, mass, maxZeilen = 3) {
  const woerter = text(textWert).split(/\s+/).filter(Boolean);
  const zeilen = [];
  let zeile = '';
  const passt = t => mass(t) <= breite;
  for (let w of woerter) {
    while (!passt(w)) {
      let i = w.length - 1;
      while (i > 1 && !passt(w.slice(0, i))) i--;
      if (zeile) { zeilen.push(zeile); zeile = ''; }
      zeilen.push(w.slice(0, i)); w = w.slice(i);
    }
    const versuch = zeile ? `${zeile} ${w}` : w;
    if (passt(versuch)) zeile = versuch; else { zeilen.push(zeile); zeile = w; }
  }
  if (zeile) zeilen.push(zeile);
  if (zeilen.length <= maxZeilen) return zeilen;
  const rest = zeilen.slice(0, maxZeilen);
  let letzte = rest[maxZeilen - 1];
  while (letzte && !passt(`${letzte}…`)) letzte = letzte.slice(0, -1);
  rest[maxZeilen - 1] = `${letzte.trimEnd()}…`;
  return rest;
}

/**
 * Was wo steht, in Pixeln des Etiketts. `mass(text, groesse, fett)` misst Text (Canvas: measureText).
 * @returns {{texte: {text: string, x: number, y: number, groesse: number, fett: boolean}[], linien: {x1: number, x2: number, y: number}[], qr: {x: number, y: number, groesse: number}|null}}
 */
export function layout(e, mass) {
  const { breite, hoehe, rand } = ETIKETT;
  const innen = breite - 2 * rand;
  const texte = [];
  const linien = [];
  let y = rand;
  const skuText = e.sku ? `Art.-Nr. ${e.sku}` : '';
  const skuY = hoehe - rand - 24;
  const unten = (skuText ? skuY : hoehe - rand) - 8;
  let serieGroesse = 44, farbGroesse = 30;
  {
    // Ganze Namen erhalten, auch bei Einzeldekoren ohne Technik. Zuerst Platz
    // fuer lesbare Technik (16/20 px) und mindestens 100 px QR reservieren.
    const reserve = Math.max((e.technik?.length || 0) * 40 - 3, e.url ? 100 : 0);
    for (let s = 44; s >= 18; s--) {
      serieGroesse = s; farbGroesse = Math.round(30 * s / 44);
      const serienZeilen = umbrechen(e.serie, innen, t => mass(t, serieGroesse, true), Infinity).length;
      const farbZeilen = e.farbe ? umbrechen(e.farbe, innen, t => mass(t, farbGroesse, true), Infinity).length : 0;
      const technikY = rand + 23 + 8 + serienZeilen * Math.round(serieGroesse * 1.15) + farbZeilen * Math.round(farbGroesse * 1.15) + 14;
      if (unten - technikY >= reserve) break;
    }
  }
  const mitte = (t, g, f) => Math.round((breite - mass(t, g, f)) / 2);
  const block = (t, g, f, maxZeilen) => {
    for (const z of umbrechen(t, innen, s => mass(s, g, f), maxZeilen)) { texte.push({ text: z, x: mitte(z, g, f), y, groesse: g, fett: f }); y += Math.round(g * 1.15); }
  };
  block(ABSENDER, 20, true, 1);
  y += 8;
  block(e.serie, serieGroesse, true, Infinity);
  if (e.farbe) block(e.farbe, farbGroesse, true, Infinity);

  // Unten die Artikelnummer; was dazwischen frei ist, bekommen Technik und QR-Code.
  if (skuText) {
    let g = 24;
    while (g > 1 && mass(skuText, g, true) > innen) g--;
    texte.push({ text: skuText, x: mitte(skuText, g, true), y: skuY, groesse: g, fett: true });
  }
  let qr = null;
  if (e.technik?.length) {
    y += 4;
    linien.push({ x1: rand, x2: breite - rand, y });
    y += 10;
    const qrGroesse = e.url ? Math.max(0, Math.min(140, unten - y)) : 0;
    const spalte = innen - (qrGroesse ? qrGroesse + 12 : 0);
    let labelGroesse = 20, wertGroesse = 24;
    while (labelGroesse > 16 && e.technik.length * (labelGroesse + wertGroesse + 4) - 3 > unten - y) {
      labelGroesse--; wertGroesse--;
    }
    const technikText = (t, g, fett) => {
      while (g > 1 && mass(t, g, fett) > spalte) g--;
      texte.push({ text: t, x: rand, y: ty, groesse: g, fett });
    };
    let ty = y;
    for (const { label, wert } of e.technik) {
      technikText(label, labelGroesse, false); ty += labelGroesse + 1;
      technikText(wert, wertGroesse, true); ty += wertGroesse + 3;
    }
    if (qrGroesse >= 60) qr = { x: breite - rand - qrGroesse, y, groesse: qrGroesse };
  } else if (e.url) {
    y += 8;
    const g = Math.min(180, unten - y);
    if (g >= 60) qr = { x: Math.round((breite - g) / 2), y: y + Math.floor((unten - y - g) / 2), groesse: g };
  }
  return { texte, linien, qr };
}
