# Marketingcodes und wechselnde Shop-Aktionen

Stand 2026-09-21 · gehört zu `README.md` in diesem Ordner.
Keine Rabatthöhe, kein Produkt und keine Laufzeit in diesem Dokument ist eine
Entscheidung – das sind Inhabersachen. **Echte Codes stehen nie im Repository**
(öffentlich); hier nur Platzhalter.

## Geschäftsregel

Ein Rabattcode wirkt nicht auf bereits reduzierte Ware und nicht zusammen mit
einem anderen Code.

## So bildet Shopify das zuverlässig ab (ohne App)

1. **Interne Kollektion** `intern-regulaerer-preis` („Intern: Regulärer Preis
   (rabattcode-fähig)"), automatisch, Regel *Preis reduziert: nicht gesetzt*,
   **in keinem Vertriebskanal veröffentlicht** (also unsichtbar, nicht in der
   Sitemap). Shopify pflegt sie selbst: Bekommt ein Produkt einen Streichpreis,
   fällt es heraus; wird der Streichpreis entfernt, kommt es zurück.
2. **Jeder Marketingcode gilt nur für diese Kollektion** (`customerGets.items.collections`).
3. **Jeder Marketingcode kombiniert mit nichts** (`combinesWith`: Produkt-, Bestell-
   und Versandrabatte alle `false`). Shopify lässt dann nur einen Code zu.

Belegt am 2026-09-21 im echten Warenkorb, siehe `README.md` Abschnitt 5.

**Bekannte Grenze:** Die Kollektionsregel arbeitet je Produkt, nicht je Variante.
Ein Produkt, bei dem nur *ein Teil* der Varianten einen Streichpreis hat, bleibt in
der Kollektion – der Code würde dann auch die reduzierten Varianten treffen.
Deshalb gilt: **Eine Aktion setzt den Streichpreis immer auf alle Varianten eines
Produkts.** Welle 1 hält das ein (783 von 783 Varianten).

**Zweite Grenze:** Nach `aktion.ende` verschwindet der Streichpreis aus der Anzeige,
der reduzierte Preis bleibt aber stehen, bis er zurückgestellt ist (#413). Solange
bleibt das Produkt für Codes gesperrt. Das ist gewollt: Es ist ja noch reduziert.

## Ein Code je Kanal – Namensregel

Der Kunde sieht ein freundliches Wort, intern steht der Kanal im **Titel** des
Rabatts. Auswertung läuft über den Titel/Code, nicht über Erinnerung.

| Feld | Regel | Beispiel (Platzhalter) |
|---|---|---|
| Titel (intern) | `KANAL · Kampagne · JJJJ-MM` | `FLYER · Herbstaktion Oranienburg · 2026-10` |
| Code (sichtbar) | kurz, sprechbar, kein Technikname | `<WORT><ZAHL>` |
| Kanäle | `NEWSLETTER`, `FLYER`, `ZEITUNG`, `LADEN`, `QR`, `MUSTER`, `WARENKORB`, `KAMPAGNE` | |
| Laufzeit | immer mit Enddatum | |
| Nutzung | „einmal pro Kunde" an; Gesamtlimit je Kanal nach Bedarf | |

Für gedruckte Kanäle zusätzlich ein **Link mit Quelle**, damit auch Besuche ohne
Kauf dem Kanal zugeordnet werden (QR-Code auf diesen Link):

```
https://www.teppich-paradies.net/discount/<CODE>?redirect=/collections/teppichboden&utm_source=flyer&utm_medium=print&utm_campaign=2026-10-herbst
```

`/discount/<CODE>` legt den Code automatisch in den Warenkorb. `utm_*` landet in
Shopify unter Statistiken → Berichte → Sitzungen/Umsatz nach Kampagne und an der
Bestellung („Conversion-Details"). Feste Werte: `utm_medium` = `print`, `email`,
`laden`, `qr`; `utm_source` = Kanalname klein; `utm_campaign` = `JJJJ-MM-name`.

## Vorlage zum Anlegen (Shopify-MCP, `graphql_mutation`)

Platzhalter in spitzen Klammern kommen vom Inhaber. `percentage` ist ein Anteil
(0.10 = 10 %).

```graphql
mutation Marketingcode($input: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}
```

```json
{ "input": {
  "title": "<KANAL> · <Kampagne> · <JJJJ-MM>",
  "code": "<CODE>",
  "startsAt": "<ISO-Datum>", "endsAt": "<ISO-Datum>",
  "appliesOncePerCustomer": true, "usageLimit": null,
  "context": { "all": "ALL" },
  "combinesWith": { "productDiscounts": false, "orderDiscounts": false, "shippingDiscounts": false },
  "customerGets": {
    "value": { "percentage": <ANTEIL> },
    "items": { "collections": { "add": ["gid://shopify/Collection/703369085262"] } }
  }
} }
```

Gegenprobe nach dem Anlegen (nicht `userErrors: []`): Aktionsartikel + regulären
Artikel in den Warenkorb, `POST /cart/update.js {"discount":"<CODE>"}`, in
`/cart.js` darf nur die reguläre Zeile eine `line_level_discount_allocation` tragen.

**Auswertung:** Statistiken → Berichte → „Verkäufe nach Rabatt"; je Code Umsatz,
Bestellungen, Rabattsumme. Über den Titel ist der Kanal sofort lesbar.

## Wechselnde Shop-Aktionen

### Geprüfte Wege

| | A · Streichpreis + `aktion.*` (heute) | B · Automatischer Shopify-Rabatt |
|---|---|---|
| Start/Ende zentral | ja (`aktion.start/ende`), Anzeige endet von selbst | ja, nativ |
| Preis stellt sich selbst zurück | **nein** – Rückstellen ist ein eigener Schritt (#413) | ja |
| Produktseite, Karte, €/m², Konfigurator | fertig und getestet (S-20, S-30, S-32) | müsste komplett nachgebaut werden – Shopify zeigt automatische Rabatte erst im Warenkorb |
| Merchant Center | `sale_price` kommt aus dem Streichpreis (#415 prüft das) | Feed zeigt den vollen Preis, Seite den reduzierten → Preisabweichung, Ablehnungsrisiko |
| Strukturierte Daten | stimmen mit dem sichtbaren Preis überein | liefen auseinander |
| Stapeln mit Codes | gelöst über die interne Kollektion | nativ |

**Empfehlung: bei A bleiben.** B spart das Zurückstellen, zerreißt aber die eine
Preiswahrheit über Seite, Feed und Schema – genau dort, wo der Shop am
empfindlichsten ist. Der Schwachpunkt von A ist rein betrieblich und lässt sich
schließen (siehe „Zentrale Steuerung für A").

### Verhältnis zum Aktionskonzept aus PR #424

In PR #424 liegt `domains/shopify/aktionssystem-konzept.md` mit der Empfehlung
**Hybrid**: `aktion.*` bleibt die Anzeigequelle, abgerechnet wird über einen
automatischen Rabatt mit gleichem Zeitraum, ein Guard hält beides synchron. Das
spart das Setzen und Zurückstellen hunderter Variantenpreise. Beide Papiere sind
sich einig in: `aktion.*` bleibt, keine Countdowns, 30-Tage-Referenzpreis beachten,
Produkte rotieren. Der Unterschied ist allein die Abrechnungsquelle – und das
Entscheidungskriterium ist das Merchant Center: Beim Hybrid steht im Feed der
volle Preis, auf der Seite der reduzierte. Ohne geklärte Feed-Strategie
(`sale_price` bzw. Merchant-Promotions, dort als offene Frage geführt) ist A der
sichere Weg; ist sie geklärt, ist der Hybrid der wartungsärmere.

**Die Marketingcodes funktionieren mit beiden Wegen:** Bei A hält die interne
Kollektion Aktionsware heraus. Beim Hybrid greift Shopifys eigene Regel – ein Code,
der mit nichts kombiniert, und ein automatischer Rabatt, der mit nichts kombiniert,
werden nie addiert; Shopify wendet den für den Kunden besseren an. Für den Hybrid
muss der automatische Rabatt deshalb ebenfalls `combinesWith` = alles `false`
tragen. Das gehört in dessen Testplan (Phase 2 dort).

### Zentrale Steuerung für A (Vorschlag, nicht gebaut)

Ein **Aktionsplan** als eine Datei (lokal, nicht im öffentlichen Repo, solange
Preise drinstehen): je Welle Produkte oder Kollektion, Prozentsatz, Start, Ende,
Klasse. Ein Lauf „Start" setzt Streichpreis = bisheriger Preis, neuen Preis und
`aktion.*` auf **allen** Varianten; ein Lauf „Ende" stellt zurück und prüft gegen
die gesicherten Ausgangspreise. Heute macht das eine Sitzung über den Shopify-MCP
(so lief Welle 1). Vollautomatisch per geplanten Job geht es erst mit einem
Admin-Token mit Schreibrecht (`shpat_`, siehe #34) – und Preisänderungen bleiben
freigabepflichtig.

Niemand ändert dafür alle zwei Wochen Theme-Dateien: Badge, Streichpreis,
Aktionshinweis und die Regel „nicht mit kostenlosem Verlegeservice" hängen allein
an den Metafeldern.

### Was ein Zwei-Wochen-Rhythmus beachten muss

- **Referenzpreis:** Ein Streichpreis muss der niedrigste Preis der letzten 30 Tage
  sein (Preisangabenrecht; bestehende Shop-Regel „nur der belegte Vorpreis"). Wer
  dieselben Produkte im Zwei-Wochen-Takt reduziert, hat keinen gültigen höheren
  Vorpreis mehr. Also **Produkte rotieren, nicht denselben Artikel wiederholen** –
  mindestens 30 Tage Abstand je Produkt. Rechtliche Bewertung bleibt beim Inhaber.
- **Keine Countdowns, kein „nur heute".** Das Enddatum darf genannt werden
  („bis 18.10."), weil es stimmt. Kein Zähler, keine künstliche Verknappung.
- **Umfang:** bestehende Regel – höchstens rund ein Fünftel einer Kollektion,
  Premium ohne Rabatt.
- **Merchant Center:** Preisänderungen brauchen bis zu einem Tag im Feed. Aktionen
  nicht untertägig starten/enden lassen; nach Start und Ende `sale_price` im
  Merchant Center stichprobenhaft prüfen (#415).
- **Warenkorb/Checkout:** arbeiten mit dem echten Variantenpreis, keine
  Sonderlogik. Im Warenkorb erscheint der Streichpreis nur bei aktiver Aktion.
- **Tracking:** Aktionsumsatz = Umsatz der Produkte mit aktiver `aktion.klasse` im
  Zeitraum (Bericht „Verkäufe nach Produkt", gefiltert). Marketingcodes treffen
  diese Produkte nie – die beiden Messungen überschneiden sich nicht.

### Darstellung einer Aktion außerhalb der Produktseite

Zentral und ohne Dateieingriff möglich über die vorhandene Top-Leiste
(`sections/tp-topbar.liquid`, Texte im Theme-Editor) und eine Aktions-Kollektion
(automatisch, Regel *Preis reduziert: gesetzt*), die verlinkt wird. Beides ist
eine Darstellungsentscheidung des Inhabers und nicht umgesetzt.
