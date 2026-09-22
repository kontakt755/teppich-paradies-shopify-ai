# Befunde und Widersprüche

Prioritäten: P0 vor Ads zwingend · P1 starker Umsatzhebel · P2 danach. Status: OFFEN / IN ARBEIT / ERLEDIGT / ENTSCHEIDUNG (Inhaber) / NICHT ÄNDERN (bewusst).
Alte Audit-Befunde TP-001…TP-017 (Branch `audit/shop-audit`, Rechner/Cart-Pfade, P2/P3) gelten weiter und werden hier nicht dupliziert.

## P0 – vor Ads zwingend

| ID | Bereich | Befund | Beleg | Modul | Status |
|---|---|---|---|---|---|
| PL-001 | Produktbilder | „Rapidia Teppichfliese 50x50cm": Titelbild ist ein Piktogramm (Gebäude/Personen „33"), kein Produktfoto | `files/328377-8FXC-prod_ec9619dc…jpg` 833×390 | M2 | OFFEN |
| PL-004 | Bestellungen | Keine automatischen Order-Tags (kein Flow); TYP-MUSTER/-WARE/-MISCH, BERATUNG-*, MASS-PRUEFUNG-*, VERLEGUNG-* fehlen | Admin-API orders 2026-09-22; `domains/shopify/benachrichtigungen/README.md:60-62` | M7 | OFFEN |
| PL-005 | Beratung | Keine Beratungs-/Telefon-/Maßprüfungs-/Verlegeanfrage im Warenkorb; Cart-Notiz abgeschaltet (`show_cart_note: false`) | `snippets/cart-summary.liquid`, Bestellungen ohne customAttributes | M5 | ERLEDIGT (Arbeitstheme, Tags offen → PL-004) |
| PL-007 | Express-Checkout | Dynamic Checkout (Shop Pay/Apple/Google Pay) auf PDP und im Cart aktiv → jede Pflichtabfrage im Cart umgehbar | `blocks/accelerated-checkout.liquid:23`, `cart-summary.liquid:311-318` | M5 | ERLEDIGT (PDP-Buy-now aus, Cart-Express gated) |
| PL-008 | Konsistenz | Lieferzeit „5–7 Werktage" (6 Templates + AGB) vs. „3–5 Werktage" (`product.teppich.json:266`) | s. 01-CURRENT-STATE 1.3 | M2 | OFFEN |
| PL-009 | Konsistenz | Verlegeradius: kundensichtbar überall „50 km", die 15-km-Bedingung (kostenlose Lieferung/lose Verlegung ab 649 €) steht nur in Kommentaren; ≥ 12 Kopien ohne Einstellung | `blocks/tp-verlegen-lassen.liquid:17-19`, `templates/index.json:838-841` | M2 | ENTSCHEIDUNG (Text) / OFFEN (Quelle) |
| PL-010 | Konsistenz | Telefonnummer in vier Schreibweisen (~25 Stellen), Öffnungszeiten in vier Formaten, keine zentrale Quelle | 01-CURRENT-STATE 1.3 | M2 | OFFEN |
| PL-011 | Konsistenz | Versandschwelle: `tp_versand_frei_ab` im Repo leer, `[versandfrei]`-Platzhalter 11×, hart „50 €" 2× – Live zeigt 50 €, Repo-Stand rendert „ab € Bestellwert" | `settings_data.json`, `header-group.json:468`, `tp-preisangabe.liquid:5` | M2 | NICHT ÄNDERN – Schema-Default 50 greift; nur die 2 harten „50 €" bleiben zu zentralisieren |
| PL-012 | Vertrauen | Google-Bewertung: Theme-Einstellungen `tp_google_wert/anzahl` im Repo leer; Wert nur im Editor des Live-Themes → Preview/Arbeitstheme ohne Beleg | `config/settings_data.json` | M2 | NICHT ÄNDERN – Schema-Default 4,9 / über 240 greift |
| PL-013 | Produktidentität | `variant.sku` kundensichtbar (`blocks/sku.liquid`, JSON-LD) mit Lieferanten-Artikelmuster | 01-CURRENT-STATE 1.1 | M1 | ENTSCHÄRFT – `sku`-Block in keinem Template; nur JSON-LD `sku` |
| PL-014 | Produktidentität | Internes Mapping lückenhaft: `lieferant.hersteller` 8/250, `lieferant_a_produktname` 49/250, `lieferant_b_produktname` 9/250; nur `grosshandel.sku` vollständig | Admin-API 2026-09-22 | M1 | OFFEN (Datenlauf, lokal) |
| PL-015 | E-Mail | Keine eigene Musterbestätigung, keine angepasste Bestell-/Versandbestätigung; nur interne Mail im Repo | `domains/shopify/benachrichtigungen/` | M6 | OFFEN |
| PL-016 | Tracking | GA4-Mess-ID fehlt; Custom Pixel mit Platzhalter; Purchase nicht belegt; select_item/view_item_list/search/sample_order/consultation_*/measurement_review/installation_request fehlen | 01-CURRENT-STATE 3 | M8 | OFFEN |
| PL-017 | Tracking | Doppelzählung nicht ausgeschlossen (App-Pixel + Custom Pixel; Kauf-Conversion aus Google-App und GA4-Import) | `TRACKING_REPORT.md:38` | M8 | OFFEN (Admin) |
| PL-018 | Merchant Center | 225/225 Produkte awaiting_review, 0 approved; ohne GTIN/`custom_product`; 8 doppelte SKUs, 41 Klebevinyl ohne SKU; Versandrichtlinie 404 | `docs/google/tracking-und-feed-validierung-2026-09-11.md` | M9 | OFFEN |
| PL-019 | Merchant Center | Feedtitel = Shopify-Titel („Piumera Teppichboden 400cm 500cm"), ohne Produktart/Struktur/Farbe je Variante | Bestellungen, Google-App | M9 | OFFEN |
| PL-020 | Performance | Mobil LCP 5,1–7,6 s, Score 52–58; Kategorie 4,7 MB/286 Requests; 832-px-Bilder mobil | `docs/analyse/qualitaet-erstbefund-2026-09-11.md` | M10 | OFFEN |
| PL-021 | Mobile | Touch-Targets 17–24 px (20 WARN) auf Start/Vinyl/Teppichboden/Suche | `SEO_REPORT.md` 11.09. | M10 | OFFEN |
| PL-022 | Produktseite | Reihenfolge weicht von § 9 ab; H1 uneinheitlich (`tp-product-h1` nur planken/fliese); Verlegen-lassen vor Kaufen | 01-CURRENT-STATE 1.5 | M3 | OFFEN |
| PL-023 | Interne Texte | „Interne Farbnummer"-Tooltip im DOM (`tp-farbanzeige.liquid:76-85`); Rechenweg B×L in `tp-rollware-anzeige.liquid:36-40` kundensichtbar | – | M2 | OFFEN |
| PL-024 | Datenmodell | `custom.rollenbreite` auf Produkt- und Variantenebene, gemischt gelesen (`cart-summary.liquid` vs. `price.liquid`) | – | M1 | OFFEN |
| PL-025 | Muster/Ads | Musterbestellung endet als 0-€-`purchase` – verfälscht Ads-Optimierung | `docs/google/…:112-115` | M8 | OFFEN |

## P1 – starker Umsatzhebel

| ID | Bereich | Befund | Beleg | Modul | Status |
|---|---|---|---|---|---|
| PL-002 | Produktbilder | „Interlana Teppichfliese" Titelbild 113×113 px | `332571-8FXC-prod.jpg` | M2 | OFFEN |
| PL-003 | Produktbilder | Teppichplanken (Travera, Terzana, Seravia) nur 397×1590-Hochkantfotos → Karten/Menü-Fallback unbrauchbar | Kollektion teppichplanken | M2 | OFFEN |
| PL-006 | Muster | Altmodell `TP-MUSTER-000` + Neumodell `M-<SKU>` parallel in Code und Bestellungen | Bestellungen #1003–#1009, `core.js:120-165` | M4 | ENTSCHEIDUNG |
| PL-026 | Warenkorb | Cart-Drawer ohne „Passend zu Ihrem Projekt"; Cart-Seite nur statische Leisten-Kollektion | `templates/cart.json` | M5 | OFFEN |
| PL-027 | Kundenkonto | Keine Anpassung Bestellstatus/Kundenkonto; nicht getestet | `HANDOFF.md:91,104` | M12 | OFFEN |
| PL-028 | Wunschmaß | Grenzen dreifach (FAQ, Kollektionstemplate, Metafelder) | `tp-teppiche-faq.liquid:50`, `collection.teppiche.json:275` | M2 | OFFEN |
| PL-029 | Follow-up | Keine Nachfass-Mails nach Zustellung (Ware/Muster), kein E-Mail-Tool (bewusst) | `docs/shop-decisions.md:27` | M6 | ENTSCHEIDUNG |

## P2 – danach
| ID | Bereich | Befund | Modul | Status |
|---|---|---|---|---|
| PL-030 | Suche | Suche feuert keine Analytics-Events; Filter aus Metafeldern vorhanden (Search & Discovery, nur UI-pflegbar) | M11 | OFFEN |
| PL-031 | B2B | 8 Seiten rendern B2B-Template durch fehlenden page-Suffix (bekannt, memory) | M11 | OFFEN |
