---
name: theme-regeln
description: Verbindliche Regeln fuer das Horizon-Theme - Bloecke in templates/*.json, Schema-Presets, Liquid-Fallen, fertige Funktionen, die nicht neu gebaut werden (Paketrechner, Muster, Produktkarten ...), Hauptmenue, Produktkarten, UX/Design, Bilder, Schriftskala, Farbe Rot, Testumfang. Verwenden vor jeder Aenderung an sections/, blocks/, snippets/, templates/, assets/, config/ oder locales/, bei Menue-, Design-, Produktkarten- und Bildfragen und bevor eine Theme-Aenderung getestet oder deployed wird.
---

# Theme-Regeln

Ausgelagert aus `AGENTS.md` (2026-10-16, ohne inhaltliche Aenderung). Die harten
Grenzen (NIEMALS-Liste, Deploy, Vor jedem Commit) stehen weiter dort.

## Fallstricke 1–3 aus „Was hier immer wieder schiefging“

**1. Der Theme-Editor ist nur eine Oberflaeche ueber `templates/*.json`.**
Ein Block ist ein Eintrag in `blocks` plus einer in `block_order`. Bloecke
hinzufuegen ist ein Code-Edit, kein Klickvorgang.

```
npm run theme:block list                                  # zeigt Drift sofort
npm run theme:block add tp-card-color-thumbs --after price
npm run theme:block remove tp-card-color-thumbs
```

**2. Ein Block ohne `"presets"` im Schema wird deployed und ist trotzdem unsichtbar.**
Unbekannte Schema-Keys (z. B. `"target"`) werden stillschweigend ignoriert.
Vorlage ist das Schema von `blocks/tp-card-specs.liquid`. `npm run schema:guard` faengt beides.

**3. `{% render 'x' ... as var %}` gibt es in Liquid nicht.**
Shopify verwirft die Datei beim Push ohne Fehlermeldung; `shopify theme check`
sieht das nicht, `npm run liquid:guard` schon. Korrekt ist
`{% capture var %}{% render 'x' %}{% endcapture %}`.

## Shopify Theme

Fertige, getestete Funktionen nicht neu bauen: €/m²-Darstellung bei Paketprodukten, Paket-/Verschnittrechner samt Warenkorblogik, deutsche Paket-/Bestellmengenanzeige, Musterbestellung, Breadcrumb, Produktvorteile, Verkaufsbereich, technische Daten, Produktkarten-Logik mit gekürzten Titeln, Predictive Search, Startseiten-Struktur, Vinylboden-Kategoriekarussell, Mobile Peek / Karussell-Navigation. Der Produktvergleich ist bewusst vollständig entfernt (Inhaber) und wird nicht wieder eingebaut; `npm run compare:check` prüft, dass er weg bleibt.

Der Paket-/Verschnittrechner und dessen Warenkorblogik sind bereits intensiv getestet. Nicht neu schreiben, außer der Benutzer beauftragt dies ausdrücklich.

Das Hauptmenü kommt aus Horizon (`sections/header-group.json`, Menü `main-menu`). Das Globo-Mega-Menu-Embed steht zwar noch in `config/settings_data.json`, gibt im Live-Shop aber nichts aus (geprüft 13.10.). Menü nicht grundsätzlich umbauen, außer der Auftrag betrifft ausdrücklich das Menü.

Seit w-094 (Inhaber 15.10.) steht der Kopf in zwei Zeilen (oben Logo, Suchfeld `snippets/tp-kopf-suche.liquid`, Warenkorb; darunter das Menü) mit neun Hauptpunkten. Spalten im Mega-Menü (Teppichboden: Farbe, Raum, Rollenbreite) sind Menüpunkte mit Link `#` und eigenen Unterpunkten, ausgegeben von `snippets/tp-menu-spalten.liquid` – neue Spalte = Menüpunkt anlegen, kein Theme-Code. Jeder Filterlink braucht Treffer (`npm run menu:guard`). Den Menübaum nur mit `scripts/menue-umbau.mjs` umbauen (setzt alle MenuItem-IDs wieder ein, Gegenprobe `--pruefen`), Ablauf: `docs/weiterentwicklung/hauptmenue-umbau-2026-10.md`.

Horizon 4.1.3 existiert als separates Update. Keine Migration durchführen, solange dies nicht ausdrücklich beauftragt wird.

## Produktkarten

Ziele:

- kurze sichtbare Titel
- echten vollständigen Produkttitel für Link und Barrierefreiheit erhalten
- klare €/m²-Darstellung
- nicht überladen
- Muster und Vergleichen nur dort, wo sinnvoll
- auf Mobile nichts abschneiden

Teppichboden-Titel mit angehängten Breiten wie „Piumera Teppichboden 400cm 500cm“ dürfen in der sichtbaren Karte beispielsweise als „Piumera“ dargestellt werden, ohne den echten Shopify-Produkttitel zu verändern.

## UX / Design

Stil:

- moderner Fachhandel
- hochwertig
- ruhig
- verständlich
- nicht überladen
- keine unnötige Marketing-Sprache
- vorhandene Teppich-Paradies-Farbwelt nutzen

Prioritäten:

1. Verständlichkeit
2. Kaufentscheidung erleichtern
3. Mobile Bedienbarkeit
4. Fachhandels-Vertrauen
5. saubere technische Umsetzung

Gute Konkurrenzseiten dürfen als UX-Benchmark untersucht werden. Keine Texte, Bilder oder Designs 1:1 kopieren.

## Schrift und Farbe (aus „Konventionen“)

- Schriftgroessen nur aus der Skala in `snippets/tp-gestaltung.liquid`: `var(--tp-fs-xs|sm|md|lg|xl|2xl)` (Desktop 12/14/16/20/28/40 px, Telefon 13/14/16/18/24/30 px); Fliesstext 400, Beschriftungen 500, Ueberschriften 600/700. Keine festen px/rem-Werte (`npm run schrift:guard`).
- Rot (`--tp-hauptaktion`, `#c8102e`, `#b3261e`) nur fuer Preis, Rabatt, den Hauptknopf „In den Warenkorb“, den aktiven Menuepunkt, Fehlermeldungen und den gesetzlichen Knopf „Vertrag widerrufen“. Kleinueberschriften grau (`#595959`), Nebenknoepfe, Links und Symbole in der dunklen Grundfarbe `--tp-ink`.

## Bilder

- Vorhandene echte Produkt- und Herstellerbilder bevorzugen.
- Wenn die Bildlizenz eine Herstellerangabe am Bild verlangt, diese unmittelbar am Bild sichtbar machen. Die genaue Quellenangabe von Lieferant A ist dafür im Theme-Guard eng begrenzt freigegeben (`scripts/masstepich/guard.mjs`); andere Lieferantennamen bleiben gesperrt.
- Keine Produkteigenschaften durch erfundene Bilder falsch darstellen.
- **KI-Bilder** (Raum- und Kettelbilder): erzeugt in der Gemini-Web-App mit Modell 3.1 Pro (nie 4 Argon, das gibt nur Text aus), danach lokale Farbkorrektur nur auf der Boden-/Teppichflaeche. Ablauf und Fallen: `~/teppich-paradies-analyse/produktbilder/ANLEITUNG-GEMINI.md`.
- **Gemusterte und gerichtete Ware nie generativ neu erzeugen** (Motive, Streifen, Karo, Ornamente, feine Rauten- oder Wollschlinge, weiche gebrochene Streifen): Jedes Bildmodell ordnet das Muster neu an. Nur echtes Foto oder ein Komposit aus dem echten Draufsichtfoto. → `docs/lessons/ki-bilder.md`
- **KI-Bilder tragen die IPTC-Kennzeichnung** `DigitalSourceType` (Pflicht im Merchant Center). Die lokale Nachbearbeitung entfernt sie, deshalb schreibt `bilder_hochladen.py` sie vor dem Upload neu (Spalte `ki`).
- Erklärende Kategorievisuals dürfen verwendet werden, wenn sie technisch korrekt sind.
- Above-the-fold-Bilder beim ersten Laden sinnvoll priorisieren.
- Lazy Loading nicht pauschal abschalten.

## Tests

`qa/tests/npm-test-deckung.test.mjs` prüft, dass jedes Verzeichnis mit `*.test.mjs` in der `npm test`-Kette hängt.

Vor bzw. nach relevanten Theme-Änderungen bevorzugt `npm run qa` verwenden, statt dieselben mechanischen Browser- und Theme-Checks manuell mit Modellarbeit zu wiederholen.

Weitere verfügbare, rein lesende lokale Checks: `npm run seo:check`, `npm run compare:check`, `npm run qa:evidence:test`, `npm run secret:scan`. `npm run sales:check` ist ein Live-Storefront-Test ohne Kaufabschluss: Er verändert einen anonymen Test-Warenkorb und kann bis zum Checkout navigieren.

Je nach Änderung sinnvoll und risikobasiert prüfen:

- Desktop
- Mobile bei ca. 390 px
- Browser-Konsole
- Theme Check
- Links und Bilder
- Produktkarten und Varianten
- Warenkorb
- Muster (und dass kein Produktvergleich mehr auftaucht)
- Rollenware und Fixpreis
- Teppichboden
- Klickvinyl und Klebevinyl

Nicht für jede Miniänderung den gesamten Shop unnötig testen.
