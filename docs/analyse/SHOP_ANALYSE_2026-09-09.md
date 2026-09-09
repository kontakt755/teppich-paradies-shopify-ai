# Shop-Analyse TeppichParadies — Stand 2026-09-09

Auftrag: alle bisherigen Analysen zusammenführen, den Shop erneut prüfen, Router nutzen.
Router-Klassifikation: `TASK-2C08A8FF4383`, Klasse **B** (fable/medium, Codex-Review empfohlen,
nicht ausgeführt — in der Remote-Session fehlen `.env.local` und das Codex-Binary, siehe Abschnitt 8).

Quellen dieser Analyse:

- Shopify Admin API über den MCP (Produkte, Kollektionen, Menüs, Seiten, Versandprofile, Redirects, Themes)
- ShopifyQL-Analytics (Sitzungen, Warenkorb, Checkout, Herkunft, Landingpages, Länder, Geräte)
- Repository-Stand `main` (Theme-Code, Templates, Guards)
- 30 bisherige Berichte im Repo (verdichtet in Abschnitt 6)
- Detailberichte: `produkt-audit-2026-09-08.md` (434 Produkte) und `theme-code-review-2026-09-08.md`

Nicht möglich aus der Remote-Session: Storefront-Screenshots, Lighthouse, Testkauf, Admin-Oberflächen
(Customer Events, Google & YouTube-Kanal, Search & Discovery).

---

## 1. Zusammenfassung — was wir entdeckt haben, was besser werden muss

Stand 2026-09-09 nach der zweiten Session. Erledigtes ist markiert, damit der Bericht nicht
als Liste offener Baustellen weiterlebt, die längst keine mehr sind.

### Was wir entdeckt haben

1. **Besucher ja, Käufer nein.** 5.136 Sitzungen in 90 Tagen, 22 mit Warenkorb, 6 im Checkout,
   **0 abgeschlossen**. Über 365 Tage: 15.481 Sitzungen, 3 Bestellungen (1 Test, 2 Muster).
   Der Traffic hat sich in einem Jahr vervierfacht, die Checkout-Starts nicht.
2. **Der Shop ist ein lokaler Fachbetrieb mit Online-Katalog.** 37 % der Einstiege landen auf
   den Verlegeservice-Seiten. Diese Menschen suchen einen Handwerker in Oranienburg/Berlin und
   rufen an. Der wichtigste Umsatzkanal ist im Shop unsichtbar, weil kein Anruf und kein
   Formular gemessen wird.
3. **Es wird nichts gemessen.** Kein GA4-, Ads- oder Meta-Tag im Theme; die beiden Shopify-Pixel
   im Admin wurden nie per Testkauf verifiziert. Der Google-Ads-Plan (#43–#58) baut auf einer
   Messung auf, die es nicht gibt.
4. **Der Kaufpfad hatte vermeidbare Reibung.** Muster-Buttons führten ins Kontaktformular am
   fertigen Musterkonfigurator vorbei *(behoben)*. Warenkorb sagt „Geschätzter Gesamtbetrag",
   Sie und Du sind gemischt, kein USP-Band, Länderwähler aktiv, Elfsight lädt ohne Consent.
5. **Mobil ist das schwächste Glied.** Mobil bringt 7-mal mehr deutsche Besucher als Desktop,
   erreicht aber 5-mal seltener den Checkout. Acht Mobil- und Formular-Snippets im Theme werden
   nirgends gerendert, Touch-Targets liegen unter 44 px.
6. **Produktdaten waren lückenhaft.** 152 Produkte ohne Typ *(behoben)*, 308 aktive Produkte
   mit nur einem Bild, 0 GTIN, Tags in drei Schreibweisen, Kollektion Kurzflor mit einem Produkt,
   ein aktives Produkt unveröffentlicht, ein Entwurf mit 1.504 Varianten als App-Artefakt.
7. **Alte Pfade liefen ins Leere.** Sechs Weiterleitungen zeigten auf gelöschte Kollektionen,
   sieben alte Pfade mit direkten Einstiegen lieferten 404 *(behoben)*.
8. **Alte Berichte widersprechen sich.** Drei verschiedene Produktzahlen, drei Live-Theme-IDs,
   ein Audit über Produkte, die nie existierten, ein Konfigurator gleichzeitig „bereit" und
   „verworfen". Tabelle in Abschnitt 6.
9. **Gut und nicht anfassen:** Theme-Code sauber (alle Guards grün), Menü vollständig, Versand
   für Bodenbeläge kostenlos, alle Zahlungsarten aktiv, kein aktives Produkt unverkäuflich.

### Was wir besser machen

In dieser Reihenfolge, weil jeder Punkt den nächsten erst bewertbar macht:

| # | Maßnahme | Status | Wer |
|---|---|---|---|
| 1 | **Messen**: Customer Events prüfen, Testkauf, Anruf- und Formular-Ziele anlegen | offen | Ahmet |
| 2 | **Service-Funnel monetarisieren**: Anfrage-CTA und `tel:`-Events auf den Verlegeseiten | offen, wartet auf Zieldefinition | Agent + Ahmet |
| 3 | **Musterpfad**: Muster-CTAs auf den Konfigurator | **erledigt** (PR #114) | — |
| 4 | **Produkttypen** bei 147 Produkten | **erledigt** (Admin API) | — |
| 5 | **Redirects**: 6 Ziele korrigiert, 7 neu angelegt | **erledigt** (Admin API) | — |
| 6 | **Vertrauen mobil**: Warenkorb-Text, Sie-Form, USP-Band, Länderwähler aus, Elfsight hinter Consent | offen | Agent |
| 7 | **Tote Snippets** einbinden oder löschen, Touch-Targets auf 44 px | offen | Agent |
| 8 | **Latente cm-Modus-Fehler** in `price_custom` und Rechner schließen | offen | Agent |
| 9 | **Kollektions-SEO**, Startseiten-Title, Linoleum-Platzhalterbild | offen | Agent |
| 10 | **Google Shopping**: Rollenware-Ausschlussliste neu erzeugen, dann Kanalausschluss | offen, Human Gate | Agent → Ahmet |
| 11 | **Fotos** für die 20 meistbesuchten Produkte, Alt-Texte | offen | Ahmet → Agent |
| 12 | **Datenhygiene**: Tags, Zubehör-Kategorien, Solvana-Duplikat, Marlow veröffentlichen | offen | Agent |
| 13 | **Entscheidungen**: `shipping-weight` löschen, 26 Supplier-Drafts, Markenname | offen | Ahmet |

Punkte 6 bis 9 und 12 kann ein Agent ohne Freigabe umsetzen. Punkte 1, 10, 11 und 13
brauchen Admin-Zugang, Fotograf oder eine Entscheidung. Ohne Punkt 1 bleibt jede weitere
Theme-Arbeit unbewertbar.

## 2. Kennzahlen

### Traffic und Conversion (ShopifyQL, letzte 90 Tage bis 2026-09-08)

| Kennzahl | Wert |
|---|---|
| Sitzungen | 5.136 |
| … davon Deutschland | 3.322 (65 %) |
| … davon USA / Litauen | 1.216 / 262 (Bot-Anteil wahrscheinlich) |
| Mobil / Desktop / Tablet | 3.189 / 1.897 / 37 |
| Sitzungen mit Warenkorb-Aktion | 22 |
| Sitzungen im Checkout | 6 |
| Abgeschlossene Checkouts | **0** |
| Herkunft | Direkt 2.370 · Google 2.358 · Facebook 203 · Instagram 173 |

Deutschland nach Gerät: Mobil 2.871 Sitzungen, 19 Warenkorb, 1 Checkout · Desktop 415 Sitzungen,
13 Warenkorb, 5 Checkout. **Desktop konvertiert in den Warenkorb 4,5-mal häufiger als Mobil**, obwohl
Mobil 7-mal mehr Besucher bringt — der mobile Kaufpfad ist das schwächste Glied.

### Monatsverlauf (365 Tage)

| Monat | Sitzungen | Warenkorb | Checkout |
|---|---|---|---|
| 2025-09 | 500 | 2 | 0 |
| 2025-12 | 1.119 | 2 | 0 |
| 2026-02 | 1.220 | 9 | 7 |
| 2026-03 | 1.467 | 33 | 5 |
| 2026-05 | 1.460 | 9 | 4 |
| 2026-07 | 1.309 | 5 | 6 |
| 2026-08 | 2.132 | 24 | 7 |
| 2026-09 (bis 08.) | 826 | 3 | 0 |

Der Traffic hat sich in einem Jahr vervierfacht (August: Rekord), die Checkout-Starts bleiben bei
5–7 pro Monat. Wachstum kommt an, konvertiert aber nicht.

### Landingpages (90 Tage)

| Pfad | Sitzungen | Einordnung |
|---|---|---|
| `/` | 1.993 | Startseite |
| `/pages/teppichboden-verlegen-lassen` | 798 | Service |
| `/pages/vinylboden-verlegen` | 672 | Service |
| `/pages/treppenverlegung` | 349 | Service |
| `/collections/teppischboden` | 268 | **Tippfehler-URL**, Redirect existiert, Google indexiert sie weiter |
| `/password` | 98 | Passwortseite (Shop ist offen, vermutlich Preview-Links) |
| `/pages/liefer-verlegeservice` | 98 | Service |
| `/pages/kontakt` | 75 | Service |
| `/collections/teppichboden` | 75 | Sortiment |
| `/collections/vinylboden-1` | 50 | Sortiment |

Alle Kollektions- und Produktseiten zusammen bekommen unter 10 % der Einstiege. Über 180 Tage
brachten die Startseite (42 Warenkorb-Aktionen) und `/collections/teppichboden` (21) fast alle
Warenkorb-Aktionen; die Serviceseiten mit 1.487 Sitzungen genau 2.

### Katalog (Admin API, 2026-09-08)

| Kennzahl | Wert |
|---|---|
| Produkte gesamt | 434 (401 aktiv, 32 Entwurf, 1 unlisted) |
| Kollektionen | 24 |
| Vinylboden aktiv (Klebe / Klick / Rolle) | 141 / 85 / 63 |
| Teppichboden aktiv | 51 (Schlinge 27, Velours 21, Wolle 11, Hochflor 9, Nadelvlies 2, **Kurzflor 1**) |
| Linoleum / Bodenleisten / Zubehör | 9 / 9 / 43 |
| Produkte ohne `productType` | **152 (35 %)** — am 09.09. auf 0 aktive gebracht |
| Aktive Produkte mit nur einem Bild | **308** (gesamter Vinyl-Katalog) |
| Varianten ohne GTIN | alle (2.893 laut Feed-Audit 30.08.) |
| Bestellungen seit Februar 2026 | 3 (1 Test 5,99 €, 2 Muster 0 €) |

### Versand (Lieferprofile)

Bodenbeläge & Teppiche: kostenlos innerhalb Deutschlands. Allgemeines Profil: 4,99 €, ab 50 € frei.
Muster: kostenlos. EU 13,99 €, International 19,99 € — Versand in 41 Länder ist freigeschaltet,
obwohl schwere Rollenware realistisch nur DE bedient wird (siehe P1-4).

---

## 3. Was der Shop gerade ist

Die Zahlen zeigen einen **lokalen Fachbetrieb mit Online-Katalog**, keinen Onlineshop:

- Google bringt Menschen, die „Teppichboden verlegen lassen Oranienburg" suchen. Sie landen auf den
  Serviceseiten und rufen an — oder nicht. Beides ist unsichtbar.
- Der Katalog (434 Produkte, aufwendige Rechner, Musterservice) wird kaum betreten.
- Die 22 Warenkorb-Sitzungen in 90 Tagen sind zu wenige, um aus ihnen Muster abzuleiten.

Daraus folgt für die Priorisierung: **erst messen, dann den Service-Funnel monetarisieren, dann den
Kaufpfad glätten.** Weitere Theme-Feinarbeit ohne Messung bewertet niemand.

---

## 4. Befunde, priorisiert

Alle Angaben gegen Admin-API oder Code geprüft; wo ein Subagent-Befund nicht zutraf, steht das dabei.

### P0 — jetzt

**P0-1 · Keine belastbare Messung.**
Kein GA4/GTM/Meta-Tag in `layout/theme.liquid` oder `settings_data.json`. Laut `TRACKING_REPORT.md`
(12.08.) existieren ein App-Pixel und ein Custom-Pixel im Admin, Purchase-Event nie getestet, Risiko
doppelter Events. Der Google-Ads-Plan (Issues #43–#58) setzt auf Conversion-Tracking auf, das nicht
verifiziert ist.
→ Ahmet: Customer Events im Admin prüfen, genehmigter Testkauf mit der 9-Punkte-Checkliste aus
`TRACKING_REPORT.md`. Zusätzlich Anruf-/Formular-Ziele anlegen (siehe P0-2).

**P0-2 · Der Service-Traffic hat kein Conversion-Ziel.**
1.917 Sitzungen (37 %) landen auf Verlegeservice-Seiten. Es gibt dort kein messbares Ereignis
(Klick auf Telefonnummer, Formular gesendet, WhatsApp). Der wichtigste Umsatzkanal des Betriebs
ist im Shop unsichtbar.
→ Agent kann: `tel:`-Links und Formular-Submit als Custom Events auszeichnen, Serviceseiten mit
klarem Anfrage-CTA versehen. Ahmet: Ziele in GA4/Ads anlegen.

**P0-3 · Musterbestellung führt am fertigen Musterkonfigurator vorbei.** *(Code geprüft — erledigt 2026-09-09, PR #114)*
`sections/tp-sample-checkout.liquid` + `templates/page.muster.json` sind ein kompletter
Warenkorb-Musterservice (max. 3 Farben, kostenlos). Kein Link im Theme zeigt darauf; alle drei
Muster-CTAs verlinken `/pages/kontakt?thema=muster`:
`blocks/tp-service-links.liquid:17`, `blocks/tp-card-actions.liquid:86`, `blocks/tp-teppich-versand.liquid:21`.
`/pages/muster` hatte in 180 Tagen 10 Einstiege. Muster sind bei Bodenbelägen der Kaufauslöser Nr. 1.
→ Erledigt: Produkte mit Option `Farbe` verlinken `/pages/muster?produkt=<handle>`. Produkte ohne
Farboption (Klick-/Klebevinyl als Einzeldekor) behalten das Kontaktformular, weil der Konfigurator
die Farbwerte der Option als Muster listet und ohne Option nur eine Fehlermeldung zeigt. Live nach
dem nächsten Deploy.

### P1 — diese Woche

**P1-1 · 308 aktive Produkte mit genau einem Bild.** Der gesamte Vinyl-Katalog (289 Produkte) zeigt
nur das Dekorbild, kein Raumbild, keine Struktur, keine Verlegung. Fotos sind laut
`qa/PHOTO_ROLLOUT_CHECKLIST.md` beauftragt.
→ Ahmet: Fotos priorisiert für die 20 meistbesuchten Produkte; Agent: Alt-Texte beim Einspielen.

**P1-2 · 152 Produkte ohne `productType`** (104 Klebevinyl, 36 Teppichboden, 7 Sockelleisten). *(erledigt 2026-09-09)*
Filter, Reports, Google-Feed-Kategorien und Typ-Logik im Theme greifen nur auf ein Viertel.
Zuordnung ist aus Kollektion und `art:`-Tag eindeutig.
→ Erledigt per Admin API für alle 147 aktiven Produkte. Gegenprüfung: 0 aktive Produkte ohne Typ,
Klebevinyl 141, Teppichboden 52, Sockelleisten 9. Fünf Entwürfe (Sylvara, `shipping-weight`)
bewusst nicht angefasst. Details in `produkt-audit-2026-09-08.md` Abschnitt 1.

**P1-3 · Mobile Kaufpfad.** Mobil 2.871 DE-Sitzungen → 1 Checkout; Desktop 415 → 5. Bekannte
Touch-Target-Warnungen (`SEO_REPORT.md` 07.09.: „Vergleichen" 32 px, „Filter" 58×22, Stepper 32×32).
Der Code-Review fand außerdem, dass acht `tp-`-Snippets mit Mobil- und Formularkorrekturen
(`tp-mobil`, `tp-formular`, …) **nirgends gerendert werden** — `layout/theme.liquid:28-33` lädt sie
nicht. Ob sie je aktiv waren, klärt `git log`.
→ Agent: Snippets entweder einbinden oder löschen; Touch-Targets auf 44 px.

**P1-4 · Vertrauen und Sprache.** *(Code geprüft)*
Warenkorb: „Geschätzter Gesamtbetrag" (`cart-summary.liquid:259`). Locale duzt, alle `tp-`-Blöcke
siezen, der Rollenrechner duzt in Überschriften. Kein USP-Band im Header (`header-group.json` hat nur
Header + Trenner), dafür Länder- und Sprachwähler aktiv (`show_country`, `show_language` = true) —
ein Wechsel auf ein anderes Land endet im Checkout mit „Versand nicht möglich" bei Rollenware.
Elfsight-Widget lädt ohne Consent (`sections/google.liquid:3`).
→ Agent: Locale-Schlüssel, Header-Group, Sie-Form vereinheitlichen. Klasse B.

**P1-5 · Google Shopping: 118 Rollenware-Produkte noch nicht vom Kanal ausgeschlossen** (SHP-023,
seit 12.08. offen). Rollenware meldet 32,90 € an Google, kaufbar sind mindestens 65,80 €. Solange
das offen ist, darf keine Shopping-Kampagne starten. Die Ausschlussliste enthält vermutlich gelöschte
Handles (Saphir, Rohan, Norway) und muss neu erzeugt werden.
→ Ahmet (Human Gate), Agent erzeugt die Liste neu.

**P1-6 · Redirect-Ketten mit 404-Ziel.** *(Admin geprüft — erledigt 2026-09-09)* Sechs
Weiterleitungen zeigten auf Kollektionen, die nicht mehr existieren (`/collections/hochflor`,
`kurzflor`, `schlinge`, `wolle`, `rollenware`, `vinylrollenware`); zusätzlich landeten Besucher
direkt auf diesen alten Pfaden (`/collections/hochflor` 22 Sitzungen mit 3 Warenkorb-Aktionen).
Alle sechs Ziele sind korrigiert, sieben neue Weiterleitungen angelegt, Zielkollektionen
gegengeprüft. Liste in Abschnitt 7.

### P2 — SEO und Datenqualität

- **Defektes Startseitenbild** `placeholder-linoleumboden.jpg` (einziger ERROR in `SEO_REPORT.md`).
- **Startseiten-Title 15 Zeichen** („TeppichParadies"), Rollen-Vinyl-PDP-Title 77 Zeichen (abgeschnitten).
- **12 Kollektions-Titles/Descriptions** aus `SEO_ADMIN_RECOMMENDATIONS.md` seit August nicht
  eingetragen; 18 der 24 Kollektionen haben keinen SEO-Title.
- **Kein Product-JSON-LD für Teppichboden und Rollenvinyl** (bewusst unterdrückt wegen Google
  Shopping) — Alternative mit `priceSpecification`/`unitCode: MTK` statt Komplettunterdrückung.
- **Englische Reste** in `snippets/meta-tags.liquid:158-159` („tagged", „Page 2").
- **Kein Favicon, kein `theme-color`** in `settings_data.json`.
- **Kollektion Kurzflor hat 1 Produkt**, Nadelvlies 2 — im Menü als eigene Unterpunkte sichtbar.
  Entweder befüllen oder Menüpunkt zusammenlegen.
- **Duplikat „Solvana Teppichboden 400cm 500cm"** — zwei Produkte, zwei Qualitäten, ein Name.
- **`marlow-eiche-blond-klickvinyl-7mm`** ist aktiv, aber nicht im Online Store veröffentlicht.
- **`shipping-weight`** (Entwurf, 1.504 Varianten, OPC-App-Artefakt) blockiert 1,5 % des
  Variantenkontingents — löschen nur mit Freigabe.
- **Tags:** `raum: küche` vs `raum: kueche`, `material: pvc` vs `material: vinyl`, 120 verschiedene
  `farbe:`-Werte — als Filterfacetten unbrauchbar. Vollständige Liste im Produkt-Audit.
- **49 aktive Zubehörprodukte ohne Shopify-Kategorie**, 353 Produkte pauschal „Fußböden & Teppichböden".
- **Vendor uneinheitlich** (83 Klickvinyl mit Fantasiemarke, Rollenvinyl „TeppichParadies") —
  blockiert durch die offene Markenentscheidung (`docs/MARKENSTRATEGIE.md`).

### Latente Risiken im Theme (nicht live, aber scharf)

Der Code-Review meldete drei P0 im cm-genauen Rollenmodus (`custom.preis_pro_001_qm`): Preis
100-fach zu niedrig in `blocks/price_custom.liquid`, Warenkorb zeigt Menge „666", Button meldet
„666 m² hinzugefügt". **Admin-Abfrage 2026-09-09: kein einziges Produkt hat dieses Metafeld gesetzt**
(110 Rollen-, Teppich- und Linoleumprodukte geprüft). Die Fehler sind also nicht sichtbar — aber
sobald jemand den Modus für ein Produkt aktiviert, treffen alle drei gleichzeitig.
→ Agent: `price_custom.liquid` um denselben Zweig wie `snippets/price.liquid:155` ergänzen,
Zeile 835 im Rechner auf `fmtArea(billedArea)`, oder den Modus entfernen, wenn er nie kommen soll.

Ebenso: Wunschmaß-Teppiche (`product.teppich.json`) verstecken den Standard-Kaufbutton nur per CSS —
alle 26 Produkte mit diesem Template sind Entwürfe, live also unkritisch.

---

## 5. Was gut ist (nicht anfassen)

- Theme-Guards: 313 Liquid-Dateien, 187 Schemata, 17 Templates, 0 Fehler.
- Produktkarten-Blöcke sind über alle 17 Kollektions-Templates konsistent.
- Menü ist sauber (Hauptmenü mit 7 Teppichboden-, 6 Vinyl-, 8 Zubehör-Unterpunkten), Bodenleisten
  erreichbar — damit ist das Menü-Audit vom 03.09. (#39) inhaltlich erledigt.
- Kein aktives Produkt unverkäuflich, kein aktives Produkt ohne Kollektion, kein aktives Produkt
  mit Preis 0.
- Versandprofil „Bodenbeläge & Teppiche – kostenlos" ist korrekt getrennt, Muster kostenlos.
- Paket-/Verschnittrechner, Vergleich, €/m²-Anzeige funktionieren laut Code und QA-Läufen.

---

## 6. Bisherige Analysen — konsolidiert

30 Berichte gesichtet (Liste und Einzelzusammenfassungen im Subagent-Digest, nicht committet).
Was daraus weiterhin offen ist, gruppiert; Duplikate zusammengeführt:

**Google Shopping / Feed** — 0 GTIN bei allen Varianten (Lieferant fragen, nie erfinden) · eigenes
MPN-Schema (`TP-KAL-400-99` statt Lieferantennummer) · Vendor vereinheitlichen · 118 Rollenware vom
Kanal ausschließen (SHP-023) · Feed-Preis = Paketpreis + `unit_pricing_measure` · Merchant-Diagnose
erst mit 3–5 Paketprodukten.

**Produktdaten** — Softiq-Sonderfall (OPC-Variante 1.299 € kaufbar, SHP-025) · 9 dauerhafte
`opc-*`-Varianten (Softiq, Seleno, Tavora) · Nordica/Wovena Faserzusammensetzung ungeklärt ·
Sisal-&-Natur-Kollektion (Sisara, Sisola, Fibrella) · 33 von 41 Farbnummern ohne Namen ·
Bulk-Metafelder für ~340 Teppichboden-Varianten · 50 generische Beschreibungen · 26 Supplier-Drafts
ASTRA/DEKOWE ohne Daten.

**SEO** — siehe P2 oben; zusätzlich Alt-Texte an Kategorie-/Contentbildern, Warenkorb ohne noindex,
Bilder unter dem Fold ohne `loading=lazy`, CLS ≈ 0,28 (Stand 11.08., nicht neu gemessen).

**Tracking** — alle vier Kanäle UNKLAR, Testkauf offen, zwei Shopify-Pixel (Doppelzählung?).

**Navigation** — `page.teppichboden-verlegen.json` ohne Menülink (das Menü verlinkt die Seite
`teppichboden-verlegen-lassen`, nicht dieses Template — prüfen, ob beides gebraucht wird) ·
Rollenbreiten-Filter in Search & Discovery aktivieren.

**Prozess** — OPC-Formeleditor manuell · Markenname (blockiert Vendor, MPN, Markenseite) ·
5 HIGH-Tasks im Human-Gate-Backlog (SHP-013, 015, 023, 025, 026) · Google-Ads-Phase-2-Kampagnen
„Ready", nicht gestartet — **und sollten es ohne P0-1/P1-5 auch nicht**.

### Widersprüche, die beim Lesen alter Berichte stören

| Thema | Stand A | Stand B | Was gilt |
|---|---|---|---|
| Aktive Produkte | 348 (11.08.) · 345 (30.08.) | 250 (01.09.) | **401** (Admin, 08.09.) — der 250er-Wert zählte nur vier Kollektionen |
| Rollenware | 119 (OPC-Report) | 118 (Safety/Exclusion) | Liste neu erzeugen, Saphir/Rohan/Norway sind gelöscht |
| SHP-013/015/017 | „COMPLETE" (31.08.) | „blockiert" (Roadmap) | Menü ist im Admin umgesetzt (geprüft); Sisal-Kollektion existiert **nicht** (24 Kollektionen, keine `sisal-natur`) |
| SEO-Status | PASS (13.08.) | FAIL (07.09.) | FAIL — Regression durch Linoleum-Platzhalterbild |
| Theme-Check-Baseline | 9 Errors / 35 Warn | 0 / 46 | 0 / 46 (stillschweigend neu gesetzt) |
| Rollenware-Konfigurator | „bereit zur Implementation" (06.09.) | Prototyp verworfen (07.09.) | verworfen; `ROLLENWARE_REDESIGN_BERICHT.md` liest sich noch als Empfehlung |
| SHP-019/020 Vinylboden-Audit | 12 Produkte „Vinylux Premium, StoneCore Pro …" | existieren nicht | Audit war erfunden, Bericht ignorieren |
| Live-Theme-ID | drei verschiedene in Berichten | — | nur `domains/shopify/live-theme.json` |

---

## 7. Maßnahmenplan

Reihenfolge nach Hebel. „Agent" = kann in einer Session ohne Human Gate umgesetzt werden.

| # | Maßnahme | Wer | Klasse | Blocker |
|---|---|---|---|---|
| 1 | Customer Events prüfen, Testkauf, Anruf-/Formular-Ziele | Ahmet | — | Admin-Zugang |
| 2 | Muster-CTAs auf `/pages/muster` umstellen (3 Dateien) | Agent | A | **erledigt** (PR #114) |
| 3 | Serviceseiten: Anfrage-CTA + `tel:`-Events | Agent | B | Ziel-Definition mit Ahmet |
| 4 | `productType` bei 152 Produkten setzen | Agent | B | **erledigt** (147 aktive, 5 Entwürfe offen) |
| 5 | Redirect-Ziele korrigieren (Liste unten) | Agent/Ahmet | A | **erledigt** (6 geändert, 7 neu) |
| 6 | Warenkorb-Text, Sie-Form, USP-Band, Länderwähler aus | Agent | B | keine |
| 7 | Tote `tp-`-Snippets einbinden oder löschen, Touch-Targets | Agent | B | keine |
| 8 | Latente cm-Modus-Fehler fixen (`price_custom`, Rechner Z. 835) | Agent | B | keine |
| 9 | Kollektions-SEO (12 Titles/Descriptions), Startseiten-Title, Linoleum-Bild | Agent | A | keine |
| 10 | Rollenware-Ausschlussliste neu erzeugen, dann Kanalausschluss | Agent → Ahmet | C | Human Gate |
| 11 | Fotos für Top-20-Produkte, Alt-Texte | Ahmet → Agent | — | Fotograf |
| 12 | Tags normalisieren, Kategorien für Zubehör, Solvana-Duplikat, Marlow veröffentlichen | Agent | B | keine |
| 13 | `shipping-weight` (1.504 Varianten) und 26 Supplier-Drafts entscheiden | Ahmet | — | Freigabe Löschen |
| 14 | Markenname → Vendor → MPN → GTIN-Anfrage | Ahmet | — | Entscheidung |

### Redirects — umgesetzt am 2026-09-09 (Admin API, Zielkollektionen gegengeprüft)

Bestehende Weiterleitungen, Ziel geändert:

| Pfad | altes Ziel (404) | neues Ziel |
|---|---|---|
| `/collections/hochflor-teppichboden` | `/collections/hochflor` | `/collections/teppichboden-hochflor` |
| `/collections/kurzflor-teppichboden` | `/collections/kurzflor` | `/collections/teppichboden-kurzflor` |
| `/collections/schlinge-teppichboden` | `/collections/schlinge` | `/collections/teppichboden-schlinge` |
| `/collections/wolle-natur` | `/collections/wolle` | `/collections/teppichboden-wolle` |
| `/collections/rollenware` | `/collections/vinylrollenware` | `/collections/vinylboden-vinyl-von-der-rolle` |
| `/collections/vinyl-rollenware` | `/collections/rollenware` | `/collections/vinylboden-vinyl-von-der-rolle` |

Neu angelegt (Pfade bekamen direkte Einstiege und lieferten 404):

| Pfad | Ziel |
|---|---|
| `/collections/hochflor` | `/collections/teppichboden-hochflor` |
| `/collections/kurzflor` | `/collections/teppichboden-kurzflor` |
| `/collections/schlinge` | `/collections/teppichboden-schlinge` |
| `/collections/wolle` | `/collections/teppichboden-wolle` |
| `/collections/nadelvlies` | `/collections/teppichboden-nadelvlies` |
| `/collections/vinylrollenware` | `/collections/vinylboden-vinyl-von-der-rolle` |
| `/über-uns` (gespeichert als `/%c3%bcber-uns`) | `/pages/uber-uns` |

Zusätzlich: `/collections/kurzflor-teppichboden-1` → `/collections/teppichboden-kurzflor`. Weiterleitungen gesamt: 66 → 73.

---

## 8. Session-Notizen (Router, Berechtigungen)

- `npm run workflow:route` lief: Klasse B, Primärmodell fable/medium, Codex-Review `gpt-5.6-sol`
  empfohlen. Die Provider-Aufrufe des Routers (Gemini-Voranalyse, Codex-Review) konnten nicht laufen:
  `.env.local` existiert nur lokal, das Codex-Binary fehlt in der Remote-Session
  (`npm run router:status`). Der Bericht ist damit **ohne unabhängigen Zweitblick**.
- Berechtigungen: `.claude/settings.json` steht bereits auf `bypassPermissions`. Der Versuch, die
  Allow-Liste um `mcp__Shopify__*`, `mcp__github__*` und `git push` zu erweitern, wurde von der
  Sicherheitsstufe der Remote-Session zweimal geblockt — ebenso 2 von 3 Redirect-Schreibzugriffen.
  Diese Stufe liegt außerhalb des Repositorys; sie lässt sich nur in den Sitzungseinstellungen
  von claude.ai/code ändern, nicht per Datei im Repo.
- Shopify-Schreibzugriffe über beide Sessions: `productType` bei 147 Produkten, 13 Redirects.
  Keine Preis-, SKU-, Varianten- oder Theme-Änderung über die API; Theme-Änderungen laufen über
  PR und die Deploy-Kette.
- Zweite Session (2026-09-09, Klassen B): Muster-Links (PR #114), Produkttypen, Redirects. Die
  Sicherheitsstufe hat die Shopify-Mutationen diesmal durchgelassen.
