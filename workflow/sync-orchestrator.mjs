#!/usr/bin/env node

/**
 * JordanShop Sync Orchestrator
 *
 * Diese Datei wird von Claude aus aufgerufen und orchestriert den Sync über MCP.
 * NICHT direkt aus Node ausgeführt — das funktioniert nicht.
 *
 * Der echte Sync läuft über:
 *   npm run sync:jordanshop:mcp
 *
 * Das startet eine Claude-Konversation, die:
 * 1. Die Sync-Logik lädt
 * 2. GraphQL-Calls über Shopify MCP macht
 * 3. Ergebnisse zurückgibt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export async function orchestrateSync() {
  console.log('╔═════════════════════════════════════════════╗');
  console.log('║  JordanShop → Shopify Sync (via MCP)        ║');
  console.log('║  Orchestrated by Claude — Kein Token nötig  ║');
  console.log('╚═════════════════════════════════════════════╝\n');

  const catalogPath = path.join(rootDir, 'data', 'jordan-catalog.json');
  const categoriesPath = path.join(rootDir, 'data', 'jordan-categories.json');

  if (!fs.existsSync(catalogPath) || !fs.existsSync(categoriesPath)) {
    console.error('❌ Catalog oder Categories nicht vorhanden');
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));

  const activeCategories = categories.categories.filter(c => c.active);

  console.log(`📦 ${catalog.length} Artikel in Katalog`);
  console.log(`📁 ${activeCategories.length} aktive Kategorien\n`);

  console.log('📋 Zu synchronisierende Artikel:');
  catalog.forEach(article => {
    console.log(`   • ${article.titel} (externe_id: ${article.externe_id})`);
  });

  console.log('\n🚀 SYNC-INSTRUKTIONEN FÜR CLAUDE/MCP:\n');
  console.log(`
1. Nutze die Shopify GraphQL Admin API über den MCP
2. Abfrage: Hole alle existierenden Produkte mit Metafeld "grosshandel.externe_id"
3. Vergleich: Neue Artikel vs. existierende (via externe_id)
4. Für neue Artikel: Erstelle Draft-Produkte mit Preis + Metafeld
5. Für existierende: Update Preise (via productVariantsBulkUpdate)
6. Report: Zusammenfassung in .sync-reports/

Diese Datei selbst macht NICHTS — sie ist nur Dokumentation.
Der echte Sync wird durch "npm run sync:jordanshop:mcp" aufgerufen,
was Claude aktiviert, der diese Anweisungen liest und den Sync via MCP macht.
  `);

  return {
    status: 'WAITING_FOR_CLAUDE',
    message: 'Orchestrator bereit. Claude wird die GraphQL-Calls über MCP ausführen.',
    catalog,
    activeCategories,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  orchestrateSync().then(result => {
    console.log('\n✅ Orchestrator-Status:');
    console.log(JSON.stringify(result, null, 2));
  });
}
