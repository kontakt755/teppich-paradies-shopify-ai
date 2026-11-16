import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { wegwerfOrdner } from '../../scripts/test-temp.mjs';
import { argumente, endzeit, linkpruefung } from '../scripts/linkpruefung.mjs';

const url = i => `https://shop.example/${i}`;
const link = i => ({ l: url(i), src: [url('quelle')] });
const seite = i => ({ u: url(i), src: 'sitemap.xml' });
const antwort = (status = 200, loc = '') => new Response(null, { status, headers: loc ? { location: loc } : {} });

function umgebung({ links = [], sitemap = [], linksStatus = [], sitemapStatus = [] } = {}) {
  const dir = wegwerfOrdner('tp-linkpruefung-');
  const schreibe = (datei, wert) => fs.writeFileSync(path.join(dir, datei), JSON.stringify(wert));
  schreibe('links.json', links);
  schreibe('sitemap-urls.json', sitemap);
  schreibe('links-status.json', linksStatus);
  schreibe('sitemap-status.json', sitemapStatus);
  const lese = datei => JSON.parse(fs.readFileSync(path.join(dir, datei), 'utf8'));
  let zeit = +new Date(2026, 10, 16, 1, 30);
  const pausen = [];
  const aufrufe = [];
  const meldungen = [];
  const deps = {
    now: () => zeit,
    sleep: async ms => { pausen.push(ms); zeit += ms; },
    log: text => meldungen.push(text),
    fetch: async (u, optionen) => { aufrufe.push({ u, optionen, zeit }); return antwort(); },
  };
  return { dir, lese, schreibe, deps, pausen, aufrufe, meldungen };
}

test('setzt gespeicherte Indizes fort: erst Links, dann Sitemap; alte Eintraege bleiben', async () => {
  const alterLink = { ...link(0), status: 404, chain: [], final: url(0) };
  const alteSeite = { ...seite(2), status: 200, loc: '' };
  const t = umgebung({ links: [link(0), link(1)], sitemap: [seite(2), seite(3)], linksStatus: [alterLink], sitemapStatus: [alteSeite] });
  assert.equal((await linkpruefung({ dir: t.dir }, t.deps)).exitCode, 0);
  assert.deepEqual(t.aufrufe.map(a => a.u), [url(1), url(3)]);
  assert.deepEqual(t.lese('links-status.json')[0], alterLink);
  assert.deepEqual(t.lese('sitemap-status.json')[0], alteSeite);
  assert.deepEqual(t.lese('sitemap-status.json')[1], { ...seite(3), status: 200, loc: '' });
  assert.equal(t.meldungen.at(-1), 'Stand: links 2/2, sitemap 2/2');
  for (const { optionen } of t.aufrufe) {
    assert.equal(optionen.method, 'GET');
    assert.equal(optionen.redirect, 'manual');
    assert.equal(optionen.headers['User-Agent'], 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36');
  }
});

test('--ab-sitemap kuerzt vor dem Abruf und prueft ab N erneut', async () => {
  const vorher = [0, 1].map(i => ({ ...seite(i), status: 404, loc: '' }));
  const t = umgebung({ sitemap: [seite(0), seite(1)], sitemapStatus: vorher });
  t.deps.fetch = async u => {
    assert.equal(u, url(1));
    assert.deepEqual(t.lese('sitemap-status.json'), vorher.slice(0, 1));
    return antwort();
  };
  await linkpruefung({ dir: t.dir, ...argumente(['--ab-sitemap', '1']) }, t.deps);
  assert.equal(t.lese('sitemap-status.json')[0].status, 404);
  assert.equal(t.lese('sitemap-status.json')[1].status, 200);
});

test('--ab-links kuerzt; ungueltige Indizes veraendern keine Ergebnisdateien', async () => {
  const vorher = [{ ...link(0), status: 200, chain: [], final: url(0) }];
  const t = umgebung({ links: [link(0)], linksStatus: vorher });
  await assert.rejects(linkpruefung({ dir: t.dir, abLinks: 0, abSitemap: 1 }, t.deps), /groesser als vorhandener Stand/);
  assert.deepEqual(t.lese('links-status.json'), vorher);
  assert.equal(t.aufrufe.length, 0);
  t.deps.fetch = async () => antwort(404);
  await linkpruefung({ dir: t.dir, ...argumente(['--ab-links', '0']) }, t.deps);
  assert.equal(t.lese('links-status.json')[0].status, 404);
});

for (const art of ['links', 'sitemap']) {
  test(`429 bei ${art} speichert nur vorherige Ergebnisse und endet mit Exit 2`, async () => {
    const t = umgebung(art === 'links' ? { links: [link(0), link(1)], sitemap: [seite(2)] } : { sitemap: [seite(0), seite(1)] });
    let n = 0;
    let verworfen = 0;
    t.deps.fetch = async () => ({
      status: ++n === 2 ? 429 : 200,
      headers: new Headers(), body: { cancel: async () => { verworfen++; } },
    });
    assert.equal((await linkpruefung({ dir: t.dir }, t.deps)).exitCode, 2);
    assert.equal(n, 2);
    assert.equal(verworfen, 2);
    assert.equal(t.lese(`${art}-status.json`).length, 1);
    assert.ok(t.meldungen.includes(`429 bei ${art} 1`));
    assert.equal(fs.existsSync(path.join(t.dir, 'befunde.json')), false);
  });
}

test('429 in einer Kette speichert keinen Teil des Links; naechster Lauf wiederholt ihn', async () => {
  const t = umgebung({ links: [link(0)] });
  const ziele = [];
  t.deps.fetch = async u => { ziele.push(u); return u === url(0) ? antwort(301, '/ziel') : antwort(429); };
  assert.equal((await linkpruefung({ dir: t.dir }, t.deps)).exitCode, 2);
  assert.deepEqual(t.lese('links-status.json'), []);
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.deepEqual(ziele, [url(0), url('ziel'), url(0), url('ziel')]);
});

test('jede Anfrage haelt 1000 ms Abstand, nach 50 gibt es 60 Sekunden Pause', async () => {
  const t = umgebung({ links: Array.from({ length: 51 }, (_, i) => link(i)), sitemap: [seite('sitemap')] });
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.equal(t.aufrufe.length, 52);
  assert.equal(t.pausen.filter(ms => ms === 1000).length, 50);
  assert.equal(t.pausen.filter(ms => ms === 60_000).length, 1);
  assert.equal(t.aufrufe[50].zeit - t.aufrufe[49].zeit, 60_000);
  for (let i = 1; i < t.aufrufe.length; i++) assert.ok(t.aufrufe[i].zeit - t.aufrufe[i - 1].zeit >= 1000);
});

test('301 -> 200: relative Location, flache Kette und finaler Status; Sitemap folgt nicht', async () => {
  const t = umgebung({ links: [link(0)], sitemap: [seite('sitemap')] });
  let verworfen = 0;
  const ziele = [];
  t.deps.fetch = async u => {
    ziele.push(u);
    return { status: u === url('ziel') ? 200 : 301, headers: new Headers({ location: '/ziel' }), body: { cancel: async () => { verworfen++; } } };
  };
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.deepEqual(t.lese('links-status.json'), [{ ...link(0), status: 200, chain: [301, url('ziel')], final: url('ziel') }]);
  assert.deepEqual(t.lese('sitemap-status.json'), [{ ...seite('sitemap'), status: 301, loc: '/ziel' }]);
  assert.deepEqual(ziele, [url(0), url('ziel'), url('sitemap')]);
  assert.deepEqual(t.pausen, [1000, 1000]);
  assert.equal(verworfen, 3);
});

test('Weiterleitungsschleife folgt hoechstens sechs Spruengen', async () => {
  const t = umgebung({ links: [link(0)] });
  let n = 0;
  t.deps.fetch = async () => antwort(302, `/${++n}`);
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.equal(n, 7);
  const ergebnis = t.lese('links-status.json')[0];
  assert.equal(ergebnis.status, 302);
  assert.equal(ergebnis.chain.length, 12);
  assert.equal(ergebnis.final, url(6));
});

test('Netzwerkfehler werden als ERR mit Meldung gespeichert; danach geht es weiter', async () => {
  const t = umgebung({ links: [link(0)], sitemap: [seite(1), seite(2)] });
  t.deps.fetch = async u => { if (u !== url(2)) throw new Error('Verbindung unterbrochen'); return antwort(); };
  await linkpruefung({ dir: t.dir }, t.deps);
  for (const datei of ['links-status.json', 'sitemap-status.json']) {
    assert.equal(t.lese(datei)[0].status, 'ERR');
    assert.equal(t.lese(datei)[0].error, 'Verbindung unterbrochen');
  }
  assert.equal(t.lese('sitemap-status.json')[1].status, 200);
  assert.deepEqual(t.pausen, [1000, 1000]);
});

test('Endzeit stoppt waehrend der Drosselung und speichert ohne unvollstaendigen Link', async () => {
  const t = umgebung({ links: [link(0), link(1)], sitemap: [seite(2)] });
  const start = +new Date(2026, 10, 16, 5, 59, 59, 500);
  let zeit = start;
  let n = 0;
  t.deps.now = () => zeit;
  t.deps.sleep = async ms => { t.pausen.push(ms); zeit += ms; };
  t.deps.fetch = async () => { n++; return antwort(301, '/ziel'); };
  assert.equal((await linkpruefung({ dir: t.dir }, t.deps)).exitCode, 0);
  assert.equal(n, 1);
  assert.deepEqual(t.pausen, [500]);
  assert.deepEqual(t.lese('links-status.json'), []);
  assert.deepEqual(t.lese('sitemap-status.json'), []);
  assert.equal(t.meldungen.at(-1), 'Stand: links 0/2, sitemap 0/1');
});

test('Endzeit gilt nach Mitternacht heute, abends morgen und genau um 06:00 sofort', async () => {
  const heute = new Date(2026, 10, 16, 6);
  assert.equal(endzeit(+new Date(2026, 10, 16, 1)), +heute);
  assert.equal(endzeit(+new Date(2026, 10, 15, 23)), +heute);
  assert.equal(endzeit(+heute), +heute);
  const t = umgebung({ sitemap: [seite(0)] });
  t.deps.now = () => +heute;
  assert.equal((await linkpruefung({ dir: t.dir }, t.deps)).exitCode, 0);
  assert.equal(t.aufrufe.length, 0);
});

test('durch Endzeit unterbrochener Abruf bleibt offen und wird nicht als ERR abgelegt', async () => {
  const t = umgebung({ sitemap: [seite(0)] });
  let zeit = +new Date(2026, 10, 16, 5, 59, 59);
  t.deps.now = () => zeit;
  t.deps.fetch = async () => { zeit += 1000; throw new Error('Zeitlimit'); };
  assert.equal((await linkpruefung({ dir: t.dir }, t.deps)).exitCode, 0);
  assert.deepEqual(t.lese('sitemap-status.json'), []);
});

test('speichert alle zehn Ergebnisse atomar und am Ende', async () => {
  const t = umgebung({ sitemap: Array.from({ length: 11 }, (_, i) => seite(i)) });
  let n = 0;
  t.deps.fetch = async () => {
    if (++n === 11) assert.equal(t.lese('sitemap-status.json').length, 10);
    return antwort();
  };
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.equal(t.lese('sitemap-status.json').length, 11);
  assert.equal(fs.readdirSync(t.dir).some(name => name.endsWith('.tmp')), false);
});

test('vollstaendige Listen schreiben Befunde und weitere Laeufe machen keine Abrufe', async () => {
  const l = [
    { ...link(0), status: 200, chain: [], final: url(0) },
    { ...link(1), status: 200, chain: [301, url('ziel')], final: url('ziel') },
    { ...link(2), status: 'ERR', chain: [], final: url(2), error: 'Fehler' },
  ];
  const s = [{ ...seite(3), status: 404, loc: '' }, { ...seite(4), status: 200, loc: '' }];
  const t = umgebung({ links: l.map(({ l, src }) => ({ l, src })), linksStatus: l, sitemap: s.map(({ u, src }) => ({ u, src })), sitemapStatus: s });
  await linkpruefung({ dir: t.dir }, t.deps);
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.equal(t.aufrufe.length, 0);
  assert.deepEqual(t.lese('befunde.json'), [{ ...l[1], art: 'link' }, { ...l[2], art: 'link' }, { ...s[0], art: 'sitemap' }]);
  assert.ok(t.meldungen.includes('fertig: 3 Links, 2 Sitemap-URLs, 3 Befunde'));
  assert.equal(t.meldungen.at(-1), 'Stand: links 3/3, sitemap 2/2');
  t.deps.fetch = async () => antwort(429);
  await linkpruefung({ dir: t.dir, abLinks: 1 }, t.deps);
  assert.equal(fs.existsSync(path.join(t.dir, 'befunde.json')), false, 'alter Abschlussbericht nach Kuerzung entfernt');
});

test('fehlende Ergebnisdateien starten bei null, ungueltige JSON-Dateien brechen ab', async () => {
  const t = umgebung();
  fs.rmSync(path.join(t.dir, 'links-status.json'));
  fs.rmSync(path.join(t.dir, 'sitemap-status.json'));
  await linkpruefung({ dir: t.dir }, t.deps);
  assert.deepEqual(t.lese('links-status.json'), []);
  fs.writeFileSync(path.join(t.dir, 'links-status.json'), 'kaputt');
  await assert.rejects(linkpruefung({ dir: t.dir }, t.deps), SyntaxError);
  assert.equal(fs.readFileSync(path.join(t.dir, 'links-status.json'), 'utf8'), 'kaputt');
});

test('CLI validiert Argumente ohne Netz; abgeschlossener Lauf nutzt LINKPRUEFUNG_DIR', () => {
  for (const args of [['--bis', '24:00'], ['--bis'], ['--ab-links', '-1'], ['--ab-sitemap', '1.5'], ['--unbekannt']]) assert.throws(() => argumente(args));
  const t = umgebung();
  const lauf = spawnSync(process.execPath, ['operations/scripts/linkpruefung.mjs'], {
    encoding: 'utf8', env: { ...process.env, LINKPRUEFUNG_DIR: t.dir },
  });
  assert.equal(lauf.status, 0, lauf.stderr);
  assert.match(lauf.stdout, /fertig: 0 Links, 0 Sitemap-URLs, 0 Befunde/);
  assert.match(lauf.stdout, /Stand: links 0\/0, sitemap 0\/0/);
});
