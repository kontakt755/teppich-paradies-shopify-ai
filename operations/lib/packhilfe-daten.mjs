/** Belegte Material-/Fertigmassdaten fuer eine unverbindliche Packhilfe; keine Speicherung. */
import { propertiesMap } from './resolve.mjs';

const NUMMER = '(?:\\d+(?:[.,]\\d+)?)';
const positiv = v => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const n = v => positiv(Number(String(v).replace(',', '.')));
const formVon = v => ({ rechteck: 'rechteck', quadrat: 'rechteck', rund: 'rund', kreis: 'rund', oval: 'oval' })[String(v || '').trim().toLowerCase()] || null;
const cm = (v, einheit) => {
  const wert = n(v), faktor = { mm: 0.1, cm: 1, m: 100 }[einheit];
  return wert && faktor ? Math.round(wert * faktor * 1e6) / 1e6 : null;
};

function fertigmasse(wert, formWert) {
  if (typeof wert !== 'string') return null;
  const t = wert.trim().toLowerCase();
  const kreis = t.match(new RegExp(`^ø\\s*(${NUMMER})\\s*(mm|cm|m)$`, 'u'));
  const form = formVon(formWert);
  if (kreis) {
    if (form && form !== 'rund') return null;
    const d = cm(kreis[1], kreis[2]);
    return d ? { breiteCm: d, laengeCm: d, form: 'rund' } : null;
  }
  const m = t.match(new RegExp(`^(${NUMMER})\\s*(mm|cm|m)?\\s*[×x]\\s*(${NUMMER})\\s*(mm|cm|m)?$`, 'u'));
  if (!m || (!m[2] && !m[4])) return null;
  const breiteCm = cm(m[1], m[2] || m[4]), laengeCm = cm(m[3], m[4] || m[2]);
  if (!breiteCm || !laengeCm || (form === 'rund' && breiteCm !== laengeCm)) return null;
  return { breiteCm, laengeCm, form };
}

function masseAus(position, roh) {
  const props = propertiesMap(roh?.customAttributes ?? roh?.properties);
  if (Object.hasOwn(props, 'Maße')) return { daten: fertigmasse(props['Maße'], props.Form), quelle: 'Bestellposition · Maße' };
  const zeilen = [...new Set((Array.isArray(position.ausfuehrung) ? position.ausfuehrung : []).filter(z => typeof z === 'string' && z.startsWith('Fertigmaß: ')))];
  if (zeilen.length !== 1) return { daten: null, quelle: null };
  const m = zeilen[0].slice('Fertigmaß: '.length).match(/^(.*?)(?:\s*\(([^()]*)\))?$/u);
  return { daten: m ? fertigmasse(m[1], m[2]) : null, quelle: 'Auftragsposition · Fertigmaß' };
}

function anzahl(position, roh) {
  const props = propertiesMap(roh?.customAttributes ?? roh?.properties);
  const modell = position.bestellmenge?.einheit === 'stueck' ? positiv(position.bestellmenge.menge) : null;
  if (Object.hasOwn(props, 'Anzahl')) {
    const m = String(props.Anzahl).trim().match(/^(\d+)(?:\s+Stück)?$/iu);
    const wert = m ? Number(m[1]) : null;
    return Number.isSafeInteger(wert) && wert > 0 && (!modell || modell === wert) ? wert : null;
  }
  // quantity ist bei Flaechenware die Zahl der Hundertstel-m², keine Teppichanzahl.
  return Number.isSafeInteger(modell) ? modell : null;
}

function einzelwert(v) {
  if (!Array.isArray(v)) return v;
  const werte = [...new Set(v.filter(x => x !== null && x !== undefined && x !== ''))];
  return werte.length === 1 ? werte[0] : null;
}

function einheitenwert(roh, art) {
  const wert = einzelwert(roh);
  let zahl, einheit;
  if (wert && typeof wert === 'object') {
    zahl = n(wert.value); einheit = String(wert.unit || '').toLowerCase();
  } else if (typeof wert === 'string') {
    const m = wert.trim().match(new RegExp(`^(${NUMMER})\\s*(g\\s*\\/\\s*m[²2]|kg\\s*\\/\\s*m[²2]|mm|cm|m)$`, 'iu'));
    if (!m) return null;
    zahl = n(m[1]); einheit = m[2].toLowerCase().replace(/\s/g, '');
  }
  const faktor = art === 'gewicht' ? { 'g/m²': 1, 'g/m2': 1, 'kg/m²': 1000, 'kg/m2': 1000 }[einheit]
    : { mm: 1, cm: 10, m: 1000 }[einheit];
  return zahl && faktor ? Math.round(zahl * faktor * 1e6) / 1e6 : null;
}

function material(eigenschaften, keys, art) {
  const belegt = keys.filter(k => Object.hasOwn(eigenschaften, k));
  if (!belegt.length) return { wert: null, quelle: null };
  const werte = belegt.map(k => einheitenwert(eigenschaften[k], art));
  if (werte.some(v => v === null) || new Set(werte).size !== 1) return { wert: null, quelle: null };
  return { wert: werte[0], quelle: `Lexikon · ${art === 'gewicht' ? 'Gesamtgewicht' : 'Gesamtdicke'}` };
}

/** Nur dieselbe Bestellposition und ihr eindeutig zugeordnetes Lexikonprodukt uebergeben. */
export function packhilfeDaten({ position = {}, rohPosition = null, produkt = null } = {}) {
  const masse = masseAus(position, rohPosition);
  const eigenschaften = produkt?.eigenschaften || {};
  const gewicht = material(eigenschaften, ['gesamtgewicht', 'Gesamtgewicht'], 'gewicht');
  const dicke = material(eigenschaften, ['gesamtstaerke', 'gesamtstarke', 'Gesamtstärke', 'gesamtdicke', 'Gesamtdicke'], 'dicke');
  return { breiteCm: masse.daten?.breiteCm ?? null, laengeCm: masse.daten?.laengeCm ?? null,
    form: masse.daten?.form ?? null, menge: anzahl(position, rohPosition),
    gewichtGm2: gewicht.wert, dickeMm: dicke.wert,
    quellen: { masse: masse.daten ? masse.quelle : null, gewicht: gewicht.quelle, dicke: dicke.quelle } };
}
