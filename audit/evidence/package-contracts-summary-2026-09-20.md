# PR-023b.1 – Paketverträge weiterer Produktarten

20.09.2026, Phase 1. Reproduktion: `node audit/scripts/reproduce-package-contracts.mjs`. 17 Integrationsfälle, davon drei Liquid-Gates und 14 abgefangene Requests; 28 lokale Cart-Zeilenrenderings. Drei weitere reine Verkaufsart-Kontrollen und fünf Templatezuordnungen. Elf Quellenhashes stimmen mit dem historischen Live-Snapshot überein. PASS bezeichnet Diagnose, keine Fixabnahme.

## Quellen und Reichweite

- **Teppichfliesen:** Quadra ist laut `docs/analyse/qualitaet-erstbefund-2026-09-11.md:819` am 13.09. als Paketprodukt bestätigt: 58,90 €/m², 294,50 €/Originalpaket, zehn Farben ohne Wunschmaß. `tp-verkaufseinheit` dokumentiert den 5-m²-Paketvertrag trotz Produkttyp „Teppichboden“. Die 20 Fliesen à 50 × 50 cm sind der dokumentierte Paketinhalt; neue Varianten-/Produkt-IDs bleiben synthetisch. Keine erneute Live-Produktprüfung.
- **Klebevinyl:** Alvora Eiche Bernstein ist in `qa/MERCHANT_READINESS_REPORT.md` als Paketprodukt mit einer Variante dokumentiert. Die konkrete heutige Metafeld-/Preiszuordnung fehlt. Das neue 3,34-m²-/103,37-€-Fixture ist deshalb ausdrücklich synthetisch, keine Behauptung des Alvora-Preises. 19 m² Bedarf mit 5 % Reserve → sechs Pakete/20,04 m²/620,22 €.
- **Drei Nachkommastellen:** Die Notiz `domains/shopify/rechner-zuordnung.md` verlangt, 1,892 m² bzw. 30,272 m² nicht auf zwei Stellen zu verkürzen. `domains/lieferanten/paketinhalt/README.md` und das Inhaltssnippet dokumentieren weitere kleine Paketflächen wie 0,794 m². 0,794/41,25 € und 1,892/98,29 € sind hier lokale Zahlenfixtures auf Basis vorhandener Beispiele, keine frisch verifizierten Verkaufsvarianten. Insbesondere werden die korrigierten Verona-Terrazzopreise/2,20-m²-Pakete nicht rückgängig gemacht oder mit den Planken gleichgesetzt.
- **PVC/Fixpreis:** Rechnerzuordnung, Standardformular und Templates gelesen. `product.rolle` aktiviert Rollenrechner und sperrt Standard-Buybuttons; `product.fixpreis`/`product.zubehoer` aktivieren Standard-Buybuttons und Mengenhilfe. Drei Klassifikationskontrollen ergeben `rolle`, `stueck`, `einzel`. Diese Kartierung ersetzt keine Payloadprüfung; diese bleibt **PR-023b.2**.

## Ausführung

Der vollständige Paketblock wird mit LiquidJS gerendert; Shopify-`doc`/`schema` und CSS-Blöcke werden nur beim Einlesen ausgeblendet. Die ursprüngliche vollständige JS-IIFE liest ihr echtes gerendertes Dataset. Netzwerk vollständig abgefangen, Antworten/Redirect simuliert. Geprüft werden Datenübergang, ganze Paketmenge, Cent-Summe, Stückangabe, private Properties und Cart-Event. Gemeinsame S01-Parserdefekte und frühere Preisraster werden nicht wiederholt.

Die ursprünglichen Snippets `tp-verkaufseinheit`, `tp-price-per-sqm`, `tp-paketinhalt`, `price` und `tp-cart-paketzeile` werden ausgeführt. Shopify-Geldfilter werden im Adapter formatiert. Für **nur** das Cart-Snippet wird dessen ganzzahliges `divided_by:100` ausdrücklich als Ganzzahldivision modelliert: LiquidJS dividiert standardmäßig als JavaScript-Float (`liquid.node.mjs`, Filter `divided_by`). Ohne diese Anpassung entstünden zusätzliche künstliche Formatfehler. Die Shopquelle bleibt unverändert. Die gemessene Zwei-Stellen-Rundung entsteht bereits vor der Division durch die Originaloperation `times:100 | round`.

## Ergebnisse

| Fall | Ergebnis |
| --- | --- |
| Quadra 20 m² ohne Reserve | 4 Pakete, 80 Fliesen, 20,00 m², 1.178,00 €; Karte/PDP 58,90 €/m² |
| Quadra 20 m² mit 5 % Reserve | 5 Pakete, 100 Fliesen, 25,00 m², 1.472,50 € |
| Quadra Bedarf unter einem Paket | weiterhin ein echtes Originalpaket |
| Paketmetafeld plus widersprüchliche Rollenbreite | `paket` hat Vorrang; keine Umdeutung zum Rollenpreis |
| Klebe-Fixture 19 m² + 5 % | 6 Pakete, 20,04 m², 620,22 €; Karte/PDP 30,95 €/m² |
| Stückdaten fehlen | Stückzeile fehlt tatsächlich im gerenderten Block; keine erfundene Stückzahl |
| Synthetische vollständige Stückdaten | PDP, Rechner und Cart übernehmen die hinterlegten Daten |
| Variantenereignis für dasselbe Produkt | ID und Paketpreis aktualisiert; tatsächliches Browser-Pickerverhalten noch offen |
| Ereignis eines fremden Produkts | ignoriert; bisherige ID und Preis bleiben |
| Cart-Zeilenmenge gegenüber ursprünglichem Payload erhöht | Fläche und Stückzahl aus neuer Menge berechnet; private alte Properties bestimmen die Anzeige nicht |
| Paketfeld fehlt/0/negativ | Paketblock rendert nicht |

## TP-008/P3 – Cart verkürzt die Flächenpräzision

| Tatsächlicher Paketvertrag | Rechner / Payload | Cart-Zeile |
| --- | --- | --- |
| 1 × 0,794 m² | 0,794 m² | 0,79 m² |
| 2 × 0,794 m² | 1,588 m² | 1,59 m² |
| 16 × 1,892 m² | 30,272 m² | 30,27 m² |

Die Menge und der Cent-Gesamtpreis bleiben korrekt. Betroffen ist der sichtbare Flächenvertrag beim Wechsel vom Rechner zum Warenkorb, einschließlich erneuter Berechnung nach Mengenänderung. `snippets/tp-cart-paketzeile.liquid:28`–36 reduziert grundsätzlich auf Hundertstel; Rechner und Paketinhalt erhalten hingegen drei Stellen. Das Snippet ist in `snippets/cart-products.liquid:232` eingebunden. Aktuelle Produkt-/Browserreichweite H-011, keine neue Live-Fehlabrechnung behauptet. Vollständiger Implementation Brief in `audit/ISSUES.md`.

## Offen / nächster Schritt

**PR-023b.2:** PVC-Referenz Terracora Eiche Braun (`marano-eiche-braun-vinylboden-von-der-rolle`) mit dokumentierten 2-/4-m-Breiten und vorhandene Stück-/Sockelleistenreferenzen prüfen. Einheitspreise/Varianten ohne aktuellen Beleg synthetisch markieren; Rollen-Datenvertrag und Standardform-Payload bei Mengenhilfe bis zum abgefangenen Request verfolgen. Rechnerzuordnung und Basismathematik sind vorhanden; weder Paketraster noch S01–S05-Reproduktionen wiederholen. Danach CART-002 mit echten Gruppen-/Mengenvorgängen.

Kein aktueller Browser-, Shopify-Liquid-, Server-, Layout-, Drawer- oder Checkoutnachweis. Kein Preis/Produkt/Metafeld verändert. S05-Dateien und ältere Evidence erhalten.
