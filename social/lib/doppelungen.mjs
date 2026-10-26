/**
 * Doppelungen vermeiden (Rundgang 26.10.2026, Massnahme #67).
 *
 * Was im Oktober doppelt kam und woran es lag:
 *   - Dieselbe neue Farbe zweimal (Zafira, Belcanto, Alvento): Teppichboden und "Teppich nach
 *     Mass" sind eigene Familien, die Ruhezeit galt je Familie. -> `anlassFamilien`
 *   - Dasselbe Raumbild innerhalb weniger Tage (Zafira, Eichwald). -> `quellBilder`, Planer
 *   - Zahlen aus dem Bautag des Anlasses statt vom Tag des Entwurfs ("72 Designs", aktiv 68;
 *     "11 Farben", im Shop 9). -> `zahlenAmBautag`, `zahlenImText`
 *   - Eine angekuendigte neue Farbe, das Bild zeigte eine andere (Alvento #81). -> `neueFarbeGezeigt`
 *
 * Reine Funktionen - Datenbank und Uhr kommen als Argument.
 */

const STUNDE = 60 * 60 * 1000;

/** So lange kommt dasselbe Quellbild hoechstens einmal (zwischen verschiedenen Inhalten). */
export const BILD_RUHE_TAGE = 14;

/** Warengruppen, die dieselbe Qualitaet fuehren: der Teppich nach Mass wird aus der Rollenware geschnitten. */
const DIESELBE_QUALITAET = ['teppichboden', 'teppich nach maß'];

/**
 * Familien, die fuer die Ruhezeit eines Anlasses als eine gelten. "zafira|teppichboden" und
 * "zafira|teppich nach maß" sind dieselbe Qualitaet - eine neue Farbe ist dort dieselbe Neuigkeit.
 */
export function anlassFamilien(familie) {
  const [kopf, gruppe] = String(familie ?? '').split('|');
  if (kopf && DIESELBE_QUALITAET.includes(gruppe)) return DIESELBE_QUALITAET.map(g => `${kopf}|${g}`);
  return [familie];
}

/** Dateiname eines Shop-Bildes ohne Abfrage und ohne den Zusatz, den Shopify bei gleichen Namen anhaengt. */
export function bildSchluessel(src) {
  return String(src ?? '').split('?')[0].split('/').pop().toLowerCase()
    .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.\w+$)/, '');
}

/** Schluessel eines Mediums: Shop-Bilder ueber den Dateinamen, eigene Fotos ueber ihre Nummer. */
export function mediumSchluessel(m) {
  return m?.url ? bildSchluessel(m.url) : `medium:${m?.id}`;
}

/**
 * Welche Quellbilder zeigt ein Beitrag? Neue Beitraege tragen sie selbst (werkstatt.mjs, `bilder`
 * je Medium). Aeltere: ueber die verwendeten Medien, bei Shop-Inhalten ohne diese Angabe das
 * Titelbild des Standardaufbaus.
 */
export function quellBilder(beitrag, inhalt, medien = []) {
  const eintraege = beitrag?.medien ?? [];
  const aufgezeichnet = eintraege.flatMap(m => m.bilder ?? []);
  if (aufgezeichnet.length) return [...new Set(aufgezeichnet)];
  const nachId = new Map(medien.map(m => [m.id, m]));
  const ids = [...new Set(eintraege.flatMap(m => m.quellen ?? []))];
  if (ids.length) return [...new Set(ids.map(id => mediumSchluessel(nachId.get(id) ?? { id })))];
  const d = inhalt?.daten ?? {};
  if (inhalt?.quelle !== 'shopify') return [];
  const liste = beitrag?.vorlage === 'farben_titel' ? (d.farbBilder ?? []).slice(0, 6) : [d.bilder?.[0]];
  return [...new Set(liste.map(b => b?.src).filter(Boolean).map(bildSchluessel))];
}

/**
 * Farb- und Designzahlen vom Tag des Entwurfs - aus dem letzten Shop-Abgleich (produkt_stand),
 * nicht aus den Daten des Anlasses und nie aus der Beschreibung.
 * Die Farbzahl kommt aus dem tatsaechlichen Farbbestand (`farben_im_shop`), nicht aus `farben`: dort
 * haelt der Abgleich eine neue Farbe ohne Anlass bewusst zurueck (Pruefung PR #1734).
 * @param stand Map handle -> {familie, farben, farben_im_shop, zuletzt_gesehen} (db.produktStand)
 * @returns {{stand?: string, farben?: number, designs?: number, aktiv?: (handle) => boolean}}
 */
export function zahlenAmBautag(stand, inhalt) {
  if (!stand?.size || !inhalt) return {};
  const zeiten = [...stand.values()].map(s => Date.parse(s.zuletzt_gesehen)).filter(Number.isFinite);
  if (!zeiten.length) return {};
  const letzter = Math.max(...zeiten);
  // Ein Abgleich stempelt alle Produkte mit derselben Zeit; was dort fehlte, ist nicht mehr im Shop.
  const aktiv = handle => {
    const s = stand.get(handle);
    return Boolean(s) && Date.parse(s.zuletzt_gesehen) >= letzter - STUNDE;
  };
  const d = inhalt.daten ?? {};
  const aus = { stand: new Date(letzter).toISOString(), aktiv };
  if (d.serie && d.familie) {
    // Nur zaehlen, wenn der Abgleich die Familie kennt - sonst waere "0" ein Irrtum, keine Aussage.
    const familie = [...stand.values()].filter(s => s.familie === d.familie);
    if (familie.length) aus.designs = familie.filter(s => aktiv(s.handle)).length;
  }
  const p = stand.get(inhalt.produkt_handle);
  const farben = Array.isArray(p?.farben_im_shop) ? p.farben_im_shop : p?.farben;
  if (!d.serie && aktiv(inhalt.produkt_handle) && Array.isArray(farben) && farben.length) aus.farben = farben.length;
  return aus;
}

const ZAHLWORT = { zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12 };
// "in 11 Farben", "fünf Farben", "72 Designs", "9 Dekoren" - aber nicht "zwei neue Farben" (das ist die Zahl der neuen).
const ZAHL_IM_TEXT = /(?<![\p{L}\d])(\d{1,3}|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf)\s+(Farben|Farbtönen|Farbtoenen|Designs|Dekoren|Dekore)(?![\p{L}])/giu;

/** Alle Farb- und Designzahlen eines Textes: [{zahl, art: 'farben'|'designs', wortlaut}] */
export function zahlenAusText(text) {
  const aus = [];
  for (const m of String(text ?? '').matchAll(ZAHL_IM_TEXT)) {
    const roh = m[1].toLowerCase();
    const zahl = /^\d+$/.test(roh) ? Number(roh) : ZAHLWORT[roh];
    aus.push({ zahl, art: /^farb/i.test(m[2]) ? 'farben' : 'designs', wortlaut: m[0] });
  }
  return aus;
}

/**
 * Stimmen die Zahlen im Text mit dem Shop? Prueft nur, was bekannt ist: Farben bei einem
 * einzelnen Produkt, Designs/Dekore bei einer Serie.
 * @returns Liste der Abweichungen als Saetze
 */
export function zahlenImText(text, { farben = null, designs = null } = {}) {
  const fehler = [];
  for (const z of zahlenAusText(text)) {
    const ist = z.art === 'farben' ? farben : designs;
    if (Number.isFinite(ist) && z.zahl !== ist) fehler.push(`Text nennt „${z.wortlaut}“, im Shop sind es ${ist}`);
  }
  return fehler;
}

/**
 * Zeigt ein Beitrag zu "neue Farbe" auch ein Bild dieser Farbe? Bei Alvento (#81, 21.10.)
 * kuendigte der Text Basalt und Jeansblau an, das Bild zeigte Senf.
 * @param schluessel Quellbilder des Beitrags (bildSchluessel / mediumSchluessel)
 */
export function neueFarbeGezeigt(inhalt, schluessel, medien = []) {
  const d = inhalt?.daten ?? {};
  if (inhalt?.typ !== 'produkt_farben' || !d.neueFarben?.length) return true;
  const neu = new Set(d.neueFarben);
  const passend = new Set([
    ...(d.farbBilder ?? []).filter(b => neu.has(b.farbe) || neu.has(b.beschriftung)).map(b => bildSchluessel(b.src)),
    ...medien.filter(m => neu.has(m.beschriftung)).map(mediumSchluessel),
  ]);
  return [...schluessel].some(k => passend.has(k));
}
