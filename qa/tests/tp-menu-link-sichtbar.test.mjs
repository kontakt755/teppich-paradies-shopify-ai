// Saisonale Menuepunkte (Angebote, Reste & Sonderposten) duerfen nur mit Inhalt
// erscheinen (snippets/tp-menu-link-sichtbar.liquid). Der Gesamttest am 2026-10-08
// fand eine fuenfte Ausgabestelle ohne Pruefung (Vorab-Liste im Drawer) - dieser
// Test haelt jede Schleife ueber Menue-Links an die Pruefung gebunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Schleifen ueber oberste Menue-Ebenen. Untermenues (link.links, parent_link.links,
// c.links), die Brotkrumen-Suche und Kachel-Zuordnungen geben keine Hauptpunkte aus.
const SCHLEIFE = /{%-?\s*for (\w+) in (block_settings\.menu|linklist|block\.settings\.menu|tp_fl_sortiment|tp_fl_service)\.links\s*-?%}|^\s*for (\w+) in linklist\.links\s*$/m;
const AUSNAHMEN = new Set([
  'snippets/header-drawer.liquid:featured', // Horizon featured_products: liest nur die erste Kollektion
  'blocks/tp-footer-links.liquid:tp_fl_service', // Service-Menue: keine Kollektionen
]);

const dateien = ['blocks', 'snippets', 'sections'].flatMap((o) => readdirSync(path.join(root, o)).filter((n) => n.endsWith('.liquid')).map((n) => `${o}/${n}`));

test('jede Schleife ueber Hauptmenue-Links prueft tp-menu-link-sichtbar', () => {
  const offen = [];
  for (const datei of dateien) {
    const zeilen = readFileSync(path.join(root, datei), 'utf8').split('\n');
    zeilen.forEach((z, i) => {
      const m = z.match(SCHLEIFE);
      if (!m) return;
      if (/^\s*for link in linklist\.links\s*$/.test(z) && AUSNAHMEN.has(`${datei}:featured`)) return;
      if (m[2] === 'tp_fl_service' && AUSNAHMEN.has(`${datei}:tp_fl_service`)) return;
      const danach = zeilen.slice(i, i + 4).join('\n');
      if (!/render 'tp-menu-link-sichtbar'/.test(danach)) offen.push(`${datei}:${i + 1}`);
    });
  }
  assert.deepEqual(offen, [], 'Schleife ohne Sichtbarkeitspruefung');
});
