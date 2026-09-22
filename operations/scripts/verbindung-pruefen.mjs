#!/usr/bin/env node
// Prueft den Zugang zur Admin API, ohne Geheimnisse auszugeben.
// Aufruf: npm run operations:verbindung
import { erzeugeProxy } from '../sync/zugang.mjs';

const PFLICHT = ['read_orders', 'write_orders', 'read_customers', 'read_products', 'read_fulfillments'];

try {
  const { proxy, art, scope } = await erzeugeProxy();
  if (art === 'sammeln') {
    console.log('KEIN ZUGANG: weder SHOPIFY_ADMIN_TOKEN noch SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET in .env.local.');
    process.exit(2);
  }
  const data = await proxy.execute('query { shop { name } ordersCount(limit: 10000) { count } }');
  const fehlend = scope ? PFLICHT.filter(s => !scope.split(',').includes(s)) : [];
  console.log(JSON.stringify({ ok: true, zugang: art, shop: data.shop.name, bestellungen: data.ordersCount.count, bereiche: scope || '(Admin-Token, nicht ausgewiesen)', fehlendeBereiche: fehlend }, null, 2));
  process.exit(fehlend.length ? 3 : 0);
} catch (e) {
  console.error(`FEHLER: ${e.message}`);
  process.exit(1);
}
