# Strukturierte Daten und Suchmaschinen – Stand 2026-09-25

Gemessen am Live-Shop per `curl` (Googlebot-User-Agent) über alle 565 URLs der Sitemap.

## Was live ausgeliefert wird

| Seitentyp | JSON-LD | Quelle im Theme |
|---|---|---|
| alle Seiten | Organization / HomeAndConstructionBusiness / Store | `sections/header.liquid` |
| Startseite | WebSite, Service, FAQPage (6 Fragen) | Startseiten-Sections, FAQ aus `sections/tp-start-faq.liquid` |
| Produkt | ProductGroup mit `hasVariant`, je Variante Offer mit Preis je m² (`UnitPriceSpecification`, `MTK`) | `snippets/tp-product-structured-data.liquid` |
| Kollektion, Inhaltsseite | BreadcrumbList | `snippets/tp-breadcrumb.liquid` (Produkt: `snippets/product-information-content.liquid`) |

Die am 2026-09-25 zusätzlich angelegten Snippets `tp-product-schema` und
`tp-faq-schema` wurden wieder entfernt (Commit 01adb9c5). Sie hätten die
vorhandenen Produktdaten doppelt ausgegeben. **Nicht neu anlegen.**

Änderungen am Theme laufen ausschließlich über Branch → PR → `main` →
`workflow:preview` → `workflow:live`, nie über den Code-Editor im Admin.

## Befunde des Sitemap-Laufs

- 562 × 200, 3 × kurzzeitig 503 (beim zweiten Abruf 200)
- kein `noindex` auf indexierbaren Seiten, keine fremden Canonicals, kein `<img>` ohne `alt`
- genau eine H1 je Seite
- 62 Titel länger als 65 Zeichen – überwiegend Rollenware mit Breitenangabe im
  Admin-SEO-Titel; Google kürzt sie in der Anzeige, das ist kein Fehler

## Am 2026-09-25 behoben (Admin-Daten, kein Theme-Deploy)

| Seite | Vorher | Jetzt |
|---|---|---|
| Sylvara 655 Klickvinyl mit / ohne Trittschalldämmung | beide Titel identisch („Sylvara 655 – Design-Klickvinyl“), weil die Titelkürzung in `meta-tags.liquid` den Unterschied abschnitt | eigene SEO-Titel |
| Sylvara 655 Klebevinyl, Eichenhain Klebevinyl | Beschreibung = Auszug aus dem Produkttext mit Emojis und doppelt maskiertem `&amp;amp;` | eigene SEO-Beschreibung aus den Produktangaben |
| Blog `ratgeber-teppichboden` | keine Beschreibung | `global.description_tag` gesetzt |
| Seite `hochflor-teppichboden` | Brückenseite ohne Inhalt, konkurriert mit der Hochflor-Kollektion | `seo.hidden = 1` → `noindex`, aus der Sitemap |
| Blog `news` | leer (nur unveröffentlichter Testartikel) | `seo.hidden = 1` → `noindex`, aus der Sitemap |

`seo.hidden` ist umkehrbar: Metafeld löschen oder auf `0` setzen.

## Lange Titel (2026-09-26)

Die 12 laengsten Produkttitel (71-77 Zeichen, alle mit angehaengtem
"| TeppichParadies" im Admin-SEO-Titel) stehen jetzt ohne Markenzusatz bei
53-59 Zeichen und passen komplett in die Google-Anzeige. Uebrige lange Titel
(66-70 Zeichen) bleiben: abgeschnitten wird dort nur die Marke am Ende.

**Falle:** Ein SEO-Titel, der Zeichen fuer Zeichen dem Produktnamen gleicht,
speichert Shopify als `null`. Dann greift der Fallback in
`snippets/meta-tags.liquid` (Name auf 45 Zeichen kuerzen, Marke anhaengen) und
zerhackt Titel wie "Treppenkantenprofil Alu eloxiert 40 x 37 x | Teppich
Paradies". Der eigene Titel muss sich vom Produktnamen unterscheiden; hier
durch einen Doppelpunkt nach der Bezeichnung. Nach jeder Aenderung den
ausgelieferten `<title>` per curl pruefen, nicht `seo.title` im Admin.

## Offen, braucht eine Entscheidung

- Produkt „Eichenhain“ wurde am 2026-09-26 auf `eichenhain-design-klebevinyl-als-einzelplanken`
  umbenannt (301 von der alten Adresse, Musterprodukt mitgezogen). Die
  Muster-SKUs tragen noch den alten Handle und sind bewusst unveraendert.
- Produkttexte der vier Sylvara/Eichenhain-Produkte enthalten einen
  `<style>`-Block im Beschreibungs-HTML; `product.description` beginnt deshalb mit CSS.
