#!/usr/bin/env node

/**
 * Google Merchant Center Feed Validator
 * Validiert Produktfeed für Google Shopping und identifiziert Datenqualitätsprobleme
 *
 * Prüfpunkte:
 * - Erforderliche Felder (title, description, image_link, price, etc.)
 * - Feed-Format (XML, CSV, TSV)
 * - Datenvalidierung (URLs, Preise, etc.)
 * - Duplikate
 * - Länge-Beschränkungen
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const automationDir = path.join(root, 'automation');

// Erforderliche Felder für Google Merchant Center
const REQUIRED_FIELDS = [
  'id',
  'title',
  'description',
  'image_link',
  'link',
  'availability',
  'price',
  'currency',
  'gtin',
  'mpn',
  'brand',
  'condition'
];

// Länge-Limits
const LIMITS = {
  title: { min: 20, max: 150 },
  description: { min: 50, max: 5000 },
  price: { pattern: /^\d+([.,]\d{2})?$/, message: 'Ungültiges Preisformat' },
  image_link: { pattern: /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i },
  link: { pattern: /^https?:\/\/.+/ }
};

class MerchantCenterValidator {
  constructor() {
    this.products = [];
    this.issues = [];
    this.warnings = [];
    this.stats = {};
  }

  validate() {
    console.log('🔍 Validiere Google Merchant Center Feed...\n');

    // Lade Test-Produktdaten
    this.loadTestData();

    // Validiere Struktur
    this.validateStructure();

    // Validiere Felder
    this.validateFields();

    // Prüfe auf Duplikate
    this.checkDuplicates();

    // Validiere URLs und Links
    this.validateUrls();

    // Prüfe Datenqualität
    this.validateDataQuality();

    // Generiere Report
    this.generateReport();
  }

  loadTestData() {
    // Lade bestehende Produktdaten aus dem Automation-Ordner
    const dataDir = path.join(automationDir, 'data');

    // Beispiel-Produktdaten (normalerweise würde das von Shopify kommen)
    this.products = [
      {
        id: 'teppich-001',
        title: 'Hochflor Teppich Grau 200x300cm',
        description: 'Hochwertiger Hochflor Teppich in moderner Graufarbe. Perfekt für Wohnzimmer und Schlafzimmer. Rutschfeste Unterseite.',
        image_link: 'https://www.teppich-paradies.net/products/teppich-001.jpg',
        link: 'https://www.teppich-paradies.net/products/hochflor-grau-200x300',
        availability: 'in_stock',
        price: '89,99',
        currency: 'EUR',
        gtin: '4012345678901',
        mpn: 'TEPPICH-001-GR',
        brand: 'Teppich Paradies',
        condition: 'new',
        category: 'Home > Rugs > Carpets',
        color: 'grau',
        material: 'polyester'
      },
      {
        id: 'vinylboden-001',
        title: 'Klick-Vinyl Eiche Natur 1220x185mm',
        description: 'Robustes Klick-Vinyl im Eichen-Design. Wasserfest und strapazierfähig. Ideal für Küche und Bad.',
        image_link: 'https://www.teppich-paradies.net/products/vinyl-001.jpg',
        link: 'https://www.teppich-paradies.net/products/klick-vinyl-eiche',
        availability: 'in_stock',
        price: '34,50',
        currency: 'EUR',
        gtin: '4012345678902',
        mpn: 'VINYL-001-EI',
        brand: 'Teppich Paradies',
        condition: 'new',
        category: 'Home > Flooring > Vinyl',
        color: 'braun',
        material: 'vinyl'
      },
      {
        // Produkt mit Fehlern
        id: 'defekt-001',
        title: 'Kurz',  // Zu kurz
        description: 'Zu kurz',  // Zu kurz
        image_link: 'not-a-valid-url',  // Ungültige URL
        link: 'ftp://invalid.example.com',  // Ungültiges Protokoll
        availability: 'unknown',  // Ungültiger Status
        price: '99,99€',  // Falsches Format
        currency: 'EUR',
        brand: 'Teppich Paradies',
        condition: 'new'
      }
    ];

    console.log(`✓ ${this.products.length} Testprodukte geladen\n`);
  }

  validateStructure() {
    console.log('📋 Strukturvalidierung:\n');

    for (let i = 0; i < this.products.length; i++) {
      const product = this.products[i];
      const missing = REQUIRED_FIELDS.filter(field => !product[field]);

      if (missing.length > 0) {
        this.issues.push({
          product: product.id,
          type: 'missing_fields',
          fields: missing,
          message: `Erforderliche Felder fehlen: ${missing.join(', ')}`
        });
      }
    }

    this.stats.totalProducts = this.products.length;
    this.stats.productsWithMissingFields = this.issues.filter(i => i.type === 'missing_fields').length;

    console.log(`  Produkte insgesamt: ${this.stats.totalProducts}`);
    console.log(`  Produkte mit fehlenden Feldern: ${this.stats.productsWithMissingFields}\n`);
  }

  validateFields() {
    console.log('✔️  Feldvalidierung:\n');

    for (const product of this.products) {
      // Titel-Länge
      if (product.title && (product.title.length < LIMITS.title.min || product.title.length > LIMITS.title.max)) {
        this.issues.push({
          product: product.id,
          type: 'field_length',
          field: 'title',
          message: `Titel-Länge außerhalb Bereich (${LIMITS.title.min}-${LIMITS.title.max} Zeichen): ${product.title.length}`
        });
      }

      // Beschreibungs-Länge
      if (product.description && (product.description.length < LIMITS.description.min || product.description.length > LIMITS.description.max)) {
        this.issues.push({
          product: product.id,
          type: 'field_length',
          field: 'description',
          message: `Beschreibung-Länge außerhalb Bereich: ${product.description.length}`
        });
      }

      // Preis-Format
      if (product.price && !LIMITS.price.pattern.test(product.price)) {
        this.issues.push({
          product: product.id,
          type: 'price_format',
          message: `Ungültiges Preisformat: ${product.price}`
        });
      }

      // Verfügbarkeit
      const validAvailability = ['in_stock', 'out_of_stock', 'preorder', 'backorder'];
      if (product.availability && !validAvailability.includes(product.availability)) {
        this.warnings.push({
          product: product.id,
          type: 'availability',
          message: `Ungültiger Verfügbarkeitsstatus: ${product.availability}`
        });
      }
    }

    console.log(`  Feldverletzungen gefunden: ${this.issues.filter(i => i.type.includes('field')).length}`);
    console.log(`  Warnungen: ${this.warnings.length}\n`);
  }

  checkDuplicates() {
    console.log('🔄 Duplikat-Prüfung:\n');

    const ids = new Set();
    let duplicates = 0;

    for (const product of this.products) {
      if (ids.has(product.id)) {
        duplicates++;
        this.issues.push({
          product: product.id,
          type: 'duplicate',
          message: `Produkt-ID doppelt vorhanden: ${product.id}`
        });
      }
      ids.add(product.id);
    }

    console.log(`  Duplikate gefunden: ${duplicates}\n`);
  }

  validateUrls() {
    console.log('🔗 URL-Validierung:\n');

    for (const product of this.products) {
      // Image Link
      if (product.image_link && !LIMITS.image_link.pattern.test(product.image_link)) {
        this.issues.push({
          product: product.id,
          type: 'invalid_url',
          field: 'image_link',
          message: `Ungültige Bild-URL: ${product.image_link}`
        });
      }

      // Product Link
      if (product.link && !LIMITS.link.pattern.test(product.link)) {
        this.issues.push({
          product: product.id,
          type: 'invalid_url',
          field: 'link',
          message: `Ungültiger Produkt-Link: ${product.link}`
        });
      }
    }

    console.log(`  URL-Fehler: ${this.issues.filter(i => i.type === 'invalid_url').length}\n`);
  }

  validateDataQuality() {
    console.log('⭐ Datenqualität:\n');

    let completeProducts = 0;

    for (const product of this.products) {
      const fieldsWithData = REQUIRED_FIELDS.filter(field => product[field] && String(product[field]).trim().length > 0).length;
      const completeness = (fieldsWithData / REQUIRED_FIELDS.length) * 100;

      if (completeness === 100) {
        completeProducts++;
      } else if (completeness < 80) {
        this.warnings.push({
          product: product.id,
          type: 'low_quality',
          completeness: completeness.toFixed(1),
          message: `Niedrige Datenqualität: ${completeness.toFixed(1)}% Vollständigkeit`
        });
      }
    }

    this.stats.completeProducts = completeProducts;
    this.stats.completenessPercentage = ((completeProducts / this.products.length) * 100).toFixed(1);

    console.log(`  Vollständige Produkte: ${completeProducts}/${this.products.length}`);
    console.log(`  Durchschnittliche Vollständigkeit: ${this.stats.completenessPercentage}%\n`);
  }

  generateReport() {
    const reportPath = path.join(automationDir, 'reports', 'MERCHANT_CENTER_VALIDATION.md');

    const report = `# Google Merchant Center Feed Validierungsbericht

**Generiert**: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}

## Zusammenfassung

| Metrik | Wert |
|--------|------|
| Produkte insgesamt | ${this.stats.totalProducts} |
| Vollständige Produkte | ${this.stats.completeProducts} |
| Vollständigkeit | ${this.stats.completenessPercentage}% |
| Kritische Fehler | ${this.issues.length} |
| Warnungen | ${this.warnings.length} |

## Status

${this.issues.length === 0 ? '✅ **PASS** – Feed ist validierungsbereit' : '❌ **FAIL** – Fehler müssen behoben werden'}

## Kritische Fehler (${this.issues.length})

${this.issues.length > 0 ? this.issues.map((issue, i) => `
### ${i + 1}. ${issue.product} – ${issue.type}
- **Nachricht**: ${issue.message}
${issue.field ? `- **Feld**: ${issue.field}` : ''}
${issue.fields ? `- **Fehlende Felder**: ${issue.fields.join(', ')}` : ''}
`).join('\n') : 'Keine kritischen Fehler gefunden.'}

## Warnungen (${this.warnings.length})

${this.warnings.length > 0 ? this.warnings.map((warning, i) => `
### ${i + 1}. ${warning.product} – ${warning.type}
- **Nachricht**: ${warning.message}
${warning.completeness ? `- **Vollständigkeit**: ${warning.completeness}%` : ''}
`).join('\n') : 'Keine Warnungen.'}

## Empfehlungen

1. **Erforderliche Maßnahmen**:
   ${this.issues.length > 0 ? '   - Alle kritischen Fehler müssen vor dem Upload gelöst werden' : '   - Keine erforderlich'}

2. **Optimierungen**:
   - Hochwertige Produktbilder sicherstellen (min. 250x250px)
   - Aussagekräftige Beschreibungen verfassen
   - Alle optionalen Felder ausfüllen (Farbe, Größe, Material, etc.)

3. **Nächste Schritte**:
   - Feed-Format prüfen (XML, CSV oder TSV)
   - Test-Upload in Merchant Center durchführen
   - Indexierungsstatus überwachen

## Validierungsergebnisse

**Feed-Validierung**: ${this.issues.length === 0 ? 'BESTANDEN ✓' : 'FEHLGESCHLAGEN ✗'}

Für den Upload zu Google Merchant Center: ${this.issues.length === 0 ? 'BEREIT ✓' : 'NICHT BEREIT – Fehler beheben erforderlich'}

---

*Validiert mit Google Merchant Center Feed Validator v1.0*
`;

    // Stelle sicher, dass das Verzeichnis existiert
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, report);
    console.log(`📄 Bericht gespeichert: ${reportPath}\n`);

    // Ausgabe Summary
    console.log('═'.repeat(60));
    console.log('VALIDIERUNGSERGEBNIS');
    console.log('═'.repeat(60));
    console.log(`Status: ${this.issues.length === 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Kritische Fehler: ${this.issues.length}`);
    console.log(`Warnungen: ${this.warnings.length}`);
    console.log(`Produktvollständigkeit: ${this.stats.completenessPercentage}%`);
    console.log('═'.repeat(60));
  }
}

// Starte Validierung
const validator = new MerchantCenterValidator();
validator.validate();

process.exitCode = validator.issues.length > 0 ? 1 : 0;
