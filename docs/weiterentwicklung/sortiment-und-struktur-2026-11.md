# Sortiment und Struktur Teppichboden/Teppiche (2026-11-04)

Auftrag des Inhabers: Shop analysieren, fehlende Produkte und Hersteller finden,
Teppichboden und abgepasste Teppiche so ordnen, dass Kunden sofort ihre
Preisklasse finden, Sonderposten aktiver anbieten. Entscheidungen stehen in
`docs/shop-decisions.md` (2026-11-04). Lieferanten nur als Pseudonym.

## Befund (Shopify Admin API und Shopify-Statistik, gelesen 2026-11-04)

**Engpass ist die Orientierung, nicht die Auswahl.**
- 12 Monate online: rund 6.200 € netto, 128 Bestellungen, davon 82 Musterbestellungen.
- 90 Tage: 10.781 Sitzungen, Kaufquote 0,63 %, 66 % Handy.
- Aktiv: rund 3.000 Produkte, darunter 287 Teppichboden-Rollenwaren, 67 Teppichfliesen
  (Produkttyp ebenfalls Teppichboden), 421 Teppiche nach Maß (176 sichtbar in der
  Kollektion, Kantenarten als eigene Produkte), 373 Wohnteppiche.

**Preisverteilung Teppichboden-Rollenware (günstigster Meterpreis):**

| €/m² | bis 25 | 25–35 | 35–50 | 50–75 | 75–100 | über 100 |
|---|---|---|---|---|---|---|
| Anzahl | 7 | 36 | 52 | 83 | 70 | 39 |

Median 64,90 €/m². Unter 15 €/m² nichts. Bei Teppich nach Maß liegen 112 von 265
Basisqualitäten über 100 €/m². Das günstige Segment (15–35 €/m²) ist die echte Lücke.

**Herkunft Teppichboden:** Lieferant A 115, D (Marke) 67, E (Marke) 37, C 34, H 17,
F 5, B 2, Restposten 10. 83 Produkte ohne `einkauf.hersteller`.

**Struktur:**
- Velours, Schlinge, Wolle und Nadelfilz waren nicht auf den Produkttyp beschränkt:
  Velours zählte 398 statt 140 Produkte. **Behoben 2026-11-04** (Bedingung Produkttyp =
  Teppichboden; Rückweg: Bedingung in der Kollektion wieder entfernen).
- Teppichboden-Menü: 15 Einträge plus 18 Filterlinks, vier Fragen gemischt (Florhöhe,
  Machart, Material, Marke). 236 Rollenwaren liegen in zwei oder mehr Unterkategorien.
- 96 Rollenwaren ohne `custom.florhoehe_mm`, darunter alle 67 von Lieferant D. Deren
  Texte nennen nur eine Florklasse („Mittlerer Flor“), keine Millimeter; die
  Herstellerseite ist aus Remote-Sessions gesperrt. **Offen, lokal nachziehen.**
- Wohnteppiche: 305 von Lieferant I, eine Karte je Design und Farbe; Kinder, waschbar,
  Hochflor, rund stehen nur im Titel (kein Filter). Bei Lieferant I steht der echte
  Lieferantenname im Feld `vendor` (widerspricht `docs/MARKENSTRATEGIE.md`).
- Kollektion „Angebote“ leer, Restrollen seit 26.10. nur auf Anfrage.
- Häufigster Warenkauf nach dem Kettelservice: Antirutsch-Unterlage (7 Bestellungen) –
  Zubehör gehört an jede Teppich-Produktseite.

**Sortimentslücken:** Stufenmatten (1 Produkt), Badteppiche (0), Läufer als Meterware
für den Flur (8), Kinder-Teppichboden mit Druckmotiv, günstige Velours/Frisé 15–35 €/m².

## Umgesetzt

| Was | Wo | Stand |
|---|---|---|
| Unterkategorien nur Teppichboden | Shopify-Kollektionen (4 Bedingungen) | live seit 2026-11-04 |
| Preisklassen-Kacheln | `sections/tp-preisklassen.liquid`, `snippets/tp-preisklassen-def.liquid`, 10 Vorlagen `collection.teppichboden*.json` | PR, Deploy lokal |

## Empfehlungen je Preisklasse (live seit 2026-11-04)

Freigegeben vom Inhaber (Vorwerk Bingo statt Nuvara). Metafeld `custom.empfehlung`
(boolean, Storefront lesbar) = true; Plakette „Unsere Empfehlung“ auf der Karte
(`blocks/_product-card-gallery.liquid`, erscheint mit dem Theme-Deploy). In der
manuellen Kollektion `teppichboden` stehen die 15 auf Platz 1–15, gemischt nach der
Regel Mitte, Einstieg, Mitte, gehoben; Premium ab Platz 9. Wer eine Preisklasse
antippt, sieht deren drei zuerst.

| Klasse | Empfehlungen |
|---|---|
| Preiswert | Vallora, Rivena, Vorwerk Bingo |
| Komfort | Vorwerk Modena, Ophelia, Vorwerk Nutria Melange |
| Gehoben | Wovena, Torvana, Kontura |
| Premium | JAB Anstoetz Punto, JAB Anstoetz Clarity, Vorwerk Lyrica |
| Exklusiv | Regalia, Vorwerk Safira, Vorwerk Romance |

**Auswahl:** Musterstücke der letzten 12 Monate (Teppichboden und Teppich nach Maß
derselben Qualität) × 3, Einstiege direkt auf die Produktseite in 90 Tagen ÷ 5, Farben
(höchstens 20) ÷ 4, +2 wenn das erste Bild ein Raumbild ist. Ausgeschlossen: Auslauf,
Sonderposten, ohne Raumbild. Höchstens zwei je Marke (Vorwerk, JAB) pro Klasse. Die
Datenlage ist dünn (214 Musterstücke im Jahr); nach drei Monaten neu rechnen.

**Rückweg:** Metafelder löschen (`metafieldsDelete`) bzw. auf false setzen; Reihenfolge aus
`sicherung/2026-11-04-teppichboden-reihenfolge.json` (Ablauf steht in der Datei).

## Fahrplan

1. Preisklassen live (PR #1905); Empfehlungen je Klasse sind gesetzt (siehe oben), nach drei
   Monaten mit neuen Zahlen pruefen.
2. **Erledigt 2026-11-04** (20 statt 33 Links, `hauptmenue-umbau-2026-10.md`). Ursprünglich: Menü Teppichboden auf rund 12 Links: Nach Preis, Nach Art, Nach Raum, Marken. Farbe,
   Rollenbreite, Kurz-/Mittelflor nur als Filter. Umbau nur mit `scripts/menue-umbau.mjs`.
3. **Erledigt 2026-11-04** (Sammelseite `restposten`, Menü, Sofortkauf nach dem Messen; `sonderposten.md` Abschnitt 11). Ursprünglich: Restrollen mit gemessener Länge auf Sofortkauf, drei Schilder
   (Restrolle – noch X m², Auslaufkollektion, Einzelstück), Hinweis auf der Produktseite
   der Ursprungsqualität.
4. **Teilweise erledigt 2026-11-04:** automatische Kollektionen `kinderteppiche`, `outdoor-teppiche`, `hochflor-teppiche`, `waschbare-teppiche` (Produkttyp Wohnteppich plus Wort im Lieferanten-Titel, keine Datenänderung) als Unterpunkte von „Teppiche in Standardgrößen“ (`domains/shopify/menue-teppiche-zweck-2026-11.json`). Für Outdoor zählt nur der Titel: der Tag `eignung: outdoor` steht auch an Baumwoll-Wohnteppichen (z. B. Jorina, Ethelia) und ist ungeprüft. Dazu `runde-teppiche` (184, Variante mit „rund“ im Namen). Offen: Farben je Design zusammenfassen (Lieferant I legt je Farbe ein Produkt an). Ursprünglich: Wohnteppiche: Eigenschaften (Kinder, waschbar, Outdoor, Hochflor, rund) als Filter aus
   belegten Lieferantendaten; Farben eines Designs zusammenfassen prüfen.
5. Direktbezug Lieferant J und K als Pilot: 10–15 Qualitäten aus 15–35 €/m², Kennzeichnung
   „Zuschnitt in unserem Laden · Lieferzeit“, Filter „sofort lieferbar / auf Bestellung“,
   drei Monate messen. Vorher Frachtkosten aus den letzten Bestellungen.

## Herstellernamen zeigen? (Vorschlag, Entscheidung offen)

Vergleichbar wird ein Produkt durch Kollektionsname plus Farbnummer, nicht durch den
Herstellernamen. Vorschlag: eigener Linienname im Titel wie bisher, Hersteller und
Herkunftsland nur in den technischen Daten („Hersteller: … (Belgien)“), keine
Kollektionsnamen oder Farbnummern des Herstellers sichtbar. Das schafft Vertrauen, ohne
den Preisvergleich zu öffnen.

## Direktbezug-Pilot (Stand 2026-11-04)

- Lieferanten im Einkauf angelegt: `lieferant-j` und `lieferant-k` (Metaobjekt `tp_lieferant`,
  Direktversand „nein“, Bestellweg Mail). Belegte Konditionen stehen dort im Hinweis
  (Coupon-Mindestlänge J 2 m; Couponzuschlag K 4,00 €/m² seit 01.03.2026; Rohstoffzuschlag J
  je Polmaterial). Frachtbeträge stehen nur auf den Rechnungs-PDFs, nicht im Mailtext.
- Theme: Block `tp-zuschnitt-laden` nach dem Rollenrechner, nur bei Tag `zuschnitt-laden`.
  Pilot-Produkte: nur Meterware (keine Wunschmaß-Variante), Tags `zuschnitt-laden` und
  `ohne-raummass`, `service.lieferzeit` belegt, Varianten `einkauf.route = SUPPLIER_TO_TP`,
  `einkauf.lieferant` = J bzw. K.
- Vorliegende Preislisten sind veraltet (J 03/2024, K 09/2022); Anfrage nach aktuellen
  Listen, Coupon- und Frachtkonditionen, Datenblättern und Bildern liegt als Entwurf im
  Postfach. Kandidaten (je Lieferant rund 7) nur lokal, Einkaufspreise nie im Repository.
- Preisregeln (Inhaber 2026-11-04): K = UVP laut aktueller Liste; J = Einkauf × 2,0 (Annahmen in `docs/shop-decisions.md`). Offen:
  Auswahl der Qualitäten nach den aktuellen Listen.

### Preislisten im Postfach (geprüft 2026-11-05)

- J: kundenbezogene Preisliste ab 2026 (Mail vom 22.12.2025) ist die gültige EK-Liste; die
  Liste in der Dropbox (03/2024) ist überholt. Zuschläge 2026: Couponaufschlag (bis 15,49 €/m²
  EK +3,10 €/m², ab 15,50 €/m² +20 %) und Rohstoffzuschlag je Polmaterial (Q4 2026: PP 13,9 %,
  PA 7,9 %, PES 5,3 %).
- K: Rollenpreise laut Liste vom 05/2024 (Außendienst), seit 12/2025 unverändert; UVP-Listen
  für zwei Linien vom 01/2024; Couponzuschlag 4,00 €/m² seit 01.03.2026. Die „Preisliste 2026“
  vom April 2026 betrifft nur Teppichfliesen.
- Die PDFs lassen sich aus der Remote-Session nicht öffnen (kein Anhang-Download); zum
  Auswerten in den Dropbox-Ordner „Preislisten“ legen.

### Kandidaten J gerechnet (2026-11-06)

- Grundlage: J-Liste gültig ab 01.01.2026 (vom Inhaber hochgeladen). K-„Preisliste 2026“ ist
  nur die Fliesenliste (19 Qualitäten); keine unserer 69 Teppichfliesen stammt von K.
- Rechnung nach `docs/shop-decisions.md`: Couponpreis der Liste × (1 + Rohstoffzuschlag) × 2,0
  × 1,19, auf ,90 aufgerundet. Polmaterial unbekannt, deshalb PP-Zuschlag (13,9 %) als
  Obergrenze; mit PA oder PES wird der Preis 1–3 € niedriger.
- Nur Qualitäten mit Couponpreis kommen in Frage (Zuschnitt je Kunde). Die zehn günstigsten
  landen bei **29,90–35,90 €/m²** (Preisklasse Preiswert), weitere zehn bei 36,90–39,90 €/m².
  Die Filzrücken-Qualitäten ohne Couponpreis (rechnerisch 9,90–18,90 €/m²) gibt es nur als
  ganze Rolle; das wäre Lagerware im Laden, ein anderes Modell als der Pilot.
- Gelschaum-Läufer der Liste (vier Breiten 67–120 cm): rechnerisch 22,90–24,90 €/m². Das
  deckt die Lücke „Läufer als Meterware“.
- Offen vor dem Anlegen: Machart, Polmaterial, Breiten und Farben je Qualität. Die
  Datenanfrage beim Hersteller (Bildnutzungsvereinbarung unterschrieben am 10.10.,
  Erinnerungen 19.10. und 04.11.) ist unbeantwortet. Kandidatenliste mit Preisen nur lokal.
