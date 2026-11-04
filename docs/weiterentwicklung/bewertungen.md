# Produktbewertungen mit Sternen

> **Entscheidung 2026-10-08:** keine Bewertungs-App. Die Google-Unternehmensbewertung bleibt das
> Vertrauenssignal (Block `tp-bewertungsbeleg`). Grund: rund 22 bezahlte Online-Bestellungen in
> 90 Tagen auf ~1.290 Produkte – Produktbewertungen kämen zu langsam, um zu wirken. Die
> Sterne-Darstellung (`tp-sterne`, `tp-produkt-sterne`, `tp-card-sterne`, `aggregateRating`) bleibt
> im Theme und zeigt ohne `reviews.*`-Daten nichts; eine App lässt sich später nachrüsten.

Teil von `SHOPIFY_WEITERENTWICKLUNG.md` (Phase 6). Stand 2026-10-08.

## 1. Ist-Zustand (geprüft)

- **Keine Bewertungs-App aktiv.** Die Live-Konfiguration (`config/settings_data.json` des
  Live-Themes, 2026-10-08) enthält genau eine App-Einbettung: Options Price Calculator.
  Keine Produkt-Metafelddefinition `reviews.rating` / `reviews.rating_count`.
- **Strukturierte Daten:** Produktseiten geben `ProductGroup`/`Product`/`Offer` aus
  (`snippets/tp-product-structured-data.liquid`), **kein** `aggregateRating`, kein `Review`.
  Die Startseite gibt `Organization` aus, ebenfalls bewusst ohne `aggregateRating`
  (`sections/header.liquid`: fremde Google-Bewertungen als eigene auszuzeichnen verstößt
  gegen die Google-Richtlinien).
- **Google-Unternehmensbewertung:** `blocks/tp-bewertungsbeleg.liquid` zeigt Note und Anzahl
  aus dem Shop-Metafeld `custom.google_bewertung` (seit 2026-11 monatlich per
  `scripts/google-bewertung.mjs`, Ablauf in `operations/README.md`), ohne Metafeld aus der
  Theme-Einstellung „TP Google-Bewertung“, mit Link zum Google-Profil.
  `npm run bewertung:guard` verhindert abweichende Werte in Vorlagen. Das bleibt
  unverändert und ist **keine** Produktbewertung. Seit 2026-11-04 steht der Block in allen
  Produktvorlagen oben in der Produktspalte (Inhaber): ab 750 px direkt unter Titel und Preis, am
  Telefon direkt unter der Galerie, weil dort nur Titel, Preis und Aktionshinweis vor den Bildern
  stehen (`snippets/product-information-content.liquid`). Direkt zum Preis gehörende Angaben
  (Aktionshinweis, Kurzinfo der Leisten) stehen davor.
- **Beschriftung „Shopbewertung bei Google“** bleibt Pflicht, gerade an dieser Stelle: Das LG
  Frankfurt (2-06 O 133/26, laut Fachbeitrag Plutte) beanstandete Sterne einer Gesamtbewertung
  direkt unter Produktbildern, weil Kunden nicht erkennen konnten, was bewertet wurde. Der Fall lag
  anders (Marktplatz, keine Kennzeichnung genannt), entscheidend bleibt der Gesamteindruck.
- **Hinweis nach § 5b Abs. 3 UWG** (`snippets/tp-bewertungshinweis.liquid`): Auf Produktseiten
  entfällt seit 2026-11-04 der Satz zur Quelle, weil „bei Google“ direkt daneben steht. Der Satz,
  dass nicht geprüft wird, bleibt sichtbar beim Block. Nicht einklappen und nicht auf eine andere
  Seite verlegen: Das LG Frankfurt (3-10 O 103/24) ließ einen aufklappbaren Hinweis unter unklarer
  Bezeichnung nicht genügen, das OLG Frankfurt (6 U 305/25) wies die Berufung zurück. Auch eine
  reine Durchschnittsnote zählt als Bewertung (LG Karlsruhe 14 O 41/25 KfH, Volltext gelesen, dort
  eigene Produktsterne). Die Angabe der Plattform allein genügt laut Fachbeitrag Plutte zu OLG
  Koblenz 9 U 1015/25 ebenfalls nicht. Stand: Frankfurt und Koblenz nur aus Fachbeiträgen, keine
  anwaltliche Prüfung.
- **Jede Stelle mit Note oder Bewertungen trägt den Hinweis** (Inhaber 2026-11-04): direkt an der
  Note und in Kurzform im Startseiten-Hero, im Vertrauensstreifen (Serviceseiten, Kontakt) und in der
  Kampagne (Kategorie Teppichboden, Markenkategorien). Beim Bewertungs-Widget steht er mit beiden
  Sätzen vor den Bewertungen, weil oben im Widget die Note steht; auf den Serviceseiten erst, wenn das
  Widget geladen ist. `npm run bewertung:guard` meldet Liquid, das die Note liest oder das Widget
  einbindet und den Hinweis nicht rendert.
- **Keine Aussage, die eine Prüfung behauptet** (Inhaber 2026-11-04, UWG Anhang Nr. 23b, keine
  anwaltliche Prüfung): Das Abzeichen „Verifizierter Kunde“ des Widgets ist im Theme ausgeblendet
  (`snippets/tp-bewertungshinweis.liquid`), Texte wie „echte Kunden“, „echte Rezensionen“ und „echte
  Erfahrungen“ sind entfernt. Der `bewertung:guard` meldet solche Aussagen. Die Überschrift im Widget
  kommt aus der Einstellung beim Anbieter und steht nicht im Repository.

## 2. Anforderungen (aus dem Auftrag)

Sterne unter dem Produktnamen (Ø-Note + Anzahl), Bewertungsbereich weiter unten, echte
Kundenbewertungen; auf Karten kompakte Sterne. Keine erfundenen Bewertungen, keine Sterne
ohne Bewertungen, keine Übernahme aus Google, Moderation, Spam-Schutz, Bewertung nach
echtem Kauf, Import echter Altbewertungen, Datenschutz, Ladezeit, gültiges JSON-LD ohne
Dubletten.

## 3. Optionen

| | A: Judge.me „Forever Free“ | B: Eigenbau (Metaobjekte) | C: kostenpflichtige App (Loox, Okendo, Yotpo …) |
|---|---|---|---|
| Kosten | 0 € (Bezahlplan ab 15 $/Monat, nicht nötig) | 0 € | 10–100+ €/Monat |
| Bewertung nach Kauf | automatische Anfrage-Mail nach Bestellung; „verifizierter Käufer“ | manuell: Mitarbeiter prüft Bestellnummer | ja |
| Moderation, Spam | Freigabe-Warteschlange, Filter | vollständig manuell | ja |
| Import Altbewertungen | CSV-Import | manuell | ja |
| Schreibt `reviews.rating` / `reviews.rating_count` (Shopify-Standard) | ja | ja (eigener Abgleich) | meist ja |
| Ladezeit | Widget-Skript der App (asynchron); Sterne kann das Theme selbst aus Metafeldern rendern → kein App-Skript auf Kollektionsseiten nötig | kein Fremdskript | App-Skripte |
| Datenschutz | Drittanbieter verarbeitet Name/E-Mail der Käufer → Datenschutzerklärung ergänzen, AV-Vertrag | alles in Shopify | Drittanbieter |
| Aufwand | klein | groß (Formular, Prüfung, Mails) | klein |

**Empfehlung: A (Judge.me Forever Free), aber Darstellung und JSON-LD aus dem eigenen Theme.**

- Das Theme liest nur die Shopify-Standardfelder `reviews.rating` und `reviews.rating_count`.
  Damit ist die Darstellung unabhängig von der App (Wechsel jederzeit möglich), und auf
  Kollektionsseiten lädt kein App-Skript.
- Das Bewertungs-Widget (Liste + Formular) auf der Produktseite kommt als App-Block.
- **In der App ausschalten:** eigene Rich Snippets/JSON-LD (sonst Dublette zum Theme),
  „Google reviews sync“ und Shop-/Unternehmensbewertungen im Produktwidget (sonst
  landen Google-Unternehmensbewertungen bei Produkten – ausdrücklich verboten).
- Installation ist kostenlos, aber eine App-Installation mit Kundendaten und eine Änderung
  der Datenschutzerklärung (Rechtstext) → **Freigabe des Inhabers nötig**.

## 4. Theme-Umsetzung (geplant für Phase 6)

| Datei | Zweck |
|---|---|
| `snippets/tp-sterne.liquid` | rendert Sterne + „4,8 (12 Bewertungen)“ aus `reviews.rating`/`rating_count`; **nichts**, wenn keine Bewertung vorliegt |
| `blocks/tp-produkt-sterne.liquid` | Block unter dem H1 der Produktseite, Klick springt zum Bewertungsbereich (`#bewertungen`) |
| `blocks/tp-card-sterne.liquid` | kompakte Sterne auf Produktkarten |
| `snippets/tp-product-structured-data.liquid` | ergänzt `aggregateRating` am `ProductGroup` **nur** bei `rating_count > 0` |

Die Blöcke werden so gebaut, dass sie ohne Daten nichts ausgeben; sie können deshalb vor der
App-Installation in die Vorlagen und schalten sich mit der ersten echten Bewertung ein.

## 5. Tests (nach Installation)

- Produkt ohne Bewertung: keine Sterne, kein `aggregateRating` (Rich-Results-Test).
- Produkt mit Testbewertung im Entwicklungstheme: Sterne unter Titel, Karte, JSON-LD genau
  einmal `aggregateRating`, Werte = Metafelder.
- Lighthouse vorher/nachher (`npm run lighthouse:messen`) für eine Produkt- und eine
  Kollektionsseite.
