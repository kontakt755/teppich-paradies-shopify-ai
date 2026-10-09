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
