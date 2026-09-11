# Paketinhalt: Stueckzahl und Format je Paketprodukt

Stand 2026-09-10. Gepflegt in Shopify, belegt aus den Jordan-Artikeldaten.

Die Produktseite zeigt seit PR #180 „1 Paket = 5,00 m²" und haengt daran, wenn
vorhanden, „· 20 Fliesen à 50 × 50 cm". Diese Zusatzangabe kommt aus drei
Produkt-Metafeldern, die am 2026-09-10 angelegt und befuellt wurden:

| Metafeld | Typ | Beispiel |
|---|---|---|
| `custom.stueck_pro_paket` | number_integer | `20` |
| `custom.format_cm` | single_line_text_field | `50 × 50 cm` |
| `custom.stueck_bezeichnung` | single_line_text_field | `Fliesen` |

Fehlt eines davon, laesst `snippets/tp-paketinhalt.liquid` die Angabe still weg.
Es gibt keinen Rueckfall und keine Schaetzung — eine erfundene Stueckzahl waere
eine Zusicherung gegenueber dem Kunden, die niemand belegen kann.

## Woher die Zahlen kommen

Jordan nennt die Stueckzahl je Paket nirgends. Wohl aber Laenge und Breite eines
Stuecks sowie den Paketinhalt in m². Die Stueckzahl ist der Quotient:

```
Stueck = (m² pro Paket) / ((Laenge_mm / 1000) × (Breite_mm / 1000))
```

`jordan-paketinhalt-2026-09-10.json` fuehrt je Kombination aus Lieferantenlinie
und Paketflaeche die Rohwerte, den ungerundeten Quotienten und die Abweichung.

**Toleranzregel:** Die Stueckzahl wird nur uebernommen, wenn der Quotient
hoechstens **1,5 %** von einer ganzen Zahl abweicht. Damit wird gerundet, was
offensichtlich ganzzahlig gemeint ist (Jordan rechnet die Paketflaeche selbst
gerundet aus), aber nichts erzwungen, was nicht aufgeht.

**Bezeichnung:** Seitenverhaeltnis ab 3:1 heisst `Planken`, darunter `Fliesen`.
Das trifft die Faelle im Sortiment richtig — 91,4 × 91,4 cm und 98,6 × 49,3 cm
sind Fliesenformate, 121,9 × 18,4 cm ist eine Planke.

## Ergebnis

27 von 28 Kombinationen gehen sauber auf, das entspricht **218 Produkten**.
Die groesste uebernommene Abweichung liegt bei 0,80 % (Bergen, 8 Planken).

**Verona / `LVTDESIGND` (10 Produkte, 1,892 m² pro Paket) — Nachtrag 2026-09-11.**
Die erste Auswertung hatte alle zehn Farben mit dem Beispielartikel `_921`
gleichgesetzt. Je Artikel nachgesehen sind es zwei Formate:

| Artikel | Format laut Artikeldaten | Ergebnis |
|---|---|---|
| `_901` bis `_915` (8 × Eiche) | 125,1 × 18,9 cm, 1,892 m² | 8,002 → **8 Planken**, 0,03 % — gesetzt |
| `_920`, `_921` (Terrazzo) | 85,6 × 42,8 cm, 1,892 m² | 5,164 — **offen** |

Das technische Datenblatt der Qualitaet (Stand 05|2025) nennt fuer die Fliese
85,6 × 42,8 cm **6 Stueck = 2,20 m²** pro Paket. Die 1,892 m² gehoeren rechnerisch
zur Planke und stehen bei den beiden Terrazzo-Artikeln vermutlich irrtuemlich in
den Artikeldaten. Stimmt das Datenblatt, fuehrt der Shop dort eine zu kleine
Paketflaeche: €/m² erscheint zu hoch, der Rechner bestellt zu viele Pakete. Weil
das Preisangabe und Bestellmenge aendert, bleibt `qm_pro_paket` bis zur
Bestaetigung durch den Lieferanten unangetastet; die zwei Produkte tragen keine
Stueckzahl.

Dasselbe Datenblatt nennt fuer die Planke „10 Stueck" bei 1,89 m² — rechnerisch
sind es 8 (10 Planken waeren 2,36 m²). Artikeldaten und Datenblatt stimmen in
Format und Paketflaeche ueberein, die 10 ist die einzige abweichende Angabe. Die
Rueckfrage an den Lieferanten ist vorbereitet (ausserhalb des Repositorys, weil
sie Lieferantendaten enthaelt).

## Wenn neue Paketprodukte dazukommen

1. `custom.qm_pro_paket` setzen (ohne das rendert der Paket-Rechner nichts).
2. Auf der Jordan-Produktseite `Laenge (mm)`, `Breite (mm)` und
   `Inhalt m² pro Paket` ablesen — per `curl` auf `/de-DE/product/<id>`, die ID
   findet die Quicksearch ueber die Artikelnummer.
3. Stueckzahl rechnen, Toleranz pruefen, erst dann die drei Metafelder setzen.
4. Geht es nicht auf: Felder leer lassen und hier als offenen Fall eintragen.
5. `custom.kleinste_bestellmenge` aus der Paketflaeche setzen (siehe unten).

**Je Artikel nachsehen, nicht je Qualitaet.** Eine Qualitaet fuehrt oft mehrere
Formate unter demselben Artikelpraefix (Verona: Planke und Fliese).

## Filter „Kleinste Bestellmenge" (seit 2026-09-11)

Kollektionsseiten filtern nach der Flaeche eines einzelnen Pakets. Quelle ist das
Produkt-Metafeld `custom.kleinste_bestellmenge` (Liste, erlaubte Werte
`bis 1 m²`, `bis 2 m²`, `bis 3 m²`). Die Stufen sind **kumulativ**: ein Paket mit
0,794 m² traegt alle drei Werte, eines mit 1,73 m² `bis 2 m²` und `bis 3 m²`. Wer
„bis 2 m²" waehlt, sieht damit alles, was sich mit hoechstens 2 m² bestellen
laesst. Pakete ueber 3 m² bleiben leer.

Stand 2026-09-11: 227 Paketprodukte, davon 97 mit Wert (bis 1 m²: 4, bis 2 m²: 67,
bis 3 m²: 97).

Der Wert ist aus `custom.qm_pro_paket` abgeleitet und muss mit ihm geaendert
werden. Nach Paketgroesse sortieren kann Shopify nicht (Kollektionen sortieren
nicht nach Metafeldern) — der Filter ist der Ersatz dafuer. Sichtbar ist er erst,
wenn er in der App **Search & Discovery** unter Filter angelegt ist (Quelle:
Produkt-Metafeld „Kleinste Bestellmenge").

Verwandt: `../README.md` (Lieferantenabgleich Jordan/M-Plus) und
`../kleinmengen-dropshipping-2026-09-10.md` (warum das Paket die kleinste
Einheit ist).
