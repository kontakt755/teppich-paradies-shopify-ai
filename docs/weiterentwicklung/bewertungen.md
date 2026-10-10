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
  aus der Theme-Einstellung „TP Google-Bewertung“ mit Link zum Google-Profil.
  `npm run bewertung:guard` verhindert abweichende Werte in Vorlagen. Das bleibt
  unverändert und ist **keine** Produktbewertung.

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
