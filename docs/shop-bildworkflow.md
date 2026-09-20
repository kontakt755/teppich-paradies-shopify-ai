# Bild-Workflow Teppiche nach Mass (S-13 / S-14)

Stand 2026-09-20. Dieser Workstream blockiert nichts anderes. Oberste Regel des Inhabers:
Materialtreue vor Schoenheit - reale Farbe, reale Struktur, Flor/Schlinge/Faser unveraendert,
realistische Kettelung. Fable erzeugt keine Bilder in Masse.

## 1. Bestand (gemessen)
- 49 Teppiche, 477 Bilder fuer 477 Farbvarianten (1:1), alle 1400 x 1400, Name `<handle>-<Farbcode>.jpg`.
- Genau EIN Bildtyp: Draufsicht auf ein Rechteck vor heller Wand, gezeichnete Kante, weicher Schatten.
- Der zugehoerige Teppichboden hat je Farbe ein ECHTES Belagsfoto (1600 x 1600).

## 2. Bewertung der Stichprobe (Fable, 3 Teppichbilder + 1 Belagsfoto angesehen)
| Kriterium | Befund |
|---|---|
| Farbe, Faser, Schlinge | gut - die Flaeche ist ein Ausschnitt des echten Belagsfotos, nichts erfunden |
| Massstab | FALSCH - die Schlinge ist im "Teppich" so gross wie im Nahfoto. Ein 80 x 150 cm Teppich haette eine viel feinere Struktur; das Bild wirkt wie ein Muster-Abschnitt oder eine Fussmatte |
| Kettelung | schwach - flacher Streifen mit Linienmuster, kein Garnrelief, keine umlaufende Naht, Ecken hart, Garnfarbe nur ungefaehr |
| Raeumlichkeit | schwach - haengt optisch an einer Wand (senkrechte Fugen), keine Teppichdicke, kein Boden |
| Aussagewert | Das Bild beantwortet "welche Farbe", aber nicht "wie sieht die Kante aus" und nicht "wie wirkt er im Raum" |

Das Inventar-Urteil des Haiku-Workers ("professionell fotografiert") war falsch und ist verworfen.

## 3. Zielbild: drei Bildtypen je Produkt, nicht 477 neue Farbbilder
| Typ | Zweck | Quelle | Aufwand |
|---|---|---|---|
| A. Struktur in Originalaufnahme | Materialtreue, Flor/Schlinge | vorhandenes Belagsfoto des Teppichbodens, je Farbe | ERLEDIGT per Theme-Block `tp-teppich-struktur` (keine neuen Bilder) |
| B. Kettelkante nah (Ecke, schraeg) | zeigt, was "rundum gekettelt" heisst | ECHTES Foto, 1 je Qualitaet (49), nicht je Farbe | Werkstatt, siehe 4 |
| C. Farbbild (heutige Draufsicht) | Farbwahl, Variantenbild | bleibt vorerst | spaeter: Massstab korrigieren (Struktur kleiner kacheln) statt neu erzeugen |
| D. Groessenwirkung im Raum | Kaufsicherheit | zurueckgestellt (S-16, Entscheidung Inhaber 2026-09-20) | - |

## 4. Typ B: echtes Foto schlaegt jedes Bildmodell
Die Kettelung entsteht in der eigenen Werkstatt - das Original liegt also vor. Ein Foto ist
materialtreuer, billiger und schneller als jede Generierung und braucht keine Abnahme auf Echtheit.
Aufnahme-Standard (Handy reicht):
- Tageslicht am Fenster, kein Blitz, kein Mischlicht; Graukarte oder weisses Blatt im ersten Bild fuer den Weissabgleich.
- Ecke des gekettelten Stuecks, Kamera 30-40 Grad von oben, Kante laeuft diagonal durchs Bild, heller neutraler Boden.
- Ein zweites Bild senkrecht von oben mit Massband an der Kante (zeigt die Breite der Kettelung).
- Dateiname `<handle>-kante-1.jpg`, mindestens 2000 px, unbearbeitet abgeben; Zuschnitt und Weissabgleich macht ein Worker.
- Reihenfolge: zuerst die 10 Qualitaeten mit den meisten Farben (vallora, kontura, vantana, torvana, alvento, tessara, sentira, reganza, nuvara, vireno), der Rest, wenn ohnehin ein Stueck gekettelt wird.

## 5. Wenn kein echtes Stueck vorliegt: Bildmodell nur unter Auflagen
Erlaubt ist ausschliesslich Bild-zu-Bild mit dem echten Belagsfoto als Referenz - nie Text-zu-Bild.
- Das Modell darf nur Kante, Licht und Untergrund ergaenzen. Die Belagsflaeche wird danach wieder durch das Originalfoto ersetzt (Maske), damit Flor und Farbe pixelgleich bleiben.
- Abnahme je Bild gegen das Original: Farbe (Delta sichtbar?), Schlingengroesse, Faserglanz, Kettelgarn plausibel. Im Zweifel verwerfen.
- Kennzeichnung im Alt-Text als "Beispieldarstellung der Kettelkante".
- Testreihe vor jeder Serie: 3 Qualitaeten (Schlinge grob: woolara, Velours: velory, Sisal-Optik: sisola), je 2 Werkzeuge, Ergebnis nebeneinander mit dem Original. Kosten vorher nennen, Freigabe des Inhabers einholen (Bild-Credits sind ein Kauf).
- Werkzeugwahl erst nach der Testreihe; Kandidaten sind Bild-zu-Bild-Editoren mit Referenzbild und Inpainting. Kein Werkzeug wird hier vorab empfohlen - ohne Test waere das geraten.

## 6. Technik im Theme
- `blocks/tp-teppich-struktur.liquid`: zeigt zur gewaehlten Farbe das Belagsfoto des Teppichbodens (`service.einfass_basis`, Zuordnung ueber option1), wechselt mit der Farbwahl. Test: `qa/tests/tp-teppich-struktur.test.mjs`.
- Typ-B-Fotos kommen als normale Produktmedien ans Teppich-Produkt (Position 2), nicht an die Varianten - dann erscheinen sie in der Galerie bei jeder Farbe.

## 7. Offene Schritte
1. Inhaber: 10 Kantenfotos nach Abschnitt 4 (oder Bescheid, dass keine Stuecke vorliegen -> Testreihe nach Abschnitt 5 freigeben).
2. Worker: Fotos zuschneiden, Weissabgleich, hochladen, Alt-Texte.
3. Spaeter: Massstab der Farbbilder korrigieren (Typ C).
