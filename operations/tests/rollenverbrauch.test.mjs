import assert from 'node:assert/strict';
import test from 'node:test';
import { rollenverbrauch } from '../lib/rollenverbrauch.mjs';
const rechnen = (b, l, opt = {}) => rollenverbrauch({ breiteCm:b, laengeCm:l, preisQmCent:5700, kettelMeterCent:1900, ...opt });
test('2 x 3 m verbraucht 2 laufende Meter; beide Angebote haben danach 18 m', () => {
  const r = rechnen(200,300);
  assert.equal(r.rollenCm,200);
  assert.equal(r.rollenFlaecheQm,8);
  assert.equal(r.teppichFlaecheQm,6);
  assert.equal(2000-r.rollenCm,1800);
  assert.equal(r.materialCent,34200);
  assert.equal(r.kettelCent,19000);
  assert.equal(r.gesamtCent,53200);
});
test('Gleiche Zuschnitte in beiden Orientierungen belegen gleich viel', () => {
  assert.deepEqual(rechnen(200,300),rechnen(300,200));
  assert.deepEqual(rechnen(250,700),rechnen(700,250));
  assert.equal(rechnen(250,700).rollenCm,700);
  assert.equal(rechnen(400,1000).rollenCm,1000);
});
test('Meterware und mehrere Teppiche werden addiert, nicht nur einmal abgezogen', () => {
  assert.equal(rechnen(200,300,{anzahl:3}).rollenCm,600);
  assert.equal(rechnen(400,200).rollenCm,200);
  assert.equal(rechnen(400,200,{maxLaengeCm:2000}).rollenFlaecheQm,8);
});
test('Bruchteile eines Zentimeters reservieren nach oben, Geld wird auf Cent gerundet', () => {
  const r = rechnen(200.01,300);
  assert.equal(r.rollenCm,201);
  assert.equal(r.materialCent,34202);
});
test('Fehlende, manipulierte oder nicht passende Masse werden abgewiesen', () => {
  for (const [b,l] of [[0,300],[-1,300],[NaN,300],[500,600],[400,1001],[1.001,300]]) assert.throws(()=>rechnen(b,l));
  assert.throws(()=>rechnen(200,300,{anzahl:0}));
  assert.throws(()=>rechnen(200,300,{preisQmCent:-1}));
});
