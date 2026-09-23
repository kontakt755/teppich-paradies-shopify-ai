# Messung

Stand 2026-09-23 · Aufgabe #505. Bestehende Ereignisse:
`docs/kundenbindung/funnel-events.md`. Was heute fehlt: `AUDIT.md`, Luecke L10.

## 1. Der ehrliche Ausgangspunkt

**Es gibt derzeit keine Ratgeber-Zahlen.** Weder GA4 noch Search Console sind
angebunden. Dieses Dokument beschreibt, was gemessen werden soll und woran es
haengt — es erfindet keine Werte.

Wo Daten fehlen, steht **„Daten noch nicht verfuegbar."** Kein geschaetztes
Suchvolumen, keine ausgedachte Position, keine Prognose.

| Quelle | Stand | Haengt an |
|---|---|---|
| Shopify-Kundenereignisse | **laeuft** (`tp-funnel-events.liquid`) | — |
| GA4 | **fehlt** | Property anlegen, Mess-ID eintragen — Anleitung liegt fertig: `docs/kundenbindung/ga4-anlegen.md` |
| Search Console | **fehlt** | Property bestaetigen, dann Zugang fuer die Auswertung |
| Ratgeber-Bereich im Dashboard | **fehlt** | braucht mindestens eine der beiden Quellen |

## 2. Was schon misst

`tp_ratgeber_cta_klick` mit `ziel` (Pfad ohne Query) und `cta_typ` — jeder Klick
aus einem Ratgeber auf Produkt, Muster, Rechner, Verlegeservice oder Zubehoer.
Das ist die wichtigste Ratgeber-Kennzahl und sie laeuft seit dem 21.09.

## 3. Was dazukommt

Gleiches Muster wie die bestehenden Ereignisse: `Shopify.analytics.publish` plus
`window.dataLayer`. Keine personenbezogenen Daten, keine Formularinhalte.

| Ereignis | Ausloeser | Nutzlast | Wofuer |
|---|---|---|---|
| `tp_bodenwissen_suche` | Absenden der Ratgeber-Suche | `begriff`, `treffer` | Was Besucher suchen |
| `tp_bodenwissen_suche_leer` | Suche ohne Treffer | `begriff` | **Contentluecken** — die wertvollste Quelle |
| `tp_bodenwissen_problem_gewaehlt` | Klick im Problem-Finder | `belag`, `symptom`, `ziel` | Welche Probleme Menschen haben |
| `tp_bodenwissen_rechner` | erste gueltige Eingabe im Rechner | `rechner` | Wird das Werkzeug benutzt |
| `tp_bodenwissen_lexikon` | Klick auf einen Lexikon-Anker | `begriff`, `von` | Welche Begriffe unklar sind |

`tp_bodenwissen_suche_leer` ist bewusst eigenstaendig: Suchanfragen ohne
Ergebnis sind nach Auftrag 45 eine Themenquelle, und zwar eine, die sonst
niemand hat.

## 4. Kennzahlen

Nicht Besucherzahlen allein. Der Ratgeber soll helfen **und** weiterfuehren.

| Kennzahl | Warum |
|---|---|
| Organische Sitzungen im Ratgeber | Grundlast |
| **Non-Brand-Anteil** | Die eigentliche Frage: Wie viele finden uns, ohne den Namen zu kennen? |
| Klicks, Impressionen, CTR, Position je Artikel | Quick Wins erkennen |
| Ratgeber → Produkt (Klickrate) | Fuehrt der Artikel weiter? |
| Musterbestellungen mit Ratgeber im Pfad | Der echte Trichter |
| Beratungs- und Verlegeservice-Anfragen aus dem Ratgeber | Zweiter Weg |
| Suchanfragen ohne Treffer | Themenquelle |

**Non-Brand** heisst: Suchanfrage enthaelt weder „teppich paradies" noch eine
Schreibvariante davon. Die Trennung passiert bei der Auswertung, nicht im Shop.

## 5. Attribution — die Grenze

Shopify-Kundenereignisse und Search Console sind zwei getrennte Welten. Search
Console kennt Suchanfragen, aber keine Kaeufe; die Kundenereignisse kennen
Kaeufe, aber keine Suchanfrage. **Eine sauber durchgerechnete Zuordnung
„dieser Artikel hat diesen Umsatz gebracht" ist damit nicht moeglich** und wird
auch nicht behauptet.

Was geht: den Pfad zaehlen (Ratgeber gesehen → Produkt gesehen → Muster →
Warenkorb → Kauf) und Artikel danach ordnen. Das reicht zum Priorisieren.

## 6. Bereich „Ratgeber / SEO" im Dashboard

`docs/ai-dashboard/` ist das Control Center; das Frontend liest ausschliesslich
`issues.json` (Schema 2), geschrieben vom Bot. Ein Ratgeber-Bereich braucht eine
zweite, ebenso erzeugte Datei — **kein GitHub- oder Google-Aufruf mit Token im
Frontend.**

Zwei Haelften, unterschiedlich weit:

**a) Content-Pipeline — geht heute.** Quelle ist das Repo selbst:
`npm run bodenwissen:guard -- --json` liefert Artikelzahl, Status, Fehler und
Hinweise. Daraus: Pipeline (idee · entwurf · fachpruefung · freigegeben ·
veroeffentlicht · ueberarbeiten), Artikel mit abgelaufenem Pruefdatum, Themen
mit offenem Expert Input, fehlende Bilder.

**b) Suchleistung — wartet auf Daten.** Klicks, Impressionen, CTR, Position,
Non-Brand, Quick Wins, neue Nutzerfragen, Suchanfragen ohne Treffer.
Bis dahin zeigt der Bereich „Daten noch nicht verfuegbar" — nicht eine Null, die
wie eine Messung aussieht.

## 7. Quick-Win-Regel

Ein Artikel ist ein Quick Win, wenn er viele Impressionen hat, auf Position 8
bis 15 steht und eine unterdurchschnittliche CTR. Dann zuerst: Title und
Kurzantwort pruefen, fehlende Nebenfragen ergaenzen, Bilder, interne Links.

**Einen bestehenden guten Artikel zu verbessern ist meist wertvoller, als einen
neuen zu schreiben.** Gilt erst, wenn Daten da sind.

## 8. Nach dem Livegang

Nach zwei bis vier Wochen Indexierung pruefen. Danach laufend messen.
**Kein Rankingurteil nach wenigen Tagen** — das ist keine Geduldsfrage, sondern
eine Frage der Datenmenge.
