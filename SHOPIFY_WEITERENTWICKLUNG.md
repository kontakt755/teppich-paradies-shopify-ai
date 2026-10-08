# Shopify-Weiterentwicklung Oktober 2026

Sonderposten · Ladenverkauf · Produktbewertungen · Bildverwaltung · Menüpunkt „Angebote“.
Ziel: alles bis Ende Oktober 2026 umgesetzt und getestet. **Nichts geht ohne ausdrückliche
Freigabe des Inhabers live.**

Branch `feature/weiterentwicklung-sonderposten` · Worktree `.claude/worktrees/weiterentwicklung`
· Detailkonzepte unter `docs/weiterentwicklung/`.

---

## 1. Aktueller Projektstand (2026-10-08)

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Shop analysieren | **abgeschlossen** |
| 2 | Theme-Kopie und Testumgebung | **abgeschlossen** |
| 3 | Technisches Umsetzungskonzept | **abgeschlossen** (`docs/weiterentwicklung/*.md`) |
| 4 | Sonderposten-Produktstruktur | **Theme fertig und in der Entwicklungskopie**; Shopify-Daten (Metafelder, Vorlage-Produkt, Kollektion) warten auf Freigabe |
| 5 | Ladenverkauf | Konzept + Bewertung fertig; Umsetzung (Control-Center-Button) nach Phase-4-Test |
| 6 | Produktbewertungen | Konzept fertig; App-Entscheidung beim Inhaber |
| 7 | Bildverwaltung und Bildrechte | Konzept fertig; Speicherort und Lizenzen beim Inhaber |
| 8 | Menüpunkt „Angebote“ | Konzept fertig |
| 9 | Gesamttest | offen |
| 10 | Veröffentlichung vorbereiten | offen |

## 2. Abgeschlossene Aufgaben

**Phase 1 – Analyse** (nur lesend, Admin API + Repository + öffentlicher Shop)
- Shop: Plan **Basic**, EUR, **ein** Standort „Saarlandstraße 73“ (Oranienburg), Kanäle Onlineshop,
  Shop, Point of Sale, Google & YouTube, Facebook & Instagram.
- Live-Theme per Abfrage belegt (`role: MAIN`) = Eintrag `live` in `domains/shopify/live-theme.json`.
- Hauptmenü `main-menu` wird vom Horizon-Header gerendert (`sections/header-group.json`, Block
  `_header-menu`); in der Live-Konfiguration ist als App-Einbettung nur der Options Price
  Calculator aktiv.
- **Bestand wird nirgends geführt** (Varianten `tracked: false`). Sonderposten wären die ersten
  Artikel mit Bestandsführung.
- **Abholung im Laden ist nicht eingerichtet** (`localPickupSettingsV2` leer); drei Versandprofile.
- Keine Bewertungs-App, kein `aggregateRating`/`Review`-Markup (bewusst, siehe `bewertungen.md`).
- Aktionssystem vorhanden: `aktion.*`-Metafelder, `tp_aktion`-Metaobjekt, `tp-rabatt-sichtbar`,
  vier Smart-Kollektionen „Angebote …“ (Startseite, nicht Menü).
- Bilder: nur Shopify-CDN, keine Originalablage, kein Rechteverzeichnis (Stichprobe in `bilder.md`).
- SumUp-API: Transaktionen abrufbar, aber ohne SKU; keine Kassen-Webhooks (`sonderposten.md` §6).

**Phase 2 – Testumgebung**
- Neues unveröffentlichtes Theme per `themeDuplicate` des Live-Themes, eingetragen als
  `entwicklung` in `domains/shopify/live-theme.json` (die ID steht nur dort). Enthält auch
  `config/settings_data.json` – also exakt die Live-Einstellungen vom 2026-10-08.
- Sicherungen: `docs/weiterentwicklung/sicherung/` (Hauptmenü mit allen IDs, 46 Smart-Kollektionen)
  und lokal `~/teppich-paradies-analyse/sicherungen/2026-10-08-weiterentwicklung/`
  (settings_data, header-/footer-group).

**Phase 3 – Konzept:** `sonderposten.md`, `bewertungen.md`, `bilder.md`, `angebote.md`.

**Phase 4 – Theme-Teil Sonderposten** (in der Entwicklungskopie, nicht live): siehe §6.

## 3. Entwicklungsumgebung – was sie kann und was nicht

| Bereich | In der Theme-Kopie isoliert testbar? | Warum |
|---|---|---|
| Theme-Code, Vorlagen, Blöcke, CSS, JSON-LD | **ja** | Vorschau `?preview_theme_id=<entwicklung>`, Live bleibt unberührt |
| Theme-Einstellungen | **ja** | eigene `settings_data.json` in der Kopie |
| Produkte, Varianten, Preise, Bestand | **nein** | Shop-Daten sind für alle Themes gleich – ein Testprodukt ist ein echtes Produkt |
| Metafeld-/Metaobjekt-Definitionen | **nein** | shopweit; neue Definitionen sind aber unsichtbar, solange kein Theme sie ausgibt |
| Kollektionen | **nein** | shopweit; eine nicht veröffentlichte Kollektion ist im Shop unsichtbar |
| Navigation (Menüs) | **nein** | shopweit; ein *neues* Menü ist unsichtbar, solange kein Live-Header es nutzt |
| Rabatte, Versandprofile, Abholung | **nein** | wirken sofort im Checkout |
| Apps (Bewertungen) | **nein** | App-Installation gilt für den Shop; App-Blöcke lassen sich aber nur in der Kopie platzieren |
| Bestellung/Checkout | **nein** | jede Bestellung ist echt – keine Testbestellungen ohne Testmodus |

Eine vollständige zweite Testumgebung inkl. Daten wäre ein **Entwicklungsshop** (Partner-Konto,
kostenlos, Daten per Export/Import) – lohnt sich nur, falls Checkout-/Versandlogik getestet werden
muss. Für diese fünf Funktionen genügt: Theme-Kopie + klar markierte, nicht veröffentlichte
Testdaten (Entwurf, keine Vertriebskanäle, Titel „TEST …“) + Freigabe vor jedem Schreibvorgang.

## 4. Aufgaben in Bearbeitung / nächste Freigaben

Diese Schreibvorgänge in Shopify sind nötig, um Phase 4 zu testen. Alle sind umkehrbar, keiner
ändert Preise, Varianten oder SKUs bestehender Produkte, keiner ist im Live-Theme sichtbar:

1. **Metafeld-Definitionen** `sonderposten.*` anlegen (14 Felder, `sonderposten.md` §3).
2. **Vorlage-Produkt** „VORLAGE Sonderposten – nicht veröffentlichen“ (Entwurf, keine Kanäle).
3. **Testprodukt** „TEST Reststück – nicht kaufen“: Typ Sonderposten, Bestand 1, Vorlage
   `sonderposten`. Für die Vorschau kurz im Onlineshop-Kanal veröffentlicht, aber
   `seo.hidden`, in keiner Kollektion außer der unveröffentlichten Sonderposten-Kollektion,
   nicht im Google-Kanal; nach dem Test wieder Entwurf.
4. **Smart-Kollektion** „Reste & Sonderposten“ (`reste-sonderposten`), zunächst **nicht**
   veröffentlicht.

## 5. Noch offene Aufgaben

- Phase 4: Test mit echten Daten (Desktop, 390 px, Warenkorb max. 1, Bestand 0 → Verkauft,
  Kollektion leert sich), danach Vorlage-Produkt.
- Phase 5: Control-Center „Sonderposten“ + „Im Laden verkauft“ (`sonderposten.md` §6).
- Phase 6: Sterne-Snippet/-Blöcke + `aggregateRating` (nur mit Daten), App nach Freigabe.
- Phase 7: Bildrechte-Erstbefüllung (Skript, nur lesend) + Dashboard-Liste.
- Phase 8: Abgleich-Skript `angebote:abgleich`, Kollektion `angebote`, Menü-Sicherung im Theme.
- Phase 9/10: Gesamttest, Deploy-Kette (`workflow:doctor` → PR → `main` → Preview → Live).

**Entscheidungen des Inhabers** (blockieren die jeweilige Phase, nicht die anderen):

| # | Frage | Empfehlung |
|---|---|---|
| E1 | Freigabe der vier Schreibvorgänge in §4 | ja |
| E2 | Vergleichspreis bei Reststücken („statt regulär 25,90 €/m² × Fläche“) zeigen? | nur mit Beleg (umgesetzt); rechtlich sicherer: keinen |
| E3 | Abholung am Standort aktivieren + Versandprofil „Sonderposten – nur Abholung“ | ja, vor dem ersten echten Sonderposten |
| E4 | Welche SumUp-Lösung läuft im Laden (App / Kassensystem Lite / Pro)? | Auskunft nötig für Weg C |
| E5 | Dashboard-Zugang: Recht `write_inventory` ergänzen (Inhaber selbst) | ja, für Weg B |
| E6 | Judge.me Forever Free installieren (0 €) + Datenschutzerklärung ergänzen | ja |
| E7 | Speicherort Bildarchiv + Lizenzunterlagen je Lieferant | Inhaber |
| E8 | Menüpunkte „Angebote“ und „Reste & Sonderposten“ ins Hauptmenü (unsichtbar, bis Inhalt da ist) | ja |

## 6. Technische Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Sonderposten = eigenes Produkt je Stück, Typ `Sonderposten`, eine Variante, Bestand 1, „nicht überverkaufen“ | hält Stückware aus Rollen-/Paket-/Raummaß-Logik, Kategorie-Kollektionen und Flächen-Feed heraus |
| Erkennung nur über `snippets/tp-ist-sonderposten.liquid` | eine Quelle, wie `tp-verkaufseinheit` |
| `tp-verkaufseinheit` liefert für Sonderposten immer `einzel` | auch wenn Tags/Metafelder vom Ursprungsprodukt kopiert wurden |
| Kein Mengenfeld, Warenkorb max. 1 | „nicht versehentlich mehr bestellen“; serverseitig sperrt der Bestand |
| Streichpreis nur mit `sonderposten.preis_beleg` | AGENTS.md: Streichpreise nur mit belegtem Vorpreis |
| `itemCondition` aus `sonderposten.zustand` | B-Ware/Ausstellungsstück nicht als „neu“ auszeichnen |
| Ladenverkauf über Control Center (Weg B), SumUp nur als späteres Sicherheitsnetz | SumUp-API ohne SKU; vorhandene Anmeldung/Rollen/Protokoll; 0 € |
| Bewertungen: Theme rendert aus `reviews.*`-Standardfeldern, App nur für Sammeln/Moderation | App austauschbar, kein App-Skript auf Kollektionsseiten, ein JSON-LD |
| Angebote über Tag + Abgleich-Skript + Theme-Sicherung | Smart-Kollektionen kennen kein Datum; Menü darf nie falsch „an“ sein |

## 7. Geänderte Dateien (Branch)

| Datei | Änderung |
|---|---|
| `snippets/tp-ist-sonderposten.liquid` | neu – ist das Produkt ein Sonderposten |
| `snippets/tp-sonderposten-flaeche.liquid` | neu – Fläche aus Metafeld oder Breite × Länge |
| `snippets/tp-zahl-de.liquid` | neu – „4,00“-Formatierung |
| `blocks/tp-sonderposten-daten.liquid` | neu – Produktseite: Art, Verfügbarkeit, Maße, Stückpreis, €/m², Ersparnis, Zustand, Herkunft, Abholung |
| `blocks/tp-card-sonderposten.liquid` | neu – Kartenzeile „Reststück · 4,00 × 2,35 m (9,40 m²)“ + €/m² |
| `templates/product.sonderposten.json` | neu – Produktvorlage |
| `templates/collection.sonderposten.json` | neu – Kollektionsvorlage |
| `templates/search.json` | Kartenzeile Sonderposten in Suchergebnissen |
| `blocks/buy-buttons.liquid` | Sonderposten: kein Mengenfeld, Hinweis „liegt bereits im Warenkorb“ |
| `snippets/cart-products.liquid` | Sonderposten: Mengenfeld im Warenkorb max. 1 |
| `blocks/_product-card-gallery.liquid` | Sonderposten: „Verkauft“ statt „Ausverkauft“ |
| `snippets/tp-rabatt-sichtbar.liquid` | Weg 3: Sonderposten-Streichpreis nur mit Beleg |
| `snippets/tp-verkaufseinheit.liquid` | Sonderposten immer `einzel` |
| `snippets/tp-product-structured-data.liquid` | `itemCondition` für Sonderposten aus Zustand |
| `domains/shopify/live-theme.json` | Eintrag `entwicklung` |
| `SHOPIFY_WEITERENTWICKLUNG.md`, `docs/weiterentwicklung/**` | Dokumentation, Sicherung |

Alle geänderten Bestandsdateien verhalten sich für Nicht-Sonderposten unverändert (Bedingung
ist immer `tp-ist-sonderposten`).

## 8. Testergebnisse

| Test | Ergebnis |
|---|---|
| `liquid:guard`, `schema:guard`, `template:guard`, `theme:guard` | 0 Fehler (template:guard: 5 bekannte Drift-Warnungen, eine davon neu: `tp-card-sonderposten` nur in der Sonderposten-Vorlage, gewollt) |
| `shopify theme check` (geänderte Dateien) | keine Fehler; 1 Hinweis `ValidScopedCSSClass` (Klasse im Block-Stylesheet definiert, gleiches Muster wie bestehende Klasse) |
| Push nur der geänderten Dateien in die Entwicklungskopie | ok, Rolle danach weiterhin `unpublished` |
| Rauchtest Entwicklungskopie: Start, 4 Kollektionen, Suche, Warenkorb, Produkt, `?view=sonderposten` | alle HTTP 200, gerendertes Theme = Entwicklungskopie, 0 Liquid-Fehler |
| Regression Leiste + Zubehör: Mengenfeld, `itemCondition` | identisch zu Live |
| Angebots-Kollektionen live (Seite 1) | jede Karte mit sichtbarem Streichpreis – heute konsistent |
| Sonderposten mit echten Daten | **offen** – braucht Freigabe E1 |

## 9. Erkannte Probleme

1. Abholung im Laden nicht eingerichtet → ohne E3 dürfen Sonderposten nicht online verkauft werden.
2. Basic-Plan: 2 Mitarbeiterkonten – Nachvollziehbarkeit „wer“ deshalb über die Control-Center-Anmeldung.
3. Angebots-Kollektionen „Preis reduziert“ können zwischen `aktion.ende` und Preis-Rückstellung
   Produkte ohne sichtbaren Rabatt enthalten (nächster Termin: Dauerrabatt-Ende 01.11. →
   Rückstellung 02.11.). Wird mit Phase 8 abgesichert.
4. 37 % der Stichprobenbilder < 1200 px breit; uneinheitliche Dateinamen.
5. Der CLI-Zugang darf keine Menüs und keine Metaobjekte lesen (Menü-Sicherung deshalb über die Admin API).

## 10. Rollback

| Was | Rückweg |
|---|---|
| Theme-Code | Live ist unberührt. Entwicklungskopie verwerfen oder Branch nicht mergen. Nach einem späteren Livegang: `workflow:live` mit dem vorherigen `main`-Stand bzw. Fallback-Theme aus `live-theme.json` |
| Theme-Einstellungen | Sicherung lokal (§2) in ein unveröffentlichtes Theme pushen, vergleichen, dann regulär deployen |
| Metafeld-Definitionen `sonderposten.*` | `metafieldDefinitionDelete` (nur solange keine Werte gebraucht werden) |
| Test-/Vorlage-Produkt | auf Entwurf/Archiv setzen (nicht löschen) |
| Kollektion „Reste & Sonderposten“ / „Angebote“ | Veröffentlichung zurücknehmen |
| Menüpunkte | `menuUpdate` mit `docs/weiterentwicklung/sicherung/2026-10-08-hauptmenue.json` (ganzer Baum, ID-Gegenprobe) |
| Tags `angebot` | Abgleich-Skript im Modus `--entfernen` |
| Bewertungs-App | deinstallieren; Theme zeigt ohne `reviews.*` nichts mehr an |

## 11. Nächster Arbeitsschritt

Nach Freigabe E1: Metafeld-Definitionen anlegen → Testprodukt → Kollektion (unveröffentlicht) →
Phase-4-Tests in der Entwicklungskopie (Desktop + 390 px, Warenkorb, Bestand 0) →
Ergebnis hier eintragen → Phase 5.

Ohne Freigabe weiter möglich: Phase 5 Code im Control Center (ohne Shopify-Schreibzugriff
testbar gegen eine Attrappe), Sterne-Snippets für Phase 6, Abgleich-Skript für Phase 8
(Trockenlauf, nur lesend).
