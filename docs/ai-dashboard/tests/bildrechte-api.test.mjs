import './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR und kein echter Shopify-Zugang
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { alsCsv } from '../../../operations/lib/bildrechte.mjs';

const zeile = (felder) => ({ media_id: `gid://shopify/MediaImage/${Math.random()}`, produkt_handle: 'testboden-grau', produkt_titel: 'Testboden Grau', produkttyp: 'Teppichboden', position: '1', datei: 'testboden-grau-raumansicht.jpg', breite: '2000', hoehe: '1500', alt: 'Testboden Grau', status: 'geprueft', quelle: 'Lieferant A', lizenz: 'Testlizenz', notiz: '', ...felder });

function privatMit(zeilen, lexikon) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-bildrechte-'));
  if (zeilen) {
    fs.mkdirSync(path.join(dir, 'bildrechte'));
    fs.writeFileSync(path.join(dir, 'bildrechte', 'bildrechte.csv'), '﻿' + alsCsv(zeilen));
  }
  if (lexikon) {
    fs.mkdirSync(path.join(dir, 'lexikon'));
    fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ produkte: lexikon }));
  }
  return dir;
}

const BEISPIEL = [
  zeile({ status: 'ungeklaert' }),
  zeile({ status: 'ungeklaert', produkt_handle: 'leiste-weiss', produkt_titel: 'Leiste Weiß', produkttyp: 'Sockelleisten', breite: '800', hoehe: '800' }),
  zeile({ status: 'freigegeben', breite: '900' }),
  zeile({ status: 'entfernt', breite: '400', alt: '' }),
];

test('Bildrechte: ohne Verzeichnis der Hinweis mit Befehl, keine Demo-Daten', () => {
  const api = createApi({ privatDirPath: privatMit(null) });
  const d = api.bildrechteListe();
  assert.equal(d.verfuegbar, false);
  assert.equal(d.befehl, 'npm run bildrechte:inventur');
  assert.equal(d.items, undefined);
});

test('Bildrechte: Zaehler, Liste und Links aus dem Lexikon', () => {
  const api = createApi({ privatDirPath: privatMit(BEISPIEL, [{ handle: 'testboden-grau', adminUrl: 'https://admin.shopify.com/store/sjjyq1-6w/products/1', onlineStoreUrl: 'https://www.teppich-paradies.net/products/testboden-grau' }]) });
  const d = api.bildrechteListe({ liste: 'ungeklaert' });
  assert.equal(d.verfuegbar, true);
  assert.deepEqual(d.zaehler, { ungeklaert: 2, 'zu-klein': 2, 'ohne-alt': 0 });
  assert.deepEqual(d.gruppen.map(g => g.gruppe), ['Sockelleisten', 'Teppichboden']);
  const boden = d.items.find(e => e.handle === 'testboden-grau');
  assert.equal(boden.adminUrl, 'https://admin.shopify.com/store/sjjyq1-6w/products/1');
  assert.equal(boden.shopUrl, 'https://www.teppich-paradies.net/products/testboden-grau');
  const leiste = d.items.find(e => e.handle === 'leiste-weiss');
  assert.match(leiste.adminUrl, /products\?query=leiste-weiss$/, 'nicht im Lexikon: Admin sucht nach dem Handle');
  assert.equal(leiste.shopUrl, null);
  assert.ok(!JSON.stringify(d).includes('Lieferant A'), 'Quellen bleiben auf dem Server');
  assert.ok(!JSON.stringify(d).includes('Testlizenz'));
  assert.ok(d.stand);
});

test('Bildrechte: Filter nach Warengruppe', () => {
  const api = createApi({ privatDirPath: privatMit(BEISPIEL) });
  const d = api.bildrechteListe({ liste: 'zu-klein', gruppe: 'Sockelleisten' });
  assert.equal(d.count, 1);
  assert.equal(d.items[0].breite, 800);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Rolle "lesen" darf die Bildrechte lesen, schreiben kann dort niemand', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = privatMit(BEISPIEL);
  schreibeBenutzer(benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' }), path.join(privat, 'benutzer.json'));
  const vorher = process.env.TP_PRIVAT_DIR;
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=bildrechte');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async base => {
      assert.equal((await fetch(`${base}/api/bildrechte/liste`)).status, 401);
      const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'lena', passwort: 'platzhalter-lesen-1' }) });
      assert.equal(r.status, 200);
      const keks = r.headers.get('set-cookie').split(';')[0];
      const liste = await fetch(`${base}/api/bildrechte/liste?liste=zu-klein`, { headers: { cookie: keks } });
      assert.equal(liste.status, 200);
      assert.equal((await liste.json()).zaehler['zu-klein'], 2);
      const post = await fetch(`${base}/api/bildrechte/liste`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: '{}' });
      assert.equal(post.status, 405);
    });
  } finally {
    process.env.TP_PRIVAT_DIR = vorher;
  }
});
