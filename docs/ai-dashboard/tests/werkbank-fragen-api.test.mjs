import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR und kein echter Shopify-Zugang
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frageAnlegen } from '../../../operations/lib/werkbank-fragen.mjs';

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Werkbank-Fragen lesen und beantworten - "lesen" gesperrt, Name aus der Sitzung', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-werkbank-fragen-api-'));
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Ina Inhaber', kuerzel: 'ina', passwort: 'platzhalter-inhaber-1', rolle: 'inhaber' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  const datei = path.join(privat, 'werkbank-fragen.json');
  frageAnlegen(datei, { werkbankId: 'w-901', titel: 'Beispielaufgabe', frage: 'Welche Farbe für den Knopf?', optionen: [{ label: 'Grau' }, { label: 'Braun' }], empfehlung: 'Grau' });
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=werkbank-fragen');
  delete process.env.TP_DASHBOARD_PASSWORT;

  try {
    await mitServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const antworten = (keks, rumpf) => fetch(`${base}/api/werkbank/antworten`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(rumpf),
      });
      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      const ina = await anmelden('ina', 'platzhalter-inhaber-1');

      assert.equal((await fetch(`${base}/api/werkbank/fragen`, { headers: { cookie: lena } })).status, 403);
      assert.equal((await antworten(lena, { id: 'q-w-901-1', label: 'Grau' })).status, 403);

      const vorher = await (await fetch(`${base}/api/werkbank/fragen`, { headers: { cookie: ina } })).json();
      assert.deepEqual(vorher.offen.map(f => f.id), ['q-w-901-1']);
      assert.equal((await fetch(`${base}/api/werkbank/antworten`, { headers: { cookie: ina } })).status, 405);
      assert.equal((await antworten(ina, { id: 'q-w-901-1', label: 'Lila' })).status, 400);
      const r = await antworten(ina, { id: 'q-w-901-1', label: 'Braun', von: 'Faelschung' });
      assert.equal(r.status, 200);
      assert.equal((await antworten(ina, { id: 'q-w-901-1', label: 'Grau' })).status, 400, 'zweite Antwort abgelehnt');

      const nachher = await (await fetch(`${base}/api/werkbank/fragen`, { headers: { cookie: ina } })).json();
      assert.equal(nachher.offen.length, 0);
      assert.equal(nachher.beantwortet[0].antwort.label, 'Braun');
      assert.equal(nachher.beantwortet[0].antwort.von, 'Ina Inhaber', 'Name kommt aus der Sitzung');
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});
