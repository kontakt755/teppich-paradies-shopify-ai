import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const verboten = () => assert.fail('Foto darf keine externen Werkzeuge aufrufen');
const bild = Buffer.alloc(500, 1).toString('base64');

test('Foto: Text erkennen, nur Text merken, Mac holt neue Fotos per seit ab', async () => {
  const gesehen = [];
  const api = createApi({ gh: verboten, rebuild: verboten, shopifyZugang: verboten, env: { TP_DASHBOARD_EXTRA_HOSTS: 'macmini.test.ts.net' },
    now: () => new Date('2026-11-25T10:00:00Z'), fotoText: async b => { gesehen.push(b.length); return 'Modena\n3N55'; } });
  const start = api.kundenMusterFotos();
  assert.deepEqual(start.fotos, [], 'ohne seit nur der Zaehler');
  assert.equal(start.netzAdresse, 'https://macmini.test.ts.net');
  const e = await api.kundenMusterFoto({ bild: `data:image/jpeg;base64,${bild}` }, { benutzer: { name: 'Test' } });
  assert.equal(e.text, 'Modena\n3N55');
  assert.deepEqual(gesehen, [500]);
  assert.deepEqual(api.kundenMusterFotos({ seit: String(start.letzte) }).fotos.map(f => f.text), ['Modena\n3N55']);
  assert.deepEqual(api.kundenMusterFotos({ seit: String(e.id) }).fotos, []);
  assert.equal(Object.hasOwn(e, 'bild'), false, 'das Bild bleibt nicht');
  for (let i = 0; i < 12; i++) await api.kundenMusterFoto({ bild });
  assert.equal(api.kundenMusterFotos({ seit: String(start.letzte) }).fotos.length, 10, 'hoechstens zehn im Speicher');
});

test('Foto: leer, kein Base64 oder kaputte Erkennung gibt eine verstaendliche Meldung', async () => {
  const api = createApi({ gh: verboten, rebuild: verboten, shopifyZugang: verboten, fotoText: async () => { throw new Error('Texterkennung am Mac fehlgeschlagen'); } });
  await assert.rejects(api.kundenMusterFoto({}), { status: 400 });
  await assert.rejects(api.kundenMusterFoto({ bild: '<script>' }), { status: 400 });
  await assert.rejects(api.kundenMusterFoto({ bild: 'AAAA' }), { status: 400 });
  await assert.rejects(api.kundenMusterFoto({ bild }), { status: 502, message: 'Texterkennung am Mac fehlgeschlagen' });
});
