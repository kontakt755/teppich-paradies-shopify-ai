/**
 * Aufgabenwaechter: prueft Aufgaben gegen den tatsaechlichen Zustand.
 *
 * Die wichtigste Regel aus dem Auftrag: eine Aufgabe gilt nicht deshalb als
 * erledigt, weil jemand etwas geaendert hat, sondern erst, wenn ihr
 * Erfolgskriterium nachgemessen wurde. Diese Datei misst - das Setzen des
 * Status uebernimmt haltePruefungFest() nach denselben Regeln.
 *
 * Geprueft wird nur, was eine maschinenlesbare Vorschrift traegt (`pruefung`).
 * Alles andere bleibt Menschenarbeit; das ist kein Mangel, sondern die
 * Voraussetzung dafuer, dass einer Prüfung zu trauen ist.
 */

/** Was der Waechter kann. Bewusst wenig - lieber wenige verlaessliche Pruefungen. */
export const PRUEFARTEN = Object.freeze({
  'shop-preis': 'Preis auf der Produktseite',
  'shop-text': 'Text auf einer Seite vorhanden',
  'shop-erreichbar': 'Seite erreichbar',
});

function zahl(v) {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Eine Aufgabe messen. Gibt immer ein Ergebnis zurueck - auch "weiss nicht". */
export async function pruefeAufgabe(aufgabe, { holen, basis = 'https://www.teppich-paradies.net' } = {}) {
  const v = aufgabe?.pruefung;
  if (!v || !v.art) {
    return { erfuellt: null, methode: 'keine Prüfvorschrift', begruendung: 'Diese Aufgabe trägt keine maschinell prüfbare Vorgabe.' };
  }
  const wurzel = String(basis).replace(/\/$/, '');

  try {
    if (v.art === 'shop-preis') {
      if (!v.handle || v.soll === undefined || v.soll === null) {
        return { erfuellt: null, methode: PRUEFARTEN[v.art], begruendung: 'Vorschrift unvollständig (handle oder soll fehlt).' };
      }
      const antwort = await holen(`${wurzel}/products/${v.handle}.js`);
      if (!antwort || antwort.status >= 400) {
        return { erfuellt: null, methode: PRUEFARTEN[v.art], begruendung: `Produktseite nicht lesbar (HTTP ${antwort?.status ?? 0}).` };
      }
      const daten = JSON.parse(await antwort.text());
      const variante = v.variantenId
        ? (daten.variants ?? []).find(x => String(x.id) === String(v.variantenId))
        : (daten.variants ?? [])[0];
      if (!variante) return { erfuellt: null, methode: PRUEFARTEN[v.art], begruendung: 'Variante nicht gefunden.' };
      const ist = Number(variante.price) / 100;
      const soll = zahl(v.soll);
      return {
        erfuellt: soll !== null && Math.abs(ist - soll) < 0.005,
        methode: PRUEFARTEN[v.art],
        soll: soll === null ? String(v.soll) : soll.toFixed(2),
        ist: ist.toFixed(2),
        begruendung: `Preis im Shop gelesen: ${ist.toFixed(2)} €, erwartet ${soll?.toFixed(2) ?? '?'} €.`,
      };
    }

    if (v.art === 'shop-text' || v.art === 'shop-erreichbar') {
      const pfad = v.pfad || v.url || '/';
      const antwort = await holen(pfad.startsWith('http') ? pfad : `${wurzel}${pfad}`);
      const status = antwort?.status ?? 0;
      if (v.art === 'shop-erreichbar') {
        return {
          erfuellt: status >= 200 && status < 400,
          methode: PRUEFARTEN[v.art],
          soll: '200', ist: String(status),
          begruendung: `Seite ${pfad} antwortet mit ${status}.`,
        };
      }
      if (status >= 400) return { erfuellt: null, methode: PRUEFARTEN[v.art], begruendung: `Seite nicht lesbar (HTTP ${status}).` };
      const text = await antwort.text();
      const treffer = text.includes(v.erwartet);
      return {
        erfuellt: treffer,
        methode: PRUEFARTEN[v.art],
        soll: v.erwartet, ist: treffer ? 'gefunden' : 'nicht gefunden',
        begruendung: `„${v.erwartet}" ${treffer ? 'steht' : 'steht nicht'} auf ${pfad}.`,
      };
    }

    return { erfuellt: null, methode: 'unbekannte Prüfart', begruendung: `Prüfart „${v.art}" kennt der Wächter nicht.` };
  } catch (e) {
    // Ein Fehler ist kein "nicht erfuellt" - er ist "weiss nicht".
    return { erfuellt: null, methode: PRUEFARTEN[v.art] || 'Prüfung', begruendung: `Prüfung nicht möglich: ${e?.message || e}` };
  }
}

/** Welche Aufgaben kommen ueberhaupt in Frage? */
export function pruefbar(eintraege) {
  return (eintraege ?? []).filter(e =>
    e.typ === 'TASK' &&
    e.pruefung?.art &&
    ['AUTO', 'SEMI_AUTO'].includes(e.pruefTyp) &&
    ['INBOX', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'DONE'].includes(e.status));
}
