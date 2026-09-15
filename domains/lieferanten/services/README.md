# Kettelservice nach Lieferant und Produkt

Stand 2026-09-11 (Fassung 2) · Aufgabe #188 · Branch `feature/kettelservice-neutral`

> Namen sind pseudonymisiert (Lieferant A bis D, Hausmarke von A), weil das Repository oeffentlich ist.
> Regeltabelle, Variantenbeleg und Bestandsliste liegen nur lokal unter
> `~/teppich-paradies-analyse/lieferantendaten/domains/lieferanten/services/`, der Schluessel der Pseudonyme dort
> in `INHALT.md`. Feldnamen in den lokalen Dateien tragen noch die echten Namen.

Datenbasis und Regeln fuer den Kettelservice. **Keine Shopify-Aenderung.** Umsetzung erst nach den offenen
Entscheidungen im Handoff und einem vorgelegten Umsetzungsplan.

| Datei | Ort | Inhalt |
|---|---|---|
| `HANDOFF.md` | Repo | Stand, verbindliche Regeln 1–12, offene Entscheidungen, Audit, Testmatrix |
| `UMSETZUNGSPLAN.md` | Repo | Raummass und Einfassprodukte (Runde 2) |
| `kettelservice-regeln.json` | lokal | Regeltabelle: Lieferantenregeln, Qualitaetsbelege, Whitelist-Verweis, Validierung, Importschutz, Testmatrix |
| `kettelservice-varianten-beleg-2026-09-11.json` | lokal | Whitelist je Variante: Varianten-ID, SKU, Artikel bei Lieferant A, Kollektion, Qualitaet, Status |
| `kettelservice-bestand-2026-09-11.csv` | lokal | alle 434 Shop-Produkte mit Lieferant und Beleg (Semikolon, UTF-8) |

## Befund

- Der Lieferant steht in keinem eigenen Feld. `vendor` enthaelt Eigennamen, Tags nichts. Belegbar ist er nur
  ueber die **Varianten-SKU** (= Artikelnummer von Lieferant A, per Quicksearch von A exakt geprueft) und die
  **Grosshandels-ID** (`grosshandel.sku`, bei Lieferant B mit dessen Kuerzel am Anfang).
- 434 Produkte: 399 Lieferant A (aktiv), 5 Lieferant B (Entwurf), 26 weitere Marken (archiviert), 4 ohne Angabe.
- Kettelservice wird heute nirgends angeboten. Es gibt keine alte Kettel-Logik; ruhende Mass-Logik siehe Handoff.
- **Whitelist:** 14 Qualitaeten 030 Wool & Sisal sind per Datenblatt („Abmessung … + Maßteppich“) belegt.
  Je Variante: **104 Varianten in 10 Produkten** vollstaendig belegt (SKU = Artikel bei A, die Produktseite von A
  nennt Kollektion und Qualitaet). **56 Varianten in 4 Produkten** (Merinda, Lanova, Lanetta, Vellana) erst nach
  SKU-Korrektur (`TEPDENIA4_119` statt `TEPDENIA04_119` bei A).
- Alles andere (Sprint 027, Trend 026, Format 028, Atelier 30, Fliese) bleibt ungeklaert und damit verborgen.
- **Lieferant C** kommt in Shop, Repository, Postfach und Impressum von Lieferant B nicht vor; gefuehrt als Alias
  von Lieferant B.

## Datenmodell (Vorschlag, nicht angelegt)

| Feld | Ebene | Werte | Storefront | Zweck |
|---|---|---|---|---|
| `service.kettelservice` | **Variante** | `Verfügbar` · `Nicht verfügbar` · `Ungeklärt` | lesbar | einzige Wahrheit fuer Theme, Filter, Kollektion, Warenkorb |
| `einkauf.lieferant` | Produkt | Metaobjekt `tp_lieferant` (Lieferant A, Lieferant B mit Alias C, andere) | NONE | Herkunft, nur Admin/Skripte |
| `einkauf.qualitaet` | Produkt | „030 Wool & Sisal · Calais“ | NONE | Schluessel in die Regeltabelle |
| `einkauf.kettel_quelle` | Variante | Datenblatt A + Artikelnummer · Regel B · Manuell bestätigt · Unbekannt | NONE | warum der Wert gilt |
| `einkauf.kettel_beleg` | Variante | Datei + Fundstelle + Pruefdatum | NONE | Nachweis |

Das Theme liest **nur** `service.kettelservice` der gewaehlten Variante, nie `einkauf.*`. Die Werte nennen
keinen Lieferanten, auch die Filter-URL (`filter.v.m.service.kettelservice`) nicht. Search & Discovery filtert
Varianten-Metafelder, Smart Collections kennen `VARIANT_METAFIELD_DEFINITION` (Schema geprueft).

## Regeln in Kurzform

Fail closed · keine Ableitung aus Name, Titel, Hersteller, Kollektion, Material, Produktart, Technik, Bildern
oder baugleichen Produkten · Lieferant B/C immer „Nicht verfügbar“ · Lieferant A nur per Whitelist, nie auf neue
Produkte uebertragen · Entscheidung je Variante · Lieferantendaten nie an den Browser · jede Freigabe mit Beleg
und Datum · Importe stoppen bei Konflikt · Altbestand vor neuer Logik bereinigen · 15 Testfaelle · vor den
Entscheidungen keine Storefront, keine Daten, kein Push. Volltext: `HANDOFF.md`.
