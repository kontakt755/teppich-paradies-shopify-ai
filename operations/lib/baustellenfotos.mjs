/**
 * Baustellenfotos: was die Monteure vom fertigen Raum schicken.
 *
 * Die Bilder entstehen taeglich, versickern aber auf Privathandys, waehrend
 * gleichzeitig Material fuer Instagram fehlt. Dieses Modul haelt die Regeln
 * dafuer, was ein brauchbarer Eingang ist und wie aus dem Bodennamen auf dem
 * Auftragszettel ein Produkt aus unserem Sortiment wird.
 *
 * Konzept: docs/control-center/instagram-baustellenfotos.md
 */

export const FOTO_ART = 'baustellenfoto';

/** Fotos, die eine Wohnung zeigen, brauchen die Zustimmung des Kunden. */
export class FotoFehler extends Error {}

const ENTBEHRLICH = /\b(teppichboden|teppich|vinyl|laminat|designboden|linoleum|boden|kollektion|farbe|dekor)\b/gi;

/** Vergleichsform: Gross/klein, Umlaute und Fuellwoerter stoeren die Suche. */
export function normal(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(ENTBEHRLICH, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Produkte, die zum Namen auf dem Auftragszettel passen.
 *
 * Der Zettel nennt selten den vollen Shop-Titel: "Selene 620" steht dort fuer
 * das Produkt "Selene Linoleumboden 200cm" in der Farbe 620. Deshalb werden
 * Name und Zahl getrennt behandelt - der Name sucht das Produkt, die Zahl die
 * Variante. Ein Muster-Artikel ist nie gemeint, wenn ein Raum verlegt wurde.
 */
export function passendeProdukte(bodenname, produkte = [], grenze = 5) {
  const worte = normal(bodenname).split(' ').filter(Boolean);
  const namen = worte.filter(w => /[a-z]/.test(w) && w.length > 1);
  const zahlen = worte.filter(w => /^\d+$/.test(w));
  if (!namen.length && !zahlen.length) return [];

  const bewertet = [];
  for (const p of produkte) {
    const heu = normal([p.titel, p.handle, p.marke].filter(Boolean).join(' '));
    const gefunden = namen.filter(w => heu.includes(w));
    const offen = namen.filter(w => !heu.includes(w));

    // Was im Titel fehlt, steht oft in der Variante: die Farbe. "Selene 620"
    // und "Selene Grau Grün" meinen dasselbe Produkt, nur anders benannt.
    const suchIn = (v) => normal([v.farbe, v.sku, v.titel, v.einkauf?.farbnummer, v.einkauf?.artikelnummer]
      .filter(Boolean).join(' '));
    // Manche Produkte tragen die Farbe schon im Titel - dann muss keine
    // Variante herhalten.
    const rest = [...offen, ...zahlen].filter(w => !heu.includes(w));
    const imTitel = zahlen.filter(w => heu.includes(w));
    let variante = null;
    if (rest.length) {
      variante = (p.varianten ?? []).find(v => {
        const feld = suchIn(v);
        return rest.every(w => feld.includes(w));
      }) ?? null;
    }
    // Ein Name, der weder im Titel noch in einer Variante vorkommt, ist ein
    // anderes Produkt - dann lieber kein Treffer als der falsche.
    if (offen.length && !variante) continue;
    if (!gefunden.length && !variante) continue;
    const istMuster = /\bmuster\b/.test(heu);
    const wert = (gefunden.length ? 1 : 0.5)
      + (imTitel.length ? 0.5 : 0)
      + (rest.length ? (variante ? 0.5 : -0.25) : 0)
      - (istMuster ? 0.75 : 0);
    bewertet.push({ produkt: p, variante, wert, treffer: gefunden });
  }
  return bewertet.sort((a, b) => b.wert - a.wert).slice(0, grenze);
}

/**
 * Was unter dem Beitrag steht: Produktlink, wenn wir den Boden fuehren -
 * sonst der ehrliche Hinweis, dass er nicht im Shop ist. Geraten wird nicht.
 */
export function produktHinweis(treffer) {
  const beste = treffer[0];
  if (!beste || beste.wert < 0.75) {
    return { sicher: false, handle: null, titel: null, farbe: null, text: 'Nicht im Shop gefunden – Beitrag ohne Produktlink planen.' };
  }
  const mehrdeutig = treffer[1] && treffer[1].wert >= beste.wert;
  const farbe = beste.variante?.farbe ?? null;
  return {
    sicher: !mehrdeutig,
    handle: beste.produkt.handle ?? null,
    titel: beste.produkt.titel ?? null,
    farbe,
    text: mehrdeutig
      ? `Mehrere Produkte passen (${treffer.slice(0, 3).map(t => t.produkt.titel).join(', ')}) – bitte das richtige auswählen.`
      : `Im Shop: ${beste.produkt.titel}${farbe ? ` – Farbe ${farbe}` : ''}`,
  };
}

/**
 * Prueft, was vom Handy ankommt. Fehlt die Einwilligung, entsteht erst gar
 * kein Eintrag - ein Foto aus einer Privatwohnung ohne Zustimmung darf nicht
 * erst im Haus liegen und spaeter versehentlich veroeffentlicht werden.
 */
export function pruefeEingang({ auftrag = '', boden = '', einwilligung = false, fotos = [] } = {}) {
  const sauber = {
    auftrag: String(auftrag || '').trim(),
    boden: String(boden || '').trim(),
    einwilligung: einwilligung === true || einwilligung === 'true',
  };
  if (!Array.isArray(fotos) || !fotos.length) throw new FotoFehler('Ohne Foto geht es nicht');
  if (fotos.length > 20) throw new FotoFehler('Höchstens 20 Fotos auf einmal');
  if (!sauber.auftrag && !sauber.boden) throw new FotoFehler('Bitte Auftragsnummer oder Bodenname angeben');
  if (!sauber.einwilligung) throw new FotoFehler('Ohne die Zustimmung des Kunden dürfen wir die Fotos nicht verwenden');
  return sauber;
}

/** Titel des Eintrags - so, dass man ihn in der Liste wiedererkennt. */
export function titelFuer({ auftrag, boden }, jetzt = new Date()) {
  const datum = jetzt.toLocaleDateString('de-DE');
  const was = boden || 'Baustelle';
  return auftrag ? `${was} – Auftrag ${auftrag} (${datum})` : `${was} (${datum})`;
}
