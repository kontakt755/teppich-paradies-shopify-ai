# Deterministic Risk Model Specification

Version: 1.0  
Prinzip: Ein Modell schlägt keine Risikoklasse vor und darf sie nicht herabstufen.

## 1. Berechnung

```text
effective_risk = max(
  path_risk,
  operation_risk,
  data_risk,
  domain_override,
  blast_radius_risk
)
```

Reihenfolge `LOW < MEDIUM < HIGH`. Unbekannter Pfad, unbekannte Operation oder unbekannte Datenklasse wird konservativ mindestens `MEDIUM`; bei möglicher Produktionseinwirkung `HIGH`.

Preflight prüft geplante Targets. Postflight prüft den tatsächlichen Diff und ein Operationsjournal. Überschreitet `effective_risk` das im Task erlaubte Risiko: sofortiger `HARD_STOP`, keine weiteren Änderungen, kein Push/Publish.

## 2. Normative YAML-Spezifikation

```yaml
version: 1
default_unknown_risk: MEDIUM
production_unknown_risk: HIGH
precedence: [LOW, MEDIUM, HIGH]

global:
  data:
    secrets: HIGH
    credentials: HIGH
    personal_customer_data: HIGH
    payment_data: HIGH
    live_price_or_inventory: HIGH
    unpublished_draft_without_final_price: MEDIUM
    public_content: LOW
  operations:
    read: LOW
    report_write: LOW
    isolated_code_edit: LOW
    multi_file_feature_edit: MEDIUM
    create_reversible_draft: MEDIUM
    external_write: HIGH
    delete: HIGH
    publish_or_deploy: HIGH
    purchase_or_order: HIGH
    git_status: LOW
    git_diff: LOW
    git_log: LOW
    git_fetch: LOW
    git_push: HIGH
    force_push: HIGH
    pull_request_create: HIGH
    pull_request_merge: HIGH
    merge_main: HIGH
    release_create: HIGH
    tag_create: HIGH
  blast_radius:
    files_over_task_budget: MEDIUM
    bulk_records_over_domain_threshold: HIGH
    production: HIGH

domains:
  shopify:
    paths:
      "reports/**": LOW
      "qa/**": LOW
      "locales/**": LOW
      "snippets/**": LOW
      "assets/**/*.css": LOW
      "sections/**": MEDIUM
      "blocks/**": MEDIUM
      "templates/collection*.json": MEDIUM
      "templates/product*.json": HIGH
      "config/settings_data.json": HIGH
      "layout/checkout*": HIGH
    operations:
      theme_read_or_preview: LOW
      unpublished_dev_theme_write: MEDIUM
      live_theme_push_files: HIGH
      theme_publish: HIGH
      fallback_theme_write: HIGH
      existing_live_product_write: HIGH
      product_delete: HIGH
      draft_product_create_unpublished: MEDIUM
      collection_assignment_existing_product: HIGH
      price_or_compare_at_write: HIGH
      inventory_write: HIGH
      cart_or_checkout_logic_write: HIGH
      opc_price_logic_write: HIGH
      merchant_offer_or_feed_price_write: HIGH
      json_ld_offer_write: HIGH
      app_install_or_delete: HIGH
      webhook_write: HIGH
      discount_write: HIGH
      sales_channel_availability_write: HIGH
      ads_write: HIGH
      test_order: HIGH
      theme_push: HIGH
      product_change: HIGH
      price_change: HIGH
      sku_change: HIGH
      variant_change: HIGH
      checkout_change: HIGH
      payment_change: HIGH
      shipping_change: HIGH
      dns_change: HIGH
      paid_app_install: HIGH
    protected_resources:
      fallback_theme_196301750606: HIGH
      customer_data: HIGH
      payment_and_shipping_settings: HIGH
```

Die Datei wird später als `core/risk-map.schema.json` validiert und pro Domain kompiliert. Regeln sind deklarativ; Freitext im Task kann sie nicht überschreiben.

## 3. Shopify-Klassifikation

### LOW

- Read-only Inventar, Reports und Tests
- isoliertes CSS ohne Checkout-/Preiswirkung
- Texte, Locale, Accessibility
- kleine unabhängige Snippets ohne Preis-/Cart-/Offer-Logik
- mechanisches Aufräumen innerhalb enger Allowlist

### MEDIUM

- größere Navigation
- Collection Templates
- Vergleich, Produktkarten und komplexere UI-Komponenten
- mehrere zusammenhängende Theme-Dateien
- neues, unveröffentlichtes Draft-Produkt ohne endgültige Preisfreigabe und vollständig reversibel
- unveröffentlichtes Dev Theme

### HIGH

- bestehende Live-Produktpreise, Compare-at, Bestand und bestehende Live-Produkte
- Kunden-, Checkout-, Cart- und Preislogik
- OPC-Preisberechnung
- kaufrelevante Merchant-/Feed-Preise und JSON-LD Offers
- Payment, Steuern, Versand, Apps, Webhooks, Rabatte und Ads
- echte Bestellung
- Live-Theme-Push und Theme-Publish
- Git Push, Force Push, PR-Erstellung/-Merge, Merge nach `main`, Releases und Tags
- Theme-Push/-Publish sowie Produkt-, Preis-, SKU-, Varianten-, Checkout-, Payment-, Versand-, DNS- und Paid-App-Änderungen
- Produktlöschung, Sales-Channel-Verfügbarkeit und kritische Massenänderungen

## 4. Human Gates

HIGH wird nicht implementiert. Der Orchestrator schreibt einen Eintrag nach `needs-ahmet.md`, markiert `NEEDS_AHMET` und fährt mit dem nächsten zulässigen Task fort. Ein späterer beaufsichtigter Lauf benötigt ein neues, explizit genehmigtes Manifest.

Read-only Git (`git status`, `git diff`, `git log`, `git fetch`) bleibt LOW. Schreibende Git-/GitHub-Operationen und alle oben genannten Shopify-Live-/Geschäftsdatenoperationen bleiben unabhängig von Modell-Confidence HIGH und benötigen immer das Human Gate.

Eine menschliche Freigabe kann HIGH autorisieren, aber nie Fallback-Löschung, echte Bestellung oder Preisänderung implizit einschließen. Diese benötigen jeweils ausdrückliche Operationsfreigaben.

## 5. Diff-Budget

Jeder Task definiert `MAX_FILES` und `MAX_CHANGED_LINES`.

- Datei außerhalb `ALLOWED_FILES`: `HARD_STOP`
- verbotene Operation/Datenklasse: `HARD_STOP`
- LOW über Budget: stoppen und anomaliegetriggerten Review anfordern
- MEDIUM über Budget: unabhängiger Review, anschließend `NEEDS_AHMET` ohne weitere Implementierung
- unbekannte Binärdatei, Secret oder unerwartete Löschung: `HARD_STOP`

## 6. Beispiele

| Änderung | Pfad | Operation/Daten | Ergebnis |
|---|---|---|---|
| Alt-Text in isoliertem Snippet | `snippets/x.liquid` | Accessibility | LOW |
| Produktkarten über Blocks und Snippets | mehrere Theme-Dateien | UI | MEDIUM |
| neues Jordan-Produkt als unveröffentlichter Draft | Admin API | reversible Draft-Daten | MEDIUM |
| Preis am bestehenden Live-Produkt | beliebig | Live-Preis | HIGH |
| JSON-LD Offer-Preis ändern | `snippets/schema.liquid` | Merchant-Preis | HIGH |
| Theme-Dateien auf Live-ID pushen | Theme | Produktion | HIGH |

## 7. Unveränderliche Sicherheitsregeln

- Fallback-Theme `196301750606` niemals beschreiben oder löschen.
- Keine Secrets im Task Context Pack.
- Kein Publish-Schritt darf Teil eines LOW-/MEDIUM-Workers sein.
- Tatsächlicher Diff ist maßgeblich, nicht die Absichtsbeschreibung.
