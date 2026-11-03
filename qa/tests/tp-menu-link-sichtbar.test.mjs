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

// Seit w-094 (2026-10-15) steht "Aktuelle Angebote" als Unterpunkt unter
// "Angebote & Reste". Ausgeblendet wird nur der Unterpunkt, nie der Oberpunkt
// mit Unterpunkten - sonst verschwaende "Reste & Sonderposten" mit.
test('Unterpunkt-Schleifen der Menues pruefen tp-menu-link-sichtbar', () => {
  const stellen = {
    'snippets/mega-menu-list.liquid': /{%\s*for link in parent_link\.links\s*%}/,
    'snippets/tp-drawer-liste.liquid': /{%-\s*for c in parent_link\.links\s*-%}/,
  };
  for (const [datei, muster] of Object.entries(stellen)) {
    const text = readFileSync(path.join(root, datei), 'utf8');
    const m = text.match(muster);
    assert.ok(m, `${datei}: Schleife nicht gefunden`);
    const danach = text.slice(m.index, m.index + 600);
    assert.match(danach, /render 'tp-menu-link-sichtbar', link: (link|c)\b/, `${datei}: Unterpunkt ohne Sichtbarkeitspruefung`);
  }
  const spalten = readFileSync(path.join(root, 'snippets/tp-menu-spalten.liquid'), 'utf8');
  const pruefungen = spalten.match(/render 'tp-menu-link-sichtbar'/g) ?? [];
  assert.ok(pruefungen.length >= 3, 'tp-menu-spalten: Karten, Kacheln und Gruppenlinks pruefen die Sichtbarkeit');
});

test('Oberpunkte mit Unterpunkten werden nie ausgeblendet', () => {
  const text = readFileSync(path.join(root, 'snippets/tp-menu-link-sichtbar.liquid'), 'utf8');
  assert.match(text, /if tmls_handle == 'angebote' and link\.links == blank/);
});

// Nr. 27 (03.11.2026): "Angebote & Reste" fuehrte seit Aktionsende auf eine leere Seite.
test('Knopf im Handy-Menue erscheint nur, wenn sein Ziel etwas zeigt', () => {
  const text = readFileSync(path.join(root, 'snippets/tp-drawer-liste.liquid'), 'utf8');
  assert.match(text, /render 'tp-menu-link-sichtbar', link: tp_dl_all, ziel_pruefen: true/);
  assert.match(text, /render 'tp-menu-link-sichtbar', link: parent_link, ziel_pruefen: true/);
  const knopf = text.indexOf('<a class="tp-dn-cta"');
  assert.ok(knopf > text.indexOf("unless tp_dl_cta_sichtbar contains 'nein'"), 'Knopf steht innerhalb der Pruefung');
  assert.match(readFileSync(path.join(root, 'snippets/tp-menu-link-sichtbar.liquid'), 'utf8'), /elsif tmls_handle == 'angebote' and ziel_pruefen/);
});

test('leere Angebotsseite zeigt Hinweis und Link zu Reste & Sonderposten', () => {
  const text = readFileSync(path.join(root, 'snippets/product-grid.liquid'), 'utf8');
  const stelle = text.indexOf("collection.handle == 'angebote'");
  assert.ok(stelle > 0, 'Fall fehlt');
  assert.match(text.slice(stelle, stelle + 600), /Gerade laufen keine Angebote[\s\S]*\/reste-sonderposten/);
});

test('Schnellsuche ueberspringt leere Kollektionen', () => {
  const text = readFileSync(path.join(root, 'snippets/tp-suche-ergebnisse.liquid'), 'utf8');
  assert.match(text, /for tp_se_k in predictive_search\.resources\.collections\n\s+if tp_se_k\.all_products_count == 0\n\s+continue/);
});
