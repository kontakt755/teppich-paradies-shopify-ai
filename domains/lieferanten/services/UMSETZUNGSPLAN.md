# Umsetzungsplan Mass-Teppich (Raummass + Einfassprodukte)

Stand 2026-09-11 · Aufgabe #188 · **Plan zur Freigabe** (Regel 12) · Namen pseudonymisiert (Lieferant A/B)

> Umsetzung seither: Theme-Code, `npm run masstepich:plan` und `npm run masstepich:guard` in PR #195, Doku
> `domains/shopify/teppich-nach-mass.md`. Shopify-Daten sind weiterhin nicht angelegt.

## Entscheidungen des Inhabers (2026-09-11, Runde 2)

- Einfassen **und** Raummass fuer alle Teppichboeden von Lieferant A **ausser Nadelfilz und Sauberlauf**:
  49 Produkte, 477 Farben (ausgeschlossen: Fortiva Nadelvlies 200 cm, Quadra Nadelvlies-Fliese; Sauberlauf ist
  eigener Typ; Lieferant B bleibt ausgeschlossen). Quelle der Freigabe: Inhaber, nicht Heuristik.
- Vier Einfassarten als **eigene Produkte** (wie Teppichscheune): **Cover** (bisher „Kippkante“), **Ketteln**,
  **Einfassband** (Baumwolle, ca. 3 cm sichtbar), **Paspelband** (ca. 1 cm sichtbar). Titel z. B.
  „Callista Coverteppich nach Maß“, „Callista Kettelteppich nach Maß“, „Callista Teppich mit Einfassband nach Maß“,
  „Callista Teppich mit Paspelband nach Maß“.
- Cover nur als Paket **mit Vlies** darunter (sonst Stufe an der umgeschlagenen Kante); Breite hoechstens
  Rollenbreite − 10 cm (390 / 490 cm).
- Einfassprodukte: Breite bis Rollenbreite, Laenge bis 10 m; Formen Rechteck, Rund, Oval, nach Schablone,
  nach Skizze (Skizze: Foto-Upload + Kontaktdaten, dann Pruefung).
- Rollenrechner: Breite als Auswahl feste Rollenbreiten **oder „Wunschmaß“** (Raummass). Raummass-Preis =
  m²-Preis × 1,35; angezeigt wird nur der neue m²-Preis, nicht die Rechnung.
- Rollenrechner zusaetzlich: **Kettelleisten** (Hoehe 4–10 cm) und **Haftunterlage** (schwimmend, Folie oben).
- Visualisierer fuer die Einfassteppiche.
- Preise und Vlies-Produkt folgen vom Inhaber.

## Mengengeruest

| | Anzahl |
|---|---:|
| Basisprodukte (Teppichboden von Lieferant A, aktiv, ohne Nadelvlies) | 49 |
| Farben darin | 477 |
| Basisvarianten | 913 |
| neue Raummass-Varianten (je Farbe „Wunschmaß“) | 477 |
| neue Einfassprodukte (4 × 49) | 196 |
| Varianten darin (Farbe) | 1.908 |

Vier Basisprodukte haben heute keine Breitenoption (Kontura, Rivena, Regalia, Boucella) - sie bekommen
„400 cm“ (bestehende Varianten, `LEAVE_AS_IS`) und „Wunschmaß“. Sieben Produkte schreiben „400cm“ ohne Leerzeichen.

## Datenmodell

- Basisvarianten: `service.raummass` und `service.einfassen` (Auswahlliste Verfügbar / Nicht verfügbar /
  Ungeklärt, Storefront lesbar) - Wert „Verfügbar“ nur fuer die 49 freigegebenen Produkte. Alles andere leer
  und damit verborgen (fail closed).
- Raummass-Variante: Breitenwert „Wunschmaß“, Preis pro 0,01 m² = m²-Preis × 1,35 ÷ 100 (cm-genau), Wert der
  35 % in der internen Konfiguration; der Sync schreibt die Preise, der Guard prueft sie. Das Theme rechnet
  keinen Preis selbst.
- Einfassprodukt: Produkttyp „Teppich nach Maß“, Template `einfassung`; Produkt-Metafelder
  `service.einfassung` (Cover/Ketteln/Einfassband/Paspelband), `service.max_breite_cm`, `service.max_laenge_cm`
  (1000), `einkauf.basisprodukt` (Referenz, Storefront NONE). Varianten: Farbe, `custom.farbcode`,
  `custom.farbe`, `einkauf.basisvariante` (Referenz). Eigene Artikelnummern, z. B. `TP-KET-TEPCALA-139`.
- Warenkorb-Properties: Einfassung, Form, Breite/Laenge bzw. Durchmesser, Flaeche, Kante (lfm), Bandfarbe;
  intern `_Einkaufsartikel`, `_Einfassartikel`, `_Zuschnitt aus Rolle` - nur Artikelnummern, keine Namen.

## Dateien

| Datei | Aenderung |
|---|---|
| `blocks/tp-rollware-rechner.liquid` | Breitenauswahl mit „Wunschmaß“, eigene Breite, Raummass-m²-Preis, Rollen-Grafik, Schritte Kettelleisten/Haftunterlage, Warenkorb mit `items[]`; Breitenerkennung toleriert „Wunschmaß“; ruhender Raummass-Modus entfaellt |
| `blocks/tp-einfass-konfigurator.liquid` (neu) | aus `tp-teppich-wunschmass`: Formwahl, Grenzen aus Metafeldern, Bandfarbe, Paket-Hinweis Cover, Anfragepfad Schablone/Skizze |
| `snippets/tp-einfass-visual.liquid` (neu) | SVG-Visualisierer: vier Kanten, drei Formen, Masse |
| `templates/product.einfassung.json` (neu) | Galerie, Titel, Farbe, Konfigurator, Details, Wechsel der Einfassung |
| `blocks/tp-einfass-wechsel.liquid` (neu) | Chips zu den vier Einfassungen und zurueck zur Meterware |
| `templates/product.rolle.json` | Block „Auch als Teppich nach Maß“, nur bei `service.einfassen` = Verfügbar |
| `blocks/tp-teppich-wunschmass.liquid`, `templates/product.teppich.json` | nach Portierung entfernen (Regel 10) |
| `snippets/cart-products.liquid` | Zusaetze unter dem Teppich gruppieren, verwaiste entfernen |
| `templates/collection.teppiche-nach-mass.json` (neu) | Kollektion, Einleitung, FAQ, Filter Einfassung |
| `scripts/einfass-sync.mjs`, `scripts/einfass-guard.mjs` (neu), `package.json` | Anlage/Pflege, Trockenlauf, Pruefungen (fail closed, 35 %, Grenzen, keine Lieferantennamen, Lieferant B nie) |
| `qa/tests/einfass-*.test.mjs` (neu) | Rechenlogik (Flaeche, Umfang, Cover −10 cm, 10 m, 35 %), Guard, Testmatrix |

## Reihenfolge nach Freigabe

1. Metafeld-Definitionen, Metaobjekte.
2. Sync-Skript, Trockenlauf mit Aenderungsliste.
3. Raummass an Callista (Pilot) → Rechner im Branch → Testmatrix → alle 49.
4. Vier Callista-Einfassprodukte als Entwurf → Template/Visualisierer → Testmatrix → alle 196 (Entwurf).
5. Kettelleisten, Haftunterlage (sobald Produkt und Preis feststehen).
6. Kollektion und Filter, `menu:guard`.
7. Preise einspielen → Preview → Freigabe → Live ueber die Deploy-Kette → Produkte veroeffentlichen.

**Ueberschneidung:** PR #191 (Liefer- & Verlegeservice fuer Rollenware) aendert ebenfalls
`templates/product.rolle.json`. Die Theme-Arbeit hier startet erst auf `main` nach dessen Merge, nicht parallel
- sonst gibt es einen Konflikt im selben Template.

## Offen

1. Preise: je Einfassart (m²-Preis inkl. Kante oder Kante je lfm), Mindestpreis, Kettelleiste je lfm/Hoehe,
   Haftunterlage je m².
2. Vlies- und Haftunterlage-Produkt: der Kippkante-Artikel von A (`TEPKIPKA`) enthaelt schon Antirutschvlies;
   Haftunterlage-Kandidaten SwitchTec Sigan Elements (bei A `ZUBSIELE`/`ZUBSIELEP`) oder AKO Prima.
3. Kettelleisten: kein Artikel bei A; Fertiger klaeren (Alternative: Doellken TLE 55 Teppichsockelleiste).
4. Bandfarben (Katalog: Einfassband 32, Paspel 8) und Garnfarbe beim Ketteln.
5. Groesse: der Kettelartikel von A reicht bis 6 × 4 m, Vorgabe bis 10 × 5 m - bei A klaeren.
6. Rund/Oval: Abrechnung nach tatsaechlicher Flaeche oder umschliessendem Rechteck.
7. Skizzen-Upload: Formular-App mit Upload (evtl. Kosten) oder vorerst Kontaktformular + Foto per WhatsApp.
8. Raummass-Rundung: cm-genau (m²-Preis minimal gerundet, z. B. 115,00 statt 114,62 €) oder volle m².
9. Neue Teppichboeden von A automatisch aufnehmen (Ausnahme von Regel 4) oder jeweils bestaetigen.
10. Weiter offen aus dem Befund: Anfrage an A, Zubehoer der Hausmarke von A, SKU-Korrektur, Lieferant C, Issue #188.
