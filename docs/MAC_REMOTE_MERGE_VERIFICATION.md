# Mac / Remote / Merge – Drei-Wege-Nachweis

Stand: 13. August 2026. Die Referenz `/Users/deryakrky/Documents/teppich-paradies-live` wurde ausschließlich gelesen. Maßgeblicher Remote-Ausgangspunkt ist `origin/main` bei `0437ffc1c103659f8162ae035f7d39db06b8b635`.

## Ergebnis

Der aktuelle Merge-Stand entspricht bei allen fünf Dateien bytegenau `origin/main`. Vier Mac-Dateien unterscheiden sich nur an der Structured-Data-Ausgabe; das gemeinsame Schutz-Snippet fehlt im Mac-Ordner vollständig. Das Teppichboden-Collection-Template ist in allen drei Ständen identisch. Es musste keine Theme-Datei geändert werden.

## Reproduzierbarer Hash-Nachweis

Ermittelt am 13. August 2026 mit SHA-256 gegen `origin/main` bei `0437ffc1c103659f8162ae035f7d39db06b8b635`, den ausschließlich gelesenen Mac-Ausgangsordner und den aktuellen Merge-Arbeitsstand. `EXISTS` bedeutet, dass die jeweilige Datei vorhanden war; `MISSING` bedeutet, dass sie am genannten Ursprung nicht existierte.

| Datei | A: `origin/main` | B: alter Mac-Ordner | C: Merge-Branch | Bytegleich |
| --- | --- | --- | --- | --- |
| `sections/product-information.liquid` | EXISTS `b3d59a8fd37be1521b1def2a9ab5deb2cc98644e85dd69acf0cb636e1c652c00` | EXISTS `486758537dd517f52abf3ec783982a1b05e417cc224eb79ccbf482f548cd307a` | EXISTS `b3d59a8fd37be1521b1def2a9ab5deb2cc98644e85dd69acf0cb636e1c652c00` | A=C: JA; A≠B: JA |
| `sections/featured-product.liquid` | EXISTS `2c70c7d36c3453e144b97e9a8b0e2e9085274c1c9933900133229e0ad9fe0fd5` | EXISTS `55248d80f1c09399244038abb96be926c34d1b02f774ec7608f9652d1989da66` | EXISTS `2c70c7d36c3453e144b97e9a8b0e2e9085274c1c9933900133229e0ad9fe0fd5` | A=C: JA; A≠B: JA |
| `sections/featured-product-information.liquid` | EXISTS `8f7b263f8bdd8a4a6617678ac046b921a88af6db156214685d63d58fff772d27` | EXISTS `d0056a3b36a9ac36388ae6f8115b3fcde0a338fcdd98679579884c66b18a2230` | EXISTS `8f7b263f8bdd8a4a6617678ac046b921a88af6db156214685d63d58fff772d27` | A=C: JA; A≠B: JA |
| `snippets/tp-product-structured-data.liquid` | EXISTS `81c911d53a3d136aa3103010ef5d3e881d2097bb5e16933872db188dd80e36d9` | MISSING | EXISTS `81c911d53a3d136aa3103010ef5d3e881d2097bb5e16933872db188dd80e36d9` | A=C: JA; B: MISSING |
| `templates/collection.teppichboden.json` | EXISTS `f8d79b84f0270b465103e687955c0ba69a8933cc29ee2712d0fe8c02b4cfbcff` | EXISTS `f8d79b84f0270b465103e687955c0ba69a8933cc29ee2712d0fe8c02b4cfbcff` | EXISTS `f8d79b84f0270b465103e687955c0ba69a8933cc29ee2712d0fe8c02b4cfbcff` | A=B=C: JA |

Für die ersten drei Section-Dateien ergibt `git diff --no-index --stat` zwischen A und B jeweils `1 file changed, 3 insertions(+), 1 deletion(-)`. A und C sind für alle vorhandenen Dateien bytegleich, daher ist ihr Diff leer. Für das fehlende Mac-Snippet gibt es keinen Dateidiff; der fehlende Pfad ist die Evidenz.

Ein externer Reviewer kann den Nachweis lokal reproduzieren, ohne Dateien im Mac-Ordner zu schreiben:

```sh
MAC_ROOT='/Users/deryakrky/Documents/teppich-paradies-live'
for file in sections/product-information.liquid sections/featured-product.liquid sections/featured-product-information.liquid snippets/tp-product-structured-data.liquid templates/collection.teppichboden.json; do
  git show "origin/main:$file" | shasum -a 256
  test -f "$MAC_ROOT/$file" && shasum -a 256 "$MAC_ROOT/$file" || echo 'MAC MISSING'
  shasum -a 256 "$file"
done
```

## `sections/product-information.liquid`

- Remote: Rendert `tp-product-structured-data`; Horizon-Product-Blocks, Media Gallery, Product Details, Buy Buttons und Sticky Add-to-Cart bleiben unverändert.
- Mac: Verwendet an derselben Stelle direkt Shopifys ungefilterten `structured_data`-Filter. Der übrige Section-Inhalt ist identisch.
- Merge: Remote-Variante. Dadurch bleiben normale Paketprodukte im Product-Markup, während Rollenware/OPC über das gemeinsame Snippet geschützt wird.
- Entscheidung: Keine Mac-Funktion geht verloren. Calculator, Paket-/Verschnittlogik, Varianten und Warenkorb befinden sich nicht in dem abweichenden Hunk.

## `sections/featured-product.liquid`

- Remote: Gemeinsames Structured-Data-Snippet vor der unveränderten Horizon Featured-Product-Struktur.
- Mac: Direkte ungefilterte `structured_data`-Ausgabe; Media-, Product- und Preset-Blocks sonst identisch.
- Merge: Remote-Variante, damit Featured Products dieselbe Rollenware-/OPC-Schutzregel verwenden.
- Entscheidung: Keine lokale UI-, Buy-Button- oder Variantenfunktion fehlt.

## `sections/featured-product-information.liquid`

- Remote: Gemeinsames Structured-Data-Snippet; App-Blocks, Variantenwahl, Quantity, Add-to-Cart und Accelerated Checkout bleiben erhalten.
- Mac: Direkte ungefilterte `structured_data`-Ausgabe; restlicher Inhalt identisch.
- Merge: Remote-Variante aus demselben Sicherheitsgrund.
- Entscheidung: Keine lokale Product-Block- oder Kaufwegfunktion fehlt.

## `snippets/tp-product-structured-data.liquid`

- Remote: Behält Shopifys native Ausgabe für normale/Paketprodukte. Unterdrückt Product-/Offer-Markup nur bei belegter Rollenbreite oder vorhandener technischer `opc-*`-Variante.
- Mac: Datei fehlt; die drei Sections geben Structured Data direkt aus.
- Merge: Remote-Snippet vollständig erhalten.
- Entscheidung: Erforderlicher Remote-Sicherheitsbestandteil. Es werden keine Preise, Mindestmengen oder Rollenmaße erfunden; Calculator und Warenkorb werden nicht verändert.

## `templates/collection.teppichboden.json`

- Remote: Horizon Category Carousel mit Hochflor, Kurzflor, Velours, Schlinge, Wolle sowie Nadelvlies & Objekt; Wolle-Link zeigt auf `teppichboden-wolle`. Product Cards enthalten Galerie, gekürzten TP-Titel, Preis, Merkmale und Aktionen.
- Mac: Bytegleich mit Remote. Category Carousel, Mobile Peek/Navigation, Product Cards und Wolle-Link sind identisch.
- Merge: Bytegleich mit beiden Ausgangsständen.
- Entscheidung: Keine Änderung erforderlich. Sisal & Natur ist entsprechend dem dokumentierten Admin-Plan noch nicht verlinkt und wurde nicht erfunden.

## Funktionsabdeckung

- Horizon-Kompatibilität und Section-Schemas: unverändert.
- Sticky Add-to-Cart, Buy Buttons und Varianten: erhalten.
- Rollenware/OPC Structured Data: Remote-Schutz erhalten.
- Calculator sowie Paket-/Verschnittlogik: nicht verändert.
- Teppichboden-Carousel, Product Cards, Navigation und Wolle-Link: in allen Ständen identisch.
- Sisal & Natur: bewusst noch kein Theme-Link, da die Collection administrativ noch nicht umgesetzt ist.
