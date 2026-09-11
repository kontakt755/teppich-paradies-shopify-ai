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
