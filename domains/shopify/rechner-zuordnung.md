# Welcher Rechner gehoert auf welche Produktseite

Stand 2026-09-09, gegen alle 401 aktiven Produkte im Theme-Entwurf geprueft.
Diese Datei existiert, damit die immer wiederkehrende Frage "fehlt da nicht ein
Rechner?" nicht jede Sitzung neu untersucht werden muss. Wer sie aendert, hat
vorher gemessen.

## Die Zuordnung

| Warengruppe | Rechner | Bedingung im Code |
|---|---|---|
| Teppichboden, Vinyl von der Rolle, Linoleum | Rollenrechner (`tp-rollware-rechner`) | belegte `custom.rollenbreite` an Variante oder Produkt |
| Klickvinyl, Klebevinyl, Teppichfliesen | Paketrechner (`paket-auswahl`) | belegtes `custom.qm_pro_paket` |
| Sockelleisten | Mengenhilfe, Modus `stange` | belegte `custom.stangenlaenge` |
| Profile, Uebergangsschienen | Mengenhilfe, Modus `stange`/Profil | Produktoption heisst exakt "Laenge", Wert mit cm oder m |
| Unterlagen je lfm / je m2 / Gebinde | Mengenhilfe, Modi `lfm`/`qm`/`gebinde` | Einheit steht in der Variantenbezeichnung |
| alles Uebrige im Zubehoer | keiner | keine belegte Mengeneinheit |

Kein Produkt hat zwei Rechner. Die Mengenhilfe liegt in
`blocks/tp-zubehoer-menge.liquid` und deckt vier Faelle ab; sie rendert still
nichts, wenn keiner zutrifft.

## Drei Faelle, die bewusst keinen Rechner haben

Sie sehen nach Luecken aus und sind keine. Wer sie doch bauen will, braucht
zuerst Daten - nicht Code.

**1. Kleber und Bauchemie bekommen keinen Verbrauchsrechner.**
Der Verbrauch steht zwar in jeder Produktbeschreibung, ist aber nicht
rechenbar:

- Er ist mehrdeutig. `JK 27`: "1.) 300 g/m2 2.) 350 g/m2 3.) 450 g/m2" - die
  Nummern stehen fuer Zahnungen bzw. Belagsarten, die im Shop nirgends erklaert
  sind. Ein Rechner muesste eine Zeile waehlen, und jede Wahl waere geraten.
- Er ist oft eine Spanne (`UZIN Unifix`: 100-200 g/m2).
- Bei Spachtelmassen haengt er an der Schichtdicke (`JK 13`: 1,5 kg/m2 pro mm),
  braucht also eine zweite Eingabe, die der Kunde nicht kennt.
- Dichtstoffe rechnen in laufenden Metern Fuge bei einem bestimmten Fugenmass
  ("bei 5 x 5 mm ca. 12-15 lfm pro Kartusche"), nicht in Flaeche.

Ein Rechner waere hier kein Service, sondern eine Zahl, auf die sich niemand
berufen kann. Voraussetzung fuer eine spaetere Umsetzung ist ein gepflegtes
Metafeld je Produkt mit **einem** verbindlichen Wert - keine Textextraktion aus
der Beschreibung.

Ausnahme, die deshalb schon laeuft: `UZIN U 3000` nennt die Reichweite direkt in
der Variantenbezeichnung ("Set - 125 qm, 16 kg") und ist vom Hersteller belegt.
Diese eine Variante rechnet als Gebinde; die Variante "RollFix 10 kg" ohne
Reichweite zeigt korrekt keinen Rechner.

**2. Die unterschiedlichen Nachkommastellen im Paketrechner sind Absicht.**
Klickvinyl zeigt "30,272 m2", Klebevinyl "20,04 m2". Die Anzahl der Stellen
folgt der Praezision von `custom.qm_pro_paket` (siehe `sqmDecimals` in
`blocks/paket-auswahl.liquid`). Bei 1,892 m2 je Paket auf zwei Stellen zu runden
wuerde die angezeigte Bestellmenge falsch machen - 16 Pakete waeren dann
30,24 statt 30,272 m2. Nicht vereinheitlichen.

**3. `templates/product.teppich.json` wird von keinem aktiven Produkt genutzt.**
Geprueft ueber alle 401 aktiven Produkte: der Wunschmass-Rechner
(`tp-teppich-wunschmass`) rendert nirgends. Alle 50 Teppichboeden laufen ueber
den Rollenrechner, was fuer Meterware richtig ist; das Wunschmass-Template
zielt auf zugeschnittene Teppiche, die es im Sortiment derzeit nicht gibt.
Das Template ist damit vorbereitete, aber ungenutzte Arbeit - kein Defekt.
Nicht loeschen, ohne zu klaeren, ob solche Produkte noch kommen.

## Nachpruefen

Die Zuordnung laesst sich ohne Klickarbeit messen: Produktseiten abrufen und auf
die Marker pruefen - `data-map=` (Mengenhilfe), `carpet-package-` (Paketrechner),
`tp-rwc-` (Rollenrechner).

Nicht auf `name="laenge"` pruefen: Dieser String steht in einem
Accessibility-Skript im Layout und damit auf **jeder** Seite. Am 2026-09-09 hat
genau dieser Marker faelschlich gemeldet, Kleber und Reiniger haetten einen
Rollenrechner.

Ebenso beachten: Nach einem Theme-Push liefert das Shopify-CDN Produktseiten
noch eine Weile aus dem Cache. Ohne `?cb=<zeitstempel>` sieht eine Stichprobe
aus, als waere die Aenderung nur bei einem Teil der Produkte angekommen.
