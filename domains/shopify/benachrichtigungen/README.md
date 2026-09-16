# Großhändler-ID und interne Bestell-E-Mail

Stand: 2026-09-15. Geprüft gegen den Live-Shop.

## Wo die Großhändler-ID gepflegt wird

Sie existierte bereits — es musste nichts neu angelegt werden.

| Ebene | Feld | Typ | Storefront-Zugriff |
|---|---|---|---|
| Produkt | `grosshandel.sku` („Großhändler-ID") | Einzeltext | **NONE** |
| Variante | `lieferant.lieferant_a_artikelnummer` | Einzeltext | **NONE** |
| Variante | `lieferant.lieferant_b_artikelnummer` | Einzeltext | **NONE** |

Gepflegt wird im Shopify-Admin auf der Produktseite unter „Metafelder".
Das Produktfeld ist die Regel; die beiden Variantenfelder sind für den Fall
gedacht, dass eine einzelne Farbe eine abweichende Artikelnummer hat. Die
E-Mail bevorzugt deshalb die Variante und fällt auf das Produkt zurück.

**Abdeckung (2026-09-15):** 405 von 406 aktiven Produkten haben eine
Großhändler-ID. Es fehlt genau eines: **Piumera Teppich nach Maß**
(`gid://shopify/Product/…`, Typ „Teppich nach Maß"). Das ist ein Maßprodukt;
ob es überhaupt eine eigene Großhändler-ID bekommt, ist eine Einkaufsfrage.

## Dass Kunden sie nicht sehen — geprüft, nicht angenommen

1. Alle drei Felder stehen auf Storefront-Zugriff `NONE`. Damit sind sie über
   die Storefront-API nicht abrufbar.
2. Im Theme wird keines der drei Felder ausgegeben (`grep` über `blocks`,
   `sections`, `snippets`, `templates`, `layout`). Das Theme liest aus dem
   Namensraum `lieferant` nur `wunschmass` und `kettelung` — zwei Ja/Nein-Werte
   ohne Bezug zur Bezugsquelle.
3. Gegenprobe an der Live-Storefront: zwei Produktseiten abgerufen, 0 Treffer
   für den Klartext der Großhändler-ID und 0 Treffer für die Feldnamen. Das
   öffentliche `/products/<handle>.js` enthält überhaupt keine Metafelder.

### Entschieden: die Varianten-SKU bleibt, wie sie ist

Die Großhändler-ID setzt sich bei den Rollenware-Produkten aus den
Artikelnummern zusammen, die zugleich als **Varianten-SKU** im Shop stehen
(Beispiel: SKU `CVEXPGR02_130`, und derselbe Code steht in der Großhändler-ID).
Shopify gibt Varianten-SKUs immer öffentlich aus — sie stehen im Produkt-HTML
und in `/products/<handle>.js`. Belegt am 2026-09-15 an zwei Produktseiten.

Der *beschreibende* Teil der Großhändler-ID (Produktlinie, Qualität, Farbnummer
des Lieferanten) tritt **nicht** aus. Der Artikelcode selbst schon.

**Entscheidung des Inhabers am 2026-09-15: bleibt unverändert.** Ein solcher
Code ist ohne den passenden Lieferantenkatalog bedeutungslos, und die SKUs
hängen am Lieferantenabgleich, am Google-Feed und an den eigenen
Bestellprozessen. Der Punkt ist damit geschlossen und nicht erneut
aufzuwerfen — wer ihn wieder findet, findet einen bekannten und bewusst
akzeptierten Zustand, keinen neuen Befund.

## Wie die interne Bestell-E-Mail funktioniert

Umgesetzt über die **eingebaute Mitarbeiterbenachrichtigung „Neue Bestellung"**
— ohne App, ohne externen Dienst, ohne laufende Kosten.

Warum nicht Shopify Flow: Flow ist in diesem Shop nicht installiert (Stand
2026-09-15 sind nur Search & Discovery sowie Google & YouTube installiert).
Eine App zu installieren wäre eine storeweite Änderung für etwas, das Shopify
bereits mitbringt.

Warum das die Kunden-E-Mails nicht berührt: Die Mitarbeiterbenachrichtigungen
sind eigene Vorlagen. Bestellbestätigung, Versandbestätigung und Rechnung an
den Kunden sind davon getrennt und werden nicht angefasst.

Die E-Mail enthält Bestellnummer, Bestelldatum, Name und Kontaktdaten des
Kunden, Lieferadresse sowie je Artikel Menge, Variante, SKU und Großhändler-ID.
Fehlt die ID, steht dort in Rot **„Großhändler-ID fehlt"**.

### Musterbestellungen — der Fall, der die Vorlage sonst unbrauchbar macht

Die häufigste Bestellart im Shop ist die kostenlose Musterbestellung. Ihre
Bestellzeile ist das Sammelprodukt „Kostenloses Muster" (SKU `TP-MUSTER-000`),
das selbst keine Großhändler-ID trägt — das tatsächlich bestellte Produkt steht
in den Line-Item-Properties (`Produkt`, `Farbe`, `_Quellprodukt`).

Ohne Sonderbehandlung stünde bei fast jeder Bestellung „Großhändler-ID fehlt",
obwohl die ID am Quellprodukt existiert. Die Vorlage erkennt diesen Fall und
weist stattdessen den Handle des Quellprodukts aus. Nachladen kann sie das
Quellprodukt nicht: `all_products` gibt es in Benachrichtigungsvorlagen nicht.

### Einsetzen (noch offen, 2 Minuten im Admin)

1. Shopify Admin → **Einstellungen → Benachrichtigungen**
2. Abschnitt **Mitarbeiterbenachrichtigungen** → **Neue Bestellung** → *Code bearbeiten*
3. Den Inhalt von `interne-bestellmail-block.liquid` **unmittelbar vor `</body>`**
   einfügen. Sonst nichts ändern.
4. Speichern, dann **Testbenachrichtigung senden** und die Tabelle prüfen.
5. Unter *Empfänger* sicherstellen, dass die gewünschte interne Adresse eingetragen ist.

Das konnte in dieser Sitzung nicht selbst erledigt werden: der Hauptbereich des
Shopify-Admin rendert im automatisierten Browser nicht, und für
Benachrichtigungsvorlagen gibt es keine Admin-API-Mutation.

### Was an der Vorlage geprüft ist

Gerendert mit LiquidJS gegen vier Fälle, Aufbau der Fixture nach echten
Bestelldaten aus `#1003`/`#1004`:

| Fall | Erwartung | Ergebnis |
|---|---|---|
| ID am Produkt | ID erscheint | ok |
| ID an der Variante *und* am Produkt | Variante gewinnt | ok |
| Musterbestellung | Quellprodukt statt Fehlmeldung | ok |
| Produkt ganz ohne ID | „Großhändler-ID fehlt" | ok |

Der vierte Fall schlug beim ersten Lauf fehl: `{% assign x = blank %}` erzeugt
in Liquid keinen Wert, der sich gegen `blank` vergleichen lässt — die Zeile
rutschte in den Muster-Zweig. Seither wird mit einem leeren String gearbeitet.

Nicht geprüft ist der tatsächliche Versand: dafür braucht es die
Testbenachrichtigung aus Schritt 4.

## Der Feldname steht an drei Stellen und muss überall gleich sein

Der Anzeigename der Definition heißt seit 2026-09-16 **„Großhändler-ID"**.
Vorher hieß er „Großhandels-ID", während die E-Mail-Vorlage schon
„Großhändler-ID" sagte — zwei Namen für dasselbe Feld, einer davon auf dem
Lagerausdruck.

Wer den Namen erneut ändert, muss an drei Stellen denken:

1. **Die Metafeld-Definition** (Admin → Einstellungen → Metafelder und
   Metaobjekte). Ändert die Beschriftung auf der Produktseite.
2. **Die E-Mail-Vorlage** in `interne-bestellmail-block.liquid` — dort steht
   der Name als Überschrift und als Spaltentitel fest im Text.
3. **Die Kommissionierliste.** Und hier die Falle: Shopify speichert den
   Spaltennamen zum Zeitpunkt des Hinzufügens. Eine spätere Umbenennung der
   Definition wirkt dort **nicht** rückwirkend — die Spalte muss entfernt und
   neu hinzugefügt werden, sonst steht der alte Name weiter auf dem Ausdruck.
   Genau so ist es am 2026-09-16 aufgefallen.
