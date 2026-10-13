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
Gebaut (2026-10-12): Control Center, Ansicht Sonderposten, Knopf "Im Laden
verkauft" an der Restrolle - Laenge eingeben, abgezogen wird Laenge x volle
Rollenbreite in ganzen m2 (aufgerundet). Details: `docs/control-center/ARCHITEKTUR.md`,
Abschnitt 13. Der Control-Center-Zugang hat dafuer seit 2026-10-12 `write_inventory`.
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
| Bundle-Preis 0 EUR | Shopify legt die Summe der Komponenten als Preis an (41,95 x Einheiten). Alle 39 Varianten stehen auf 0,00 EUR (Freigabe Inhaber 13.10.2026, Gegenprobe per Admin API) |
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

Voraussetzungen fuer jede weitere Rolle mit diesem Mechanismus (Review 13.10.):
genau eine Rollenbreite an der Meterware (`custom.rollenbreite`),
`service.max_breite_cm` am Massprodukt = Rollenbreite (die Mail rechnet damit),
eine Farbe je Massprodukt (der Verweis gilt fuer das ganze Produkt), und je
Bundle-Variante `cm x Rollenbreite / 10000` Einheiten als Komponentenmenge
(bei 4 m Breite 25 cm = 1 m2, bei 5 m waere es 20 cm = 1 m2).

### Stand 13.10.2026 (Freigabe Inhaber: Ja zu 0 EUR, Bestand nur an der Rolle, Testkauf)

- Bundle 0,00 EUR, Bestandsfuehrung am Massprodukt aus, `custom.zuschnitt_von_rolle`
  gesetzt; Rollback unter `~/teppich-paradies-analyse/yasmin-sofortkauf-2026-10-13/`.
- Theme-Code live (main c7e743e2, #1083 + #1186). Probe im Live-Shop (anonymer
  Warenkorb, kein Kauf): Konfigurator legt Teppich, Kettelservice und die
  kleinste deckende Zuschnitt-Variante (0 EUR) mit gleicher `_Gruppe` ab;
  ohne Zuschnitt-Zeile sperrt der Warenkorb; mit Meterware im Korb weist
  Shopify eine Zuschnitt-Variante ab, sobald die Rolle nicht mehr reicht
  ("bereits ausverkauft") - die Komponente zaehlt gegen denselben Bestand.
- **Bundle und Massprodukt stehen wieder auf DRAFT.** Grund: Ein Warenkorb
  nur mit einer Zuschnitt-Variante (Permalink `/cart/<variante>:1` oder
  `/cart/add.js`) umgeht die Warenkorbsperre des Themes, und mit "Abholung"
  waere das eine 0-EUR-Bestellung (der Shop schliesst 0-EUR-Bestellungen
  ohne Zahlung ab, siehe Gratismuster). Sie wuerde bis zu 40 m2 Rolle binden,
  bis jemand storniert. Auf Basic gibt es keine eigene Checkout-Validierung.
  Vor dem Veroeffentlichen braucht es eine Entscheidung (siehe unten).

### Offen: Schutz gegen Zuschnitt ohne Teppich

| Weg | Wirkung | Aufwand / Freigabe |
|---|---|---|
| Validierungs-App aus dem App Store (Functions laufen fuer oeffentliche Apps auch auf Basic), Regel "Zuschnitt von der Rolle nur zusammen mit dem Massteppich" | verhindert den Checkout | App-Installation, ggf. Kosten - Inhaber |
| Bundle-Preis 0,57 EUR (= 1 Einheit des Massprodukts), Konfigurator senkt die Teppichmenge um 1 | Endpreis centgenau gleich, nie 0 EUR; Missbrauch kostet Geld, bindet aber weiter Bestand | Preisaenderung - Inhaber; Code in Konfigurator, Mail, Control Center |
| Shopify Flow (im Basic-Tarif enthalten): Bestellung mit Zuschnitt ohne Massteppich sofort stornieren, wieder einlagern, intern melden | macht den Fall in Sekunden rueckgaengig, verhindert ihn nicht | Admin-Einrichtung durch einen Menschen |

Empfehlung: Flow als Netz in jedem Fall; dazu entweder die App (echte Sperre)
oder 0,57 EUR (kein 0-EUR-Auftrag mehr).

Beobachtung am Rand (nicht Yasmin-spezifisch): Der Warenkorb nimmt von einer
bestandsgefuehrten Variante hoechstens 50 Stueck an ("Aufgrund der
Verfuegbarkeit wurden nur 50 Artikel ..."), obwohl Shopify 80 bzw. 999 als
online verkaufbar meldet (auch Klickvinyl mit 999 Paketen). Online gehen
damit hoechstens 50 m2 Yasmin je Bestellung (12,5 m Meterware), obwohl der
Rechner bis 20 m erlaubt. Ursache ungeklaert.
