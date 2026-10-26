/**
 * Muster-Etiketten fuer den Etikettendrucker (Niimbot B1, 50 x 50, 50 x 80 oder 50 x 100 mm): welche Angaben auf ein
 * Etikett kommen und wo sie stehen. Reine Funktionen ohne DOM - der Browser zeichnet danach
 * (bausteine/etiketten-druck.mjs), die Tests pruefen Daten und Layout ohne Drucker.
 *
 * Bei Paketware und bei Vinyl von der Rolle steht zuerst die Art (custom.arten, z. B. "Klickvinyl"),
 * darunter "Auch als", wenn das Lexikon denselben Dekor in einer anderen Vinyl-Art belegt
 * (gleicherDekor, operations/lib/lexikon.mjs).
 *
 * Layout (Inhaber 2026-10-20, 400 x 400 px, schwarz/weiss; ueberarbeitet 26.10.): oben der Shopname als
 * Absender, darunter Serie gross, Farbe, eine Linie; dazwischen bei Paketware (Vinyl/Designboden) links
 * Art, Staerke, Nutzschicht, Nutzungsklassen und Format, rechts der QR-Code zur Produktseite; sonst
 * steht der QR-Code in der Mitte. Unter einer zweiten Linie "Art.-Nr." mit der SKU der echten
 * Produktvariante - nie die SKU des Musterartikels, nie ein Lieferantenname.
 *
 * Nur was Bestellung und Produktlexikon hergeben. Fehlt etwas, bleibt das Feld leer (Technikzeile
 * faellt weg) und die Vorschau markiert es.
 *
 * Nichts darf ueberlappen oder abgeschnitten werden, egal wie lang die Texte sind (Inhaber 2026-10-26):
 * layout() prueft jeden Entwurf (layoutProbleme) und setzt das ganze Etikett schrittweise kleiner, bis
 * alles passt. Unter 12 px Schrift geht es nicht - dann meldet es `passt: false` und der Druck bleibt gesperrt.
 */
import { musterTitel } from './bestellinhalt.mjs';

export const SHOP_URL = 'https://www.teppich-paradies.net';
export const ABSENDER = 'www.teppich-paradies.net';
/** Unter dem QR-Code, wo Platz ist (50 x 80, 50 x 100): wofuer der Code ist. */
export const QR_HINWEIS = 'Produkt im Shop ansehen';

/**
 * 50 x 50 mm bei 203 dpi = 400 x 400 px (NiimBlue-Vorgabe fuer B1 50 x 50). Druckrichtung "top"
 * laut niimbluelib (printer_models): das Bild geht ungedreht raus. Der Druckkopf hat nur 384 px
 * (48 mm), und Rolle wie Druckanfang sitzen nicht auf den Millimeter genau (NiimBlue #92). Mit 2,25 mm
 * Rand war auf echten Etiketten die letzte Ziffer der Art.-Nr. rechts und einmal die Shopadresse oben
 * halb weg (Foto Inhaber 26.10.) - deshalb 4 mm Rand rundum (32 px).
 */
export const ETIKETT = { format: '50x50', name: '50 × 50 mm', breite: 400, hoehe: 400, rand: 32, faktor: 1, dichteStandard: 3, dichteMin: 1, dichteMax: 5 };

/**
 * Etikettengroessen fuer den B1. Der Druckkopf bleibt 50 mm breit, die Laenge laeuft in
 * Vorschubrichtung - deshalb immer 400 px breit und ungedreht wie das quadratische Etikett.
 * 50 x 80 mm (Rolle seit 2026-10-26): 400 x 640 px, alles 1,3-mal so gross.
 * 50 x 100 mm (Inhaber 2026-10-21, zum Ausprobieren): 400 x 800 px, alles 1,6-mal so gross.
 */
export const ETIKETT_FORMATE = Object.freeze({
  '50x50': ETIKETT,
  '50x80': { ...ETIKETT, format: '50x80', name: '50 × 80 mm', hoehe: 640, faktor: 1.3 },
  '50x100': { ...ETIKETT, format: '50x100', name: '50 × 100 mm', hoehe: 800, faktor: 1.6 },
});
export const etikettFormat = name => ETIKETT_FORMATE[name] || ETIKETT;

/** Kleinste Schrift auf einem Etikett: 12 px = 1,5 mm. */
export const MIN_SCHRIFT = 12;

const UNTERLAENGE = /[gjpqyQµçşţąę(),;/\\[\]{}|@$§_]/;
/**
 * Wie weit ein Text um seine Oberkante (textBaseline "top") Tinte setzt, in px. Gemessen fuer Arial in
 * Chrome (2026-10-26): Akzente und Punkte ueber Grossbuchstaben (Ä, É, Å) ragen bis 0,13 der Schriftgroesse
 * darueber, Unterlaengen (g, y, Klammern, Schraegstrich) reichen bis 0,99 darunter, alles andere bis 0,8.
 */
export function tinte(t, g) {
  return {
    oben: /\p{Lu}\p{M}/u.test(String(t).normalize('NFD')) ? Math.ceil(0.13 * g) : 0,
    unten: Math.ceil((UNTERLAENGE.test(t) ? 0.99 : 0.8) * g),
  };
}

/** Bytes, die ein QR-Code der Version 1, 2, … mit Fehlerkorrektur M fasst (Byte-Modus, ISO 18004). */
const QR_BYTES_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];
/** Kantenlaenge des QR-Codes in Modulen, wie qrcode-generator ihn mit Version 0 (automatisch) und 'M' baut. */
export function qrModule(url) {
  const v = QR_BYTES_M.findIndex(n => n >= String(url).length) + 1;
  return v ? 17 + 4 * v : Infinity;
}
/** Kleinster QR-Code, den ein Handy sicher liest: jedes Modul mindestens 2 Druckpunkte (0,25 mm). */
export const qrMindest = url => 2 * qrModule(url);

/**
 * Groesste QR-Flaeche bis `g`, die genau auf das Kaestchenraster passt. Gezeichnet wird in ganzen Druckpunkten
 * je Kaestchen; der Rest einer krummen Flaeche blieb frei, und der Code sass im Druck tiefer und weiter links
 * als geplant (Testdruck Inhaber 26.10.: 140 px fuer 37 Kaestchen = 111 px Code, 29 px Luecke).
 */
export function qrRaster(url, g) {
  if (!url || !(g > 0)) return 0;
  const n = qrModule(url);
  return Number.isFinite(n) ? Math.floor(g / n) * n : 0;
}

/**
 * Helligkeit, unter der ein Pixel schwarz gedruckt wird. niimbluelib druckt jedes nicht ganz weisse Pixel
 * schwarz - die grauen Kantenpixel der Schrift machten den Druck fetter als die Vorschau, kleine Woerter
 * liefen zu (Testdruck 26.10.). Schwarz ab gut 40 % Deckung: duenne Striche bleiben ganz.
 */
export const SCHWELLE = 150;
/** RGBA-Bilddaten auf reines Schwarz/Weiss setzen (veraendert `rgba`); so sehen Vorschau und Druck gleich aus. */
export function schwarzWeiss(rgba, schwelle = SCHWELLE) {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000 < schwelle ? 0 : 255;
    rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  return rgba;
}

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

const WARENGRUPPE = /\s+(Teppichboden|Teppichfliesen?|Teppich|Vinylboden|Vinyl|Designboden|Designbelag|Klickvinyl|Klick-Vinyl|Laminat|Linoleum(boden)?|Kautschuk(boden)?|PVC-Boden|PVC|Parkett|Kork(boden)?|Nadelvlies|Sauberlaufmatte|Läufer)\b.*$/i;

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

/** Andere Vinyl-Arten desselben Dekors laut Lexikon (`gleicherDekor`), ohne die eigene Art. */
export function andereArten(produkt) {
  const eigene = new Set(text(produkt?.eigenschaften?.arten).toLowerCase().split(/\s*,\s*/));
  const arten = (produkt?.gleicherDekor || []).map(g => text(g?.art)).filter(a => a && !eigene.has(a.toLowerCase()));
  return [...new Set(arten)];
}

/**
 * Rollenbreiten aus den Varianten (Option "Breite", z. B. "400 cm"), bei bekannter Farbe nur deren Breiten;
 * ohne solche Option custom.rollenbreite (in m). Ergebnis "400 / 500 cm", sonst leer - "Wunschmaß" und
 * Millimeterwerte (Profile) sind keine Rollenbreite.
 */
export function breitenAus(produkt, farbe = '') {
  const varianten = produkt?.varianten || [];
  const f = text(farbe).toLowerCase();
  const eigene = f ? varianten.filter(v => text(v.farbe).toLowerCase() === f) : [];
  const cm = new Set();
  for (const v of eigene.length ? eigene : varianten) {
    for (const o of v.optionen || []) {
      const m = /^breite$/i.test(text(o.name)) && /^(\d+(?:[.,]\d+)?)\s*cm$/i.exec(text(o.wert));
      if (m) cm.add(Number(m[1].replace(',', '.')));
    }
  }
  const rolle = Number(String(produkt?.eigenschaften?.rollenbreite ?? '').replace(',', '.'));
  if (!cm.size && rolle > 0 && rolle <= 10) cm.add(Math.round(rolle * 100));
  return cm.size ? `${[...cm].sort((x, y) => x - y).map(z => String(z).replace('.', ',')).join(' / ')} cm` : '';
}

/**
 * Technikzeilen aus den Lexikon-Eigenschaften; fehlende Zeilen fallen weg. Paketware bekommt Art, Staerke/
 * Nutzschicht, Nutzungsklassen und Format, Vinyl von der Rolle die Art (und "Auch als").
 *
 * Eckdaten (Inhaber 26.10.: "wenn so viel Platz ist, ein paar Eckdaten auch zu den anderen Sachen"):
 * Teppichboden und alle andere Ware ohne Paket bekommen Material, Breite, Florhoehe (sonst Staerke) und
 * Nutzungsklasse, alle dazu "Fußbodenheizung: ja", wenn belegt. Diese Zeilen tragen `zusatz: true` -
 * layout() setzt sie nur, solange dafuer nichts kleiner wird.
 */
export function technikZeilen(eig = {}, auchAls = [], breiten = '') {
  // custom.arten (Metaobjekt-Liste, im Lexikon schon Klartext): "Klickvinyl" oder mehrere.
  const art = text(eig?.arten).split(/\s*,\s*/).filter(Boolean).join(' / ');
  const paket = !leer(eig?.qmProPaket);
  const z = [], zusatz = [];
  if (paket || /vinyl/i.test(art)) {
    if (art) z.push({ label: 'Art', wert: art });
    const auch = [...new Set((auchAls || []).map(a => text(a)).filter(Boolean))];
    if (auch.length) z.push({ label: 'Auch als', wert: auch.join(' / ') });
  }
  const st = text(eig?.gesamtstaerke), ns = text(eig?.nutzschicht);
  const staerke = st || ns ? { label: st && ns ? 'Stärke / Nutzschicht' : st ? 'Stärke' : 'Nutzschicht', wert: [st, ns].filter(Boolean).join(' / ') } : null;
  const kl = klassenNummern(eig?.nutzungsklasse);
  if (paket) {
    if (staerke) z.push(staerke);
    if (kl) z.push({ label: 'Nutzungsklasse', wert: kl });
    const fo = text(eig.format);
    if (fo) z.push({ label: 'Format', wert: fo });
  } else {
    // Lange Materialangaben ("Polyethylen-Monofilament (glatt) und …") gehoeren nicht aufs Muster.
    const material = [text(eig?.fasermaterial), text(eig?.material)].find(Boolean);
    if (material && material.length <= 40) zusatz.push({ label: 'Material', wert: material });
    if (text(breiten)) zusatz.push({ label: 'Breite', wert: text(breiten) });
    const flor = text(eig?.florhoehe);
    if (flor) zusatz.push({ label: 'Florhöhe', wert: flor });
    else if (staerke) zusatz.push(staerke);
    if (kl) zusatz.push({ label: 'Nutzungsklasse', wert: kl });
  }
  if (/^ja$/i.test(text(eig?.fussbodenheizung))) zusatz.push({ label: 'Fußbodenheizung', wert: 'ja' });
  return [...z, ...zusatz.map(r => ({ ...r, zusatz: true }))];
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
    technik: technikZeilen(produkt?.eigenschaften, andereArten(produkt), breitenAus(produkt, farbe)),
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

/** Passt jedes Wort von `t` in Schrift g auf die Breite w? Sonst muesste es getrennt werden. */
export const woerterPassen = (t, w, g, fett, mass) => text(t).split(/\s+/).filter(Boolean).every(x => mass(x, g, fett) <= w);

/**
 * Text fuer die Breite `w`: zuerst kleiner bis `gMin`, dann an Wortgrenzen umbrechen (dafuer notfalls bis
 * MIN_SCHRIFT kleiner). `zuLang`: ein Wort passt auch so nicht und wurde getrennt.
 */
export function einpassen(t, w, g, gMin, fett, mass) {
  while (g > gMin && mass(t, g, fett) > w) g--;
  if (mass(t, g, fett) <= w) return { g, zeilen: [t], zuLang: false };
  while (g > MIN_SCHRIFT && !woerterPassen(t, w, g, fett, mass)) g--;
  return { g, zeilen: umbrechen(t, w, s => mass(s, g, fett), Infinity), zuLang: !woerterPassen(t, w, g, fett, mass) };
}

/**
 * Zeilen untereinander unter `vorige` (eine Textzeile oder {y} als Oberkante): erste Zeile im Abstand
 * `erster`, weitere im 1,15-fachen der Schrift - aber nie so eng, dass Unterlaenge und Umlaut sich
 * beruehren (tinte). `x`: linker Rand als Zahl oder als Funktion der Zeile.
 */
export function stapeln(zeilen, g, fett, vorige, erster, x) {
  const out = [];
  for (const z of zeilen) {
    const v = out.at(-1) || vorige;
    const y = v.text === undefined ? v.y + tinte(z, g).oben
      : v.y + Math.max(out.length ? Math.round(g * 1.15) : erster, tinte(v.text, v.groesse).unten + tinte(z, g).oben + 2);
    out.push({ text: z, x: typeof x === 'function' ? x(z) : x, y, groesse: g, fett });
  }
  return out;
}

/**
 * Prueft ein fertiges Layout: jeder Text und der QR-Code im Rand, keine zwei Teile beruehren sich
 * (Breite gemessen, Hoehe nach tinte(), dazu 1 px Kantenglaettung ringsum - der Drucker setzt jedes nicht
 * ganz weisse Pixel schwarz), keine Schrift unter MIN_SCHRIFT, nichts mit "…" gekuerzt, der QR-Code da und
 * gross genug. Leere Liste = druckbar.
 */
export function layoutProbleme({ texte = [], linien = [], qr = null }, mass, format = ETIKETT, url = '') {
  const { breite, hoehe, rand } = format;
  const probleme = [];
  const teile = [];
  for (const t of texte) {
    const w = mass(t.text, t.groesse, t.fett), { oben, unten } = tinte(t.text, t.groesse), name = `„${t.text}“`;
    if (t.groesse < MIN_SCHRIFT) probleme.push(`${name} ist kleiner als ${MIN_SCHRIFT} px`);
    if (t.text.includes('…')) probleme.push(`${name} ist gekürzt`);
    if (t.x < rand - 0.01 || t.x + w > breite - rand + 0.01 || t.y - oben < rand - 0.01 || t.y + t.groesse > hoehe - rand + 0.01) probleme.push(`${name} ragt über den Rand`);
    teile.push({ name, x1: t.x - 1, x2: t.x + w + 1, y1: t.y - oben - 1, y2: t.y + unten + 1 });
  }
  for (const l of linien) teile.push({ name: 'Trennlinie', x1: l.x1, x2: l.x2, y1: l.y, y2: l.y + 2 });
  if (qr) {
    if (qr.x < rand || qr.y < rand || qr.x + qr.groesse > breite - rand || qr.y + qr.groesse > hoehe - rand) probleme.push('QR-Code ragt über den Rand');
    teile.push({ name: 'QR-Code', x1: qr.x, x2: qr.x + qr.groesse, y1: qr.y, y2: qr.y + qr.groesse });
  }
  if (url && !qr) probleme.push('kein Platz für den QR-Code');
  else if (url && qr.groesse < qrMindest(url)) probleme.push(`QR-Code zu klein (${qr.groesse} px)`);
  for (let i = 0; i < teile.length; i++) {
    for (let j = i + 1; j < teile.length; j++) {
      const a = teile[i], b = teile[j];
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) probleme.push(`${a.name} berührt ${b.name}`);
    }
  }
  return probleme;
}

/**
 * Was wo steht, in Pixeln des Etiketts. `mass(text, groesse, fett)` misst Text (Canvas: measureText).
 * Zuerst in der Groesse des Formats; meldet layoutProbleme etwas, wird das ganze Etikett in Schritten von
 * 2 % kleiner gesetzt, bis zur Mindestschrift. `passt: false` heisst: auch dann nicht - so nicht drucken.
 * `zeilen`: die Technikzeilen, die wirklich auf dem Etikett stehen (Zusatzzeilen nur, wo Platz war).
 * @returns {{texte: {text: string, x: number, y: number, groesse: number, fett: boolean}[], linien: {x1: number, x2: number, y: number}[], qr: {x: number, y: number, groesse: number}|null, passt: boolean, probleme: string[], zeilen: {label: string, wert: string, zusatz?: boolean}[]}}
 */
export function layout(e, mass, format = ETIKETT) {
  const technik = e.technik || [];
  const fest = technik.filter(z => !z.zusatz);
  const basis = layoutMit({ ...e, technik: fest }, mass, format);
  // Zusatzzeilen der Reihe nach dazu, jede nur, wenn dafuer nichts schrumpft: gleiche Skala, Serie und
  // Technik nicht kleiner als ohne - ausser wo sie ohne Zusatz groesser sind als noetig (Serie ueber 40 px,
  // Technik ueber 18 px in 50 x 50; auf langen Rollen entsprechend mehr). Passt eine Zeile nicht, kommt
  // die naechste dran.
  let gewaehlt = basis, zeilen = fest;
  const f = format.faktor || 1;
  const serieMin = Math.min(basis.masse.serie, Math.round(40 * f));
  const technikMin = Math.min(basis.masse.technik, Math.round(18 * f));
  for (const z of technik.filter(r => r.zusatz)) {
    if (!basis.passt) break;
    const versuch = layoutMit({ ...e, technik: [...zeilen, z] }, mass, format);
    const m = versuch.masse;
    if (versuch.passt && m.skala === basis.masse.skala && m.serie >= serieMin && (!fest.length || m.technik >= technikMin)) {
      gewaehlt = versuch; zeilen = [...zeilen, z];
    }
  }
  return gewaehlt;
}

function layoutMit(e, mass, format) {
  let l;
  for (let skala = format.faktor || 1; ; skala = Math.round((skala - 0.02) * 100) / 100) {
    l = entwurf(e, mass, format, skala);
    l.probleme.push(...layoutProbleme(l, mass, format, e.url));
    if (!l.probleme.length || skala * 16 <= MIN_SCHRIFT) break;
  }
  return { ...l, passt: !l.probleme.length, zeilen: e.technik || [] };
}

/**
 * Ein Layout in Skala `skala` (1 = 50 x 50); prueft selbst nur, ob Woerter getrennt werden mussten.
 *
 * Aufbau (Inhaber 26.10.: "professioneller, mittiger, besser angeordnet"): eine Stimme pro Ebene statt
 * alles fett. Oben die Shopadresse klein und normal, darunter die Serie gross und fett, die Farbe normal.
 * Zwei duenne Linien rahmen den Mittelteil (QR-Code, bei Paketware mit Technik), unten "Art.-Nr." normal
 * und die Nummer fett in einer Zeile. Mittige Zeilen halten 1 mm mehr Abstand zum Rand als die Linien.
 */
function entwurf(e, mass, format, skala) {
  const { breite, hoehe, rand } = format;
  const px = n => Math.round(n * skala);
  const innen = breite - 2 * rand;
  const satz = innen - 2 * px(8);
  // Hochformat (50 x 80, 50 x 100): Technik als Tabelle ueber die volle Breite, QR-Code darunter.
  const hoch = hoehe > breite;
  const technik = e.technik || [];
  const probleme = [];
  const mittig = (g, f) => z => Math.round((breite - mass(z, g, f)) / 2);
  const luft = px(10);
  const unterkante = t => t.y + tinte(t.text, t.groesse).unten;
  const oberkante = t => t.y - tinte(t.text, t.groesse).oben;

  const absender = einpassen(ABSENDER, satz, px(18), MIN_SCHRIFT, false, mass);
  const kopf = stapeln(absender.zeilen, absender.g, false, { y: rand }, 0, mittig(absender.g, false));

  // Unten die Artikelnummer: "Art.-Nr." und Nummer in einer Zeile, sonst untereinander.
  let artikel = [];
  if (e.sku) {
    const LABEL = 'Art.-Nr.';
    let g = px(20);
    const breiteBei = k => mass(LABEL, k, false) + Math.round(k * 0.3) + mass(e.sku, k, true);
    while (g > MIN_SCHRIFT && breiteBei(g) > satz) g--;
    if (breiteBei(g) <= satz) {
      const x = Math.round((breite - breiteBei(g)) / 2);
      const y = hoehe - rand - g;
      artikel = [{ text: LABEL, x, y, groesse: g, fett: false }, { text: e.sku, x: Math.round(x + mass(LABEL, g, false) + g * 0.3), y, groesse: g, fett: true }];
    } else {
      const n = einpassen(e.sku, satz, px(20), MIN_SCHRIFT, true, mass);
      if (n.zuLang) probleme.push(`„Art.-Nr. ${e.sku}“ ist zu lang`);
      const z = stapeln([LABEL], n.g, false, { y: 0 }, 0, mittig(n.g, false));
      z.push(...stapeln(n.zeilen, n.g, true, z[0], Math.round(n.g * 1.15), mittig(n.g, true)));
      const ab = hoehe - rand - (z.at(-1).y + n.g);
      artikel = z.map(t => ({ ...t, y: t.y + ab }));
    }
  }
  const mitteUnten = artikel.length ? Math.min(...artikel.map(oberkante)) - luft - 2 - luft : hoehe - rand;

  const qrMin = e.url ? qrMindest(e.url) : 0;
  const qrPlatz = e.url ? Math.max(px(100), qrMin) : 0;
  const qrMax = Math.min(px(160), innen);
  // Der QR-Code rechts nimmt hoechstens die halbe Breite, sonst bleibt fuer die Technik nichts.
  const qrRechts = e.url && !hoch ? Math.min(px(140), Math.floor(innen / 2)) : 0;
  const lMin = Math.max(MIN_SCHRIFT, px(16));
  const wPlus = px(4);
  const zeilen = technik.map(({ label, wert }) => [text(label), text(wert)]);
  // In der Tabelle bekommt "Stärke / Nutzschicht" mit "10 mm / 0,55 mm" je eine eigene Zeile.
  const tabelle = zeilen.flatMap(([a, b]) => {
    const as = a.split(' / '), bs = b.split(' / ');
    return as.length > 1 && as.length === bs.length ? as.map((x, i) => [x, bs[i]]) : [[a, b]];
  });
  const hoeheVon = texte => (texte.length ? Math.max(...texte.map(t => t.y + t.groesse)) : 0);
  /**
   * Technik als Tabelle ab y = 0: Bezeichnung links, Wert fett rechtsbuendig an der Spalte, gleiche Schrift
   * und Grundlinie. null, wenn eine Zeile nicht in die Spalte passt.
   */
  const tabelleSetzen = (l, spalte) => {
    if (!tabelle.every(([a, b]) => mass(a, l, false) + px(16) + mass(b, l, true) <= spalte)) return null;
    const texte = [];
    let vorige = null;
    for (const [a, b] of tabelle) {
      const ink = [a, b].filter(Boolean).map(t => tinte(t, l));
      const oben = Math.max(0, ...ink.map(i => i.oben));
      const y = vorige ? vorige.y + Math.max(Math.round(l * 1.5), vorige.unten + oben + 2) : oben;
      if (a) texte.push({ text: a, x: rand, y, groesse: l, fett: false });
      if (b) texte.push({ text: b, x: Math.floor(rand + spalte - mass(b, l, true)), y, groesse: l, fett: true });
      vorige = { y, unten: Math.max(0, ...ink.map(i => i.unten)) };
    }
    return { texte, zuLang: [], hoehe: hoeheVon(texte), l };
  };
  /** Technik untereinander ab y = 0 (lange Werte, z. B. mehrere "Auch als"): Bezeichnung in Schrift l, darunter der Wert fett und px(4) groesser. */
  const stapelSetzen = (l, spalte) => {
    const texte = [], zuLang = [];
    for (const [label, wert] of zeilen) {
      for (const [t, g, gMin, fett] of [[label, l, MIN_SCHRIFT, false], [wert, l + wPlus, Math.max(MIN_SCHRIFT, Math.round((l + wPlus) * 0.75)), true]]) {
        if (!t) continue;
        const p = einpassen(t, spalte, g, gMin, fett, mass);
        if (p.zuLang) zuLang.push(`„${t}“ ist zu lang`);
        const vorige = texte.at(-1) || { y: 0 };
        texte.push(...stapeln(p.zeilen, p.g, fett, vorige, vorige.groesse + (fett ? 1 : 3), rand));
      }
    }
    return { texte, zuLang, hoehe: hoeheVon(texte), l };
  };
  /** Lieber Tabelle (kompakt, ruhig) als untereinander - jeweils in der groessten Schrift, die in `platz` passt. */
  const technikSetzen = (spalte, platz) => {
    for (let l = px(20); l >= lMin; l--) { const t = tabelleSetzen(l, spalte); if (t && t.hoehe <= platz) return t; }
    let l = px(20), block = stapelSetzen(l, spalte);
    while (l > lMin && block.hoehe > platz) block = stapelSetzen(--l, spalte);
    return block;
  };
  const spalteQuer = innen - (qrRechts ? qrRaster(e.url, qrRechts) + px(12) : 0);
  const spalteMin = hoch ? innen : spalteQuer;
  const technikMin = technik.length ? Math.min(tabelleSetzen(lMin, spalteMin)?.hoehe ?? Infinity, stapelSetzen(lMin, spalteMin).hoehe) : 0;
  const reserve = !technik.length ? qrPlatz : hoch ? technikMin + (e.url ? luft + qrPlatz : 0) : Math.max(technikMin, qrPlatz);
  const mitteDa = Boolean(e.url || technik.length);

  // Ganze Namen erhalten, auch bei Einzeldekoren ohne Technik: so gross, wie der reservierte Platz zulaesst.
  // Das Etikett wird nur laenger, nicht breiter: kein Wort darf getrennt werden muessen.
  // Lieber kleiner als mehr Zeilen (Foto Inhaber 26.10.: vierzeiliger Kopf wirkte unruhig): die wenigsten
  // Zeilen, die bis hinunter zu `boden` erreichbar sind, und dafuer die groesste Schrift.
  const zeilenFuer = (t, g, fett, boden) => {
    if (!t) return { g, zeilen: [] };
    const zeilenBei = k => (mass(t, k, fett) <= satz ? [t] : umbrechen(t, satz, x => mass(x, k, fett), Infinity));
    let best = { g, zeilen: zeilenBei(g) };
    for (let k = g - 1; k >= Math.max(MIN_SCHRIFT, boden) && best.zeilen.length > 1; k--) {
      const z = zeilenBei(k);
      if (z.length < best.zeilen.length) best = { g: k, zeilen: z };
    }
    return best;
  };
  const sMin = Math.max(MIN_SCHRIFT, px(18));
  let namen = [], mitteOben = 0, getrennt = false, serieG = 0;
  for (let s = px(44); s >= sMin; s--) {
    const sz = zeilenFuer(e.serie, s, true, Math.min(Math.round(s * 0.7), px(28)));
    const fz = zeilenFuer(e.farbe, Math.max(MIN_SCHRIFT, Math.round(30 * sz.g / 44)), false, Math.min(Math.round(30 * sz.g / 44 * 0.7), px(20)));
    getrennt = !woerterPassen(e.serie, satz, sz.g, true, mass) || !woerterPassen(e.farbe, satz, fz.g, false, mass);
    if (getrennt && s > sMin) continue;
    const serie = stapeln(sz.zeilen, sz.g, true, kopf.at(-1), Math.round(absender.g * 1.15) + px(10), mittig(sz.g, true));
    const farbe = stapeln(fz.zeilen, fz.g, false, serie.at(-1) || kopf.at(-1), Math.round(sz.g * 1.15), mittig(fz.g, false));
    namen = [...serie, ...farbe];
    serieG = sz.g;
    mitteOben = unterkante(namen.at(-1) || kopf.at(-1)) + (mitteDa ? luft + 2 + luft : 0);
    if (mitteUnten - mitteOben >= reserve) break;
  }
  if (getrennt) probleme.push(`„${[e.serie, e.farbe].filter(Boolean).join(' ')}“ hat ein zu langes Wort`);

  const texte = [...kopf, ...namen, ...artikel];
  const linien = [];
  if (mitteDa) linien.push({ x1: rand, x2: breite - rand, y: mitteOben - luft - 2 });
  if (artikel.length) linien.push({ x1: rand, x2: breite - rand, y: mitteUnten + luft });
  const platz = mitteUnten - mitteOben;
  let qr = null, technikG = 0;
  /**
   * QR-Code mittig unter einem Block der Hoehe `ueber` (Abstand `abstand`), alles als Gruppe mittig zwischen
   * den Linien. Bleibt im Hochformat genug Luft, steht darunter klein, wofuer der Code ist. Gibt die
   * Oberkante der Gruppe zurueck.
   */
  const qrMitHinweis = (ueber, abstand) => {
    const g = e.url ? qrRaster(e.url, Math.min(qrMax, platz - ueber - abstand)) : 0;
    const mitQr = g > 0 && g >= qrMin;
    const hg = Math.max(MIN_SCHRIFT, px(16));
    const hinweis = hoch && mitQr && platz - ueber - abstand - g >= 3 * luft + hg && mass(QR_HINWEIS, hg, false) <= satz;
    const gruppe = ueber + (mitQr ? abstand + g : 0) + (hinweis ? luft + hg : 0);
    const ab = mitteOben + Math.max(0, Math.floor((platz - gruppe) / 2));
    if (mitQr) qr = { x: Math.round((breite - g) / 2), y: ab + ueber + abstand, groesse: g };
    if (hinweis) texte.push({ text: QR_HINWEIS, x: mittig(hg, false)(QR_HINWEIS), y: qr.y + g + luft, groesse: hg, fett: false });
    return ab;
  };
  if (technik.length) {
    const qrGroesse = hoch ? 0 : qrRaster(e.url, Math.min(qrRechts, platz));
    const spalte = hoch ? innen : innen - (qrGroesse ? qrGroesse + px(12) : 0);
    const technikPlatz = platz - (hoch && e.url ? luft + qrPlatz : 0);
    const block = technikSetzen(spalte, technikPlatz);
    technikG = block.l;
    probleme.push(...block.zuLang);
    if (hoch) {
      const ab = qrMitHinweis(block.hoehe, block.hoehe ? luft : 0);
      texte.push(...block.texte.map(t => ({ ...t, y: t.y + ab })));
    } else {
      // Querformat: Technik und QR-Code nebeneinander, gemeinsam mittig zwischen den Linien.
      const ab = mitteOben + Math.max(0, Math.floor((platz - Math.max(block.hoehe, qrGroesse)) / 2));
      texte.push(...block.texte.map(t => ({ ...t, y: t.y + ab })));
      if (qrGroesse && qrGroesse >= qrMin) qr = { x: breite - rand - qrGroesse, y: ab, groesse: qrGroesse };
    }
  } else if (e.url) {
    qrMitHinweis(0, 0);
  }
  return { texte, linien, qr, probleme, masse: { skala, serie: serieG, technik: technikG } };
}
