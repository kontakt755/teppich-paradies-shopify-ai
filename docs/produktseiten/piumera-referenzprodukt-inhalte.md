# Piumera - Inhaltsentwurf fuer das Referenzprodukt

Stand 2026-09-14, Agent 8 (Welle 2). **Entwurf** - Freigabe durch den Lead, Schreiben der
Beschreibung/SEO-Felder durch Agent 3. Jede Aussage traegt ihre Quelle; alles ohne Beleg
ist als **OFFEN** markiert und darf so nicht veroeffentlicht werden.

Quellen-Kuerzel:
- `MF:` Produkt-/Varianten-Metafeld (Admin API, Agent-3-Bericht 2026-09-14)
- `TAG:` Produkt-Tag
- `CODE:` Theme-Code im Worktree
- `TEXT:` bestehende Produktbeschreibung (`descriptionHtml`) - ist selbst keine Quelle,
  nur Bestand
- `INHABER:` Regel des Inhabers laut CLAUDE.md / Memory

Betroffene Produkte:
- Meterware: `piumera-teppichboden-400cm-500cm` (Product/15983230681422, Template `rolle`)
- Teppich nach Maß: `piumera-teppich-nach-mass` (Product/16068575396174, Template `einfassung`)

---

## 1. SEO-Felder (global.title_tag / global.description_tag)

### Ist (live, 2026-09-14, Puppeteer)

| | Meterware | Teppich nach Maß |
|---|---|---|
| Title | „Piumera Teppichboden 400cm 500cm online kaufen \| Teppich Paradies" (63 Zeichen) | „Piumera Teppich nach Maß online kaufen \| Teppich Paradies" (aus dem Titel generiert, kein SEO-Feld) |
| Description | „Piumera Teppichboden in 14 Farben, 400 cm und 500 cm Breite. Extra plüschiger Flor, recyceltes Material." (103 Zeichen, MF vorhanden) | **kein SEO-Feld** - Shopify nimmt die Beschreibung, abgeschnitten nach 320 Zeichen mitten im Wort |
| Canonical | korrekt auf sich selbst | korrekt auf sich selbst |
| H1 | genau eine: Produkttitel | genau eine: Produkttitel |
| Breadcrumb (sichtbar + BreadcrumbList) | Start > Teppichboden > Teppichboden Hochflor > Produkt | Start > Teppiche > Produkt |
| Product-JSON-LD | keins (behoben in Welle 2) | 14 Offers zu 0,89 EUR (behoben in Welle 2) |
| robots | kein noindex | kein noindex |

Befund: Der Meterware-Titel wiederholt die Breiten und nennt nichts vom Nutzen; die
Description nutzt 103 von ~155 Zeichen. Das Maß-Produkt hat gar kein SEO-Feld (Agent 3, B10).

### Vorschlag Meterware

- **Title** (58 Zeichen): `Piumera Teppichboden Hochflor, 14 Farben | TeppichParadies`
- **Description** (152 Zeichen): `Piumera Hochflor-Teppichboden, 19 mm Flor, 14 Farben, 400 und 500 cm breit. Meterware oder auf Raummaß zugeschnitten, ab 65,90 €/m². Kostenlose Muster.`

Belege: 19 mm `MF: custom.florhohe`; 14 Farben `MF: Option Farbe`; Breiten
`MF: custom.rollenbreite 4.0/5.0`; 65,90 `Variantenpreis`; Muster `CODE: snippets/tp-musteroption.liquid`.

### Vorschlag Teppich nach Maß

- **Title** (57 Zeichen): `Piumera Teppich nach Maß, gekettelt | TeppichParadies`
- **Description** (154 Zeichen): `Piumera Hochflor-Teppich in Ihrem Wunschmaß, rundum gekettelt. 14 Farben, bis 400 x 600 cm, 89 €/m² plus Kettelung. Preis sofort im Rechner, ab 99 €.`

Belege: gekettelt `MF: service.einfassung = Ketteln`; 400 x 600
`MF: service.max_breite_cm / max_laenge_cm`; 89 €/m² `Variantenpreis 0,89 x 100 (MF: custom.preis_pro_001_qm)`;
ab 99 € `MF: service.mindestpreis`.

Hinweis fuer Agent 3: `SEOInput` immer mit `title` **und** `description` senden (Memory:
ein Feld allein loescht das andere).

---

## 2. Kurzbeschreibung (Einstieg, beide Seiten)

**Meterware:**
> Piumera ist ein hochfloriger Velours-Teppichboden mit 19 mm dichtem Samt-Flor aus Polyester
> auf recyceltem Textilvliesruecken. Erhaeltlich in 14 Farben als Meterware in 400 cm und
> 500 cm Breite - oder direkt auf Ihr Raummaß zugeschnitten.

Belege: hochflorig/Velours `MF: custom.arten [Velours, Hochflor]`; 19 mm `MF: custom.florhohe`;
Samt `MF: shopify.pile-type = Samt`; Polyester `MF: custom.fasermaterial`, `TAG: material: polyester`;
Textilvlies recycelt `MF: custom.ruckenausstattung`; 14 Farben / 400 / 500 `Varianten`;
Raummaß `CODE: blocks/tp-rollware-rechner.liquid` (Art „Raummaß", Wunschmaß-Variante).

**Teppich nach Maß:**
> Ihr Teppich aus dem Piumera-Teppichboden: zentimetergenau zugeschnitten und rundum gekettelt,
> damit keine Kante ausfranst. Breite bis 400 cm, Laenge bis 600 cm, 14 Farben.

Belege: `MF: service.einfassung, service.max_breite_cm, service.max_laenge_cm, service.formen [Rechteck]`;
`CODE: blocks/tp-einfass-konfigurator.liquid`.

---

## 3. Vorteile

| Aussage | Quelle | Status |
|---|---|---|
| Extra dichter, plueschiger Hochflor (19 mm) | `MF: custom.florhohe`, `custom.florhohe_klasse = über 12 mm`, `custom.arten` | belegt |
| Recycelter Textilvliesruecken | `MF: custom.ruckenausstattung` | belegt |
| Polyester-Flor | `MF: custom.fasermaterial [Polyester]` | belegt |
| „Recyceltes Material" / „100 % Polyester (recycelt)" fuer den **Flor** | nur `TEXT:` | **OFFEN: vom Datenblatt zu belegen** (Metafeld sagt Polyester, nicht „recycelt"; recycelt ist nur der Ruecken belegt) |
| 14 Farben, 400 und 500 cm | Varianten | belegt |
| Raummaß-Zuschnitt und Teppich nach Maß aus derselben Qualitaet | `CODE`, `MF: service.einfass_basis` | belegt |
| Kostenlose Muster, bis 3 je Bestellung | `CODE: assets/tp-sample-checkout-core.js (MAX_SAMPLES = 3)`, Musterprodukt 0,00 EUR | belegt (Versand siehe 11) |
| Fuer Fußbodenheizung geeignet | nur `TEXT:`; `MF: custom.fusbodenheizung` **leer** | **OFFEN** - nicht behaupten |
| „Frei von Chemikalien" | `MF: shopify.allergy-friendly-features` gesetzt, aber kein Zertifikat im Datensatz | **OFFEN** - Werbeaussage ohne Beleg; bis Nachweis nicht verwenden |

---

## 4. Einsatzbereiche

- Wohnzimmer, Schlafzimmer, Kinderzimmer - `MF: custom.zimmer`, `TAG: raum: *` (belegt)
- Innenbereich - `MF: shopify.suitable-space [Drinnen]` (belegt)
- Nutzungsklasse 22 (Wohnbereich, mittlere Beanspruchung) - `TAG: nutzungsklasse: 22`;
  `MF: custom.nutzungsklassen` **leer** -> Tag ist Beleg, Metafeld nachziehen (Agent 3, B4)
- Buero, Treppe, Stuhlrollen: **OFFEN** - keine Daten, nicht nennen

---

## 5. Material und Eigenschaften (technische Daten)

Nur belegte Werte in den Technikblock; alles andere bleibt leer, bis das Datenblatt vorliegt.

| Merkmal | Wert | Quelle |
|---|---|---|
| Art | Velours, Hochflor | `MF: custom.arten` |
| Flortyp | Samt | `MF: shopify.pile-type` |
| Florhoehe | 19 mm (Klasse ueber 12 mm) | `MF: custom.florhohe`, `custom.florhohe_klasse` |
| Fasermaterial | Polyester | `MF: custom.fasermaterial` |
| Ruecken | Textilvliesruecken, recycelt | `MF: custom.ruckenausstattung` |
| Nutzungsklasse | 22 | `TAG: nutzungsklasse: 22` |
| Raeume | Wohn-, Schlaf-, Kinderzimmer | `MF: custom.zimmer` |
| Rollenbreiten | 400 cm, 500 cm | `MF: custom.rollenbreite` (Variante) |
| Gesamthoehe | - | **OFFEN: vom Datenblatt zu belegen** |
| Gesamtgewicht / Poleinsatzgewicht | - | **OFFEN** |
| Komfortklasse | - | **OFFEN** |
| Trittschallverbesserung | - | **OFFEN** |
| Brandverhalten | - | **OFFEN** |
| Fußbodenheizung | - | **OFFEN** |
| Stuhlrollen / Treppen | - | **OFFEN** |
| Zertifikate | - | **OFFEN** |

---

## 6. Farben (14, aus dem Farbregister `tp_farbe` / Option „Farbe")

| Code | Name | Swatch (gemessen, `MF: tp_farbe.swatch`) |
|---|---|---|
| 004 | Sand Hell | #d6c6af |
| 027 | Grün Tief | #363d2d |
| 030 | Beige Mittel | #bda28b |
| 035 | Taupe Dunkel | #8b7560 |
| 040 | Taupe Tief | #4e443b |
| 041 | Bordeaux Heller | #594142 |
| 049 | Grau Dunkel Heller | #786f67 |
| 077 | Blau Tief | #26323b |
| 081 | Bordeaux Dunkler | #5b3024 |
| 091 | Grau Mittel | #94928d |
| 092 | Grau Dunkel Dunkler | #6f6b62 |
| 095 | Anthrazit | #585954 |
| 098 | Schwarz Heller | #464646 |
| 099 | Schwarz Dunkler | #191916 |

Hinweis: „Heller/Dunkler" sind Messbegriffe (Agent 3, B8). Kundennaehere Namen nur mit
Inhaberfreigabe - **nicht** eigenmaechtig umbenennen (`productOptionUpdate`, Memory).

### Alt-Text-Schema (Agent 3 schreibt per `productUpdateMedia`)

- Meterware, Farbbild: `Piumera Teppichboden in <Farbe> (<Code>), Detailaufnahme`
  - Beispiel: `Piumera Teppichboden in Sand Hell (004), Detailaufnahme`
- Teppich nach Maß, Farbbild: `Piumera Teppich nach Maß in <Farbe> (<Code>), gekettelt`
  - Beispiel: `Piumera Teppich nach Maß in Sand Hell (004), gekettelt`
- Spaetere Raum-/Strukturbilder: `Piumera Teppichboden in <Farbe> (<Code>), Raumansicht` /
  `..., Struktur-Nahaufnahme` / `..., Rueckseite Textilvlies`

Code immer dreistellig (wie `custom.farbcode`), nicht „Farbe 04".

---

## 7. Meterware - so wird bestellt

Quelle: `CODE: blocks/tp-rollware-rechner.liquid`, `assets/tp-rollware-art.js`,
`qa/tests/rollware-art.test.mjs`; Live-Verhalten laut Agent 7 (T1-T8).

- Art „Meterware": Rollenbreite 400 oder 500 cm waehlen, Laenge in cm eingeben.
- Abgerechnet wird die volle Rollenbreite x Laenge; das Ergebnis wird auf **volle m²
  aufgerundet** (T8: 400 x 520 cm = 20,8 m² -> 21 m² = 1.383,90 EUR). Der Hinweis dazu steht
  im Rechner. (Aufrundung ist Codeabsicht - Inhaberentscheidung offen, Agent 7 B-T8.)
- Preis 65,90 EUR/m² (`Variantenpreis`).
- Optional: Teppich-Fußleiste gekettelt (10,95 EUR/lfm, 6 Hoehen 5-10 cm) und
  Haftunterlage (`CODE: tp-rollware-rechner`, Produkte `teppich-fussleiste-gekettelt`,
  `antirutsch-unterlage-fuer-teppiche-rollenware`).

Textvorschlag:
> **Meterware:** Sie waehlen die Rollenbreite (400 oder 500 cm) und geben die Laenge in cm an.
> Berechnet wird die volle Rollenbreite; wir runden auf ganze Quadratmeter auf. Der Preis
> steht sofort im Rechner.

---

## 8. Raummaß-Rechner - so funktioniert er live

Quelle: `CODE: blocks/tp-rollware-rechner.liquid` (Art „Raummaß", Wunschmaß-Variante 89,00 EUR),
Agent 7 T1-T6.

- Eigene Breite und Laenge in cm eingeben (Breite max. 495 cm, T5: 520 cm wird blockiert).
- Der Zuschnitt kommt aus der **naechstgroesseren Rolle** mit **5 cm Zugabe** auf die Breite
  (T1: 352 x 463 -> Rolle 400; T4: 401 x 500 -> Rolle 500).
- Berechnet wird die eingegebene Flaeche, aufgerundet auf **volle m²**, zu **89,00 EUR/m²**
  (Wunschmaß-Variante = 65,90 x 1,35).
- Bekannte Luecken (Agent 7, nicht bewerben): Spartipp vergleicht teils mit der falschen
  Rolle (T3), keine Drehempfehlung (T6).

Textvorschlag:
> **Raummaß:** Geben Sie Breite und Laenge Ihres Raums ein. Wir schneiden aus der passenden
> Rolle zu, mit 5 cm Zugabe in der Breite, und berechnen Ihre Flaeche auf volle Quadratmeter
> zu 89,00 EUR/m². Die Kanten bleiben unversaeubert - fuer einen gekettelten Teppich nutzen
> Sie „Teppich nach Maß".

---

## 9. Teppich nach Maß

Quelle: `MF` des Maß-Produkts, `CODE: assets/tp-masstepich-rechnung.js`,
`qa/tests/masstepich-rechnung.test.mjs`, Agent 4/7 (T9-T11).

- Preis 89,00 EUR/m² (`0,89 EUR je 0,01 m²`, `MF: custom.preis_pro_001_qm = true`),
  zentimetergenau (Flaeche in 0,01-m²-Schritten).
- Kettelung 19,00 EUR je laufendem Meter Kante (`Kettelservice` 0,19 EUR je 0,01 lfm),
  cm-genau nach Umfang.
- Maximal 400 x 600 cm (`MF: service.max_breite_cm / max_laenge_cm`); kurze Seite <= 400 cm
  (T11: 420 x 350 wird angenommen). Nur Rechteck (`MF: service.formen`).
- Mindestpreis 99 EUR (`MF: service.mindestpreis`) - erreicht durch mehr Material, nicht
  durch Sperre oder Aufschlag (`INHABER 2026-09-13`).
- Beispiel T9: 200 x 300 cm = 6 m² x 89 = 534 EUR + 10 lfm x 19 = 190 EUR = 724 EUR.
- Farben: dieselben 14 (`MF: service.basisvariante` je Farbe auf die 400-cm-Variante).

Textvorschlag:
> **Teppich nach Maß:** Breite und Laenge zentimetergenau eingeben (bis 400 x 600 cm). Der
> Teppich wird aus dem Piumera-Teppichboden zugeschnitten und rundum gekettelt. Material
> 89,00 EUR/m², Kettelung 19,00 EUR je Meter Kante, Mindestbestellwert 99 EUR - alles vor dem
> Kauf im Rechner sichtbar.

---

## 10. Muster

Quelle: `CODE: snippets/tp-musteroption.liquid`, `sections/tp-sample-checkout.liquid`,
`assets/tp-sample-checkout-core.js`; Musterprodukt `kostenloses-muster` (0,00 EUR).

- Kostenlos, bis zu **3 Muster** je Bestellung, Farbe waehlbar, Link `/pages/muster?produkt=<handle>`.
- **OFFEN (Agent 3, B9):** reine Musterbestellung koennte 4,99 EUR Versand ausloesen
  (Versandprofil). Bis geklaert, nicht „versandkostenfrei" fuer Muster schreiben.

---

## 11. Lieferung

Inhaberregel (Memory `versandprofile_stand_2026_09_11`, Inhaber 2026-09-12) - **Wortlaut**:

> versandkostenfrei ab 50 EUR Bestellwert, per Paketdienst oder Spedition

Unter 50 EUR: 4,99 EUR (allgemeines Versandprofil). Lieferzeiten: **OFFEN** - keine Daten.
Nicht nennen.

---

## 12. Messen (Anleitung)

Nur, was der Rechner tatsaechlich verlangt (`CODE`):

1. Raum an der breitesten und laengsten Stelle in cm messen (Tueren, Nischen, Erker mitmessen).
2. Beim Raummaß rechnet der Shop 5 cm Zugabe in der Breite ein - Kunde muss nichts zugeben.
3. Breite > 495 cm: Rechner blockiert, Beratung anfragen (T5).
4. Florrichtung/Drehung: **OFFEN** - der Rechner gibt keine Drehempfehlung; nicht versprechen.

---

## 13. Pflege

Keine Pflegeangaben in Metafeldern, Tags oder Code. **OFFEN: vom Datenblatt zu belegen.**
Bis dahin kein Pflegeabschnitt (keine generischen Saug-/Reinigungsempfehlungen erfinden).

---

## 14. FAQ (nur belegbare Antworten)

1. **Wie breit ist die Rolle?** 400 cm oder 500 cm. (`MF: custom.rollenbreite`)
2. **Bekomme ich den Teppichboden auch in meinem Raummaß?** Ja: Art „Raummaß", Breite und
   Laenge in cm eingeben; Zuschnitt aus der naechsten Rolle mit 5 cm Zugabe, 89,00 EUR/m²
   auf volle m² gerundet. (`CODE: tp-rollware-rechner`)
3. **Was ist der Unterschied zwischen Raummaß und Teppich nach Maß?** Raummaß = Zuschnitt
   ohne Kantenversaeuberung, 89 EUR/m² auf volle m². Teppich nach Maß = cm-genau plus
   Kettelung 19 EUR/lfm, Mindestpreis 99 EUR, max. 400 x 600 cm. (`CODE`, `MF: service.*`)
4. **Wie hoch ist der Flor?** 19 mm. (`MF: custom.florhohe`)
5. **Woraus besteht Piumera?** Polyester-Flor auf recyceltem Textilvliesruecken.
   (`MF: custom.fasermaterial`, `custom.ruckenausstattung`)
6. **Fuer welche Raeume eignet sich Piumera?** Wohn-, Schlaf- und Kinderzimmer,
   Nutzungsklasse 22. (`MF: custom.zimmer`, `TAG: nutzungsklasse: 22`)
7. **Kann ich Muster bestellen?** Ja, kostenlos, bis zu 3 Farben je Bestellung.
   (`CODE: tp-sample-checkout-core.js`) - Versandhinweis erst nach Klaerung B9.
8. **Ab wann ist der Versand kostenlos?** Ab 50 EUR Bestellwert, per Paketdienst oder
   Spedition. (`INHABER`)

Nicht in die FAQ (ohne Beleg): Fußbodenheizung, Stuhlrollen, Treppen, Lieferzeit, Pflege,
Schadstofffreiheit.

---

## 15. Was Agent 3 schreiben darf, sobald der Lead freigibt

- `global.title_tag` / `global.description_tag` beider Produkte (Abschnitt 1, zusammen senden).
- Alt-Texte der 14 Meterware-Bilder (Abschnitt 6).
- `descriptionHtml` der Meterware ohne die zwei OFFEN-Aussagen (Fußbodenheizung, „Frei von
  Chemikalien") und mit dem Hinweis auf Raummaß und Teppich nach Maß; Maß-Produkt
  mit Rechnerregeln (Abschnitt 9).
- Nicht: Preise, Varianten, Optionsnamen, `custom.fusbodenheizung`,
  `shopify.allergy-friendly-features` (nur nach Datenblatt).
