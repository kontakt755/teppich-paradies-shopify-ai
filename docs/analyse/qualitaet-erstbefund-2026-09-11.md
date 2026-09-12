# Qualitätsprogramm „99+“ – Erstbefund und Baseline (2026-09-11)

Grundlage: Auftrag „Von 64/100 auf ein echtes 99+-Niveau“. Dieses Dokument ist der geforderte
erste Output (A–O) **vor** größeren Umbauten. Alle Zahlen sind am 2026-09-11 zwischen 12:55 und
14:30 Uhr selbst gemessen; wo ein Befund aus dem Audit vom 2026-09-10 oder der Verifikation vom
Vormittag übernommen und nicht erneut gemessen wurde, steht das dabei.

## Ausgangslage (dokumentiert vor dem ersten Code-Change)

| | |
|---|---|
| Live-Theme | laut `domains/shopify/live-theme.json` und Admin API (role MAIN), Stand 2026-09-11 12:55 – **unverändert, wird nicht angefasst** |
| Neuester Entwurf | unveröffentlichtes Theme „Entwurf Startseite Konzept C 2026-09-10“, Branch `fix/audit-konzept-c` @ `98e571d` (Draft-PR #190 auf #186 auf `feature/startseite-konzept-c` auf #174) |
| Arbeits-Theme dieses Programms | „Qualitaet Arbeitskopie 2026-09-11“ (unveröffentlichte Kopie des Entwurfs, per `workflow:scratch` exakt auf den Branch gebracht). Grund: Zwei parallel laufende Sitzungen pushen in das Entwurfs-Theme; ein gemeinsames Theme hätte gegenseitiges Überschreiben bedeutet. |
| Branch | `feature/shop-qualitaet` = `fix/audit-konzept-c` + aktueller `main` (Merge ohne Konflikt, Commit `9027679`) |
| Offene fremde Änderungen | im Hauptcheckout (`domains/lieferanten/README.md`, andere Sitzung) – nicht angefasst |
| Rollback | jeder Schritt ein eigener Commit; Arbeits-Theme ist Wegwerfkopie; Live-Theme und Entwurf bleiben unberührt |

## Baseline-Messwerte

Lighthouse 13.4.1, simuliertes Mobilgerät bzw. Desktop-Preset, je ein Lauf.

> **Die Live-Spalte ist seit dem 2026-09-12, 07:31:40Z überholt.** Sie wurde am 11. September gegen das damalige Live-Theme *preview-main-2026-09-04* gemessen. Seitdem hat die Verlegeservice-Sitzung *Preview Gallery V3* (203558781262) live gestellt — mit Verlegeservice-Seite, Ortsprüfung, Produkthinweis und der fehlenden Menü-Bildkachel. Die Live-Werte unten beschreiben also korrekt den Stand vor diesem Wechsel, nicht den heutigen Shop. Die Spalte „Arbeits-Theme" ist davon unberührt. Vor einem Vorher/Nachher-Vergleich nach dem Livegang muss die Live-Seite neu gemessen werden.

| Seite | Live P/A/BP/SEO | Live LCP | Arbeits-Theme P/A/BP/SEO | Arbeits-Theme LCP | Gewicht (Arbeits-Theme) |
|---|---|---|---|---|---|
| Startseite mobil | 63/93/73/100 | 11,2 s | 69/91/73/100 | 7,6 s | 3.890 KB, 266 Requests, DOM 2.124 |
| Startseite Desktop | 89/90/73/100 | 2,1 s | 87/89/73/100 | 1,3 s, **CLS 0,174** | 4.788 KB |
| Kategorie Teppichboden mobil | 63/88/73/92 | 14,3 s | 69/86/73/92 | 6,9 s | 4.749 KB, 286 Req., DOM 4.224 |
| Kategorie Klickvinyl mobil | 66/88/73/100 | 10,2 s | 76/86/73/100 | 5,1 s | 3.697 KB |
| Produkt Rollenware mobil | – | – | 73/82/73/100 | 6,1 s | 3.019 KB, DOM 1.478 |
| Produkt Sockelleiste mobil | – | – | 69/81/73/100 | 6,0 s | 3.228 KB |
| Verlegeservice mobil | – | – | 77/90/73/100 | 5,1 s | 2.639 KB |

HTML-Rohgewicht (Arbeits-Theme): Startseite 646 KB, Kategorie Teppichboden 1.534 KB, einfache Inhaltsseite
337 KB. Davon Kopfbereich (Mega-Menü) 144 KB auf **jeder** Seite.

Puppeteer-Messreihe, 20 Seitentypen × 8 Viewports (320, 375, 390, 430, 768, 1280, 1440, 1920):

| Messung | Live | Arbeits-Theme |
|---|---|---|
| Kopfbereich bis Inhalt, mobil 390 px | 141 px | **219 px** |
| Kopfbereich Desktop 1440 px | 117 px | 159 px |
| Startseite Länge mobil 390 px | 10.366 px | 11.077 px |
| Kategorie Teppichboden: H1 mobil bei | 638 px | 722 px |
| Kategorie Teppichboden Länge mobil | 16.462 px | 16.617 px |
| Querscrollen (alle 160 Aufrufe) | 0 | 0 |
| Konsolenfehler je Seite | favicon 404 | favicon 404 (+ 401 `sf_private_access_tokens`, Plattform) |

Shop-Daten (Admin API): 401 aktive Produkte (226 Planken/Paket, 122 Rollenware, 43 Zubehör,
9 Sockelleisten, 1 Fliese), 24 Kollektionen (alle „Bestseller“-Sortierung, 12 ohne Beschreibung),
22 Seiten. 30 Tage: 2.621 Sitzungen, 29 mit Warenkorb, 6 im Checkout, 0 Bestellungen
(Tracking erfasst Warenkorb- und Checkout-Schritte – die Null ist echt, kein Messfehler).

Statische Prüfung: Guards `liquid`, `schema`, `template`, `theme`, `essential` grün; `validate --static`
ohne P0/P1; Theme Check 41 Warnungen, 0 Fehler.

## A – Realer Gesamtscore heute

**Arbeits-Theme (Entwurf): 67 / 100. Live-Shop: etwa 60 / 100** (Live nicht voll neu auditiert).

Der Entwurf liegt über den 64 vom 2026-09-10, weil die Verifikation am Vormittag 29 von 49 Befunden
geschlossen hat. Er ist aber noch kein „sehr guter professioneller Shop“ (71–80): Performance mobil,
Kopfbereich mobil, Kategorieseiten mobil und Barrierefreiheit halten ihn unten.

| Kategorie | Audit 09-10 | Heute Entwurf | Wichtigster Grund |
|---|---|---|---|
| Gesamteindruck | 66 | 69 | Hero stark; Kategorie mobil beginnt mit KI-Raumbildern statt Produkten |
| Professionalität | 62 | 67 | Fallback-Seiten im Entwurf behoben; Favicon fehlt, Rechtstexte ohne H1, Titel mit doppelter Marke |
| Vertrauen | 55 | 64 | Bewertung 4,9 · „über 230“ sichtbar und verlinkt; kein Laden-/Teamfoto |
| Startseite | 68 | 70 | Mobil 11.077 px; CLS 0,17 Desktop |
| Navigation | 74 | 73 | Kopf mobil 219 px; „Service & Verlegung“ zeigt auf Maler-Seite |
| Desktop UX | 66 | 70 | Container vereinheitlicht; Such-Icon neben Suchfeld doppelt |
| Mobile UX | 60 | 62 | Kopfbereich, Kategorie-Einstieg, 15-px-Eingaben im Kontaktformular |
| Produktkarten | 60 | 63 | Doppeltitel weg; CSS je Karte, 13 Bilder je Karte im DOM |
| Kategorieseiten | 63 | 62 | Karussell mit H2 vor der H1, Produkte mobil erst ab ~840 px |
| Produktseiten | 70 | 72 | Fliese-Template da; Titel mit Rollenbreiten, Galerie mit Leerraum |
| Rechner | 78 | 79 | stark; Aufrundung auf volle m² bleibt Geschäftsentscheidung |
| Kaufprozess | 72 | 74 | Versandregel im Entwurf korrekt; Mengenänderung Rollenware im Warenkorb offen |
| Conversion | 58 | 60 | 1,1 % Warenkorb-Rate, 0 Käufe |
| Verlegeservice | 66 | 70 | Seite, Karte, PLZ im Entwurf; Produkthinweis liegt in PR #191, nicht hier |
| Kontakt | 78 | 78 | unverändert gut |
| Design-Konsistenz | 54 | 58 | ~25 verstreute Hex-Farben, 49 `!important` |
| SEO | 63 | 68 | Descriptions gesetzt; Rechtstexte ohne H1, doppelte Marke im Title |
| Local SEO | 58 | 62 | Festnetz im Schema; keine Ortsseiten (bewusst), kein Ladenfoto |
| Performance | 52 | 58 | Mobil 69–77, LCP 5–7,6 s |
| Accessibility | 66 | 70 | Lighthouse 81–91; Kontrast, unbenannte Links/Buttons |
| Technische Qualität | 58 | 60 | 25 tote Sections (10.039 Zeilen), 27 nie platzierte Blöcke |
| Wettbewerbsfähigkeit | 60 | 63 | Verlegeservice als Alleinstellung real, Ladezeit und Mobil hinten |

## B/C – Die größten Probleme mit Priorität

**P0 – nur live, Behebung = Deploy-Kette (braucht ausdrückliches „deploy“ vom Inhaber)**

1. Live rendern `liefer-verlegeservice`, `unsere-arbeit` (auch über `bisherige-arbeiten`), `uber-uns` und
   `hochflor-teppichboden` die B2B-Seite „Innenausbau für Praxen & Gewerbe“ (heute per Abruf belegt).
2. Live versprechen Produktseite und Warenkorb „Bodenbeläge versandkostenfrei innerhalb Deutschlands“.
   Unter 50 € kostet der Versand 4,99 € (heute per Abruf belegt). Im Entwurf korrigiert.

**P1 – im Entwurf**

3. Kopfbereich mobil 219 px (live 141 px): Top-Leiste, Kopfzeile, Suchfeld und Kategorie-Chips; das Such-Icon
   steht zusätzlich neben dem Suchfeld.
4. Kategorieseiten mobil: Erst ein Karussell mit H2 und KI-Raumbildern, dann die H1, Produkte ab ~840 px,
   eine Spalte, 16.600 px Seitenlänge.
5. Performance mobil: LCP 5,1–7,6 s, Kategorie 4,7 MB / 286 Requests / 452 Bild-Tags / DOM 4.455.
6. Produktkarte: gibt 5,3 KB + 0,7 KB CSS **je Karte** aus (140 KB HTML je Kategorieseite), rendert 13 Slides je
   Karte (versteckte Variantenbilder, obwohl die Karten keine Farbauswahl haben), und die Bildbreiten springen
   von 352 auf 832 px – mobil werden 832-px-Bilder à ~300 KB geladen (Lighthouse: 1,4 MB Einsparung).
7. Barrierefreiheit: Kontrastfehler (WhatsApp-Buttons weiß auf Grün, Eyebrow der Zwei-Wege-Section,
   SEO-Zwischenüberschrift, Tabellenkopf der Produktdaten), Telefonlink ohne Namen (Footer-CTA),
   Sticky-Warenkorb-Button ohne Namen, `aria-hidden` mit fokussierbarem Inhalt in Karussells,
   Überschriften-Reihenfolge (Kartentitel, Produktseite).
8. Kein Favicon (`settings.favicon` leer): kein Tab-Icon, `/favicon.ico` 404 auf jeder Seite, Konsolenfehler.
   Braucht ein quadratisches Markenzeichen – im Shop ist keins hinterlegt.
9. Suche: „Auslegware“ 0 Treffer, „Fußleiste“ 1 statt 9 Sockelleisten. Synonyme fehlen.
10. Menü „Service & Verlegung“ zeigt auf `/pages/boden-malerarbeiten`. Menüdaten sind storeweit – erst nach dem
    Deploy umstellbar, sonst landen Live-Besucher auf der B2B-Seite.

**P2**

11. Startseite Desktop CLS 0,174: Nachladen der Schriftschnitte 500/700 verschiebt die Kategorie-Kacheln.
12. Render-blockierendes CSS: `tp-startseite.css` lädt auf allen Seiten; kompiliertes Theme-CSS 460–610 ms.
13. Impressum, Datenschutz, AGB, Karriere ohne H1; Über uns, Hochflor, Rechtstexte ohne Meta-Description;
    Titles mit doppelter Marke („| Teppich Paradies – TeppichParadies“) und Schreibweise „TeppichParadies“.
14. Startseite mobil 11.077 px, länger als live.
15. Kontaktformular: Eingabefelder 15 px – iOS zoomt beim Antippen.
16. Produkttitel tragen Rollenbreiten („… 400cm 500cm“, „… 200cm“) – Produktdaten, Freigabe nötig.
17. 12 Kollektionen ohne Beschreibung, `/collections/all` ohne Description.
18. Zwei App-Einbettungen aktiv, deren Nutzen im Theme nicht erkennbar ist: ein Optionen-Preisrechner
    (Skript plus ~12 KB Inline-JS auf jeder Seite) und ein Mega-Menü-App-Embed (das Theme hat ein eigenes).
    Deaktivieren nur nach Prüfung und Freigabe.
19. Keine Versandrichtlinie in Shopify (`/policies/shipping-policy` 404) – Rechtstext, nur Inhaber.
20. Keine zentrale Quelle: Telefonnummer in 27 Dateien, Serviceregel (15 km / 649 € / 50 km) in 10, Bewertung in 4.
21. Warenkorb: Mengenänderung bei Rollenware ändert die m², die Längen-Eigenschaft bleibt stehen (HIGH RISK).
22. Preisfilter in Paketpreis statt €/m² (Filterdaten der Such-App).

**P3**

23. Tote Theme-Teile: 25 Sections (10.039 Zeilen), 27 nie platzierte öffentliche Blöcke (6.743 Zeilen),
    5 `ai_gen`-Blöcke (4 davon platziert), 2 Snippets.
24. `layout/theme.liquid` repariert Barrierefreiheit per Skript (aria-label aus dem URL-Slug, MutationObserver
    für das Rechner-Label) statt an der Quelle.
25. 49 `!important`, ~25 verstreute Hex-Farben in `tp-`-Dateien, Theme Check 41 Warnungen.
26. Breadcrumb-Links 17 px hoch.

## D – Quick Wins (klein, messbar, geringes Risiko)

Karten-CSS einmal statt je Karte · Zwischenbreiten im Karten-`srcset` · `tp-startseite.css` nur auf der
Startseite · Kontrast und Namen (WhatsApp, Telefonlink, Sticky-Button) · Kontaktfelder 16 px · H1 für
Rechtstexte · doppelte Marke im Title · doppeltes Such-Icon mobil.

## E – Größere Baustellen

Kopfbereich mobil · Kategorieseite mobil (Produkte zuerst) · Produktkarte entschlacken (Variantenbilder,
Vergleich zurücknehmen) · Design-Tokens und Button-System · zentrale Quelle für Kontakt, Serviceregel und
Bewertung · Aufräumen toter Teile · Suche (Synonyme) · Warenkorb-Menge bei Rollenware · cm-genaue Abrechnung
(Geschäftsentscheidung, siehe Verifikation B-19).

## F – Conversion-Blocker

Live-P0 (falsche Seiten, falsches Versandversprechen) · Produkte mobil zu spät sichtbar · 7,6 s LCP mobil ·
kein Laden-/Teamfoto · Aufrundung auf volle m² bei Rollenware (offen ausgewiesen, aber Nachteil).

## G – Mobile-Blocker

219-px-Kopfbereich · Kategorie-Einstieg · 15-px-Eingaben · Stapel unten fixierter Leisten (Kontaktleiste 63 px,
Sticky-Warenkorb 76–101 px, Vergleichsleiste, Cookie-Banner) – Überlagerung wird in Phase 9 gezielt geprüft.

## H – SEO-Blocker

Live-Fallback-Seiten · Rechtstexte ohne H1 · fehlende Descriptions · doppelte Marke im Title · Service-Menülink ·
Kategorieseiten mit H2 vor H1.

## I – Performance-Blocker

Übergroße Kartenbilder · CSS je Karte · 13 Slides je Karte · 144 KB Kopfbereich je Seite (54 Menübilder) ·
render-blockierendes CSS · Shopify-Checkout-Skripte (~700 KB, Plattform, nicht Theme).

## J – Accessibility-Blocker

Siehe Punkt 7; dazu fehlende H1 auf Rechtstexten und die Skript-Reparaturen aus Punkt 24.

## K – Technische Risiken

Parallele Sitzungen auf demselben Entwurf · PR-Stapel über vier Ebenen (#174 → Konzept C → #186 → #190), der
für den Deploy komplett nach `main` muss · `config/settings_data.json` wird bei jedem Push ausgelassen:
Theme-Einstellungen (z. B. Favicon) wirken nur im jeweiligen Theme und müssen im Editor gesetzt werden ·
Theme-Bibliothek bei 19 von 20 Plätzen.

## L – Bereits behobene Punkte aus dem Audit vom 2026-09-10

B-01 bis B-06, B-09, B-11, B-14 (Daten live), B-16, B-17, B-18, B-20, B-21, B-23, B-24, B-26, B-28, B-29, B-30,
B-32, B-39, B-41, B-42, B-45, B-46, B-47, B-48. Das in der Notiz vom Vormittag gemeldete Querscrollen der
Top-Leiste auf 320 px tritt im Arbeits-Theme nicht mehr auf (0 px bei allen 8 Viewports).

## M – Bereiche, die nicht beschädigt werden dürfen

Rollenware-Rechner (Breite, Länge, Skizze, Formel, Aufrundung, Validierung, Warenkorb-Eigenschaften) ·
Paketrechner (Bedarf, Verschnitt, Pakete, €/m², Gesamtpreis) · Sockelleisten (Dekorbilder, Vorschau,
Wandlängen-Helfer) · Warenkorb-Drawer und Eigenschaften · Vergleich · Musterbestellung ·
Verlegegebiet-Karte und PLZ-Prüfung · Kontaktwege (Telefon, WhatsApp, Formular) · Hero-Kernaussage ·
Grundstruktur der Navigation · Predictive Search · Breadcrumb.

## N – Teststrategie je Änderung

1. Guards (`liquid`, `schema`, `template`, `theme`, `essential`), `validate --static`, Theme Check ohne neue Befunde.
2. `workflow:scratch` ins Arbeits-Theme.
3. Puppeteer-Messreihe der betroffenen Seitentypen über 8 Viewports: Kopfbereich, H1-Lage, Querscrollen,
   DOM, Konsolenfehler, Screenshots vorher/nachher.
4. Lighthouse auf denselben Seiten mit denselben Flags.
5. Funktion per DOM: Rollenware (Breite, Länge, Fläche, Preis, Eigenschaften in `/cart.js`), Paket (Bedarf →
   Pakete), Sockelleiste (38 m → Stangen), Muster, Warenkorb-Änderung, Suche.
6. Gegenprobe: gleiche Messung auf dem unveränderten Stand; eine Änderung gilt nur, wenn sie das Problem
   verbessert und keine andere Messung verschlechtert.

## O – Reihenfolge

1. Produktkarte: CSS einmal ausgeben, Bildbreiten, versteckte Variantenbilder (Performance, geringes Risiko).
2. Barrierefreiheit: Kontrast, Namen, Überschriften.
3. Kontaktfelder 16 px, H1 Rechtstexte, Title-Marke, CSS nur wo gebraucht, CLS Startseite.
4. Kopfbereich mobil.
5. Kategorieseite mobil.
6. Danach Phasen 5–18 des Auftrags; Geschäftsregeln, Preise, Produktdaten und Menüs nur mit Freigabe.

Offene Entscheidungen des Inhabers: Deploy der Kette (behebt beide P0), quadratisches Logo/Favicon,
Synonyme in der Such-App, Produkttitel ohne Breiten, App-Einbettungen, Versandrichtlinie, cm-Abrechnung.

## Zwischenstand Phase 1 (2026-09-11, nachmittags)

Sieben Änderungen, jede einzeln gemessen und committet (`feature/shop-qualitaet`), nichts veröffentlicht.

| # | Änderung | Messung vorher → nachher |
|---|---|---|
| 1 | Karten-CSS einmal pro Seite statt je Karte | Kategorie-HTML 1.534 → 1.368 KB, Startseite 646 → 565 KB; berechnete Styles von ~2.700 Elementen identisch |
| 2 | Kartentitel-Regel nur auf den Kartentitel | vorher kürzte sie jede `[role=heading]` der Seite; Styles der Karten identisch |
| 3 | Passende Bildbreiten für Karten | gewählte Breite überall gleich oder kleiner: Desktop 832 → 600, Retina 1.200 → 1.080, Startseite Retina 832 → 600 |
| 4 | Megamenü-Bilder erst bei der ersten Absicht | Bildanfragen beim Laden Desktop 65 → 31, mobil 50 → 16; Lighthouse 590–800 KB weniger je Seite; Menüs öffnen gleich hoch mit Bildern |
| 5 | Barrierefreiheit: Kontraste, Namen, H1 Rechtstexte, 16-px-Felder | Lighthouse A11y Startseite 91 → 97, Kategorie 86 → 92, Rollenware 82 → 96, Sockelleiste 81 → 94, Verlegeservice 90 → 97, Kontakt 94 → 97 |
| 6 | Kopfbereich mobil kompakt, Kategorie-Leiste nicht auf Produkt/Warenkorb | Inhalt beginnt bei 185 statt 219 px (Start/Kategorie/Kontakt), 141 statt 219 px (Produkt/Warenkorb); Desktop unverändert |
| 7 | Galerie und Titel direkt unter der Breadcrumb | H1 der Produktseite 48 px höher auf allen Breiten (390 px: 702 → 595 zusammen mit #6) |

Gegenprobe nach jeder Änderung: Guards, `validate --static`, Theme Check (41 Warnungen, unverändert),
Querscrollen auf 8 Viewports (immer 0), Konsolenfehler (nur Plattform: `sf_private_access_tokens` 401 in
der Vorschau, favicon 404).

**Befund zur Arbeitsweise:** Das Arbeits-Theme wird von zwei weiteren Sitzungen mitbenutzt (Mobile-Menü,
neuer Bereich „Teppiche“). Deren Drawer steht seit 13:40 im Theme und erklärt +300 DOM-Elemente je Seite in
späteren Messungen – nicht Folge dieser Änderungen. Seitdem wird nur noch dateigenau (`--only`) gepusht; die
Sitzungen sind informiert.

**Lighthouse-Varianz:** Derselbe Stand der Klickvinyl-Kategorie lieferte LCP 4,4 / 4,8 / 11,6 s. In den
schlechten Läufen steht das LCP-Bild 2 s in „Render Delay“ – ein echtes, bestehendes Problem des
Kategorie-Karussells (Phase 11). Vergleiche ab jetzt als Median aus drei Läufen.

**Zwischenscore Entwurf: 70 / 100** (vorher 67): Performance 58 → 61, Accessibility 70 → 78,
Mobile UX 62 → 66, Produktseiten 72 → 73, Technische Qualität 60 → 61. Unverändert offen: Kategorieseite
mobil (Produkte spät), CLS Desktop-Startseite, Suche/Synonyme, Live-P0 (Deploy).

## Zwischenstand Kategorieseiten und Kaufwege (2026-09-11, abends)

Vorgabe des Inhabers: Ergebnis in Theme `204168364366` hochladen – das ist die Arbeitskopie, in die jede
Änderung nach bestandener Prüfung dateigenau gepusht wird. Nichts veröffentlicht.

| # | Änderung | Messung vorher → nachher |
|---|---|---|
| 8 | Schrift-Vorladen mit hoher Priorität | **zurückgenommen**: CLS war nach #4 schon 0,015 (nicht mehr 0,174); „high“ verschlechterte Desktop-FCP 0,86 → 1,25 s und Score 95 → 90 (Median aus 3) |
| 9 | Unterkategorien-Leiste aus dem Hauptmenü, Produkte vor dem Karussell (Teppichboden, Vinylboden) | erste Produktkarte mobil 802/907 → 382 px, Desktop 902/1.000 → 415 px |
| 10 | Unterkategorie-Kopf am Telefon kompakt, Geschwister-Leiste (9 Templates) | erste Karte mobil Klickvinyl 1.015 → 629 px, Hochflor 1.096 → 713 px; seitlicher Rand am Telefon ergänzt |
| 11 | Zubehör-Bereichskacheln am Telefon als kompakte Liste | Kachelbereich 1.495 → 754 px, erstes Produkt 2.484 → 1.743 px |
| 12 | Bodenleisten: Kopfbild am Telefon aus, Material-Kacheln nebeneinander | erstes Produkt 1.644 → 1.228 px |

Eigene Regression gefunden und vor dem Commit behoben: Die nicht umbrechende Leiste zog in #10 die
Rasterspalte auf 520 px, der Text wurde am Telefon rechts abgeschnitten (`min-width: 0`).

Kaufwege nach allen Änderungen:

| Strecke | Desktop (Playwright) | Telefon 390 px (DOM) |
|---|---|---|
| Paketware Klickvinyl | PASS | PASS – „3,5“ ergibt 2 Pakete, 10 m² → 6 Pakete à 105,98 €, Warenkorb 635,88 € |
| Rollenware Vinyl 400 × 250 cm | PASS | PASS – 10 m², 259,00 €, Eigenschaften Rollenbreite, Länge, Fläche vollständig |
| Sockelleiste 38 m | – | PASS – „8 Stangen (ergibt 41,2 m)“, Menge 8 im Warenkorb |
| Muster | PASS | – (Vorschauleiste, siehe Notiz) |

Interne Warenkorb-Eigenschaft `_Farbe intern` wird im Warenkorb nicht angezeigt (Unterstrich-Schlüssel werden
in `snippets/cart-products.liquid` übersprungen).

**Zwischenscore Entwurf: 73 / 100**: Kategorieseiten 62 → 72, Mobile UX 66 → 71, Navigation 73 → 75,
Performance 61 → 62. Offen als Nächstes: Überschriften-Reihenfolge der Produktkarten, verborgene
fokussierbare Karussell-Folien, Startseitenlänge, Suche (Synonyme – Such-App, Inhaber), Live-P0 (Deploy).

## Zwischenstand Barrierefreiheit, SEO und Seitengewicht (2026-09-11, spätabends)

Alles im Arbeits-Theme `204168364366`, dateigenau gepusht, nichts veröffentlicht.

| # | Änderung | Messung vorher → nachher |
|---|---|---|
| 13 | Tablet: mindestens zwei Spalten auch bei Kartengröße „medium“ (`328fca8`) | 768 px mit Filterspalte: vorher eine Spalte mit 690 px hohen Karten, jetzt zwei |
| 14 | H2 zwischen Seitentitel und Produktkarten (`0c6aaec`) | Überschriften springen nicht mehr von H1 auf H3; Suche behält das Aussehen einer H4 |
| 15 | Verborgene Karussell-Folien aus der Tab-Reihenfolge (`c20776c`) | fokussierbare Elemente in `aria-hidden`-Folien 0; beim Blättern wieder fokussierbar |
| 16 | Footer-Aufforderung auf der Startseite nicht doppelt (`422e7f2`) | Startseite mobil 10.969 → 10.560 px; alle anderen Seiten unverändert; abschaltbar |
| 17 | Marke in Titeln einheitlich und nur einmal (`4936381`) | „Versand & Lieferung \| Teppich Paradies – TeppichParadies“ → „… \| Teppich Paradies“; 10 Seitentypen per curl geprüft, og:site_name ebenso |
| 18 | Organisationsname im JSON-LD (`6f77724`) | `name` „Teppich Paradies“, Admin-Schreibweise als `alternateName`; Service-Anbieter gleich |
| 19 | Versteckte Variantenfolien in Produktkarten nicht rendern (`f48c7a5`) | /collections/teppichboden: 228 unsichtbare Folien weg, HTML 1.419 → 1.004 KB (gzip 140 → 109), DOM ~5.280 → 4.557 (mobil) |
| 20 | Bildblöcke ab der dritten Section lazy, srcset-Stufen 480/640 (`3598ac4`, `659c0e8`) | Bilder beim Laden ohne Scrollen: mobil 1.571 → 996 KB, Desktop 1.547 → 412 KB; Kachel 832 → 640 px (mobil) bzw. 480 px (Desktop), je Kachel 82 → 51 bzw. 29 KB |

Gegenproben:
- **#19:** Kartenbilder auf Kategorie, Suche, Startseite und PDP-Empfehlungen vorhanden, 0 JS-Fehler. Ein Farbfilter zeigt weiterhin das passende Kartenbild als erste Folie. `npm run template:guard` meldet jetzt als Fehler, falls jemand den Kartenblock `swatches` einsetzt, der diese Folien bräuchte (Regel `verbotenInKarte`, über alle Templates und Section-Gruppen, Tests I–I3).
- **#20:** Beim Blättern im Karussell ist jede sichtbar werdende Kachel geladen (0 leere). Betroffen sind nur die 36 Bildblöcke der 7 Kategorie-Karussells; oben liegende Bildblöcke und Section-Gruppen rendern byte-gleich.

**Befund Messmethode (korrigiert frühere Annahme):**
- Lighthouse auf der Vorschau-URL ist zweigipflig: FCP entweder ≈ 2,8 s oder ≈ 5,4 s, LCP 8,5–15,8 s bei unverändertem Stand.
- Ursache ist die Umleitung, mit der `?preview_theme_id` das Vorschau-Cookie setzt (≈ 860 ms, Lighthouse warnt bei jedem Lauf), zusammen mit wechselndem Cache-Zustand bei Shopify.
- Ein Median aus drei Läufen kann Schritte dieser Größe deshalb nicht auflösen.
- Einzelschritte werden ab jetzt mit deterministischen Größen belegt (HTML-Bytes, DOM-Knoten, Bild-Bytes beim Laden).
- Für das Schlussaudit läuft Lighthouse ohne Umleitung: Das `_shopify_essential`-Cookie wird vorab per curl geholt, geprüft wird, dass Theme-Pfad `t/53` geladen wurde.
- Die Rücknahme des Schrift-Vorladens (#8) bleibt trotzdem richtig, denn ihr Zweck (CLS) war schon erreicht.

**Befund LCP Kategorieseite mobil:**
- Für Erstbesucher ist das größte Element der Text des Shopify-Cookie-Banners (307 × 208 px). Er erscheint spät und ist größer als jedes Kartenbild.
- Das gilt auch im Feld für jeden Erstbesuch. Banner-Code und -Zeitpunkt liegen bei Shopify; Textlänge und Position sind eine Einstellung im Admin (Inhaber).
- Ohne Banner ist das erste Kartenbild das LCP-Element.

**Endlos-Scrollen:** Die Kategorieseite lädt 3 Seiten (51 Produkte) nach. Das Karussell unter dem Raster ist deshalb erst nach allen Produkten erreichbar; die Unterkategorie-Leiste oben (#9) übernimmt seine Navigation.

Red-Team der eigenen Änderungen:
- **#17:** Ein im Admin gesetzter SEO-Titel, der „TeppichParadies“ enthält, bleibt wie eingegeben – das Theme ergänzt dann keine zweite Marke. Die saubere Lösung ist der Shopname im Admin (wirkt auch in E-Mails, Checkout, Copyright).
- **#19:** Der Schnellkauf lädt die Produktseite in ein Modal und liest die Kartenfolien nicht (Code gelesen, nicht im Browser geklickt; die Karten zeigen statt Schnellkauf „Muster bestellen“).
- **#20:** `section.index` ist in Section-Gruppen leer. Bildblöcke im Kopf- oder Fußbereich bleiben deshalb bewusst unverändert, auch wenn sie unten stehen.

Neu für die Inhaberliste:
1. Rollenware-Produkte haben absichtlich kein Produkt-JSON-LD (`snippets/tp-product-structured-data.liquid`: Shopify-Preis ist dort ein m²-Basispreis). Ein Rich Result bräuchte eine Entscheidung, wie der Preis ausgezeichnet wird.
2. Angebote ohne `shippingDetails` und `hasMerchantReturnPolicy`: Das braucht die verbindlichen Versand- und Rückgaberegeln, die das Theme nicht erfinden darf.
3. Shopname im Admin „TeppichParadies“ → „Teppich Paradies“ (siehe #17).
4. Cookie-Banner kürzer bzw. als kompakte Leiste (siehe LCP-Befund).

Nicht beeinflussbar, der Vollständigkeit halber: Shopify lädt auf jeder Seite rund 600 KB Checkout-Skripte vor (`/checkouts/internal/preloads.js`, Priorität „VeryLow“, ab 2,5 s). Der Kopfbereich von 115–211 KB HTML besteht überwiegend aus Shopify-Analytics und Pixel-Loader.

**Zwischenscore Entwurf: 75 / 100**:

| Kategorie | vorher → jetzt |
|---|---|
| Produktkarten | 63 → 68 (#1–#3, #19) |
| Performance | 62 → 65 (deterministisch belegt, Lighthouse-Wert in der Vorschau nicht belastbar) |
| SEO | 68 → 71 |
| Local SEO | 62 → 63 |
| Professionalität | 67 → 69 |
| Accessibility | 78 → 80 |
| Kategorieseiten | 72 → 74 |
| Startseite | 70 → 71 |

Offen als Nächstes:
- Kopfbereich mit 1.170 DOM-Elementen auf jeder Seite (Megamenü und Drawer – Bereich der Menü-Sitzung, nur in Abstimmung)
- Startseitenlänge
- Design-Tokens
- Schlussaudit mit redirect-freiem Lighthouse

## Schlussbericht (2026-09-11)

Alle Änderungen liegen auf `feature/shop-qualitaet` (je ein Commit pro Schritt) und im unveröffentlichten
Arbeits-Theme `204168364366` „Qualitaet Arbeitskopie 2026-09-11“. **Nichts ist veröffentlicht, das Live-Theme
ist unverändert.** Kein Preis, keine Versandregel, keine Produktdaten verändert. Rechtstexte: bei Datenschutz und AGB nur
die vorhandene Überschrift als H1 ausgezeichnet, kein Wort des Textes geändert.

### Änderungen im Überblick

| # | Bereich | Änderung | Commit |
|---|---|---|---|
| 1 | Performance | Karten-CSS einmal pro Seite statt je Karte | `f3bbaee` |
| 2 | Karten | Kartentitel-Regel nur auf den Kartentitel | `292354a` |
| 3 | Performance | Passende Bildbreiten für Karten | `355111e` |
| 4 | Performance | Megamenü-Bilder erst bei der ersten Absicht | `3dc4799` |
| 5 | Accessibility | Kontraste, Namen, H1 der Rechtstexte, 16-px-Felder | `12775a5`, `a90fc9f` |
| 6 | Mobile UX | Kopfbereich mobil kompakt, Kategorie-Leiste nicht auf Produkt/Warenkorb | `b4d9dfe` |
| 7 | Produktseite | Galerie und Titel direkt unter der Breadcrumb | `1f8e37e` |
| 8 | Performance | Schrift-Vorladen mit hoher Priorität – **zurückgenommen** (kein Nutzen) | – |
| 9 | Kategorie | Unterkategorien-Leiste aus dem Hauptmenü, Produkte vor dem Karussell | `108714b` |
| 10 | Kategorie | Unterkategorie-Kopf am Telefon kompakt, Geschwister-Leiste | `17a42a4` |
| 11 | Kategorie | Zubehör-Bereichskacheln am Telefon als Liste | `b2ba4ae` |
| 12 | Kategorie | Bodenleisten: Kopfbild am Telefon aus, Material-Kacheln nebeneinander | `3a1deee` |
| 13 | Kategorie | Tablet: mindestens zwei Spalten | `328fca8` |
| 14 | Accessibility | H2 zwischen Seitentitel und Produktkarten | `0c6aaec` |
| 15 | Accessibility | Verborgene Karussell-Folien aus der Tab-Reihenfolge | `c20776c` |
| 16 | Startseite | Footer-Aufforderung auf der Startseite nicht doppelt | `422e7f2` |
| 17 | SEO | Marke in Titeln einheitlich und nur einmal | `4936381` |
| 18 | SEO | Organisationsname im JSON-LD | `6f77724` |
| 19 | Performance | Versteckte Variantenfolien in Karten nicht rendern + Guard-Regel | `f48c7a5` |
| 20 | Performance | Bildblöcke ab Section 3 lazy, srcset-Stufen 480/640 | `3598ac4`, `659c0e8` |
| 21 | Performance | Erstes Kartenbild als LCP-Element priorisieren | `e4a95cd` |
| 22 | Performance | Megamenü-Bilder nach Header-Hydration wieder freigeben (Fund einer anderen Sitzung) | `67a4927` |
| 23 | Startseite | Listen inaktiver Reiter ab dem ersten Bild ausblenden (Absicherung, siehe unten) | `affb6f7` |
| 24 | Kategorie | Keine doppelte Knopfreihe auf Kategorien mit Unterkategorie-Leiste | `92b6ba9` |
| 25 | Karten | Einheit „€/m²“ neben dem Kartenpreis lesbar (9,8 → 13 px) | `dfa1a2c` |
| 26 | Seiten | Karriere: Telefon- und E-Mail-Link, einheitliches Nummernformat | `5ed5985` |

**Theme-Abgleich (Admin API, Prüfsummen, danach inhaltlich):** 37 der 49 auf diesem Branch geänderten
Theme-Dateien sind im Arbeits-Theme byte-identisch. Die übrigen 12 sind inhaltlich geprüft:

- **11 Kategorie-Templates:** Sie weichen nur in drei Raster-Einstellungen der Menü-Sitzung ab (Kartengröße „medium“, mobil „small“, mobil nicht randlos). Alle Template-Änderungen dieses Programms sind enthalten.
- **`_header-menu.liquid`:** Das ist die Fassung der Menü-Sitzung; sie enthält die Regel aus #4.

Wer die Branches zusammenführt, muss die Raster-Einstellungen der Menü-Sitzung übernehmen – auf diesem Branch stehen noch die alten Werte.
Die `sizes`-Korrektur aus #21 deckt beide Fassungen ab.

### Vorher / nachher – deterministische Messgrößen

| Messung | vorher | nachher |
|---|---|---|
| Kopfbereich bis Inhalt, mobil 390 px (Start/Kategorie) | 219 px | 185 px |
| Kopfbereich bis Inhalt, mobil (Produkt/Warenkorb) | 219 px | 141 px |
| Erste Produktkarte mobil – Teppichboden | 802 px | 382 px |
| Erste Produktkarte mobil – Klickvinyl / Hochflor | 1.015 / 1.096 px | 629 / 713 px |
| Erstes Produkt mobil – Zubehör / Bodenleisten | 2.484 / 1.644 px | 1.743 / 1.228 px |
| H1 Produktseite mobil | 702 px | 595 px |
| Startseite Länge mobil | 11.077 px | 10.560 px |
| HTML Kategorie Teppichboden | 1.534 KB | 1.004 KB |
| DOM-Knoten Kategorie Teppichboden mobil | ~5.280 | 4.555 |
| Bilder beim Laden Kategorie, mobil / Desktop | 1.571 / 1.547 KB | 996 / 412 KB |
| Megamenü-Bildanfragen beim Laden, Desktop / mobil | 65 / 50 | 31 / 16 |
| LCP Kategorie mobil gedrosselt (Banner blockiert, 7 Läufe) | 7,58 s | 3,95 s |
| Seitentitel mit doppelter Marke („… \| Teppich Paradies – TeppichParadies“) | 3 von 10 Seitentypen | 0 |
| Seitentitel / og:site_name mit Admin-Schreibweise „TeppichParadies“ | 9 / 10 von 10 | 0 / 0 |
| Fokussierbare Elemente in verborgenen Karussell-Folien | > 0 | 0 |

**DOM-Größe ehrlich:** Im Endlauf hat jede Seite rund 850 DOM-Knoten mehr als im Ausgangslauf, etwa
Kontakt 1.499 → 2.359. Das kommt vom neuen Handy- und Megamenü der Menü-Sitzung im selben Theme. Auf
Kategorie Teppichboden bleiben netto +140, weil #19 dort rund 700 Knoten spart. Die Verlegeservice-Seite ist
durch neue Inhalte der Verlegeservice-Sitzung deutlich länger (mobil 3.047 → 9.128 px). Die Klickvinyl-Produktseite
war im Ausgangslauf eine 404-Seite und ist deshalb nicht vergleichbar.

### Vorher / nachher – Lighthouse (Schlussaudit)

**Methode:**
- Lighthouse 13.4.1, Live-Theme und Entwurf abwechselnd im selben Zeitfenster gemessen, je 3 Läufe, Median.
- Der Entwurf lief ohne Vorschau-Umleitung: Das Vorschau-Cookie wurde vorab per curl geholt, und geprüft wurde, dass nur Theme-Pfad `t/53` geladen wurde.
- Mobil heißt: simuliertes Mittelklasse-Telefon mit gedrosseltem Netz.

| Seite | Gerät | Läufe | Live P / A / BP / SEO | Entwurf P / A / BP / SEO | Live LCP | Entwurf LCP | Live CLS | Entwurf CLS | Live KB | Entwurf KB |
|---|---|---|---|---|---|---|---|---|---|---|
| Startseite | mobil | 3/3 | 65 / 93 / 73 / 100 | 60 / 97 / 73 / 100 | 9,92 s | 11,37 s | 0,000 | 0,000 | 2700 | 2828 |
| Kategorie Teppichboden | mobil | 3/3 | 63 / 88 / 73 / 92 | 60 / 97 / 73 / 100 | 14,89 s | 13,08 s | 0,000 | 0,000 | 4388 | 3364 |
| Kategorie Klickvinyl | mobil | 3/3 | 65 / 88 / 73 / 100 | 72 / 97 / 73 / 100 | 10,53 s | 6,79 s | 0,000 | 0,000 | 3271 | 2502 |
| Produkt Rollenware | mobil | 3/3 | 66 / 85 / 73 / 100 | 61 / 96 / 73 / 100 | 8,09 s | 8,82 s | 0,000 | 0,000 | 2169 | 2031 |
| Produkt Sockelleiste | mobil | 3/3 | 59 / 84 / 73 / 100 | 71 / 97 / 73 / 100 | 9,34 s | 6,40 s | 0,000 | 0,000 | 2786 | 2606 |
| Verlegeservice | mobil | 3/3 | 66 / 93 / 73 / 100 | 61 / 97 / 73 / 100 | 7,61 s | 8,74 s | 0,000 | 0,000 | 2060 | 2091 |
| Startseite | Desktop | 3/3 | 92 / 90 / 73 / 100 | 95 / 94 / 73 / 100 | 1,84 s | 1,34 s | 0,000 | 0,002 | 3212 | 4333 |
| Kategorie Teppichboden | Desktop | 3/3 | 95 / 86 / 73 / 92 | 93 / 93 / 73 / 100 | 1,34 s | 1,47 s | 0,000 | 0,003 | 6804 | 3861 |
| Produkt Rollenware | Desktop | 3/3 | 98 / 87 / 73 / 100 | 96 / 93 / 73 / 100 | 1,07 s | 1,26 s | 0,000 | 0,002 | 2361 | 2167 |

**Einordnung:**
- **Accessibility und SEO:** überall besser. Mobil 84–93 → 96–97, Desktop 86–90 → 93–94, SEO Kategorie 92 → 100.
- **Kategorien und Produktseiten:** deutlich leichter (Teppichboden Desktop 6,8 → 3,9 MB). Sockelleiste mobil P 59 → 71 (LCP 9,3 → 6,4 s), Klickvinyl P 65 → 72 (LCP 10,5 → 6,8 s).
- **Startseite, Rollenware und Verlegeservice mobil:** schlechter als Live (P 60/61 statt 65/66).
  - Auf Startseite und Verlegeservice ist das LCP-Element im Entwurf der Text des Cookie-Banners, auf Live der Hero.
  - Die LCP-Werte streuen zweigipflig (Rollenware 5,5 / 8,8 / 8,9 s).
  - Beide Seiten gehören inhaltlich zu Konzept C bzw. zur Verlegeservice-Sitzung. Ein Rückschritt bleibt es trotzdem und steht unten als offener Punkt.
- **Startseite Desktop:** Im Audit noch 1,1 MB schwerer als Live. Nach #23 leichter als Live: 2,6 statt 3,2 MB, siehe unten.
- **Gleichzeitige Arbeit:** Während des Audits haben zwei andere Sitzungen dateigenau ins selbe Theme gepusht (Menü, Verlegeservice). Gemessen ist der geteilte Entwurf, nicht allein dieses Programm.

**#23 – zwei Messungen, zwei Ergebnisse, beide wahr:**
- **Im Browsertest (Puppeteer):** Im Entwurf laden vor und nach der Änderung gleich viele Produktbilder (mobil 12 × 395 KB, Desktop 21 × 548 KB).
- **In Lighthouse:** Die Nachmessung der Startseite nach #23 (3 Läufe) zeigt die Wirkung:

  | Startseite | vorher | nachher |
  |---|---|---|
  | Desktop, Seitengewicht | 4.333 KB | 2.587–2.651 KB (jetzt unter Live, 3.212 KB) |
  | Desktop, Produktfotos in 1.080/1.440 px | 8 Stück, 1.443 KB | keine |
  | Desktop, P / LCP | – | 95–96 / 1,26–1,37 s |
  | mobil, P (Median) | 60 | 61 (Läufe 60/72/61) |
  | mobil, LCP | 11,4 s | 10,6 s |

- **Deutung:** Die Bilder der verborgenen Reiter wurden nur in der Lighthouse-Umgebung angefragt, bevor das Skript die Listen versteckte. Das CSS ab dem ersten Bild verhindert das jetzt in jeder Umgebung.
- **Mobil** bleibt die Startseite hinter Live (P 65).

### Testmatrix (Endstand)

| Prüfung | Ergebnis |
|---|---|
| `liquid:guard`, `schema:guard`, `theme:guard`, `essential:guard` | 0 Fehler |
| `npm test` | 37/37 bestanden |
| `template:guard` | 0 Fehler (2 bekannte Warnungen aus fremden Templates); neue Regel `verbotenInKarte`, 17/17 Tests |
| `validate --static` | WORKFLOW, UNIT/AUTOMATION, QA EVIDENCE, SECRET SCAN, Guards: PASS |
| `shopify theme check` | 0 Fehler, 41 Warnungen (unverändert gegenüber dem Ausgangsstand), keine in geänderten Dateien |
| Kaufweg Desktop: Paket, Rollenware, Muster | 3/3 PASS (Theme-ID geprüft, keine Bestellung) |
| Kaufweg Telefon: Paket „3,5“ → 2 Pakete, Rollenware 400 × 250 → 259,00 €, Sockelleiste 38 m → 8 Stangen | 3/3 PASS, Eigenschaften vollständig, `_Farbe intern` unsichtbar |
| Karten auf Kategorie, Suche, Startseite, PDP-Empfehlungen | Bilder vorhanden, 0 JS-Fehler (390/1440) |
| Farbfilter Kategorie | passendes Kartenbild bleibt erste Folie |
| Karussell-Kacheln lazy | beim Blättern 0 sichtbare leere Kacheln |
| Seitentitel und og:site_name (10 Seitentypen, curl) | einheitlich „Teppich Paradies“ |
| JSON-LD (Start, Kategorie, 2 PDP, Kontakt, Verlegeservice, Referenzen) | alle Blöcke parsen; Organisation, Service, BreadcrumbList, ProductGroup |
| Querscrollen 8 Viewports | 160 Aufrufe (20 Seiten × 8 Viewports): 0 × Querscrollen, 0 Abbrüche, alle Theme 204168364366; Konsolenfehler 112 (Ausgangslauf 120) |
| Konsolenfehler | nur Plattform (favicon 404, shop.app-CSP in der Vorschau) |
| Eigenes Dev-Theme `204180619598` (Kontext feature-shop-qualitaet), Änderungen #22–#26 | Prüfsummen = lokal; Laufzeitprüfung 10/11 PASS (einziger FAIL: favicon.ico 404); mobile Kaufwege 3/3 PASS |
| Entwurf nach dateigenauem Push (#22–#26) | Prüfsummen der 5 Dateien = lokal; Laufzeitprüfung 10/11 PASS (favicon); Reiter hin und zurück, 0 JS-Fehler |
| Dreiwege-Prüfung vor jedem Push ab #22 | Theme-Prüfsumme = eigene Ausgangsfassung, sonst kein Push (`snippets/price.liquid` einer anderen Sitzung deshalb nicht angefasst) |

### Endstand Score

Gleiche Rechenweise wie Abschnitt A: einfacher Durchschnitt der 22 Kategorien.

| Kategorie | Start Entwurf | Ende | Grund |
|---|---|---|---|
| Gesamteindruck | 69 | 72 | Produkte zuerst auf Kategorieseiten, Kopfbereich mobil kompakt |
| Professionalität | 67 | 71 | Titel ohne Doppelmarke, H1 der Rechtstexte, lesbare Einheit; Favicon fehlt weiter |
| Vertrauen | 64 | 64 | unverändert – kein Laden-/Teamfoto |
| Startseite | 70 | 72 | doppelte Aufforderung weg, Desktop nach #23 leichter als Live (2,6 statt 3,2 MB); mobil hinter Live |
| Navigation | 73 | 76 | Unterkategorie- und Geschwister-Leiste, Karussell-Fokus, keine doppelte Knopfreihe |
| Desktop UX | 70 | 72 | Tablet zweispaltig, Produkte zuerst, passende Bildbreiten |
| Mobile UX | 62 | 72 | Kopf 219 → 185/141 px, erste Karte 802 → 382 px, 16-px-Felder |
| Produktkarten | 63 | 70 | CSS einmal, Bildbreiten, keine versteckten Folien, Einheit 13 px |
| Kategorieseiten | 62 | 75 | Produkte zuerst, Unterkategorien, LCP-Bild priorisiert, halbes HTML-Gewicht |
| Produktseiten | 72 | 74 | Galerie unter der Breadcrumb, Sticky-Button benannt |
| Rechner | 79 | 79 | unverändert, alle Kaufwege PASS |
| Kaufprozess | 74 | 74 | unverändert, alle Kaufwege PASS |
| Conversion | 60 | 60 | unbelegt – 0 Käufe, keine neuen Daten |
| Verlegeservice | 70 | 70 | nicht Teil dieses Programms |
| Kontakt | 78 | 79 | 16-px-Felder, WhatsApp-Kontrast, Karriere-Links |
| Design-Konsistenz | 58 | 59 | nur Kontrast-Korrekturen; 73 Hex-Werte offen |
| SEO | 68 | 72 | Titel, JSON-LD, H1; Lighthouse-SEO Kategorie 92 → 100 |
| Local SEO | 62 | 63 | Organisationsname und alternateName |
| Performance | 58 | 64 | Kategorien, Produktseiten und Startseite Desktop leichter und schneller; Startseite/Verlegeservice mobil hinter Live |
| Accessibility | 70 | 82 | Lighthouse mobil 96–97, Desktop 93–94; ohne Screenreader-Test |
| Technische Qualität | 60 | 62 | Guard-Regel, Messmethode; tote Sections weiter vorhanden |
| Wettbewerbsfähigkeit | 63 | 64 | Kategorie mobil konkurrenzfähiger, Startseite nicht |
| **Gesamt** | **67** | **70** | |

**Korrektur:** Die Zwischenstände 73 und 75 weiter oben waren zu hoch. Sie haben vor allem die veränderten
Kategorien gewichtet. Nach der Rechenweise von Abschnitt A steht der Entwurf bei **70 / 100** (Start 67).
Der Live-Shop bleibt bei etwa 60, weil nichts davon veröffentlicht ist.

### Was verhindert jetzt noch 100/100?

Ehrlich eingeordnet: Mit Theme-Arbeit allein ist mehr als rund 80 nicht zu erreichen. Die großen
Hebel liegen beim Inhaber, bei Shopify oder brauchen echte Kaufdaten.

1. **Nichts davon ist live.** Der Live-Shop steht bei etwa 60.
   - Die Deploy-Kette verlangt `main`.
   - Dieser Branch baut auf dem unveröffentlichten Konzept-C-Entwurf auf (Draft-PR #190 → #186 → #174).
   - Ohne Merge und „deploy“ erreicht keine Verbesserung einen Kunden.
2. **Performance mobil:** Der Rest liegt überwiegend außerhalb des Themes.
   - **Shopify-Plattform:** 83 KB Analytics-JSON im Kopf, rund 600 KB Checkout-Vorladen, Pixel-Loader.
   - **Cookie-Banner:** Er ist für Erstbesucher das LCP-Element.
   - **Filterformular:** Es steht doppelt im HTML (Horizon-Kern, 215 KB vor dem Raster). Allein „Florhöhe“ hat 27 Werte (Filterdaten).
   - **Kopfbereich:** 1.170 DOM-Elemente (Megamenü und Drawer, Bereich der Menü-Sitzung).
   - **Unterkategorie-Seiten:** Das Raster steht dort an Section-Position 3, die LCP-Priorisierung (#21) greift noch nicht – nächster technischer Schritt.
3. **Conversion ist unbelegt.**
   - 0 Käufe bei 2.614 Sitzungen (Audit 2026-09-10).
   - Die Änderungen sind begründet und gemessen, aber nicht durch Kaufdaten bestätigt.
   - Nötig sind Deploy und danach vier bis sechs Wochen Messung (Warenkorb-Rate, Checkout-Abbrüche).
4. **Vertrauen:** Es gibt kein Laden- oder Teamfoto, und das Favicon fehlt (404 auf jeder Seite).
5. **Suche:** Synonyme gehen nur über die Such-App.
6. **Daten:**
   - Produkttitel mit Rollenbreiten
   - Seiten ohne Meta-Beschreibung
   - uneinheitliche Florhöhen-Werte
   - Rollenware ohne Produkt-Rich-Result (Preismodell ungeklärt)
   - keine Versand- und Rückgabe-Auszeichnung
7. **Design-Konsistenz:**
   - 73 Hex-Werte in eigenen Dateien, darunter Beinahe-Dubletten.
   - Eine Token-Umstellung ist ein eigener Umbau mit Pixel-Vergleich.
8. **Startseite mobil 10.560 px:** Die Struktur gehört zu Konzept C (#186), dort wird nicht gestapelt.
9. **Sprache:** Englische Systemtexte und die Du-Form im Cookie-Banner kommen aus Store-Einstellungen.
10. **Startseite und Verlegeservice mobil schlechter als Live** (P 60/61 statt 65/66).
    - Das LCP-Element ist dort im Entwurf der Cookie-Banner-Text.
    - Die Seiten stammen aus Konzept C bzw. der Verlegeservice-Sitzung; die Ursache ist nicht abschließend geklärt.
11. **Mehrere Sitzungen in einem Theme:** Heute haben sich drei Sitzungen im Arbeits-Theme gegenseitig zurückgesetzt, anfangs auch durch dieses Programm (Voll-Pushes bis 11:55 UTC, Vorlagen um 12:33 UTC, `tp-verlegegebiet.liquid` um 13:05 UTC). Seit #22 gilt: Dreiwege-Prüfung, Dev-Theme, dateigenau.

**Entscheidungen, die nur der Inhaber treffen kann:**
1. Deploy der Kette.
2. Favicon (quadratisches Logo).
3. Shopname im Admin „TeppichParadies“ → „Teppich Paradies“ (wirkt auch in E-Mails, Checkout, Copyright).
4. Cookie-Banner kürzer bzw. als kompakte Leiste.
5. Such-Synonyme in der Such-App.
6. Florhöhen-Werte vereinheitlichen.
7. Produkttitel ohne Breiten.
8. Meta-Beschreibungen der restlichen Seiten.
9. Preisauszeichnung für Rollenware (Rich Result).
10. Verbindliche Versand- und Rückgaberegeln für die Auszeichnung.
11. Abrechnung nach cm statt aufgerundeter m² (Geschäftsregel).
12. Shop-Sprache Deutsch für Systemtexte.
13. Laden- oder Teamfoto.
14. Leisten-Produktseite, „Passendes Montagezubehör“:
    - Die Section zeigt die Kollektion „Verlegeband“, also vor allem Teppich-Verlegebänder für 149–162 €.
    - Passend wären die zwei Produkte darin für Sockelleisten (Trockenkleber-Band, Sockelklebeband).
    - Vorschlag: eine Kollektion „Leisten-Zubehör“ oder eine feste Produktauswahl in der Section. Beides ist eine Sortimentsentscheidung, die Kollektion wäre zudem storeweit.
15. Veröffentlichung von `feature/shop-qualitaet` auf GitHub. Die Menü-Sitzung wartet damit auf ihren Branch, der diese Commits enthält.

### Nachtrag (2026-09-11, abends)

- **Live-Wechsel:**
  - #174, #191 und #213 wurden zwischen 20:35 und 20:41 Uhr in `main` gemergt und um 20:45 Uhr in das Live-Theme gespielt.
  - Es ist dasselbe Theme mit neuem Inhalt, laut `live-theme.json` und Admin API (Rolle MAIN).
  - Die Live-Spalte des Schlussaudits wurde von 15:25 bis 16:03 Uhr gemessen und zeigt den Stand davor.
  - Verlegegebiet-Karte und Verlegeservice-Seite sind seitdem live. Keine Änderung dieses Programms ist live.
- **Merge-Lage:**
  - Offen sind nur noch #186 → #190 (Konzept C) und danach `feature/shop-qualitaet`.
  - Gegen `origin/main` entstehen zwei Konflikte, lokal mit `git merge-tree` gerechnet: `config/settings_schema.json` und `templates/page.verlegeservice.json`. Beide stammen aus der Konzept-C-Kette, keine Änderung dieses Programms.
  - Beim Zusammenführen die Fassungen aus `main` (#191/#213) als Grundlage nehmen und Konzept-C-Ergänzungen dreiseitig nachziehen.
- **Theme-Stand (Nachprüfung):**
  - 204168364366 ist weiter unveröffentlicht. 38 von 51 Dateien sind byte-gleich mit dem Branch, 12 davon abweichend sind Menü-Fassungen wie oben.
  - `sections/tp-verlegegebiet.liquid` ist jetzt die zusammengeführte Fassung der Verlegeservice-Sitzung. Die Seite im Entwurf enthält beides: Rollenware-Zonen mit Preisen (`data-basis`, `data-schwelle`, `data-preis`, `data-lose`) und den Organisationsnamen „Teppich Paradies“ im Service-JSON-LD.
  - Der Rückschritt durch den Push um 13:05 UTC ist damit behoben.

### Nachtrag 2: Layout-Sprung im Startseiten-Hero (#27, `23ceaee`)

- **Befund** (von der Menü-Sitzung nachgestellt): Beim kalten Laden sprang die Startseite am Desktop in 3 von 16 Aufrufen um 0,16 / 0,17 / 0,08; Live 0 von 8. Kam Inter erst nach dem ersten Bild, brach der Hero beim Schriftwechsel neu um und wurde 88 px höher.
- **Änderung:** `snippets/theme-styles-variables.liquid` bekommt eine Ersatzschrift „TP Inter Ersatz“ (lokales Arial/Helvetica) zwischen Inter und der generischen Ersatzschrift.
  - `size-adjust` ist je Schnitt am echten Startseitentext gemessen: 400 = 105,2 %, 500 = 107,2 %, 600 = 102,3 %, 700 = 95,5 %.
  - Ein gemeinsamer Wert (107,4 %) ließ die fette Überschrift 12 % zu breit.
  - Die Ersatzschrift greift nur, wenn im Theme Inter eingestellt ist. Das Endbild bleibt Inter.
- **Messung mit um 700 ms verzögerten Schriften:**

  | Viewport | vorher | erster Versuch (gemeinsamer Wert) | nachher |
  |---|---|---|---|
  | Desktop 1366 px, Entwurf | 0,33 / 0,086 / 0,33 | 0,18 | 0,013 / 0,019 / 0,013 |
  | Telefon 390 px | ~0,015 | – | 0,001 |

  Breitenverhältnis Inter : Ersatz danach 1,000 in allen vier Schnitten.
- **Gegenproben:**
  - Prüfstufe grün: Guards, `validate --static`, Theme Check ohne neue Warnung, `npm test` 154/154.
  - Dev-Theme: Prüfsumme gleich, Laufzeitprüfung 10/11 (favicon).
  - Entwurf: Prüfsumme gleich. 5 kalte Aufrufe mit 1 × 0,008 aus dem Header-Bereich (Menü-Sitzung); Live 0.

### Nachtrag 3: Konfliktauflösung für den späteren Merge nach `main`

Hinweis der Verlegeservice-Sitzung, weitergegeben von der Menü-Sitzung. Er gilt für den Merge von `feature/shop-qualitaet` bzw. der Konzept-C-Kette nach `main`:

- **`templates/page.verlegeservice.json`:**
  - `main.disabled = true` aus `main` behalten.
  - `dcfcbe8` („Hauptbereich aktivieren“) würde neben der H1 der Section `tp-verlegeservice` eine zweite H1 erzeugen, und `qa/tests/verlegeservice.test.mjs` verlangt genau eine.
  - Die Referenzgalerie aus `674a199` dreiseitig neben die `referenz`-Blöcke in `tp-verlegeservice-kontakt` setzen.
- **`config/settings_schema.json`:** Beide Gruppen behalten, „TP Verlegeservice“ aus `main` und die Gruppen der Kette.

### Nachtrag 4: Technische Punkte (2026-09-11, abends)

Alle Schritte mit Prüfstufe (Guards, `validate --static`, Theme Check ohne neue Warnung, `npm test` 154/154), eigenem Dev-Theme, Prüfsumme davor und danach, dateigenauem Push in den Entwurf.

| # | Punkt | Ergebnis | Commit |
|---|---|---|---|
| 28 | Suchfeld am Telefon öffnet die Schnellsuche | 7/7 in Dev-Theme und Entwurf (Dialog offen, Fokus im Suchfeld, 28 Vorschläge zu „teppich“, Escape schließt ohne Neuöffnen; Desktop bleibt normales Feld, Enter → Suchseite). Die Lupe im Header bleibt, weil die Suchleiste wegscrollt. | `ba543a1` |
| 29 | Feste Farbwerte durch vorhandene `--tp-`-Tokens ersetzt | 42 Stellen in 7 eigenen Dateien, `var(--tp-…, #hex)` mit altem Wert als Rückfall. Berechnete Farben und Maße von 418 Elementen vorher/nachher ohne Abweichung – in Dev-Theme und Entwurf, nachdem das neue CSS nachweislich ausgeliefert wurde. | `453ca1d` |

**Bewusst nicht umgesetzt, mit Messung:**

- **Erstes Kartenbild auf Unterkategorie-Seiten priorisieren:** Auf Klickvinyl ist das LCP-Element am Telefon ein Textabsatz, LCP rund 1,5 s gedrosselt. Kartenbilder vorzuziehen brächte nichts und nähme dem Text Bandbreite.
- **Startseite am Telefon:**
  - Im Entwurf ist der Cookie-Banner das größte Element (287 × 229 px, 16 px Schrift aus der Grundschriftgröße des Themes). Das Hero-Bild steht erst ab 737 px und zeigt im ersten Bildschirm nur 38.328 px² gegen 64.468 px² Banner.
  - Wirken würde nur, das Hero-Bild am Telefon über den Text zu stellen (rund 80.000 px² sofort sichtbar). Das ist eine Gestaltungsentscheidung zu Konzept C → Inhaber.
- **Doppeltes Filterformular:**
  - Die Handy-Kopie ist 115 KB roh, aber nur 6,8 KB gzip. Entfiele sie ganz, spart die Seite 5,5 KB Übertragung und rund 590 Elemente.
  - Dafür wäre ein Eingriff in Horizons Filterlogik nötig, die beide Formulare synchron hält. Das Risiko für die kaufentscheidenden Filter steht in keinem Verhältnis dazu.
- **Paketknöpfe** (± 38 × 44 px, Paket-Steller 32 × 32 px): `blocks/paket-auswahl.liquid` liegt im Entwurf in einer fremden Fassung (Fliesen-Reserve-Hinweis, 12:36 UTC). Befund und CSS-Vorschlag gingen an die Paketware-Sitzung, der Paket-Rechner ist geschützt.

### Nachtrag 5: Zusammenführung der drei Stränge (2026-09-12)

Vom Inhaber beauftragt: „Ja, du führst zusammen" – Menü-Branch, #186/Konzept C und `main` in einen Branch, Konflikte auflösen, im eigenen Dev-Theme testen, PR nach `main` öffnen. **Live erst nach ausdrücklicher Freigabe.** Rückholpunkt ist der Tag `vor-integration-2026-09-12` auf `80db603`.

**Merge-Reihenfolge und Konfliktentscheidungen**

| Schritt | Commit | Konflikt | Entscheidung |
|---|---|---|---|
| Menü-Branch | `2e2cdfa` | keiner | – |
| #186/#190 inkl. Konzept C | `9654fcd` | Einstiegstext in `templates/index.json` | PLZ-Text behalten („bis 50 km um Oranienburg"), gedeckt durch `tp_vs_radius_premium` = 50 und `radius: 50` der Section |
| `origin/main` | `22c8406` | `templates/index.json` | Konzept C behalten |
| | | `templates/page.verlegeservice.json` | Fassung aus `main` (eine H1, wie `qa/tests/verlegeservice.test.mjs` verlangt) |
| | | `snippets/header-drawer.liquid` | Fassung der Menü-Sitzung |
| | | `config/settings_schema.json` | **beide** Gruppen, auf 20 Gruppen geprüft („TP Firmendaten" 2 Einstellungen, „TP Verlegeservice" 31) |
| | | `sections/tp-zwei-wege.liquid` | behalten – `main` hatte die Datei gelöscht, die Konzept-C-Startseite verweist aber auf `tp_zwei_wege_home`. Entscheidung des Inhabers, nachdem ich den Widerspruch vorgelegt hatte |
| Nachlauf | `321e1c3` | – | verwaistes `snippets/tp-drawer-bildraster.liquid` entfernt, damit Theme Check wieder bei 41 Warnungen steht |
| Zweiter `main`-Stand | – | keiner | PR #211 (Neutralisierung der Bezugsquellen) konfliktfrei nachgezogen, betrifft keine Theme-Datei |

Bei `config/settings_schema.json` ging das zweimal schief, bevor es stimmte: zwei naive Verkettungen ergaben ungültiges JSON, und ein `git add` hat die Datei einmal **mit** Konfliktmarkern vorgemerkt. Erst `git checkout --merge`, dann die Konfliktregion mit Zeilennummern lesen und strukturell auflösen, geprüft mit `json.loads`.

**Prüfung im Dev-Theme 204180619598**

Vorab per `checksumMd5` gegen lokale MD5 belegt, dass der gemergte Stand im Theme liegt – sieben Dateien aus allen beteiligten Bereichen, alle byte-identisch.

| Prüflauf | Ergebnis |
|---|---|
| Kaufwege am Telefon: Paketware, Rollenware, Sockelleiste | 3/3 PASS, Warenkorb-Eigenschaften korrekt (Rollenbreite, gewünschte Länge, aufgerundete Fläche, Farbnummer) |
| Verkaufsstrecken Desktop: Paket, Rolle, Muster | 3 PASS, 0 FAIL |
| Suche Telefon und Desktop | 7/7 PASS |
| Startseiten-Reiter 390/1440 | nur aktive Liste sichtbar, kein 1080/1440-px-Bild beim Laden, Umschalten in beide Richtungen |
| Produktkarten: Startseite, Suche, zwei Produktseiten × zwei Breiten | 0 versteckte Folien, alle Karten mit Bild, 0 JS-Fehler |
| Mobiles Menü (fremder Strang) | öffnet, 7 Zweige mit Produktzahlen, Abstieg in Teppichboden zeigt 6 Unterkategorien, Zurück führt hoch, 0 JS-Fehler |
| Verlegeservice-Seite (fremder Strang) | HTTP 200, Karte rendert, PLZ-Prüfung antwortet, 22 Leistungsstufen, 0 JS-Fehler |
| Konzept-C-Startseite | 21 Sections, vier ohne Höhe – alle vier gewollt: zwei inaktive Reiter-Listen, das auf der Startseite ausgeblendete Abschluss-CTA, die fixierte Kontaktleiste |
| `dev_check` | 10/11 – der eine Fehlschlag ist der 404 auf `/favicon.ico`, ein offener Inhaberpunkt |

Gates nach dem letzten Merge: Liquid-Guard 380 Dateien 0 Fehler · Schema-Guard 228 Schemata 0 Fehler · Template-Guard 0 Fehler, 2 bekannte Drift-Warnungen · Essential-Guard 30 Pflichtdateien und alle Template-Verweise · `validate --static` WORKFLOW PASS · `npm test` 195/195 und 37/37 · `shopify theme check` 0 Fehler, 41 Warnungen (unverändert).

**Zwei eigene Irrtümer, die beim Prüfen auffielen**

- Ich habe `/pages/verlegeservice` getestet und eine 404 gemeldet. Die Seite hat den Handle `liefer-verlegeservice` mit Template-Suffix `verlegeservice` – mein Test-URL war falsch, nicht das Theme.
- Bei Theme Check habe ich `severity` als Zahl ausgewertet und daraufhin „0 Warnungen" gemeldet. Das Feld ist ein String; korrekt sind 41 Warnungen, also unverändert zum Stand vor dem Merge.

**Ergebnis:** `feature/shop-qualitaet` nach `origin` gepusht, PR #220 nach `main` offen, Aufgabe #194 auf Review. Alle 19 Theme-Dateien aus den Qualitätsarbeiten liegen byte-identisch im Entwurf 204168364366 – es musste nichts nachgeladen werden. Es ist nichts veröffentlicht worden; `workflow:preview` und `workflow:live` bleiben ungelaufen, bis der Inhaber „live stellen" sagt.

### Nachtrag 6: Checkliste für den Live-Gang von PR #220

Aus den Gegenprüfungen der drei beteiligten Sitzungen. Die Reihenfolge ist nicht beliebig.

1. **`origin/main` unmittelbar vorher erneut prüfen.** Am 2026-09-12 war main zweimal weitergelaufen, nachdem ich es gemergt hatte — beide Male nur der Dashboard-Bot, aber die Prüfung gehört vor jeden Schritt, nicht einmal pro Tag: `git merge-base --is-ancestor origin/main HEAD`.
2. **Theme-Rolle aus der Quelle lesen**, nicht aus einer Meldung: `themes(first: 20)`, live ist `role: MAIN`.
   Genau das hat sich am 2026-09-12 um 07:31:40Z geändert: Die Verlegeservice-Sitzung hat ihre Korrektur live gestellt, seitdem ist **Preview Gallery V3** (203558781262) das Live-Theme; das vorherige preview-main-2026-09-04 (203690246478) ist wieder `UNPUBLISHED` und dient als Rückfallpunkt. `domains/shopify/live-theme.json` führt beide korrekt, der Guard ist grün. Eine frühere Fassung dieser Checkliste nannte noch die alte ID — sie stand keine zwei Stunden, und genau deshalb steht hier „aus der Quelle lesen" und nicht eine Nummer zum Abschreiben.
3. **PR #220 nach `main`**, dann `npm run workflow:doctor`, dann `preview`, dann `live`. Kein Gate umbauen.
4. **Erst das Theme live, dann das Menü.** Der Menüpunkt „Unsere Arbeit" führt so lange auf die B2B-Rückfallseite, wie `templates/page.unsere-arbeit.json` nicht im Live-Theme liegt (Ursache: fehlender Template-Suffix fällt auf `page.json`). Also: Theme live → `menuUpdate` auf `main-menu` nach `domains/shopify/menu-vorlage-unsere-arbeit.md` → Gegenprobe über die **Menge der MenuItem-IDs** vorher/nachher, nicht über `userErrors: []`.
5. **Bildkacheln**: beide liegen seit `ecb3126`/`c62489b` im Repository (`tp_kachel_service_liefer`, `tp_kachel_service_arbeit`) und werden von der Deploy-Kette mitgetragen. Sie gehören unter `sections.header_section.blocks` und `block_order`, **nicht** verschachtelt unter `header-menu` — dort würde `content_for 'blocks'` sie nie ausgeben (Korrektur der Galerie-Sitzung an meiner Vorlage, PR #223). Der verbreitete Satz „die Kacheln hängen am Ziel-Theme" gilt nur für Handänderungen im Theme-Editor — `sections/header-group.json` ist eine Repository-Datei. Nach dem Preview-Schritt trotzdem gegenprüfen, dass im Megamenü kein Buchstabe statt eines Bildes steht.
6. **Kollektion „Vinylboden – Fischgrät"** ist laut Menü-Sitzung am 2026-09-12 um 06:50 UTC im Kanal Onlineshop veröffentlicht. Beim Live-Gang nur nachprüfen, nicht erneut ändern — storeweit.
7. **Theme-Check-Baseline**: `qa/theme-check-baseline.json` enthält seit PR #222 einen Eintrag für die `tp-lh`-Kollision. Sie ist mit `0ec8fcf` behoben, der Eintrag also gegenstandslos. Er darf erst entfernt werden, **nachdem** #220 in `main` ist — vorher würde der Befund beim nächsten Lauf als neu gelten und das nächste Gate blockieren. Danach neu erzeugen: 41 → 40 Warnungen.
8. **Favicon** fehlt weiter (404 auf `/favicon.ico`), Entscheidung des Inhabers. Kein Blocker, aber der einzige offene Punkt aus den Laufzeitprüfungen.

**Eine Freigabe wird nicht weitergeleitet.** Drei Sitzungen haben gemeldet, der Inhaber habe den Live-Gang in ihrer Sitzung freigegeben — korrekt jeweils als Information gekennzeichnet. Für `workflow:live` braucht die ausführende Sitzung das Wort des Inhabers in ihrem eigenen Verlauf. Bis dahin bleibt es bei PR und Entwurf.

### Nachtrag 7: Abnahmen der beteiligten Sitzungen

Fremde Messungen, als solche gekennzeichnet — nicht meine eigenen. Sie decken Bereiche ab, die ich bewusst nicht selbst geprüft habe, weil sie mir fachlich nicht gehören.

| Sitzung | Geprüft | Ergebnis |
|---|---|---|
| Menü | Dev-Theme 204180619598, frisches Profil je Breite: 375 px (Zweige, Bodenleisten-Panel mit 3 Gruppen/6 Chips, Zurück-Weg, Kontakt-Panel, Chip-Sprung landet beim Raster, Oberkante 88 px) · 768×1024 und 1024×768 (Drawer-Modus, genau eine Lupe, Kopfhöhe 60 px, 13 Trefferflächen alle ≥ 44 px) · 1366 px (alle 7 Untermenüs öffnen und liegen oben, per `elementFromPoint` belegt; Bilder 7/7, 4/4, 6/6, 1/1, 8/8, 5/5, 3/3) · Raster 390/768/820/1024 zweispaltig, 1366 dreispaltig, nirgends Überbreite | kein Befund offen; 15/15 Menü-Dateien byte-gleich mit dem Branch |
| Galerie | alle acht #186-Commits als Vorfahren, Galerie-Dateien inhaltsgleich, `menu-vorlage-unsere-arbeit.md` byte-gleich | #186 geschlossen mit Verweis auf #220; ein fehlender Doku-Commit nachgezogen |
| Verlegeservice | `page.verlegeservice.json` mit `main.disabled = true`, 20 Einstellungsgruppen, `tp-verlegegebiet.liquid` = 7e0b566d, keine Pauschalversprechen in den Verlegetexten | passt, keine Rückfälle |

Die Menü-Sitzung bestätigt dabei unabhängig meinen Konsolen-Befund: `401 sf_private_access_tokens` und `404 favicon` treten auch ohne diese Änderungen auf — Plattformmeldungen, keine Regression.

Die Menü-Sitzung hat ihre Abnahme am 2026-09-12 auf `e8f1f55` wiederholt und damit auch die zweite Bildkachel `c62489b` eingeschlossen: bei 375 px alle sieben Zeilen mit Bild oder Symbol, bei 1366 px Service-Panel mit 5 von 5 Bildern, weiterhin genau 7 Hauptpunkte, „Unsere Arbeit" taucht nirgends auf — die Kachel ist also belegt wirkungslos, solange der Menüpunkt fehlt.

**Zur Prüfmethode:** Die Menü-Sitzung meldete kurzzeitig eine Abweichung bei `sections/header-group.json` und führte sie auf einen Kommentarkopf zurück, den Shopify voranstellt. Nachgeprüft: Der Kopf erscheint in `body.content` der Admin API, **nicht** in `checksumMd5` und nicht in `size`. Für dieselbe Datei gilt lokal 15.918 Byte und MD5 `1c9f0768…`, im Theme `size` 15.918 und `checksumMd5` `1c9f0768…` — mit Kopf wären es 16.281 Byte. Der Abgleich `checksumMd5` gegen `md5 -q` bleibt also gültig und ist weiterhin der richtige Weg; nur wer `body.content` vergleicht, muss den Kopf abziehen.

### Nachtrag 8: Offener Befund – `sizes` der Megamenü-Bilder rechnet mit sechs Spalten

Gemeldet von der Menü-Sitzung (Karte 241 px breit, geladene Stufe 197 px), von mir nachgemessen und dabei als breiter bestätigt: Die `sizes`-Angabe kommt aus Horizons `util-mega-menu-img-sizes-attr` und teilt die Inhaltsbreite immer durch **sechs**, unabhängig davon, wie viele Karten das Panel tatsächlich zeigt. Bei 1366 px ergibt das `(1366 − 180) / 6 ≈ 197 px` für jedes Panel.

| Panel | Karten | dargestellt bei 1366 px | geladen (Messung Menü-Sitzung) | Faktor | laut `sizes` |
|---|---|---|---|---|---|
| Teppichboden | 7 | 305 px | 200 px | 1,53× | 197 px |
| Zubehör | 8 | 305 px | 200 px | 1,53× | 197 px |
| Service & Verlegung | 5 | 239 px | 200 px | 1,21× | 197 px |
| Linoleum | 6 | 198 px | 200 px | 0,99× | 197 px |

Der Browser wählt die 200er-Stufe aus dem `srcset` (`snippets/tp-menu-bild.liquid`: 200/300/400/600/800) und skaliert sie hoch; bei DPR 2 liegt der Bedarf bei 490 bis 646 px.

**Korrektur meiner ersten Fassung:** Das Vinyl-Panel gehört *nicht* dazu. Es rendert `snippets/tp-vinyl-nav.liquid` mit eigener `sizes`-Angabe und lädt größer als die Karte (Faktor 0,76). Betroffen sind nur die Panels aus dem Horizon-Zweig von `mega-menu-list.liquid`. Danke an die Menü-Sitzung für den Hinweis — und für die geladenen Stufen, die meiner Messung fehlten, weil `naturalWidth` bei mir noch nicht dekodiert war.

**Eine zunächst offene Frage, inzwischen geklärt:** Die Menü-Sitzung maß bei 1440 px, dass der Browser die 300er-Stufe anfordert, `naturalWidth` aber 210 zurückgibt, und schloss daraus auf zu kleine Quellbilder. Ich habe die Quellbilder abgefragt und die These widerlegt — „Alle Teppichböden" 1248 × 832, „Alles Zubehör" 1590 × 1067, „Alle Vinylböden" 1024 × 1024, „Linoleumboden" 1113 × 1590. Die Menü-Sitzung hat daraufhin die echte Ursache gefunden, und sie liegt im Messwerkzeug, nicht in den Daten:

> Bei einem `srcset` mit `w`-Deskriptoren meldet `naturalWidth` die **dichtekorrigierte** Breite, nicht die Pixelbreite der Datei. Die Dichte ist Kandidatenbreite geteilt durch den aufgelösten `sizes`-Wert. Bei 1440 px: 300 / (300 / 210) = 210 — und 210 ist genau `(1440 − 80 − 100) / 6`. Gegenprobe bei 1366 px: `(1366 − 80 − 100) / 6 = 197,7`, gemessen wurden 197. Zwei unabhängige Punkte, derselbe Mechanismus. Die Datei selbst liefert unter derselben Adresse tatsächlich 300 × 408 Pixel.

**Für künftige Messungen gilt daher: `currentSrc` auswerten, nicht `naturalWidth`.** Und die Folgerung für den Befund: Die Quellbilder sind groß genug, die geladene Stufe ist wirklich 200 beziehungsweise 300 px, die Karte 307 beziehungsweise 325 px breit. Eine `sizes`-Korrektur ist damit der richtige und ausreichende Hebel — sie war es die ganze Zeit.

**Nicht umgesetzt, bewusst.** Drei Gründe, in dieser Reihenfolge:

1. Der Befund ist **kein Byte-Problem, sondern ein Schärfe-Problem.** Eine Korrektur lädt größere Bilder, erhöht also die Übertragung. Ob unscharfe Menübilder oder mehr Bytes schlechter sind, ist eine Gestaltungsabwägung — die gehört nicht in eine Performance-Optimierung hineingeschmuggelt.
2. Die Datei `snippets/mega-menu-list.liquid` und der Helfer sind Horizon-Kern beziehungsweise Gebiet der Menü-Sitzung, nicht meines.
3. Das Paket ist von allen drei beteiligten Sitzungen abgenommen und wartet nur noch auf die Freigabe des Inhabers. Eine Änderung jetzt würde diese Abnahme entwerten. Ein neuer Schritt gehört hinter das Release, nicht davor.

Die Bilder sind `loading="lazy"` mit `fetchpriority="low"` und laden erst bei der ersten Menüabsicht — der Befund trifft also niemanden beim Seitenaufbau.
