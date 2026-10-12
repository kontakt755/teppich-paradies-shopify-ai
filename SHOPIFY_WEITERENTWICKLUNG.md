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
| 4 | Sonderposten-Produktstruktur | **abgeschlossen** (Theme in der Entwicklungskopie, Shopify-Daten angelegt, mit Testprodukt getestet) |
| 5 | Ladenverkauf | **gebaut** (Control Center, Entwurfs-PR #986, 19 Tests); bucht erst nach Freigabe E5 (`write_inventory`) |
| 6 | Produktbewertungen | **abgeschlossen**: Entscheidung 08.10. – keine Bewertungs-App, bei der Google-Bewertung bleiben (zu wenige Online-Bestellungen je Produkt). Sterne-Darstellung bleibt vorbereitet und ohne Daten unsichtbar. |
| 7 | Bildverwaltung und Bildrechte | **Inventur fertig** (8.530 Bilder erfasst, `npm run bildrechte:inventur`); Lizenzen je Lieferant + Bildarchiv-Ort beim Inhaber (E7); Dashboard-Liste offen |
| 8 | Menüpunkt „Angebote“ | **gebaut**; Kollektion `angebote` (510) angelegt; täglicher Abgleich 0:00 als Dienst `net.teppich-paradies.angebote` (PR #995); Menüpunkte mit dem Livegang |
| 9 | Gesamttest | **abgeschlossen** (08.10.): Shop-QA PASS, Menülogik Desktop/Handy/Drawer/Footer, Reste ein/aus, Angebote; Befund „5. Menüstelle“ behoben |
| 10 | Veröffentlichung vorbereiten | **vorbereitet** (08.10.): Code-Review #977 (7 Befunde, 6 behoben), Menükacheln, Livegang-Checkliste unten – **wartet auf Live-Freigabe** |

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

## 4. Aufgaben in Bearbeitung

**Freigaben des Inhabers vom 2026-10-08:** E1 ja (alle vier Schreibvorgänge), E2 Streichpreis
nur mit Beleg, E4 SumUp-Lösung unbekannt → zuerst nur Button „Im Laden verkauft“,
E6 Judge.me Forever Free ja. Offen: E3, E5, E7, E8.

**Seit 2026-10-08 entscheidet Ahmet über die Werkbank** (Vorgabe Tobias): offene Fragen stehen dort als
„Wartet auf Inhaber“ mit Erklärung – w-015 (Sonderposten: wer bucht im Laden, Versandprofil
„nur Abholung“, Preise/Streichpreis), w-017 (Recht `write_inventory`), w-027 (Judge.me oder
bei Google bleiben), w-028 (Bildarchiv, Lizenzen). Beantwortet und umgesetzt: w-029 (Angebote).

**In Shopify angelegt (Phase 4, 2026-10-08):**

| Was | Stand |
|---|---|
| 14 Metafeld-Definitionen `sonderposten.*` | angelegt, gegengeprüft (Typen, Auswahlwerte, Grenzen; `lagerort`, `verkauft_*` ohne Storefront-Zugriff) |
| Produkt „VORLAGE Sonderposten – nicht veröffentlichen“ (`vorlage-sonderposten`) | Entwurf, keine Kanäle, Typ/Vorlage/SKU `SP-0000`/Bestandsregeln gesetzt – zum Duplizieren |
| Produkt „TEST Reststück – nicht kaufen“ (`test-reststueck-nicht-kaufen`, SKU `SP-TEST-0001`) | zum Test kurz aktiv (nur Onlineshop-Kanal, `seo.hidden`), jetzt wieder **Entwurf**, Bestand 0 |
| Kollektion „Reste & Sonderposten“ (`reste-sonderposten`) | Smart-Regel Typ = Sonderposten UND Bestand > 0, Vorlage `sonderposten`. **Im Onlineshop veröffentlicht** (für die Vorschau nötig), aber leer und `seo.hidden` – siehe Probleme Nr. 6 |

**Phase 5** (jetzt): Control-Center-Ansicht „Sonderposten“ mit Button „Im Laden verkauft“.

## 5. Noch offene Aufgaben

- Phase 5: nach E5 einmal mit dem Testprodukt durchbuchen (Bestand vorher auf 1); PR #986 mergen, Dienst vorspulen.
- Phase 7: Dashboard-Liste „Bildrechte“ (nach der Sonderposten-Ansicht); Lizenzklärung je Lieferant (E7).
- Phase 8: PR #995 mergen und `~/tp-dashboard` vorspulen (Dienst läuft daraus); Menüpunkte „Angebote“ und „Reste & Sonderposten“ mit dem Livegang (`angebote.md` §5).
- Phase 9/10: Gesamttest, Deploy-Kette (`workflow:doctor` → PR → `main` → Preview → Live).

**Entscheidungen des Inhabers** (blockieren die jeweilige Phase, nicht die anderen):

| # | Frage | Empfehlung |
|---|---|---|
| E1 | Freigabe der vier Schreibvorgänge in §4 | **erteilt 2026-10-08** |
| E2 | Vergleichspreis bei Reststücken zeigen? | **entschieden: nur mit Beleg** (umgesetzt) |
| E3 | Versand von Sonderposten | **entschieden 08.10.: Abholung UND Versand**; Abholung ist eingeschaltet. Versandkosten wie alle Produkte (entschieden 08.10., kein eigenes Profil) |
| E4 | Welche SumUp-Lösung läuft im Laden? | **unbekannt** → Weg B zuerst, Weg C zurückgestellt |
| E5 | Dashboard-Zugang: Recht `write_inventory` ergänzen (Inhaber selbst) | ja, für Weg B |
| E6 | Judge.me installieren? | **entschieden 2026-10-08: nein**, bei Google bleiben |
| E7 | Speicherort Bildarchiv + Lizenzunterlagen je Lieferant | Inhaber |
| E8 | Menüpunkte „Angebote“ und „Reste & Sonderposten“ ins Hauptmenü (unsichtbar, bis Inhalt da ist) | ja |

## 6. Technische Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Sonderposten = eigenes Produkt je Stück, Typ `Sonderposten`, eine Variante, Bestand 1, „nicht überverkaufen“ | hält Stückware aus Rollen-/Paket-/Raummaß-Logik, Kategorie-Kollektionen und Flächen-Feed heraus – **nicht** aus `angebote-leisten-zubehoer` und `intern-regulaerer-preis` (Regeln schließen nur Typen aus; `sonderposten.md` §2) |
| Erkennung nur über `snippets/tp-ist-sonderposten.liquid` | eine Quelle, wie `tp-verkaufseinheit` |
| `tp-verkaufseinheit` liefert für Sonderposten immer `einzel` | auch wenn Tags/Metafelder vom Ursprungsprodukt kopiert wurden |
| Kein Mengenfeld, Warenkorb max. 1 | „nicht versehentlich mehr bestellen“; serverseitig sperrt der Bestand |
| Streichpreis nur mit prüfbarem `sonderposten.preis_beleg` (Format, Fläche, Rechnung, Ursprungspreis; `tp-sonderposten-preisbeleg`) | AGENTS.md: Streichpreise nur mit belegtem Vorpreis; ein bloßer Text würde beim Duplizieren mitkopiert (Review 09.10.) |
| Online-Kauf nur bei gesichertem Bestand (geführt, kein Überverkauf) und nicht bei „Nur Abholung“ (`tp-sonderposten-kaufstatus`) | sonst Doppelverkauf eines Einzelstücks möglich bzw. Abhol-Zusage, die der Checkout nicht durchsetzt (Review 09.10.) |
| `itemCondition` aus `sonderposten.zustand` | B-Ware/Ausstellungsstück nicht als „neu“ auszeichnen |
| Ladenverkauf über Control Center (Weg B), SumUp nur als späteres Sicherheitsnetz | SumUp-API ohne SKU; vorhandene Anmeldung/Rollen/Protokoll; 0 € |
| Bewertungen: Theme rendert aus `reviews.*`-Standardfeldern, App nur für Sammeln/Moderation | App austauschbar, kein App-Skript auf Kollektionsseiten, ein JSON-LD |
| Angebote über Tag + Abgleich-Skript + Theme-Sicherung | Smart-Kollektionen kennen kein Datum; Menü darf nie falsch „an“ sein |

## 7. Geänderte Dateien (Branch)

| Datei | Änderung |
|---|---|
| `snippets/tp-ist-sonderposten.liquid` | neu – ist das Produkt ein Sonderposten |
| `snippets/tp-sonderposten-flaeche.liquid` | neu – Fläche aus Metafeld oder Breite × Länge |
| `snippets/tp-sonderposten-kaufstatus.liquid` | neu – frei / ungesichert / laden / verkauft: einzige Quelle für Verfügbarkeit, Kaufknopf, Kaufleiste und JSON-LD |
| `snippets/tp-sonderposten-preisbeleg.liquid` | neu – Streichpreis-Beleg je Stück prüfen |
| `snippets/tp-zahl-de.liquid` | neu – „4,00“-Formatierung |
| `blocks/tp-sonderposten-daten.liquid` | neu – Produktseite: Art, Verfügbarkeit, Maße, Stückpreis, €/m², Ersparnis, Zustand, Herkunft, Abholung |
| `blocks/tp-card-sonderposten.liquid` | neu – Kartenzeile „Reststück · 4,00 × 2,35 m (9,40 m²)“ + €/m² |
| `templates/product.sonderposten.json` | neu – Produktvorlage |
| `templates/collection.sonderposten.json` | neu – Kollektionsvorlage |
| `templates/search.json` | Kartenzeile Sonderposten in Suchergebnissen |
| `blocks/buy-buttons.liquid` | Sonderposten: kein Mengenfeld, Hinweis „liegt bereits im Warenkorb“, Button „Verkauft“; ohne gesicherten Bestand bzw. bei „Nur Abholung“ kein Kaufknopf |
| `snippets/cart-products.liquid` | Sonderposten: Mengenfeld im Warenkorb max. 1; Rechenweg zum Streichpreis |
| `snippets/tp-sonderposten-vergleich.liquid` | neu – Zeile „Vergleichspreis = regulär … €/m² × … m²“ überall, wo der Streichpreis eines Sonderpostens außerhalb der eigenen Produktseite steht |
| `snippets/price.liquid` | Sonderposten: Rechenweg unter dem Streichpreis (Karte, Suche, Suchvorschläge) |
| `sections/product-list.liquid` | Startseiten-Listen (`tp_je_linie_eins`): Sonderposten nur in einer Liste der Sonderposten-Kollektion |
| `blocks/_product-card-gallery.liquid` | Sonderposten: „Verkauft“ statt „Ausverkauft“ |
| `blocks/tp-card-title.liquid` | Sonderposten: voller Titel statt Kürzung ab „ Teppichboden“ |
| `sections/product-information.liquid` | Kaufleiste (Handy): „Verkauft“ statt „Ausverkauft“ bei Sonderposten; gesperrt wie der Kaufknopf |
| `qa/tests/tp-sonderposten.test.mjs`, `qa/tests/tp-streichpreis-nur-bei-aktion.test.mjs`, `qa/tests/tp-teppich-ab-preis.test.mjs` | neue Tests bzw. Hilfs-Snippet in der Test-Engine |
| `snippets/tp-rabatt-sichtbar.liquid` | Weg 3: Sonderposten-Streichpreis nur mit Beleg |
| `snippets/tp-verkaufseinheit.liquid` | Sonderposten immer `einzel` |
| `snippets/tp-product-structured-data.liquid` | `itemCondition` für Sonderposten aus Zustand; `availability` folgt `tp-sonderposten-kaufstatus` |
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
| **Phase 4 mit Testprodukt** (Entwicklungskopie, Chrome-Engine im App-Browser) | |
| Produktseite Desktop: Art, „Nur 1× verfügbar“, Maße 4,00/2,35/9,40, Stückpreis, „entspricht 9,47 €/m²“, Ersparnis 154,46 € (63 %) mit Beleg, Zustand, Material, Farbe, Link Ursprungsprodukt, Abholhinweis | ok |
| Lagerort im HTML | nicht vorhanden (ok) |
| Mengenfeld auf der Produktseite | nicht vorhanden (ok) |
| JSON-LD | `NewCondition`, `InStock`, Preis 89 – stimmt mit Seite überein |
| Warenkorb: zweites Hinzufügen | Shopify 422 „maximale Menge bereits im Warenkorb“ (ok) |
| Warenkorb: Menge auf 3 ändern | Shopify 422, Menge bleibt 1 (ok) |
| Warenkorbseite | Mengenfeld `max=1`, Plus-Button gesperrt, Grundpreis 9,47 €/m² aus Shopify (ok) |
| Produktseite mit Stück im Warenkorb | Hinweis „Dieses Stück liegt bereits in Ihrem Warenkorb.“ (ok) |
| Kollektion „Reste & Sonderposten“ | 1 Karte: „Reststück · 4,00 × 2,35 m (9,40 m²)“, „Preis für das ganze Stück · entspricht 9,47 €/m²“, −63-%-Badge (ok) |
| Handy 390 px | kein horizontaler Überlauf, Maße-Raster 3 × 118 px (ok) |
| Bestand 0 (`inventorySetQuantities` mit `compareQuantity: 1`) | Chip „Verkauft“, beide Kaufbuttons „Verkauft“ und gesperrt, JSON-LD `OutOfStock`, `cart/add` 422 (ok) |
| Kollektion nach Bestand 0 | nach wenigen Minuten leer (Shopify rechnet Smart-Regeln verzögert) – ok |
| Regression nach allen Änderungen | `npm test` grün, alle Guards 0 Fehler |

### Gesamttest Phase 9 (2026-10-08, Entwicklungskopie vollständig auf Branch-Stand)

| Test | Ergebnis |
|---|---|
| `npm run qa` gegen die Entwicklungskopie (15 Seiten × Desktop/Handy) | **PASS**, 0 relevante Fehler. 30 Hinweise = abgebrochene Shopify-Analyse-Anfragen im Testbrowser auf allen Seiten, auch unveränderten (Umgebung, nicht Code) |
| Theme Check gegen Baseline | 0 neue Errors, 0 neue Warnings (vorher 1 neue Warnung `ValidScopedCSSClass` aus `buy-buttons` → CSS in den Block verlegt) |
| Testmenü (`test-weiterentwicklung`, nur Entwicklungskopie) – Angebote vorhanden, Reste leer | Desktop: Angebote sichtbar, Reste fehlt ✓ |
| Befund: Vorab-Liste des Handy-Drawers (`snippets/header-drawer.liquid`) gab Menüpunkte ohne Prüfung aus | **behoben**, dazu Footer-Sortiment; neuer Test `qa/tests/tp-menu-link-sichtbar.test.mjs` bindet jede Menü-Schleife an die Prüfung (Gegenprobe: ohne Prüfung rot) |
| Teststück aktiv, Bestand 1 | „Reste & Sonderposten“ erscheint nach ~30 s in Desktop-Menü und Drawer („1 Produkt“) ✓ |
| Bestand 0 | Punkt verschwindet nach ~60 s überall ✓ |
| Handy-Drawer 390 px | Angebote (545 Produkte), Reste (1 Produkt) ✓ – optisch: Reste-Kachel zeigt Platzhalter „R“, Angebote ein zufälliges Produktbild → vor Livegang eigene Kacheln (`_tp-menu-kachel`) |
| Produktbewertungen | keine Daten → keine Sterne, kein `aggregateRating` ✓ (Entscheidung: bei Google bleiben) |
| Teststück danach | wieder Entwurf, Bestand 0 |

## 9. Erkannte Probleme

1. Sonderposten laufen über das „Allgemeine Profil“ (DE ab 50 € kostenlos, EU 13,99 €, International 19,99 €) – bei großen Reststücken unter den echten Kosten; bewusst so entschieden (08.10.).
2. Basic-Plan: 2 Mitarbeiterkonten – Nachvollziehbarkeit „wer“ deshalb über die Control-Center-Anmeldung.
3. Angebots-Kollektionen „Preis reduziert“ können zwischen `aktion.ende` und Preis-Rückstellung
   Produkte ohne sichtbaren Rabatt enthalten (nächster Termin: Dauerrabatt-Ende 01.11. →
   Rückstellung 02.11.). Wird mit Phase 8 abgesichert.
4. 37 % der Stichprobenbilder < 1200 px breit; uneinheitliche Dateinamen.
5. Der CLI-Zugang darf keine Menüs und keine Metaobjekte lesen und nichts veröffentlichen (Menü-Sicherung und Veröffentlichung deshalb über die Admin API/MCP).
6. Die Admin API (MCP) verweigert `publishableUnpublish` aus Sicherheitsgründen. Die Kollektion
   „Reste & Sonderposten“ bleibt deshalb im Onlineshop veröffentlicht. Sie ist leer, nirgends verlinkt
   und `seo.hidden`. Unter `/collections/reste-sonderposten` zeigt das Live-Theme „Keine Produkte“.
   Wer das nicht will, nimmt die Veröffentlichung im Admin zurück (Kollektion → Vertriebskanäle).
7. Smart-Kollektionen folgen dem Bestand mit einigen Minuten Verzögerung; die Produktseite
   sperrt sofort. Für den Ladenverkauf reicht das (Shopify verhindert die Bestellung ohnehin).
8. Leere Sonderposten-Kollektion zeigt den Horizon-Standardtext „Keine Produkte“ – vor dem
   Livegang durch einen freundlichen Hinweis ersetzen (Phase 9).
9. Review 2026-10-10: Ein Stück **mit** Vergleichspreis liegt in `angebote-leisten-zubehoer`
   (Teststück per Admin API belegt), eines **ohne** in `intern-regulaerer-preis`
   (Marketingcodes greifen). Theme: Startseiten-Listen überspringen Sonderposten; Karte, Suche
   und Warenkorb nennen den Rechenweg zum Streichpreis. Offen, mit Freigabe des Inhabers:
   Regel „Typ enthält nicht Sonderposten“ (`sonderposten.md` §2). Bis dahin kein Stück mit
   Vergleichspreis aktiv schalten.

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

## 10a. Livegang – Checkliste (erst nach ausdrücklicher Freigabe)

Wichtig: **Ein Merge nach `main` ist praktisch schon der Livegang**, weil andere Sitzungen
`main` regelmäßig deployen. Deshalb wird #977 erst mit der Freigabe gemergt.

1. `npm run pr:doctor` – #977 gegen `main` sauber; danach mergen.
2. Deploy-Kette (Skill `deploy`): `npm run workflow:doctor` → `workflow:preview` → Prüfungen →
   `workflow:live`. Vorher in der Werkbank/anderen Sitzungen ansagen (kein paralleler Deploy).
3. Öffentlich ohne Vorschau prüfen: Startseite, eine Kollektion, eine Produktseite (Mengenfeld,
   Preis, JSON-LD), Warenkorb, Suche, Handy-Drawer, Footer.
4. **Erst danach** Menüpunkte ins Hauptmenü: `menuUpdate` auf `main-menu` mit dem **ganzen** Baum
   inkl. aller MenuItem-IDs (Sicherung `docs/weiterentwicklung/sicherung/2026-10-08-hauptmenue.json`,
   vorher frisch auslesen) + „Angebote“ (`/collections/angebote`) und „Reste & Sonderposten“
   (`/collections/reste-sonderposten`). Gegenprobe: identische ID-Menge plus zwei neue IDs
   (`docs/lessons/tote-menuelinks.md`). Vorher nicht – das alte Live-Theme kennt die
   Ausblend-Logik nicht und würde „Reste & Sonderposten“ ohne Stücke zeigen.
5. `npm run menu:guard` – keine toten Links; „Reste“ erscheint erst mit dem ersten echten Stück.
6. `live-theme.json` nachtragen (macht `workflow:live`), Werkbank-Einträge abschließen.
7. Aufräumen: Testmenü `test-weiterentwicklung` und Entwicklungstheme (`entwicklung` in
   `live-theme.json` → `retired`) nach Projektende; Teststück bleibt als Entwurf für Schulungen.

**Nicht Teil des Livegangs, eigene Freigaben:** PR #986 (Control Center, braucht `write_inventory`),
echte Sonderposten (Erfassung w-014, Preise w-015).

## 11. Nächster Arbeitsschritt

Live-Freigabe durch den Benutzer abwarten, dann Checkliste 10a. Parallel offen bei Ahmet
(Werkbank): w-015 (wer bucht im Laden, Preisfreigabe), w-017 (`write_inventory`), w-028 (Bilder).
