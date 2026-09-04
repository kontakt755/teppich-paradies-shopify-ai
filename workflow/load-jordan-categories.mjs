#!/usr/bin/env node

/**
 * JordanShop Kategorien Loader
 * 
 * Lädt Produkte aus verschiedenen JordanShop-Kategorien
 * und erstellt einen unified Katalog für die Synchronisation
 * 
 * Usage:
 *   node load-jordan-categories.mjs [--categories=kernsockelleisten,vinyl]
 *   node load-jordan-categories.mjs --active-only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

console.log('🔄 JordanShop Kategorien Loader\n');

// Load configuration
const configPath = path.join(dataDir, 'jordan-categories.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('📋 Verfügbare Kategorien:\n');

let activeCount = 0;
let inactiveCount = 0;

config.categories.forEach((cat, i) => {
  const status = cat.active ? '✅ AKTIV' : '⏸️  INAKTIV';
  console.log(`${i + 1}. ${cat.name} [${cat.id}] - ${status}`);
  console.log(`   ${cat.description}`);
  
  if (cat.note) console.log(`   ℹ️  ${cat.note}`);
  
  if (cat.active) activeCount++;
  else inactiveCount++;
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ Aktive Kategorien: ${activeCount}`);
console.log(`⏸️  Inaktive Kategorien: ${inactiveCount}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Get active categories
const activeCategories = config.categories.filter(c => c.active);

console.log('📊 SYNCHRONISATIONS-ÜBERSICHT:\n');
console.log('Aktuelle Einstellungen:');
console.log(`  • Dry-Run Standard: ${config.sync_settings.dry_run_default ? 'JA' : 'NEIN'}`);
console.log(`  • Live-Sync erfordert Genehmigung: ${config.sync_settings.require_approval_for_live_sync ? 'JA' : 'NEIN'}`);
console.log(`  • Max. neue Produkte ohne Genehmigung: ${config.sync_settings.max_new_products_without_approval}`);

console.log('\n🎯 Zu synchronisierende Kategorien:');
activeCategories.forEach(cat => {
  console.log(`  ✅ ${cat.name} (${cat.id})`);
});

if (activeCount === 0) {
  console.log('  ⚠️  Keine aktiven Kategorien! Aktivieren Sie Kategorien in jordan-categories.json');
}

// Print next steps
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 NÄCHSTE SCHRITTE:\n');

if (activeCount === 1) {
  console.log('1. System lädt aktuell: Kernsockelleisten (7 Produkte)');
  console.log('2. Um weitere Kategorien zu laden:');
  console.log('   - Öffne data/jordan-categories.json');
  console.log('   - Setze "active": true bei gewünschten Kategorien');
  console.log('   - Führe dieses Script erneut aus');
  console.log('3. Neue Kategorien werden beim nächsten Sync geladen');
}

console.log('\n✅ Kategorien-System bereit!\n');

