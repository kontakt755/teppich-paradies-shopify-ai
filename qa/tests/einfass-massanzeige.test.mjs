import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/tp-einfass-konfigurator.js', import.meta.url), 'utf8');
function funktion(name) {
  const start = source.indexOf('    function ' + name + '(');
  const ende = source.indexOf('\n    }', start) + 6;
  assert.ok(start > 0 && ende > start, name);
  return source.slice(start, ende);
}
const context = vm.createContext({ rechnen: () => {} });
vm.runInContext(funktion('lesen') + '\n' + funktion('massFeldAbschliessen'), context);

test('abgeschlossenes Feld zeigt dieselben ganzen cm wie Vorschau und Bestellung', () => {
  for (const [vorher, nachher] of [['200.5', '201'], ['300.01', '301'], ['200.0', '200'], ['50', '50']]) {
    const input = { value: vorher, validity: { badInput: false } };
    const bestellmass = context.lesen(input).wert;
    context.massFeldAbschliessen(input);
    assert.equal(input.value, nachher);
    assert.equal(context.lesen(input).wert, bestellmass, 'Abrechnung bleibt gleich');
  }
});

test('leere oder fehlerhafte Eingaben bleiben fuer die vorhandene Fehlermeldung erhalten', () => {
  for (const [value, badInput] of [['', false], ['0', false], ['-5', false], ['abc', false], ['1e309', false], ['200,5', true]]) {
    const input = { value, validity: { badInput } };
    context.massFeldAbschliessen(input);
    assert.equal(input.value, value);
  }
});
