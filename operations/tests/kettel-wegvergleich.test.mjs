import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vergleiche } from '../scripts/kettel-wegvergleich.mjs';

// Kleine Beispielwerte, Erwartungen von Hand gerechnet.
const v = wert => ({ wert, quelle: 'Test' });
const eingaben = {
  werte: {
    ekRohwareJeM2: v(10), zugabeM: v(0.03),
    kettlerBis6qmJeLfm: v(3), kettlerAb6qmJeLfm: v(5), arbeitMin: v(15), stundensatz: v(30),
    fahrtGebuendelt: v(0), fahrtEigens: v(60),
    lieferantKettelnJeLfm: v(4), lieferantFracht: v(20), lieferantMindermenge: v(18), lieferantMindermengeUnterEk: v(300),
  },
  gel: { '2x3': v(50), '3x4': v(null) },
};

test('2x3 gebuendelt: Weg A und B Posten fuer Posten, B guenstiger', () => {
  const [r] = vergleiche(eingaben, { groessen: [[2, 3]] });
  // A: Material 2,03 x 3,03 x 10 = 61,509; Ketteln 10 m x 3 (6 m2 ist nicht ueber 6); Arbeit 7,50; GEL 50
  assert.equal(r.a.summe, 149.01);
  // B: Material 60; Ketteln 10 m x 4; Fracht 20; Mindermenge 18 (EK 60 unter 300)
  assert.equal(r.b.summe, 138);
  assert.equal(r.guenstiger, 'B');
  assert.equal(r.differenz, 11.01);
  // Bis zu dieser Fracht des Lieferanten bleibt B guenstiger: 149,009 - 118
  assert.equal(r.frachtGleichstandB, 31.01);
});

test('eigene Fahrt kommt nur auf Weg A dazu', () => {
  const [r] = vergleiche(eingaben, { groessen: [[2, 3]], fahrt: 'eigens' });
  assert.equal(r.a.summe, 209.01);
  assert.equal(r.b.summe, 138);
});

test('fehlender GEL-Preis: keine Summe, Grund steht in offen', () => {
  const [r] = vergleiche(eingaben, { groessen: [[3, 4]] });
  assert.equal(r.a.summe, null);
  assert.equal(r.guenstiger, null);
  assert.ok(r.offen.some(t => t.includes('GEL')));
});

test('echte Eingabedatei: jeder Wert hat eine Quelle', () => {
  const echt = JSON.parse(fs.readFileSync(new URL('../../docs/analyse/kettel-wegvergleich-eingaben.json', import.meta.url), 'utf8'));
  for (const [k, e] of [...Object.entries(echt.werte), ...Object.entries(echt.gel)]) assert.ok(e.quelle?.trim(), k);
  assert.equal(vergleiche(echt).length, 3);
});
