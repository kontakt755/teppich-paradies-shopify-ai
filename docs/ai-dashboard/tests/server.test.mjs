import './_testumgebung.mjs';   // muss zuerst stehen: setzt TP_PRIVAT_DIR vor dem Laden des Servers
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requestHandler, hostErlaubt, extraHostsAus } from '../../../scripts/serve-dashboard.mjs';


async function withServer(run) {
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('statische Dateien mit korrekten MIME-Typen, keine Pfadausbrueche', async () => withServer(async base => {
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  const mod = await fetch(`${base}/lib/model.mjs`);
  assert.match(mod.headers.get('content-type'), /javascript/);
  const out = await fetch(`${base}/..%2F..%2Fpackage.json`);
  assert.notEqual(out.status, 200);
}));

test('schreibende API-Pfade verlangen POST, JSON und lokalen Origin', async () => withServer(async base => {
  assert.equal((await fetch(`${base}/api/tasks/1/transition`)).status, 405);
  const foreign = await fetch(`${base}/api/tasks/1/comment`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
  const form = await fetch(`${base}/api/tasks/1/comment`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(form.status, 415);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
}));

test('Einkauf-API ist GET-only und liefert JSON (verfuegbar:false ohne private Fixtures im Test-Repo)', async () => withServer(async base => {
  const b = await fetch(`${base}/api/einkauf/bestellungen`);
  assert.equal(b.status, 200);
  const bj = await b.json();
  assert.equal(typeof bj.verfuegbar, 'boolean');
  const p = await fetch(`${base}/api/einkauf/produktstatus?page=1&pageSize=5`);
  assert.equal(p.status, 200);
  const post = await fetch(`${base}/api/einkauf/bestellungen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
}));

test('lexikon-API ist GET-only und liefert JSON (verfuegbar:false ohne Export)', async () => withServer(async base => {
  const g = await fetch(`${base}/api/lexikon/liste?q=abc`);
  assert.equal(g.status, 200);
  const gj = await g.json();
  assert.equal(gj.verfuegbar, false);
  assert.equal(gj.befehl, 'npm run lexikon:export');
  const post = await fetch(`${base}/api/lexikon/liste`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
  const p = await fetch(`${base}/api/lexikon/produkt?handle=x`);
  assert.equal(p.status, 200);
}));

test('einkauf/kennzahlen ist GET-only und liefert JSON (verfuegbar:false ohne Export)', async () => withServer(async base => {
  const g = await fetch(`${base}/api/einkauf/kennzahlen`);
  assert.equal(g.status, 200);
  const gj = await g.json();
  assert.equal(gj.verfuegbar, false);
  assert.ok(gj.befehl);
  const post = await fetch(`${base}/api/einkauf/kennzahlen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
}));

test('aktualisierung/start und /status: Status ist GET-only, Start verlangt POST und lokalen Origin', async () => withServer(async base => {
  // Status: reiner Lesezugriff, kein POST noetig - kein echter Lauf wird dabei gestartet.
  const status = await fetch(`${base}/api/aktualisierung/status`);
  assert.equal(status.status, 200);
  const statusJson = await status.json();
  assert.equal(typeof statusJson.laeuft, 'boolean');
  const statusPost = await fetch(`${base}/api/aktualisierung/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(statusPost.status, 405);

  // Start: GET nicht erlaubt, fremder Origin abgelehnt - absichtlich kein erfolgreicher
  // gleicher-Origin-POST hier, damit der Test nicht wirklich einen Kindprozess gegen
  // die Shopify Admin API startet.
  const startGet = await fetch(`${base}/api/aktualisierung/start`);
  assert.equal(startGet.status, 405);
  const foreign = await fetch(`${base}/api/aktualisierung/start`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
}));

test('einkauf/auftragsstatus: GET liest lokal, POST verlangt JSON und lokalen Origin', async () => withServer(async base => {
  const g = await fetch(`${base}/api/einkauf/auftragsstatus`);
  assert.equal(g.status, 200);
  const gj = await g.json();
  assert.equal(gj.verfuegbar, true);
  assert.deepEqual(gj.positionen, {});

  const foreign = await fetch(`${base}/api/einkauf/auftragsstatus`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);

  const form = await fetch(`${base}/api/einkauf/auftragsstatus`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(form.status, 415);
}));

// --- Zugriff von unterwegs (Tailscale) ------------------------------------
// Der Host-Check ist der Schutz gegen DNS-Rebinding: eine fremde Seite darf den
// Browser nicht dazu bringen, das Dashboard im eigenen Netz abzufragen. Er
// muss deshalb genau so weit aufgehen wie noetig - und keinen Schritt weiter.

test('hostErlaubt: eigenes Netz und Tailnet ja, fremde Namen nein', () => {
  for (const h of ['127.0.0.1:8001', 'localhost', 'macmini.local:8001', '192.168.2.222:8001', '10.0.0.5', '172.16.3.9']) {
    assert.ok(hostErlaubt(h), `${h} sollte erlaubt sein`);
  }
  // 100.64.0.0/10 = Tailscale-Adressbereich, endet bei 100.127.255.255.
  assert.ok(hostErlaubt('100.64.0.1:8001'));
  assert.ok(hostErlaubt('100.101.22.9'));
  assert.ok(hostErlaubt('100.127.255.255'));
  assert.ok(!hostErlaubt('100.128.0.1'), '100.128 liegt ausserhalb des Tailscale-Bereichs');
  assert.ok(!hostErlaubt('100.63.0.1'), '100.63 liegt unterhalb des Tailscale-Bereichs');

  for (const h of ['teppich-paradies.net', 'boese.example', '8.8.8.8', '', null]) {
    assert.ok(!hostErlaubt(h), `${h} darf nicht erlaubt sein`);
  }
});

test('hostErlaubt: MagicDNS-Name nur, wenn er eingetragen ist', () => {
  const liste = extraHostsAus(' MacMini.tail1234.ts.net , ');
  assert.deepEqual(liste, ['macmini.tail1234.ts.net']);
  assert.ok(hostErlaubt('macmini.tail1234.ts.net', liste));
  assert.ok(hostErlaubt('MacMini.Tail1234.TS.NET', liste), 'Gross-/Kleinschreibung darf nicht entscheiden');
  assert.ok(hostErlaubt('macmini.tail1234.ts.net:8001', liste), 'mit Port genauso');
  // Genau der eingetragene Name - kein Muster fuer die ganze Endung, sonst
  // waere jedes fremde Tailnet mit abgedeckt.
  assert.ok(!hostErlaubt('fremd.tail9999.ts.net', liste));
  assert.ok(!hostErlaubt('macmini.tail1234.ts.net', []), 'ohne Eintrag kein Zugriff');
});

test('extraHostsAus: leere Angabe ergibt eine leere Liste', () => {
  assert.deepEqual(extraHostsAus(''), []);
  assert.deepEqual(extraHostsAus(undefined), []);
  assert.deepEqual(extraHostsAus(' , , '), []);
});

/**
 * fetch() darf den Host-Header nicht setzen (verbotener Header-Name) - er
 * bliebe auf 127.0.0.1 stehen und der Test liefe ins Leere. Deshalb hier eine
 * rohe HTTP-Anfrage.
 */
function rufMitHost(base, pfad, host) {
  const { port } = new URL(base);
  return new Promise((ok, fehler) => {
    const req = http.request({ host: '127.0.0.1', port, path: pfad, headers: { Host: host } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => ok({ status: res.statusCode, text }));
    });
    req.on('error', fehler);
    req.end();
  });
}

test('403 bei fremdem Host, mit Hinweis wenn es nur der fehlende Name ist', async () => withServer(async base => {
  const fremd = await rufMitHost(base, '/api/shopwache/status', 'boese.example');
  assert.equal(fremd.status, 403);
  assert.match(fremd.text, /Nur lokal erlaubt/);

  // Derselbe Fall, aber erkennbar ein Tailnet-Name: dann ist nicht der Ort das
  // Problem, sondern der fehlende Eintrag - der Text muss das sagen.
  const tailnet = await rufMitHost(base, '/api/shopwache/status', 'macmini.tail1234.ts.net');
  assert.equal(tailnet.status, 403);
  assert.match(tailnet.text, /TP_DASHBOARD_EXTRA_HOSTS/);

  // Gegenprobe: aus dem Tailnet-Adressbereich geht es ohne Eintrag durch.
  const ausTailnet = await rufMitHost(base, '/api/shopwache/status', '100.101.22.9');
  assert.notEqual(ausTailnet.status, 403);
}));

// --- Groesse des Anfragekoerpers ------------------------------------------
// Fotos und Anhaenge kommen als base64 im JSON. Mit der alten Grenze von 64 KB
// fuer alle Pfade brach jeder Upload mit 413 ab, obwohl die Oberflaeche
// "bis 10 MB je Datei" zusagte - der Fotoeingang konnte nie funktionieren.

function postGross(base, pfad, nutzlast) {
  const koerper = JSON.stringify(nutzlast);
  const { port } = new URL(base);
  return new Promise((ok, fehler) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pfad, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(koerper) } },
      res => { let t = ''; res.on('data', c => { t += c; }); res.on('end', () => ok({ status: res.statusCode, text: t })); },
    );
    req.on('error', e => (e.code === 'ECONNRESET' ? ok({ status: 0, text: 'abgebrochen' }) : fehler(e)));
    req.end(koerper);
  });
}

test('gewoehnliche Pfade bleiben bei 64 KB', async () => withServer(async base => {
  const gross = { text: 'x'.repeat(100 * 1024) };
  const r = await postGross(base, '/api/org/kommentar', gross);
  // 413, oder die Verbindung wurde beim Abbruch geschlossen (req.destroy).
  assert.ok(r.status === 413 || r.status === 0, `erwartet 413/Abbruch, bekam ${r.status}`);
}));

test('der Fotoeingang nimmt mehr als 64 KB an', async () => withServer(async base => {
  // Ein Bild von ~300 KB als base64 - genau der Fall, der vorher scheiterte.
  const bild = 'A'.repeat(400 * 1024);
  const r = await postGross(base, '/api/fotos/neu', {
    auftrag: 'T-1', boden: 'Piumera Sand Hell', einwilligung: true,
    fotos: [{ name: 'baustelle.jpg', typ: 'image/jpeg', daten: bild }],
  });
  assert.notEqual(r.status, 413, `Upload wurde mit 413 abgewiesen: ${r.text.slice(0, 120)}`);
  assert.notEqual(r.status, 0, 'Verbindung wurde abgebrochen - Groessengrenze greift noch');
}));

// --- Pfadliste ------------------------------------------------------------
// handleApi filtert alle Pfade ueber eine Whitelist; fehlt einer dort, gibt es
// 404, obwohl Route und API-Methode existieren. Genau das ist beim Markieren
// von Faellen passiert und faellt sonst erst im Browser auf.

test('jede Route im Dispatcher steht auch in der Pfadliste', () => {
  const quelle = fs.readFileSync(new URL('../../../scripts/serve-dashboard.mjs', import.meta.url), 'utf8');
  const liste = quelle.match(/const m = pathname\.match\(([\s\S]*?)\);/);
  assert.ok(liste, 'Pfadliste nicht gefunden');
  const erlaubt = new Set([...liste[1].matchAll(/([a-z-]+(?:\\\/[a-z-]+)*)/g)].map(x => x[1].replace(/\\\//g, '/')));
  const benutzt = [...quelle.matchAll(/simple === '([a-z0-9/-]+)'/g)].map(x => x[1]);
  assert.ok(benutzt.length > 20, `zu wenige Zweige gefunden (${benutzt.length}) - Muster veraltet?`);
  for (const pfad of new Set(benutzt)) {
    assert.ok(erlaubt.has(pfad), `Pfad "${pfad}" wird im Dispatcher benutzt, fehlt aber in der Pfadliste - der Server antwortet 404`);
  }
});

test('POST /api/kunden/fall-marke kommt an und verlangt einen Fall', async () => withServer(async base => {
  const r = await fetch(`${base}/api/kunden/fall-marke`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.notEqual(r.status, 404, 'Route fehlt in der Pfadliste');
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Kein Fall angegeben/);
}));
