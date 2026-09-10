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

**Offen: Verona / `LVTDESIGND`, 1,892 m² pro Paket** (10 Produkte). Jordan nennt
856 × 428 mm, das ergibt 5,164 Stueck — 3,2 % daneben, und weder 5 noch 6 passen
zur Paketflaeche. Entweder stimmt eine der beiden Jordan-Angaben nicht, oder das
Format weicht ab. Diese zehn Produkte tragen deshalb **keine** Stueckzahl; die
Produktseite zeigt dort nur „1 Paket = 1,892 m²". Klaerung nur ueber den
Jordan-Vertrieb oder das Datenblatt.

## Wenn neue Paketprodukte dazukommen

1. `custom.qm_pro_paket` setzen (ohne das rendert der Paket-Rechner nichts).
2. Auf der Jordan-Produktseite `Laenge (mm)`, `Breite (mm)` und
   `Inhalt m² pro Paket` ablesen — per `curl` auf `/de-DE/product/<id>`, die ID
   findet die Quicksearch ueber die Artikelnummer.
3. Stueckzahl rechnen, Toleranz pruefen, erst dann die drei Metafelder setzen.
4. Geht es nicht auf: Felder leer lassen und hier als offenen Fall eintragen.

Verwandt: `../README.md` (Lieferantenabgleich Jordan/M-Plus) und
`../kleinmengen-dropshipping-2026-09-10.md` (warum das Paket die kleinste
Einheit ist).
