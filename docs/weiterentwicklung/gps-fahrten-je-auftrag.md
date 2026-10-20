# GPS-Fahrten je Auftrag (PAJ-Portal → Auftrags-App → Control Center)

Stand 19.10.2026 · Aufgabe #1451 · reiner Plan, noch kein Code, kein Zugang genutzt.

Ziel des Inhabers: Auftraege spaeter besser kalkulieren — je Auftrag Fahrtzeit,
Kilometer, Leerfahrten und Spritkosten.

## 1. Was das PAJ-Portal hergibt

### API (belegt)

PAJ betreibt hinter dem Finder-Portal (`v2.finder-portal.com`) eine REST-API
**`https://connect.paj-gps.de/api/v1/…`** („PAJ Portal APIs 1.0.1“, OpenAPI).
Eine oeffentliche Entwicklerdoku von PAJ gibt es nicht; belegt ist die API ueber
die offizielle Home-Assistant-Integration `paj_gps` und deren Bibliothek
`pajgps-api` 0.4.1 (PyPI, liefert die OpenAPI-Datei `api-docs.json` mit).

**Anmeldung:** `POST /api/v1/login` mit E-Mail + Passwort des Portalkontos →
Bearer-Token, Verlaengerung per `POST /api/v1/updatetoken`. Keine API-Keys,
kein OAuth — die API arbeitet mit dem Portal-Login. Deshalb: **eigenes
Unterkonto/Leserecht nur fuer die Auswertung**, Passwort nur in `.env.local`
bzw. Schluesselbund, nie im Repo, Chat oder Issue.

**Fuer uns relevante Endpunkte (nur lesend):**

| Zweck | Endpunkt | Parameter |
|---|---|---|
| Fahrzeuge/Tracker | `GET /device` | – |
| Rohpunkte | `GET /trackerdata/{DeviceID}/date_range` | `dateStart`, `dateEnd` (Unix), `gps` 0/1 |
| Fahrten und Standzeiten | `POST /customer/dashboard/triprest_data` | `deviceId`, `startDate`, `endDate` |
| Strecke im Zeitraum | `POST /customer/dashboard/dataDistance` | `deviceId`, `startDate`, `endDate`, `distanceUnit=km` |
| Fahrtenbuch-Routen | `GET /logbook/getAllRoutes/{DeviceID}` (+ `generateSingleDeviceRoutes`, `generateSingleDeviceAddress`) | – |
| Fahrten-PDF | `POST /customer/dashboard/downloadpdf` | – |

`triprest_data` ist der Kern: fertige Fahrt-/Pausenabschnitte mit Zeiten, ohne
dass wir aus Rohpunkten selbst Fahrten schneiden muessen. `trackerdata` bleibt
Rueckfallweg und fuer Adressabgleich per Koordinate.

### Export ohne API

Das Portal bzw. die App bietet laut Hersteller das Fahrtenbuch als
**PDF-Export** (Fahrten gespeichert, kategorisiert, exportierbar). Einen
CSV-/Excel-Export konnten wir nicht belegen — im Portal pruefen, sobald Zugang
da ist. PDF eignet sich nicht fuer die Auswertung → API ist der Weg.

### Grenzen / offen

- Keine dokumentierten Rate-Limits; Home Assistant pollt im ~30-s-Takt ohne
  Probleme. Wir brauchen nur **einen naechtlichen Abruf je Fahrzeug** (Vortag).
- **Speicherdauer der Historie unbekannt** (tarifabhaengig?) → vor Start
  pruefen; wir sichern Fahrten taeglich lokal, dann ist es egal.
- Fahrtenbuch-Funktion ist bei PAJ teils ein Zusatz-Abo → klaeren, ob gebucht.
  `triprest_data` ist davon nach Doku unabhaengig.
- Inoffizielle Doku: Endpunkte koennen sich aendern; Abruf kapseln, bei
  Fehler Stoerung im Control Center statt falscher Zahlen.

## 2. Was im Repo vorhanden ist

- Die **Auftrags-App** (Monteure) ist eine Google-Apps-Script-App in eigenem
  Repo; hier gibt es nur die Anbindung `scripts/laden-zahlen.mjs`
  (`<App-URL>?ansicht=zahlen&s=<Schluessel>`, serverseitig, 5 min Cache,
  nur Summen, nie Namen/Adressen) und die Kacheln `MONTAGE_KACHELN` in
  `docs/ai-dashboard/ansichten/heute/laden.mjs`.
- Kein Einsatz-Datenmodell, kein Fahrzeug, nichts zu GPS/km/Sprit im Repo.
- Muster fuer eine neue Quelle: serverseitiger Abruf wie `laden-zahlen.mjs`,
  private Ablage unter `$TP_PRIVAT_DIR`, Anzeige unter `ansichten/insights*`.

## 3. Zuordnung Fahrt → Auftrag

Datenquellen: Fahrten (PAJ) + Einsaetze (Auftrags-App: Adresse, Termin,
Monteur/Team, Fahrzeug, falls gefuehrt Beginn/Fertig-Zeitstempel).

1. **Geocodierung** der Einsatzadressen einmalig je Auftrag (in der
   Apps-Script-App per `Maps.newGeocoder()`, Ergebnis am Auftrag speichern).
2. **Halte bilden:** aus `triprest_data` jede Standzeit ≥ 10 min mit Ort.
3. **Halt ↔ Einsatz:** Halt liegt ≤ 250 m von der Einsatzadresse **und**
   ueberschneidet das Zeitfenster des Einsatzes (Termintag; mit
   Beginn/Fertig-Stempeln ± 2 h). Mehrere Kandidaten → naechster gewinnt,
   Gleichstand → „unklar“ (nie raten, Liste zur Hand-Zuordnung).
4. **Fahrt zuordnen:** Die Anfahrt zum Halt gehoert dem Auftrag dieses Halts.
   Rueckfahrt zum Laden/Lager gehoert dem letzten Auftrag des Tages.
   Fahrten zwischen zwei Auftraegen → dem Ziel-Auftrag.
5. **Feste Orte** (Laden Oranienburg, Lager, Kettler, Lieferanten, Tankstelle,
   Wohnadressen Monteure falls Fahrzeug privat mitgeht → nur als Geofence
   „privat“, nie Adressen speichern) als Geofence-Liste.

### Kennzahlen je Auftrag

| Kennzahl | Berechnung |
|---|---|
| Fahrtzeit | Summe Dauer der zugeordneten Fahrten |
| Kilometer | Summe Strecke (aus `triprest_data`, Kontrolle `dataDistance` je Tag) |
| Vor-Ort-Zeit | Standzeit am Einsatzort (Nebenprodukt, wertvoll fuer Kalkulation) |
| Spritkosten | km × Verbrauch Fahrzeug (l/100 km, Stammdatum) × Literpreis |
| Leerfahrten | Fahrten ohne Auftragsbezug (weder Ziel noch Herkunft ein Einsatz, kein Lager/Lieferant) — je Tag/Fahrzeug, nicht je Auftrag |

Literpreis: zuerst fester Wert je Monat (Inhaber pflegt) oder aus
Tankbelegen; spaeter optional Tankerkoenig-API (Durchschnitt Region).
Verbrauch je Fahrzeug: Stammwert, spaeter aus Tankbelegen nachkalibrieren.

## 4. Umsetzung in Schritten

1. **Zugang + Probeabruf (lokal, lesend):** `scripts/paj-fahrten.mjs` holt
   Geraete und Vortags-`triprest_data`, schreibt
   `$TP_PRIVAT_DIR/fahrten/AAAA-MM-TT.json`. Feldnamen der Antwort erst am
   echten Abruf festlegen (Doku nennt keine Antwortschemata).
2. **Taeglicher Lauf** per LaunchAgent (wie `auslauf:pruefen`), 1 Abruf je
   Fahrzeug, Retry hoechstens einmal (`workflow/retry.mjs`).
3. **Auftrags-App:** `?ansicht=einsaetze&von=&bis=` liefert Einsatz-ID,
   Termin, Koordinate, Fahrzeug, Team — nur an den Dashboard-Server mit
   Schluessel, nicht ins Repo.
4. **Zuordnung** `operations/lib/fahrten-zuordnung.mjs` mit Tests (feste
   Beispieltage, keine echten Adressen in Fixtures).
5. **Control Center:** neue Ansicht unter Insights „Fahrten“: je Auftrag
   km / Fahrtzeit / Sprit, Wochensumme Leerfahrten, Liste „unklar“.
   Nur fuer Inhaber sichtbar wie die Montage-Kennzahlen.
6. **Rueckschreiben** der Summen je Auftrag in die Auftrags-App (Spalten
   „km“, „Fahrtzeit“, „Sprit €“) fuer die Nachkalkulation — erst nach 2–4
   Wochen Probebetrieb und Stichprobe gegen Fahrtenbuch.

## 5. Was der Inhaber freischalten / entscheiden muss

1. **Zugang PAJ:** im Finder-Portal ein eigenes Konto (oder Unterkonto) nur
   fuer die Auswertung anlegen und die Zugangsdaten **selbst** in
   `.env.local` (`PAJ_EMAIL`, `PAJ_PASSWORT`) auf dem Mac eintragen — nicht
   per Chat/Issue schicken.
2. **Tarif klaeren:** Ist das Fahrtenbuch-Modul gebucht? Wie lange speichert
   PAJ die Historie? Gibt es CSV-Export?
3. **Fahrzeugliste:** welcher Tracker in welchem Fahrzeug, Verbrauch
   l/100 km je Fahrzeug, Diesel/Benzin.
4. **Literpreis-Quelle:** fester Monatswert vs. Tankbelege.
5. **Datenschutz/Betriebsrat-Frage:** Fahrtdaten sind auf Mitarbeiter
   beziehbar. Monteure informieren, Zweck „Auftragskalkulation“ festhalten,
   keine Leistungskontrolle einzelner Personen, Loeschfrist (Vorschlag
   24 Monate Summen, 90 Tage Rohfahrten). Rechtliche Pruefung macht der
   Inhaber.
6. **Auftrags-App:** Freigabe, dass sie Einsaetze mit Adresse/Koordinate an
   den Dashboard-Server liefert (Schluessel wie bei `ansicht=zahlen`), und
   ob Fahrzeug je Einsatz gefuehrt werden soll.
7. **Feste Orte:** Laden, Lager, Kettler, Lieferanten-Abholorte bestaetigen.

## Quellen

- Home Assistant, Integration PAJ GPS: https://www.home-assistant.io/integrations/paj_gps
- Bibliothek `pajgps-api` (inkl. `api-docs.json`): https://github.com/skipperro/pajgps-api · https://pypi.org/project/pajgps-api/
- Fahrtenbuch-PDF-Export laut Hersteller: https://www.autozeitung.de/elektronisches-fahrtenbuch-firmenwagen-ratgeber-205548.html
