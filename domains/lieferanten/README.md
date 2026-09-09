# Lieferantenabgleich Jordan/JOKA vs. M-Plus

Stand 2026-09-09, Phase 1 (Datenquellen) und Phase 2 (Testlauf Teppichboden, 10 Qualitaeten).
Keine Shopify-Aenderung. Alles hier ist Analyse und Datenbasis.

Ordner: `teppichboden-abgleich/` — Ergebnis `abgleich-testlauf.json`, Rohdaten unter `rohdaten/`,
Skripte unter `scripts/` (Python 3, nur Standardbibliothek plus `pypdf` fuer die PDF-Auswertung).

## 1. Datenquellen (Phase 1)

| Quelle | Zugang | Was sie liefert | Grenzen |
|---|---|---|---|
| **jordanshop.de Quicksearch** `GET /de-DE/quicksearch?query=…&page=n` | offen, JSON | je Farbartikel: Name, `material_number` (Artikelnummer, z. B. `TEPRIVAO4_098`), Farbe, Produkt-URL, Bild | 4 Treffer je Seite, `per_page` wird ignoriert; Suche findet Qualitaeten nur, wenn der Suchbegriff wie der Artikelname lautet („STRONG 733", nicht „Teppichboden Strong 733") |
| **jordanshop.de Produktseite** `GET /de-DE/product/<id>` | offen, SSR-HTML per `curl` | komplette Attributtabelle (Polmaterial, Poleinsatz, Gesamtgewicht, Staerke, Polhoehe, Ruecken, NK, Brandklasse, EAN, Art.-Nr., Kollektion, Marke), `<select>` mit allen Farbvarianten derselben Breite (ID + „Farbe NN"), Dokument-Links | Bestand und Preis nur nach Login („Bitte fragen Sie uns nach der Lieferzeit"); `/api/availability` verlangt CSRF + Session |
| **Jordan PDFs** (TTD = Technisches Datenblatt, DOP/TDOP = Leistungserklaerung, ZGUT = GUT-Zertifikat) | offen | TTD: vollstaendige Technik inkl. Noppenzahl, „Abmessung 400 + 500 + Maßteppich", GUT/PRODIS-Nummer | **Leistungserklaerung nennt als Hersteller immer W. & L. Jordan** (Eigenmarke JOKA) — der echte Produzent steht nirgends |
| **Jordan Sitemap** | offen | ~490.000 URLs, aber nur `/product/<id>` ohne Namen | fuer Sortimentserfassung unbrauchbar; Kategorie-Sitemap hat 2 Eintraege |
| **m-plus.de Kategorie** `/de/Bodenbeläge/Textile-Bodenbeläge/c/20.1?q=:relevance:CMSME000670:<Kollektion>&page=5` | offen, SSR | Produktlinks je Farbartikel; Facette `CMSME000670` = Kollektion (Akzente 2029, Ambiente 2025/2029, Analog 2029, Avantgarde 2029, Avantiles 2026, Extrem 2029, Outdoor 2030) | Seite `page=n` liefert kumuliert max. 100 Links; deshalb je Kollektion abfragen. robots.txt bittet um 10 s Abstand — Skripte warten 2,5–3 s |
| **m-plus.de Produktseite** `/de/…/<Qualitaet>/p/<Art-Nr>` | offen, SSR | Art-Nr, Farbtonliste der ganzen Qualitaet (Code + Name), Breiten, Produkteigenschaften, Spezifikationen (Poleinsatz, Gesamtstaerke, Florhoehe, Faserart, Konstruktion, Ruecken, NK, Brandklasse), Downloads | kein Preis, kein Bestand ohne Haendlerlogin; keine EAN |
| **M-Plus Leistungserklaerungen** `LE_*.pdf` / `Leistungserklaerung_*.pdf` | offen | **nennen den echten Hersteller** (Vebe, Condor, ITC, Associated Weavers, Das Teppichwerk …) | nicht jede Qualitaet hat eine LE verlinkt |
| **Shopify** (MCP) | vorhanden | 50 Teppichboden-Produkte, alle aus Jordan; `grosshandel.sku` = Jordan-Kollektion + Qualitaet, Varianten-SKU = Jordan-Artikelnummer, `custom.farbcode` = Jordan-Farbnummer | ein M-Plus-Produkt (AW Ganges, Entwurf) ohne Artikelnummern |
| **Bestehende Dateien im Repo** | – | `data/jordan-catalog.json` (7 Sockelleisten), `domains/shopify/linoleum-farbdaten/` (Jordan-Produkt-IDs Linoleum), `domains/shopify/zubehoer-daten/jordan-zubehoer.json` | keine M-Plus-Daten, keine Mapping-Datei — hier neu aufgebaut |

**Bestand / ausverkauft:** Beide Shops zeigen Lagerbestand und Preise nur eingeloggt. Die Datei fuehrt deshalb
je Farbe nur `listed` (im Shop gefuehrt) und `stock: unbekannt (Login)`. Fuer echte Bestandsdaten braucht es
entweder den Kundenlogin im Browser (dann per Chrome-Erweiterung auslesbar) oder einen Preis-/Bestandsexport
der Grosshaendler.

**GUT-PRODIS:** Jordan-Datenblaetter tragen eine GUT/PRODIS-Nummer (z. B. Calais `57D5F48E`). Die Abfrage
auf gut-prodis.eu laeuft ueber ein JavaScript-Bundle, eine URL mit Parameter gibt es nicht — offen, koennte
den Lizenznehmer (= Hersteller) fuer Jordan-Qualitaeten liefern.

## 2. Matching-Methode (Phase 2)

Namen sind kein Kriterium. `scripts/match.py` vergleicht jede Jordan-Qualitaet mit allen 97 M-Plus-Textilqualitaeten:

1. Belagsart muss passen (Nadelvlies vs. Tuft) — sonst raus.
2. Punkte fuer Poleinsatzgewicht (±5 %), Gesamtstaerke (±0,6 mm), Polhoehe (±0,6 mm), Ruecken-Typ
   (Textil vs. Vlies/Comfort), Nutzungsklasse, Brandklasse, Rollenbreite.
3. **Farbnummern**: beide Grosshaendler uebernehmen die Herstellerfarbnummern (Jordan `Farbe 98` = SKU-Suffix `_098`,
   M-Plus `733-0021` → 21). Ab drei identischen Nummern zaehlt das stark; untypische Nummern (z. B. 178) wiegen mehr
   als 14/22/70.
4. **Herstellerbeleg** ausschliesslich aus der M-Plus-Leistungserklaerung. Jordan belegt keinen Hersteller.

Status: CONFIRMED nur, wenn Hersteller belegt **und** Technik **und** Farbnummern passen. PROBABLE, wenn Technik
und Farbnummern passen, der Herstellerbeleg aber nur auf einer Seite liegt. Bei Widerspruch in NK, Brandklasse
oder Polhoehe: kein Match, auch wenn einzelne Farbnummern gleich sind.

## 3. Ergebnis Testlauf (10 Jordan-Qualitaeten, alle im Shop)

| Shop-Produkt | Jordan | M-Plus | Hersteller (Quelle) | Status | Farben gemeinsam / nur Jordan / nur M-Plus |
|---|---|---|---|---|---|
| Fortiva Nadelvlies 200cm | Atelier 2030 Strong 733 | Analog 2029 733 Strong | Vebe Floorcoverings bv (M-Plus-LE) | **MATCH_CONFIRMED** | 10 / 3 (16, 24, 120) / 0 |
| Quadra Nadelvlies Fliese | Atelier 2030 Strong 966 Fliese | Analog 2029 966 Strong Modul | Vebe Floorcoverings bv (M-Plus-LE) | **MATCH_CONFIRMED** | 8 / 2 (24, 181) / 0 |
| Vantana | Trend 026 Plaza | Akzente 2029 2403-TR | Condor Carpets bv (nur M-Plus-LE) | **MATCH_PROBABLE** | 7 / 11 / 0 |
| Amara | Sprint 027 Riva | – (naechster: Avantgarde 2205, ITC) | – | NO_MATCH | – |
| Novaris | Trend 026 Terra | – (naechster: Avantgarde 2210, ITC) | – | NO_MATCH | – |
| Altessa | Sprint 027 Altro | – | – | NO_MATCH | – |
| Vallora | Sprint 027 Lara | – (naechster: Akzente 2416-FB, AW) | – | NO_MATCH | – |
| Reganza | Trend 026 Rigoletto | – | – | NO_MATCH | – |
| Kontura | Format 028 Omega | – | – | NO_MATCH | – |
| Callista | 030 Wool & Sisal Calais | – (M-Plus Wolle nur Ambiente 1307/1308) | – | NO_MATCH | – |

Begruendungen und offene Fragen je Produkt stehen in `abgleich-testlauf.json` (`match_reasoning`, `open_questions`);
die Kandidatenliste mit Punkten in `rohdaten/match-kandidaten.txt`.

Auffaellig: In allen drei Treffern fuehrt **Jordan mehr Farben** als M-Plus, M-Plus hat keine zusaetzliche Farbe.
Die M-Plus-Textilkollektionen sind stark mit Fliesen (Avantiles, 28 Qualitaeten) und Objektware belegt.

## 4. Servicefaehigkeit

- **Jordan**: Kettelservice als Serviceartikel „Teppicheinfassung Ketteln" (`TEPKETT_001` bis 4 × 4 m,
  `TEPKETT_002` bis 6 × 4 m). Abgepasste Maßteppiche (rund/eckig) gibt es als eigene Artikel nur fuer die Kollektion
  **Arriva 027** (Amazing, Ambient, Boho, Fancy, Feel, Gloria, Impression, Lobo). Das Datenblatt Calais nennt
  „400 + 500 + Maßteppich". Ob Ketteln fuer jede Rollenware-Qualitaet bestellbar ist, muss der Jordan-Vertrieb
  bestaetigen — in der Datei steht das als Hinweis, nicht als Ja.
- **M-Plus**: Die Seiten nennen keinen Zuschnitt- oder Kettelservice. In der Datei: `unbekannt`, niemals `true`.
- Je Farbe gilt in der Datei: `custom_size_available` und `edging_available` = `jordan_available`.
  `kettelleiste_available` und `dropshipping_available` bleiben `null`, bis die Konditionen vorliegen.

## 5. Vorschlag Shopify-Datenmodell (Phase 5, noch nicht umgesetzt)

Die Servicelogik haengt an der **gewaehlten Farbvariante**. Variant-Metafields sind dafuer die richtige Ebene:
Liquid liest sie ueber `variant.metafields`, der Variantenwechsel ist im Theme bereits verdrahtet
(`tp-rollware-rechner` rechnet je `?variant=` nach), und die Werte bleiben beim Export/Import an der Variante.
Tags sind ungeeignet (Produktebene, keine Typen). Ein Metaobject lohnt sich nur fuer die Lieferanten-Stammdaten,
nicht fuer die Faehigkeiten je Farbe.

**Variant-Metafields, Namespace `lieferant`** (Typen in Klammern):

| Key | Typ | Bedeutung |
|---|---|---|
| `jordan_verfuegbar` | boolean | Farbe bei Jordan gelistet |
| `jordan_artikelnummer` | single_line_text | z. B. `TEPM733L_021` |
| `jordan_farbnummer` | single_line_text | `21` |
| `mplus_verfuegbar` | boolean | Farbe bei M-Plus gelistet |
| `mplus_artikelnummer` | single_line_text | z. B. `2965-000093` |
| `mplus_farbnummer` | single_line_text | `733-0021` |
| `bevorzugt` | single_line_text (jordan/mplus) | bevorzugter Lieferant |
| `alternativ` | single_line_text | Zweitlieferant oder leer |
| `wunschmass` | boolean | Zuschnitt/Wunschmass anzeigen |
| `kettelung` | boolean | Kettelservice anzeigen |
| `kettelleiste` | boolean | Kettelleisten anzeigen |
| `dropshipping` | boolean | Direktversand moeglich |

**Produkt-Metafields, Namespace `lieferant`**: `hersteller`, `hersteller_qualitaet`, `jordan_produktname`,
`mplus_produktname`, `match_status`, `abgleich_datum`. Der bestehende `grosshandel.sku` bleibt als
Jordan-Linienname erhalten.

**Metaobject `lieferant`** (jordan, mplus): Name, Shop-URL, Login-Hinweis, Servicekatalog, Lieferzeit — einmal
gepflegt, von Produkt-/Variantenfeldern referenziert (`metaobject_reference`). Das skaliert auf weitere Lieferanten
ohne neue Keys.

**Theme-Logik spaeter**: Block liest `variant.metafields.lieferant.wunschmass` / `kettelung`; ist beides `false`
(nur M-Plus), werden Wunschmass-Rechner und Kettel-Option ausgeblendet und der Hinweis „Fuer diese Farbe ist
derzeit kein Wunschmass bzw. Kettelservice verfuegbar." gezeigt. Beim Variantenwechsel muss der Block die Werte
aus einem JSON-Datenblock je Variante nachlesen (wie der Rollenware-Rechner), nicht neu rendern.

## 6. Naechste Schritte (Phase 4, nach Freigabe der Methode)

1. Jordan-Sortiment komplett: Quicksearch je Kollektion (Sprint 027: 378 Farbartikel, Trend 026: 430,
   Wool & Sisal: 186, Nadelvlies: 288; „Teppichboden" gesamt 3.415) — ca. 850 Aufrufe, dann je Qualitaet eine
   Produktseite. Laeuft in ~30 Minuten im Hintergrund.
2. M-Plus: 97 Qualitaeten liegen bereits vollstaendig in `rohdaten/mplus-textil-qualitaeten.json`; fuer alle
   Leistungserklaerungen laden (Hersteller je Qualitaet).
3. Matching ueber alles, Farbartikel nur fuer Treffer nachladen.
4. Bestand: Kundenlogins beider Shops im Browser, dann Verfuegbarkeit je Farbartikel auslesen.
5. Danach erst Phase 5 (Metafelder anlegen) — nach ausdruecklicher Freigabe.

Die Struktur ist kategorieneutral (`category`, `technical_data` als Schluessel-Wert-Paare je Quelle) und laesst
sich auf PVC, Vinyl, Klickvinyl, Laminat, Parkett, Sockelleisten und Zubehoer uebertragen; nur die Vergleichs-
merkmale in `match.py` sind je Kategorie anzupassen.
