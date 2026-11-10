# Horizon-Migration (Backlog)

Die Migration auf eine neuere Horizon-Version läuft nur auf ausdrücklichen Auftrag
(`AGENTS.md`, „NIEMALS ohne ausdrückliche Freigabe“ und Backlog). Hier sammeln sich die
Punkte im unveränderten Horizon-Kern, die bewusst bis dahin warten – und seit 10.11.2026
der Migrationsplan (unten). **Der Plan ist nur Analyse: nichts davon ist umgesetzt.**

| Punkt | Dateien | Befund | Entscheidung |
|---|---|---|---|
| Vorschaubilder der Produktgalerie tragen `aria-selected` an Knöpfen | `snippets/slideshow-controls.liquid` (Z. ~117, ~170), `assets/slideshow.js` (Z. ~428), CSS-Selektoren auf `[aria-selected]` | axe meldet `aria-allowed-attr` und `scrollable-region-focusable`; die Knöpfe sind per Tab bedienbar | Inhaber 07.11.2026 (Werkbank w-312): mit der Migration erledigen, dann auf `aria-current` umstellen (Liquid, JS und CSS zusammen) und mit axe auf drei Produktseiten prüfen. **Hinweis 10.11.:** Horizon 4.1.3 trägt `aria-selected` an denselben Stellen weiter (Z. 117, 170, 389) – die Migration löst den Punkt nicht von selbst, er bleibt eigene Arbeit (Schritt N1). |

---

# Migrationsplan auf Horizon 4.x (Stand 10.11.2026)

## Kurzfassung

- Das Repository trägt **Horizon 3.5.1**. Der Sprung auf 4.1.3 ist kein Fehlerbehebungs-Update:
  4.0.0 ersetzt die Farbschemata durch eine Farbpalette und die Warenkorb-/Varianten-Ereignisse
  durch neue Standard-Ereignisse. Beides trifft eigenen Code direkt.
- **4.1.3 ist nicht mehr aktuell.** Der Hersteller steht bei 4.4.0 (04.11.2026). Der teure Teil
  ist 3.5.1 → 4.0.0; danach sind die Schritte kleiner. Empfehlung: Ziel ist die beim Start
  neueste 4.x, nicht 4.1.3.
- Der Kernwechsel lässt sich **nicht** in kleinen Live-Schritten ausrollen (Farben, CSS und
  Skripte hängen zusammen). Klein und einzeln deploybar sind die Vorarbeiten davor und die
  Nacharbeiten danach; der Wechsel selbst ist ein Livegang mit klarem Rückweg.
- Geschätzter Aufwand: **11–15 Arbeitstage** Agentenzeit plus 2–3 Stunden Sichtprüfung des Inhabers.
- Empfehlung: **migrieren, aber nicht vor Mitte Januar 2027.** Im Dezember nur Vorarbeiten ohne
  Theme-Wirkung (V1, V4).

## Ausgangsstand mit Beleg

| Was | Wert | Beleg |
|---|---|---|
| Version im Repository | 3.5.1 | `config/settings_schema.json`, `theme_version`; unverändert seit dem Basis-Commit `eb5a5dc8` (12.08.2026) |
| Hersteller-Stand 3.5.1 | Commit `45c7db5` (22.05.2026) | `github.com/Shopify/horizon`, Commit „Horizon v3.5.1“ (das Repository hat keine Tags, die Version steht im Commit-Titel) |
| Hersteller-Stand 4.1.3 | Commit `cd022a3` (16.07.2026) | wie oben |
| Neueste Version | 4.4.0, Commit `b2b74b0` (04.11.2026) | wie oben; dazwischen 4.1.4, 4.1.5, 4.2.0, 4.3.0 |
| Umfang 3.5.1 → 4.0.0 | 257 Dateien, +10 593 / −5 174 Zeilen | `git diff --shortstat` ohne `locales/` |
| Umfang 4.0.0 → 4.1.3 | 116 Dateien, +5 357 / −2 872 | wie oben |
| Umfang 4.1.3 → 4.4.0 | 188 Dateien, +4 300 / −1 974 | wie oben |

Nachrechnen: Hersteller-Repository klonen, beide Commits mit `git archive` entpacken und jede
Datei aus `assets/ blocks/ sections/ snippets/ layout/ config/ locales/ templates/` dreifach
vergleichen (Basis 3.5.1, unser `main` bei `63ff8fd3`, Ziel 4.1.3), Konflikte mit
`git merge-file -p` zählen. Ein fertiges Werkzeug dafür gibt es noch nicht (Schritt V1).

### Dreiwege-Vergleich (943 Dateien)

| Unser Stand | Hersteller 3.5.1 → 4.1.3 | Dateien | Bedeutung |
|---|---|---:|---|
| eigene Datei (nicht im Kern) | – | 474 | bleibt; hängt aber teils am Kern (siehe unten) |
| von uns geändert | geändert | 224 | davon 96 nur zwei Leerzeilen am Dateianfang (kein echter Eingriff); **128 echte Doppeländerungen**, davon 50 Sprachdateien |
| unverändert | geändert | 72 | kann der Hersteller-Stand übernommen werden |
| – | neu | 51 | kommen dazu (u. a. `theme-drawer`, `color-palette`, `standard-actions-override.js`, viele `*-styles`-Snippets) |
| von uns geändert | unverändert | 23 | bleibt (9 davon echte Eingriffe, z. B. `snippets/header-row.liquid`, `snippets/tax-info.liquid`) |
| unverändert | unverändert | 96 | nichts zu tun |
| unverändert | entfernt | 2 | `assets/product-title-truncation.js` (noch eingebunden in `snippets/scripts.liquid` und `snippets/card-gallery.liquid`), `snippets/color-schemes.liquid` (eingebunden in `layout/theme.liquid`) |
| von uns gelöscht | geändert | 1 | `sections/header-announcements.liquid` – bleibt gelöscht |

Von den echten Doppeländerungen außerhalb der Sprachdateien lassen sich viele automatisch
zusammenführen; **71 Dateien haben mindestens einen Textkonflikt**, dazu 10 Sprachdateien.
Automatisch zusammengeführt heißt nicht richtig: auch konfliktfreie Dateien (z. B.
`assets/product-form.js`, 761 Hersteller-Zeilen) müssen getestet werden.

### Was 4.x inhaltlich ändert (Versionshinweise des Herstellers)

- **4.0.0:** Farbschemata entfernt, ersetzt durch Farbpalette und Farbeinstellungen je Block;
  Blogbeitrag aus umsortierbaren Blöcken; „Storefront Events & Actions“ (Warenkorb-Eingriffe von
  Apps und KI-Agenten ohne Neuladen); Warenkorb-Drawer, Filter-Drawer und Sticky-Kaufleiste überarbeitet.
- **4.1.0:** neuer Block für Produkt-Pflichthinweise („disclosures“), Hinweis-Tooltip im Warenkorb.
- **4.1.1:** Navigation in In-App-Browsern.
- **4.1.3:** Fehlerbehebungen (Untermenü beim Überfahren von unten, Filterfarben, ausverkaufte
  Varianten, Tracking-Parameter der Suche, kleinere CSS-Bündel, übersetzte Sektionsnamen).
- **4.1.4–4.4.0 (nicht Ziel des Auftrags):** viele Korrekturen an Warenkorb, Kopf, Menü und
  Karussells, Rechts-nach-links-Sprachen, schnellere erste Darstellung.

## Konfliktstellen nach Risiko

### Hoch

**1. Farbschemata → Farbpalette (4.0.0).**
Der Einstellungstyp `color_scheme` kommt in 4.1.3 in keiner Datei mehr vor (3.5.1: 90 Dateien,
72 Schema-Einstellungen). Bei uns: 106 Dateien und 86 Schema-Einstellungen, darunter 15 eigene
`tp-`-Schemata (17 `tp-`-Dateien nutzen Farbschemata). In 80 JSON-Dateien unter `templates/`
und `sections/` stehen rund 480 `color_scheme`-Werte, überwiegend leer oder `scheme-1`, sechsmal
`scheme-2`, einmal `scheme-6` (transparenter Kopf). `config/settings_data.json` trägt die
Schemata selbst. Zwei CSS-Variablen, die eigener Code nutzt, sind in 4.1.3 nirgends mehr
definiert: `--color-primary` (8 Stellen) und `--color-foreground-heading` (2 Stellen).
Zusatzproblem: `settings_data.json` gehört bei uns bewusst **nicht** zum Push
(`docs/lessons/settings-data-wechsel.md`); die umgestellte Datei muss einmalig gezielt auf das
Preview-Theme – das braucht eine ausdrückliche Freigabe (Entscheidung E4).

**2. Warenkorb- und Varianten-Ereignisse.**
`cart:update`, `variant:update` und `discount:update` gibt es in 4.1.3 nicht mehr
(`assets/events.js`). Ersatz sind `shopify:cart:lines-update`, `shopify:product:select`,
`shopify:cart:discount-update` aus dem Modul `@shopify/events`, das vom Shopify-CDN geladen wird.
Eigener Code hängt daran:
- `cart:update`: `assets/tp-cart-artikelzahl.js`, `tp-einfass-konfigurator.js`,
  `tp-laengen-zuschnitt.js`, `tp-muster-grenze.js`, `tp-unterlage-vorschlag.js`,
  `tp-zuschnitt-abgleich.js`, `snippets/tp-funnel-events.liquid`, `blocks/tp-rollware-rechner.liquid`,
  `blocks/paket-auswahl.liquid` – fünf davon senden das Ereignis selbst, damit Kopf-Zähler und
  Drawer nachziehen.
- `variant:update`: 16 Dateien (Farbauswahl, Größen, Leisten, Einfass-Konfigurator,
  Längenzuschnitt, Maß-Kaufangaben, `paket-auswahl`, Funnel-Events).
Ohne Anpassung bleiben nach der Migration Rechner, Zuschnitt, Mustergrenze, Kopf-Zähler und
Kaufmessung still stehen, **ohne Fehlermeldung**. Kein Guard erkennt das.

**3. Warenkorb und Sticky-Kaufleiste.**
`assets/sticky-add-to-cart.js` (5 Konflikte, 461 eigene Zeilen), `snippets/cart-products.liquid`
(3 Konflikte, 81 `tp-`-Bezüge), `assets/component-cart-items.js` (3), `assets/cart-drawer.js` (3),
`snippets/cart-summary.liquid` (2), `assets/cart-icon.js` (2), `snippets/cart-bubble.liquid` (2),
`blocks/_cart-summary.liquid`. Der Drawer ist in 4.x neu aufgebaut (`theme-drawer.js`,
`sections/cart-drawer-section.liquid`, `snippets/cart-drawer.liquid`). Hier sitzen Paketzeile,
Leisten-Paket, Checkout-Menge und Zuschnittangaben.

**4. Preisanzeige.**
`snippets/price.liquid` (449 eigene Zeilen, 2 Konflikte, 93 `tp-`-Bezüge; 12 Tests lesen die
Datei), `blocks/price.liquid` (1 Konflikt). €/m², Streichpreise, „−x % ggü. UVP“ und die
Black-Week-Anzeige hängen daran. Preislogik ist laut `AGENTS.md` eine kritische Änderung: Review
vor dem Merge.

### Mittel

**5. Kopf und Menü.** `sections/header.liquid` (konfliktfrei zusammenführbar, aber 389
Hersteller-Zeilen gegen 224 eigene), `blocks/_header-menu.liquid` (3), `snippets/header-drawer.liquid`
(543 eigene Zeilen, 1), `snippets/header-actions.liquid` (406 Hersteller-Zeilen, 2),
`snippets/mega-menu-list.liquid` (196 eigene), `assets/header-menu.js`, `assets/header-actions.js` (2),
`sections/header-group.json` (4). Betroffen: zweizeiliger Kopf, Kopf-Suche, Mega-Menü-Spalten.

**6. Kollektion, Filter, Produktkarte.** `sections/main-collection.liquid` (3),
`sections/product-list.liquid` (3, 117 `tp-`-Bezüge), `snippets/list-filter.liquid` (2),
`blocks/filters.liquid` (1, je rund 300 Zeilen auf beiden Seiten), `assets/facets.js` (2),
`snippets/product-card.liquid` (2), `snippets/card-gallery.liquid` (2),
`blocks/_product-card-gallery.liquid` (2), `sections/search-results.liquid` (1, 125 `tp-`-Bezüge).
Das vom Hersteller entfernte `product-title-truncation.js` ist bei uns noch eingebunden; ob die
gekürzten Kartentitel davon abhängen, ist **ungeprüft**.

**7. Produktseite.** `snippets/variant-main-picker.liquid` (3), `sections/product-information.liquid` (2),
`blocks/buy-buttons.liquid` (1, 352 Hersteller-Zeilen), `templates/product.json` (4),
`snippets/product-information-content.liquid` und die Galerie-Snippets (konfliktfrei, aber
338 bzw. 165 eigene Zeilen), `assets/product-form.js` (konfliktfrei, 761 Hersteller-Zeilen).

**8. Grundgerüst.** `layout/theme.liquid` (3), `assets/base.css` (2 Konflikte, 2 601
Hersteller-Zeilen gegen 107 eigene), `snippets/scripts.liquid` (Importmap: `@theme/product-title`
entfällt, vier Module neu), `config/settings_schema.json` (konfliktfrei, 568 Hersteller-Zeilen),
`snippets/fonts.liquid` (1), `snippets/theme-styles-variables.liquid`.

**9. Vorlagen und Sektionsgruppen.** 12 Vorlagen und 2 Gruppen mit Konflikten
(`templates/index.json`, `product.json`, `collection.json`, `sections/footer-group.json` …).
Unser Stand gilt; zu übernehmen sind nur neue Pflicht-Einstellungen des Herstellers.

### Niedrig

- 96 Kern-Dateien, die sich bei uns nur durch zwei Leerzeilen unterscheiden: Hersteller-Stand übernehmen.
- 72 unveränderte und 51 neue Hersteller-Dateien.
- Sprachdateien: 50 doppelt geändert, 10 mit Konflikt; `locales/de.json` hat 3 Konflikte,
  `de.schema.json` und `en.default.json` lassen sich konfliktfrei zusammenführen.
- Kern-Snippets, die eigene Bausteine direkt aufrufen: `spacing-style` (10×), `icon`, `gap-style`
  unverändert; `text` (4×), `resource-list`, `accordion-custom-component` vom Hersteller geändert,
  Parameter **ungeprüft**.

### Wo der Rechner hängt

`assets/tp-boden-rechner.js` und `tp-teppich-rechner.js` fragen fast nur eigene `data-`-Attribute
ab; an Kern-Elementen hängen eigene Skripte über `variant-picker` (8 Dateien),
`product-form-component` (4), `cart-drawer-component` (3), `cart-items-component` (2) – alle vier
gibt es in 4.1.3 weiter. Das Risiko für Rechner und Warenkorblogik liegt deshalb bei den
Ereignissen (Punkt 2) und den Warenkorb-Snippets (Punkt 3), nicht bei der Rechenlogik selbst.
Die Rechner werden nicht neu geschrieben.

## Reihenfolge

Jeder Schritt ist ein eigener PR. „Deploy“ heißt die normale Kette
(`workflow:doctor` → `workflow:preview` → `workflow:live`).

### Vorarbeiten auf 3.5.1 – einzeln deploybar, für Kunden unsichtbar

| Schritt | Inhalt | Rückweg | Test | Aufwand |
|---|---|---|---|---|
| **V1** Vergleichswerkzeug | Dreiwege-Vergleich als `npm run`-Befehl mit den beiden Hersteller-Commits, Ausgabe als Liste nach Risiko; kein Theme-Code | PR zurücknehmen, kein Deploy nötig | `npm run -s pruefen` | 0,5 Tage |
| **V2** Ereignis-Brücke | Ein kleiner Helfer, über den alle eigenen Skripte Warenkorb- und Varianten-Ereignisse empfangen und senden; er kennt alte und neue Namen. Auf 3.5.1 ändert sich am Verhalten nichts. Vorher klären: Aufbau der neuen Ereignisdaten (**ungeprüft**) | Revert-PR und Deploy | Desktop und 390 px: Rechner (Paket, Rollenware, Teppich), Längenzuschnitt, Einfass-Konfigurator, Mustergrenze, Unterlage-Vorschlag, Kopf-Zähler, Drawer; `sales:check` 6/6; Kaufmessung im Browser-Netzwerk prüfen | 1–1,5 Tage |
| **V3** Eigene Farben entkoppeln | Die 15 eigenen Schemata mit `color_scheme` und die zwei entfallenden Variablen auf die eigene Farbwelt (`snippets/tp-gestaltung.liquid`) umstellen. Zuerst zählen, welche eigenen Sektionen überhaupt ein anderes Schema als Standard tragen | Revert-PR und Deploy | `qa:visual` vorher/nachher auf allen 15 QA-Seiten, Desktop und 390 px; Sichtprüfung Startseite, Kategorie, Produktseite, Ratgeber | 1 Tag |
| **V4** Testlücken schließen | Siehe „Guards und Tests“: Ereignis-Test, Bildvergleich als Ausgangsbasis, axe auf drei Produktseiten, Lighthouse-Ausgangswert | PR zurücknehmen | `npm run -s pruefen` | 1 Tag |

V1 und V4 ändern nichts am Theme und können im Dezember laufen. V2 und V3 greifen in
Warenkorb und Darstellung ein und gehören nicht ins Weihnachtsgeschäft.

### Kernwechsel – ein Zweig, ein Wegwerf-Theme, ein Livegang

| Schritt | Inhalt | Rückweg | Test | Aufwand |
|---|---|---|---|---|
| **K1** Zusammenführen | Auf einem Migrationszweig: erst die 219 konfliktfreien Hersteller-Dateien (72 + 51 + 96), dann die 71 Konfliktdateien in der Reihenfolge Grundgerüst → Preis → Warenkorb → Produktseite → Kollektion → Kopf, zuletzt Sprachdateien. Zwischenhalt bei 4.0.0 ist möglich, aber nicht deploybar. Nur im Wegwerf-Theme (`workflow:scratch`) | Zweig verwerfen; live ist nichts geändert | nach jedem Block `npm run -s pruefen`, Theme Check gegen neue Baseline | 3–4 Tage |
| **K2** Farben umstellen | `settings_data.json` und die rund 480 `color_scheme`-Werte in den JSON-Dateien auf die Palette abbilden (Skript mit Gegenprobe), sechs Schemata → Palette plus Einzelfarben | wie K1 | `qa:visual` gegen die Basis aus V4, Seite für Seite | 1–1,5 Tage |
| **K3** Abnahme im Wegwerf-Theme | Voller `workflow:validate`, `sales:check` 6/6, Rechner- und Warenkorb-Durchlauf von Hand, axe, Lighthouse gegen Ausgangswert, Konsole ohne neue Fehler; Sichtprüfung durch den Inhaber | wie K1 | Desktop und 390 px: Startseite, je eine Kategorie Teppichboden/Vinyl/Teppiche, Produktseiten Rollenware, Klick-/Klebevinyl, Teppich nach Maß, Restrolle, Muster; Filter, Suche, Menü, Drawer, Warenkorb bis zur Kasse (ohne Kauf); Paket-/Verschnittrechner mit drei bekannten Rechenbeispielen | 1,5–2 Tage, Inhaber 2–3 Stunden |
| **K4** Livegang | Merge, Deploy an einem ruhigen Vormittag (Dienstag bis Donnerstag), danach den öffentlichen Shop ohne Preview-Parameter prüfen, Kaufmessung und Fehlermeldungen 48 Stunden beobachten | Das bisherige Live-Theme bleibt nach dem Wechsel unverändert als Preview liegen und wird bei Bedarf wieder veröffentlicht – **nur solange kein weiterer Deploy gelaufen ist.** Deshalb 7 Tage keine andere Theme-Änderung (E5) | wie K3 in Kurzform am Live-Shop, `theme:guard`, `live-theme.json` | 0,5 Tage |

Während K1–K4 laufen Theme-Änderungen auf `main` weiter gegen den Migrationszweig auf
(`AGENTS.md`, Punkt 6: fertige Arbeit auf ungemergten Branches). Entweder ruht das Theme in
dieser Zeit oder der Zweig wird täglich nachgezogen (E5).

### Nacharbeiten – wieder einzeln deploybar

| Schritt | Inhalt | Rückweg | Test | Aufwand |
|---|---|---|---|---|
| **N1** `aria-current` (w-312) | Liquid, JS und CSS der Galerie-Vorschaubilder zusammen umstellen | Revert-PR und Deploy | axe auf drei Produktseiten, Galerie per Tastatur, 390 px | 0,5 Tage |
| **N2** Aufräumen | Ereignis-Brücke auf die neuen Namen kürzen, Theme-Check-Baseline neu, `theme-regeln` und diese Datei aktualisieren, `lighthouse:messen` | Revert-PR | `npm run -s pruefen`, Rechner-Kurzdurchlauf | 0,5–1 Tag |
| **N3** Folgeversionen | Falls Ziel 4.1.3 bleibt: je Version ein eigener kleiner Wechsel mit V1 als Maßstab | je Schritt voriges Theme | wie K3 in Kurzform | je 0,5–1,5 Tage |

**Summe:** Vorarbeiten 3,5–4 Tage, Kernwechsel 6,5–8 Tage, Nacharbeiten 1–1,5 Tage (ohne N3) –
zusammen **11–15 Arbeitstage**. Die Schätzung beruht auf Dateizahlen und Konflikten, nicht auf
einem Probelauf; nach K1 ist sie belastbar.

## Guards und Tests

**Was absichert** (`npm run -s pruefen`, Skill `werkzeuge`):

- `liquid:guard`, `schema:guard`, `template:guard`: fangen verworfene Liquid-Dateien, fehlende
  Presets und kaputte Vorlagen – wichtig bei 71 von Hand zusammengeführten Dateien.
- `themecheck:guard` gegen `qa/theme-check-baseline.json`: zeigt neue Meldungen; die Baseline
  muss für 4.x neu gesetzt werden, sonst ist der Guard rot oder blind.
- `schrift:guard`, `bewertung:guard`, `compare:check`, `menu:guard`, `seo:check`.
- Tests: 157 der 207 Dateien unter `qa/tests/` lesen Theme-Dateien, am häufigsten
  `snippets/price.liquid` (12), `snippets/cart-summary.liquid` (10), `snippets/cart-products.liquid` (9),
  `blocks/paket-auswahl.liquid` (9), `layout/theme.liquid` (7), `blocks/filters.liquid` (7).
  Sie prüfen, dass eigene Eingriffe im Quelltext stehen – gut gegen verlorene Eingriffe beim Zusammenführen.
- Browser: `npm run qa` (15 Seiten, Desktop und Mobil, Konsole, Überlauf), `qa:visual`,
  `sales:check` (Warenkorb bis zur Kasse ohne Kauf), `lighthouse:messen`.

**Lücken:**

1. **Ereignisse:** kein Test prüft, dass ein Kern-Ereignis bei eigenen Skripten ankommt. Ein
   umbenanntes Ereignis lässt alle Quelltext-Tests grün. → V4: ein Browser-Test „Variante wählen
   und in den Warenkorb legen aktualisiert Rechner, Kopf-Zähler und Drawer“.
2. **Bildvergleich:** `qa:visual` liefert Belege, aber keinen automatischen Vorher/Nachher-Vergleich
   über die Farbumstellung. → V4: Ausgangsbilder festhalten, Vergleich in K2/K3 von Hand oder per Skript.
3. **Rechner im Browser:** die Rechenlogik ist getestet, der Weg „Rechner → Warenkorbzeile mit
   richtiger Menge und Paketangabe“ im echten Theme nur über `sales:check` in Teilen. → K3 von Hand
   mit drei festen Rechenbeispielen.
4. **Barrierefreiheit:** axe läuft nicht in `pruefen`. → V4/N1 gezielt auf drei Produktseiten.
5. **Quelltext-Tests binden an die alte Struktur:** Tests, die Zeilen in Kern-Dateien suchen,
   werden nach dem Zusammenführen teils rot, obwohl das Verhalten stimmt. Jeder rote Test ist
   einzeln zu klären, nie pauschal anzupassen.
6. **Kein Guard für die Hersteller-Basis:** nichts hält fest, auf welchem Hersteller-Commit das
   Theme steht. → V1.
7. **`workflow:doctor`** prüft weder Theme Check noch `schrift:guard` (bekannt); beim Kernwechsel
   beides vor der Preview von Hand.

## Entscheidungen für den Inhaber

| Nr. | Frage | Empfehlung |
|---|---|---|
| **E1** | Überhaupt migrieren? | Ja. Der Abstand wächst mit jeder Version um mehrere tausend Zeilen; Korrekturen an Warenkorb, Menü und Geschwindigkeit kommen nur noch für 4.x. Einen dringenden Grund für sofort gibt es nicht. |
| **E2** | Ziel 4.1.3 oder neueste 4.x? | Neueste 4.x zum Startzeitpunkt. Der schwere Teil (4.0.0) ist derselbe; 4.1.4–4.4.0 beheben Fehler in genau den Bereichen, die wir anfassen. |
| **E3** | Wann? | V1 und V4 ab 02.12.2026 (nach dem Black-Week-Rückweg vom 01.12.). V2 und V3 ab 04.01.2027. Kernwechsel live zwischen Mitte Januar und Mitte Februar 2027, nicht vor einem Wochenende und nicht in einer Aktionswoche. |
| **E4** | Darf die umgestellte `settings_data.json` einmalig gezielt auf das Preview-Theme gebracht werden (Ausnahme von „nie von Hand ins Preview-Theme“)? | Ja, als einmaliger, protokollierter Schritt in K4; ohne sie funktioniert die Farbumstellung nicht. |
| **E5** | Theme-Ruhe: keine anderen Theme-Änderungen während K1–K4 (etwa zwei Wochen) und sieben Tage nach dem Livegang? | Ja. Sonst läuft der Zweig auseinander, und der Rückweg auf das alte Theme geht mit dem nächsten Deploy verloren. Produktdaten, Preise und Dashboard sind nicht betroffen. |
| **E6** | Farben: die sechs heutigen Schemata 1:1 nachbilden oder die Gelegenheit für eine Bereinigung nutzen? | 1:1 nachbilden. Jede optische Änderung erschwert den Vorher/Nachher-Vergleich. |
| **E7** | Neue 4.x-Funktionen einschalten (Produkt-Pflichthinweise, umsortierbarer Blogbeitrag)? | Vorerst nicht; nach der Migration einzeln entscheiden. |

## Ungeprüft

- Es wurde **nichts zusammengeführt, gebaut oder im Browser getestet**. Konfliktzahlen stammen
  aus `git merge-file`; ob konfliktfreie Dateien nach dem Zusammenführen richtig arbeiten, ist offen.
- Aufbau der neuen Ereignisdaten (`shopify:cart:lines-update`, `shopify:product:select`) im
  Vergleich zu dem, was eigene Skripte aus `event.detail` lesen.
- Ob das Theme-Update im Shopify-Admin die Farbeinstellungen selbst umstellt und ob es bei einem
  Theme mit so vielen Code-Eingriffen überhaupt angeboten wird.
- Wie Shopify beim Push auf verwaiste `color_scheme`-Werte in JSON-Vorlagen reagiert.
- Apps und App-Einbettungen (Bewertungen, Kaufmessung, Einwilligung, das stillgelegte
  Mega-Menü-Embed) unter 4.x; Wirkung des vom CDN geladenen Moduls `@shopify/events` auf die Einwilligung.
- Theme-Check-Ergebnis und Lighthouse-Werte unter 4.x.
- Inhalt der Konflikte in den Vorlagen und in den 48 Sprachdateien außer Deutsch und Englisch.
- Konflikte unseres Codes mit 4.1.4–4.4.0 (nur der Umfang beim Hersteller ist gemessen).
- Parameter der vom Hersteller geänderten Kern-Snippets `text`, `resource-list`,
  `accordion-custom-component`, die eigene Bausteine aufrufen.
- Ob die gekürzten Kartentitel vom entfernten `product-title-truncation.js` abhängen.
- Wie stark das Weihnachtsgeschäft im Shop tatsächlich ist; die Terminempfehlung nimmt es als
  gegeben an und stützt sich nicht auf Umsatzzahlen.
