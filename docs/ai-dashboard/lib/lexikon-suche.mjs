/**
 * Suche im Produktlexikon - gilt im Server (Trefferliste) und im Browser
 * (passende Farben im Produktdetail hervorheben).
 *
 * Am Telefon oder vom Musteraufkleber kommt meist der Lieferantenname samt
 * Linie und Farbnummer ("Linie027 Kora 98"). Bis 2026-10-21 suchte das
 * Lexikon den ganzen Text als einen Begriff - mehrere Woerter oder eine an den
 * Namen geklebte Nummer fanden nie etwas. Jetzt muss jedes Wort irgendwo am
 * Produkt oder an derselben Variante stehen.
 */

/** Klein, Umlaute als ae/oe/ue/ss - wie operations/lib/lexikon.mjs::normalisieren. */
export function normalisieren(wert) {
  if (wert === null || wert === undefined) return '';
  return String(wert).toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss');
}

/** Suchtext in Woerter; leerer Text ergibt []. */
export function suchbegriffe(q) {
  return normalisieren(q).split(/\s+/).filter(Boolean);
}

// Kurze Zahlen (Farbnummern, Linien wie 027) nur als ganze Zahl und ohne
// fuehrende Nullen vergleichen: "98" findet "098", aber nicht "198".
function passtTeil(teil, text) {
  if (/^\d{1,3}$/.test(teil)) {
    const zahl = teil.replace(/^0+(?=\d)/, '');
    return new RegExp(`(?<!\\d)0*${zahl}(?!\\d)`).test(text);
  }
  return text.includes(teil);
}

// Als eigenes Suchwort ist eine kurze Zahl auch kein Stueck eines Farbcodes: "73" nicht in "8H73",
// "3" nicht in "3N55" - an den Liniennamen geklebt zaehlt sie weiter ("27" in "Linie027").
function passtZahl(zahl, text) {
  const ohneNullen = zahl.replace(/^0+(?=\d)/, '');
  return new RegExp(`(?<!\\d)(?<!\\d\\p{L})0*${ohneNullen}(?!\\d)(?!\\p{L}\\d)`, 'u').test(text);
}

export function passtBegriff(begriff, text) {
  if (/^\d{1,3}$/.test(begriff)) return passtZahl(begriff, text);
  if (text.includes(begriff)) return true;
  // "linie027" -> "linie" + "027", "a-4712" -> "a" + "4712"
  const teile = begriff.match(/\p{L}+|\p{N}+/gu) || [];
  return teile.length > 1 && teile.every(t => passtTeil(t, text));
}

const zusammen = felder => felder.filter(f => typeof f === 'string' || typeof f === 'number').map(normalisieren).join(' | ');

function produktText(p) {
  return zusammen([p.titel, p.handle, p.produktgruppe]);
}

function variantenText(v) {
  const e = v.einkauf || {};
  const o = v.original || {};
  return zusammen([v.titel, v.sku, v.farbe, e.artikelnummer, e.farbnummer, e.kollektion, e.produktname, e.hersteller, e.marke,
    // Muster: Angaben des Originals, damit der Aufkleber auch das Musterprodukt findet
    o.artikelnummer, o.farbnummer, o.kollektion, o.produktTitel]);
}

// Fuer jeden Lexikon-Stand nur einmal aufbauen: die Kundensuche laeuft bei jedem Tastendruck.
const positionsIndex = new WeakMap();

/** Farbe einer Bestellposition ohne Breite: "Schwarz (078) / 400cm" -> "schwarz (078)". */
const farbeOhneBreite = farbe => normalisieren(String(farbe ?? '').split(' / ')[0].trim());

/**
 * Was beim Lieferanten zu einer Bestellposition steht, als Suchtext - fuer die Kundensuche
 * ("Lieferantenname vom Muster, wer hat das bestellt?"). Erst ueber die SKU; Wunschmass-Varianten
 * haben keine, dort zaehlen Handle und Farbe. Mehrere Breiten derselben Farbe sind derselbe Artikel,
 * ihre Texte stehen zusammen. Findet sich nichts, bleibt der Text leer - geraten wird nicht.
 * @returns {(position: object) => string}
 */
export function positionSuchtext(produkte = []) {
  let index = positionsIndex.get(produkte);
  if (!index) {
    index = { sku: new Map(), farbe: new Map() };
    const dazu = (je, schluessel, text) => je.set(schluessel, je.has(schluessel) ? `${je.get(schluessel)} | ${text}` : text);
    for (const p of produkte) {
      for (const v of p.varianten || []) {
        const text = variantenText(v);
        if (v.sku) dazu(index.sku, v.sku, text);
        dazu(index.farbe, `${p.handle}\n${farbeOhneBreite(v.farbe || v.titel)}`, text);
      }
    }
    positionsIndex.set(produkte, index);
  }
  return pos => index.sku.get(pos?.sku) ?? index.farbe.get(`${pos?.handle}\n${farbeOhneBreite(pos?.farbe)}`) ?? '';
}

/**
 * @returns {{ passt: boolean, varianten: Array }} varianten = die Varianten, an denen
 *   jedes Wort steht (leer, wenn sich die Woerter nur ueber mehrere Varianten verteilen).
 */
export function lexikonTreffer(p, begriffe) {
  if (!begriffe.length) return { passt: true, varianten: [] };
  const kopf = produktText(p);
  const varianten = p.varianten || [];
  const texte = varianten.map(v => `${kopf} | ${variantenText(v)}`);
  const passend = varianten.filter((v, i) => begriffe.every(b => passtBegriff(b, texte[i])));
  if (passend.length) return { passt: true, varianten: passend };
  const alles = [kopf, ...texte].join(' | ');
  return { passt: begriffe.every(b => passtBegriff(b, alles)), varianten: [] };
}

/** Stehen alle Woerter schon im Shop-Titel? Dann muss die Karte den Lieferantennamen nicht erklaeren. */
export function nurUeberTitel(p, begriffe) {
  const kopf = produktText(p);
  return begriffe.every(b => passtBegriff(b, kopf));
}
