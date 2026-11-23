// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Lexware-Angebote (Kunde, Betrag, Link ins Angebot) sind Inhabersache: Mitarbeiter
// und "lesen" bekommen 403, auch wenn sie die Adresse kennen. Nur erfundene Daten.
test('angebote/lexware: nur Inhaber und Notzugang, Mitarbeiter und lesen 403', async () => {
  fs.mkdirSync(path.join(PRIVAT_DIR, 'lexware-angebote'), { recursive: true });
  fs.writeFileSync(path.join(PRIVAT_DIR, 'lexware-angebote', 'offen.json'), JSON.stringify({
    stand: '2026-01-10T06:00:00Z',
    angebote: [{ id: 'lx-1', nummer: 'AG-T1', kunde: 'Testkunde 1', datum: '2026-01-02', betrag: 1234.5, waehrung: 'EUR' }],
  }));
  const { handleApi } = await import('../../../scripts/serve-dashboard.mjs');
  const ruf = async (benutzer, method = 'GET') => {
    const res = { code: null, body: null, writeHead(c) { this.code = c; return this; }, end(b) { this.body = b; }, setHeader() {}, getHeader() { return null; } };
    await handleApi({ method, url: '/api/angebote/lexware', headers: { host: 'localhost:8001' } }, res, '/api/angebote/lexware', benutzer);
    return { code: res.code, text: String(res.body || '') };
  };

  for (const rolle of ['mitarbeiter', 'lesen']) {
    for (const method of ['GET', 'POST']) {
      const r = await ruf({ name: 'Ben', kuerzel: 'ben', rolle }, method);
      assert.equal(r.code, 403, `${rolle} ${method}`);
      assert.doesNotMatch(r.text, /Testkunde|1234/);
    }
  }
  for (const benutzer of [null, { name: 'Chef', kuerzel: 'chef', rolle: 'inhaber' }]) {
    const r = await ruf(benutzer);
    assert.equal(r.code, 200);
    assert.equal(JSON.parse(r.text).zeilen[0].kunde, 'Testkunde 1');
  }
});
