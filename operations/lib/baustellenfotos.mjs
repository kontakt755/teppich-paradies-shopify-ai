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
 * Produkte, die zum Namen auf dem Auftragszettel passen. Der Zettel nennt
 * selten den vollen Shop-Titel - "Selene 620" statt "Selene Linoleumboden
 * Farbe 620". Deshalb wird wortweise verglichen, nicht auf Gleichheit.
 */
export function passendeProdukte(bodenname, produkte = [], grenze = 5) {
  const gesucht = normal(bodenname).split(' ').filter(w => w.length > 1);
  if (!gesucht.length) return [];

  const bewertet = [];
  for (const p of produkte) {
    const heu = normal([p.titel, p.handle, p.marke].filter(Boolean).join(' '));
    if (!heu) continue;
    const worte = new Set(heu.split(' '));
    const treffer = gesucht.filter(w => worte.has(w) || heu.includes(w));
    if (!treffer.length) continue;
    // Alle gesuchten Worte gefunden wiegt schwerer als viele Teiltreffer.
    const wert = treffer.length / gesucht.length + (treffer.length === gesucht.length ? 0.5 : 0);
    bewertet.push({ produkt: p, wert, treffer });
  }
  return bewertet.sort((a, b) => b.wert - a.wert).slice(0, grenze);
}

/**
 * Was unter dem Beitrag steht: Produktlink, wenn wir den Boden fuehren -
 * sonst der ehrliche Hinweis, dass er nicht im Shop ist. Geraten wird nicht.
 */
export function produktHinweis(treffer) {
  const beste = treffer[0];
  if (!beste || beste.wert < 1) {
    return { sicher: false, handle: null, titel: null, text: 'Nicht im Shop gefunden – Beitrag ohne Produktlink planen.' };
  }
  const mehrdeutig = treffer[1] && treffer[1].wert >= beste.wert;
  return {
    sicher: !mehrdeutig,
    handle: beste.produkt.handle ?? null,
    titel: beste.produkt.titel ?? null,
    text: mehrdeutig
      ? `Mehrere Produkte passen (${treffer.slice(0, 3).map(t => t.produkt.titel).join(', ')}) – bitte das richtige auswählen.`
      : `Im Shop: ${beste.produkt.titel}`,
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
