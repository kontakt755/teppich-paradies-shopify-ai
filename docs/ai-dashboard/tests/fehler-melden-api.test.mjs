import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR und kein echter Shopify-Zugang
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Fehler melden - jede Rolle darf melden, Liste zeigt nur Eigenes, Inhaber alles', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-fehler-melden-'));
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  liste = benutzerAnlegen(liste, { name: 'Ina Inhaber', kuerzel: 'ina', passwort: 'platzhalter-inhaber-1', rolle: 'inhaber' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=fehler-melden');
  delete process.env.TP_DASHBOARD_PASSWORT;
  assert.equal(mod.auth.required, true);

  try {
    await mitServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const melden = (keks, rumpf) => fetch(`${base}/api/fehler/melden`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...(keks ? { cookie: keks } : {}) },
        body: JSON.stringify(rumpf),
      });
      const lesen = async (keks) => (await fetch(`${base}/api/fehler/liste`, { headers: { cookie: keks } })).json();

      assert.equal((await melden(null, { text: 'Ohne Anmeldung' })).status, 401);

      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      const r1 = await melden(lena, { text: 'Lexikon zeigt keine Bilder', ort: 'Lexikon', von: { name: 'Faelschung', kuerzel: 'ina' } });
      assert.equal(r1.status, 200, 'auch die Rolle "lesen" darf einen Fehler melden');
      assert.equal((await r1.json()).id, 'F-001');
      // Die Ausnahme gilt nur fuer diesen Pfad: sonst bleibt "lesen" gesperrt.
      const sonst = await fetch(`${base}/api/kunden/fall-marke`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: lena }, body: JSON.stringify({ schluessel: 'x', grund: 'erledigt' }) });
      assert.equal(sonst.status, 403);

      const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      assert.equal((await melden(mona, { text: 'ok' })).status, 400, 'zu kurz');
      const r2 = await melden(mona, { text: 'Knopf Bestellt tut nichts', dringend: true, technik: { adresse: '#/einkauf', fehler: ['POST /api/x → 500'] } });
      assert.equal(r2.status, 200);

      const eigene = await lesen(mona);
      assert.equal(eigene.alle, false);
      assert.deepEqual(eigene.meldungen.map(m => m.id), ['F-002']);
      assert.equal(eigene.meldungen[0].statusLabel, 'Gemeldet');
      assert.equal(eigene.meldungen[0].technik, undefined, 'Technik-Angaben bleiben auf dem Server');

      const ina = await anmelden('ina', 'platzhalter-inhaber-1');
      const alle = await lesen(ina);
      assert.equal(alle.alle, true);
      assert.deepEqual(alle.meldungen.map(m => [m.id, m.von]), [['F-002', 'Mona Mitarbeiter'], ['F-001', 'Lena Lesend']], 'Name kommt aus der Sitzung, nie aus der Anfrage');

      const get = await fetch(`${base}/api/fehler/melden`, { headers: { cookie: ina } });
      assert.equal(get.status, 405);

      // Bildschirmfoto: nur echte Bilder, sichtbar fuer den Melder und den Inhaber.
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      const mitBild = await melden(mona, { text: 'Mit Bildschirmfoto', bilder: [{ name: 'x.png', typ: 'image/png', daten: png.toString('base64') }], technik: { schritte: ['14:01 einkauf: „→ Bestellt“'] } });
      assert.equal(mitBild.status, 200);
      const bildId = (await mitBild.json()).id;
      const bild = (keks) => fetch(`${base}/api/fehler/bild?id=${bildId}&nr=1`, { headers: { cookie: keks } });
      const eigenes = await bild(mona);
      assert.equal(eigenes.status, 200);
      assert.equal(eigenes.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await eigenes.arrayBuffer()), png);
      assert.equal((await bild(ina)).status, 200, 'der Inhaber sieht alle Bilder');
      assert.equal((await bild(lena)).status, 404, 'fremde Meldung: wie nicht vorhanden');
      assert.equal((await fetch(`${base}/api/fehler/bild?id=${bildId}&nr=2`, { headers: { cookie: mona } })).status, 404);
      const kaputt = await melden(mona, { text: 'Getarntes SVG', bilder: [{ typ: 'image/png', daten: Buffer.from('<svg onload=alert(1)>').toString('base64') }] });
      assert.equal(kaputt.status, 400);
      assert.match((await kaputt.json()).error, /Nur Bilder/);
      const eigeneMitBild = (await lesen(mona)).meldungen.find(m => m.id === bildId);
      assert.equal(eigeneMitBild.bilder, 1);
      assert.equal(eigeneMitBild.eigen, true);

      const gespeichert = JSON.parse(fs.readFileSync(path.join(privat, 'fehlermeldungen.json'), 'utf8')).meldungen;
      const mitSchritten = gespeichert.find(m => m.id === bildId);
      assert.deepEqual(mitSchritten.technik.schritte, ['14:01 einkauf: „→ Bestellt“']);
      assert.match(String(mitSchritten.technik.version), /^[0-9a-f]{7,}$/, 'Stand des laufenden Dienstes');
      assert.deepEqual(gespeichert[1].technik.fehler, ['POST /api/x → 500']);
      assert.equal(gespeichert[1].dringend, true);
      const protokoll = fs.readFileSync(path.join(privat, 'protokoll.jsonl'), 'utf8').trim().split('\n').map(z => JSON.parse(z));
      assert.ok(protokoll.some(p => p.aktion === 'Fehler gemeldet' && p.objekt === 'F-002' && p.benutzer === 'Mona Mitarbeiter'));
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});
