# Audit-Verifikation Konzept C – 2026-09-11

Grundlage ist das Shop-Audit vom 2026-09-10 (49 Befunde B-01 bis B-49, Bericht unter
`~/teppich-paradies-analyse/shop-audit-konzept-c-2026-09-10/`). Jeder Befund wurde zuerst gegen
Code, Theme-Dateien, Admin-API-Daten und die gerenderte Vorschau geprüft, erst danach geändert.

Gearbeitet wurde ausschließlich im unveröffentlichten Entwurf „Entwurf Startseite Konzept C
2026-09-10“ über `workflow:scratch`. Live-Theme, Produkte, Preise, Seiten, Menüs und Weiterleitungen
sind unverändert. Branch: `fix/audit-konzept-c` (Aufgabe #187).

## Ergebnis in Zahlen

| Status | Anzahl |
|---|---|
| BESTÄTIGT | 23 |
| TEILWEISE BESTÄTIGT | 15 |
| BEREITS BEHOBEN | 4 |
| FALSCHER AUDIT-BEFUND | 1 |
| ABSICHTLICH SO UMGESETZT | 2 |
| WEITERE PRÜFUNG ERFORDERLICH | 4 |
| NICHT REPRODUZIERBAR | 0 |

Stand nach der Freigabe vom 2026-09-11 (Nachmittag): 29 Befunde sind erledigt – im Entwurf oder, wo es
Shopify-Daten betraf, direkt im Shop. 14 bleiben offen (Foto, Lieferantendaten, eigener Sprint, Deploy),
6 brauchen nichts.

## Drei Befunde über das Audit hinaus

1. **Der Entwurfs-Branch lag hinter main.** PR #176, #180, #182, #183 und #185 (17 Theme-Dateien,
   darunter Paketrechner und Kaufbereich) fehlten im Entwurf. main ist gemergt (`8295660`). Ohne das
   hätte ein Live-Gang des Entwurfs diese Fixes zurückgedreht. B-04 (Reihenfolge) und B-42 waren
   dadurch bereits gelöst.
2. **Versandversprechen falsch – live betroffen.** Produktseite und Warenkorb sagen pauschal
   „Versandkostenfrei in Deutschland“. Laut Versandprofilen liegen alle aktiven Produkte im
   allgemeinen Profil: 4,99 € unter 50 € Bestellwert, darüber frei. Das Profil „Bodenbeläge &
   Teppiche – kostenlos“ enthält nur ein einziges Entwurfsprodukt. Beispiel: ein Paket Porto
   Klickvinyl kostet 34,95 € und damit Versand. Im Entwurf korrigiert, live erst mit dem Deploy.
3. **Live zeigt weiterhin die B2B-Seite** auf `/pages/liefer-verlegeservice`, `/pages/unsere-arbeit`,
   `/pages/hochflor-teppichboden` und `/pages/uber-uns` (per curl belegt). Die Template-Suffixe wurden
   am 2026-09-10 storeweit umgestellt, die passenden Templates gibt es nur im Entwurf. Behebt erst der
   Deploy.

## Alle 49 Befunde

| ID | Prio | Status | Beleg | Maßnahme im Entwurf |
|---|---|---|---|---|
| B-01 | P0 | BEREITS BEHOBEN | Suffixe (Admin API) gegen Templates: seit PR #186 abgedeckt; bisherige-arbeiten → 301 auf unsere-arbeit. Firmenkunden und Für Geschäftskunden zeigen gewollt B2B. Über uns rendert neutral, aber mit doppelter H1. | `page.ueber-uns.json` ohne Template-H1. Hilfsseiten siehe Z-06. |
| B-02 | P0 | TEILWEISE | Elfsight erst nach Einwilligung = DSGVO, gewollt. PDP „4.8/5“ war Schema-Default, nie geprüft. Google Maps am 2026-09-11 abgelesen: 4,9 Sterne, 238 Rezensionen. | Hero, Trust-Streifen und PDP zeigen 4,9 · „über 230 Google-Bewertungen“ (Untergrenze, bleibt wahr), Links direkt aufs Google-Profil; Sterne runden wie Google. |
| B-03 | P0 | BESTÄTIGT | Ohne `?produkt=` Fehlermeldung (`init()`). Zusätzlich wirkte `hidden` nicht: leeres Produktkästchen und „Zum Warenkorb“ immer sichtbar. | Leerzustand mit Anleitung und fünf Einstiegen; `[hidden]` greift. Normalfall getestet. |
| B-04 | P0 | BESTÄTIGT | Suffix „fliese“ ohne Template. Falsche Blockreihenfolge nur im Entwurf – main hatte sie mit PR #176 korrigiert. | main gemergt; `product.fliese.json` (Paket-Template). H1 bei 261 statt 1.123 px. |
| B-05 | P0 | BEREITS BEHOBEN | 301 auf /collections/teppichboden besteht. Einstiege fallen ab 2026-08-27 auf 0; das Audit zählte 30 Tage rückwärts. | – |
| B-06 | P1 | BESTÄTIGT | `order:-1` stellte das Bild mobil vor den Text: H1 bei 492 px, Buttons bei 761 px. | Text vor Bild: H1 248 px, Buttons 517–629 px. Kopfbereich unverändert. |
| B-07 | P1 | TEILWEISE | Wiederholung stimmt. Die Zwei-Wege-Section bleibt: Ahmet nennt sie in #167 einen brauchbaren Zwischenschritt, der „so bleiben kann“. Ihr Text behauptete „cm-genau berechnet“ (falsch, siehe B-19) und Versandkosten „im Warenkorb“. | Verlegegebiet-Intro ohne Regel; Zwei-Wege-Text sachlich korrigiert. |
| B-08 | P1 | TEILWEISE | Doppelter Titel auf der Startseite sichtbar (4 von 4 Karten), in Kategorien nicht. Kürzung folgt dokumentierter Regel; Vergleich ist fertiges Feature. | Zoom-Out-Titel außerhalb der Zoom-Ansicht verborgen. Button-Gewicht: Empfehlung. |
| B-09 | P1 | BESTÄTIGT | Karten im Grid auf 341 px gestreckt. | `align-self: start`. Filter-URLs sind Menüdaten und funktionieren – unverändert. |
| B-10 | P1 | TEILWEISE | Überlappung stimmt. „Dekore = Produkte“ falsch: bei Vinyl ist jedes Produkt ein Dekor. | Untertitel „Klick-, Klebe- und Rollenvinyl“. |
| B-11 | P1 | BESTÄTIGT | Drei Spalten, zwei Karten auf Formularhöhe gestreckt. | Anrufen/WhatsApp links gestapelt, Formular rechts. |
| B-12 | P1 | WEITERE PRÜFUNG | Stimmt. Durchsucht: alle Shop-Dateien (16 eigene Fotos – Baustellen und Projekte), Dropbox, Google Drive. Kein Laden-, Team- oder Fassadenfoto; Fotos mit erkennbaren Mitarbeitern bräuchten deren Einwilligung. | Bild bleibt. Fachhandel-Section nennt Ahmets Fakt aus #167: über 1.000 m² Sonderposten und Lagerware im Laden. Ladenfoto muss aufgenommen werden. |
| B-13 | P1 | TEILWEISE | 452 img, 4.442 DOM-Knoten, ~280 KB je 800-px-Bild stimmen. „Kein WebP“ falsch – Shopify liefert WebP. Farb-Thumbs sind schon auf 6 begrenzt und lazy. | Nicht geändert: eigener Performance-Sprint mit Lighthouse auf Live. |
| B-14 | P1 | BESTÄTIGT | 8 Seiten ohne Meta-Description (Admin API); Maler-Seite ohne H1; Start-Title kommt aus dem Theme-Fallback. | H1 und Title im Entwurf. Meta-Descriptions am 2026-09-11 im Shop gesetzt und live im `<head>` geprüft (Texte im Anhang). |
| B-15 | P1 | TEILWEISE | `telephone` = `shop.phone` = Mobilnummer; kein BreadcrumbList. Rating/sameAs ohne belegte Daten. Rollenware-Offers bewusst unterdrückt (im Audit selbst „Behalten“). | Festnetz per Theme-Setting; BreadcrumbList auf Produktseiten. |
| B-16 | P1 | BESTÄTIGT | Linke Kanten 124 / 40 / 195 px. | Produktlisten und Zwei-Wege auf 124 px. Zentrierung des Verlegegebiets bewusst belassen. |
| B-17 | P1 | BESTÄTIGT | „Wähle deine Farbe“, Suchtexte, Warenkorb-Title „Dein Warenkorb“ (Shopify-Standard). | Sie-Form an allen drei Stellen. |
| B-18 | P1 | TEILWEISE | Die Annahme „Bodenbeläge versandkostenfrei“ ist falsch (siehe oben, Punkt 2). Uneinheitliche Formulierungen stimmen. | Top-Leiste, PDP, Warenkorb, Versandseite einheitlich: „Versandkostenfrei in Deutschland ab 50 €“. |
| B-19 | P1 | BESTÄTIGT | `preis_pro_001_qm` fehlt (Zafira, Selene). Umstellen heißt: Variantenpreis pro 0,01 m², Menge in 0,01-m²-Einheiten. Warenkorb, Checkout, Bestellung und Rechnung zeigten dann z. B. 1.332 × 0,39 €, Shop-App und Kasse den Preis 0,39 €. | Bewusst nicht ausgeführt – das ändert die Verkaufseinheit, nicht nur Daten. Die Aufrundung bleibt offen ausgewiesen. |
| B-20 | P2 | BESTÄTIGT | Zwei Leerzustände, der zweite in der 250-px-Filterspalte. | Volle Breite, ohne Wiederholung. |
| B-21 | P2 | BESTÄTIGT | Produktliste „all“ zeigt die neuesten Aluprofile. | Teppichboden. |
| B-22 | P2 | WEITERE PRÜFUNG | Herkunft der Raumbilder nicht belegbar, keine Ersatzfotos. Pfeil über dem Nachbarbild ist Mobile-Peek (fertiges Feature). | Keine Änderung. |
| B-23 | P2 | TEILWEISE | WhatsApp-Icon von upload.wikimedia.org. Layout ist Gestaltungsfrage. | Icon inline. |
| B-24 | P2 | TEILWEISE | Empfehlungen aus „all“; Versandhinweis siehe B-18. | Empfehlungen Bodenleisten; Hinweis mit 50-€-Schwelle. |
| B-25 | P2 | BESTÄTIGT | Menge im Warenkorb ändert m², die Längen-Eigenschaft bleibt. | Nicht geändert: Warenkorb-Logik braucht eigenes Konzept und Checkout-Test. |
| B-26 | P2 | TEILWEISE | Gold 2,77:1 stimmt. Grau `#7a726a` hat 4,73:1 und besteht AA. | `#8c6d43` (4,79:1). |
| B-27 | P2 | BESTÄTIGT | Filter aus Search & Discovery; Preis = Paketpreis. | Admin/Datenmodell: Empfehlung. |
| B-28 | P2 | BESTÄTIGT | Vergleichsleiste über Formularen und Drawer. | Ausgeblendet bei offenem Drawer und aktivem Eingabefeld. |
| B-29 | P2 | BESTÄTIGT | Versandseite ohne Zahlen. | 4,99 € · ab 50 € frei · EU 13,99 € · weitere Länder 19,99 € · Muster frei. |
| B-30 | P2 | TEILWEISE | Leere Galerie stimmt (`constrain_to_viewport`). „Nicht sticky“ falsch: `sticky_details_desktop` ist an, die Spalte ist länger als der Bildschirm. | Rollenware-Galerie füllt 883 × 883 px. |
| B-31 | P2 | WEITERE PRÜFUNG | Das Produktbild selbst ist beschnitten. | Produktdaten. |
| B-32 | P2 | TEILWEISE | H1 bei 550 px stimmt. Preisspannen bräuchten belegte Preise. | Hero-Bild 4:3, H1 bei 325 px. |
| B-33 | P2 | BESTÄTIGT | Service-Hauptlink auf boden-malerarbeiten. | Menüdaten; Umstellung erst nach dem Deploy. |
| B-34 | P2 | ABSICHTLICH | Das Suchfeld scrollt weg, die Lupe bleibt im Sticky-Header. | – |
| B-35 | P2 | FALSCHER BEFUND | 24 Produkte pro Seite mit Infinite Scroll. | – |
| B-36 | P2 | WEITERE PRÜFUNG | Metafelder Nutzschicht und Fußbodenheizung leer. | Lieferantendaten nötig, nicht erfinden. |
| B-37 | P2 | ABSICHTLICH | Section-Kommentar: kein FAQ-Schema auf der Startseite. | – |
| B-38 | P2 | BESTÄTIGT | Sechs Formulierungen für dieselbe Handlung. | Textentscheidung: Empfehlung. |
| B-39 | P2 | TEILWEISE | „Angebot anfragen“ ohne Link. | Link auf /pages/kontakt. |
| B-40 | P2 | TEILWEISE | Objektware zuerst (Kollektionssortierung). Anker auf die Kategorien ist gewollt. | Sortierung ist Admin: Empfehlung. |
| B-41 | P2 | BEREITS BEHOBEN | main `80bc38b`. | Mit dem Merge im Branch. |
| B-42 | P3 | BEREITS BEHOBEN | main PR #176/#180; geleertes Feld bleibt leer. | – |
| B-43 | P3 | BESTÄTIGT | Tote Sections, Blöcke, Assets. | Bewusst verschoben (eigener Sprint nach Live). |
| B-44 | P3 | BESTÄTIGT | ai_gen-Blocknamen. | Verschoben wie B-43. |
| B-45 | P3 | BESTÄTIGT | Drei Schreibweisen der Festnetznummer. | Anzeige einheitlich „03301 573 37 20“ (7 Stellen), `tel:` unverändert. |
| B-46 | P3 | BESTÄTIGT | Umfangreicher als gemeldet: Fiora (4 Bilder) und Elastium (21 Bilder) trugen die Produktlinie des Lieferanten im Alt-Text. | Am 2026-09-11 im Shop geändert, z. B. „Elastium Linoleumboden Farbe 4289“; live ohne Lieferantenlinie geprüft. |
| B-47 | P3 | TEILWEISE | Tabs ohne Pfeiltasten stimmt; Karussell-Kopien sind Horizon-Kern. | Pfeiltasten, Pos1/Ende, roving tabindex. |
| B-48 | P3 | BESTÄTIGT | Badge „Sale“. | „Angebot“. |
| B-49 | P3 | BESTÄTIGT | Kollektionsbeschreibungen leer. | Admin-Texte: Empfehlung. |

## Zusatzbefunde

- **Z-01** Entwurfs-Branch hinter main – behoben (Merge).
- **Z-02** Pauschales Versandversprechen auf PDP und im Warenkorb, live betroffen – im Entwurf behoben.
- **Z-03** Vier Service-Seiten zeigen live die B2B-Seite – behebt der Deploy.
- **Z-04** Musterseite: `hidden` wirkungslos – behoben.
- **Z-05** Horizon-Demoseite `/pages/materials-and-care` war veröffentlicht und in der Sitemap – am 2026-09-11 ausgeblendet (0 Einstiege in 90 Tagen, kein Menülink; liefert 404).
- **Z-06** Hilfsseiten `qualitatssiegel`, `beschreibung-v-2`, `erklarung-auswahl-der-rollenbreite` standen in der Sitemap – am 2026-09-11 auf noindex gesetzt (`seo.hidden`), erreichbar bleiben sie.
- **Z-07** Verwaiste Templates `page.fimenkunden.json`, `page.geschaeftskunden.json` – mit B-43 aufräumen.
- **Z-08** Zubehör-Titel tragen die Namen der Hersteller. Entscheidung: bleiben. Punkt 6 des Auftrags verbietet, Lieferantenangaben neu oder unnötig auszugeben; die Herstellernamen im Zubehör hat Ahmet am 2026-09-08 ausdrücklich so gewollt. Bodenbeläge sind nach der Alt-Text-Korrektur frei von Lieferantenangaben (öffentliche Daten aller 401 Produkte geprüft).
- **Z-09** `qa/run-sales-readiness.mjs`: unbehandelte Promise bricht nach dem mobilen Paketlauf ab. Im Vorschaumodus fangen zusätzlich Cookie-Banner und Shopify-Vorschauleiste mobile Klicks ab.

## Freigabe vom 2026-09-11: selbst geklärt und umgesetzt

| Punkt | Ergebnis |
|---|---|
| Google-Bewertung (B-02) | Google Maps am 2026-09-11: 4,9 Sterne, 238 Rezensionen (211 × 5, 22 × 4). Im Entwurf 4,9 · „über 230“, Link aufs Profil. |
| Meta-Descriptions (B-14) | 8 Seiten im Shop gesetzt, live im `<head>` geprüft. |
| Alt-Texte (B-46) | 25 Bilder ohne Lieferantenlinie, live geprüft. |
| Demoseite, Hilfsseiten (Z-05, Z-06) | materials-and-care ausgeblendet (404); drei Hilfsseiten noindex, nicht mehr in der Sitemap. |
| Preis-Datenlauf (B-19) | Geprüft, bewusst nicht ausgeführt: ändert die Verkaufseinheit in Warenkorb, Checkout und Bestellung. |
| Zwei-Wege-Section (B-07) | Bleibt – laut #167 „brauchbarer Zwischenschritt, kann so bleiben“. |
| Laden- oder Teamfoto (B-12) | Nirgends vorhanden (Shop-Dateien, Dropbox, Drive). Fakt aus #167 ergänzt. |
| Zubehör-Herstellernamen (Z-08) | Bleiben, siehe Z-08. |

Damit sind diese Shopify-Daten live geändert (nicht das Theme): 8 Seiten-Metafelder
`global.description_tag`, 3 × `seo.hidden`, 25 Bild-Alt-Texte, eine Seite unveröffentlicht. Alles umkehrbar.

## Weiterhin offen

1. Ein echtes Laden- oder Teamfoto aufnehmen (B-12).
2. Menülink „Service & Verlegung“ auf `/pages/liefer-verlegeservice` – erst nach dem Deploy (B-33).
3. Deploy: dieser Branch baut auf #186 und #174 auf; alle drei nach main, dann `workflow:preview` und
   `workflow:live`. Nicht ausgeführt – der Auftrag schließt Veröffentlichung aus.
4. Eigene Sprints: Performance (B-13), Warenkorb-Menge bei Rollenware (B-25), Aufräumen (B-43, B-44).
5. Daten: Vinyl-Metafelder (B-36), Zubehörbild (B-31), Kollektionsbeschreibungen (B-49),
   Kollektionssortierung (B-40), Filter (B-27).

## Bewusst nicht verändert

Rollenware-, Paket- und Leistenrechner, Warenkorb-Logik und -Eigenschaften, Vergleich,
Musterkonfigurator (außer Leerzustand), Menüdaten, Kollektionssortierung, Filter, Produktdaten,
Preise, Versandprofile, Rollenware-Schema-Unterdrückung, Horizon-Kern.

## Tests

- Guards `liquid`, `schema`, `template`, `theme`, `essential` vor jedem Commit: PASS.
- `npm test` 37/37, `node workflow/cli.mjs validate --static`: PASS.
- Regression im Entwurf: 31 Seitentypen × Desktop und Mobil = 62 Aufrufe, 0 Auffälligkeiten
  (richtiges Theme, genau eine H1, B2B nur auf Firmenkunden, JSON-LD gültig, kein Querscrollen,
  keine neuen Konsolenfehler, kein pauschales Versandversprechen).
- Verkaufstest `qa/run-sales-readiness.mjs` gegen den Entwurf: Desktop Paket, Rolle, Muster PASS;
  Mobil Paket PASS. Mobil Rolle und Muster blockiert das Skript im Vorschaumodus (Vorschauleiste fängt
  den Klick ab); live bestehen beide. Dieselben Abläufe per DOM auf dem Entwurf: Rolle 250 × 400 cm =
  10 m², 259,00 €, alle Eigenschaften im Warenkorb; Muster 14 Farben, Musterartikel 0 € mit Quellprodukt.
- Warenkorb-Hinweis: ein Paket (34,95 €) → „ab 50 € Bestellwert“, zwei Pakete (69,90 €) →
  „Versandkostenfrei in Deutschland“.
- Prüfsummen der gepushten Dateien im Entwurf identisch mit dem Repository.

## Commits

| Commit | Inhalt |
|---|---|
| `8295660` | main in den Entwurfs-Branch gemergt |
| `6d1bd9d` | P0: B-01 bis B-04 |
| `e38f671` | P1 |
| `a5540ad` | P2 |
| `040f9e8` | P3 und Galerie |
| `93bfde7` | Versandversprechen an die Versandprofile gebunden |
| `300a0bc` | Belegte Google-Bewertung, Ladenfakt |

## Anhang: Meta-Descriptions (B-14), am 2026-09-11 eingetragen

Nur Fakten, die bereits im Shop stehen.

| Seite | Text |
|---|---|
| kontakt | Teppich Paradies, Saarlandstraße 73–81, 16515 Oranienburg: Telefon 03301 573 37 20 oder WhatsApp. Geöffnet Mo–Fr 8:30–18 Uhr, Sa 8:30–14:30 Uhr. |
| liefer-verlegeservice | Liefer- und Verlegeservice rund um Oranienburg: bis 15 km Lieferung und lose Verlegung inklusive, ab 649 € Warenwert alles inklusive, regulär bis 50 km. |
| teppichboden-verlegen-lassen | Teppichboden verlegen lassen in Oranienburg: Aufmaß, Lieferung und Verlegung vom Fachgeschäft. Im Umkreis von 15 km sind Lieferung und lose Verlegung inklusive. |
| vinylboden-verlegen | Vinylboden verlegen lassen in Oranienburg: Klick- und Klebevinyl vom Fachhandel – Aufmaß, Untergrund und Verlegung aus einer Hand, bis 50 km Umkreis. |
| treppenverlegung | Treppe mit Teppich belegen lassen: Aufmaß, Zuschnitt und Verlegung vom Teppich Paradies in Oranienburg. Beratung im Fachgeschäft oder bei Ihnen vor Ort. |
| firmenkunden | Bodenbeläge und Innenausbau für Praxen, Büros und Gewerbe: Beratung, Aufmaß und Verlegung vom Fachhandel in Oranienburg. |
| boden-malerarbeiten | Boden- und Malerarbeiten für Praxen, Büros und Gewerbe in Oranienburg und Umgebung – Boden und Wand aus einer Hand. |
| muster | Bis zu drei Muster kostenlos: Farben von Teppichboden, Vinyl und Linoleum zu Hause vergleichen. Muster direkt auf der Produktseite anfragen. |
