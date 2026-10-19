# Laden-Sortiment und Reste-Regal auf der Website

Stand 2026-10-15. Auftrag des Inhabers: Kunden im Umkreis von etwa 50 km sollen
sehen, dass im Laden in Oranienburg sehr viel mehr auf Lager ist als im
Online-Shop. Der Shop bleibt das Hauptziel, der Laden ergänzt ihn.

Vorgaben: keine Ladenfotos (der Laden wird nicht mit Fotos beworben), die
Fülle über Zahlen, Warengruppen, Marken und Typografie zeigen, nur Belegtes.
Für das Reste-Regal ist ein Foto möglich.

## Was gebaut ist

Eine Section `sections/tp-laden-sortiment.liquid` („TP Laden & Reste“) mit
zwei Darstellungen:

| Ort | Darstellung | Inhalt |
|---|---|---|
| Kollektion „Reste & Sonderposten“ (`templates/collection.sonderposten.json`), unter dem Produktraster, Sprungmarke `#laden` | ganze Fassung | Kennzahlen, Register „Was wir führen“ (je Warengruppe Symbol, Arten, Zahl der Produkte online, Link in den Shop), Reste-Regal mit Bildplatz und „Rest anfragen“ per WhatsApp, Besuch (Adresse, Zeiten, Route) |
| Startseite (`templates/index.json`), nach „So geht's“ | schmales Band | Überschrift, Kennzahlen, Link „Laden & Reste ansehen“ |

Der Platzhalter „Demnächst …“ der leeren Reste-Kollektion
(`snippets/product-grid.liquid`) bleibt, ist aber kleiner und verweist auf das
Reste-Regal (`#reste-regal`). Kommt das erste Stück online, erscheint wie
bisher das Raster und der Ladenteil steht darunter.

Symbole statt Fotos: `snippets/tp-ldn-icon.liquid`. Ohne Foto zeigt der
Reste-Kasten eine Zeichnung (Rollen im Regal), kein Ersatzfoto.

### Gestaltungsrichtungen (Entscheidung)

- A „Zahlen-Schaufenster“ (große Kennzahlen): stark, aber heute ist nur eine
  Ladenzahl belegt.
- **B „Sortiments-Register“ (gewählt):** funktioniert schon heute nur mit
  Belegtem, wächst mit jeder Angabe, jede Zeile führt zuerst in den Shop,
  braucht keine Ladenfotos, das Reste-Foto hat seinen Platz.
- C „Reste-Schaufenster“ (großes Regalfoto): zeigt die Breite des Ladens kaum
  und braucht zuerst das Foto.

Ort: die vorhandene Reste-Kollektion statt einer neuen Seite. So ändert sich
an Shopify-Daten nichts (keine neue Seite, kein Menüumbau), der Menüpunkt
„Angebote & Reste → Reste & Sonderposten“ führt sofort dorthin.

## Was belegt ist (steht heute auf der Seite)

| Angabe | Beleg |
|---|---|
| Über 1.000 m² Sonderposten und Lagerware im Laden | Inhaber in #167 (09.09.2026) |
| Mo–Fr 8:30–18:00, Sa 8:30–14:30 | Kontaktseite, Kopfleiste |
| Bis 50 km Aufmaß, Lieferung, Verlegung | Verlegeservice (`tp-zwei-wege`) |
| „sehr viel mehr auf Lager, als im Online-Shop steht“ | Inhaber 15.10.2026 |
| Reste und Sonderposten, die nicht online stehen; Fotos und Preise auf Anfrage | Boden-Finder (#1336) |
| Zahl der Produkte je Warengruppe | Shopify zählt live (`products_count`) |

## Was der Inhaber noch liefert

Nichts davon steht heute auf der Seite. Jede Angabe wird im Theme-Editor in der
Section „TP Laden & Reste“ eingetragen; leere Felder blenden sich aus.

1. **Kennzahlen zum Laden** (Block „Kennzahl“, höchstens vier): z. B.
   Verkaufs- bzw. Lagerfläche in m², Zahl der Rollen oder Restrollen am Lager,
   Zahl der Marken. Dazu bestätigen, dass „über 1.000 m² Sonderposten und
   Lagerware“ noch stimmt.
2. **Je Warengruppe: was steht im Laden zusätzlich?** (Feld „Im Laden
   zusätzlich“, erscheint als Zeile mit Marke „Im Laden zusätzlich“), z. B. eine
   Breite, eine Qualität oder Ware, die es online nicht gibt. Gibt es
   Warengruppen, die **nur** im Laden stehen, kommen sie als eigene Zeile dazu.
3. **Marken im Laden** (Block „Marke“): Herstellermarken, die im Laden stehen
   und genannt werden dürfen. Keine Großhändlernamen.
4. **Foto Reste-Regal** (Feld „Foto Reste-Regal“): Querformat, mindestens
   1200 px breit, Regal frontal, gutes Licht, keine Personen.
5. Optional: Parkplätze am Laden, Gründungsjahr (die Seite „Über uns“ nennt
   „25 Jahre Branchenerfahrung“ – nur übernehmen, wenn bestätigt).

## Offene Entscheidungen

- Menüpunkt umbenennen, z. B. „Reste & Sonderposten“ → „Laden & Reste“? Das
  wäre eine Menüänderung (`scripts/menue-umbau.mjs`), nicht Teil dieses PRs.
- Die Startseite nennt „über 1.000 m²“ jetzt zweimal (Band und Abschnitt
  „Warum Teppich Paradies“ im Kontaktblock). Wenn das stört, den Fakt im
  Kontaktblock ersetzen.

Screenshots: `docs/analyse/laden-sortiment-2026-10-15/screenshots/`.
