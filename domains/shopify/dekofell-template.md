# Produkttemplate `product.dekofell`

Stand 2026-09-30. Erstes Produkt: „Fellara Dekofell“ (Handle `fellara-dekofell`,
Lieferant B, Stueckware in festen Groessen, Dropshipping per Paket).

## Aufbau

| Block | Zweck | Datenquelle |
|---|---|---|
| `tp-product-h1`, `price` | Titel und Preis der gewaehlten Variante | Shopify |
| `tp-produktmerkmale` | bis zu 4 belegte Merkmale mit Haken | `custom.merkmale` (Liste) |
| `color-swatch-picker` (`kreise`) | runde Farbfelder mit Variantenbild | Option `Farbe` |
| `tp-groessen-form` | Groessenkarten mit massstabsgetreuem Variantenbild in der gewaehlten Farbe, Form und Preis | Option `Größe`, Werte wie `Ø 35 cm rund`, `40 × 60 cm Fellform` |
| `buy-buttons` | Menge und Warenkorb | Shopify |
| `tp-service-links` | Lieferzeit 5–7 Werktage, ohne Link „Verlegeservice“ | Blockeinstellung |
| `tp-bewertungsbeleg` | Google-Bewertung | Theme-Einstellung |
| `text` (Beschreibung) | `pd-card` mit Kurztext, Badges, Tabelle | Produktbeschreibung |
| `tp-bildnachweis` (2×) | Pflicht-Urhebervermerk der Herstellerbilder: am Handy direkt unter der Galerie, am Desktop am Ende der Details | `custom.bildnachweis` |

Keine Produktempfehlungen: Die Shopify-Empfehlungen zeigten Profile und Kleber.
Kein Muster-Link: Produkte mit dem Tag `ohne-muster` bekommen weder auf der
Karte noch auf der Produktseite ein Musterangebot.

## `tp-groessen-form`

- Form aus dem Optionswert: `rund`/`Ø` → Kreis, `Fell` → Fellform, sonst Rechteck.
- Das groesste Mass fuellt die Buehne (84 px, mobil 68 px), alle anderen im selben Massstab.
- Bild = `featured_image` der Variante in der gewaehlten Farbe. Runde Freisteller haben
  weissen Rand; `rund_zoom` (hier 122 %) gleicht ihn aus.
- Bedienung setzt das native Horizon-Radio und loest `change` aus; Bilder, Preise und
  Auswahl kommen danach aus dem `variant:update`-HTML. `native_ausblenden` blendet den
  leeren `variant-picker` aus, wenn Farbe und Groesse von eigenen Bloecken bedient werden.
- Auch fuer Wohnteppiche nutzbar (`80 × 150 cm`, `Ø 160 cm rund`).

## Nebenbei behoben

`color-swatch-picker` fand die Horizon-Knoepfe (`variant_style: buttons`) nicht, weil
diese nicht `options[...]` heissen. Folge auf allen Produkten mit Farb-Swatches und
Groessenknoepfen: Farbe waehlen, dann Groesse wechseln → Horizon holte die alte Farbe
zurueck. Jetzt werden die Knoepfe dieses Produkts in derselben Section gefunden.

## Produktdaten fuer Filter (Fellara)

- `custom.arten` → Teppich-Art „Dekofell“ (neues Metaobjekt, ACTIVE)
- `custom.fasermaterial` → Polyester, `custom.material` → „100 % Polyester“
- `custom.zimmer` → Wohnzimmer, Schlafzimmer; `custom.fusbodenheizung` → Ja
- `shopify.color-pattern` → Grau hell (Silber), Grau, Beige, Gold, Rot Bordeaux, Schwarz
- Tags: `art: dekofell`, `farbe: …`, `material: polyester`, `raum: …`,
  `eignung: pflegeleicht`, `ohne-muster`
- Varianten: Gewicht laut Lieferantendaten, `custom.farbcode`

Alle Werte stammen aus der Lieferanten-Datenliste; Rohdaten liegen nur lokal unter
`~/teppich-paradies-analyse/lieferantendaten/`.

## Bildnachweis – bewusste Ausnahme von #753

Seit #753 zeigt der Shop keine Lieferantennamen. Die Bildnutzungsbedingungen von
Lieferant B verlangen aber einen zuordenbaren Urhebervermerk mit Markennamen.
Inhaberentscheidung 2026-09-30: Fellara geht **mit** Vermerk live. Der Name steht nur im
Metafeld `custom.bildnachweis` am Produkt, nicht im Theme; der Block rendert ohne Metafeld
nichts und wird nur in Templates gesetzt, deren Bildgeber ihn verlangt.

## Offen

- Schriftliche Freigabe der konkreten Shop-Darstellung durch den Bildgeber liegt nicht vor
  (`domains/lieferanten/teppiche/importplan-2026-09.md`).
