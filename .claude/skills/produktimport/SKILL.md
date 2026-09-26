---
name: produktimport
description: Neue Produkte aus einer Lieferantenquelle in Shopify anlegen (Teppichboden, Vinyl, Linoleum, Fliesen, Zubehoer) - Namensregeln klaeren, Rohdaten per curl erheben, productSet, Medien, Veroeffentlichung, Gegenprobe. Verwenden bei "Produkte importieren", "neue Linie anlegen", Lieferantenlinks vom Inhaber und bevor das erste productSet laeuft. Ersetzt den alten Import-Skill aus dem Claude-Konto.
---

# Produktimport

Verbindlich ist `domains/shopify/produktimport-arbeitsweise.md` - **vor dem ersten
Produkt ganz lesen**. Dieser Skill ist die Reihenfolge und die Checkliste dazu, keine
zweite Regelquelle. Vorfaelle: `docs/lessons/produktimport.md`. Schreibzugriff und
Produktdatenregeln: `shopify-daten.md` in diesem Ordner.

Lieferantennamen gehoeren nicht ins Repository, in Commit-/PR-Texte oder in
`npm run task`-Notizen: nur **Lieferant A** bis **D**, Linien **A-1** bis **A-3**,
URLs als `lieferant-a.example`. Rohdaten nur unter `~/teppich-paradies-analyse/lieferantendaten/`.

## Ablauf

1. **Referenzprodukt abfragen.** Das naechstliegende fertige Produkt derselben Art
   (Titel, Vendor, Variantentitel, Optionen, Metafelder, Kategorie, Tags,
   Veroeffentlichungen) per Shopify-MCP lesen. Es ist die Spezifikation.
2. **Namensregeln festhalten, bevor etwas geschrieben wird:** Eigenname statt
   Lieferantenlinie (Titel und Vendor), Lieferantenlinie nur in `grosshandel.sku`,
   deutsche Farbnamen `Grundton + Stufe` ohne Nummer, Farbnummer nur in SKU und
   `custom.farbcode`. Offene Fragen an den Inhaber **vorher** stellen.
3. **Rohdaten mit `curl` erheben, nicht mit dem Browser.** Lieferant A liefert
   SSR-HTML; Crawl-Delay 120 s beachten (`npm run lieferantenseiten:holen`,
   Artikelsuche siehe Skill `lieferant-a-recherche`). Alles sofort in eine Datei unter
   `~/teppich-paradies-analyse/lieferantendaten/` schreiben. Der Browser ist nur fuer
   Seiten, die ohne JavaScript leer bleiben - dann einmal pruefen und begruenden.
4. **Farbcodes abschreiben, nie fortzaehlen.** Luecken in der Lieferantenliste sind
   echt. Farbnamen per Bildmessung (Abschnitt 7 der Arbeitsweise), nicht aus den
   Lieferantenattributen.
   **Pruefen, bevor geschrieben wird:** die neuen Codes je Produkt aus der Rohdatendatei als
   `[{ "titel": "…", "status": "DRAFT", "codes": ["Farbe 4153", …] }]` an
   `node scripts/farbcode-guard.mjs --stdin < <datei>` geben. `npm run farbcode:guard`
   ohne Eingabe liest nur `data/farbcode-guard-input.json` (Altbestand) und prueft den
   neuen Import nicht. Der Guard meldet nur einen Verdacht - Beleg ist der Abgleich
   **jedes einzelnen Codes** mit der Lieferantenliste; Ergebnis in der Rohdatendatei
   festhalten (Quelle, Datum, fehlende Codes). Gleiche Anzahl ist kein Abgleich.
5. **Paketinhalt je Artikel pruefen** - m² wird zwischen Formaten kopiert.
   Fliesen/Planken: `mindestmenge` = Paketinhalt. Paketprodukte tragen `custom.qm_pro_paket`.
6. **Anlegen mit `productSet` - nur fuer neue Produkte**, Varianten im selben Aufruf.
   Mehrere Produkte: aliasierte `productSet` in einem Request. Syntax nie raten,
   `graphql_schema` fragen. Bestehende Produkte nur mit den schmalen Mutationen
   (Tabelle in Abschnitt 5).
7. **Medien:** `productCreateMedia` mit der Lieferanten-URL, 15-20 je Aufruf; danach
   Variantenbild per `productVariantsBulkUpdate` mit `mediaId`.
8. **Veroeffentlichen:** `status: ACTIVE` reicht nicht - `publishablePublish` auf die
   Verkaufskanaele des Referenzprodukts (IDs aus Schritt 1 lesen, nicht aus dem Gedaechtnis).
9. **Gegenprobe nach jedem Schreibvorgang:** Variantenzahl, SKU, Optionswerte,
   `variant.image`, Metafelder, Veroeffentlichung. `userErrors: []` ist kein Beleg.
10. **Muster** nach `domains/shopify/benachrichtigungen/musterartikel.md` (verbindlich):
    eigenes Produkt `muster-<Handle des Quellprodukts>`, Titel `Muster <Name ohne Breite>`,
    dieselbe Option wie die Quelle, eine Variante je Farbe, SKU `M-<SKU der Quellvariante>`,
    0,00 EUR, Status UNLISTED und im Onlineshop veroeffentlicht. Fehlt das Produkt oder eine
    Farbe, faellt der Konfigurator still auf das Sammelprodukt `kostenloses-muster` zurueck.
    **Jede neue Mustervariante gehoert ins Versandprofil "Kostenlose Muster"**, sonst zahlt
    der Kunde Versand. Das Zuordnen ist eine Versandaenderung: nur mit ausdruecklicher
    Freigabe des Inhabers. Gegenprobe ueber `deliveryProfile.profileItems`, nicht
    `productVariantsCount` (deckelt bei 500).

Mehr als etwa 50 Werte auf bestehenden Produkten (Metafelder, Tags, Einkaufsfelder):
Skill `shopify-massendaten` (Plan, Rollback, Batchdateien).

## Nicht tun

- Keine Produkteigenschaften erfinden oder aus Bildern ableiten (ausser dem Farbnamen
  nach Abschnitt 7). Im Zweifel als offenen Fall dokumentieren.
- Keine Preise, SKUs bestehender Varianten oder Produkte loeschen/aendern ohne
  ausdrueckliche Freigabe (CLAUDE.md, Sicherheitsgrenzen).
- Nicht ueber den Shopify-Admin im Browser anlegen - der Shopify-MCP ist authentifiziert.
