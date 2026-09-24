import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefe, seitenBefunde, preisBefunde, PFLICHTSEITEN, LANGSAM_MS } from '../lib/shopwache.mjs';

const JETZT = new Date('2026-09-24T12:00:00Z');

/** Ersatz fuer fetch: liefert je URL einen Status und einen Text. */
function holerMit(antworten) {
  return async (url) => {
    const eintrag = Object.entries(antworten).find(([teil]) => url.includes(teil))?.[1];
    if (!eintrag) return { status: 200, text: async () => '' };
    if (eintrag.wirft) throw new Error(eintrag.wirft);
    return { status: eintrag.status ?? 200, text: async () => eintrag.text ?? '' };
  };
}

test('sauberer Shop: Ampel gruen, keine Befunde', async () => {
  const r = await pruefe(holerMit({}), { basis: 'https://shop.example', jetzt: JETZT });
  assert.equal(r.ampel, 'gruen');
  assert.equal(r.kritisch, 0);
  assert.equal(r.seiten.length, PFLICHTSEITEN.length);
});

test('nicht erreichbare Startseite ist kritisch', async () => {
  const r = await pruefe(holerMit({ 'shop.example/': { wirft: 'connect ECONNREFUSED' } }), { basis: 'https://shop.example', jetzt: JETZT });
  assert.equal(r.ampel, 'rot');
  assert.ok(r.befunde.some(b => b.art === 'kritisch' && /nicht erreichbar/.test(b.titel)));
});

test('fehlendes Impressum ist kritisch, langsame Suche nur eine Warnung', () => {
  const impressum = PFLICHTSEITEN.find(s => s.name === 'Impressum');
  const b1 = seitenBefunde({ url: 'x', status: 404, dauerMs: 100, fehler: null }, impressum);
  assert.equal(b1[0].art, 'kritisch');

  const suche = PFLICHTSEITEN.find(s => s.name === 'Suche');
  const b2 = seitenBefunde({ url: 'x', status: 200, dauerMs: LANGSAM_MS + 1, fehler: null }, suche);
  assert.equal(b2[0].art, 'warnung');
  assert.match(b2[0].titel, /langsam/);
});

test('abweichender Preis wird gemeldet, gleicher Preis nicht', () => {
  const json = { variants: [{ price: 5590 }] };
  assert.deepEqual(preisBefunde(json, { handle: 'teppich', preis: 55.9 }), []);
  const abweichend = preisBefunde(json, { handle: 'teppich', preis: 49.9 });
  assert.equal(abweichend[0].art, 'kritisch');
  assert.match(abweichend[0].text, /55\.90 €.*49\.90 €/);
});

test('Produktseite ohne Varianten meldet einen Hinweis statt zu rechnen', () => {
  const b = preisBefunde({ variants: [] }, { handle: 'weg', preis: 10 });
  assert.equal(b[0].art, 'warnung');
  assert.match(b[0].text, /keine Varianten/);
});

test('Preisstichprobe laeuft ueber die .js-Antwort des Shops', async () => {
  const holen = holerMit({ '/products/teppich.js': { status: 200, text: JSON.stringify({ variants: [{ price: 4990 }] }) } });
  const r = await pruefe(holen, { basis: 'https://shop.example', stichproben: [{ handle: 'teppich', preis: 49.9 }], jetzt: JETZT });
  assert.equal(r.preise[0].inOrdnung, true);
  assert.equal(r.preise[0].imShop, 49.9);
});

test('ohne basis wirft pruefe - ein leerer Lauf waere schlimmer als ein Fehler', async () => {
  await assert.rejects(() => pruefe(holerMit({}), {}), /basis/);
});
