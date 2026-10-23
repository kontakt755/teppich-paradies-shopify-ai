#!/usr/bin/env node
// Rein lokaler Plan. Ausfuehrung/Anlage bleibt beim authentifizierten Shopify-MCP.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { planeRestEntwuerfe, bindeRestPlan, pruefeRestReadback } from './lib/restposten-entwurf.mjs';
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes('--help') || !value('--input') || !value('--out') || !value('--location')) {
  console.log('node operations/restposten-entwurf.mjs --input <private.json> --out <privater Ordner> --location <Location-GID> [--snapshot <frischer Draft-Readback.json>]');
  process.exit(args.includes('--help') ? 0 : 1);
}
const out = resolve(value('--out'));
if (out.startsWith(resolve(import.meta.dirname, '..') + '/')) throw new Error('Rohdaten/Plan ausserhalb des Repositorys ablegen');
const input = JSON.parse(readFileSync(value('--input'), 'utf8'));
const plan = planeRestEntwuerfe(input, { locationId: value('--location') });
mkdirSync(out, { recursive: true });
const save = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n');
save('plan.json', plan);
save('offen.json', { offen: plan.offen, hinweis: 'Keine Preise, Masse, Bestaende oder Veroeffentlichungen vorhandener Produkte aendern.' });
for (let i = 0; i < plan.products.length; i += 9) {
  save(`anlegen-${String(i / 9 + 1).padStart(3, '0')}.json`, plan.products.slice(i, i + 9));
}
if (value('--snapshot')) {
  const snapshot = JSON.parse(readFileSync(value('--snapshot'), 'utf8'));
  const products = snapshot.products ?? snapshot.data?.products?.nodes ?? [];
  const bound = bindeRestPlan(plan, products);
  save('verknuepfung.json', bound);
  if (bound.rollback.length && !existsSync(join(out, 'rollback.json'))) save('rollback.json', bound.rollback);
  if (args.includes('--verify')) save('write-log.json', { status: 'vollstaendig gegen Shopify zurueckgelesen', verification: pruefeRestReadback(plan, products) });
}
console.log(JSON.stringify({ positionen: input.records.length, produkte: plan.products.length, varianten: plan.products.reduce((n, p) => n + p.input.variants.length, 0), preise: plan.preise, out }, null, 2));
