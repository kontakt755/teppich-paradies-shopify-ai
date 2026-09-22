# Shop 2.0 Pre-Launch – Masterplan

Stand: 2026-09-22 · Branch `feature/shop-2-0-prelaunch` (frisch von `origin/main`, e29037f) · Arbeitstheme 204436144462 (nie publishen) · Live: siehe `domains/shopify/live-theme.json`.

Ziel: Shop vor dem Start von Google Ads verkaufsfertig, zuverlaessig, verstaendlich, schnell, messbar und intern bearbeitbar machen. Keine neuen Features um ihrer selbst willen. Keine App, keine laufenden Kosten ohne Kennzeichnung. Keine Live-Veroeffentlichung ohne vollstaendigen Test im Arbeitstheme.

## Arbeitsregeln (aus dem Auftrag)

1. Bestand pruefen → vorhandene Funktionen erkennen → Fehler dokumentieren → Abhaengigkeiten → Gutes erhalten → erst dann planen → Module umsetzen → nach jedem Modul testen → dokumentieren → Gesamt-Regression.
2. Ein Writer je Theme-Datei, mehrere Reviewer. Analysen parallel, Aenderungen sequenziell.
3. Nichts still korrigieren: Widersprueche zuerst in `02-ISSUES.md`.
4. Lieferantennamen nur als Pseudonyme im Repo (Lieferant A–D, siehe `AGENTS.md`).
5. Jede Aenderung: `03-PROGRESS.md` + `05-CHANGES.md` + Test in `06-TESTS.md`.

## Phasen

| Phase | Inhalt | Ergebnisdatei |
|---|---|---|
| 0 | Bestand (Repo, Shop-Daten, Bestellungen, Metafelder, vorhandener Audit) | `01-CURRENT-STATE.md` |
| 1 | Befunde und Widersprueche, priorisiert P0–P2 | `02-ISSUES.md` |
| 2 | Entscheidungen (behalten / verbessern / konsolidieren / entfernen / neu) | `04-DECISIONS.md` |
| 3 | Module M1–M12 umsetzen, je Modul Test | `05-CHANGES.md`, `06-TESTS.md` |
| 4 | Ads-Readiness-Pruefung, Merchant Center, Tracking | `08-ADS-READINESS.md` |
| 5 | Gesamt-Regression, Abschlussbericht, Handliste fuer Kaya | `09-FINAL-REPORT.md` |

## Module (Reihenfolge nach Prioritaet P0 → P1 → P2)

| Modul | Auftrag §§ | Prio | Kurzinhalt |
|---|---|---|---|
| M1 Produktidentitaet & Datenmodell | 4, 5, 7 | P0 | Zwei Ebenen (kundenseitig/intern) ueber Metafelder; keine Lieferantennamen kundenseitig; zentrale Felder statt Mehrfachpflege |
| M2 Produktehrlichkeit & Konsistenz | 6, 8, 31, 45 | P0 | Bild = Produkt, Struktur/Material/Breite stimmen; Widersprueche (400/500 cm, km-Radius, Bewertung, Versand); „So rechnen wir" entfernen |
| M3 Produktseite | 9, 30, 44, 46 | P0 | Reihenfolge Name → Art → Vertrauen → €/m² → Farbe → Muster → Masse → Endpreis → Zubehoer → Beratung → Verlegung → Kaufen → … |
| M4 Muster | 10, 18, 27 | P0 | Musterbestellung erkennen (TYP-MUSTER/-WARE/-MISCH), eigene Musterbestaetigung, Muster in Ads getrennt bewerten |
| M5 Warenkorb = Projekt + Beratung + Masspruefung + Verlegung | 11–16 | P0/P1 | Pflichtentscheidung Beratung (Ja/Nein, Telefon), Masspruefung, Verlegeanfrage, passende Zubehoer-Vorschlaege; Express-Checkout-Umgehung pruefen |
| M6 Transaktionsmails | 17–22 | P0 | Bestellbestaetigung, Musterbestaetigung, Versandbestaetigung, Tracking, Follow-ups |
| M7 Flow & interne Ansichten | 42, 43 | P0 | Tags automatisch (TYP-*, BERATUNG-*, MASS-PRUEFUNG-OFFEN, VERLEGUNG-ANGEFRAGT), gespeicherte Bestellansichten |
| M8 Tracking & Consent | 26–29 | P0 | Funnel-Events, kein doppeltes purchase, Muster getrennt, Consent Mode, UTM |
| M9 Merchant Center & Feed | 24, 25, 39 | P0 | Feedtitel mit Produktart/Farbe/Breite, Konsistenz Feed↔Seite, strukturierte Daten |
| M10 Mobile & Performance & Fehlerfaelle | 33, 34, 40 | P0 | Sticky-Ueberdeckung, Cookiebanner, LCP/CLS/INP, Fehlerpfade |
| M11 SEO-Sicherheit, Suche, Filter | 35, 38 | P0/P1 | URLs unveraendert, Canonicals, H1; Filter aus strukturierten Daten, keine Lieferantennamen |
| M12 Testbestellungen A–H & Kundenkonto | 23, 41 | P0 | Testmatrix, Order-Daten, Tags, Mails, Tracking |
| P2 (nur wenn P0 fertig) | 36, 37, 47 | P2 | Bodenfinder, B2B-Funnel, Newsletter-Vorbereitung |

## Quality Gate vor „Ads READY" (§ 49)

Produkt · Kaufprozess · Kommunikation · Ads · Technik – jede Zeile in `08-ADS-READINESS.md` mit bestanden / nicht bestanden und Beleg.

## Grenzen dieser Umgebung

- Shopify-Admin-Daten (Produkte, Metafelder, Bestellungen, Menues) per MCP lesbar und schreibbar.
- Benachrichtigungsvorlagen, Shopify Flow, Merchant Center, Google Ads, Consent-App: kein API-Zugriff → Browser (Admin) oder manuelle Pruefung, in `07-OPEN-ITEMS.md` festgehalten.
- Preise, SKUs, Checkout, Zahlung, Versand, Rechtstexte, Apps: nur mit ausdruecklicher Freigabe (CLAUDE.md Sicherheitsgrenzen).
