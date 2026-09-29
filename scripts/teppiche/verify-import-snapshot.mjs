#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'domains/lieferanten/teppiche/import-snapshot-2026-09.json');
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (message) => { throw new Error(`Import snapshot: ${message}`); };

if (snapshot.write_status !== 'dry-run snapshot; no Shopify mutation') fail('unexpected write status');
if (snapshot.items.length !== 660) fail(`expected 660 items, found ${snapshot.items.length}`);
const sourceCounts = { base: 0, online: 0 };
const unitCounts = { stk: 0, 'm²': 0 };
const skus = new Set();
const eans = new Set();
let imageRows = 0;
let fixedSizeRows = 0;
let customSizeRows = 0;
let ambiguousCustomRows = 0;

for (const item of snapshot.items) {
  if (!(item.source in sourceCounts)) fail(`unknown source at ${item.source_row}`);
  sourceCounts[item.source]++;
  if (!(item.unit in unitCounts)) fail(`unknown unit for ${item.sku}`);
  unitCounts[item.unit]++;
  if (!item.sku || skus.has(item.sku)) fail(`duplicate or empty SKU ${item.sku}`);
  skus.add(item.sku);
  if (!/^\d{13}$/.test(item.ean) || eans.has(item.ean)) fail(`duplicate or invalid EAN ${item.ean}`);
  eans.add(item.ean);
  const digits = item.ean.slice(0, 12).split('').map(Number);
  const check = (10 - digits.reduce((sum, digit, index) => sum + digit * (index % 2 ? 3 : 1), 0) % 10) % 10;
  if (check !== Number(item.ean[12])) fail(`EAN check digit ${item.ean}`);
  if (!Number.isFinite(Number(item.price_eur)) || Number(item.price_eur) <= 0) fail(`price ${item.sku}`);
  const customSize = item.unit === 'm²' || /Wunschmaß/i.test(item.source_name);
  if (customSize) {
    customSizeRows++;
    if (item.unit === 'stk') ambiguousCustomRows++;
  } else {
    fixedSizeRows++;
    if (!Number(item.width_cm) || !Number(item.length_cm)) fail(`fixed-size dimensions ${item.sku}`);
  }
  if (!Object.hasOwn(snapshot.image_sets, item.image_set)) fail(`image set ${item.sku}`);
  if (snapshot.image_sets[item.image_set].length) imageRows++;
  if (Object.hasOwn(item, 'EK-Preis') || Object.hasOwn(item, 'purchase_price')) fail(`purchase price ${item.sku}`);
}

if (sourceCounts.base !== 512 || sourceCounts.online !== 148) fail('source counts');
if (unitCounts.stk !== 592 || unitCounts['m²'] !== 68) fail('unit counts');
if (fixedSizeRows !== 584 || customSizeRows !== 76 || ambiguousCustomRows !== 8) fail('size classification');
if (imageRows !== 58) fail(`image-covered rows ${imageRows}`);
const imageFiles = Object.values(snapshot.image_sets).flat();
if (imageFiles.length !== 379) fail(`image file references ${imageFiles.length}`);
for (const image of imageFiles) {
  if (path.isAbsolute(image) || image.split(/[\\/]/).includes('..')) fail(`unsafe image path ${image}`);
}

console.log(JSON.stringify({ status: 'PASS', items: snapshot.items.length, sourceCounts, unitCounts, fixedSizeRows, customSizeRows, ambiguousCustomRows, imageRows, imageFiles: imageFiles.length }));
