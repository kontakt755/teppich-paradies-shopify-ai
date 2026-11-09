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
- 111 Rollenwaren ohne `custom.florhoehe_mm` (Stand 2026-11-09), darunter alle 67 von
  Lieferant D. Deren Texte nennen nur eine Florklasse („Mittlerer Flor“), keine Millimeter;
  Herstellerseite, Downloads und Preisliste nennen ebenfalls keine (geprüft 07./09.11.).
  Die übrigen 44 haben keinen Flor (13 Nadelvlies, 3 Schlinge, 23 Kokos/Sisal/Webware von
  Lieferant F und H, Datenblätter nur mit Gesamthöhe) und bleiben bewusst leer. **Offen: der
  Inhaber fordert bei Lieferant D technische Datenblätter mit Polhöhe an** (Werkbank).
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
4. **Teilweise erledigt 2026-11-04:** automatische Kollektionen `kinderteppiche`, `outdoor-teppiche`, `hochflor-teppiche`, `waschbare-teppiche` (Produkttyp Wohnteppich plus Wort im Lieferanten-Titel, keine Datenänderung) als Unterpunkte von „Teppiche in Standardgrößen“ (`domains/shopify/menue-teppiche-zweck-2026-11.json`). Outdoor läuft seit 2026-11-09 über den Tag `outdoor` (71 Produkte, an die Titeltreffer gesetzt; neue Outdoor-Wohnteppiche brauchen den Tag); der Tag `eignung: outdoor` steht auch an Baumwoll-Wohnteppichen (z. B. Jorina, Ethelia), ist ungeprüft und wird nicht benutzt. Dazu `runde-teppiche` (184, Variante mit „rund“ im Namen). Offen: Farben je Design zusammenfassen (Lieferant I legt je Farbe ein Produkt an). Ursprünglich: Wohnteppiche: Eigenschaften (Kinder, waschbar, Outdoor, Hochflor, rund) als Filter aus
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
  (Coupon-Mindestlänge J 2 m; Couponzuschlag K seit 01.03.2026; Rohstoffzuschlag J
  je Polmaterial; Beträge nur im Hinweisfeld). Frachtbeträge stehen nur auf den Rechnungs-PDFs, nicht im Mailtext.
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
  Liste in der Dropbox (03/2024) ist überholt. Zuschläge 2026: Couponaufschlag (zweistufig nach
  Einkaufspreis) und Rohstoffzuschlag je Polmaterial (quartalsweise; PP am höchsten, PES am
  niedrigsten). Beträge nur im Lieferanten-Eintrag und in der Liste, nicht im Repository.
- K: Rollenpreise laut Liste vom 05/2024 (Außendienst), seit 12/2025 unverändert; UVP-Listen
  für zwei Linien vom 01/2024; Couponzuschlag seit 01.03.2026 (Betrag im Lieferanten-Eintrag). Die „Preisliste 2026“
  vom April 2026 betrifft nur Teppichfliesen.
- Die PDFs lassen sich aus der Remote-Session nicht öffnen (kein Anhang-Download); zum
  Auswerten in den Dropbox-Ordner „Preislisten“ legen.

### Kandidaten J gerechnet (2026-11-06)

- Grundlage: J-Liste gültig ab 01.01.2026 (vom Inhaber hochgeladen). K-„Preisliste 2026“ ist
  nur die Fliesenliste (19 Qualitäten); keine unserer 69 Teppichfliesen stammt von K.
- Rechnung nach `docs/shop-decisions.md`: Couponpreis der Liste × (1 + Rohstoffzuschlag) × 2,0
  × 1,19, auf ,90 aufgerundet. Polmaterial unbekannt, deshalb PP-Zuschlag (der höchste) als
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

### Umfang: ganzes Coupon-Sortiment von J (2026-11-07)

- Statt 10–15 Pilotqualitäten alle 46 Qualitäten mit Couponpreis anlegen (rechnerisch
  Preiswert 20, Komfort 10, Gehoben 11, Premium 4, Exklusiv 1) plus die sechs
  Gelschaum-Läufer. Begründung: die Preisklassen-Kacheln und Empfehlungen lösen die
  Orientierung, Teppichboden wächst um rund 15 %; gemessen wird das Bezugsmodell (Fracht,
  Zuschnitt im Laden, Lieferzeit), nicht die Zahl der Qualitäten. Filzrücken-Qualitäten ohne
  Couponpreis bleiben draußen (nur ganze Rolle).
- **Doppelte vermeiden:** 4 Qualitäten des Herstellers hinter J und 16 des Herstellers hinter K
  sind schon im Shop, bezogen über Lieferant A und C unter deren Handelsnamen (`einkauf.hersteller`
  an der Variante). Welche Herstellerqualität dahintersteht, steht nicht in den Daten. Vor dem
  Anlegen je Qualität abgleichen (Musterkarte oder Rückfrage beim Hersteller); eine schon
  vorhandene Qualität bekommt kein zweites Produkt, sondern höchstens einen neuen Bezugsweg.
- K bleibt beim Stand oben: Rollen-UVP fehlt.
- Datenanfrage J: Ansprechpartnerin abwesend, Entwurf an die Vertretung liegt im Postfach
  (2026-11-07).

### Sisal-Angebot Lieferant B (2026-11-06)

- Zwei Sisal-Qualitäten (100 % Sisal), Angebot gültig bis 30.06.2027, je als Coupon,
  ganze Rolle (30 lfm) und Wunschmaß, mit UVP je m².
- Qualität 1: 8,5 mm, 400/500 cm, 14 Farben (drei davon nur eingeschränkt lieferbar),
  UVP Coupon 62,90 €/m², Wunschmaß 81,90 €/m². Qualität 2: beschichteter Rücken, 6 mm,
  400 cm, 4 Farben, UVP 86,90 €/m², Wunschmaß 112,90 €/m².
- Passt zwischen unsere Sisal-Böden (54,90 / 72,90 / 77,90 / 108,90 €/m²); 14 Farben sind
  mehr als jede vorhandene Sisal-Qualität. Wunschmaß gehört zu „Teppich nach Maß“
  (Vorlage `wunschmass-fertig` wie die übrigen Wunschmaß-Teppiche von B).
- Hinweis zur Spanne (Werte nur lokal): Bei Qualität 1 im Wunschmaß ist die Spanne zur UVP
  deutlich enger als beim Coupon.
- Offen: Preisregel für B-Teppichboden bestätigen (UVP wie bei den Wunschmaß-Teppichen),
  Bilder je Farbe (das Angebots-PDF enthält nur kleine Farbfelder), Lieferweg (Direktversand
  bei B ungeklärt).

### Zweite Marke von Lieferant H freigegeben (2026-11-06)

- Der Hersteller hinter H (Wollteppichboden, Direktversand) erlaubt auch seine zweite Marke,
  ausgenommen drei Qualitäten (Liste in der Mail vom 06.11.). Lieferkonditionen wie bei der
  Hauptmarke, alle Qualitäten als Coupon und einfassbar, kein Raummaß (volle Breite).
- Preislisten und Bordürenkatalog liegen der Mail bei, Bilder kamen per WeTransfer (wird lokal
  gesichert). Steht im Lieferanten-Eintrag `lieferant-h` (Hinweis). Anlegen nach Skill
  `produktimport` am nächsten fertigen H-Produkt entlang.
