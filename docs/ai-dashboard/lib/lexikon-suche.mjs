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

function passtBegriff(begriff, text) {
  if (/^\d{1,3}$/.test(begriff)) return passtTeil(begriff, text);
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
