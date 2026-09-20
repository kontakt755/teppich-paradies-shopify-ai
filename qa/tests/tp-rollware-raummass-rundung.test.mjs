// TP-004: Raummaß im Hundertstel-Modus (cmExact) rundete an exakten
// Halbwerten zu niedrig, weil (w*len/10000)*100 durch zwei verkettete
// Gleitkommaoperationen aus 832,5 die Zahl 832,4999999999999 macht und
// Math.round dann faelschlich abrundet. Extrahiert die echte
// roundedHundredthsQty()-Funktion aus blocks/tp-rollware-rechner.liquid und
// prueft sie gegen eine rein ganzzahlige Referenzimplementierung (floor+modulo,
// ohne jede Gleitkommadivision, damit die Referenz selbst nicht am gleichen
// Fehler leiden kann). Kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rollFile = 'blocks/tp-rollware-rechner.liquid';
const rollSource = readFileSync(path.join(root, rollFile), 'utf8');

const start = rollSource.indexOf('  function roundedHundredthsQty(wCm, lenCm) {');
const end = rollSource.indexOf('\n  }', start) + '\n  }'.length;
assert.ok(start >= 0 && end > start, 'roundedHundredthsQty() nicht gefunden - Quelltext hat sich strukturell verändert');

const context = vm.createContext({});
vm.runInContext(rollSource.slice(start, end) + '\nthis.roundedHundredthsQty = roundedHundredthsQty;', context, { filename: rollFile, timeout: 1000 });
const roundedHundredthsQty = context.roundedHundredthsQty;

// Reine Ganzzahl-Referenz (kaufmaennische Rundung: exakt .50 rundet auf).
// Kein Gleitkomma-Divisionsschritt vor dem Runden - kann den TP-004-Fehler
// also nicht selbst reproduzieren.
function reference(wCm, lenCm) {
  const product = wCm * lenCm;
  const whole = Math.trunc(product / 100);
  const rest = product - whole * 100;
  return rest >= 50 ? whole + 1 : whole;
}

test('Akzeptanzkriterien aus dem Implementation Brief', () => {
  assert.equal(roundedHundredthsQty(250, 333), 833);
  assert.equal(roundedHundredthsQty(250, 169), 423);
  assert.equal(roundedHundredthsQty(50, 203), 102);
  assert.equal(roundedHundredthsQty(365, 302), 1102);
  assert.equal(roundedHundredthsQty(250, 201), 503);
  assert.equal(roundedHundredthsQty(333, 200), 666);
});

test('vollständiges Ganzzahlraster 50–500 × 100–5000 cm stimmt mit der Ganzzahl-Referenz überein', () => {
  let checked = 0;
  for (let w = 50; w <= 500; w++) {
    for (let len = 100; len <= 5000; len += 7) { // Schrittweite 7: volle Abdeckung aller Restklassen mod 100 bei vertretbarer Laufzeit
      const expected = reference(w, len);
      const actual = roundedHundredthsQty(w, len);
      assert.equal(actual, expected, `w=${w} len=${len}`);
      checked++;
    }
  }
  assert.ok(checked > 300000, `Rastergroesse zu klein: ${checked}`);
});

test('exakte Halbgrenzen runden konsistent auf (kaufmännisch)', () => {
  // product % 100 === 50 -> Halbgrenze
  for (let w = 50; w <= 500; w += 3) {
    for (let len = 100; len <= 1000; len += 3) {
      if ((w * len) % 100 !== 50) continue;
      const qty = roundedHundredthsQty(w, len);
      assert.equal(qty, Math.trunc((w * len) / 100) + 1, `Halbgrenze w=${w} len=${len} muss aufrunden`);
    }
  }
});

test('TP-004: derselbe Rundungsumweg im Meterware-Preisvergleich (updateMeterTipp) wird per Epsilon korrigiert', () => {
  // ART.meterwareGuenstiger uebergibt dem Bill-Callback nur die bereits ueber
  // cm²/10000 gebildete (und damit potenziell unterschrittene) Flaeche, keine
  // rohen cm-Masse - deshalb hier direkt die reparierte Callback-Formel aus
  // updateMeterTipp() pruefen, nicht die Bibliotheksfunktion selbst.
  const callStart = rollSource.indexOf('cmExact ? function (a) { return Math.round(a * 100 + 1e-9) / 100; } : Math.ceil');
  assert.ok(callStart >= 0, 'reparierte Rundungs-Callback-Formel nicht gefunden');

  const billForCmExact = (a) => Math.round(a * 100 + 1e-9) / 100;
  // Bekannter Grenzfall aus TP-004: 250x333 cm ergibt ueber (w*len/10000) eine
  // Flaeche, die knapp unter 8,325 liegt.
  const undershotArea = (250 * 333) / 10000;
  assert.equal(billForCmExact(undershotArea), 8.33, 'muss trotz Gleitkomma-Unterschreitung auf 8,33 m² aufrunden');
});
