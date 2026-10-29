// Rundgang 29.10. (T8): das Lexikon zeigt den Lieferanten mit Namen aus den Stammdaten wie
// Packstation und Bestellen, nicht das Kuerzel. Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Lexikon: Lieferantenspalten laufen ueber lieferantName() mit den Stammdaten', () => {
  const quelle = fs.readFileSync(new URL('../ansichten/lexikon.mjs', import.meta.url), 'utf8');
  assert.equal((quelle.match(/<td data-l="Lieferant">\$\{lieferantZelle\(/g) || []).length, 2, 'Bestell- und Mustertabelle');
  assert.doesNotMatch(quelle, /<td data-l="Lieferant">\$\{lexWert\(/);
  // Nach dem Laden der Stammdaten zeichnet auch das Lexikon neu (Skill: "Nach dem Laden nicht neu gezeichnet").
  const fluss = fs.readFileSync(new URL('../ansichten/einkauf/auftragsfluss.mjs', import.meta.url), 'utf8');
  assert.match(fluss, /\['einkauf', 'kunden', 'lexikon'\]\.includes\(state\.route\.view\)/);
});

test('lieferantName: Name aus Stammdaten, sonst "Lieferant X", ungeklaert lesbar', async () => {
  const { lieferantName } = await import('../lib/einkauf-lieferanten.mjs');
  assert.equal(lieferantName('A', [{ id: 'A', name: 'Testgrosshandel' }]), 'Testgrosshandel');
  assert.equal(lieferantName('A', []), 'Lieferant A');
  assert.equal(lieferantName('UNGEKLAERT', []), 'Lieferant nicht zugeordnet');
});
