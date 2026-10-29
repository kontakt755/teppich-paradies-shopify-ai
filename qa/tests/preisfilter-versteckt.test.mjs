import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Liquid } from 'liquidjs';

// Standard-Preisfilter ausblenden, wo Variantenpreis und Kartenpreis auseinanderlaufen
// (snippets/tp-preisfilter-versteckt.liquid; w-189 Teppichboden, Paketware, nach Mass).
const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', {
  parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'enddoc') {} },
  render() { return ''; },
});
const snippet = read('snippets/tp-preisfilter-versteckt.liquid');
const versteckt = async (collection) => (await engine.parseAndRender(snippet, { collection })).trim() === 'ja';

test('Teppichboden-Kollektionen: Haupt, Unterkategorien, Marken, Buero, Nadelfilz-Preisklassen', async () => {
  for (const handle of ['teppichboden', 'teppichboden-velours', 'teppichboden-hochflor', 'teppichboden-sisal', 'jab-anstoetz-teppichboden', 'vorwerk-teppichboden', 'teppichboden-buero-gewerbe', 'angebote-teppichboden', 'nadelfilz-einstieg', 'nadelfilz-premium']) {
    assert.equal(await versteckt({ handle, title: 'x' }), true, handle);
  }
});

test('Paketware-Liste und Teppiche nach Mass bleiben ausgeblendet', async () => {
  for (const handle of ['vinylboden-1', 'vinylboden-klickvinyl', 'laminat', 'parkett', 'teppichfliesen', 'teppichplanken', 'angebote', 'teppich-nach-mass', 'sisal-kokos-teppiche-nach-mass']) {
    assert.equal(await versteckt({ handle, title: 'x' }), true, handle);
  }
  assert.equal(await versteckt({ handle: 'laeufer-xy', title: 'Läufer nach Maß' }), true, 'Titel nach Maß');
});

test('Alles andere behaelt den Standard-Preisfilter', async () => {
  for (const handle of ['teppiche', 'bodenleisten', 'zubehoer', 'sauberlaufmatten', 'linoleum', 'auslauf']) {
    assert.equal(await versteckt({ handle, title: 'Teppiche' }), false, handle);
  }
  assert.equal(await versteckt({ handle: '', title: '' }), false, 'ohne Kollektion (Suche)');
  assert.equal(await versteckt(null), false, 'collection nil');
});
