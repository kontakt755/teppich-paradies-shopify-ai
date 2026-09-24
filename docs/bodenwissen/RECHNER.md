# Boden-Rechner — Teppichboden-Bedarf mit Rollenbreite

Stand 2026-09-23 · Rechner L5 aus `ARCHITECTURE.md`, Abschnitt 4.4. Dieser
Rechner ist der erste und bislang einzige Rechner im Bodenwissen-Bereich.

Seite `/pages/boden-rechner` (`templates/page.bodenwissen-rechner.json`),
Section `sections/tp-boden-rechner.liquid`, Rechenlogik
`assets/tp-boden-rechner.js`, Tests `qa/tests/boden-rechner.test.mjs`.

## 1. Was der Rechner ausrechnet

Eingaben: Raumbreite und Raumlänge in cm (je die breiteste/längste Stelle
des Raums), eine Zugabe von 10 oder 20 cm, und eine Liste verfügbarer
Rollenbreiten (Section-Einstellung, Vorgabe 400 und 500 cm).

Für **jede** hinterlegte Rollenbreite prüft der Rechner **beide**
Ausrichtungen — Raumbreite und Raumlänge dürfen getauscht werden, weil sich
Teppichboden drehen lässt:

- **Ausrichtung „Standard"**: die Raumbreite liegt quer zur Rolle (muss
  `<= Rollenbreite` sein), die Raumlänge bekommt die Zugabe.
- **Ausrichtung „gedreht"**: die Raumlänge liegt quer zur Rolle, die
  Raumbreite bekommt die Zugabe.

Passt eine Ausrichtung (`quer <= Rollenbreite`), rechnet der Rechner:

```
benötigte Rollenlänge (cm) = auf volle 10 cm aufgerundet(Länge-Seite + Zugabe)
Bestellfläche (m²)         = Rollenbreite (m) × benötigte Rollenlänge (m)
Raumfläche (m²)            = Raumbreite (m) × Raumlänge (m)
Verschnitt (m²)            = Bestellfläche − Raumfläche
Verschnitt (%)             = Verschnitt / Raumfläche × 100
```

Passen **beide** Ausrichtungen, gewinnt die mit der kleineren Bestellfläche
(= weniger Verschnitt) — das ist zugleich immer die Ausrichtung, die die
**kürzere** Raumseite als zu schneidende Länge nutzt, denn die Rollenbreite
ist für eine gegebene Rolle fest, also minimiert eine kürzere Länge die
Fläche.

Passt **keine** Ausrichtung (beide Raumseiten sind breiter als die Rolle),
zeigt die Zeile für diese Rollenbreite nur die Zahl der benötigten Bahnen
(`aufgerundet(kürzere Raumseite / Rollenbreite)`) und einen Hinweis, dass
dabei eine Naht entsteht, mit Link auf den Artikel „Rollenbreite wählen und
Bahnen planen". Es wird **keine** Bestelllänge und keine Fläche berechnet —
wie die Naht in der Praxis liegt und wie viel Material eine zweite Bahn
wirklich braucht, hängt vom Grundriss ab und ist in den freigegebenen
Artikeln nicht als Formel hinterlegt, sondern ausdrücklich der persönlichen
Beratung vorbehalten.

Über alle Rollenbreiten hinweg markiert der Rechner die Zeile mit dem
insgesamt kleinsten Verschnitt als Empfehlung. Gibt es keine nahtlose
Variante, gibt es auch keine Empfehlung.

Runden: Rollenlänge wird mit `Math.ceil` auf volle 10 cm **aufgerundet** (nie
abgeschnitten — sonst fehlt Material), Flächen werden auf zwei
Nachkommastellen gerundet, der Verschnittprozentsatz auf eine
Nachkommastelle.

**Keine Preise.** Der Rechner nennt an keiner Stelle einen Betrag.

## 2. Herkunft jeder Regel

| Regel | Quelle |
|---|---|
| Breiteste/längste Stelle messen, mehrfach, größtes Maß zählt | `content/ratgeber/teppichboden/teppichboden-richtig-ausmessen.html`, Abschnitt "Den Raum ausmessen" |
| Rollenbreiten 400/500 cm üblich | dieselbe Datei, Abschnitt "Die Breite kommt von der Rolle, nicht vom Raum"; auch `rollenbreite-und-bahnen-planen.html`, Abschnitt "Warum die Rollenbreite über Nähte entscheidet" |
| Zugabe 10–20 cm auf die Länge | `teppichboden-richtig-ausmessen.html`, Abschnitt "Die Länge bekommt 10 bis 20 cm Zugabe" |
| Rechenbeispiel 350 × 550 cm → 400 cm × 570 cm = 22,8 m² | dieselbe Datei, Abschnitt "Rechenbeispiel" — dient als Testfall in `qa/tests/boden-rechner.test.mjs` |
| Breite und Länge dürfen getauscht werden ("den Teppichboden drehen") | `teppichboden-richtig-ausmessen.html`, Abschnitt "Breite und Länge tauschen"; vertieft in `rollenbreite-und-bahnen-planen.html` |
| Alle Varianten vergleichen, die passende mit dem kleinsten Verschnitt gewinnt | `rollenbreite-und-bahnen-planen.html`, Abschnitt "Wann die breitere Rolle die bessere Wahl ist" |
| Rechenbeispiel 350 × 480 cm → gedreht auf 500 cm günstiger als 400 cm | dieselbe Datei, Abschnitt "Zwei Beispiele: 400 oder 500 cm?", Beispiel 2 — zweiter Testfall |
| Passt keine Ausrichtung, entsteht eine Naht; Materialbedarf dafür ist Beratungssache | `rollenbreite-und-bahnen-planen.html`, Abschnitt "Wenn es ohne Naht nicht geht" |
| Keine Preise auf der Kollektionskarte/im Rechner | `CLAUDE.md`, Abschnitt "Produktdaten" |

Beide Quellartikel sind veröffentlicht (`status: veroeffentlicht` in den
zugehörigen `content/ratgeber/teppichboden/*.json`) und im Shop unter
`/blogs/ratgeber-teppichboden/...` live; die Section verlinkt sie über die
echten `blogs`/`articles`-Objekte, nicht über einen fest verdrahteten Pfad.

## 3. Was bewusst NICHT gebaut wurde

**Kein Kleber-, Grundierungs- oder Spachtelmassenrechner.** Der Verbrauch
dieser Produkte hängt am jeweiligen Hersteller-Produkt, nicht an einer
allgemeinen Formel. Der freigegebene Artikel
`content/ratgeber/teppichboden/teppichboden-verlegen-lose-fixieren-oder-kleben.html`
sagt das ausdrücklich: „Werkzeug, Auftragsmenge und Einlegezeit gibt der
Kleberhersteller vor" und „Ob Band, Fixierung oder Kleber für Ihren
Untergrund geeignet sind, steht in den Angaben des jeweiligen Herstellers."
Es gibt in keinem freigegebenen Artikel eine Verbrauchszahl (kg/m²,
g/m² o. Ä.) für Kleber, Grundierung oder Spachtelmasse — jede Zahl, die ein
Rechner hier ausgeben würde, wäre erfunden. Das deckt sich mit
`ARCHITECTURE.md`, Abschnitt 4.4 ("Solange dazu keine belegten Werte
vorliegen, wäre jede Zahl erfunden").

Sollten Hersteller-Verbrauchswerte je Produkt vorliegen (z. B. als
Produkt-Metafeld), wäre ein solcher Rechner ein eigenes, produktgebundenes
Feature auf der Produktseite — kein allgemeiner Ratgeber-Rechner, weil der
Wert je nach gewähltem Kleber/Grundierung/Spachtelmasse unterschiedlich ist.
Das ist ein offener Punkt für den Inhaber, keine Aufgabe dieses Rechners.

**Kein Rechner für L-förmige Räume oder mehrere Räume gemeinsam.** Der
Ausmess-Artikel beschreibt zwei Wege für L-förmige Räume (umschließendes
Rechteck vs. zwei Bahnen), nennt dafür aber ausdrücklich keine Formel,
sondern verweist auf die persönliche Beratung mit Skizze. Der Rechner bildet
deshalb nur den rechteckigen Einzelraum ab, den beide Quellartikel
durchrechnen.

**Keine automatische Bahnenplatzierung oder Nahtposition.** Wie viele Bahnen
bei mehreren Räumen mit gleicher Florrichtung tatsächlich gebraucht werden
und wo die Naht am besten liegt, hängt vom Grundriss ab
(`rollenbreite-und-bahnen-planen.html`, Abschnitt "Wenn es ohne Naht nicht
geht") und ist deshalb im Rechner nur ein Hinweis mit Link, keine Zahl.

## 4. Verhältnis zum Produkt-Rechner

`blocks/tp-rollware-rechner.liquid` (Produktseite) und dieser Rechner
(Ratgeber) sind bewusst getrennt und bleiben es:

| | Produkt-Rechner | Boden-Rechner (dieser) |
|---|---|---|
| Ort | Produktseite | `/pages/boden-rechner` |
| Rechnet | Preis zum echten Variantenpreis, legt in den Warenkorb | Materialbedarf, keine Preise |
| Rollenbreite | aus der gewählten Produktvariante | Section-Einstellung, unabhängig vom Produkt |
| Zweck | Kaufabschluss | Planungshilfe vor der Kaufentscheidung |

Der Boden-Rechner verweist am Ende (Knopf "Passende Teppichböden ansehen")
auf eine Kollektion, in der der Kunde dann mit dem Produkt-Rechner
weiterrechnet — er ersetzt ihn nicht.
