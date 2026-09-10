# Kleinmengen und Dropshipping bei Jordan und M-Plus

Stand 2026-09-10. Reine Analyse, keine Shopify-Aenderung. Anlass: Die Frage, ob der Shop
Paketware (Teppichfliesen, Klickvinyl, Klebevinyl) auch unterhalb eines Pakets verkaufen kann,
insbesondere mit Blick auf Direktversand ab Lieferant.

**Kurzantwort: Nein.** Weder Jordan noch M-Plus liefern Fliesen oder Planken unterhalb einer
Verpackungseinheit. Rollenware dagegen ist bei beiden nach laufendem Meter bestellbar — dort
existiert die Kleinmenge bereits und wird im Shop bereits genutzt.

---

## 1. Was belegt ist, und woran

### Jordan (jordanshop.de, Eigenmarke JOKA)

Jordan nennt die Bestelleinheit auf der Produktseite nirgends direkt. Sie laesst sich aber aus
den Palettenangaben eindeutig zurueckrechnen: `Stueck pro Palette` × `Inhalt m² pro Paket`
ergibt exakt `Inhalt m² pro Palette`, in zwei unabhaengigen Produktfamilien.

| Artikel | Art.-Nr. | Rechnung | `Inhalt m² pro Palette` |
|---|---|---|---|
| Design 555 Evolut Fischgraet Click (Shop: Lyon) | `LVTDESIGNJ_106` | 108 × 0,794 m² = 85,75 m² | 85,75 m² ✓ |
| Teppichboden Central Fliese 50×50 | `TEPCENTFL_072` | 40 × 5,00 m² = 200,00 m² | 200 m² ✓ |

**„Stueck" ist demnach das Paket**, nicht die Fliese und nicht die Planke. Dazu passt, dass jede
Farbe genau eine EAN traegt — EAN werden auf Handelseinheiten vergeben, nicht auf Einzelteile.

**Mindestabnahmen gehen nach oben, nicht nach unten.** Jordan pflegt sie als Freitext im
Attributfeld `Qualitaet`:

```
Teppichboden Maidan Fliese 50 x 50 cm 028 Format Object
  Qualitaet: "Maidan Fliese (mind.Abgabe 5 VE)"     -> mindestens 5 Pakete = 25 m²
```

Von 276 ausgewerteten Jordan-Teppichboden-Produktseiten (Datenbestand
`teppichboden-abgleich/rohdaten/jordan-textil-produktseiten.json`) traegt **genau eine** so einen
Vermerk. Ob das heisst „nur dort gibt es eine Mindestabnahme" oder „nur dort wurde sie
eingetragen", laesst sich aus den oeffentlichen Daten nicht entscheiden. Das ist eine Frage an den
Jordan-Vertrieb, keine an die Daten — siehe Abschnitt 5.

Ein systematisches Feld fuer Verpackungseinheit oder Mindestmenge existiert bei Jordan nicht.
Vorhanden sind nur `Inhalt m² pro Paket` (4 von 276 Teppichboden-Seiten, bei Planken dagegen
durchgaengig), `Inhalt m² pro Palette` und `Stueck pro Palette`. Ein einzelnes
`Verkaufseinheit`-Feld tauchte im gesamten Bestand einmal auf, bei einem Werkzeugartikel.

### M-Plus (m-plus.de)

M-Plus fuehrt die Einheit ausdruecklich, in zwei Feldern, gepflegt bei 92 von 97
Textilqualitaeten (`teppichboden-abgleich/rohdaten/mplus-textil-qualitaeten.json`, Feld `spec`):

| Belagsform | Qualitaeten | `Gebinde` / `Gebinde ME` | Bedeutung |
|---|---|---|---|
| Fliesen / Planken | 28 | 3,5 · 4 · 5 · 6 **QM** bzw. **QMT** | Paket. Keine Einzelfliese, in keiner Qualitaet. |
| Bahnen (Rollenware) | 55 | 200 · 400 · 500 **CM**, oder 1 **LMT** | Laufender Meter — Kleinmenge moeglich. |
| Massanfertigung | 2 | `abgepasster Teppich` | Zuschnitt nach Wunsch. |

Eine Suche ueber den gesamten M-Plus-Datenbestand nach `mind`, `Abgabe`, `Verpackungseinheit`,
`Karton`, `pro Paket` und `Palette` liefert **null Treffer**. M-Plus dokumentiert also die
Gebindegroesse, aber keine Mindestabnahme.

---

## 2. Je Lieferant und Produktgruppe

`?` bedeutet: nicht aus oeffentlichen Daten belegbar, nicht geraten.

| Produktgruppe | Lieferant | Kleinste Einheit (MOQ) | Kleinmenge unterhalb? | Dropshipping-tauglich | Lieferfaehigkeit / Bestand | Versandkosten |
|---|---|---|---|---|---|---|
| Teppichfliesen 50×50 | Jordan | 1 Paket = 5,00 m² (20 Fliesen); artikelweise 5 VE = 25 m² | **nein** | ja, sofern Konditionen stehen | nur eingeloggt | ? |
| Teppichfliesen / Planken | M-Plus | 1 Paket = 3,5–6,0 m² | **nein** | ? | nur mit Haendlerlogin | ? |
| Klickvinyl / Klebevinyl | Jordan | 1 Paket = 0,794–4,86 m² | **nein** | ja, sofern Konditionen stehen | nur eingeloggt | ? |
| Teppichboden Bahnenware | Jordan | Rollenbreite × lfm | **ja, bereits genutzt** | ja, sofern Konditionen stehen | nur eingeloggt | ? |
| Teppichboden Bahnenware | M-Plus | 1 LMT bzw. Rollenbreite 200/400/500 cm | **ja** | ? | nur mit Haendlerlogin | ? |
| Massteppich / Kettelung | Jordan | Serviceartikel `TEPKETT_001/002`, Massteppiche nur Kollektion Arriva 027 | entfaellt | ? | ? | ? |
| Sockelleisten, Profile, Zubehoer | Jordan | Stueck / Stange / Gebinde | **ja, bereits genutzt** | ja | nur eingeloggt | ? |

**Bestand und Preis sind bei beiden Haendlern nur eingeloggt sichtbar.** Jordan liefert
ausgeloggt konsequent `availabilityUnknown: "Bitte fragen Sie uns nach der Lieferzeit."`;
`/api/availability` verlangt CSRF und Session. M-Plus zeigt ohne Haendlerlogin weder Preis noch
Bestand. Das steht so bereits im Vollabgleich (`README.md`, Abschnitt 1) und aendert sich hier
nicht.

---

## 3. Der Punkt, der die Frage entscheidet

**Dropshipping und Kleinmenge schliessen sich bei Paketware gegenseitig aus.**

Im Streckengeschaeft schickt der Lieferant genau seine Handelseinheit an den Endkunden. Wer eine
Kleinmenge verkaufen will, muss das Paket ins eigene Lager holen, oeffnen, umpacken und neu
versenden. Das ist nicht eine Variante von Dropshipping, sondern dessen Gegenteil: Jede
Kleinmenge kostet zusaetzlich zur Restmenge auch das Geschaeftsmodell fuer diese Bestellung.

Je staerker der Shop auf Direktversand ab Lieferant setzt, desto klarer faellt die Antwort aus:
das Paket ist die kleinste Einheit. Der Satz „bei solchen Produkten haben wir leider nichts
Kleineres" ist damit keine Ausrede, sondern die zutreffende Beschreibung der Lieferkette.

---

## 4. Was daraus folgt — Kleinmenge als Produktmerkmal statt als Ausnahme

Beim Sortieren der Paketgroessen im eigenen Sortiment zeigt sich, dass die Fragestellung an einem
Ausreisser aufkam. Quadra (5,00 m², 294,50 €) ist der groesste Gebindewert im Sortiment; der
Regelfall ist deutlich kleiner:

| Produkt | 1 Paket | Preis | €/m² |
|---|---|---|---|
| Lyon Eiche Taupe Fischgraet — Klickvinyl 6 mm | 0,794 m² | 41,25 € | 51,95 |
| Nantes Fischgraet — Klickvinyl 7 mm | 1,575 m² | 81,82 € | 51,95 |
| Bergen Eiche Hell — Klickvinyl 6 mm | 1,73 m² | 84,68 € | 48,95 |
| Turku Eiche Hell — Klickvinyl 7 mm | 2,08 m² | 105,98 € | 50,95 |
| Rovelia Eiche Hell — Klickvinyl 10 mm | 2,09 m² | 165,01 € | 78,95 |
| Solenta — Klebevinyl 2,0 mm | 3,34 m² | 103,37 € | 30,95 |
| Alvora Marmor Grau — Klebevinyl 2,5 mm | 4,86 m² | 218,46 € | 44,95 |
| Quadra Teppichfliese 50×50 | 5,00 m² | 294,50 € | 58,90 |

Ueber zweihundert Paketprodukte, Einstiegsschwelle bei den meisten zwischen 41 € und 166 €.
**Der Shop hat kein „keine Kleinmengen"-Problem, sondern ein „nicht ausgesprochene
Mindestmenge"-Problem** — und bei den meisten Produkten waere das Aussprechen ein
Verkaufsargument statt eines Eingestaendnisses.

Vorschlag, alles ohne Paket zu oeffnen und ohne das Dropshipping-Modell zu verlassen. Die
Datengrundlage steht bereits in `custom.qm_pro_paket`:

**L1 — Zeile am Preis.** Auf jedem Paketprodukt unter dem €/m²-Preis: „Ab 1 Paket = 0,79 m² ·
41,25 €". Ein Satz, keine Entschuldigung. Die Produktseite ist dafuer seit PR #176 vorbereitet:
Titel, Preis und Paketangabe stehen jetzt vor dem Rechner.

**L2 — Filter und Sortierung „kleinste Bestellmenge".** Der eigentliche Hebel. Wer 3 m² Flur
belegen will, findet damit genau die Boeden, deren Paket klein genug ist, statt abzuspringen.
Braucht ein Produkt-Metafeld als Filterquelle, weil Shopify nicht nach `qm_pro_paket` filtert;
Wert ist derselbe.

**L3 — Der ehrliche Satz fuer den Ausreisser.** Bei Teppichfliesen und den grossen
Klebevinyl-Gebinden fuehrt der bestehende kostenlose Musterweg den Kleinstbedarf ab, ergaenzt um
eine Zeile, die den Grund nennt: „Teppichfliesen liefert das Werk nur im 20er-Paket. Fuer
einzelne Ersatzfliesen sprechen Sie uns an." Nebeneffekt: Diese Anfragen sind die einzige
belastbare Messung, ob ein Reparatursortiment sich lohnen wuerde.

**L4 — Offenes Risiko, das heute schon besteht.** Liefert Jordan bei einzelnen Artikeln erst ab
5 VE, der Shop verkauft dort aber 1 Paket, entsteht eine nicht beschaffbare Bestellung. Bei drei
Bestellungen bislang nie aufgefallen; mit Dropshipping faellt es beim Kunden auf. Noetig ist ein
Variant-Metafeld `lieferant.mindestabnahme_ve` (Vorschlag passt in das Datenmodell in
`README.md`, Abschnitt 5), das der Paket-Rechner als Untergrenze liest. Leer bedeutet 1 Paket.
**Vor dem ersten echten Dropshipping-Auftrag muss dieser Wert fuer die betroffenen Artikel
stehen.**

---

## 5. Offene Fakten — nur mit Login oder Vertrieb zu klaeren

1. **Mindestabnahme je Artikel.** Jordan pflegt sie als Freitext und offenbar nicht durchgaengig.
   Mit Haendlerlogin liesse sich die Schrittweite des Mengenfelds im Bestellformular je Artikel
   auslesen; ohne ihn bleibt es beim Vertriebsgespraech.
2. **Dropshipping-Konditionen** beider Haendler: Streckengeschaeft an Endkundenadresse,
   Neutralversand, Frachtkosten, Teillieferungen, Ruecksendungen. Steht in `README.md` bewusst als
   `dropshipping_available: null` — nie geraten. Groesster Hebel auf das ganze Modell.
3. **Versandkosten je Sendung und Gebinde.** Nicht oeffentlich, bei beiden.
4. **Eigener Bestand.** Der Shop fuehrt keine Bestandsdaten (`tracksInventory: false`
   durchgaengig, ein Lagerort). Falls doch bevorratet wird, verschiebt sich L3 von „anfragen" zu
   „aus dem Regal".

Keine dieser Fragen aendert etwas an L1, L2 und L3 — die sind in jedem Szenario richtig und
haengen an keiner Lieferantenzusage.

---

## 6. Datenbasis dieser Analyse

- `teppichboden-abgleich/rohdaten/jordan-textil-produktseiten.json` — 276 Jordan-Produktseiten mit
  vollstaendiger Attributtabelle (Vollabgleich vom 2026-09-09).
- `teppichboden-abgleich/rohdaten/mplus-textil-qualitaeten.json` — 97 M-Plus-Textilqualitaeten
  inklusive `Gebinde` und `Gebinde ME`.
- Jordan-Produktseiten `447923` (Rigid Board Click) und `456949` (Evolut Fischgraet Click), am
  2026-09-10 per `curl` ueber `/de-DE/product/<id>` geholt — die beiden Klickvinyl-Linien des
  Shops waren im Teppichboden-Vollabgleich nicht enthalten.
- Shopify Admin API: `custom.qm_pro_paket` und Variantenpreise aller aktiven Produkte.

Methodisch gilt wie im Vollabgleich: Nichts wird aus Namen oder Bildern geschlossen, und ein
Wert, der nur mit Login sichtbar waere, wird als offen gefuehrt statt geschaetzt.
