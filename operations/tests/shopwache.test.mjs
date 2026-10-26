import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruefe, seitenBefunde, preisBefunde, PFLICHTSEITEN, LANGSAM_MS, stoerungSeit, verlaufEintrag } from '../lib/shopwache.mjs';
import { ergebnisAblegen } from '../scripts/shopwache.mjs';
import { mitZeitstempel } from '../lib/zeitstempel.mjs';

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

// -- Stoerungsverlauf (Rundgang 26.10.2026: 13 rote Laeufe ohne Datum) -----------

const lauf = (zeit, ampel, kaputt = []) => ({
  geprueftAm: zeit, ampel,
  seiten: PFLICHTSEITEN.map(p => ({ name: p.name, status: kaputt.includes(p.name) ? 503 : 200, fehler: null })),
  befunde: kaputt.map(n => ({ art: 'kritisch', titel: `${n} antwortet mit 503` })),
});

test('Verlauf: Beginn mit Seiten, Wechsel, Ende mit Dauer; gleiche Ampel schreibt nichts', () => {
  const a = lauf('2026-10-26T08:05:00.000Z', 'gruen');
  assert.equal(verlaufEintrag(null, a), null, 'erster Lauf, alles gruen: nichts zu melden');
  const b = lauf('2026-10-26T09:05:00.000Z', 'rot', ['Impressum', 'AGB']);
  b.stoerungSeit = stoerungSeit(a, b);
  assert.equal(b.stoerungSeit, '2026-10-26T09:05:00.000Z');
  assert.deepEqual(verlaufEintrag(a, b), {
    zeit: '2026-10-26T09:05:00.000Z', von: 'gruen', nach: 'rot', art: 'beginn', beginn: '2026-10-26T09:05:00.000Z',
    seiten: ['Impressum', 'AGB'], befunde: ['kritisch: Impressum antwortet mit 503', 'kritisch: AGB antwortet mit 503'],
  });
  const c = lauf('2026-10-26T10:05:00.000Z', 'rot', ['Impressum']);
  c.stoerungSeit = stoerungSeit(b, c);
  assert.equal(c.stoerungSeit, '2026-10-26T09:05:00.000Z', 'der Beginn bleibt');
  assert.equal(verlaufEintrag(b, c), null, 'rot bleibt rot');
  const d = lauf('2026-10-26T11:05:00.000Z', 'gelb');
  d.stoerungSeit = stoerungSeit(c, d);
  assert.equal(verlaufEintrag(c, d).art, 'wechsel');
  const e = lauf('2026-10-26T12:05:00.000Z', 'gruen');
  e.stoerungSeit = stoerungSeit(d, e);
  assert.equal(e.stoerungSeit, null);
  const ende = verlaufEintrag(d, e);
  assert.equal(ende.art, 'ende');
  assert.equal(ende.beginn, '2026-10-26T09:05:00.000Z');
  assert.equal(ende.dauerMinuten, 180);
});

test('ergebnisAblegen: status.json mit stoerungSeit, verlauf.jsonl nur bei Wechsel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-shopwache-'));
  const ziel = path.join(dir, 'shopwache', 'status.json');
  const verlauf = path.join(dir, 'shopwache', 'verlauf.jsonl');
  assert.equal(ergebnisAblegen(ziel, lauf('2026-10-26T08:05:00.000Z', 'gruen')), null);
  assert.ok(!fs.existsSync(verlauf));
  assert.equal(ergebnisAblegen(ziel, lauf('2026-10-26T09:05:00.000Z', 'rot', ['Startseite'])).art, 'beginn');
  assert.equal(ergebnisAblegen(ziel, lauf('2026-10-26T10:05:00.000Z', 'rot', ['Startseite'])), null);
  assert.equal(JSON.parse(fs.readFileSync(ziel, 'utf8')).stoerungSeit, '2026-10-26T09:05:00.000Z');
  assert.equal(ergebnisAblegen(ziel, lauf('2026-10-26T11:05:00.000Z', 'gruen')).dauerMinuten, 120);
  const zeilen = fs.readFileSync(verlauf, 'utf8').trim().split('\n').map(z => JSON.parse(z));
  assert.deepEqual(zeilen.map(z => z.art), ['beginn', 'ende']);
  assert.deepEqual(zeilen[0].seiten, ['Startseite']);
  // Kaputter Vorstand: neu anfangen statt abzustuerzen.
  fs.writeFileSync(ziel, '{kaputt');
  assert.equal(ergebnisAblegen(ziel, lauf('2026-10-26T12:05:00.000Z', 'gelb')).art, 'beginn');
});

test('Logzeilen der Wache beginnen mit der Uhrzeit (ISO, UTC)', () => {
  const zeilen = [];
  const p = mitZeitstempel({ log: z => zeilen.push(z), error: z => zeilen.push(z) }, () => new Date('2026-10-26T12:05:00.000Z'));
  p.log('Shop-Wache: GRUEN');
  p.error('Fehler: x');
  assert.deepEqual(zeilen, ['2026-10-26T12:05:00.000Z Shop-Wache: GRUEN', '2026-10-26T12:05:00.000Z Fehler: x']);
});
