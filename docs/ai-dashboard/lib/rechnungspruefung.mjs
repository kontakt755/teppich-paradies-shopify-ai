/**
 * Rechnungspruefer im Control Center (Probebetrieb, Benutzer 24.11.2026, Werkbank w-414): aus den Ergebnissen
 * von operations/scripts/rechnungen-pruefen.mjs die roten Zeilen fuer "Heute" und die Ansicht Laden, die
 * Wochenzeile "geprueft / passt / offen" als Lebenszeichen und die Texte (Mail an verkauf@, Entwurf fuer den
 * Lieferanten zum Kopieren). Reine Funktionen ohne DOM, ohne Dateien - Server, Browser und Tests nutzen sie gleich.
 *
 * Einkaufspreise sieht nur der Inhaber (wie lib/einkauf-ueber-verkauf.mjs): ohne `mitBetraegen` nennt eine
 * Abweichung nur Position und Art - das reicht, um Rechnung und AB nebeneinanderzulegen.
 */
import { tageSeit, alterText, tonNachAlter, FRISTEN } from './todos.mjs';

const TAG_MS = 86400000;
/** Der Pruefer laeuft freitags; nach so vielen Tagen ohne Lauf stimmt etwas nicht. */
export const LEBENSZEICHEN_TAGE = 8;
/** Nicht pruefbare Rechnungen stehen so lange zum Ansehen da. */
export const ANSEHEN_TAGE = 14;

const eur = n => `${Number(n).toFixed(2).replace('.', ',')} €`;
const zahl = n => String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');
const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
const summe = e => Math.round((e.abweichungen || []).reduce((s, a) => s + (Number(a.differenz) || 0), 0) * 100) / 100;

/** Eine Abweichung in einem Satz; ohne Betraege nur, was abweicht. */
export function abweichungText(a, { mitBetraegen = false } = {}) {
  const p = `„${a.position}“`;
  const plus = mitBetraegen && a.differenz > 0 ? ` – ${eur(a.differenz)} mehr` : '';
  if (a.art === 'preis') return mitBetraegen ? `${p}: ${eur(a.ab)} laut AB, ${eur(a.rechnung)} auf der Rechnung (je Einheit)${plus}` : `${p}: Preis höher als in der AB`;
  if (a.art === 'menge') return mitBetraegen ? `${p}: ${zahl(a.rechnung)} berechnet, ${zahl(a.ab)} bestätigt${plus}` : `${p}: mehr berechnet als in der AB bestätigt`;
  if (a.art === 'zuschlag') return mitBetraegen ? `${p} steht nicht in der AB${plus}` : `${p} steht nicht in der AB`;
  if (a.art === 'prozent') return mitBetraegen ? `${p}: ${zahl(a.rechnung)} % statt ${zahl(a.ab)} % laut AB${plus}` : `${p}: anderer Prozentsatz als in der AB`;
  if (a.art === 'rabatt') return mitBetraegen ? `Rabatt ${p}: ${zahl(a.ab)} % laut AB, auf der Rechnung ${a.rechnung ? `${zahl(a.rechnung)} %` : 'keiner'}${plus}` : `Rabatt ${p} aus der AB fehlt oder ist kleiner`;
  return `${p} weicht ab`;
}

/** Ohne Einkaufspreise: fuer alle ausser dem Inhaber und fuer die Ansicht Laden. */
export function ohneBetraege({ brutto, abweichungen = [], ...rest }) {
  return { ...rest, abweichungen: abweichungen.map(({ position, art }) => ({ position, art })) };
}

const titel = e => `Rechnung${e.nummer ? ` ${e.nummer}` : ''} von ${e.anbieter || 'Lieferant'}`;

/**
 * Stand fuer die Anzeige.
 * @param {{rechnungen?: object, laeufe?: object[]}} ablage  rechnungspruefung/ergebnisse.json
 * @param {{jetzt?: Date, gesehen?: object, mitBetraegen?: boolean}} o  gesehen: Laden-Ablage ("rechnung:<schluessel>")
 */
export function rechnungsStand({ rechnungen = {}, laeufe = [] } = {}, { jetzt = new Date(), gesehen = {}, mitBetraegen = false } = {}) {
  const alle = Object.values(rechnungen).sort((a, b) => String(a.eingang).localeCompare(String(b.eingang)));
  const offen = e => e.ergebnis !== 'passt' && !gesehen[`rechnung:${e.schluessel}`];
  const woche = alle.filter(e => Date.parse(e.eingang) >= jetzt.getTime() - 7 * TAG_MS);
  const zeile = e => (mitBetraegen ? { ...e, entwurf: lieferantEntwurf(e) } : ohneBetraege(e));
  return {
    letzterLauf: laeufe.at(-1)?.am || null,
    woche: { geprueft: woche.length, passt: woche.filter(e => e.ergebnis === 'passt').length, offen: woche.filter(offen).length },
    abweichungen: alle.filter(e => e.ergebnis === 'abweichung' && offen(e)).map(zeile),
    nichtPruefbar: alle.filter(e => e.ergebnis === 'nicht_pruefbar' && offen(e) && Date.parse(e.eingang) >= jetzt.getTime() - ANSEHEN_TAGE * TAG_MS).map(ohneBetraege),
  };
}

/** "Rechnungsprüfung, letzte 7 Tage: 6 geprüft · 4 passt · 2 offen" - und ob der Lauf ausbleibt. */
export function wochenZeile(stand, { jetzt = new Date() } = {}) {
  if (!stand?.letzterLauf) return { text: 'Rechnungsprüfung: noch kein Lauf (Probebetrieb, läuft freitags mit dem Rechnungsarchiv).', ton: '' };
  const w = stand.woche;
  const tage = tageSeit(stand.letzterLauf, jetzt);
  const alt = tage > LEBENSZEICHEN_TAGE;
  return {
    text: `Rechnungsprüfung, letzte 7 Tage: ${w.geprueft} geprüft · ${w.passt} passt · ${w.offen} offen${alt ? ` – letzter Lauf ${alterText(tage)} her` : ''}`,
    ton: alt ? 'warn' : w.offen ? 'warn' : '',
  };
}

/**
 * Zeilen fuer "Zu tun" in der Ansicht Laden: je Rechnung mit Abweichung eine rote Zeile (`rot`) mit "Erledigt".
 * Die Farbstufe der Plakette und "Liegt zu lange" folgen der Frist einer Laden-Aufgabe, nicht dem Rot der Zeile.
 */
export function rechnungLadenZeilen(stand, { jetzt = new Date() } = {}) {
  return (stand?.abweichungen || []).map((e) => {
    const alterTage = tageSeit(e.eingang, jetzt);
    return {
      schluessel: `rechnung:${e.schluessel}`, art: 'Rechnung prüfen', von: e.anbieter || null, seit: e.eingang, alterTage, alter: alterText(alterTage),
      ton: tonNachAlter(alterTage, ...FRISTEN.laden_aufgabe), rot: true,
      text: `${titel(e)}: ${mehrzahl(e.abweichungen.length, 'Abweichung', 'Abweichungen')} zur Auftragsbestätigung`,
      hinweis: `${e.abweichungen.map(a => abweichungText(a)).join(' · ')}. Rechnung und AB nebeneinanderlegen; stimmt die Rechnung nicht, Lieferant bzw. Vertreter anrufen.`,
      erledigen: true,
    };
  });
}

/** To-dos fuer "Heute": rot je Abweichung, eine ruhige Sammelzeile fuer nicht pruefbare, Warnung bei ausbleibendem Lauf. */
export function rechnungTodos(stand, { jetzt = new Date(), href = '#/laden' } = {}) {
  if (!stand) return [];
  const todos = (stand.abweichungen || []).map(e => ({
    id: `rechnung-${e.schluessel}`, art: 'rechnung_abweichung', bereich: 'laden', ton: 'crit', zuerst: true, alterTage: tageSeit(e.eingang, jetzt),
    titel: `${titel(e)} weicht von der AB ab`,
    kontext: `${e.abweichungen.map(a => abweichungText(a, { mitBetraegen: Boolean(e.entwurf) })).join(' · ')}${e.entwurf && summe(e) > 0 ? ` · zusammen ${eur(summe(e))} zu viel` : ''}`,
    // Der Entwurf kommt nur beim Inhaber an; die anderen sehen die Zeile in der Ansicht Laden.
    knopf: e.entwurf ? { text: 'Text für den Lieferanten', vertreter: `rechnung-${e.schluessel}` } : { text: 'Ansehen', href },
  }));
  const n = (stand.nichtPruefbar || []).length;
  if (n) {
    todos.push({
      id: 'rechnungen-nicht-pruefbar', art: 'rechnung_nicht_pruefbar', bereich: 'laden', ton: '',
      alterTage: Math.max(...stand.nichtPruefbar.map(e => tageSeit(e.eingang, jetzt) ?? 0)),
      titel: `${mehrzahl(n, 'Rechnung', 'Rechnungen')} nicht automatisch prüfbar – bitte ansehen`,
      kontext: stand.nichtPruefbar.slice(0, 3).map(e => `${e.anbieter}: ${e.grund}`).join(' · ') + (n > 3 ? ' …' : ''),
      knopf: { text: 'Ansehen', href },
    });
  }
  const w = wochenZeile(stand, { jetzt });
  if (stand.letzterLauf && tageSeit(stand.letzterLauf, jetzt) > LEBENSZEICHEN_TAGE) {
    todos.push({ id: 'rechnungen-lauf', art: 'rechnung_lauf', bereich: 'laden', ton: 'warn', alterTage: tageSeit(stand.letzterLauf, jetzt), titel: 'Rechnungsprüfung läuft nicht', kontext: `${w.text}. Läuft freitags mit dem Rechnungsarchiv (Dienst Sammeldatei).`, knopf: { text: 'Ansehen', href } });
  }
  return todos;
}

/** Mail an verkauf@ (nur mit eingeschaltetem Schalter, siehe operations/scripts/rechnungen-pruefen.mjs). Ohne Betraege. */
export function rechnungMail(e) {
  return {
    betreff: `Rechnung prüfen: ${titel(e)} weicht von der AB ab`,
    text: [
      'Hallo,', '',
      `die automatische Prüfung hat bei der ${titel(e)} Abweichungen zur Auftragsbestätigung gefunden:`, '',
      ...e.abweichungen.map(a => `- ${abweichungText(a)}`), '',
      'Bitte Rechnung und AB nebeneinanderlegen. Stimmt die Rechnung nicht, den Lieferanten bzw. Vertreter anrufen.',
      'Erledigt wird die Zeile im Control Center unter Laden („Erledigt“).', '',
      '(Automatische Nachricht aus dem Probebetrieb der Rechnungsprüfung)',
    ].join('\n'),
  };
}

/** Entwurf an den Lieferanten bzw. Vertreter zum Kopieren - gesendet wird von Hand, nie automatisch. */
export function lieferantEntwurf(e) {
  const s = summe(e);
  return {
    an: null,
    betreff: `Ihre Rechnung${e.nummer ? ` ${e.nummer}` : ''}: Abweichung zur Auftragsbestätigung`,
    text: [
      'Guten Tag,', '',
      `in Ihrer Rechnung${e.nummer ? ` ${e.nummer}` : ''} weichen folgende Positionen von Ihrer Auftragsbestätigung ab:`, '',
      ...e.abweichungen.map(a => `- ${abweichungText(a, { mitBetraegen: true })}`), '',
      `Können Sie das bitte prüfen und uns eine korrigierte Rechnung oder eine Gutschrift${s > 0 ? ` über ${eur(s)} netto` : ''} schicken?`, '',
      'Vielen Dank und freundliche Grüße',
      'Teppich Paradies Oranienburg',
    ].join('\n'),
  };
}
