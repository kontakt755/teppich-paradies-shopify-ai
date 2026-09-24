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
export function kundenIndex(modell) {
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
  return [...map.values()].map(summarisieren);
}

function summarisieren(eintrag) {
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
  };
}

function feldTreffer(felder, q) {
  return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(q));
}

/** Sucht waehrend des Tippens - mind. 2 Zeichen, sonst keine Treffer (kein "alle Kunden"-Dump). */
export function sucheKunden(modell, suchtext) {
  const q = String(suchtext ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const alle = kundenIndex(modell);
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

export function kundenListenEintrag(k) {
  return {
    key: k.key,
    name: k.kunde.name,
    email: k.kunde.email,
    telefon: k.kunde.telefon,
    letzteBestellung: k.letzteBestellungDatum,
    letzteBestellungName: k.letzteBestellungName,
    anzahlBestellungen: k.anzahlBestellungen,
    gesamtumsatz: k.gesamtumsatz,
    waehrung: k.waehrung,
    nurTestbestellungen: k.nurTestbestellungen,
  };
}

export function findeKunde(modell, key) {
  return kundenIndex(modell).find(k => k.key === key) || null;
}
