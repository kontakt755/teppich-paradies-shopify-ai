// Nr. 21 (Inhaber 03.11.2026): Die Regel heisst "Bis zu zwei Muster je Bestellung kostenlos".
// "2 Farben eines Produkts" oder eine Mengenangabe ohne "je Bestellung" klang nach etwas anderem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ALT = /Bis zu 2 (Muster kostenlos|Farben)|Bis zu zwei (Farben|Farbmuster)|bis zu zwei Muster (kostenlos|schicken|sind)/i;

test('Shoptexte und Social-Vorlage nennen die Musterregel einheitlich', () => {
  const dateien = ['sections', 'snippets', 'blocks', 'templates'].flatMap((o) => readdirSync(path.join(root, o)).map((n) => `${o}/${n}`));
  const offen = dateien.filter((d) => ALT.test(readFileSync(path.join(root, d), 'utf8')));
  assert.deepEqual(offen, []);
  assert.doesNotMatch(readFileSync(path.join(root, 'social/lib/texte.mjs'), 'utf8'), /bis zu 3 Muster/);
});
