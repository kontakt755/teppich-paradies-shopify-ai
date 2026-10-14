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
