# Gemeinsamer Bestand fuer durchgehende Rollen

## Vorbereiteter Stand

`operations/lib/rollenverbrauch.mjs` berechnet den Zuschnitt in Zentimetern
voller Rollenbreite, getrennt von der verkauften Teppichflaeche. Die Funktion
schreibt keinen Bestand. Die Automatik ist noch nicht aktiviert.

Eine Rolle mit 4 m Breite und 20 m Laenge hat 2000 Bestandseinheiten zu je
1 cm voller Rollenbreite. Ein Teppich 200 x 300 cm verbraucht 200 Einheiten
(8 m2 Rollenmaterial), obwohl der fertige Teppich 6 m2 hat. Danach sind
1800 Einheiten = 18 laufende Meter verfuegbar. Der Reststreifen 100 x 200 cm
wird separat gefuehrt. Bruchteile eines Zentimeters reservieren nach oben.

## Ziel fuer den Checkout

Ein gemeinsamer, getrackter Materialartikel mit Ueberverkaufssperre bildet
den physischen Bestand. Eine Cart-Transform-Function expandiert beide
Verkaufsformen in diesen Materialartikel und einen separaten Preisartikel:

- Materialartikel: `rollenCm` als Menge, Preisanteil 0.
- Preisartikel: eine Einheit mit dem serverseitig berechneten Materialpreis.
- Kettelservice: bisherige Berechnung nach Kantenlaenge.

Die preisbildenden Parameter kommen aus vertrauter Shop-Konfiguration,
nicht aus Kundenattributen. Masse, Verkaufsart, Stueckzahl und Produktzuordnung
werden serverseitig validiert. Der Konfigurator muss bei diesen Produkten
eine einzelne Elternposition je Zuschnitt statt der bisherigen Flaechenmenge
uebergeben. Der Warenkorb darf die expandierten Mengen nicht eigenstaendig
zuruecksetzen. Beide Seiten zeigen den gemeinsamen Materialbestand.

Shopify uebernimmt die Bestandsreservierung und prueft gemeinsame Komponenten
beider Angebote im Checkout. Ein blosses Nachziehen zweier separater
Variantenbestaende nach Bestelleingang verhindert keine parallelen Ueberverkaeufe.

## Betriebsbedingungen vor Aktivierung

Der aktuelle Shop nutzt Basic. Eigene Shopify Functions in Custom Apps
sind nur auf Plus installierbar. Auf Basic ist eine passende oeffentliche
Functions-App erforderlich; diese muss dynamische Komponentenmenge und
Komponentenpreis aus den geprueften Massen unterstuetzen.

Quellen:
- https://shopify.dev/docs/apps/build/functions
- https://shopify.dev/docs/api/functions/latest/cart-transform

Eine kostenpflichtige App, ihre konkreten Zugriffsrechte und der Tarif sind
vom Inhaber freizugeben. Vorhandene Functions und Warenkorbgruppierung vorher
auf Kompatibilitaet pruefen. Keine pauschale Mengenregel pro Flaecheneinheit:
der Verbrauch haengt auch von der Breite des Zuschnitts ab.

Ladenverkaeufe werden in derselben Bestandsquelle als laufende Meter gebucht.
Ein einfaches Eingabefeld rechnet die Meter in die Bestandseinheit um. Der
Control-Center-Zugang braucht dafuer `write_inventory` (derzeit nicht erteilt).
Buchungen brauchen atomare Bestandsaenderung, Idempotenz und Gegenprobe;
Antwortverlust darf nicht zu einer zweiten Abbuchung fuehren.

Bei Stornierung vor dem Schnitt kann eine Reservierung freigegeben werden.
Bereits zugeschnittene oder retournierte Stuecke duerfen nicht wieder als
volle, durchgehende Rolle eingebucht werden. Sie sind eigene Reststuecke.

## Erforderliche Abnahme

2 x 3 m -> minus 2 m; 4 x 2 m -> minus 2 m; 2,5 x 7 m -> minus 7 m;
mehrere Stuecke und gemischter Warenkorb; gleichzeitige Bestellungen kurz
vor Rollenende; direkter/manipulierter Warenkorb; Stornierung vor/nach Zuschnitt;
Ladenverkauf waehrend einer Onlinebestellung; Antwortverlust und Wiederholung.

Bis zur echten Checkout-Abnahme bleibt das separat gefuehrte Massangebot
als Entwurf. Die Rollenware bleibt mit ihrem vorhandenen m2-Bestand bestellbar.

## Stand 10.10.2026: Sofortkauf ueber ein Zuschnitt-Bundle (Inhaber: Variante B)

Der gekettelte Teppich nach Mass wird sofort gekauft, ohne Anfrage, aus
demselben Rollenbestand wie die Meterware. Statt einer Cart-Transform-Function
(nur Plus oder fremde App) bucht ein verstecktes Shopify-Bundle den
Rollenverbrauch im Checkout ab:

- Bundle-Produkt "Zuschnitt von der Rolle" mit einer Option `Rollenlänge`
  (`50 cm` bis `1000 cm` im 25-cm-Raster, 39 Varianten). Einzige Komponente
  ist die Rollenware; je Variante `cm / 25` Einheiten (1 Einheit = 1 m2 =
  25 cm voller 4-m-Breite). Angelegt ueber `productBundleCreate` mit
  `quantityOption` (Multipack). Der Bestand jeder Variante folgt aus der
  Rollenware (80 Einheiten -> 50 cm: 40, 200 cm: 10, 1000 cm: 2).
- Das Massprodukt verweist mit `custom.zuschnitt_von_rolle` auf das Bundle.
  Der Einfass-Konfigurator legt je Teppich die kleinste Variante, die den
  Verbrauch deckt, mit 0 EUR in denselben `/cart/add.js`-Aufruf (Property
  `Rollenzuschnitt`, gleiche `_Gruppe`); die Hauptzeile traegt
  `_Rollenzuschnitt` (cm). Preis und Grundpreis bleiben zentimetergenau
  (57 EUR/m2 x Flaeche, Kettelservice je cm Kante).
- Verbrauch: passt die laengere Seite quer in die Rolle, wird nur die kuerzere
  abgeschnitten, sonst die laengere (`TPMass.rollenZuschnitt`, gleiche Regel wie
  `operations/lib/rollenverbrauch.mjs`). Reicht der Restbestand nicht, sperrt der
  Konfigurator mit der verbleibenden Rollenlaenge.
- Warenkorb: Bundle-Zeile ist eine Service-Zeile der Teppichgruppe (wird
  gemeinsam entfernt). Fehlt sie oder deckt sie den Verbrauch nicht, sperrt
  `snippets/tp-cart-gruppe.liquid` den Checkout (Grund `zuschnitt-fehlt`).
- Auffangnetz wie #357: Die interne Bestellmail rechnet den Verbrauch aus den
  Massen nach und vergleicht ihn mit den abgebuchten Einheiten der
  Komponentenzeile ("ROLLENBESTAND NICHT VOLL ABGEBUCHT – NICHT ZUSCHNEIDEN",
  "ZUSCHNITT VON DER ROLLE OHNE TEPPICH"). Die Komponentenzeile steht als
  "Bestandsabgang zum Massteppich" da und wird nicht als Meterware geschnitten.
- Control Center: `orders.mjs` liest `lineItemGroup`; Komponenten sind
  `masspruefung.status = 'bestand'`, gehen nicht in den Einkauf, und der
  Teppich bekommt dieselbe Bestandspruefung wie in der Mail.

### Machbarkeitsprobe (10.10.2026, ohne Bestellung)

Kein Entwicklungsshop vorhanden (nur der Live-Shop ist in der CLI
angemeldet). Probe deshalb mit einem nicht veroeffentlichten Entwurfsprodukt:

| Punkt | Ergebnis |
|---|---|
| Multipack mit einer Komponente (`productBundleCreate` + `quantityOption`) | bestanden: 39 Varianten, Komponentenmengen 2..40, `requiresComponents: true`, Bestand aus der Rollenware berechnet, Status DRAFT, in keinem Kanal |
| Ausweg zweite Komponente | nicht noetig |
| Bundle-Preis 0 EUR | offen: Shopify legt die Summe der Komponenten als Preis an (41,95 x Einheiten); die Umstellung auf 0,00 EUR braucht die Freigabe des Inhabers (Preisaenderung) |
| Gemischter Warenkorb gegen den Bestand | offen: Entwurfsprodukte lassen sich nicht in den Warenkorb legen; nur mit veroeffentlichtem Bundle pruefbar |
| Bestellzeilen, Properties der Komponente, Liquid der Mail | offen: nur mit echter Bestellung belegbar (Testkauf nicht freigegeben); die Mail deckt beide Darstellungen ab |
| Storno mit Wiedereinlagerung bucht zurueck | offen: nur mit Bestellung; laut Doku auf Komponentenebene |

### Vor der Veroeffentlichung (Reihenfolge)

1. Freigabe Inhaber: Bundle-Varianten auf 0,00 EUR; Bestandsfuehrung am
   Massprodukt aus (den Bestand fuehrt nur die Rollenware);
   `custom.zuschnitt_von_rolle` am Massprodukt setzen.
2. Theme-PR nach `main` und live; interne Bestellmail im Admin neu einsetzen.
3. Bundle als UNLISTED im Onlineshop veroeffentlichen, dann im Warenkorb
   (anonym) pruefen: Mass-Teppich + Meterware ueber dem Restbestand muss der
   Checkout ablehnen; Bundle-Zeile entfernen sperrt den Warenkorb.
4. Testkauf mit Storno und Wiedereinlagerung (Freigabe Inhaber), Mail und
   Control Center gegen die echte Bestellung pruefen.
5. Massprodukt veroeffentlichen.

Grenze: Das Bundle verwaltet nur die App, die es angelegt hat (hier die
Shopify-CLI-Anmeldung). Komponenten nur ueber dieselbe Anmeldung aendern.
