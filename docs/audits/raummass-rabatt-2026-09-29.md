# Raummaß und Meterware: Katalogaudit 2026-09-29

## Nachprüfung 2026-09-30

Der öffentliche Katalog enthält jetzt 526 Produkte. Weiterhin haben 50 Produkte
beide Zuschnittarten: 19 nur mit rechnerischem Raummaß-Streichpreis und 31 mit
Streichpreisen bei beiden Zuschnittarten. Das auf der Produktseite als „Serena“
bezeichnete Produkt hat noch den Handle `verano-teppichboden-400cm-500cm` und
gehört zu den 19 Fällen. Nach dem erneuten Einspielen der Schutzregel in das
aktuelle Live-Theme wurden alle 50 öffentlichen Produktseiten geprüft: Bei
den 19 einseitigen Fällen wird kein Streichpreis mehr ausgegeben; bei den 31
beidseitigen Fällen bleibt die Ausgabe erhalten. Keine Liquid-Fehler. In den
öffentlichen `body_html`-Beschreibungen dieser 50 Produkte wurden keine
Rabattversprechen gefunden. Shopify-Variantenpreise wurden nicht geändert.

Quelle: öffentlicher Shopify-Produktfeed (`/products.json`, 3 Seiten, 507 veröffentlichte Produkte). Die Prüfung erfasst Variantenpreise, Vergleichspreise und `body_html`. Aktions-Metafelder sind im öffentlichen Feed nicht enthalten; ob eine Produktaktion gerade aktiv ist, muss vor jeder Preisfreigabe im Admin geprüft werden.

## Ergebnis

- 50 Produkte haben sowohl Rollenbreiten als auch Wunschmaß-Varianten.
- 19 Produkte zeigen einen rechnerischen Raummaß-Streichpreis, aber keinen bei Meterware. Diese 19 erfüllen die neue Regel eindeutig nicht.
- 31 Produkte haben bei beiden Zuschnittarten einen rechnerischen Streichpreis. Der Prozentwert weicht bei mehreren Produkten stärker ab als reine Cent-Rundung; diese Preispaare müssen anhand der belegten Vorpreise geprüft werden.
- In den öffentlichen `body_html`-Beschreibungen dieser Produkte wurde kein ausdrückliches Rabattversprechen oder fester Raummaß-Aktionspreis gefunden. Theme-Texte und Metafeldtexte sind damit nicht vollständig abgedeckt.
- Coralia: Meterware 30,90 €/m² mit gleichem Vergleichspreis; Raummaß 35,70 €/m² mit 42,00 € Vergleichspreis. Der Screenshot stimmt mit den öffentlichen Variantendaten überein.

## Produktübersicht

| Produkt | Rollenvarianten | Raummaßvarianten | reduziert Rolle | reduziert Raummaß | Rolle % (Spanne) | Raummaß % (Spanne) | Befund |
|---|---:|---:|---:|---:|---:|---:|---|
| [altessa-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/altessa-teppichboden-400cm-500cm) | 14 | 7 | 0 | 7 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [alvano-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/alvano-teppichboden-400cm-500cm) | 18 | 9 | 0 | 9 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [coralia-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/coralia-teppichboden-400cm-500cm) | 16 | 8 | 0 | 8 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [corina-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/corina-teppichboden-400cm-500cm) | 16 | 8 | 0 | 8 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [kerova-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/kerova-teppichboden-400cm-500cm) | 20 | 10 | 0 | 10 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [ombra-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/ombra-teppichboden-400cm-500cm) | 8 | 4 | 0 | 4 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [palura-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/palura-teppichboden-400cm-500cm) | 22 | 11 | 0 | 11 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [rivena-teppichboden-400cm](https://www.teppich-paradies.net/products/rivena-teppichboden-400cm) | 9 | 9 | 0 | 9 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [savena-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/savena-teppichboden-400cm-500cm) | 16 | 8 | 0 | 8 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [solano-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/solano-teppichboden-400cm-500cm) | 18 | 9 | 0 | 9 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [solera-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/solera-teppichboden-400cm-500cm) | 10 | 5 | 0 | 5 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [solvana-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/solvana-teppichboden-400cm-500cm) | 16 | 9 | 0 | 9 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [tamira-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/tamira-teppichboden-400cm-500cm) | 20 | 10 | 0 | 10 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [tarona-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/tarona-teppichboden-400cm-500cm) | 8 | 4 | 0 | 4 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [vallora-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/vallora-teppichboden-400cm-500cm) | 40 | 20 | 0 | 20 | 0.00–0.00 | 11.11–11.11 | nur Raummaß |
| [velano-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/velano-teppichboden-400cm-500cm) | 24 | 12 | 0 | 12 | 0.00–0.00 | 16.36–16.36 | nur Raummaß |
| [verano-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/verano-teppichboden-400cm-500cm) | 20 | 10 | 0 | 10 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [verita-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/verita-teppichboden-400cm-500cm) | 14 | 7 | 0 | 7 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [vivera-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/vivera-teppichboden-400cm-500cm) | 8 | 4 | 0 | 4 | 0.00–0.00 | 15.00–15.00 | nur Raummaß |
| [alvento-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/alvento-teppichboden-400cm-500cm) | 32 | 16 | 32 | 16 | 10.84–10.84 | 10.00–10.00 | beide (Prozent prüfen) |
| [boucella-teppichboden-400cm](https://www.teppich-paradies.net/products/boucella-teppichboden-400cm) | 5 | 5 | 5 | 5 | 15.00–15.00 | 15.00–15.00 | beide (Prozent prüfen) |
| [callista-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/callista-teppichboden-400cm-500cm) | 20 | 10 | 20 | 10 | 15.31–15.31 | 15.65–15.65 | beide (Prozent prüfen) |
| [corvella-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/corvella-teppichboden-400cm-500cm) | 24 | 12 | 24 | 12 | 15.95–15.95 | 15.25–15.25 | beide (Prozent prüfen) |
| [fibrella-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/fibrella-teppichboden-400cm-500cm) | 10 | 5 | 10 | 5 | 5.51–5.51 | 5.44–5.44 | beide (Prozent prüfen) |
| [fortiva-teppichboden-200cm](https://www.teppich-paradies.net/products/fortiva-teppichboden-200cm) | 13 | 13 | 13 | 13 | 10.75–10.75 | 10.53–10.53 | beide (Prozent prüfen) |
| [kalvea-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/kalvea-teppichboden-400cm-500cm) | 20 | 10 | 20 | 10 | 14.98–14.98 | 15.00–15.00 | beide (Prozent prüfen) |
| [kontura-teppichboden](https://www.teppich-paradies.net/products/kontura-teppichboden) | 19 | 19 | 19 | 19 | 15.60–15.60 | 15.38–15.38 | beide (Prozent prüfen) |
| [lanetta-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/lanetta-teppichboden-400cm-500cm) | 14 | 7 | 14 | 7 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [lanova-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/lanova-teppichboden-400cm-500cm) | 14 | 7 | 14 | 7 | 5.11–5.11 | 5.30–5.30 | beide (Prozent prüfen) |
| [merinda-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/merinda-teppichboden-400cm-500cm) | 16 | 8 | 16 | 8 | 5.75–5.75 | 5.13–5.13 | beide (Prozent prüfen) |
| [nordica-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/nordica-teppichboden-400cm-500cm) | 12 | 6 | 12 | 6 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [novaris-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/novaris-teppichboden-400cm-500cm) | 28 | 14 | 28 | 14 | 10.84–10.84 | 10.00–10.00 | beide (Prozent prüfen) |
| [nuvara-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/nuvara-teppichboden-400cm-500cm) | 30 | 15 | 30 | 15 | 12.16–12.16 | 11.36–11.36 | beide (Prozent prüfen) |
| [palenza-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/palenza-teppichboden-400cm-500cm) | 24 | 12 | 24 | 12 | 16.16–16.16 | 15.48–15.48 | beide (Prozent prüfen) |
| [piumera-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/piumera-teppichboden-400cm-500cm) | 28 | 14 | 28 | 14 | 15.17–15.17 | 15.73–15.73 | beide (Prozent prüfen) |
| [regalia-teppichboden-400cm](https://www.teppich-paradies.net/products/regalia-teppichboden-400cm) | 5 | 5 | 5 | 5 | 15.00–15.00 | 15.00–15.00 | beide (Prozent prüfen) |
| [reganza-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/reganza-teppichboden-400cm-500cm) | 30 | 15 | 30 | 15 | 15.68–15.68 | 15.18–15.18 | beide (Prozent prüfen) |
| [rubira-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/rubira-teppichboden-400cm-500cm) | 2 | 1 | 2 | 1 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [sentira-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/sentira-teppichboden-400cm-500cm) | 30 | 15 | 30 | 15 | 26.06–26.06 | 25.51–25.51 | beide (Prozent prüfen) |
| [sisara-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/sisara-teppichboden-400cm-500cm) | 10 | 5 | 10 | 5 | 15.00–15.00 | 15.00–15.00 | beide (Prozent prüfen) |
| [sisola-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/sisola-teppichboden-400cm-500cm) | 10 | 5 | 10 | 5 | 15.00–15.00 | 15.00–15.00 | beide (Prozent prüfen) |
| [tessara-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/tessara-teppichboden-400cm-500cm) | 30 | 15 | 30 | 15 | 10.84–10.84 | 10.00–10.00 | beide (Prozent prüfen) |
| [torvana-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/torvana-teppichboden-400cm-500cm) | 36 | 18 | 36 | 18 | 25.85–25.85 | 25.00–25.00 | beide (Prozent prüfen) |
| [vantana-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/vantana-teppichboden-400cm-500cm) | 35 | 18 | 35 | 18 | 26.05–26.05 | 25.37–25.37 | beide (Prozent prüfen) |
| [vellana-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/vellana-teppichboden-400cm-500cm) | 12 | 6 | 12 | 6 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [velory-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/velory-teppichboden-400cm-500cm) | 24 | 12 | 24 | 12 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [vireno-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/vireno-teppichboden-400cm-500cm) | 28 | 14 | 28 | 14 | 15.95–15.95 | 15.25–15.25 | beide (Prozent prüfen) |
| [woolara-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/woolara-teppichboden-400cm-500cm) | 10 | 5 | 10 | 5 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [wovena-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/wovena-teppichboden-400cm-500cm) | 20 | 10 | 20 | 10 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |
| [zafira-teppichboden-400cm-500cm](https://www.teppich-paradies.net/products/zafira-teppichboden-400cm-500cm) | 18 | 9 | 18 | 9 | 14.99–14.99 | 15.00–15.00 | beide (Prozent prüfen) |

## Umsetzung vor Shopify-Preisschreibzugriff

1. Im Admin für jedes der 50 Produkte den aktiven Aktionsstatus, die dokumentierten Vorpreise und den beabsichtigten Rabattprozentsatz prüfen.
2. Für jede Farbe/Breite den gleichen Prozentsatz auf reguläre Meterware- und Raummaßpreise anwenden; auf die Shopify-Preiseinheit (€/m² oder 0,01 m²) und Cent-Rundung achten.
3. Bei Produkten ohne aktive Aktion irreführende Vergleichspreise der Raummaß-Varianten entfernen bzw. auf den regulären Preis setzen.
4. Produktbeschreibungen, Metafeldtexte, Karten, Produktseite, Warenkorb und Checkout gegen die finalen Preise prüfen.
5. Erst nach Freigabe der konkreten Produkttabelle Preise im Shopify-Admin ändern.
