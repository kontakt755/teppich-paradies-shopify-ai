/**
 * "Muster sofort lieferbar" im Shop (09.11.2026): welche Musterfarben im Musterlager liegen, steht im
 * Shop-Metafeld custom.muster_sofort ({"skus": [...], "stand": ISO}). Der Musterkonfigurator
 * (sections/tp-sample-checkout.liquid, snippets/tp-muster-sofort.liquid) zeigt danach den Hinweis.
 *
 * Ein Shop-Metafeld statt Variantenmetafelder: der Konfigurator laedt die Musterprodukte per
 * /products/<handle>.js, dort stehen keine Metafelder. Ein Wert, ein Schreibaufruf, Rueckweg trivial.
 *
 * Schreibt nur, wenn $TP_PRIVAT_DIR/muster-sofort-shop.json `aktiv: true` traegt (Freigabe des Benutzers),
 * und nur bei geaendertem Stand. Rueckweg: `aktiv: false` setzen und das Metafeld loeschen
 * (metafieldsDelete, ownerId = Shop, custom/muster_sofort) - das Theme zeigt dann nichts mehr.
 */

import fs from 'node:fs';
import path from 'node:path';

export const NAMESPACE = 'custom';
export const KEY = 'muster_sofort';

export const ABFRAGE = `{ shop { id metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }`;
export const MUTATION = `mutation MusterSofort($m: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $m) { metafields { value } userErrors { field message code } }
}`;

export const standPfad = dir => path.join(dir, 'muster-sofort-shop.json');

/** Auch ohne Aenderung so oft neu schreiben: das Theme verwirft Listen aelter als 2 Stunden (MAX_ALTER im JS). */
export const AUFFRISCHEN_MS = 60 * 60 * 1000;
/** Nach einem Fehler so lange Ruhe, statt jede Minute dieselbe Anfrage zu stellen. */
export const PAUSE_NACH_FEHLER_MS = 15 * 60 * 1000;

/** Stand der letzten Uebertragung. Fehlt die Datei: nicht freigegeben. Kaputt: wirft (nie blind schreiben). */
export function leseStand(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return { aktiv: false, skus: null };
    throw e;
  }
  const roh = JSON.parse(text);
  return { aktiv: roh?.aktiv === true, skus: Array.isArray(roh?.skus) ? roh.skus : null, am: roh?.am || null, fehler: roh?.fehler || null, fehlerAm: roh?.fehlerAm || null };
}

function schreibeStand(file, stand) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stand, null, 2));
  fs.renameSync(tmp, file);
}

const gleich = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

const alterMs = (iso, jetzt) => (iso ? jetzt.getTime() - new Date(iso).getTime() : Infinity);

/**
 * Bringt das Metafeld auf `skus` (sortiert, aus musterlager.sofortLieferbar). Gegenprobe: liest den Wert
 * zurueck - `userErrors: []` allein ist kein Beleg. Ohne Aenderung schreibt es stuendlich nur den Zeitstempel
 * neu (Lebenszeichen fuer das Theme). Nach einem Fehler 15 Minuten Pause; geworfen wird nur ein NEUER Fehler,
 * ein wiederholter kommt als Status zurueck - so steht dieselbe Fehlerzeile nur einmal im Protokoll.
 * @returns {Promise<{status: 'aus'|'unveraendert'|'pause'|'fehler'|'geschrieben', skus: string[]}>}
 */
export async function abgleichen({ dir, skus, proxy, jetzt = new Date() }) {
  const file = standPfad(dir);
  const alt = leseStand(file);
  if (!alt.aktiv) return { status: 'aus', skus };
  if (alt.fehler && alterMs(alt.fehlerAm, jetzt) < PAUSE_NACH_FEHLER_MS) return { status: 'pause', skus, fehler: alt.fehler };
  if (gleich(alt.skus, skus) && !alt.fehler && alterMs(alt.am, jetzt) < AUFFRISCHEN_MS) return { status: 'unveraendert', skus };
  try {
    const shop = (await proxy.execute(ABFRAGE, {}))?.shop;
    if (!shop?.id) throw new Error('Shop-ID nicht lesbar');
    const wert = JSON.stringify({ skus, stand: jetzt.toISOString() });
    const r = await proxy.execute(MUTATION, { m: [{ ownerId: shop.id, namespace: NAMESPACE, key: KEY, type: 'json', value: wert }] });
    const ue = r?.metafieldsSet?.userErrors ?? [];
    if (ue.length) throw new Error(ue.map(e => e.message).join('; '));
    const zurueck = JSON.parse((await proxy.execute(ABFRAGE, {}))?.shop?.metafield?.value || 'null');
    if (!gleich(zurueck?.skus, skus)) throw new Error('Gegenprobe: Shop zeigt einen anderen Stand');
    schreibeStand(file, { aktiv: true, skus, am: jetzt.toISOString() });
    return { status: 'geschrieben', skus };
  } catch (e) {
    // Stand bleibt alt, Fehler wird vermerkt: nach der Pause versucht es der naechste Lauf wieder.
    const fehler = String(e?.message || e).slice(0, 300);
    schreibeStand(file, { aktiv: true, skus: alt.skus, am: alt.am, fehler, fehlerAm: jetzt.toISOString() });
    if (fehler === alt.fehler) return { status: 'fehler', skus, fehler };
    throw e;
  }
}
