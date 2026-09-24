/**
 * Kundensuche fuer das Control Center - Team sucht am Telefon nach einem
 * Kunden ueber Name, E-Mail, Telefonnummer, Bestellnummer, Strasse/Ort oder
 * PLZ und sieht sofort alle Bestellungen dieses Kunden.
 *
 * Reine Aufbereitung des bereits vorhandenen Bestellmodells aus
 * operations/lib/bestelluebersicht.mjs (aufbereiten()) - keine eigene
 * Shopify-Abfrage, keine eigene Kundendatenbank. Testbestellungen bleiben
 * im Index (Telefonanrufe koennen auch dazu vorkommen), tragen aber je
 * Bestellung das Flag `testbestellung` und zaehlen nie in Anzahl/Umsatz.
 *
 * Datenschutz: diese Datei liest/verarbeitet nur, was ohnehin lokal unter
 * $TP_PRIVAT_DIR liegt (siehe operations/lib/bestelluebersicht.mjs). Nichts
 * davon darf ins Repository, in Tests (nur erfundene Fixtures) oder in Logs.
 */

import { kundenFortschritt, fortschritt } from './bestellliste.mjs';

function leer(v) {
  return v === undefined || v === null || String(v).trim() === '' || v === '–';
}

/** Gruppierschluessel: bevorzugt E-Mail, sonst Telefon, sonst Name. */
export function kundenSchluessel(auftrag) {
  const k = auftrag?.details?.kunde || {};
  if (!leer(k.email)) return `email:${String(k.email).trim().toLowerCase()}`;
  if (!leer(k.telefon)) return `tel:${String(k.telefon).replace(/[^0-9+]/g, '')}`;
  return `name:${String(k.name || 'unbekannt').trim().toLowerCase()}`;
}

function betragVon(auftrag) {
  const b = auftrag?.details?.summen?.gesamt?.betrag;
  return typeof b === 'number' && Number.isFinite(b) ? b : 0;
}

/** Baut je Kunde einen Eintrag mit allen zugehoerigen Auftraegen. */
export function kundenIndex(modell, { statusAlle = {} } = {}) {
  const map = new Map();
  const alle = [...(modell?.auftraege ?? []), ...(modell?.testauftraege ?? [])];
  for (const a of alle) {
    const key = kundenSchluessel(a);
    if (!map.has(key)) {
      map.set(key, {
        key,
        kunde: a.details?.kunde ?? { name: '–', email: '–', telefon: '–' },
        lieferadresse: a.details?.lieferadresse ?? null,
        rechnungsadresse: a.details?.rechnungsadresse ?? null,
        auftraege: [],
      });
    }
    map.get(key).auftraege.push(a);
  }
  return [...map.values()].map(e => summarisieren(e, statusAlle));
}

function summarisieren(eintrag, statusAlle = {}) {
  const echte = eintrag.auftraege.filter(a => !a.testbestellung);
  const sortiert = [...eintrag.auftraege].sort((a, b) => String(b.datum ?? '').localeCompare(String(a.datum ?? '')));
  const letzte = echte.length ? echte.slice().sort((a, b) => String(b.datum ?? '').localeCompare(String(a.datum ?? '')))[0] : sortiert[0];
  return {
    ...eintrag,
    auftraege: sortiert,
    anzahlBestellungen: echte.length,
    gesamtumsatz: Math.round(echte.reduce((s, a) => s + betragVon(a), 0) * 100) / 100,
    waehrung: echte.find(a => a.details?.summen?.gesamt?.waehrung)?.details?.summen?.gesamt?.waehrung || 'EUR',
    letzteBestellungDatum: letzte?.datum ?? null,
    letzteBestellungName: letzte?.name ?? null,
    nurTestbestellungen: echte.length === 0 && eintrag.auftraege.length > 0,
    // Fortschritt ueber alle echten Bestellungen dieses Kunden - "welcher
    // Kunde ist fertig" auf einen Blick (Inhabervorgabe).
    fortschritt: kundenFortschritt(echte, statusAlle),
  };
}

function feldTreffer(felder, q) {
  return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(q));
}

/** Sucht waehrend des Tippens - mind. 2 Zeichen, sonst keine Treffer (kein "alle Kunden"-Dump). */
export function sucheKunden(modell, suchtext, { statusAlle = {} } = {}) {
  const q = String(suchtext ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const alle = kundenIndex(modell, { statusAlle });
  return alle
    .filter(k => {
      const felder = [
        k.kunde.name, k.kunde.email, k.kunde.telefon,
        k.lieferadresse?.strasse, k.lieferadresse?.ort, k.lieferadresse?.plz,
        k.rechnungsadresse?.strasse, k.rechnungsadresse?.ort, k.rechnungsadresse?.plz,
        ...k.auftraege.map(a => a.name),
      ];
      return feldTreffer(felder, q);
    })
    .sort((a, b) => String(b.letzteBestellungDatum ?? '').localeCompare(String(a.letzteBestellungDatum ?? '')));
}

function aeltesteOffeneDatum(k, statusAlle) {
  const offene = k.auftraege.filter(a => !a.testbestellung);
  const kandidaten = offene.filter(a => {
    const f = fortschritt(a, statusAlle);
    return f.stufe !== 'erledigt' && f.gesamt > 0;
  });
  const quelle = kandidaten.length ? kandidaten : offene;
  if (!quelle.length) return null;
  return quelle.reduce((min, a) => (!min || String(a.datum) < String(min)) ? a.datum : min, null);
}

export function kundenListenEintrag(k, { statusAlle = {} } = {}) {
  return {
    key: k.key,
    name: k.kunde.name,
    email: k.kunde.email,
    telefon: k.kunde.telefon,
    ort: k.lieferadresse?.ort && k.lieferadresse.ort !== '–' ? k.lieferadresse.ort : (k.rechnungsadresse?.ort && k.rechnungsadresse.ort !== '–' ? k.rechnungsadresse.ort : null),
    letzteBestellung: k.letzteBestellungDatum,
    letzteBestellungName: k.letzteBestellungName,
    anzahlBestellungen: k.anzahlBestellungen,
    gesamtumsatz: k.gesamtumsatz,
    waehrung: k.waehrung,
    nurTestbestellungen: k.nurTestbestellungen,
    fortschritt: k.fortschritt,
    aeltesteOffeneBestellungDatum: aeltesteOffeneDatum(k, statusAlle),
    beratungOffen: k.auftraege.some(a => !a.testbestellung && a.checks?.beratung === 'Ja'),
    muster: k.auftraege.some(a => !a.testbestellung && (a.positionen || []).some(p => p.istMuster)),
  };
}

export function findeKunde(modell, key, { statusAlle = {} } = {}) {
  return kundenIndex(modell, { statusAlle }).find(k => k.key === key) || null;
}

/**
 * Alle Kunden - fuer die Startansicht "Kunden" (Inhabervorgabe: die Liste ist
 * beim Oeffnen sofort da, das Suchfeld filtert nur zusaetzlich). Sortierung:
 * nicht fertige zuerst, darin die aelteste offene Bestellung zuerst; fertige
 * Kunden danach, neueste zuerst.
 *
 * Filter: 'in_arbeit' (Standard - mind. eine offene, nicht erledigte
 * Bestellung), 'fertig' (alle Bestellungen erledigt), 'rueckruf_offen'
 * (Beratung gewuenscht in mind. einer Bestellung), 'muster', 'test' (nur
 * Kunden, deren Bestellungen ausschliesslich Testbestellungen sind), '' = alle.
 */
export function alleKunden(modell, { statusAlle = {}, filter = '' } = {}) {
  const basis = kundenIndex(modell, { statusAlle }).filter(k => !k.nurTestbestellungen || filter === 'test');
  let liste = basis;
  if (filter === 'in_arbeit') liste = basis.filter(k => !k.fortschritt.fertig);
  else if (filter === 'fertig') liste = basis.filter(k => k.fortschritt.fertig && k.fortschritt.gesamt > 0);
  else if (filter === 'rueckruf_offen') liste = basis.filter(k => k.auftraege.some(a => !a.testbestellung && a.checks?.beratung === 'Ja'));
  else if (filter === 'muster') liste = basis.filter(k => k.auftraege.some(a => !a.testbestellung && (a.positionen || []).some(p => p.istMuster)));
  else if (filter === 'test') liste = kundenIndex(modell, { statusAlle }).filter(k => k.nurTestbestellungen);
  return liste
    .map(k => ({ k, eintrag: kundenListenEintrag(k, { statusAlle }) }))
    .sort((a, b) => {
      const fa = a.k.fortschritt.fertig, fb = b.k.fortschritt.fertig;
      if (fa !== fb) return fa ? 1 : -1;
      if (!fa) return String(a.eintrag.aeltesteOffeneBestellungDatum ?? '9999').localeCompare(String(b.eintrag.aeltesteOffeneBestellungDatum ?? '9999'));
      return String(b.eintrag.letzteBestellung ?? '').localeCompare(String(a.eintrag.letzteBestellung ?? ''));
    })
    .map(x => x.eintrag);
}
