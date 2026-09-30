/**
 * Feste Eckdaten des Betriebs und der Kanaele - eine Stelle, an der sie stehen.
 *
 * Nichts davon ist geheim. Zugangsdaten (Meta-Token) kommen ausschliesslich
 * aus der Umgebung bzw. .env.local, siehe social/META-EINRICHTUNG.md.
 */

export const BETRIEB = Object.freeze({
  name: 'Teppich Paradies Oranienburg',
  firma: 'Teppich Paradies Oranienburg GmbH',
  shop: 'https://www.teppich-paradies.net',
  shopKurz: 'teppich-paradies.net',
  ort: 'Oranienburg',
  anschrift: 'Saarlandstraße 73–81, 16515 Oranienburg',
  telefon: '03301 573 37 20',
  instagram: 'teppich.paradies',
  logo: 'https://www.teppich-paradies.net/cdn/shop/files/logo.webp?v=1777987830&width=500',
});

/** Orte, die wir in Texten und Hashtags nennen duerfen - nie genauer als der Ort. */
export const ORTE = Object.freeze([
  'Oranienburg', 'Lehnitz', 'Sachsenhausen', 'Germendorf', 'Schmachtenhagen', 'Wensickendorf', 'Zehlendorf',
  'Hohen Neuendorf', 'Borgsdorf', 'Bergfelde', 'Birkenwerder', 'Velten', 'Hennigsdorf', 'Leegebruch',
  'Oberkrämer', 'Kremmen', 'Liebenwalde', 'Löwenberger Land', 'Zehdenick', 'Gransee', 'Fürstenberg',
  'Mühlenbecker Land', 'Glienicke/Nordbahn', 'Wandlitz', 'Bernau', 'Falkensee', 'Nauen',
  'Berlin', 'Berlin-Pankow', 'Berlin-Reinickendorf', 'Berlin-Spandau', 'Berlin-Mitte', 'Berlin-Wedding',
  'Berlin-Tegel', 'Berlin-Frohnau', 'Berlin-Hermsdorf', 'Berlin-Weißensee', 'Berlin-Prenzlauer Berg',
  'Berlin-Charlottenburg', 'Berlin-Lichtenberg',
]);

/** Landkreis/Region je Ort - fuer den zweiten lokalen Hashtag. */
export const REGION = Object.freeze({
  Berlin: 'Berlin',
  standard: 'Oberhavel',
});

export const BODENARTEN = Object.freeze([
  'Teppichboden', 'Klebevinyl', 'Klickvinyl', 'Vinyl von der Rolle', 'Linoleum', 'Laminat', 'Parkett',
  'Teppich nach Maß', 'Teppichfliesen', 'Treppe', 'Sockelleisten', 'Sauberlauf',
]);

export const TAETIGKEITEN = Object.freeze([
  'Verlegung', 'Altbelag entfernt', 'Untergrund vorbereitet', 'Gespachtelt', 'Treppe belegt',
  'Leisten montiert', 'Lieferung', 'Aufmaß',
]);

export const RAEUME = Object.freeze([
  'Wohnzimmer', 'Schlafzimmer', 'Kinderzimmer', 'Flur', 'Küche', 'Bad', 'Treppe', 'Büro', 'Praxis',
  'Laden', 'Gastronomie', 'Ganze Wohnung',
]);

/**
 * Veroeffentlichungsraster. Drei feste Beitragstage, zwei weitere nur, wenn
 * genug guter Vorrat da ist - Ziel sind 3-5 gute Beitraege je Woche, nicht ein
 * voller Kalender. Wochentag nach Date.getDay(): 0 = Sonntag.
 */
export const RASTER = Object.freeze({
  beitrag: [
    { tag: 2, zeit: '18:00', fest: true },   // Dienstag
    { tag: 4, zeit: '18:00', fest: true },   // Donnerstag
    { tag: 6, zeit: '10:30', fest: true },   // Samstag
    { tag: 1, zeit: '18:00', fest: false },  // Montag
    { tag: 5, zeit: '17:00', fest: false },  // Freitag
  ],
  story: [
    { tag: 1, zeit: '12:00' }, { tag: 2, zeit: '12:00' }, { tag: 3, zeit: '12:00' },
    { tag: 4, zeit: '12:00' }, { tag: 5, zeit: '12:00' }, { tag: 6, zeit: '09:30' },
  ],
  maxBeitraegeJeWoche: 5,
  maxAngeboteJeWoche: 1,
});

/** Meta Graph API. Version bewusst einstellbar - Meta schaltet alte Versionen nach rund zwei Jahren ab. */
export function metaKonfig(env = process.env) {
  return {
    version: env.META_GRAPH_VERSION || 'v24.0',
    token: env.META_PAGE_TOKEN || null,
    pageId: env.META_PAGE_ID || null,
    igUserId: env.META_IG_USER_ID || null,
  };
}

export function metaBereit(k = metaKonfig()) {
  return Boolean(k.token && k.pageId);
}
