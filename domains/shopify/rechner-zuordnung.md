# Welcher Rechner gehoert auf welche Produktseite

Stand 2026-09-09, gegen alle 401 aktiven Produkte im Theme-Entwurf geprueft.
Zubehoer am 2026-09-11 erneut gegen alle 43 Produkte der Kollektion `zubehoer`
abgeglichen (Admin API, nur lesend).
Diese Datei existiert, damit die immer wiederkehrende Frage "fehlt da nicht ein
Rechner?" nicht jede Sitzung neu untersucht werden muss. Wer sie aendert, hat
vorher gemessen.

## Die Zuordnung

| Warengruppe | Rechner | Bedingung im Code |
|---|---|---|
| Teppichboden, Vinyl von der Rolle, Linoleum | Rollenrechner (`tp-rollware-rechner`) | belegte `custom.rollenbreite` an Variante oder Produkt |
| Klickvinyl, Klebevinyl, Teppichfliesen | Paketrechner (`paket-auswahl`) | belegtes `custom.qm_pro_paket` |
| Sockelleisten | Mengenhilfe, Modus `stange` | belegte `custom.stangenlaenge` |
| Klebe- und Verlegebaender | Mengenhilfe, Modus `stange`/Rolle | belegte `custom.bandlaenge` (vorbereitet, noch nicht angelegt) oder Bezeichnung "Rolle 70 mm × 25 m" |
| Profile, Uebergangsschienen | Mengenhilfe, Modus `stange`/Profil | Produktoption heisst exakt "Laenge", Wert mit cm oder m |
| Gebinde mit Reichweite laut Hersteller | Mengenhilfe, Modus `gebinde`/Reichweite | belegte `custom.reichweite_m2` an der Variante (vorbereitet, noch nicht angelegt) |
| Unterlagen je lfm / je m2 / Gebinde | Mengenhilfe, Modi `lfm`/`qm`/`gebinde` | Einheit steht in der Variantenbezeichnung |
| alles Uebrige im Zubehoer | keiner | keine belegte Mengeneinheit |

Kein Produkt hat zwei Rechner. Die Mengenhilfe liegt in
`blocks/tp-zubehoer-menge.liquid`, rechnet in vier Modi und nimmt die erste
belegte Quelle (Reihenfolge im Kopf des Blocks); sie rendert still nichts, wenn
keine zutrifft.

## Zubehoer je Produktgruppe (2026-09-11)

| Gruppe | Produkte | Mengenhilfe | Datenquelle | fehlt |
|---|---|---|---|---|
| Verlege- und Daemmunterlagen | 7 | alle 7 | Bezeichnung (je lfm, je m², Rolle/Faltplatte m², m × cm) | - |
| Profile | 10 | alle 10 | Option "Laenge" | - |
| Verlegeband mit Laenge in der Bezeichnung | 1 | ja, seit 2026-09-11 | "Rolle 70 mm × 25 m" | - |
| Verlegebaender je Breite | 3 | nein | "Verkaufseinheit Rolle 50 m" nur in der Beschreibung | `custom.bandlaenge` anlegen und befuellen (Werte belegt) |
| Trockenklebstoff auf Rolle | 1 | nein, seit 2026-09-11 | Bezeichnung widerspricht sich (siehe unten) | Bezeichnung korrigieren |
| Reinigungsmittel | 6 | nein | 2 nennen eine Reichweite ("ca.", Spanne), 4 keine | Freigabe der 2 Werte; fuer 4 die Herstellerangabe |
| Kleber und Fixierung | 7 | nur die Set-Variante (Bezeichnung) | Verbrauch in g/m², meist mehrere Zeilen | je Produkt ein verbindlicher Wert |
| Bauchemie | 5 | nein | Spachtel je mm, Dichtstoff je Fugenmass, Grundierung 150 g/m² | Grundierung: Freigabe; Rest bewusst ohne |
| Sauberlauf | 3 | nein | Stueckware mit festem Mass | nichts - ein Stueck ist ein Stueck |

Werte, Quellen und Status je Variante stehen in
`domains/shopify/zubehoer-mengen/` - `metafeld-definitionen.json` (was
anzulegen waere), `bandlaenge.json` und `reichweite.json`. Dort ist
`reichweite_m2` bzw. `bandlaenge_m` das Zielfeld; es traegt nur belegte Werte.
Vorschlaege, Spannen und gerechnete Werte stehen daneben und brauchen die
Freigabe des Inhabers, bevor sie in Shopify landen.

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
der Beschreibung. Dieses Feld ist seit 2026-09-11 vorbereitet
(`custom.reichweite_m2`, je Variante); der Block liest es bereits, es ist aber
weder angelegt noch befuellt. Drei Kandidaten mit genau einem Verbrauchswert
(Grundierung, Linoleumklebstoff, die RollFix-Variante) stehen mit gerechnetem
Vorschlag in `reichweite.json` und warten auf Freigabe.

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

## Eine Bezeichnung, die sich selbst widerspricht, bekommt keinen Rechner

`trockenklebstoff-fuer-bahnenware-rolle-75-cm` heisst "Rolle 75 cm × 25 m
(20 m²)". 0,75 m × 25 m sind 18,75 m², nicht 20. Bis 2026-09-11 las die
Mengenhilfe nur die 20 m² und empfahl bei 40 m² Bedarf zwei Rollen - die
tatsaechlich 37,5 m² decken, falls die Masse stimmen. Welche Angabe falsch ist,
ist aus dem Shop nicht zu klaeren.

Seitdem prueft der Block: Nennt eine Bezeichnung Flaeche **und** Breite ×
Laenge, muessen beide auf 2 Prozent zusammenpassen, sonst gibt es keinen
Rechner. Die Korrektur gehoert in die Bezeichnung, nicht in den Code.

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
