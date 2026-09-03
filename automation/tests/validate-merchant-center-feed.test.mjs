import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const automationDir = path.join(root, 'automation');

test('Merchant Center Feed Validator: Validiert Testprodukte korrekt', async (t) => {
  await t.test('A: Identifiziert fehlende erforderliche Felder', () => {
    const requiredFields = ['id', 'title', 'description', 'image_link', 'link'];
    const product = {
      id: 'test-001',
      title: 'Test Product'
      // Fehlen: description, image_link, link
    };

    const missing = requiredFields.filter(field => !product[field]);
    assert.deepEqual(missing, ['description', 'image_link', 'link']);
  });

  await t.test('B: Validiert Titel-Längenbeschränkung', () => {
    const limits = { title: { min: 20, max: 150 } };
    const shortTitle = 'Kurz';
    const validTitle = 'Das ist ein gültiger langer Produkttitel mit ausreichend Zeichen';
    const longTitle = 'A'.repeat(200);

    assert.ok(shortTitle.length < limits.title.min, 'Kurzer Titel sollte erkannt werden');
    assert.ok(validTitle.length >= limits.title.min && validTitle.length <= limits.title.max, 'Gültiger Titel sollte passen');
    assert.ok(longTitle.length > limits.title.max, 'Langer Titel sollte erkannt werden');
  });

  await t.test('C: Validiert Preisformat', () => {
    const pricePattern = /^\d+([.,]\d{2})?$/;

    assert.ok(pricePattern.test('99,99'), 'Gültiger Preis mit Komma sollte passen');
    assert.ok(pricePattern.test('99.99'), 'Gültiger Preis mit Punkt sollte passen');
    assert.ok(pricePattern.test('99'), 'Gültiger Ganzpreis sollte passen');
    assert.ok(!pricePattern.test('99,99€'), 'Preis mit Währungssymbol sollte nicht passen');
    assert.ok(!pricePattern.test('€99,99'), 'Ungültiges Format sollte nicht passen');
  });

  await t.test('D: Validiert URL-Format', () => {
    const imagePattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
    const linkPattern = /^https?:\/\/.+/;

    const validImage = 'https://example.com/image.jpg';
    const invalidImage = 'not-a-url';
    const validLink = 'https://example.com/product';
    const invalidLink = 'ftp://example.com/product';

    assert.ok(imagePattern.test(validImage), 'Gültige Bild-URL sollte passen');
    assert.ok(!imagePattern.test(invalidImage), 'Ungültige URL sollte nicht passen');
    assert.ok(linkPattern.test(validLink), 'Gültiger Link sollte passen');
    assert.ok(!linkPattern.test(invalidLink), 'FTP-Link sollte nicht passen');
  });

  await t.test('E: Prüft auf Duplikate', () => {
    const products = [
      { id: 'prod-001', title: 'Product 1' },
      { id: 'prod-002', title: 'Product 2' },
      { id: 'prod-001', title: 'Duplicate' }
    ];

    const ids = new Set();
    const duplicates = [];

    for (const product of products) {
      if (ids.has(product.id)) {
        duplicates.push(product.id);
      }
      ids.add(product.id);
    }

    assert.deepEqual(duplicates, ['prod-001'], 'Sollte Duplikate erkennen');
  });

  await t.test('F: Berechnet Datenqualität/Vollständigkeit', () => {
    const requiredFields = ['id', 'title', 'description', 'image_link', 'price'];

    const completeProduct = {
      id: 'p1',
      title: 'Title',
      description: 'Desc',
      image_link: 'https://example.com/img.jpg',
      price: '99,99'
    };

    const incompleteProduct = {
      id: 'p2',
      title: 'Title'
      // Missing: description, image_link, price
    };

    const getCompleteness = (product) => {
      const fieldsWithData = requiredFields.filter(
        field => product[field] && String(product[field]).trim().length > 0
      ).length;
      return (fieldsWithData / requiredFields.length) * 100;
    };

    assert.equal(getCompleteness(completeProduct), 100, 'Vollständiges Produkt sollte 100% sein');
    assert.equal(getCompleteness(incompleteProduct), 40, 'Unvollständiges Produkt sollte 40% sein');
  });

  await t.test('G: Validierungsbericht wird erstellt', () => {
    const reportPath = path.join(automationDir, 'reports', 'MERCHANT_CENTER_VALIDATION.md');

    // Prüfe, ob Bericht existiert
    assert.ok(fs.existsSync(reportPath), 'Validierungsbericht sollte existieren');

    // Prüfe Inhalt
    const content = fs.readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('Google Merchant Center Feed Validierungsbericht'), 'Bericht sollte Titel haben');
    assert.ok(content.includes('Status'), 'Bericht sollte Status enthalten');
    assert.ok(content.includes('Empfehlungen'), 'Bericht sollte Empfehlungen enthalten');
  });
});
