// templates/product.einfassung.json ist die gemeinsame Vorlage aller Teppiche nach Mass.
// Der Theme-Editor ist nur eine Oberflaeche ueber diese Datei - die Reihenfolge der Bloecke
// ist deshalb testbar:
//  - Der Muster-Aufruf steht direkt unter der Farbwahl (Schritt 1), vor dem Konfigurator
//    (Schritt 2), nicht erst unter dem Rechner.
//  - Die technischen Daten stehen in einer Akkordeonzeile "Technische Daten" wie auf der
//    Meterware-Seite, vor dem Beschreibungstext, und nicht mehr unsichtbar am Seitenende.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const roh = readFileSync(path.join(root, 'templates/product.einfassung.json'), 'utf8');
const doc = JSON.parse(roh.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
const details = doc.sections.main.blocks['product-details'];
const order = details.block_order;
const typ = (id) => details.blocks[id]?.type;
const index = (t) => order.findIndex((id) => typ(id) === t);

test('jede Blockreferenz in block_order hat einen Block und umgekehrt', () => {
  assert.deepEqual([...order].sort(), Object.keys(details.blocks).sort());
});

test('Muster-Aufruf steht direkt unter der Farbwahl und vor dem Konfigurator', () => {
  const farbwahl = index('color-swatch-picker');
  const muster = index('tp-muster-cta');
  const konfigurator = index('tp-einfass-konfigurator');
  assert.ok(farbwahl >= 0 && muster >= 0 && konfigurator >= 0, 'Block fehlt');
  assert.equal(muster, farbwahl + 1, 'Muster-Aufruf muss unmittelbar auf die Farbwahl folgen');
  assert.ok(muster < konfigurator, 'Muster-Aufruf darf nicht unter dem Rechner stehen');
});

test('Muster-Aufruf behaelt seine Einstellungen (nur die Position aendert sich)', () => {
  const id = order[index('tp-muster-cta')];
  assert.deepEqual(details.blocks[id].settings, {
    label: 'Kostenloses Muster anfragen',
    hinweis: 'Bis zu 3 Farben, versandkostenfrei',
  });
});

test('Technische Daten: Tabelle liegt in der Akkordeonzeile, vor dem Beschreibungstext', () => {
  const akkordeon = order.find((id) => typ(id) === 'accordion');
  assert.ok(akkordeon, 'Akkordeon fehlt');
  const zeile = details.blocks[akkordeon].blocks[details.blocks[akkordeon].block_order[0]];
  assert.equal(zeile.type, '_accordion-row');
  assert.equal(zeile.settings.heading, 'Technische Daten');
  assert.deepEqual(zeile.block_order.map((id) => zeile.blocks[id].type), ['tp-produktinfo-tabelle']);
  // Die Tabelle steht nicht zusaetzlich noch einmal lose im Detailbereich.
  assert.equal(order.filter((id) => typ(id) === 'tp-produktinfo-tabelle').length, 0);
  const beschreibung = order.findIndex((id) => typ(id) === 'text' && String(details.blocks[id].settings.text).includes('closest.product.description'));
  assert.ok(beschreibung > order.indexOf(akkordeon), 'Technische Daten gehoeren vor den Beschreibungstext');
});

test('Block-IDs sind im ganzen Template eindeutig', () => {
  const ids = [];
  const sammeln = (knoten) => {
    for (const [id, b] of Object.entries(knoten ?? {})) {
      ids.push(id);
      sammeln(b.blocks);
    }
  };
  for (const s of Object.values(doc.sections)) sammeln(s.blocks);
  assert.equal(new Set(ids).size, ids.length, 'doppelte Block-ID');
});

test('alle verwendeten eigenen Block-Typen existieren als Datei', () => {
  const typen = new Set();
  const sammeln = (knoten) => {
    for (const b of Object.values(knoten ?? {})) {
      if (/^tp-/.test(b.type)) typen.add(b.type);
      sammeln(b.blocks);
    }
  };
  for (const s of Object.values(doc.sections)) sammeln(s.blocks);
  for (const t of typen) assert.ok(existsSync(path.join(root, 'blocks', `${t}.liquid`)), `blocks/${t}.liquid fehlt`);
});
