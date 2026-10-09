import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Liquid } from 'liquidjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const liquid = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });

async function renderTitle(product) {
  return (await liquid.renderFile('tp-card-title-display', { product })).trim();
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
