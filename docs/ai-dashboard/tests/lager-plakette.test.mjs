import test from 'node:test';
import assert from 'node:assert/strict';
import { imLagerVon } from '../lib/musterlager-bestand.mjs';
import { DRUCK_LIMIT, druckBloecke } from '../lib/druckliste.mjs';
import { MAX_SEITEN } from '../../../operations/niimbot/b1.mjs';

test('imLagerVon: aus dem Lager zugeteilt, solange nichts gebucht ist', () => {
  const p = { istMuster: true, musterLager: { ort: 'B3' }, musterHerkunft: 'eigen_versand' };
  assert.deepEqual(imLagerVon(p), { ort: 'B3', stattLieferant: false });
  assert.equal(imLagerVon(p, 'raus'), null);
  assert.equal(imLagerVon({ ...p, musterHerkunft: 'eigen_vorbei' }), null);
});

test('imLagerVon: beim Lieferanten offen oder bestellt, liegt aber im Lager', () => {
  const p = { istMuster: true, musterLagerMoeglich: { id: 'x', ort: null } };
  assert.deepEqual(imLagerVon(p), { ort: '', stattLieferant: true });
  assert.deepEqual(imLagerVon(p, 'bestellt'), { ort: '', stattLieferant: true });
  assert.equal(imLagerVon(p, 'geliefert'), null);
});

test('imLagerVon: keine Plakette ohne Lagerangabe oder bei Ware', () => {
  assert.equal(imLagerVon({ istMuster: true }), null);
  assert.equal(imLagerVon({ istMuster: false, musterLager: { ort: 'B3' } }), null);
  assert.equal(imLagerVon(null), null);
});

// Der Mac-Druck schickt je Block einen Aufruf; der Server nimmt hoechstens MAX_SEITEN Seiten je Aufruf.
test('Mac-Druck: ein Druckblock passt immer in einen Serveraufruf', () => {
  assert.ok(DRUCK_LIMIT.transport <= MAX_SEITEN);
  const bloecke = [...druckBloecke(Array.from({ length: 250 }, (_, i) => i))];
  assert.equal(bloecke.length, 3);
  assert.ok(bloecke.every(b => b.etiketten.length <= MAX_SEITEN));
});
