import test from 'node:test';
import assert from 'node:assert/strict';
import { merkeEingabe, stelleEingabeWiederHer } from '../lib/eingabe.mjs';

/** Minimales Eingabefeld - nur das, was die Funktionen anfassen. */
function feld({ param = 'kq', wert = '', start = null } = {}) {
  return {
    dataset: { param },
    value: wert,
    selectionStart: start ?? wert.length,
    selectionEnd: start ?? wert.length,
    fokussiert: false,
    focus() { this.fokussiert = true; },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
  };
}

test('ohne Eingabefeld gibt es nichts zu merken', () => {
  assert.equal(merkeEingabe(null, () => true), null);
  assert.equal(merkeEingabe({ dataset: {} }, () => true), null);
  // Element ausserhalb des neu gezeichneten Bereichs (z. B. Schnellsuche)
  assert.equal(merkeEingabe(feld({ wert: 'x' }), () => false), null);
});

test('Wert, Fokus und Cursor ueberleben ein Neuzeichnen', () => {
  const vorher = feld({ wert: 'christel', start: 3 });
  const merk = merkeEingabe(vorher, () => true);
  // Das neu gezeichnete Feld traegt den Wert aus der Adresszeile - hier noch leer.
  const nachher = feld({ wert: '' });
  assert.equal(stelleEingabeWiederHer(nachher, merk), true);
  assert.equal(nachher.value, 'christel');
  assert.equal(nachher.fokussiert, true);
  assert.equal(nachher.selectionStart, 3);
});

test('schnelles Tippen mit Neuzeichnen dazwischen verliert kein Zeichen', () => {
  // Der Fall aus dem Betrieb: die Adresszeile hinkt der Eingabe hinterher,
  // waehrend ein Datenabgleich mitten im Tippen neu zeichnet.
  let sichtbar = feld({ wert: '' });
  const ausDerAdresse = ['', '', 'chr', 'chr', 'christ'];
  let getippt = '';
  for (const [i, zeichen] of [...'christel'].entries()) {
    getippt += zeichen;
    sichtbar.value = getippt;
    sichtbar.selectionStart = sichtbar.selectionEnd = getippt.length;
    if (i < ausDerAdresse.length) {           // Neuzeichnen mitten im Tippen
      const merk = merkeEingabe(sichtbar, () => true);
      const neu = feld({ wert: ausDerAdresse[i] });
      stelleEingabeWiederHer(neu, merk);
      sichtbar = neu;
    }
  }
  assert.equal(sichtbar.value, 'christel');
  assert.equal(sichtbar.selectionStart, 'christel'.length);
});

test('ohne gemerkten Wert bleibt das Feld unangetastet', () => {
  const f = feld({ wert: 'aus der Adresse' });
  assert.equal(stelleEingabeWiederHer(f, null), false);
  assert.equal(f.value, 'aus der Adresse');
  assert.equal(f.fokussiert, false);
});

test('Cursor landet am Ende, wenn keine Position gemerkt ist', () => {
  const f = feld({ wert: '' });
  stelleEingabeWiederHer(f, { param: 'kq', wert: 'abc', start: null, ende: null });
  assert.equal(f.selectionStart, 3);
});
