import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Audit 11.11.2026 Befund 2 (w-367): Das Laengenfeld im Rollenware-Rechner
// meldete Fehler nur im Text daneben. Jetzt traegt das Feld aria-invalid und
// verweist per aria-describedby auf die sichtbare Fehlerzeile; die gruene
// Bestaetigung ("Laenge = 5 cm") verschwindet bei Fehler.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rechner = readFileSync(join(root, 'blocks', 'tp-rollware-rechner.liquid'), 'utf8');
const rumpf = rechner.match(/function laengenfehlerMelden\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';

function aufbau({ min = false, format = false, max = false, markiert = false } = {}) {
  const p = (id, hidden) => ({ id, hidden });
  const attrs = new Map();
  const ctx = {
    errComma: p('fmt', !format), errMin: p('min', !min), errMax: p('max', !max),
    lengthEcho: p('echo', false),
    lengthInput: {
      setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k),
      classList: { contains: (c) => c === 'is-invalid' && markiert },
    },
  };
  if (markiert) attrs.set('aria-invalid', 'true');
  vm.runInNewContext(`(function(){${rumpf}})()`, ctx);
  return { attrs, echo: ctx.lengthEcho };
}

test('Laengenfehler: Feld meldet sich selbst als ungueltig und nennt die Fehlerzeile', () => {
  assert.ok(rumpf, 'laengenfehlerMelden im Rechner gefunden');
  const r = aufbau({ min: true });
  assert.equal(r.attrs.get('aria-invalid'), 'true');
  assert.equal(r.attrs.get('aria-describedby'), 'echo min');
  assert.equal(r.echo.hidden, true);
  assert.equal(aufbau({ format: true }).attrs.get('aria-describedby'), 'echo fmt');
  assert.equal(aufbau({ max: true }).attrs.get('aria-invalid'), 'true');
});

test('Laengenfehler: ohne Fehler kein aria-invalid, Echo bleibt; Kaufversuch-Markierung bleibt', () => {
  const ok = aufbau();
  assert.equal(ok.attrs.has('aria-invalid'), false);
  assert.equal(ok.attrs.get('aria-describedby'), 'echo');
  assert.equal(ok.echo.hidden, false);
  assert.equal(aufbau({ markiert: true }).attrs.get('aria-invalid'), 'true');
});

test('Laengenfehler: Fehlerzeilen haben IDs, roter Rand auch bei aria-invalid', () => {
  for (const id of ['len-min', 'len-format', 'len-max']) assert.match(rechner, new RegExp(`id="tp-rwc-${id}-\\{\\{ tp_rc_id \\}\\}"`));
  assert.match(rechner, /\.tp-rwc-input\[aria-invalid="true"\],/);
  assert.match(rechner, /errMax\.hidden = !tooLong;\s*\n\s*\}\s*\n\s*laengenfehlerMelden\(\);/);
});
