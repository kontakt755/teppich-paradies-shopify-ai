# Produktdaten-Audit TeppichParadies (sjjyq1-6w.myshopify.com)

Stand: 2026-09-08 · Quelle: Admin GraphQL `products` (9 Seiten à 50, sortKey TITLE) · 434 Produkte, keine Duplikate nach ID.
Rohdaten lagen nur in der Session (Admin-API-Export, nicht committet). Beschreibung wurde bei 300 Zeichen abgeschnitten (`truncateAt: 300`), daher sind nur die Befunde „leer" und „< 200 Zeichen" belastbar.

## 1. Bestand

| Status | Anzahl |
|---|---|
| ACTIVE | 401 |
| DRAFT | 32 |
| UNLISTED | 1 (`kostenloses-muster`) |

**productType** (152 Produkte = 35 % ohne Typ, Kernbefund):

| productType | n | davon ACTIVE |
|---|---|---|
| *(leer)* | 152 | 147 |
| Klickvinyl | 85 | 85 |
| Vinyl von der Rolle | 63 | 63 |
| Klebevinyl | 37 | 37 |
| Teppich | 26 | 0 (alle DRAFT) |
| Teppichboden | 16 | 15 |
| Linoleumboden | 9 | 9 |
| Verlege- u. Dämmunterlagen / Kleber & Fixierung | 7 / 7 | 7 / 7 |
| Reinigungsmittel | 6 | 6 |
| Abschlussprofile / Bauchemie / Übergangsprofile / Verlegeband | je 5 | je 5 |
| Sauberlauf | 3 | 3 |
| Sockelleisten | 2 | 2 |
| Musterservice | 1 | 0 |

Die 152 typlosen Produkte sind eindeutig zuordenbar: **104 Klebevinyl** (in `vinylboden-klebevinyl`, Tag `art: klebevinyl`, qm-Metafeld gesetzt — z. B. `alvora-eiche-bernstein-klebevinyl-2-5mm`), **36 Teppichboden** (z. B. `altessa-teppichboden-400cm-500cm`, `boucella-teppichboden-400cm`), **7 Sockelleisten** (`feldwin-sockelleiste-*`, `skarven-sockelleiste-60mm`), 5 Drafts (`sylvara-655-*`, `shipping-weight`). Folge: nur 37 von 141 Klebevinyl-Produkten und 15 von 51 Teppichböden tragen einen Typ — Filter, Reports und Typ-basierte Theme-Logik greifen nur auf ein Viertel.

**Vendor:** TeppichParadies 175, Dornova 43, Solenta 39, Alvora 22, Odense 22, ASTRA / Otto Golze & Söhne 18, Bergen 15, Porto 10, Verona 10, Amara/DEKOWE/Marlow/Turku je 8, Fenora/Kiruna/Nantes/Palermo/Selvana je 6, Verdon 5, Lyon 4, je 1: Cavero, Coloria, Elastium, Fiora, Kaneo, Loftis, Marenta, Nordan, Selene. Inkonsistent: 83 Klickvinyl tragen die Fantasiemarke als Vendor, alle 63 Rollenvinyle und 16 Teppichböden aber „TeppichParadies"; Linoleum mal Marke, mal nicht.

**Primäre Kollektion** (erste Zuordnung): `vinylboden-1` 293, `teppichboden` 51, `zubehoer` 43, keine 29, `bodenleisten` 9, `linoleumboden-1` 9. Alle Kollektionen: `vinylboden-klebevinyl` 141, `-klickvinyl` 85, `-vinyl-von-der-rolle` 63, `teppichboden-schlinge` 27, `-velours` 21, `-wolle` 11, `-hochflor` 9, `-nadelvlies` 2, `-kurzflor` 1, `teppichfliesen` 1, Zubehör-Unterkollektionen 3–10.

- **Ohne Kollektion: 29** — alle DRAFT/UNLISTED (26 Supplier-Drafts `astra-*`/`dekowe-urbana-*`, `shipping-weight`, `sylvara-655-design-klebevinyl-als-einzelplanken-kopie`, `kostenloses-muster`). Kein aktives Produkt ohne Kollektion.
- **ACTIVE, aber nicht im Online Store: 1** — `marlow-eiche-blond-klickvinyl-7mm` (publishedAt null, kein onlineStoreUrl, seit 2026-08-08). Für Kunden unsichtbar, obwohl in `vinylboden-klickvinyl`.

## 2. Datenqualität

| Befund | n | Status | Beispiele |
|---|---|---|---|
| Kein Featured Image / mediaCount 0 | 27 | 26 DRAFT, 1 UNLISTED | `astra-antea`, `astra-barletta`, `dekowe-urbana-creme`, `shipping-weight`, `kostenloses-muster` |
| **mediaCount = 1** | **309** | **308 ACTIVE** | `alvora-eiche-bernstein-klebevinyl-2-5mm`, `bergen-eiche-fruhlingshell-klickvinyl-6mm`, `verdano-eiche-beige-vinylboden-von-der-rolle`, `antirutsch-unterlage-fuer-teppiche-rollenware` |
| Beschreibung leer | 1 | UNLISTED | `kostenloses-muster` |
| Beschreibung < 200 Zeichen | 6 | ACTIVE | `livano-eiche-grau-vinylboden-von-der-rolle` (142), `livano-vinyl-von-der-rolle-300cm-eiche-beige` (165), `livano-eiche-hellgrau-beige-vinylboden-300cm`, `feldwin-sockelleiste-xl-60mm` (179), `skarven-sockelleiste-60mm` |
| seo.title fehlt | 32 | 31 DRAFT, 1 UNLISTED | nur Supplier-Drafts + `sylvara-655-*` + Muster |
| seo.description fehlt | 33 | 32 DRAFT, 1 UNLISTED | dito |
| seo.description > 160 Zeichen | 33 | ACTIVE | `abschlussprofil-aluminium-selbstklebend-34-mm` (185), `abschlussprofil-aluminium-gebohrt-47-mm` (178), `verdano-eiche-dunkelbraun-vinylboden-von-der-rolle` (166), 16× Rollenvinyl, 5× Abschluss-, 5× Übergangsprofile |
| seo.title > 60 Zeichen (Zusatz) | 119 | ACTIVE | `abschlussprofil-aluminium-selbstklebend-34-mm` (73), `bergen-eiche-fruhlingshell-klickvinyl-6mm` (61); 44 typlose, 33 Rollenvinyl |
| Titel > 70 Zeichen | 0 | — | längster Titel 60–69 (2 Stück) |
| Doppelte Titel | 1 | ACTIVE | „Solvana Teppichboden 400cm 500cm": `solvana-teppichboden-400cm-500cm` (9 Farben, 16 Var., ab 19,90) und `solvana-teppichboden-400cm-500cm-1` (15 Farben, 30 Var., ab 36,90) — zwei verschiedene Qualitäten unter einem Namen |

Das Bild-Thema ist das größte: **der gesamte aktive Vinyl-Katalog (141 Klebe, 85 Klick, 63 Rolle) hat genau ein Bild**; nur Teppichboden, Linoleum und Teile des Zubehörs haben 5–10+.

**Lieferanten-/Herstellernamen im Titel (41):** `Hausmarke von A` 19× (Zubehör: „[Hausmarke] PUR Reiniger", „[Hausmarke] JK 124 XPS-Trittschalldämmung"), `ASTRA` 17× (Drafts „ASTRA Antea" …), `Forbo` 3× („Forbo Coral Brush Sauberlaufmatte …"), `Coloria`/`Elastium` je 1× (Eigenmarken, in Ordnung). Zusätzlich als Vendor: „ASTRA / Otto Golze & Söhne" (18) und Tag `ASTRA`/`DEKOWE`. Lieferant A, Linie A-3, JAB, Vorwerk kommen nirgends vor. Bei Hausmarke von A/Forbo ist die Nennung bei Markenzubehör vermutlich gewollt — klären, ob die Regel „kein Lieferant im Titel" auch für Zubehör gilt.

**Englische Farbnamen im Titel:** streng nur 4 — `amara-eiche-nordic-klebevinyl-2-5mm`, `selvana-eiche-nordic-klebevinyl-fischgrat-2-5mm` („Nordic"), `dornova-beton-industrial-hell-klebevinyl-2-5mm`, `odense-beton-classic-klickvinyl-5mm`. Taupe/Beige/Gold/Greige (25 Treffer) sind im Deutschen üblich und wurden nicht gezählt.

## 3. Varianten und Optionen

Optionsnamen: `Title` 256, `Breite` 121, `Farbe` 87, `Gebinde` 15, `Länge` 10, `Ausführung` 10, `Dekor` 1 (`cortessa-sockelleiste` — sollte `Farbe` heißen), `Weight` 1.

- **Option `Farbe`: 87 Produkte** (44 typlos, 16 Teppichboden, 9 Linoleum, 5 Abschluss-, 5 Übergangsprofile, 3 Sauberlauf, 2 Bauchemie, 2 Rollenvinyl, 1 Sockelleiste). Verteilung der Wertezahl: 1–2 Werte: 4 · 4–6: 31 · 7–10: 27 · 11–16: 18 · 18–26: 6 · 62: 1. Spitzen: `skarven-sockelleiste-60mm` 62, `silikon-dichtstoff-dauerelastisch-310-ml` 26, `elastium-linoleumboden-200cm-1` 21, `vallora-teppichboden-400cm-500cm` 20, `corvano-teppichboden` 19.
- **Farbe mit nur einem Wert (Option überflüssig):** `livano-vinyl-von-der-rolle-300cm-eiche-beige` („Eiche Beige"), `livano-eiche-hellgrau-beige-vinylboden-300cm`, `rubira-teppichboden-400cm-500cm` („Sand Hell").
- **Numerische Codes in Farbwerten:** `silikon-dichtstoff-dauerelastisch-310-ml` („09 Betongrau", „21 Caramel" — Nummer vorangestellt), `corvano-teppichboden` („Grün Dunkel (405)", „(406)"), `alvano-teppichboden-400cm-500cm` („Grau Dunkel (98)"). Laut Regel gehören Codes nicht in den Kundennamen; die Linoleum-Produkte (9) sind sauber (nur deutsche Namen).
- **Englische Farbwerte:** `skarven-sockelleiste-60mm` („vintage desert", „fashion oak", „smoked oak white", „Light Classic Oak" — zudem gemischte Groß-/Kleinschreibung), `sylvara-655-design-klebevinyl-als-einzelplanken-kopie` („Prestige Oak Honey Braun", „Infinity Oak Naturel"), `silikon-dichtstoff-…` („Caramel"). Sonst deutsch.
- **Nur `Default Title`: 164** (71 Klickvinyl, 66 typlos, 26 Teppich-Drafts, 1 Muster). Weitere **92** haben die Option `Title` mit dem Wert **„Default"** statt „Default Title" (37 Klebevinyl, 41 typlos, 14 Klickvinyl, z. B. `alvora-eiche-bernstein-klebevinyl-2-5mm`, `verona-terrazzo-schwarz-klickvinyl-6mm`) — Liquid-Prüfungen auf `'Default Title'` (`has_only_default_variant` ist davon unabhängig) greifen dort nicht. Klick-/Klebevinyl haben durchweg **keine** Farboption; Farben sind dort eigene Produkte (Alvora Eiche Bernstein, Cognac, Frost …), die Theme-Regel „Farbe = Option" gilt also nur für Teppichboden/Linoleum/Zubehör.
- **> 100 Varianten: 1** — `shipping-weight` mit **1504 Varianten** (Option `Weight`: „placeholder", „0oz", „0lb", „0g", „0kg" …), DRAFT, ohne Tags/Bild/Kollektion, von der App „Option Price Calculator (OPC)" für Cart Transform angelegt (2026-05-05, zuletzt 2026-09-05 aktualisiert). Belegt fast 1,5 % des Variantenkontingents des Shops; prüfen, ob die App noch genutzt wird — sonst löschen (nur mit Freigabe). Nächstgrößtes: `skarven-sockelleiste-60mm` 62.
- **Preis 0: 28** — 26 Supplier-Drafts, `shipping-weight`, `kostenloses-muster`. Kein aktives Produkt mit Preis 0.

**Preise je productType (Median minVariantPrice, EUR):**

| Typ | n | Median min | Spanne min | Median max |
|---|---|---|---|---|
| (leer) | 152 | 136,34 | 0–218,90 | 136,34 |
| Klebevinyl | 37 | 104,30 | 103,37–146,79 | 104,30 |
| Klickvinyl | 85 | 84,68 | 34,95–165,01 | 84,68 |
| Vinyl von der Rolle | 63 | 25,90 | 22,90–32,90 | 25,90 |
| Linoleumboden | 9 | 49,95 | 39,95–60,95 | 49,95 |
| Teppichboden | 16 | 37,90 | 25,90–294,50 | 37,90 |
| Kleber & Fixierung | 7 | 140,04 | 40,16–489,48 | 161,46 |
| Verlege- u. Dämmunterlagen | 7 | 38,25 | 9,35–592,25 | 43,35 |
| Verlegeband | 5 | 77,49 | 20,21–388,52 | 161,85 |
| Sauberlauf | 3 | 182,52 | 74,47–352,51 | 182,52 |
| Abschluss-/Übergangsprofile | 5/5 | 18,25 / 24,55 | 7,80–40,90 | 56,50 / 78,35 |
| Bauchemie | 5 | 53,50 | 4,65–114,60 | 53,50 |
| Reinigungsmittel | 6 | 10,80 | 8,40–98,15 | 69,35 |
| Sockelleisten | 2 | 7,68 | 7,40–7,95 | 7,68 |
| Teppich (Drafts) | 26 | 0 | 0 | 0 |

Auffällig: Klick-/Klebevinyl zeigen Paketpreise (~85–105 €), Rollenware und Linoleum m²-/lfm-Preise — genau die Mischung, die die €/m²-Anzeige im Theme abfangen muss. Ausreißer `teppichboden` max 294,50 und Unterlagen max 592,25 sind Rollen-/Großgebinde.

## 4. Paketprodukte (`custom.qm_pro_paket`)

Gesetzt bei **227** Produkten: 104 typlose (= Klebevinyl), 85 Klickvinyl, 37 Klebevinyl, **1 Teppichboden** (`aw-ganges-teppichboden`, DRAFT — vermutlich falsch, Teppichboden ist keine Paketware). Werte plausibel (z. B. „3.62").

Alle 85 Klickvinyl und alle 141 Klebevinyl (typisiert + typlos) haben das Metafeld — **kein Klick-/Klebeprodukt ohne qm_pro_paket**. Ohne Metafeld sind erwartungsgemäß 63 „Vinyl von der Rolle", 7 Kleber & Fixierung sowie die 4 Sylvara-Drafts (`sylvara-655-design-klebevinyl-als-einzelplanken`, `…-klickvinyl-mit-integrierter-trittschalldammung`, `…-ohne-…`, `…-kopie`) — Klick/Klebe-Ware ohne Paketangabe, falls sie je aktiviert werden sollen.

## 5. Bestand / Kaufbarkeit

| tracked | inventoryPolicy | n |
|---|---|---|
| nein | DENY | 325 |
| ja | DENY | 55 |
| nein | CONTINUE | 51 |
| ja | CONTINUE | 3 |

- Getrackt: 37 Klebevinyl, 14 Klickvinyl, 4 typlose, 2 Linoleum, 1 Rollenvinyl. Alle 55 getrackten DENY-Produkte haben totalInventory > 100.
- **Nicht kaufbar (tracked + DENY + Bestand ≤ 0): 0.** Kein aktives Produkt ist effektiv unverkäuflich.
- Grenzfall: `coloria-linoleumboden-200cm` und `elastium-linoleumboden-200cm-1` sind getrackt mit Bestand 0, aber Policy CONTINUE — kaufbar, zeigen je nach Theme-Einstellung aber „ausverkauft"-Hinweise.
- Inkonsistenz: 349 aktive Produkte haben totalInventory 0 (ungetrackt), 52 > 100. Bestandsführung ist nur bei einem Bruchteil aktiv; die 325 „untracked + DENY" sind faktisch unbegrenzt verkäuflich.

## 6. Tags

209 verschiedene Tags. **Top 30:** `raum: wohnzimmer` 361 · `material: pvc` 224 · `raum: schlafzimmer` 219 · `raum: flur` 215 · `nutzungsklasse: 23` 212 · `raum: kinderzimmer` 209 · `nutzungsklasse: 33` 158 · `nutzungsklasse: 42` 148 · `raum: arbeitszimmer` 147 · `art: klebevinyl` 141 · `nutzungsklasse: 32` 121 · `raum: küche` 115 · `breite_boden: 400cm` 110 · `art: klickvinyl` 85 · `breite_boden: 200cm` 71 · `raum: kueche` 65 · `art: vinylboden` 63 · `material: vinyl` 63 · `art: teppichboden` 52 · `breite_boden: 500cm` 45 · `zubehoer` 43 · `farbe: beige` 38 · `farbe: braun` 32 · `farbe: grau` 28 · `B2B-Daten-fehlen` 26 · `Supplier-Draft` 26 · `nutzungsklasse: 22` 19 · `marke: <hausmarke-a>` 19 · `ASTRA` 18 · `material: polyamid` 16.

**Inkonsistenzen:**

| Problem | Tags |
|---|---|
| Umlaut-Doppel | `raum: küche` (115) vs `raum: kueche` (65); `muster: fischgrät` (16) vs `muster: fischgrat` (6) |
| Synonyme für dasselbe | `material: pvc` (224) vs `material: vinyl` (63, nur Rollenware); `art: vinyl zum Kleben`/`art: vinyl zum klicken` (Sylvara) vs `art: klebevinyl`/`art: klickvinyl`; `raum: buero` vs `objekt: büro`; `raum: gewerbe` vs `objekt: gewerbe`; `breite_teppich: 500cm` vs `breite_boden: 500cm` |
| Groß-/Kleinschreibung | `Optik: holz` vs `optik: eiche`; `Gesamthöhe: …`, `Nutzschicht: 0`, `Trittschalldämmung integriert: …`, `ASTRA`, `DEKOWE`, `B2B-Daten-fehlen`, `Supplier-Draft` gegen sonst durchgehend kleingeschriebenes `key: value` |
| Einheiten fehlen/uneinheitlich | `Gesamthöhe: 2`, `Gesamthöhe: 4` vs `Gesamthöhe: 6mm`; `Nutzschicht: 0` |
| Schlüssellose Tags | `55mm`, `5mm`, `zubehoer`, `ASTRA`, `DEKOWE` |
| Marken als Tag statt Vendor | `marke: <hausmarke-a>`, `marke: forbo coral`, `ASTRA`, `DEKOWE` — Vendorfeld sagt dort oft „TeppichParadies" |
| `farbe:`-Tag zu feingliedrig | 120 verschiedene `farbe:`-Werte, 90 davon nur 1–2× (z. B. `farbe: eiche wurmstich hell`) — als Filterfacette unbrauchbar; `farbe: weiss` vs `farbe: eiche weiß`, `farbe: gruen` |

Ohne Tags: `kostenloses-muster`, `shipping-weight`.

## 7. Shopify-Produktkategorie

- Gesetzt: 353 „Heimwerkerbedarf > Baumaterialien > Fußböden & Teppichböden" — auch bei Zubehör wie Klebern.
- **Fehlt: 76** (49 ACTIVE, 27 DRAFT): das gesamte Zubehör (7 Unterlagen, 7 Kleber, 6 Reiniger, 5 Abschluss-, 5 Bauchemie, 5 Übergangsprofile, 5 Verlegeband, 3 Sauberlauf, 2 Sockelleisten), 4 typlose Sockelleisten (`feldwin-sockelleiste-40mm`, `-60mm`, `-xl-60mm`, `-xl-80mm`) und die 26 Teppich-Drafts. Beispiele aktiv: `abschlussprofil-aluminium-selbstklebend-34-mm`, `acryl-dichtstoff-ueberstreichbar-310-ml`, `teppichunterlage-elastisch-rollenware`, `basira-sockelleiste`, `fussbodenreiniger-fuer-die-taegliche-reinigung`.
- **„Nicht kategorisiert": 5** — `feldwin-sockelleiste-100mm`, `feldwin-sockelleiste-80mm`, `skarven-sockelleiste-60mm`, `kostenloses-muster`, `sylvara-…-kopie`.

## Priorisierte Handlungsliste

1. **productType nachtragen** bei 152 Produkten (104 → Klebevinyl, 36 → Teppichboden, 7 → Sockelleisten) — per `productUpdate` in einem Bulk-Lauf, Zuordnung aus Kollektion/`art:`-Tag ist eindeutig.
2. **`marlow-eiche-blond-klickvinyl-7mm`** in den Online Store veröffentlichen (aktiv, aber unsichtbar).
3. **Solvana-Duplikat** auflösen: eines der beiden Produkte umbenennen (verschiedene Qualitäten, verschiedene Preise).
4. **`shipping-weight`** (1504 Varianten, OPC-Artefakt) prüfen und mit Freigabe entfernen.
5. **Bilder:** 289 aktive Vinylprodukte mit nur einem Bild — Raumbilder/Detailfotos nachpflegen (größter Hebel für Conversion).
6. **Tags bereinigen:** `raum: kueche` → `raum: küche`, `muster: fischgrat` → `fischgrät`, `material: vinyl` → `pvc` (oder umgekehrt, einheitlich), Sylvara-`art:`-Tags angleichen, Großschreib-Tags normalisieren.
7. **Kategorie** bei 49 aktiven Zubehörprodukten setzen (nicht „Fußböden & Teppichböden", sondern passende Zubehör-Kategorien).
8. **SEO:** 33 Meta-Descriptions auf ≤ 160 kürzen, 119 SEO-Titel > 60 Zeichen prüfen.
9. **Farbwerte** mit Codes/Englisch bereinigen: `skarven-sockelleiste-60mm`, `silikon-dichtstoff-…`, `corvano-teppichboden`, `alvano-teppichboden-400cm-500cm`; Option `Dekor` bei `cortessa-sockelleiste` in `Farbe` umbenennen; Ein-Wert-Farboptionen (Livano, Rubira) entfernen.
10. **`aw-ganges-teppichboden`**: `qm_pro_paket` entfernen (kein Paketprodukt) oder klären.
11. **26 Supplier-Drafts** (ASTRA/DEKOWE, Tag `B2B-Daten-fehlen`): entweder Daten beschaffen oder archivieren — sie verzerren jede Statistik (Preis 0, kein Bild, kein SEO).
