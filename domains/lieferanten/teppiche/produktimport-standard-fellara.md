# Produktimport-Standard nach Fellara (Lieferant B, Stueckware)

Stand 2026-09-30. Referenzprodukt: `fellara-dekofell` (Product 16102406783310).
Jedes weitere Produkt aus der Lieferung von Lieferant B muss mindestens diesen Stand
erreichen. Lieferantennamen, Marken und Pfade stehen nur lokal:
`~/teppich-paradies-analyse/lieferantendaten/lieferant-b-import-handoff-2026-09-30.md`.

Vorher lesen: `domains/shopify/produktimport-arbeitsweise.md`, Skill `produktimport`,
`importplan-2026-09.md`, `draft-product-groups-2026-09.json` (76 Gruppen, 584 SKUs),
`import-snapshot-2026-09.json`, `domains/shopify/dekofell-template.md`.

## Routing

`npm run workflow:route` ergibt fuer den Import Klasse D: Sitzung **Opus, Effort high**,
unabhaengiges Review vor den Shopify-Schreibvorgaengen. Massenanlage und Preise sind
geschuetzte Aktionen: Freigabe des Inhabers **zu Beginn** im Chat einholen (Preisregel,
Umfang, Veroeffentlichen). Merges nach `main` blockt der Auto-Modus ohne ausdrueckliche
Freigabe im Chat.

## Checkliste je Produkt

1. **Dublettenabgleich** aller SKUs und EANs ueber alle Status (Varianten-Suche `sku:` und
   `barcode:`), nicht nur Titel. Vorhandene Entwuerfe (z. B. Velora) wiederverwenden.
2. **Name und Stamm:** Eigenname (wie Fellara, Velora), Vendor `TeppichParadies`,
   Produkttyp `Dekofell` bzw. `Wohnteppich`, Kategorie `hg-3-57`,
   `mm-google-shopping.google_product_category = 598`, SEO-Titel/-Beschreibung.
3. **Optionen:** `Farbe` (deutsche Farbnamen, am Bild pruefen) und `Größe` im Format
   `80 × 150 cm`, `Ø 160 cm rund`, `40 × 60 cm Fellform` – `tp-groessen-form` liest
   Mass und Form genau aus diesem Format.
4. **Preis:** Regel siehe unten. Kein Vergleichspreis.
5. **Varianten:** SKU = neue Artikelnummer, Barcode = EAN, Gewicht aus der Datenliste,
   Metafeld `custom.farbcode` (Farbcode abgeschrieben), Bestand nicht verfolgt.
6. **Metafelder:** `custom.material` (Text), `custom.fasermaterial`, `custom.arten`
   (Teppich-Art, z. B. „Dekofell“), `custom.zimmer`, `custom.fusbodenheizung` (nur wenn
   belegt), `shopify.color-pattern` (auf vorhandene Grundfarben abbilden),
   `custom.merkmale` (max. 4 belegte Merkmale), `custom.bildnachweis` (Wortlaut laut
   Bildbedingungen der Marke), `grosshandel.sku` (Lieferantenlinie). Fehlende Metaobjekte
   (z. B. Fasermaterial Viskose) anlegen, Status ACTIVE.
7. **Tags:** `art: …`, `farbe: …`, `material: …`, `raum: …`, `eignung: …`, `ohne-muster`.
8. **Beschreibung:** `pd-card` mit Kurztext, drei Badges, Tabelle `pd-specs`; nur
   Lieferantenangaben; geschuetzte Leerzeichen in `30 °C`, `100 %`, `40 × 60 cm`.
9. **Bilder:** nur exakter Design- **und** Farbcode, nie ein aehnliches Muster.
   Je Farbe kuratieren: Freisteller je Groesse/Form als Variantenbild, dazu 2–3 Raumbilder,
   Detail, Rueckseite. Jedes Bild ansehen – Archive enthalten falsch beschriftete Dateien
   (Fellara: Rueckseite „beige“ zeigt ein graues Fell). EXIF-Drehung anwenden, lange Seite
   2400 px, JPEG q86, Dateiname `<handle>-<farbe>-<motiv>.jpg` ohne Lieferantennamen.
   Alt-Text `<Name>, <Farbe>, <Motiv>` – er muss genau **eine** Farbe des Produkts nennen
   und darf kein anderes Farbwort enthalten (die Galerie blendet fremde Farben ueber den
   Alt-Text aus; „Goldschale“ wuerde als Gold zaehlen). Titelbild = aussagekraeftigster
   Freisteller.
10. **Template:** Dekofelle `dekofell`. Wohnteppiche: `product.wohnteppich` erst auf den
    Aufbau von `dekofell` bringen (Farbkreise, `tp-groessen-form`, Merkmale, Bildnachweis,
    keine Empfehlungen, kein Verlegeservice) oder `dekofell` verwenden – vorher mit vielen
    Groessen (bis 7) und runden Formaten im Arbeitstheme pruefen, `rund_zoom` an die
    Freisteller anpassen.
11. **Kollektion:** `wohnteppiche` (manuell).
12. **Veroeffentlichen:** erst `UNLISTED` + Onlineshop veroeffentlichen, auf der Live-Seite
    pruefen, dann `ACTIVE`.
13. **Gegenprobe:** Variantenzahl, SKU, EAN, Preis, Medien READY, Variantenbilder,
    Metafelder, Kollektion, Filter auf der Kollektionsseite, Warenkorbtest (hinzufuegen,
    SKU/Preis pruefen, wieder entfernen), Handy 375 px.

## Preisregel (Inhaber 2026-09-30 fuer Fellara)

Lieferant B berechnet je Sendung eine Dropship-Gebuehr (Betrag lokal). Sie wird voll auf den
Artikel umgelegt, damit eine Einzelbestellung dieselbe Marge wie beim UVP ohne Gebuehr hat:

`VK = UVP + (Gebuehr netto − Versandertrag netto) × 1,19`, auf ,99 aufgerundet.

Fellara: +9,29 € auf UVP (5,99 → 15,99; 11,99 → 21,99; 19,99 → 29,99).

**Bestaetigt 2026-09-30 fuer alle Artikel von Lieferant B:** unter 50 € Endpreis +9,29 €,
ab 50 € Endpreis (Versand frei, kein Versandertrag) +14,28 €, jeweils auf ,99 aufrunden.
Die Schwelle richtet sich nach dem **Endpreis**: UVP 49 → 58,29 waere ≥ 50, also 49 + 14,28
→ 63,99; UVP 39 → 48,99.

## Groessen (Inhaber 2026-09-30)

Paketversand nur bis 200 cm Laenge und 30 kg. Ein Teppich wird ueber die kurze Seite
gerollt: anlegen, wenn die **kurze Seite ≤ 200 cm** und das Gewicht ≤ 30 kg ist
(200 × 300 cm ja, 240 × 330 cm nein).

## Lizenzmarke von Lieferant B (erste Umsetzung 2026-09-30, 7 Produkte)

Fuer die Lizenzmarke gelten eigene Bild- und Markenbedingungen (Dokumente lokal):
- Titel mit Marke in der vorgeschriebenen Schreibweise, Produktname in Versalien;
  Vendor = Markenname. Bewusste Ausnahme von #753 (Inhaberentscheidung).
- Bilder nur proportional skalieren/beschneiden, keine Logos auf Produktbildern, keine
  Empfehlungen fremder Produkte auf der Seite (Template `dekofell` erfuellt das).
- Bildvermerk laut Bedingungen im Metafeld `custom.bildnachweis`.
- Template `dekofell` ohne Aenderung auch fuer rechteckige Wohnteppiche (bis 4 Groessen).

## Bildarchiv – Befunde

- Motive mit Suffix `_KI` tragen den Vermerk „AI generated“ und zeigen die Form teils
  abweichend: nicht verwenden, nur echte Fotos.
- Falsch beschriftete Raumdetails kommen vor (Farbe B zeigte Farbe A) – jedes Bild ansehen,
  am einfachsten per Kontaktbogen je Linie und Farbe.
- Nicht jede Farbe hat Raumbilder; dann Draufsicht, Perspektive, Ecke, Detail, Kante.
- Alt-Texte: die Galerie vergleicht mit Liquid-`contains`, das Gross-/Kleinschreibung
  unterscheidet („Hellblau“ enthaelt nicht „Blau“). Farben, die Teilwort einer anderen in
  gleicher Schreibung waeren, vermeiden (z. B. „Silber“ neben „Silber/Schwarz“ – eine der
  beiden umbenennen). Auch der Produktname darf keine Farbe des Produkts enthalten.
- Neben `_KI` gibt es Collagen aller Farben (`farben`), Bilder mit eingeblendetem Text oder
  Siegel (`award`, `oekotex`, `saugroboter`) und Wunschmass-Motive (`wunschmass`, `wm`,
  `einfassung`): nicht verwenden. Raumbilder zeigen teils eine runde Ausfuehrung, die es in
  der Liste nicht gibt – weglassen.
- Fehlt der Freisteller von oben, ist die Perspektive mit ganzem Teppich das Variantenbild.

## Hausmarke von Lieferant B (2026-10-07, 68 Produkte)

- **Je Design ein Produkt** (Farben und Groessen als Optionen), Eigenname passend zum Muster
  (Blumen → „Florina“), nie ein Farbwort fuer einen andersfarbigen Teppich. Titel
  `<Name> Wohnteppich`, Vendor `TeppichParadies`, Produkttyp `Wohnteppich`, Template `dekofell`.
- Bildbedingungen 10-2026: Vermerk ohne Jahreszahl im Metafeld `custom.bildnachweis`;
  KI-gekennzeichnete Bilder braeuchten einen sichtbaren Hinweis am Bild – deshalb nicht
  verwenden. Logo nicht noetig (Inhaberentscheidung 2026-10-07).
- Datenliste: Spalte „Durchmesser“ ist der Rollendurchmesser der Verpackung, nicht die Form.
  Rund ist nur, was in der Bezeichnung „rund“ heisst (oder im Bild eindeutig rund ist und als
  quadratisches Mass gelistet wird – dann `Ø … cm rund`). Breite/Laenge teils vertauscht:
  Mass aus der Bezeichnung nehmen. Flaechengewicht gegen Stueckgewicht/Flaeche pruefen und
  bei grober Abweichung weglassen.
- Farbnamen bleiben beim Lieferantennamen, auch wenn das Foto anders wirkt.
- Bildsichtung parallel: Kontaktboegen je Design/Farbe, mehrere Pruefer je Liniengruppe,
  Ergebnis als JSON (Variantenbild, Galerie, Auffaelligkeiten). Bogen-Dateinamen in einer
  Schreibweise erzeugen – macOS unterscheidet Gross-/Kleinschreibung nicht und ueberschreibt.

## Nach der Anlage (feste Regel)

- Einkaufsfelder je Variante setzen (`einkauf.lieferant`, `hersteller`, `marke`,
  `lieferant_kollektion`, `lieferant_produktname`, `artikelnummer`, `farbnummer`, `farbname`,
  `bestelleinheit`) nach Skill `shopify-massendaten` – sonst ist das Produkt im Lexikon nicht
  ueber den echten Namen auffindbar. `bestelleinheit` ist eine Auswahlliste (`stueck`, nicht
  `stk`); `metafieldsSet` verwirft bei einem ungueltigen Wert den ganzen Aufruf.
- Danach Lexikon exportieren (`daten:aktualisieren`) und nach Shop- und Lieferantennamen suchen.

## Technik, die funktioniert hat

- Anlage in einem Schritt: `productSet` mit `files` (resourceUrl aus dem Staged Upload) und
  `variants[].file` (dieselbe Quelle) legt Bilder und Variantenbilder mit an.
- `shopify store execute` hat kein `write_publications` und darf auch
  `publishedOnPublication` nicht lesen: Veroeffentlichen und Pruefen ueber den MCP
  (Zaehlen: `productsCount(query:"… published_status:published")`).
- Python-Bildverarbeitung: `ProcessPoolExecutor` startet unter macOS das Skript neu und bricht
  ohne `__main__`-Schutz ab; `ThreadPoolExecutor` genuegt.
- Bilder: `stagedUploadsCreate` (PUT) → `curl -X PUT -H "Content-Type: image/jpeg"`
  (**kein** `x-goog-acl`-Header, sonst 400) → `productCreateMedia` je 15 Bilder.
- Skriptbare Schreibvorgaenge: `shopify store execute -s <store> --query-file … --variable-file … -j --allow-mutations --output-file …`.
- zsh trennt `$VAR` nicht an Leerzeichen: Dateilisten fuer `theme push --only` per Bash-Array.
- Excel ohne Zusatzpakete: `.xlsx` ist ein ZIP (sharedStrings.xml + sheet1.xml).
- Storefront zeigt neue Preise erst nach rund einer Minute.
