import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const verboten = () => assert.fail('Foto darf keine externen Werkzeuge aufrufen');
const bild = Buffer.alloc(500, 1).toString('base64');

test('Foto: Text erkennen, nur Text merken, Mac holt neue Fotos per seit ab', async () => {
  const gesehen = [];
  const api = createApi({ gh: verboten, rebuild: verboten, shopifyZugang: verboten, musterFotoOrdner: '/gibt/es/nicht', env: { TP_DASHBOARD_EXTRA_HOSTS: 'macmini.test.ts.net' },
    now: () => new Date('2026-11-25T10:00:00Z'), fotoText: async b => { gesehen.push(b.length); return 'Modena\n3N55'; } });
  const start = await api.kundenMusterFotos();
  assert.deepEqual(start.fotos, [], 'ohne seit nur der Zaehler');
  assert.equal(start.netzAdresse, 'https://macmini.test.ts.net');
  const e = await api.kundenMusterFoto({ bild: `data:image/jpeg;base64,${bild}` }, { benutzer: { name: 'Test' } });
  assert.equal(e.text, 'Modena\n3N55');
  assert.deepEqual(gesehen, [500]);
  assert.deepEqual((await api.kundenMusterFotos({ seit: String(start.letzte) })).fotos.map(f => f.text), ['Modena\n3N55']);
  assert.deepEqual((await api.kundenMusterFotos({ seit: String(e.id) })).fotos, []);
  assert.equal(Object.hasOwn(e, 'bild'), false, 'das Bild bleibt nicht');
  for (let i = 0; i < 12; i++) await api.kundenMusterFoto({ bild });
  assert.equal((await api.kundenMusterFotos({ seit: String(start.letzte) })).fotos.length, 10, 'hoechstens zehn im Speicher');
});

test('Foto: leer, kein Base64 oder kaputte Erkennung gibt eine verstaendliche Meldung', async () => {
  const api = createApi({ gh: verboten, rebuild: verboten, shopifyZugang: verboten, musterFotoOrdner: '/gibt/es/nicht', fotoText: async () => { throw new Error('Texterkennung am Mac fehlgeschlagen'); } });
  await assert.rejects(api.kundenMusterFoto({}), { status: 400 });
  await assert.rejects(api.kundenMusterFoto({ bild: '<script>' }), { status: 400 });
  await assert.rejects(api.kundenMusterFoto({ bild: 'AAAA' }), { status: 400 });
  await assert.rejects(api.kundenMusterFoto({ bild }), { status: 502, message: 'Texterkennung am Mac fehlgeschlagen' });
});

test('Dropbox-Ordner: neue Fotos werden beim Abfragen gelesen und nach erledigt geschoben, halbe Uploads warten', async t => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-musterfotos-'));
  t.after(() => fs.rmSync(ordner, { recursive: true, force: true }));
  const alt = new Date(Date.now() - 60_000);
  fs.writeFileSync(path.join(ordner, 'paket1.jpg'), Buffer.alloc(500, 1)); fs.utimesSync(path.join(ordner, 'paket1.jpg'), alt, alt);
  fs.writeFileSync(path.join(ordner, 'noch-im-upload.jpg'), Buffer.alloc(500, 1)); // gerade geschrieben
  fs.writeFileSync(path.join(ordner, 'notiz.txt'), 'kein Bild'); fs.utimesSync(path.join(ordner, 'notiz.txt'), alt, alt);
  let aufrufe = 0;
  const api = createApi({ gh: verboten, rebuild: verboten, shopifyZugang: verboten, musterFotoOrdner: ordner, fotoText: async () => { aufrufe++; return 'Frisea\n3S37'; } });
  const start = await api.kundenMusterFotos();
  assert.deepEqual(start.fotos, []);
  const r = await api.kundenMusterFotos({ seit: String(start.letzte - 1) });
  assert.deepEqual(r.fotos.map(f => [f.text, f.von]), [['Frisea\n3S37', 'Dropbox']]);
  assert.equal(aufrufe, 1, 'jedes Foto genau einmal');
  assert.deepEqual(fs.readdirSync(ordner).sort(), ['erledigt', 'noch-im-upload.jpg', 'notiz.txt']);
  assert.equal(fs.readdirSync(path.join(ordner, 'erledigt')).length, 1);
  await api.kundenMusterFotos({ seit: String(r.letzte) });
  assert.equal(aufrufe, 1, 'erledigtes Foto nicht erneut');
});

test('Dropbox-Ordner fehlt: Abfrage laeuft normal weiter', async () => {
  const api = createApi({ gh: verboten, rebuild: verboten, shopifyZugang: verboten, musterFotoOrdner: '/gibt/es/nicht', fotoText: verboten });
  assert.deepEqual((await api.kundenMusterFotos({ seit: '0' })).fotos, []);
});
