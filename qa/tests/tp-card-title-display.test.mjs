import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Liquid } from 'liquidjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const liquid = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });

async function renderTitle(product) {
  return (await liquid.renderFile('tp-card-title-display', { product })).trim();
}

async function renderResourceCardTitle(resource, resource_type) {
  return (
    await liquid.renderFile('tp-resource-card-title-display', { resource, resource_type })
  ).trim();
}

test('shortens the category suffix on Teppichboden rollware cards', async () => {
  assert.equal(
    await renderTitle({ title: 'Piumera Teppichboden 400cm 500cm', type: 'Teppichboden' }),
    'Piumera',
  );
});

test('keeps Teppichboden inside an accessory product title', async () => {
  assert.equal(
    await renderTitle({ title: 'Komfortunterlage für Teppichboden, selbsthaftend', type: 'Verlegeunterlage' }),
    'Komfortunterlage für Teppichboden, selbsthaftend',
  );
});

test('keeps the existing dash suffix shortening for vinyl cards', async () => {
  assert.equal(
    await renderTitle({ title: 'Lyon Eiche Mandel – Klickvinyl 6mm', type: 'Vinylboden' }),
    'Lyon Eiche Mandel',
  );
});

test('predictive-search resource cards preserve the full Teppichboden accessory title', async () => {
  const resourceCard = await readFile(path.join(root, 'snippets/resource-card.liquid'), 'utf8');
  assert.match(resourceCard, /render 'tp-resource-card-title-display'/);
  assert.doesNotMatch(resourceCard, /split: ' Teppichboden'/);
  assert.equal(
    await renderResourceCardTitle(
      { title: 'Komfortunterlage für Teppichboden, selbsthaftend', type: 'Verlegeunterlage' },
      'product',
    ),
    'Komfortunterlage für Teppichboden, selbsthaftend',
  );
});

test('resource cards leave non-product resource titles unchanged', async () => {
  assert.equal(
    await renderResourceCardTitle({ title: 'Teppichboden für Ihr Zuhause' }, 'collection'),
    'Teppichboden für Ihr Zuhause',
  );
});
