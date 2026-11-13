// Private Regeldatei lieferanten/lagerware.json (#1995) - erfundene Praefixe, keine echten SKUs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lagerwarePfad, leseLagerware, markiereLagerware, LagerwareFehler } from '../lib/lagerware.mjs';

function regeldatei(inhalt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lagerware-'));
  const file = lagerwarePfad(dir);
  if (inhalt !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt));
  }
  return file;
}

test('fehlende Datei = keine Regeln; vorhandene Regeln werden getrimmt gelesen', () => {
  assert.deepEqual(leseLagerware(regeldatei()), { vorhanden: false, regeln: [], ohneRolle: [] });
  const file = regeldatei({ _zweck: 'Test', regeln: [{ skuPraefix: ' TEST-LAGER ', hinweis: ' Rolle im Lager ' }, { skuPraefix: 'TEST-ROLLE' }] });
  assert.deepEqual(leseLagerware(file), { vorhanden: true, regeln: [{ skuPraefix: 'TEST-LAGER', hinweis: 'Rolle im Lager' }, { skuPraefix: 'TEST-ROLLE', hinweis: null }], ohneRolle: [] });
  assert.ok(lagerwarePfad('/x').endsWith(path.join('lieferanten', 'lagerware.json')));
});

test('beschaedigte oder falsch aufgebaute Datei wirft - nie still leer', () => {
  for (const kaputt of ['{ nicht json', JSON.stringify([]), JSON.stringify({ regeln: {} }), JSON.stringify({ regeln: [{ skuPraefix: 'T' }] }),
    JSON.stringify({ regeln: [{ skuPraefix: 'TEST', hinweis: 5 }] }), JSON.stringify({ regeln: [null] })]) {
    assert.throws(() => leseLagerware(regeldatei(kaputt)), LagerwareFehler, kaputt);
  }
  assert.throws(() => leseLagerware(regeldatei('{')), /beschädigt – Lagerware wird nicht erkannt/);
});

test('markiereLagerware: Warenpositionen in allen Listen, nie Muster oder Eigenleistung', () => {
  const p = extra => ({ lineItemId: 'l1', sku: 'TEST-LAGER-1', ...extra });
  const modell = {
    auftraege: [{ positionen: [p(), p({ lineItemId: 'm1', istMuster: true }), p({ lineItemId: 'k1', eigenleistung: true }), p({ lineItemId: 'w1', sku: 'TEST-WARE-1' })] }],
    testauftraege: [{ positionen: [p({ lineItemId: 't1' })] }],
    gruppen: [{ positionen: [p()] }], musterGruppen: [{ positionen: [p({ istMuster: true })] }],
  };
  assert.equal(markiereLagerware(modell, [{ skuPraefix: 'test-lager', hinweis: 'Rolle im Lager' }]), 2, 'Auftrag und Testauftrag');
  const [a] = modell.auftraege;
  assert.deepEqual(a.positionen.map(x => x.lagerware === true), [true, false, false, false]);
  assert.equal(a.positionen[0].lagerHinweis, 'Rolle im Lager');
  assert.equal(modell.gruppen[0].positionen[0].lagerware, true, 'auch die Kopien in den Gruppen');
  assert.equal(modell.musterGruppen[0].positionen[0].lagerware, undefined);
  assert.equal(markiereLagerware(modell, []), 0);
});
