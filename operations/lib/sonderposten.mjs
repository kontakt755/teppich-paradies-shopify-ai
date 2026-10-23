/**
 * Sonderposten (Reststuecke, Einzelstuecke) fuer das Control Center:
 * Liste lesen und ein Stueck als "im Laden verkauft" buchen.
 *
 * Ein Sonderposten ist ein Shopify-Produkt mit productType "Sonderposten",
 * genau einer Variante (SKU "SP-xxxx") und gefuehrtem Bestand 1 am einzigen
 * Standort. Verkauft = Bestand 0; die Kollektion im Shop nimmt das Stueck
 * dann selbst heraus. Konzept: docs/weiterentwicklung/sonderposten.md,
 * Abschnitt 6 (Weg B).
 *
 * Anders als die uebrigen Quellen des Control Centers liest diese Liste live
 * aus Shopify statt aus einem Export unter $TP_PRIVAT_DIR: wer im Laden
 * "verkauft" klickt, muss den Bestand von jetzt sehen, nicht den von heute
 * frueh. Der Zugang ist derselbe (operations/sync/zugang.mjs, erzeugeProxy).
 *
 * Schreiben (verkaufeImLaden) haelt sich an eine feste Reihenfolge:
 *   1. Produkt serverseitig neu lesen - nie dem Browser glauben.
 *   2. Nur bei gefuehrtem Bestand genau 1 UND gesperrtem Ueberverkauf
 *      (inventoryPolicy DENY) weiter, sonst Abbruch (409), nichts geschrieben.
 *      Mit CONTINUE bliebe ein Stueck bei Bestand 0 online bestellbar - dann
 *      waere "online nicht mehr bestellbar" eine falsche Zusage.
 *   3. Bestand per inventorySetQuantities auf 0, mit changeFromQuantity: 1
 *      (Compare-and-swap: zwei gleichzeitige Klicks buchen nicht doppelt) und
 *      @idempotent (ab API 2026-04 Pflicht fuer Bestandsmutationen).
 *   4. Erst wenn der Bestand gebucht ist: verkauft_am/_von/_kanal setzen.
 *      Scheitert schon Schritt 3 (z. B. fehlt write_inventory), bleiben die
 *      Felder unberuehrt - sonst stuende "verkauft" an einem Stueck, das
 *      online noch kaufbar ist.
 *   5. Gegenprobe: Produkt erneut lesen. userErrors: [] allein ist kein Beleg.
 * Antwortverlust: Kommt auf die Bestandsmutation keine Antwort (Netz, Zeitlimit,
 * 5xx), kann Shopify sie trotzdem ausgefuehrt haben. Dann entscheidet ein
 * erneutes Lesen: Bestand 0 = gebucht (weiter mit Schritt 4), Bestand 1 = nicht
 * angekommen, sonst "unklar" - nie eine Negativbestaetigung auf Verdacht.
 * Scheitert erst die Gegenprobe, ist die Buchung trotzdem erfolgt: das Ergebnis
 * meldet gegenprobe "fehlgeschlagen" statt eines Fehlers.
 * Das Protokoll schreibt der Aufrufer (scripts/dashboard-api.mjs), weil nur er
 * den angemeldeten Benutzer kennt.
 *
 * Restrollen (Inhaber 2026-10-12): Rollenware mit Produkt-Tag "sonderposten"
 * und Rollenbreite (custom.rollenbreite), deren Bestand Shopify in ganzen m2
 * fuehrt - z. B. Passion Yasmin. Im Laden wird dort nicht ein Stueck verkauft,
 * sondern eine Laenge von der Rolle (verkaufeVonRolle): Laenge x volle
 * Rollenbreite, auf ganze m2 aufgerundet, wird vom Bestand abgezogen. Auch ein
 * schmaleres Stueck verbraucht die volle Breite (2 x 3 m Teppich = 2 m Rolle).
 * Dieselbe Reihenfolge wie oben, nur ohne Verkaufsfelder (das Produkt bleibt
 * im Shop, solange noch etwas da ist); die Spur ist das Protokoll und die
 * referenceDocumentUri der Bestandsbuchung in Shopify.
 */

import { randomUUID } from 'node:crypto';
import { STORE } from '../sync/zugang.mjs';

/** Der einzige Standort (Saarlandstrasse 73). */
export const STANDORT_ID = 'gid://shopify/Location/98426814798';
export const PRODUKTART = 'Sonderposten';
export const NAMENSRAUM = 'sonderposten';
const MAX_SEITEN = 10; // 10 x 100 Stueck - weit ueber dem, was im Laden liegt

/** Fehler mit HTTP-Status fuer die API; `grund` laesst die Oberflaeche die Faelle unterscheiden. */
export class SonderpostenFehler extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/** Die Meldung, wenn dem Dashboard-Zugang das Schreibrecht fuer den Bestand fehlt. */
export const RECHT_FEHLT = 'Bestand kann nicht geändert werden: dem Control Center fehlt das Shopify-Recht write_inventory '
  + '(Inhaber schaltet es im Dev Dashboard frei). Bis dahin: Bestand in der Shopify-App auf 0 setzen.';

/** Dieselbe Meldung fuer Restrollen: dort wird nicht auf 0 gesetzt, sondern abgezogen. */
export const RECHT_FEHLT_ROLLE = 'Bestand kann nicht geändert werden: dem Control Center fehlt das Shopify-Recht write_inventory '
  + '(Inhaber schaltet es im Dev Dashboard frei). Bis dahin: in der Shopify-App die verkauften m² vom Bestand abziehen.';

const VARIANTEN_FELDER = `variants(first: 2) { nodes { id sku price inventoryPolicy
  rollenbreite: metafield(namespace: "custom", key: "rollenbreite") { value }
  inventoryItem { id tracked
  inventoryLevel(locationId: $locationId) { quantities(names: ["available", "on_hand", "committed", "reserved", "damaged", "safety_stock", "quality_control"]) { name quantity } } } } }`;

const PRODUKT_FELDER = `id title status handle productType tags
      preisPro001Qm: metafield(namespace: "custom", key: "preis_pro_001_qm") { value }
      maxRollenlaenge: metafield(namespace: "custom", key: "max_roll_laenge_cm") { value }
      rollenbreite: metafield(namespace: "custom", key: "rollenbreite") { value }`;

export const LISTE_QUERY = `
query SonderpostenListe($first: Int!, $after: String, $query: String!, $locationId: ID!) {
  products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ${PRODUKT_FELDER}
      featuredMedia { preview { image { url(transform: {maxWidth: 240, maxHeight: 240}) altText } } }
      metafields(namespace: "${NAMENSRAUM}", first: 30) { nodes { key value } }
      ${VARIANTEN_FELDER}
    }
  }
}`;

export const EINZELN_QUERY = `
query SonderpostenEinzeln($id: ID!, $locationId: ID!) {
  product(id: $id) {
    ${PRODUKT_FELDER}
    metafields(namespace: "${NAMENSRAUM}", first: 30) { nodes { key value } }
    ${VARIANTEN_FELDER}
  }
}`;

export const BESTAND_MUTATION = `
mutation SonderpostenLadenverkauf($input: InventorySetQuantitiesInput!, $schluessel: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $schluessel) {
    inventoryAdjustmentGroup { id reason referenceDocumentUri changes { name delta quantityAfterChange } }
    userErrors { field message code }
  }
}`;

/** Inventur setzt ausschliesslich den physischen Bestand, nie gebundene Mengen. */
export const INVENTUR_MUTATION = BESTAND_MUTATION.replace('SonderpostenLadenverkauf', 'SonderpostenRolleninventur');

export const FELDER_MUTATION = `
mutation SonderpostenVerkauftFelder($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key value }
    userErrors { field message code }
  }
}`;

/** Produkt-Tag, der Rollenware als Restrolle (Sonderposten von der Rolle) kennzeichnet. */
export const ROLLEN_TAG = 'sonderposten';

/** Suche: Sonderposten und Restrollen, archivierte nie (die sind erledigt). */
export const SUCHE = `(product_type:${PRODUKTART} OR tag:${ROLLEN_TAG}) AND (status:active OR status:draft)`;

const STATUS_TEXT = { ACTIVE: 'im Shop', DRAFT: 'Entwurf', ARCHIVED: 'archiviert', UNLISTED: 'nicht gelistet' };

function zahl(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function menge(level, name) {
  const q = (level?.quantities ?? []).find(x => x.name === name);
  return q ? zahl(q.quantity) : null;
}

function felder(produkt) {
  const f = {};
  for (const m of produkt?.metafields?.nodes ?? []) f[m.key] = m.value;
  return f;
}

/** Rollenbreite in m (Variante vor Produkt) oder null. */
export function rollenbreiteM(produkt) {
  const v = zahl(produkt?.variants?.nodes?.[0]?.rollenbreite?.value) ?? zahl(produkt?.rollenbreite?.value);
  return v !== null && v > 0 ? v : null;
}

/**
 * Restrolle: Tag "sonderposten", kein Einzelstueck, Rollenbreite gesetzt. Ohne
 * Rollenbreite (z. B. das Massprodukt "Teppich nach Mass" derselben Rolle) ist
 * es keine eigene Ware mit eigenem Bestand und erscheint nicht.
 */
export function istRolle(produkt) {
  return produkt?.productType !== PRODUKTART
    && (produkt?.tags ?? []).includes(ROLLEN_TAG)
    && rollenbreiteM(produkt) !== null;
}

/**
 * m2, die eine Laenge von der Rolle verbraucht: Laenge x volle Breite, auf
 * ganze m2 aufgerundet (Shopify fuehrt den Bestand in ganzen m2; lieber einen
 * Rest zu wenig anbieten als zu viel). Ganzzahlig in cm gerechnet.
 * Gegenstueck im Browser: docs/ai-dashboard/lib/sonderposten.mjs (rollenRechnung).
 */
export function qmFuerLaenge(laengeM, breiteM) {
  const laengeCm = Math.round(Number(laengeM) * 100);
  const breiteCm = Math.round(Number(breiteM) * 100);
  if (!(laengeCm > 0) || !(breiteCm > 0)) return null;
  return Math.ceil((laengeCm * breiteCm) / 10000);
}

/** Vorlagen sind Kopiervorlagen fuer neue Stuecke, keine Ware. */
export function istVorlage(produkt) {
  const sku = produkt?.variants?.nodes?.[0]?.sku || '';
  return sku.toUpperCase() === 'SP-0000' || /^\s*VORLAGE/i.test(produkt?.title || '');
}

/** Numerische ID aus einer GID ("gid://shopify/Product/123" -> "123"). */
export function numId(gid) {
  return String(gid || '').split('/').pop();
}

export function adminLink(gid) {
  return `https://admin.shopify.com/store/${STORE}/products/${numId(gid)}`;
}

/** Ein Produkt aus der Admin API -> Eintrag fuer die Oberflaeche. Felder einzeln, nichts durchgereicht. */
export function eintragAus(produkt) {
  const variante = produkt.variants?.nodes?.[0] || null;
  const item = variante?.inventoryItem || null;
  const f = felder(produkt);
  const breite = zahl(f.breite_m);
  const laenge = zahl(f.laenge_m);
  const flaecheFeld = zahl(f.flaeche_m2);
  // Fehlt die Flaeche, aber beide Masse stehen da, ist sie eine Rechnung, keine Annahme.
  const flaeche = flaecheFeld ?? (breite !== null && laenge !== null ? Math.round(breite * laenge * 100) / 100 : null);
  const bestand = item?.tracked ? menge(item.inventoryLevel, 'available') : null;
  // Nur DENY sperrt den Verkauf bei Bestand 0. Fehlt das Feld, gilt es als offen.
  const ueberverkaufGesperrt = variante?.inventoryPolicy === 'DENY';
  const bild = produkt.featuredMedia?.preview?.image || null;
  const rolle = istRolle(produkt);
  const rollenbreite = rolle ? rollenbreiteM(produkt) : null;
  const vorhanden = item?.tracked ? menge(item.inventoryLevel, 'on_hand') : null;
  const gebunden = menge(item?.inventoryLevel, 'committed');
  const reserviert = menge(item?.inventoryLevel, 'reserved');
  const gesperrteMengen = ['damaged', 'safety_stock', 'quality_control'].map(n => menge(item?.inventoryLevel, n));
  const zurueckgehalten = gesperrteMengen.every(n => n !== null) ? gesperrteMengen.reduce((a, n) => a + n, 0) : null;
  let inventurHinweis = null;
  if (rolle) {
    if (!['ACTIVE', 'DRAFT'].includes(produkt.status) || produkt.variants.nodes.length !== 1 || String(produkt.preisPro001Qm?.value) === 'true' || !(zahl(produkt.maxRollenlaenge?.value) > 0)) {
      inventurHinweis = 'Bestandskorrektur nur bei einer Rollenvariante mit m²-Einheit und festem Längenlimit. Bitte in Shopify prüfen.';
    } else if (!item?.tracked || !ueberverkaufGesperrt) {
      inventurHinweis = 'In Shopify Bestand verfolgen und Verkauf bei Nichtverfügbarkeit ausschalten.';
    } else if ([bestand, vorhanden, gebunden, reserviert, ...gesperrteMengen].some(n => n === null || !Number.isInteger(n) || n < 0)) {
      inventurHinweis = 'Nicht alle Bestandsmengen sind eindeutig lesbar. Bitte in Shopify prüfen.';
    } else if (gebunden !== 0 || reserviert !== 0 || zurueckgehalten !== 0 || vorhanden !== bestand) {
      inventurHinweis = 'Es gibt gebundene, reservierte oder zurückgehaltene Ware. Erst diese Mengen in Shopify klären; hier wird nichts überschrieben.';
    }
  }
  return {
    id: produkt.id,
    // stueck = Einzelstueck (Bestand 1); rolle = Restrolle (Bestand in m2)
    typ: rolle ? 'rolle' : 'stueck',
    titel: produkt.title || '',
    status: produkt.status || null,
    statusText: STATUS_TEXT[produkt.status] || String(produkt.status || '').toLowerCase(),
    handle: produkt.handle || null,
    sku: variante?.sku || null,
    preis: zahl(variante?.price),
    variantenAnzahl: produkt.variants?.nodes?.length ?? 0,
    inventoryItemId: item?.id || null,
    getrackt: Boolean(item?.tracked),
    ueberverkaufGesperrt,
    // null = Bestand wird nicht gefuehrt oder ist am Standort nicht angelegt.
    bestand,
    bestandVorhanden: vorhanden,
    bestandGebunden: gebunden,
    bestandReserviert: reserviert,
    bestandZurueckgehalten: zurueckgehalten,
    inventurMoeglich: rolle && inventurHinweis === null,
    inventurHinweis,
    breiteM: rolle ? rollenbreite : breite,
    laengeM: rolle ? (bestand === null ? null : Math.max(0, Math.floor((bestand * 10000) / Math.round(rollenbreite * 100))) / 100) : laenge,
    flaecheM2: rolle ? bestand : flaeche,
    art: f.art || null,
    zustand: f.zustand || null,
    farbe: f.farbe || null,
    lagerort: f.lagerort || null,
    versand: f.versand || null,
    bild: bild?.url || null,
    bildAlt: bild?.altText || null,
    verkauftAm: f.verkauft_am || null,
    verkauftVon: f.verkauft_von || null,
    verkauftKanal: f.verkauft_kanal || null,
    adminUrl: adminLink(produkt.id),
    // Der Knopf "Im Laden verkauft" erscheint nur hier - dieselbe Regel wie im Server.
    // Einzelstueck: genau 1. Restrolle: irgendein Rest (ganze m2).
    verkaufbar: Boolean(item?.tracked) && ueberverkaufGesperrt && produkt.status !== 'ARCHIVED'
      && (rolle ? bestand !== null && bestand > 0 : bestand === 1),
    // Bestand 0 sperrt den Onlinekauf nur mit gefuehrtem Bestand und DENY.
    onlineGesperrt: Boolean(item?.tracked) && ueberverkaufGesperrt && bestand === 0,
  };
}

/** Gemessene, durchgehende Rollenlaenge konservativ als physische ganze m2 erfassen. */
export async function korrigiereRollenbestand(proxy, { produktId, inventoryItemId, laengeM, erwarteterBestand, operationId, standortId = STANDORT_ID } = {}) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(produktId || ''))) throw new SonderpostenFehler(400, 'Ungültige Produkt-ID.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(operationId || ''))) throw new SonderpostenFehler(400, 'Die Vorgangs-ID fehlt. Bitte den Dialog neu öffnen.');
  const laenge = Number(laengeM);
  if (laengeM === null || laengeM === '' || !Number.isFinite(laenge) || laenge < 0 || laenge > 100 || Math.abs(laenge * 100 - Math.round(laenge * 100)) > 1e-6) throw new SonderpostenFehler(400, 'Bitte die gemessene Länge von 0 bis 100 m mit höchstens zwei Nachkommastellen angeben.');
  if (!Number.isInteger(erwarteterBestand) || erwarteterBestand < 0 || !inventoryItemId) throw new SonderpostenFehler(400, 'Der bisherige Bestand fehlt. Bitte die Liste neu laden.');
  let vorher;
  try { ({ eintrag: vorher } = await leseEinzeln(proxy, produktId, { standortId })); }
  catch (e) {
    if (e instanceof SonderpostenFehler) throw e;
    throw new SonderpostenFehler(502, 'Shopify war nicht lesbar – nichts geändert. Bitte noch einmal versuchen.');
  }
  if (vorher.typ !== 'rolle') throw new SonderpostenFehler(400, 'Das ist keine Restrolle.');
  if (!vorher.inventurMoeglich) throw new SonderpostenFehler(409, vorher.inventurHinweis, { grund: 'inventur-gesperrt' });
  if (vorher.inventoryItemId !== inventoryItemId || vorher.bestandVorhanden !== erwarteterBestand) throw new SonderpostenFehler(409, 'Der Bestand hat sich seit dem Laden geändert. Bitte die Liste neu laden und die Länge erneut prüfen.', { grund: 'bestand' });
  const breiteCm = Math.round(vorher.breiteM * 100);
  if (!(breiteCm > 0) || breiteCm > 1000 || Math.abs(vorher.breiteM * 100 - breiteCm) > 1e-6) throw new SonderpostenFehler(409, 'Die Rollenbreite ist nicht eindeutig. Bitte in Shopify prüfen.');
  const neu = Math.floor(Math.round(laenge * 100) * breiteCm / 10000);
  const referenz = `tp://rollen-inventur/${numId(produktId)}/${operationId}?laenge_cm=${Math.round(laenge * 100)}`;
  const input = { name: 'on_hand', reason: 'correction', referenceDocumentUri: referenz, quantities: [{ inventoryItemId, locationId: standortId, quantity: neu, changeFromQuantity: erwarteterBestand }] };
  let antwort;
  try { antwort = await proxy.execute(INVENTUR_MUTATION, { input, schluessel: `rollen-inventur-${operationId}` }); }
  catch (e) {
    if (istZugriffVerweigert(e)) throw new SonderpostenFehler(403, 'Bestand kann nicht geändert werden: dem Dashboard fehlt das Shopify-Recht write_inventory.', { grund: 'recht-fehlt' });
    const pruef = await leseOderNull(proxy, produktId, standortId);
    // Ein passender Zielwert allein beweist bei einer Inventur nicht, wer ihn gesetzt hat.
    // Wiederholungen behalten denselben Schluessel und dieselben CAS-Parameter.
    throw new SonderpostenFehler(504, `Ob die Restlänge gespeichert wurde, ist unklar. Bitte neu laden und den Bestand in Shopify prüfen${pruef ? ` (physisch ${pruef.bestandVorhanden} m²)` : ''}.`, { grund: 'unklar' });
  }
  const fehler = antwort?.inventorySetQuantities?.userErrors;
  if (!Array.isArray(fehler)) throw new SonderpostenFehler(504, 'Shopify hat keine eindeutige Antwort gegeben. Bitte neu laden und den Bestand prüfen.', { grund: 'unklar' });
  if (fehler.length) {
    if (fehler.some(e => /STALE|COMPARE/.test(e.code || ''))) throw new SonderpostenFehler(409, 'Der Bestand wurde gleichzeitig geändert – nichts überschrieben. Bitte neu laden und erneut prüfen.', { grund: 'bestand' });
    throw new SonderpostenFehler(502, `Shopify hat die Bestandskorrektur abgelehnt: ${fehler.map(e => e.message).join('; ')}`);
  }
  const nachher = await leseOderNull(proxy, produktId, standortId);
  return {
    typ: 'inventur', gebucht: true,
    ok: Boolean(nachher?.getrackt && nachher.ueberverkaufGesperrt && nachher.bestandVorhanden === neu && nachher.bestand >= 0),
    gegenprobe: nachher ? 'ok' : 'fehlgeschlagen',
    titel: vorher.titel, operationId, referenz, laengeM: laenge, breiteM: vorher.breiteM,
    bestandVorher: vorher.bestandVorhanden, bestandErwartet: neu,
    bestandNachher: nachher?.bestandVorhanden ?? null, verfuegbarNachher: nachher?.bestand ?? null,
    restLaengeM: nachher?.laengeM ?? null, eintrag: nachher,
  };
}

/** Alle Sonderposten (ohne Vorlagen und archivierte), neueste Aenderung zuerst. */
export async function leseListe(proxy, { standortId = STANDORT_ID, jetzt = new Date() } = {}) {
  const eintraege = [];
  let after = null;
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    // eslint-disable-next-line no-await-in-loop -- Seiten nacheinander, der Cursor kommt aus der Antwort.
    const data = await proxy.execute(LISTE_QUERY, { first: 100, after, query: SUCHE, locationId: standortId });
    if (data === null) return null; // kein Zugang (Sammelmodus)
    const conn = data?.products;
    if (!conn) throw new Error('Sonderposten: Antwort ohne products');
    for (const p of conn.nodes ?? []) {
      if (p.status === 'ARCHIVED' || istVorlage(p)) continue;
      if (p.productType !== PRODUKTART && !istRolle(p)) continue;
      eintraege.push(eintragAus(p));
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return {
    abgerufenAm: jetzt.toISOString(),
    anzahl: eintraege.length,
    verfuegbarAnzahl: eintraege.filter(e => e.verkaufbar).length,
    eintraege,
  };
}

/** Ein Produkt neu lesen; liefert den Eintrag oder wirft 404. */
export async function leseEinzeln(proxy, id, { standortId = STANDORT_ID } = {}) {
  const data = await proxy.execute(EINZELN_QUERY, { id, locationId: standortId });
  if (data === null) throw new SonderpostenFehler(503, 'Kein Zugang zu Shopify eingerichtet.', { grund: 'kein-zugang' });
  const p = data?.product;
  if (!p) throw new SonderpostenFehler(404, 'Dieses Stück gibt es in Shopify nicht (mehr). Bitte die Liste neu laden.');
  return { produkt: p, eintrag: eintragAus(p) };
}

/** Shopify-Datumsfeld date_time: ISO ohne Millisekunden. */
export function alsDateTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Fehlt dem Zugang ein Recht? Shopify meldet das als GraphQL-Fehler "Access denied ..." (Code ACCESS_DENIED). */
export function istZugriffVerweigert(err) {
  return /access denied|ACCESS_DENIED|HTTP 403|write_inventory/i.test(String(err?.message || err));
}

/** Meldung, wenn Ueberverkauf erlaubt ist: Bestand 0 wuerde den Onlinekauf nicht sperren. */
export const UEBERVERKAUF_OFFEN = 'In Shopify ist für dieses Stück „Verkauf bei Nichtverfügbarkeit fortsetzen“ eingeschaltet – '
  + 'mit Bestand 0 wäre es online weiter bestellbar. Bitte dort ausschalten; hier wird nichts gebucht.';

/** Meldung, wenn nach der Bestandsmutation keine Antwort kam und auch die Gegenprobe nichts belegt. */
export const ERGEBNIS_UNKLAR = 'Ob der Verkauf gebucht wurde, ist unklar: Shopify hat auf die Buchung nicht geantwortet. '
  + 'Bitte die Liste neu laden und den Bestand prüfen, bevor noch einmal gebucht wird.';

/** Liest das Stueck neu; ein Lesefehler ergibt null statt einer Ausnahme (fuer Gegenproben). */
async function leseOderNull(proxy, id, standortId) {
  try {
    return (await leseEinzeln(proxy, id, { standortId })).eintrag;
  } catch {
    return null;
  }
}

/**
 * Setzt den Bestand von `vorher` auf `neu`: Compare-and-swap (changeFromQuantity)
 * gegen Doppelbuchung, @idempotent gegen doppelte Zustellung. Kommt keine
 * Antwort, klaert erneutes Lesen den Ausgang - "nichts gebucht" nur, wenn der
 * Bestand nachweislich unveraendert ist. Gibt { antwortVerloren } zurueck oder
 * wirft SonderpostenFehler.
 */
async function bucheBestand(proxy, { produktId, inventoryItemId, vorher, neu, referenz, schluessel, standortId, rechtFehlt }) {
  let antwort;
  try {
    antwort = await proxy.execute(BESTAND_MUTATION, {
      schluessel,
      input: {
        name: 'available',
        reason: 'correction',
        referenceDocumentUri: referenz,
        quantities: [{ inventoryItemId, locationId: standortId, quantity: neu, changeFromQuantity: vorher }],
      },
    });
  } catch (err) {
    // Shopify lehnt fehlende Rechte vor der Ausfuehrung ab - dann ist sicher nichts gebucht.
    if (istZugriffVerweigert(err)) throw new SonderpostenFehler(403, rechtFehlt, { grund: 'recht-fehlt' });
    // Sonst ist der Ausgang offen: die Mutation kann angekommen sein, nur die
    // Antwort nicht. Erneut lesen statt "nichts gebucht" zu behaupten.
    const pruef = await leseOderNull(proxy, produktId, standortId);
    if (pruef?.bestand === vorher) {
      throw new SonderpostenFehler(502, `Shopify hat die Buchung nicht bestätigt; laut erneutem Lesen ist der Bestand weiterhin ${vorher}. Bitte noch einmal versuchen.`, { grund: 'nicht-angekommen' });
    }
    if (pruef?.bestand !== neu) {
      throw new SonderpostenFehler(504, ERGEBNIS_UNKLAR, { grund: 'unklar', bestand: pruef?.bestand ?? null });
    }
    // Bestand ist `neu`: die Buchung ist angekommen.
    return { antwortVerloren: true };
  }
  const fehler = antwort?.inventorySetQuantities?.userErrors ?? [];
  if (fehler.length) {
    if (fehler.some(e => /STALE|COMPARE/i.test(e.code || ''))) {
      throw new SonderpostenFehler(409, 'Jemand hat den Bestand gerade gleichzeitig geändert – nichts gebucht. Bitte die Liste neu laden.', { grund: 'bestand' });
    }
    throw new SonderpostenFehler(502, `Shopify hat die Bestandsänderung abgelehnt: ${fehler.map(e => e.message).join('; ')}`);
  }
  return { antwortVerloren: false };
}

/**
 * Bucht ein Stueck als im Laden verkauft. Wirft SonderpostenFehler (Status
 * und Klartext fuer die Oberflaeche); alles andere ist ein unerwarteter Fehler.
 *
 * @param {object} proxy        GraphQLProxy (oder Attrappe mit execute())
 * @param {object} p
 * @param {string} p.produktId  gid://shopify/Product/...
 * @param {string} [p.inventoryItemId]  aus der Liste - nur zum Abgleich, gebucht wird mit dem frisch gelesenen
 * @param {string} p.verkauftVon  Anzeigename des angemeldeten Benutzers
 * @param {Date}   p.jetzt
 */
export async function verkaufeImLaden(proxy, { produktId, inventoryItemId = null, verkauftVon, jetzt = new Date(), standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(produktId || ''))) {
    throw new SonderpostenFehler(400, 'Ungültige Produkt-ID.');
  }
  // 1. Frisch lesen. Scheitert das Lesen am Netz, ist noch nichts geschrieben.
  let produkt;
  let vorher;
  try {
    ({ produkt, eintrag: vorher } = await leseEinzeln(proxy, produktId, { standortId }));
  } catch (err) {
    if (err instanceof SonderpostenFehler) throw err;
    throw new SonderpostenFehler(502, 'Shopify war nicht lesbar – nichts gebucht. Bitte noch einmal versuchen.', { grund: 'nicht-erreichbar', detail: String(err?.message || err).slice(0, 200) });
  }
  if (istRolle(produkt)) throw new SonderpostenFehler(400, 'Das ist eine Restrolle – bitte die abgeschnittene Länge angeben.');
  if (produkt.productType !== PRODUKTART) throw new SonderpostenFehler(400, 'Das ist kein Sonderposten – hier wird nichts gebucht.');
  if (istVorlage(produkt)) throw new SonderpostenFehler(400, 'Die Vorlage ist kein verkaufbares Stück.');
  if (vorher.variantenAnzahl !== 1) throw new SonderpostenFehler(409, 'Dieses Stück hat mehr als eine Variante – bitte in Shopify prüfen, hier wird nichts gebucht.');
  if (!vorher.getrackt || !vorher.inventoryItemId) {
    throw new SonderpostenFehler(409, 'Für dieses Stück wird in Shopify kein Bestand geführt – bitte dort „Bestand verfolgen“ einschalten.');
  }
  if (!vorher.ueberverkaufGesperrt) {
    throw new SonderpostenFehler(409, UEBERVERKAUF_OFFEN, { grund: 'ueberverkauf' });
  }
  if (inventoryItemId && inventoryItemId !== vorher.inventoryItemId) {
    throw new SonderpostenFehler(409, 'Die Angaben haben sich in Shopify geändert. Bitte die Liste neu laden.');
  }
  // 2. Nur bei Bestand genau 1.
  if (vorher.bestand !== 1) {
    const text = vorher.bestand === 0
      ? 'Dieses Stück ist bereits verkauft (Bestand 0) – nichts gebucht.'
      : `Bestand ist nicht 1 (aktuell ${vorher.bestand ?? 'nicht angelegt'}) – nichts gebucht. Bitte in Shopify prüfen.`;
    throw new SonderpostenFehler(409, text, { grund: 'bestand', bestand: vorher.bestand });
  }

  // 3. Bestand auf 0 - mit Compare-and-swap gegen Doppelbuchung.
  const zeit = alsDateTime(jetzt);
  const referenz = `tp://laden-verkauf/${encodeURIComponent(vorher.sku || numId(produktId))}/${zeit}`;
  const { antwortVerloren } = await bucheBestand(proxy, {
    produktId, inventoryItemId: vorher.inventoryItemId, vorher: 1, neu: 0, referenz, schluessel, standortId, rechtFehlt: RECHT_FEHLT,
  });

  // 4. Verkaufsangaben. Der Bestand ist ab hier gebucht - ein Fehler bei den
  // Feldern macht ihn nicht rueckgaengig, er wird als Hinweis zurueckgegeben.
  const metafields = [
    { ownerId: produktId, namespace: NAMENSRAUM, key: 'verkauft_am', type: 'date_time', value: zeit },
    { ownerId: produktId, namespace: NAMENSRAUM, key: 'verkauft_von', type: 'single_line_text_field', value: String(verkauftVon || 'unbekannt').slice(0, 100) },
    { ownerId: produktId, namespace: NAMENSRAUM, key: 'verkauft_kanal', type: 'single_line_text_field', value: 'Laden' },
  ];
  let felderFehler = null;
  try {
    const antwort = await proxy.execute(FELDER_MUTATION, { metafields });
    const ue = antwort?.metafieldsSet?.userErrors ?? [];
    if (ue.length) felderFehler = ue.map(e => e.message).join('; ');
  } catch (err) {
    felderFehler = String(err?.message || err).slice(0, 300);
  }

  // 5. Gegenprobe. Der Bestand ist ab hier gebucht - scheitert nur das Lesen,
  // wird das gemeldet, nicht als Fehlschlag der Buchung ausgegeben.
  const nachher = await leseOderNull(proxy, produktId, standortId);
  if (!nachher) {
    return {
      ok: false,
      gebucht: true,
      gegenprobe: 'fehlgeschlagen',
      antwortVerloren,
      sku: vorher.sku,
      titel: vorher.titel,
      referenz,
      bestandVorher: vorher.bestand,
      bestandNachher: null,
      onlineGesperrt: null,
      felderGesetzt: null,
      felderFehler,
      eintrag: null,
    };
  }
  const felderGesetzt = nachher.verkauftAm !== null && nachher.verkauftKanal === 'Laden' && nachher.verkauftVon !== null;
  return {
    // ok heisst: Bestand 0 UND online gesperrt (gefuehrt, DENY) - nur dann stimmt
    // "online nicht mehr bestellbar".
    ok: nachher.onlineGesperrt,
    gebucht: true,
    gegenprobe: 'ok',
    antwortVerloren,
    sku: vorher.sku,
    titel: vorher.titel,
    referenz,
    bestandVorher: vorher.bestand,
    bestandNachher: nachher.bestand,
    onlineGesperrt: nachher.onlineGesperrt,
    felderGesetzt,
    felderFehler: felderFehler || (felderGesetzt ? null : 'Verkaufsangaben sind nach dem Speichern nicht in Shopify zu sehen.'),
    eintrag: nachher,
  };
}

/** Hoechste Laenge, die in einem Zug von einer Rolle gebucht werden kann (Schutz gegen Vertipper). */
export const MAX_LAENGE_M = 100;

/**
 * Bucht eine im Laden verkaufte Laenge von einer Restrolle: Laenge x volle
 * Rollenbreite (aufgerundet auf ganze m2) wird vom Bestand abgezogen. Wirft
 * SonderpostenFehler wie verkaufeImLaden.
 *
 * @param {object} proxy
 * @param {object} p
 * @param {string} p.produktId
 * @param {string} [p.inventoryItemId]  aus der Liste - nur zum Abgleich
 * @param {number} p.laengeM            abgeschnittene Laenge in m (volle Rollenbreite)
 * @param {Date}   p.jetzt
 */
export async function verkaufeVonRolle(proxy, { produktId, inventoryItemId = null, laengeM, jetzt = new Date(), standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(produktId || ''))) {
    throw new SonderpostenFehler(400, 'Ungültige Produkt-ID.');
  }
  const laenge = Number(laengeM);
  if (!Number.isFinite(laenge) || laenge <= 0) throw new SonderpostenFehler(400, 'Bitte die abgeschnittene Länge in Metern angeben, z. B. 3,5.');
  if (laenge > MAX_LAENGE_M) throw new SonderpostenFehler(400, `Mehr als ${MAX_LAENGE_M} m in einem Zug? Bitte die Eingabe prüfen.`);
  if (Math.abs(laenge * 100 - Math.round(laenge * 100)) > 1e-6) throw new SonderpostenFehler(400, 'Die Länge bitte auf den Zentimeter genau angeben (höchstens zwei Nachkommastellen).');

  // 1. Frisch lesen.
  let produkt;
  let vorher;
  try {
    ({ produkt, eintrag: vorher } = await leseEinzeln(proxy, produktId, { standortId }));
  } catch (err) {
    if (err instanceof SonderpostenFehler) throw err;
    throw new SonderpostenFehler(502, 'Shopify war nicht lesbar – nichts gebucht. Bitte noch einmal versuchen.', { grund: 'nicht-erreichbar', detail: String(err?.message || err).slice(0, 200) });
  }
  if (!istRolle(produkt)) throw new SonderpostenFehler(400, 'Das ist keine Restrolle – hier wird keine Länge gebucht.');
  if (vorher.variantenAnzahl !== 1) throw new SonderpostenFehler(409, 'Diese Rolle hat mehr als eine Variante – bitte in Shopify prüfen, hier wird nichts gebucht.');
  if (!vorher.getrackt || !vorher.inventoryItemId) {
    throw new SonderpostenFehler(409, 'Für diese Rolle wird in Shopify kein Bestand geführt – bitte dort „Bestand verfolgen“ einschalten.');
  }
  if (!vorher.ueberverkaufGesperrt) {
    throw new SonderpostenFehler(409, 'In Shopify ist für diese Rolle „Verkauf bei Nichtverfügbarkeit fortsetzen“ eingeschaltet – der Bestand würde online nichts begrenzen. Bitte dort ausschalten; hier wird nichts gebucht.', { grund: 'ueberverkauf' });
  }
  if (inventoryItemId && inventoryItemId !== vorher.inventoryItemId) {
    throw new SonderpostenFehler(409, 'Die Angaben haben sich in Shopify geändert. Bitte die Liste neu laden.');
  }

  // 2. Verbrauch rechnen und gegen den Bestand pruefen.
  const qm = qmFuerLaenge(laenge, vorher.breiteM);
  if (vorher.bestand === null || vorher.bestand <= 0) {
    throw new SonderpostenFehler(409, 'Diese Rolle ist laut Shopify schon leer (Bestand 0) – nichts gebucht.', { grund: 'bestand', bestand: vorher.bestand });
  }
  if (qm > vorher.bestand) {
    const m = String(vorher.laengeM).replace('.', ',');
    throw new SonderpostenFehler(409, `So viel ist nicht mehr da: ${laenge.toLocaleString('de-DE')} m ergeben ${qm} m², in Shopify stehen nur noch ${vorher.bestand} m² (${m} m). Nichts gebucht – bitte Länge und Bestand prüfen.`, { grund: 'bestand', bestand: vorher.bestand });
  }

  // 3. Abziehen - mit Compare-and-swap gegen Doppelbuchung.
  const zeit = alsDateTime(jetzt);
  const referenz = `tp://laden-verkauf/${encodeURIComponent(produkt.handle || numId(produktId))}/${zeit}?laenge_cm=${Math.round(laenge * 100)}&qm=${qm}`;
  const neu = vorher.bestand - qm;
  const { antwortVerloren } = await bucheBestand(proxy, {
    produktId, inventoryItemId: vorher.inventoryItemId, vorher: vorher.bestand, neu, referenz, schluessel, standortId, rechtFehlt: RECHT_FEHLT_ROLLE,
  });

  // 4. Gegenprobe. Scheitert nur das Lesen, ist trotzdem gebucht.
  const nachher = await leseOderNull(proxy, produktId, standortId);
  return {
    typ: 'rolle',
    ok: nachher ? nachher.bestand === neu : false,
    gebucht: true,
    gegenprobe: nachher ? 'ok' : 'fehlgeschlagen',
    antwortVerloren,
    titel: vorher.titel,
    referenz,
    laengeM: laenge,
    breiteM: vorher.breiteM,
    qm,
    bestandVorher: vorher.bestand,
    bestandErwartet: neu,
    bestandNachher: nachher ? nachher.bestand : null,
    restLaengeM: nachher ? nachher.laengeM : null,
    eintrag: nachher,
  };
}
