import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Block und Regelwerk muessen dieselben Regeln und Zubehoer-Handles nennen.
// Eine Empfehlung ohne Beleg in docs/zubehoer-empfehlungen.md darf es nicht geben.
const block = readFileSync(new URL('../../blocks/tp-zubehoer-empfehlung.liquid', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../../docs/zubehoer-empfehlungen.md', import.meta.url), 'utf8');

/** Regeln im Block: when '<regel>' + assign tp_ze_regeln = '<gruppe|handle|hinweis;...>' */
function blockRegeln(src) {
  const out = new Map();
  const rx = /when '([a-z0-9-]+)'\s*\n\s*assign tp_ze_regeln = '([^']*)'/g;
  for (const m of src.matchAll(rx)) {
    const eintraege = m[2].split(';').map((e) => {
      const [gruppe, handle, hinweis] = e.split('|');
      return { gruppe, handle, hinweis };
    });
    out.set(m[1], eintraege);
  }
  return out;
}

/** Empfehlungstabelle im Dokument: | `regel` | Gruppe | `handle` | Beleg | */
function docRegeln(src) {
  const out = new Map();
  const rx = /^\| `([a-z0-9-]+)` \| (Unterlage|Kleber) \| `([a-z0-9-]+)` \| (.+) \|$/gm;
  for (const m of src.matchAll(rx)) {
    const gruppe = m[2] === 'Unterlage' ? 'unterlage' : 'kleber';
    if (!out.has(m[1])) out.set(m[1], []);
    out.get(m[1]).push({ gruppe, handle: m[3], beleg: m[4] });
  }
  return out;
}

const imBlock = blockRegeln(block);
const imDoc = docRegeln(doc);

test('Block enthaelt Regeln', () => {
  assert.ok(imBlock.size >= 8, `nur ${imBlock.size} Regeln gefunden - Parser passt nicht mehr zum Block`);
});

test('jede Empfehlung im Block ist im Regelwerk belegt (Regel, Gruppe, Handle)', () => {
  for (const [regel, eintraege] of imBlock) {
    const belegt = imDoc.get(regel);
    assert.ok(belegt, `Regel ${regel} fehlt in docs/zubehoer-empfehlungen.md`);
    for (const e of eintraege) {
      assert.ok(['unterlage', 'kleber'].includes(e.gruppe), `${regel}: unbekannte Gruppe ${e.gruppe}`);
      assert.ok(e.hinweis && e.hinweis.trim().length > 10, `${regel}/${e.handle}: Hinweis fehlt`);
      const d = belegt.find((x) => x.handle === e.handle);
      assert.ok(d, `${regel}: ${e.handle} steht nicht im Regelwerk`);
      assert.equal(d.gruppe, e.gruppe, `${regel}: ${e.handle} in anderer Gruppe als im Regelwerk`);
      assert.ok(d.beleg.trim().length > 10, `${regel}: ${e.handle} ohne Beleg`);
    }
  }
});

test('jede Zeile im Regelwerk ist im Block umgesetzt', () => {
  for (const [regel, eintraege] of imDoc) {
    const imCode = imBlock.get(regel);
    assert.ok(imCode, `Regel ${regel} aus dem Regelwerk fehlt im Block`);
    for (const e of eintraege) {
      assert.ok(imCode.some((x) => x.handle === e.handle), `${regel}: ${e.handle} fehlt im Block`);
    }
  }
});

test('keine Lieferantennamen im Block oder Regelwerk', () => {
  // AGENTS.md Punkt 8: nur Pseudonyme. Herstellernamen von Zubehoer sind erlaubt.
  for (const verboten of ['JOKA', 'Joka', 'Jordan', 'jordanshop']) {
    assert.ok(!block.includes(verboten), `Block nennt ${verboten}`);
    assert.ok(!doc.includes(verboten), `Regelwerk nennt ${verboten}`);
  }
});
