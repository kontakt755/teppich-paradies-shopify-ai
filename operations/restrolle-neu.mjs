#!/usr/bin/env node
// Rein lokaler Plan fuer eine neue Restrolle. Die Anlage laeuft danach ueber den
// authentifizierten Shopify-MCP nach der Liste "ablauf" im Plan.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { privaterAusgabeordner } from './lib/restposten-entwurf.mjs';
import { planeNeueRestrolle } from './lib/restrolle-neu.mjs';
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes('--help') || !value('--input') || !value('--out') || !value('--location')) {
  console.log('npm run -s restrolle:plan -- --input <rolle.json> --out <privater Ordner> --location <Location-GID>');
  console.log('rolle.json: code, sumupId, name, vendor, farbcode, breiteCm, gemesseneLaengeCm, florhoeheMm, preisQm, uvpQm, uvpBeleg, foto');
  process.exit(args.includes('--help') ? 0 : 1);
}
const out = privaterAusgabeordner(value('--out'), resolve(import.meta.dirname, '..'));
const plan = planeNeueRestrolle(JSON.parse(readFileSync(value('--input'), 'utf8')), { locationId: value('--location') });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `plan-${plan.rolle.code.toLowerCase()}.json`), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ rolle: plan.rolle.name, bestandQm: plan.bestandQm, maxLaengeCm: plan.maxLaengeCm, handles: plan.products.map(p => p.input.handle), preise: plan.preise, ablauf: plan.ablauf, out }, null, 2));
