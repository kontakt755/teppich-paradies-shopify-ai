/** Kleine gemeinsame Regeln fuer manuell bestaetigten Einkauf - ohne DOM oder Dateizugriff. */
export function personId(person, fallback = '') {
  return String(person?.id || person?.kuerzel || person?.name || fallback).trim();
}

/** Frischer Export ist die Sollquelle; ein bestaetigter Eingang bleibt unveraendert nachvollziehbar. */
export function beschaffungsStand(eintrag, bestellmenge) {
  const w = eintrag?.beschaffung?.wareneingang;
  if (!w) return eintrag;
  const soll = bestellmenge?.menge, einheit = bestellmenge?.einheit;
  let klaerung = null;
  if (!Number.isFinite(soll) || !(soll > 0) || !['paket', 'stueck', 'muster', 'lfm', 'm2'].includes(einheit)) klaerung = 'Aktuelle Bestellmenge nicht belegt. Zuerst die Position klären.';
  else if (einheit !== w.einheit) klaerung = 'Bestelleinheit geändert. Den erfassten Wareneingang zuerst klären; Mengen werden nicht umgerechnet.';
  else if (w.angekommen > soll) klaerung = 'Bestellmenge kleiner als der erfasste Wareneingang. Die tatsächlichen Mengen zuerst klären.';
  const beschaffung = { ...eintrag.beschaffung, klaerung, aktuelleBestellmenge: bestellmenge || null,
    wareneingang: klaerung ? w : { ...w, soll } };
  const offen = klaerung || (soll > w.verwendbar);
  return { ...eintrag, beschaffung, status: offen && ['geliefert', 'raus', 'erledigt'].includes(eintrag.status) ? 'bestellt' : eintrag.status };
}

export function restmenge(eintrag) {
  if (eintrag?.beschaffung?.klaerung) return null;
  const w = eintrag?.beschaffung?.wareneingang;
  return w && Number.isFinite(w.soll) && Number.isFinite(w.verwendbar)
    ? Math.max(0, Math.round((w.soll - w.verwendbar) * 1e6) / 1e6) : null;
}

export function lieferterminFaellig(eintrag, heute) {
  const termin = eintrag?.beschaffung?.liefertermin;
  return eintrag?.status === 'bestellt' && typeof termin === 'string' && termin < heute;
}

/** Eine bestaetigte Fehlmenge darf nicht durch einen alten Sammelknopf verschwinden. */
export function darfWeiter(eintrag, status) {
  return !['geliefert', 'raus', 'erledigt'].includes(status) || (!eintrag?.beschaffung?.klaerung && !(restmenge(eintrag) > 0));
}

export function uebernahmeText(eintrag) {
  const u = eintrag?.uebernahme;
  return u?.person ? `Übernommen von ${u.person}` : '';
}
export function einheitText(einheit) {
  return ({ paket: 'Pakete', stueck: 'Stück', muster: 'Muster', lfm: 'lfm', m2: 'm²' })[einheit] || 'Einheiten';
}

const datumText = iso => String(iso || '').slice(0, 10).split('-').reverse().join('.');

/** Pruefpunkte einer Auftragsbestaetigung: jeder wird von einem Menschen mit "stimmt" oder "weicht ab" beantwortet. */
export const AB_PRUEFPUNKTE = Object.freeze({ menge: 'Menge', masse: 'Maße', lieferweg: 'Lieferweg', zuschlaege: 'Zuschläge' });
/** Ohne AB nach so vielen Werktagen (Mo-Fr) beim Lieferanten nachfassen (Inhaber 06.11.2026). */
export const NACHFASSEN_WERKTAGE = 2;

/**
 * Werktage (Mo-Fr, Kalendertage in Berlin) nach dem Tag von `von` bis einschliesslich heute.
 * Bestellt Donnerstag abends -> Freitag 1, Montag 2. Feiertage zaehlen mit (bewusst einfach).
 */
export function werktageSeit(von, jetzt = new Date()) {
  const tag = d => { const x = new Date(d); return Number.isNaN(x.getTime()) ? null : Date.parse(`${BERLIN.format(x)}T00:00:00Z`); };
  const a = tag(von), b = tag(jetzt);
  if (a === null || b === null || b < a) return null;
  let n = 0;
  for (let t = a + 864e5; t <= b; t += 864e5) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n += 1; }
  return n;
}
const BERLIN = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' });

/**
 * Lieferantenstand einer Warenposition, abgeleitet aus dem einen Auftragsfluss - kein zweiter
 * Status: "Angefragt" ist ein Vermerk an einer noch offenen Position (beschaffung.anfrage),
 * "AB bestaetigt" ein Vermerk an einer bestellten (beschaffung.ab). Ein Liefertermin ohne
 * AB-Vermerk (vor dem 06.11.2026 erfasst) gilt als bestaetigt, damit Altbestaende nicht mahnen.
 * Fuer Muster, Eigenleistung und Lagerware ruft der Aufrufer das nicht auf.
 *
 * @returns {{stufe:'offen'|'angefragt'|'bestellt'|'ab'|'geliefert'|'raus'|'erledigt', text:string, ton:''|'warn'|'crit',
 *   abFehlt:boolean, nachfassen:boolean, verspaetet:boolean, abweichungen:string[], werktage:number|null}}
 */
export function lieferantenStand(eintrag, { jetzt = new Date() } = {}) {
  const b = eintrag?.beschaffung || {};
  const s = eintrag?.status || null;
  const leer = { text: '', ton: '', abFehlt: false, nachfassen: false, verspaetet: false, abweichungen: [], werktage: null };
  if (!s) {
    if (!b.anfrage) return { ...leer, stufe: 'offen' };
    const werktage = werktageSeit(b.anfrage.am, jetzt);
    const nachfassen = werktage !== null && werktage >= NACHFASSEN_WERKTAGE;
    return { ...leer, stufe: 'angefragt', werktage, nachfassen, ton: nachfassen ? 'warn' : '',
      text: `Lieferant angefragt am ${datumText(b.anfrage.am)}${b.anfrage.lieferant ? ` · ${b.anfrage.lieferant}` : ''}${nachfassen ? ' · Antwort fehlt, nachfassen' : ''}` };
  }
  if (s !== 'bestellt') return { ...leer, stufe: s };
  const verspaetet = lieferterminFaellig(eintrag, BERLIN.format(jetzt));
  if (b.ab) {
    const abweichungen = Object.keys(AB_PRUEFPUNKTE).filter(k => b.ab.pruefung?.[k] === 'abweichung');
    const teile = ['AB bestätigt'];
    if (abweichungen.length) teile.push(`weicht ab: ${abweichungen.map(k => AB_PRUEFPUNKTE[k]).join(', ')}`);
    if (verspaetet) teile.push('Liefertermin überschritten – nachhaken');
    return { ...leer, stufe: 'ab', verspaetet, abweichungen, ton: verspaetet ? 'crit' : abweichungen.length ? 'warn' : '', text: teile.join(' · ') };
  }
  if (b.liefertermin) return { ...leer, stufe: 'ab', verspaetet, ton: verspaetet ? 'crit' : '', text: verspaetet ? 'Liefertermin überschritten – nachhaken' : 'Liefertermin bestätigt (ohne AB-Nummer)' };
  const werktage = werktageSeit(eintrag.bestelltAm, jetzt);
  const nachfassen = werktage !== null && werktage >= NACHFASSEN_WERKTAGE;
  return { ...leer, stufe: 'bestellt', abFehlt: true, werktage, nachfassen, ton: 'warn',
    text: nachfassen ? `AB fehlt seit ${werktage} Werktagen – beim Lieferanten nachfassen` : 'AB fehlt' };
}

export function beschaffungText(eintrag) {
  const b = eintrag?.beschaffung;
  if (!b) return '';
  const teile = [];
  if (b.klaerung) teile.push(b.klaerung);
  if (b.ab?.nummer && eintrag?.status) teile.push(`AB-Nr. ${b.ab.nummer}${b.ab.preis ? ` · Preis ${b.ab.preis}` : ''}`);
  if (b.ab?.abweichung && eintrag?.status) teile.push(`Abweichung: ${b.ab.abweichung}`);
  if (b.bestellung?.lieferwegOffen && eintrag?.status) teile.push(`Lieferweg offen: ${b.bestellung.lieferwegOffen}`);
  if (b.liefertermin) teile.push(`Bestätigter Liefertermin ${b.liefertermin.split('-').reverse().join('.')}`);
  const w = b.wareneingang;
  if (w) {
    const n = v => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 6 });
    teile.push(`${n(w.verwendbar)} von ${n(w.soll)} ${einheitText(w.einheit)} verwendbar`);
    if (restmenge(eintrag) > 0) teile.push(`${n(restmenge(eintrag))} ${einheitText(w.einheit)} fehlen`);
    if (w.angekommen > w.verwendbar) teile.push(`${n(w.angekommen - w.verwendbar)} ${einheitText(w.einheit)} nicht verwendbar`);
    if (b.grund) teile.push(b.grund);
  }
  if (b.bestellung?.notiz && eintrag?.status === 'bestellt') teile.push(b.bestellung.notiz);
  return teile.join(' · ');
}
