/** Manuelle Lieferzusage, Wareneingang und Arbeitsuebernahme im vorhandenen Positionsspeicher. */
import { leseAlle, schreibeAlle, positionKey } from './auftragsstatus.mjs';
import { personId, restmenge } from '../../docs/ai-dashboard/lib/beschaffung.mjs';

export class BeschaffungFehler extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const objekt = v => v && typeof v === 'object' && !Array.isArray(v);
function datum(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BeschaffungFehler('Liefertermin als gültiges Datum angeben.');
  const [y, m, d] = v.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== v) throw new BeschaffungFehler('Der Liefertermin ist kein gültiges Datum.');
  return v;
}
function menge(v) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') throw new BeschaffungFehler('Menge bitte ausdrücklich angeben.');
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new BeschaffungFehler('Menge muss zwischen 0 und 1.000.000 liegen.');
  return Math.round(n * 1e6) / 1e6;
}

/** Mengen sind kumulativ: keine automatische Schätzung, kein Bestands-/Shopify-Write. */
export function bestaetigeBeschaffung(file, { orderId, lineItemId, felder, soll, einheit, actor, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key || !actor) throw new BeschaffungFehler('Position und handelnde Person fehlen.');
  if (!objekt(felder) || !Object.keys(felder).length || Object.keys(felder).some(k => !['liefertermin', 'angekommen', 'verwendbar', 'grund'].includes(k))) throw new BeschaffungFehler('Unbekannte oder fehlende Angaben zum Wareneingang.');
  const alle = leseAlle(file);
  const vorher = alle[key] || {};
  const b = { ...(vorher.beschaffung || {}) };
  const zeit = jetzt.toISOString();
  if ('liefertermin' in felder) b.liefertermin = datum(felder.liefertermin);
  if ('grund' in felder) {
    if (typeof felder.grund !== 'string' && felder.grund !== null) throw new BeschaffungFehler('Hinweis muss ein Text sein.');
    b.grund = String(felder.grund || '').trim().slice(0, 1000) || null;
  }
  const wareneingang = 'angekommen' in felder || 'verwendbar' in felder;
  let status = vorher.status || null;
  if (wareneingang) {
    if (['raus', 'erledigt'].includes(status)) throw new BeschaffungFehler('Diese Position ist schon beim Kunden. Wareneingang hier nicht rückwirkend ändern.', 409);
    const bestellt = menge(soll);
    if (!(bestellt > 0) || !['paket', 'stueck', 'muster', 'lfm', 'm2'].includes(einheit)) throw new BeschaffungFehler('Die Bestellmenge ist nicht belegt. Zuerst die Position klären.');
    if (b.wareneingang && b.wareneingang.einheit !== einheit) throw new BeschaffungFehler('Bestelleinheit geändert. Den erfassten Wareneingang zuerst klären; Mengen werden nicht umgerechnet.', 409);
    const angekommen = menge(felder.angekommen);
    const verwendbar = menge(felder.verwendbar);
    if (verwendbar > angekommen || angekommen > bestellt) throw new BeschaffungFehler('Verwendbare Menge darf nicht größer als angekommen sein; angekommen nicht größer als bestellt.');
    if (angekommen > verwendbar && !b.grund) throw new BeschaffungFehler('Bitte den Grund für die nicht verwendbare Menge nennen.');
    b.wareneingang = { soll: bestellt, angekommen, verwendbar, einheit: String(einheit), bestaetigtAm: zeit, bestaetigtVon: actor };
    status = verwendbar >= bestellt ? 'geliefert' : 'bestellt';
  }
  b.bestaetigtAm = zeit; b.bestaetigtVon = actor;
  const eintrag = { ...vorher, orderId: String(orderId), lineItemId: String(lineItemId), status, beschaffung: b, aktualisiertAm: zeit, aktualisiertVon: actor,
    verlauf: [...(vorher.verlauf || []), { aktion: 'Beschaffung bestätigt', am: zeit, von: actor, vorher: vorher.beschaffung || null }].slice(-100) };
  if (wareneingang && status === 'geliefert') { eintrag.geliefertAm = zeit; eintrag.geliefertVon = actor; }
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}

const PRUEFPUNKTE = ['menge', 'masse', 'lieferweg', 'zuschlaege'];
function text(v, max, name, { pflicht = false } = {}) {
  if (v === null || v === undefined || v === '') {
    if (pflicht) throw new BeschaffungFehler(`${name} bitte angeben.`);
    return null;
  }
  if (typeof v !== 'string') throw new BeschaffungFehler(`${name} muss ein Text sein.`);
  const s = v.trim();
  if (!s && pflicht) throw new BeschaffungFehler(`${name} bitte angeben.`);
  return s ? s.slice(0, max) : null;
}
/** Tag ("JJJJ-MM-TT"), nicht nach heute. */
function vergangenerTag(v, name, jetzt) {
  const tag = datum(v);
  if (!tag) throw new BeschaffungFehler(`${name} bitte angeben.`);
  if (tag > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt)) throw new BeschaffungFehler(`${name} liegt in der Zukunft.`);
  return tag;
}
/** Zeitpunkt als ISO-Text mit Zeitzone (der Browser rechnet die Ortszeit um), nicht in der Zukunft. */
function zeitpunkt(v, name, jetzt) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) throw new BeschaffungFehler(`${name} als Datum mit Uhrzeit angeben.`);
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new BeschaffungFehler(`${name} ist kein gültiger Zeitpunkt.`);
  if (t > jetzt.getTime() + 5 * 60_000) throw new BeschaffungFehler(`${name} liegt in der Zukunft.`);
  return new Date(t).toISOString();
}
/** Nur ein Gmail-Link oder eine https-Adresse - nie javascript: oder data: in der Anzeige. */
function belegLink(v) {
  const s = text(v, 500, 'Beleg-Link');
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { throw new BeschaffungFehler('Der Beleg-Link ist keine gültige Adresse.'); }
  if (u.protocol !== 'https:') throw new BeschaffungFehler('Der Beleg-Link muss mit https:// beginnen.');
  return u.toString();
}

/**
 * Lieferantenstand je Position im vorhandenen Unterobjekt `beschaffung` - der Schritt im
 * Auftragsfluss (status) aendert sich dabei nie:
 *   anfrage        offene Position: Lieferant nach Preis/Verfuegbarkeit/Konditionen gefragt (am, lieferant, notiz)
 *   anfrageZurueck Anfrage zuruecknehmen (wandert in den Verlauf)
 *   bestelldaten   bestellte Position: tatsaechlicher Bestellzeitpunkt, Bestellreferenz, offener Lieferweg, Notiz
 *   ab             bestellte Position: Auftragsbestaetigung geprueft (Nummer, Liefertermin, Preis, Beleg,
 *                  Pruefung Menge/Masse/Lieferweg/Zuschlaege - jeder Punkt ausdruecklich beantwortet)
 *   abZurueck      AB-Vermerk zuruecknehmen (wandert in den Verlauf; der Liefertermin bleibt)
 * Ein Beleg wird nie automatisch bestaetigt: jede AB kommt aus diesem Aufruf mit handelnder Person.
 */
export function setzeLieferantenstand(file, { orderId, lineItemId, schritt, felder = {}, actor, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key || !actor) throw new BeschaffungFehler('Position und handelnde Person fehlen.');
  if (!objekt(felder)) throw new BeschaffungFehler('Angaben fehlen.');
  const erlaubt = { anfrage: ['am', 'lieferant', 'notiz'], anfrageZurueck: [], bestelldaten: ['am', 'referenz', 'lieferwegOffen', 'notiz'],
    ab: ['nummer', 'liefertermin', 'preis', 'belegId', 'link', 'pruefung', 'abweichung'], abZurueck: [] }[schritt];
  if (!erlaubt) throw new BeschaffungFehler(`Unbekannter Schritt „${schritt}“.`);
  if (Object.keys(felder).some(k => !erlaubt.includes(k))) throw new BeschaffungFehler('Unbekannte Angaben zum Lieferantenstand.');
  const alle = leseAlle(file);
  const vorher = alle[key] || {};
  const status = vorher.status || null;
  const b = { ...(vorher.beschaffung || {}) };
  const zeit = jetzt.toISOString();
  const eintrag = { ...vorher, orderId: String(orderId), lineItemId: String(lineItemId), aktualisiertAm: zeit, aktualisiertVon: actor };
  const protokoll = { am: zeit, von: actor };
  if (schritt === 'anfrage') {
    if (status) throw new BeschaffungFehler('Diese Position ist schon bestellt. Eine Anfrage gehört vor die Bestellung.', 409);
    b.anfrage = { am: vergangenerTag(felder.am, 'Datum der Anfrage', jetzt), lieferant: text(felder.lieferant, 120, 'Lieferant', { pflicht: true }),
      notiz: text(felder.notiz, 1000, 'Notiz'), erfasstAm: zeit, erfasstVon: actor };
    Object.assign(protokoll, { aktion: 'Lieferant angefragt', vorher: vorher.beschaffung?.anfrage || null });
  } else if (schritt === 'anfrageZurueck') {
    if (!b.anfrage) throw new BeschaffungFehler('Zu dieser Position ist keine Anfrage erfasst.', 409);
    Object.assign(protokoll, { aktion: 'Anfrage zurückgenommen', vorher: b.anfrage });
    delete b.anfrage;
  } else if (schritt === 'bestelldaten') {
    if (status !== 'bestellt') throw new BeschaffungFehler('Bestelldaten gehen nur bei einer bestellten Position.', 409);
    Object.assign(protokoll, { aktion: 'Bestelldaten ergänzt', vorher: { bestelltAm: vorher.bestelltAm || null, lieferantBestellnummer: vorher.lieferantBestellnummer || null, bestellung: vorher.beschaffung?.bestellung || null } });
    if ('am' in felder) eintrag.bestelltAm = zeitpunkt(felder.am, 'Bestellzeitpunkt', jetzt);
    if ('referenz' in felder) eintrag.lieferantBestellnummer = text(felder.referenz, 200, 'Bestellreferenz');
    const best = { ...(b.bestellung || {}) };
    if ('lieferwegOffen' in felder) best.lieferwegOffen = text(felder.lieferwegOffen, 500, 'Offener Lieferweg');
    if ('notiz' in felder) best.notiz = text(felder.notiz, 1000, 'Notiz');
    for (const k of Object.keys(best)) if (best[k] === null) delete best[k];
    if (Object.keys(best).length) b.bestellung = { ...best, erfasstAm: zeit, erfasstVon: actor }; else delete b.bestellung;
  } else if (schritt === 'ab') {
    if (!['bestellt', 'geliefert'].includes(status)) throw new BeschaffungFehler('Eine Auftragsbestätigung gehört zu einer bestellten Position. Zuerst „Bestellt“ setzen.', 409);
    const pruefung = felder.pruefung;
    if (!objekt(pruefung) || PRUEFPUNKTE.some(k => !['ok', 'abweichung'].includes(pruefung[k])) || Object.keys(pruefung).some(k => !PRUEFPUNKTE.includes(k))) {
      throw new BeschaffungFehler('Bitte Menge, Maße, Lieferweg und Zuschläge einzeln prüfen (stimmt / weicht ab).');
    }
    const abweichung = text(felder.abweichung, 1000, 'Abweichung');
    if (PRUEFPUNKTE.some(k => pruefung[k] === 'abweichung') && !abweichung) throw new BeschaffungFehler('Bitte beschreiben, was in der AB abweicht.');
    const liefertermin = datum(felder.liefertermin);
    if (!liefertermin) throw new BeschaffungFehler('Bestätigten Liefertermin aus der AB angeben.');
    Object.assign(protokoll, { aktion: 'AB geprüft', vorher: vorher.beschaffung?.ab || null, lieferterminVorher: vorher.beschaffung?.liefertermin || null });
    b.ab = { nummer: text(felder.nummer, 80, 'AB-Nummer', { pflicht: true }), preis: text(felder.preis, 80, 'Preis'),
      belegId: text(felder.belegId, 120, 'Beleg'), link: belegLink(felder.link), pruefung: Object.fromEntries(PRUEFPUNKTE.map(k => [k, pruefung[k]])),
      abweichung, geprueftAm: zeit, geprueftVon: actor };
    b.liefertermin = liefertermin;
    b.bestaetigtAm = zeit; b.bestaetigtVon = actor;
  } else {
    if (!b.ab) throw new BeschaffungFehler('Zu dieser Position ist keine AB erfasst.', 409);
    Object.assign(protokoll, { aktion: 'AB zurückgenommen', vorher: b.ab });
    delete b.ab;
  }
  if (Object.keys(b).length) eintrag.beschaffung = b; else delete eintrag.beschaffung;
  eintrag.verlauf = [...(Array.isArray(vorher.verlauf) ? vorher.verlauf : []), protokoll].slice(-100);
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}

/** Alle betroffenen Positionen werden vor dem einzigen Schreibvorgang geprüft. Kein stiller Ablauf. */
export function arbeitsuebernahme(file, { positionen, aktion, person, actor, jetzt = new Date() } = {}) {
  if (person?.rolle === 'lesen') throw new BeschaffungFehler('Rolle „lesen“ darf keine Arbeit übernehmen.', 403);
  if (!['nehmen', 'freigeben', 'uebernehmen'].includes(aktion)) throw new BeschaffungFehler('Unbekannte Übernahme-Aktion.');
  if (!Array.isArray(positionen) || !positionen.length || positionen.length > 200) throw new BeschaffungFehler('Bitte die betroffenen Positionen auswählen.');
  const id = personId(person, actor);
  if (!id || !actor) throw new BeschaffungFehler('Handelnde Person fehlt.', 403);
  const inhaber = !person || person.rolle === 'inhaber';
  if (aktion === 'uebernehmen' && !inhaber) throw new BeschaffungFehler('Eine fremde Übernahme kann nur der Inhaber übernehmen.', 403);
  const keys = [...new Set(positionen.map(p => positionKey(p.orderId, p.lineItemId)))];
  if (keys.some(k => !k)) throw new BeschaffungFehler('Ungültige Position.');
  const alle = leseAlle(file);
  for (const k of keys) {
    const u = alle[k]?.uebernahme;
    if (u && u.id !== id && aktion !== 'uebernehmen') throw new BeschaffungFehler(aktion === 'freigeben' ? 'Du kannst nur deine eigene Übernahme freigeben.' : `Diese Arbeit ist schon von ${u.person} übernommen.`, aktion === 'freigeben' ? 403 : 409);
  }
  const zeit = jetzt.toISOString();
  const ergebnis = {};
  for (const k of keys) {
    const p = positionen.find(p => positionKey(p.orderId, p.lineItemId) === k);
    const e = { ...(alle[k] || {}), orderId: String(p.orderId), lineItemId: String(p.lineItemId) };
    const vorher = e.uebernahme || null;
    e.uebernahme = aktion === 'freigeben' ? null : { id, person: actor, seit: zeit };
    e.verlauf = [...(e.verlauf || []), { aktion: aktion === 'freigeben' ? 'Arbeit freigegeben' : 'Arbeit übernommen', am: zeit, von: actor, vorher }].slice(-100);
    alle[k] = e; ergebnis[k] = e;
  }
  schreibeAlle(file, alle);
  return ergebnis;
}

export { restmenge };
