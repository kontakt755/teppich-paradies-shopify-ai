# Google Shopping Price Strategy

Stand: 12. August 2026  
Shop: `https://www.teppich-paradies.net`  
Scope: ausschließlich Merchant-/Google-Shopping-Preislogik, vollständig lesend. Keine Shopify-, Theme-, Feed- oder Google-Änderungen.

## 1. Executive Summary

**Paketware ist aus Sicht der Preislogik Shopping-ready. Rollenware ist es im aktuellen Standard-Feed-Modell nicht.**

Bei Klickvinyl/Paketware ist der Shopify-Variantenpreis der tatsächlich kaufbare Paketpreis. Das Theme berechnet daraus lediglich den informativen Quadratmeterpreis. Beim geprüften Marlow-Produkt stimmen Shopify-Preis, serverseitiges Product-Schema und Paket-/Warenkorblogik mit 105,98 EUR pro Paket überein. Der Feed muss daher 105,98 EUR übermitteln; 50,95 EUR/m² gehört als Einheitspreis daneben, nicht als `[price]`.

Bei Rollenware stellt Shopify dagegen den Quadratmeterpreis als Variantenpreis bereit. Der Options Price Calculator (OPC) multipliziert Länge × Rollenbreite × Quadratmeterpreis und erzeugt daraus einen kaufbaren Gesamtpreis. Der Standard-Shopify-Feed und Shopifys `structured_data` sehen diese spätere Konfiguration nicht: Granitera veröffentlicht deshalb je 2-m-/4-m-Breitenvariante 32,90 EUR, obwohl bei der sichtbaren Mindestlänge von 100 cm mindestens 65,80 EUR beziehungsweise 131,60 EUR gekauft werden müssen.

Zusätzlich existieren `opc-*`-Varianten dauerhaft in Shopifys öffentlich abrufbarem Produktmodell. Softiq enthält eine öffentliche Variante `opc-1771104793780` zu 1.299,00 EUR; sie erscheint auch als eigenes `Product`/`Offer` im JSON-LD. Diese Varianten sind deshalb grundsätzlich feedfähig und müssen vor Shopping explizit ausgeschlossen oder durch eine Feed-Architektur vermieden werden.

Sofortempfehlung: **Rollenware vollständig von Google & YouTube / Shopping ausschließen**, bis eine feste, kaufbare Mindestkonfiguration je Feed-Item samt passender Landingpage und Preis implementiert ist. Paketware kann preislogisch freigegeben werden, nachdem im Google-&-YouTube-Admin bestätigt wurde, dass `[price] = Paketpreis` und die Einheitspreisfelder korrekt sind.

### Geprüfte Repräsentanten

| Typ | Produkt | URL |
|---|---|---|
| Paketware | Marlow Eiche Nordisch – Klickvinyl 7mm | `https://www.teppich-paradies.net/products/marlow-eiche-nordisch-klickvinyl-7mm` |
| Rollenware, eine Breite | Softiq Teppichboden, 5 m | `https://www.teppich-paradies.net/products/softiq-teppichboden` |
| Rollenware, mehrere Breiten | Granitera Eiche Honigbraun, 2 m / 4 m | `https://www.teppich-paradies.net/products/traxano-eiche-honigbraun-vinylboden-von-der-rolle` |

## 2. Paketware

### Ist-Zustand

Marlow besitzt eine echte Shopify-Variante:

| Feld | Wert |
|---|---|
| Shopify-Variantenpreis | 105,98 EUR |
| `custom.qm_pro_paket` | 2,08 m² (aus sichtbarer Live-Ausgabe und Paketlogik) |
| Berechneter Einheitspreis | 105,98 / 2,08 = 50,9519… → sichtbar 50,95 EUR/m² |
| SKU | `LVTDESX5_703X` |
| GTIN/EAN | nicht vorhanden / nicht öffentlich belegt |
| Vendor/Brand | Shopify Vendor `Marlow`; Schema Brand `Marlow` |
| Availability | Shopify `available: true`; Schema `InStock` |
| JSON-LD Offer | 105,98 EUR, EUR, InStock, variantenspezifische URL |
| Open Graph Preis | `product.price`, somit Paketpreis |

Die lokale Kaufkomponente `blocks/paket-auswahl.liquid` verwendet ausdrücklich `selected_variant.price` als Paketpreis, rundet die benötigte Fläche auf ganze Pakete auf und sendet `quantity = Pakete` an `/cart/add.js`. Für ein Paket sind somit 105,98 EUR der Warenkorb-/Checkout-Warenwert. Der letzte erfolgreich dokumentierte Mac-Kaufweg erreichte den Checkout ohne Bestellung. Der erneute automatisierte Windows-Warenkorbabruf wurde durch Shopifys Bot-/Challenge-Antwort blockiert; es gibt aber keinen abweichenden Preisweg im lokalen Kaufcode oder öffentlichen Produktmodell.

### Welcher Preis gehört in den Feed?

**105,98 EUR**, also der Gesamtpreis des kleinsten tatsächlich kaufbaren Pakets. Nicht 50,95 EUR.

Empfohlene zusätzliche Merchant-Felder für die Einheitspreisdarstellung:

- `[unit_pricing_measure] = 2.08 sqm`
- `[unit_pricing_base_measure] = 1 sqm`

Google empfiehlt beziehungsweise verlangt Einheitspreisangaben für relevante Bodenbeläge und EU-Fälle, aber der erforderliche Feed-`[price]` bleibt der Paketgesamtpreis. Google verlangt, dass Feed-, Landingpage- und Checkoutpreis übereinstimmen und bei Mindestmengen der Gesamtpreis der kleinsten kaufbaren Menge eingereicht wird ([Google Preis-Spezifikation](https://support.google.com/merchants/answer/6324371), [Unit Pricing Measure](https://support.google.com/merchants/answer/6324455)).

### Google-Risiko

Niedrig, sofern der Google-&-YouTube-Kanal tatsächlich 105,98 EUR als `[price]` synchronisiert. Der prominentere Einheitspreis ist nicht grundsätzlich problematisch, weil der Paketpreis unmittelbar daneben sichtbar ist und das Schema den Paketpreis nennt. Die Landingpage sollte für einen Google-Crawler unmissverständlich „105,98 EUR pro Paket (2,08 m²)“ zeigen; das ist aktuell der Fall.

Offene Identifikatorfrage: Es ist keine GTIN/EAN belegt. Keine GTIN darf erfunden werden. Im Google-&-YouTube-Admin muss geprüft werden, ob Brand plus MPN/SKU ausreichend gepflegt sind oder `identifier_exists = no` fachlich korrekt wäre.

### Product Schema

Kein Preisfehler: `Offer.price = 105.98`, `priceCurrency = EUR`, `availability = InStock`, `sku = LVTDESX5_703X`, `brand = Marlow`. `lowPrice`/`highPrice` sind bei nur einer Variante nicht nötig. GTIN und `itemCondition` fehlen. Für automatische Merchant-Updates nennt Google Preis, Währung, Verfügbarkeit und Zustand als erforderliche Angaben ([Merchant strukturierte Daten](https://support.google.com/merchants/answer/7331077)). Das fehlende `itemCondition` ist eine Schema-/Merchant-Vollständigkeitslücke, aber kein Preis-Mismatch.

### Empfehlung

- Feed-`[price]`: Paketpreis.
- Einheitspreis separat über Unit-Pricing-Felder.
- Product Schema preislich unverändert lassen.
- Im Admin einen synchronisierten Marlow-Artikel öffnen und Feed-Preis/Einheitspreis prüfen.

**Shopping freigeben: JA – aus Sicht der Preislogik.** Die administrative Feed- und Identifikatorprüfung bleibt vor tatsächlicher Aktivierung erforderlich.

## 3. Rollenware

### Ist-Zustand: eine Breite

Softiq ist als 5-m-Rollenware belegt. Die 14 regulären Farbvarianten kosten öffentlich jeweils 64,95 EUR; `custom.rollenbreite = 5` wurde an den echten Varianten vorbereitet. Daneben existiert eine öffentliche `opc-*`-Variante:

| Variante | Shopify-Preis | SKU | Barcode | Schema |
|---|---:|---|---|---|
| reguläre Farben | 64,95 EUR | überwiegend leer | leer | je ein Offer 64,95 EUR, InStock |
| `opc-1771104793780` | 1.299,00 EUR | leer | leer | eigenes Offer 1.299,00 EUR, InStock |

1.299,00 EUR entspricht rechnerisch exakt 64,95 EUR/m² × 5 m × 4 m. Das ist eine mathematische Übereinstimmung, **kein öffentlich sichtbarer Beleg für die ursprünglich eingegebene OPC-Länge**; die genaue Konfiguration/Line-Item-Properties erfordert eine Admin-Prüfung.

Wichtiger Live-Befund: Auf Softiq wurde während der Prüfung kein OPC-Formular gerendert. Stattdessen erschien die Paket-Auswahl mit dem Fallback `2.05`, obwohl das Produkt Rollenware ist. Damit ist nicht nur der Feed, sondern auch der aktuell sichtbare Kaufweg für diesen Vertreter fachlich nicht belastbar. Dieser Befund wurde in diesem reinen Diagnoseblock nicht behoben.

### Ist-Zustand: mehrere Breiten

Granitera besitzt zwei echte Breitenvarianten und keine beim Abruf sichtbare `opc-*`-Variante:

| Breite | Varianten-ID | SKU | Shopify-/Schema-Preis | Mindestlänge |
|---:|---:|---|---:|---:|
| 200 cm | `60324458103118` | `CVTOPA20_2151` | 32,90 EUR | 100 cm |
| 400 cm | `60324458135886` | `CVTOPA40_2151` | 32,90 EUR | 100 cm |

Der Live-OPC zeigt ein Zahlenfeld `laenge`, Minimum 100 cm, und einen dynamischen Gesamtpreis. `custom.rollenbreite` ist variantenspezifisch vorbereitet. Bei 200 cm gewünschter Länge ergibt sich:

| Rollenbreite | Fläche | Tatsächlicher Gesamtpreis |
|---:|---:|---:|
| 200 cm | 2 m × 2 m = 4 m² | 131,60 EUR |
| 400 cm | 4 m × 2 m = 8 m² | 263,20 EUR |

Bei der Mindestlänge 100 cm sind es 65,80 EUR beziehungsweise 131,60 EUR. Der Standard-Shopify-Variantenpreis und jedes aktuelle Schema-Offer behaupten jedoch 32,90 EUR. 32,90 EUR ist bei keiner dieser beiden Varianten als Mindestzuschnitt kaufbar.

Das vom Auftrag genannte Beispiel folgt derselben Logik: 200 cm Länge × 500 cm Breite = 10 m²; bei 86,90 EUR/m² ergibt sich 869,00 EUR.

### Was Google voraussichtlich sieht

Öffentlich eindeutig belegt:

- Shopify Produkt-/Variantendaten nennen bei Granitera 32,90 EUR.
- Das serverseitige JSON-LD nennt für beide Breiten je `Offer.price = 32.90`.
- Open Graph verwendet `product.price`, also ebenfalls den niedrigsten Shopify-Preis.
- Der OPC-Gesamtpreis entsteht erst nach der Längeneingabe.

Shopify dokumentiert, dass der Google-&-YouTube-Kanal vorhandene Shopify-Produktdaten und relevante Store-Daten automatisch synchronisiert ([Shopify Google-&-YouTube-Setup](https://help.shopify.com/en/manual/online-sales-channels/marketplaces/google/getting-setup/connect), [Anforderungen](https://help.shopify.com/en/manual/online-sales-channels/marketplaces/google/requirements)). Daraus folgt als **starke technische Erwartung**, dass ohne gesonderte Feed-Regel der echte Shopify-Variantenpreis 32,90 EUR übertragen wird. Der aktuell tatsächlich im Merchant Center gespeicherte `[price]` ist öffentlich nicht auslesbar: **Admin-Prüfung erforderlich**.

### Google-Risiko

Sehr hoch. Google verlangt einen Preis, den Nutzer auf Landingpage und im Checkout tatsächlich bezahlen können. Bei Produkten mit Mindestmenge muss der Preis für die kleinste kaufbare Menge eingereicht werden; ein Einheitspreis darf zusätzlich dargestellt werden ([Google Preis](https://support.google.com/merchants/answer/6324371), [Landingpage-Anforderungen](https://support.google.com/merchants/answer/4752265), [Checkout-Anforderungen](https://support.google.com/merchants/answer/9158778)).

`minimum_order_value` löst dieses Problem nicht sauber: Dieses Attribut beschreibt einen Mindestwarenkorbwert/Service, nicht die variantenspezifische geometrische Mindestkonfiguration. Unit-Pricing-Felder erklären 32,90 EUR/m², ersetzen aber nicht den korrekten `[price]` der kleinsten kaufbaren Konfiguration.

### Product Schema

Granitera wird als `ProductGroup` mit zwei `Product`-Varianten ausgegeben. Beide Offers enthalten EUR, InStock, variantenspezifische URL und SKU, aber jeweils den nicht einzeln kaufbaren Einheitspreis 32,90 EUR. Brand ist auf Gruppenebene `TeppichParadies`; GTIN und `itemCondition` fehlen. `lowPrice`/`highPrice` werden nicht verwendet.

Softiq enthält 15 Schema-Varianten: 14 reguläre Offers zu 64,95 EUR sowie das `opc-*`-Offer zu 1.299,00 EUR. SKU/GTIN fehlen im Schema der Softiq-Varianten. Das ist ein reales Schema- und Feed-Risiko, weil eine interne Konfiguratorvariante als normale kaufbare Produktvariante ausgezeichnet wird.

**Echte Schema-Preisfehler:** Rollenware weist den Quadratmeterpreis als normalen Offer-Gesamtpreis aus; `opc-*`-Varianten werden als normale Offers veröffentlicht.

### Empfehlung

**Shopping freigeben: NEIN.** Rollenware vorerst vollständig aus Google & YouTube, Shopping Ads, Free Listings und gegebenenfalls automatischen Merchant-Feeds ausschließen.

## 4. OPC

### Rolle im Kaufprozess

Der Theme-App-Block ist in `product.rolle.json` eingebettet. Der Live-Calculator erhält gewünschte Länge in Zentimetern; die echte Shopify-Variante liefert die Rollenbreite, der Shopify-Preis den Quadratmeterpreis. Der Zielpreis lautet:

`(Länge cm / 100) × Rollenbreite m × Shopify-Preis pro m²`.

Die genaue serverseitige App-/Cart-Transform-Implementierung ist weder im Themecode noch in einer dokumentierten öffentlichen Store-Schnittstelle sichtbar. Eine neue OPC-Konfiguration wurde bewusst nicht zum Warenkorb hinzugefügt, weil dies möglicherweise eine neue Shopify-Variante erzeugt hätte und Produkt-/Variantenänderungen untersagt waren.

### Feed-Risiko und `opc-*`

Öffentlich belegt ist:

- `opc-*` steht als echter Wert in Shopifys Variantenoptionen.
- Die Variante besitzt eine dauerhafte numerische Shopify-Varianten-ID.
- Sie wird über `/products/<handle>.js` und `/products/<handle>.json` ausgeliefert.
- Sie wird von Shopifys `structured_data` als normale InStock-Produktvariante mit eigenem Offer ausgezeichnet.

Damit sind `opc-*`-Varianten nicht nur transienter Browserzustand. Ob die App sie später wiederverwendet, bereinigt oder dauerhaft pro Konfiguration anhäuft, ist öffentlich nicht bestimmbar: **OPC-/Shopify-Admin-Prüfung erforderlich**.

Theoretisch können sie im Standardfeed auftauchen, weil Shopify/Google echte Varianten synchronisieren. Ob der Kanal sie aktuell filtert, ist **Admin-Prüfung erforderlich**. Ohne Filter besteht das Risiko zahlreicher Konfigurationsvarianten mit zufälligen Gesamtpreisen, fehlenden SKUs/GTINs, falschen Titeln und veralteter Availability.

### Empfohlene Behandlung

- Sofort: gesamte Rollenware vom Kanal ausschließen; das schließt vorhandene und künftige `opc-*` zuverlässig ein.
- Später: nur bewusst definierte Feed-Varianten zulassen; `opc-*` über Feed-Quelle/Regel explizit ausschließen.
- Niemals `opc-*` als Sortimentsbreite, normale Farbe oder dauerhafte Merchant-Variante behandeln.
- Im Product Schema sollten `opc-*` nicht als normale Varianten erscheinen; erst in einem getrennten Implementierungsblock korrigieren.

## 5. Product Schema – Zusammenfassung

| Produkt | Preis | Währung | Availability | SKU | GTIN | Brand | Bewertung |
|---|---|---|---|---|---|---|---|
| Marlow Paketware | 105,98 | EUR | InStock | vorhanden | fehlt | Marlow | preislich korrekt |
| Softiq Rollenware | 14× 64,95 plus `opc-*` 1.299,00 | EUR | InStock | im Schema nicht vorhanden | fehlt | TeppichParadies | Rollen-Grundpreis und interne OPC-Variante als normale Offers problematisch |
| Granitera 2/4 m | je 32,90 | EUR | InStock | vorhanden | fehlt | TeppichParadies | Offer-Preis entspricht nur €/m², nicht Mindestkaufpreis |

`lowPrice` und `highPrice` fehlen; Shopify nutzt stattdessen einzelne Offers in `ProductGroup.hasVariant`. Das ist nicht der Hauptfehler. Entscheidend ist die falsche Bezugsgröße der Rollenware. `itemCondition` fehlt in allen drei geprüften Offers. GTINs wurden nicht gefunden und dürfen nicht ergänzt werden, solange sie nicht belegt sind.

## 6. Empfohlene Zielarchitektur

### Option A – Rollenware vollständig ausschließen

| Kriterium | Bewertung |
|---|---|
| Technische Machbarkeit | hoch; Kanal-/Feed-Verfügbarkeit je Produktgruppe deaktivieren |
| Risiko | sehr niedrig |
| Wartungsaufwand | niedrig |
| Auswirkung auf Shop | keine, wenn nur Google-Destination betroffen ist |
| Google-Preisgenauigkeit | vollständig, weil keine falschen Rollenangebote gesendet werden |
| Empfehlung | **JA, sofortige sichere Zwischenlösung** |

### Option B – nur standardisierte kaufbare Mindestmaße übermitteln

Je Breitenvariante wird ein eindeutig kaufbarer Standardzuschnitt angeboten, beispielsweise 200 × 100 cm zu 65,80 EUR und 400 × 100 cm zu 131,60 EUR. Landing-URL muss genau diese Variante/Konfiguration vorauswählen; Feedpreis, Schema und Checkout müssen übereinstimmen.

| Kriterium | Bewertung |
|---|---|
| Technische Machbarkeit | mittel; benötigt stabile kaufbare Varianten/Offers und eindeutige URLs |
| Risiko | mittel; Konflikt mit dynamischem Wunschmaß und OPC-Varianten möglich |
| Wartungsaufwand | mittel bis hoch |
| Auswirkung auf Shop | sichtbare standardisierte Mindestzuschnitte oder getrennte Offers nötig |
| Google-Preisgenauigkeit | hoch, wenn jede Feedzeile exakt kaufbar ist |
| Empfehlung | **JA als Pilot**, nicht sofort für gesamten Bestand |

### Option C – separater Merchant-Feed für Rollenware

Ein eigener Feed berechnet je echter Breitenvariante den Preis der festen Mindestlänge, setzt Unit-Pricing-Maße und verlinkt auf eine Landingpage, die genau diese Mindestkonfiguration prominent vorauswählt. Der Shopify-Standardfeed muss für dieselben Rollenprodukte deaktiviert werden, um Duplikate zu vermeiden.

| Kriterium | Bewertung |
|---|---|
| Technische Machbarkeit | mittel bis hoch mit eigener Feed-Pipeline |
| Risiko | mittel; Feed-/Landingpage-Mismatch bei Preis- oder Mindestlängenänderungen |
| Wartungsaufwand | hoch |
| Auswirkung auf Shop | Landingpage-/Schema-Unterstützung erforderlich, sonst keine Produktpreisänderung |
| Google-Preisgenauigkeit | hoch bei automatischer Ableitung und Monitoring |
| Empfehlung | **JA langfristig**, wenn Rollenware wirtschaftlich Shopping-relevant ist |

### Option D – Shopify-Produkt-/Variantenmodell auf Mindestkaufpreis umstellen

Der Shopify-Variantenpreis wäre der Preis der Mindestlänge statt €/m²; OPC müsste intern mit einem separaten Quadratmeter-Metafeld rechnen.

| Kriterium | Bewertung |
|---|---|
| Technische Machbarkeit | grundsätzlich möglich |
| Risiko | sehr hoch; berührt Preislogik, OPC, Karten, Warenkorb und Checkout |
| Wartungsaufwand | hoch |
| Auswirkung auf Shop | erheblich; bestehende €/m²- und OPC-Logik muss neu abgestimmt werden |
| Google-Preisgenauigkeit | hoch nach vollständiger, sauberer Migration |
| Empfehlung | **NEIN** im aktuellen System |

### Option E – getrennte, Merchant-fähige Standardzuschnitt-Produkte

Separate kaufbare Produkte repräsentieren wenige definierte Standardzuschnitte; das Wunschmaßprodukt bleibt unabhängig und vom Feed ausgeschlossen.

| Kriterium | Bewertung |
|---|---|
| Technische Machbarkeit | hoch |
| Risiko | niedrig bis mittel |
| Wartungsaufwand | mittel; zusätzliches Sortiment und Bestandspflege |
| Auswirkung auf Shop | zusätzliche Landingpages/Produkte, klare Abgrenzung nötig |
| Google-Preisgenauigkeit | sehr hoch |
| Empfehlung | **JA als robusteste langfristige Alternative**, falls Standardzuschnitte verkäuflich sind |

### Architekturentscheidung

1. Jetzt Option A.
2. Danach einen wirtschaftlich relevanten Rollenartikel mit Option B oder E pilotieren.
3. Option C nur aufbauen, wenn genügend Rollenware-Umsatzpotenzial den dauerhaften Feedbetrieb rechtfertigt.
4. Option D vermeiden.

## 7. Was automatisch umsetzbar wäre

Ohne es in diesem Block umzusetzen, wären technisch automatisierbar:

- Rollenware anhand Produkttyp, Collections und `custom.rollenbreite` klassifizieren.
- `opc-*` bei Export und Schema-Aufbereitung zuverlässig herausfiltern.
- Mindestfläche je echter Breitenvariante aus `Mindestlänge × custom.rollenbreite` berechnen.
- Feed-Mindestpreis aus Mindestfläche × Shopify-Quadratmeterpreis berechnen.
- Unit-Pricing-Maße (`sqm`) erzeugen.
- Regelmäßiger Preisvergleich Feed ↔ Landingpage-Schema ↔ definierte Mindestkonfiguration.
- Bericht über fehlende SKU/GTIN/Brand/Availability-Daten erstellen, ohne Identifikatoren zu erfinden.

Nicht automatisch angenommen werden dürfen Mindestlängen, GTINs, MPNs oder die aktuell im Merchant Center gespeicherten Destinationen.

## 8. Was im Shopify-Admin manuell geprüft werden muss

**Admin-Prüfung erforderlich:**

1. Google-&-YouTube-Kanal: tatsächlicher synchronisierter Preis von Marlow, Softiq und Granitera je Variante.
2. Produktstatus/Destination: Sind Rollenware und `opc-*` aktuell für Google & YouTube veröffentlicht?
3. Welche Varianten sendet der Kanal tatsächlich – alle echten Varianten, `opc-*`, oder gefilterte Auswahl?
4. Unit-Pricing-Felder von Marlow: `2.08 sqm` / `1 sqm`.
5. Google Product Category, Brand, MPN/SKU und `identifier_exists`; keine GTIN erfinden.
6. OPC-App: Lebenszyklus der generierten Varianten, Wiederverwendung/Bereinigung und vorhandene Calculator-Zuordnungen.
7. Softiq: Warum auf der Live-PDP der Paket-Rechner statt OPC erscheint; gewünschte Mindestlänge und realer Kaufweg.
8. Bereits vorhandene Feed-/App-Regeln oder ergänzende Datenquellen, bevor eine neue Quelle geplant wird.

## 9. Was im Merchant Center manuell geprüft werden muss

**Merchant-Center-Prüfung erforderlich:**

1. Unter „Datenquellen“ feststellen, ob Shopify Google & YouTube, automatischer Website-Feed oder weitere Quellen aktiv sind.
2. Für die drei Beispielprodukte die final verarbeiteten Attribute öffnen: `[id]`, `[item_group_id]`, `[price]`, `[availability]`, `[link]`, `[unit_pricing_measure]`, `[unit_pricing_base_measure]`, Brand, GTIN/MPN und Destinations.
3. Prüfen, ob `opc-*` als eigene Items auftauchen.
4. Diagnostics nach „Mismatched value (page crawl) [price]“, fehlenden Identifikatoren und Variantenfehlern prüfen.
5. Automatische Artikelupdates und automatisch hinzugefügte Website-Produkte prüfen. Google kann strukturierte Website-Daten für automatische Feeds beziehungsweise Updates verwenden ([automatisch hinzugefügte Produkte](https://support.google.com/merchants/answer/12158480)).
6. Vor einer Rollenware-Freigabe Testitem mit fester Mindestkonfiguration validieren; Feedpreis, initiale Landingpage und Checkout müssen identisch sein.

## 10. Konkreter nächster Schritt

**Im Shopify-Admin beim Google-&-YouTube-Kanal die drei Beispielprodukte öffnen und je Variante den tatsächlich an Merchant Center gesendeten `[price]` sowie die Google-Destination dokumentieren – ohne eine Einstellung zu ändern.**

Erst diese eine read-only Admin-Prüfung bestätigt endgültig, ob die öffentlich ermittelte Standardfeed-Erwartung bereits aktiv ist und ob `opc-*` aktuell übertragen wird.
