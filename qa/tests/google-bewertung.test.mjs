import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HERKUNFT, KEY, NAMESPACE, PLATZ_ID, QUELLE, argumente, auffaellig, heuteBerlin, leseMetafeld, leseQuelle,
  main, metafeldWert, schonDiesenMonat, setzenMutation, wertText,
} from '../../scripts/google-bewertung.mjs';

// Monatslauf Google-Bewertung: die Anzeige im Shop darf nie aus einer zweifelhaften
// Antwort entstehen, und ein Ausfall muss sichtbar werden.

const JETZT = new Date('2026-11-03T10:00:00Z');

const antwort = (o = {}) => ({
  status: 'success',
  result: { data: [{ uri: PLATZ_ID, supplier: 'google', rating: 4.9, reviews_number: 246, meta: { name: 'Teppich Paradies Oranienburg GmbH' }, ...o }] },
});

function umgebung({ quelle = antwort(), metafeld = null, status = 200, schreibFehler = [], schreibtNicht = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-google-bewertung-'));
  const log = [];
  const aufrufe = { fetch: [], schreibe: [] };
  let wert = metafeld;
  return {
    datei: path.join(dir, 'status.json'),
    log,
    aufrufe,
    wert: () => wert,
    deps: {
      jetzt: JETZT,
      aus: (z) => log.push(z),
      fetch: async (url, opt) => {
        aufrufe.fetch.push({ url, opt });
        return { ok: status === 200, status, json: async () => quelle };
      },
      zugang: {
        frage: async () => ({ shop: { id: 'gid://shopify/Shop/1', metafield: wert ? { value: wert } : null } }),
        schreibe: async (m) => {
          aufrufe.schreibe.push(m);
          if (!schreibtNicht && !schreibFehler.length) {
            // Wert aus der Mutation lesen, so wie Shopify ihn speichern wuerde.
            wert = JSON.parse(m.match(/value:("(?:[^"\\]|\\.)*")/)[1]);
          }
          return { metafieldsSet: { userErrors: schreibFehler } };
        },
      },
    },
  };
}

const stand = (u) => JSON.parse(fs.readFileSync(u.datei, 'utf8'));

test('Quelle: echte Antwort wird gelesen, die Abfrage bleibt die des Widgets', () => {
  assert.deepEqual(leseQuelle(antwort()), { wert: 4.9, anzahl: 246 });
  assert.match(QUELLE, /summary=true&translate=de$/);
  assert.equal(HERKUNFT, 'https://www.teppich-paradies.net');
});

test('Quelle: alles Zweifelhafte wirft, statt in den Shop zu gelangen', () => {
  const faelle = [
    [{ status: 'error' }, /Status/],
    [{ status: 'success', result: { data: [] } }, /genau ein Profil/],
    [antwort({ uri: 'anderes' }), /anderes Profil/],
    [antwort({ supplier: 'facebook' }), /anderes Profil/],
    [antwort({ meta: { name: 'Fremdes Geschaeft' } }), /anderen Namen/],
    [antwort({ rating: 0 }), /Note/],
    [antwort({ rating: 5.1 }), /Note/],
    [antwort({ rating: null }), /Note/],
    [antwort({ rating: 'gut' }), /Note/],
    [antwort({ reviews_number: 0 }), /Anzahl/],
    [antwort({ reviews_number: 12.5 }), /Anzahl/],
    [antwort({ reviews_number: null }), /Anzahl/],
  ];
  for (const [a, muster] of faelle) assert.throws(() => leseQuelle(a), muster);
  assert.throws(() => leseQuelle(null), /Status/);
});

test('Wert: deutsches Komma, eine Stelle, so wie Google ihn zeigt', () => {
  assert.equal(wertText(4.9), '4,9');
  assert.equal(wertText(5), '5,0');
  assert.equal(metafeldWert({ wert: 4.9, anzahl: 246 }, '2026-11-03'), '{"wert":"4,9","anzahl":246,"stand":"2026-11-03"}');
});

test('Metafeld: Unlesbares ist kein Vergleichswert', () => {
  assert.deepEqual(leseMetafeld('{"wert":"4,9","anzahl":246,"stand":"2026-11-03"}'), { wert: 4.9, anzahl: 246, stand: '2026-11-03' });
  for (const v of [null, '', 'kaputt', '{}', '{"wert":"4,9"}', '{"wert":"gut","anzahl":3}', 'null']) assert.equal(leseMetafeld(v), null);
});

test('Auffaellig: normale Monate laufen durch, Spruenge werden gemeldet', () => {
  const alt = { wert: 4.9, anzahl: 246 };
  assert.deepEqual(auffaellig({ wert: 4.9, anzahl: 254 }, alt), []);
  assert.deepEqual(auffaellig({ wert: 4.7, anzahl: 246 }, alt), [], 'genau die Grenze ist noch in Ordnung, trotz Rundung der Kommazahl');
  assert.deepEqual(auffaellig({ wert: 4.9, anzahl: 236 }, alt), []);
  assert.deepEqual(auffaellig({ wert: 4.9, anzahl: 306 }, alt), []);
  assert.deepEqual(auffaellig({ wert: 4.9, anzahl: 500 }, null), [], 'ohne Vergleichswert gibt es nichts zu vergleichen');
  assert.match(auffaellig({ wert: 4.6, anzahl: 246 }, alt)[0], /Note springt von 4,9 auf 4,6/);
  assert.match(auffaellig({ wert: 4.9, anzahl: 235 }, alt)[0], /faellt von 246 auf 235/);
  assert.match(auffaellig({ wert: 4.9, anzahl: 307 }, alt)[0], /springt von 246 auf 307/);
});

test('Monat: zaehlt in deutscher Zeit, Kaputtes zaehlt als nicht erledigt', () => {
  assert.equal(heuteBerlin(new Date('2026-11-30T23:30:00Z')), '2026-12-01');
  assert.equal(schonDiesenMonat({ letzterErfolg: '2026-11-01T05:40:00Z' }, JETZT), true);
  assert.equal(schonDiesenMonat({ letzterErfolg: '2026-10-31T23:30:00Z' }, JETZT), true, '00:30 Uhr deutsche Zeit am 01.11. zaehlt schon zum November');
  assert.equal(schonDiesenMonat({ letzterErfolg: '2026-10-31T22:30:00Z' }, JETZT), false, '23:30 Uhr deutsche Zeit am 31.10. zaehlt noch zum Oktober');
  assert.equal(schonDiesenMonat({ letzterErfolg: '2026-10-01T05:40:00Z' }, JETZT), false);
  assert.equal(schonDiesenMonat({ letzterErfolg: 'kaputt' }, JETZT), false);
  assert.equal(schonDiesenMonat(null, JETZT), false);
});

test('Argumente: Tippfehler brechen ab, Schalter nur mit Schreiben', () => {
  assert.throws(() => argumente(['--schreibn']), /Unbekanntes Argument/);
  assert.throws(() => argumente(['--monatlich']), /nur mit --schreiben/);
  assert.throws(() => argumente(['--trotzdem']), /nur mit --schreiben/);
  assert.equal(argumente(['--schreiben', '--monatlich']).monatlich, true);
});

test('Mutation: genau dieses eine Metafeld, Anfuehrungszeichen im Wert bleiben gueltig', () => {
  const m = setzenMutation('gid://shopify/Shop/1', '{"wert":"4,9"}');
  assert.ok(m.includes(`namespace:"${NAMESPACE}"`) && m.includes(`key:"${KEY}"`));
  assert.ok(m.includes('value:"{\\"wert\\":\\"4,9\\"}"'));
});

test('Lauf ohne --schreiben: fragt ab und schreibt weder Shop noch Stand', async () => {
  const u = umgebung();
  assert.equal(await main(['--stand-datei', u.datei], u.deps), 0);
  assert.equal(u.aufrufe.schreibe.length, 0);
  assert.equal(fs.existsSync(u.datei), false);
  assert.equal(u.aufrufe.fetch[0].url, QUELLE);
  assert.equal(u.aufrufe.fetch[0].opt.headers.Origin, HERKUNFT);
});

test('Lauf mit --schreiben: setzt das Metafeld, prueft gegen und legt den Stand ab', async () => {
  const u = umgebung({ metafeld: '{"wert":"4,9","anzahl":240,"stand":"2026-10-01"}' });
  assert.equal(await main(['--schreiben', '--stand-datei', u.datei], u.deps), 0);
  assert.equal(u.wert(), '{"wert":"4,9","anzahl":246,"stand":"2026-11-03"}');
  const s = stand(u);
  assert.equal(s.ampel, 'gruen');
  assert.equal(s.letzterErfolg, JETZT.toISOString());
  assert.match(s.meldung, /4,9 aus 246/);
});

test('Monatlich: nach einem Erfolg im selben Monat kein Abruf, im neuen Monat wieder', async () => {
  const u = umgebung();
  assert.equal(await main(['--schreiben', '--monatlich', '--stand-datei', u.datei], u.deps), 0);
  assert.equal(u.aufrufe.fetch.length, 1);
  assert.equal(await main(['--schreiben', '--monatlich', '--stand-datei', u.datei], u.deps), 0);
  assert.equal(u.aufrufe.fetch.length, 1, 'zweiter Lauf im selben Monat fragt nicht mehr ab');
  const naechster = { ...u.deps, jetzt: new Date('2026-12-01T05:40:00Z') };
  assert.equal(await main(['--schreiben', '--monatlich', '--stand-datei', u.datei], naechster), 0);
  assert.equal(u.aufrufe.fetch.length, 2);
});

test('Auffaellig: Shop bleibt unveraendert, To-do-Stand gelb, letzter Erfolg bleibt; --trotzdem uebernimmt', async () => {
  const alt = '{"wert":"4,9","anzahl":246,"stand":"2026-10-01"}';
  const u = umgebung({ quelle: antwort({ rating: 4.2 }), metafeld: alt });
  fs.writeFileSync(u.datei, JSON.stringify({ letzterErfolg: '2026-10-01T05:40:00Z' }));
  assert.equal(await main(['--schreiben', '--monatlich', '--stand-datei', u.datei], u.deps), 1);
  assert.equal(u.aufrufe.schreibe.length, 0);
  assert.equal(u.wert(), alt);
  assert.equal(stand(u).ampel, 'gelb');
  assert.match(stand(u).meldung, /Note springt/);
  assert.equal(stand(u).letzterErfolg, '2026-10-01T05:40:00Z');
  assert.equal(await main(['--schreiben', '--trotzdem', '--stand-datei', u.datei], u.deps), 0);
  assert.match(u.wert(), /"wert":"4,2"/);
  assert.equal(stand(u).ampel, 'gruen');
});

test('Fehler: Quelle tot, Antwort kaputt, Shopify lehnt ab oder Gegenprobe falsch ergeben rot', async () => {
  const faelle = [
    [{ status: 400 }, /HTTP 400/],
    [{ quelle: { status: 'error' } }, /Status/],
    [{ schreibFehler: [{ field: ['metafields'], message: 'nein' }] }, /metafieldsSet/],
    [{ schreibtNicht: true }, /Gegenprobe/],
  ];
  for (const [opt, muster] of faelle) {
    const u = umgebung(opt);
    fs.writeFileSync(u.datei, JSON.stringify({ letzterErfolg: '2026-10-01T05:40:00Z' }));
    assert.equal(await main(['--schreiben', '--stand-datei', u.datei], u.deps), 2);
    assert.equal(stand(u).ampel, 'rot');
    assert.match(stand(u).meldung, muster);
    assert.equal(stand(u).letzterErfolg, '2026-10-01T05:40:00Z', 'ein Fehler loescht den letzten Erfolg nicht');
  }
});
