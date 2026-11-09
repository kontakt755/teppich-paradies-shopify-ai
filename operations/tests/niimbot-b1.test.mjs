import test from 'node:test';
import assert from 'node:assert/strict';
import { KOPF, drucke, paket, paketLeser, seitenAusJson, seitenPakete } from '../niimbot/b1.mjs';

const seite = (breite, hoehe, schwarz = () => false) => {
  const zb = Math.ceil(breite / 8), bits = new Uint8Array(zb * hoehe);
  for (let y = 0; y < hoehe; y++) for (let x = 0; x < breite; x++) if (schwarz(x, y)) bits[y * zb + (x >> 3)] |= 0x80 >> (x & 7);
  return { breite, hoehe, bits };
};

test('Paket: Rahmen und XOR-Pruefsumme wie niimbluelib', () => {
  assert.equal(paket(0xdc, [1]).toString('hex'), '5555dc0101dcaaaa');
  assert.equal(paket(0x21, [3]).toString('hex'), '5555210103' + (0x21 ^ 1 ^ 3).toString(16) + 'aaaa');
});

test('Leser: ein Paket ueber zwei Benachrichtigungen, zwei Pakete in einer', () => {
  const lies = paketLeser();
  const a = paket(0x31, [1]), b = paket(0xb3, [0, 1, 100, 100, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(lies(a.subarray(0, 3)), []);
  assert.deepEqual(lies(Buffer.concat([a.subarray(3), b])), [{ cmd: 0x31, daten: [1] }, { cmd: 0xb3, daten: [0, 1, 100, 100, 0, 0, 0, 0, 0, 0] }]);
});

test('Seite: mittig auf den Kopf, leere Zeilen zusammengefasst, wenige Punkte als Liste', () => {
  // 400 px breit wie 50 mm wird im Dialog schon auf 384 beschnitten; hier 376 px -> 4 px Rand links.
  const p = seitenPakete(seite(376, 300, (x, y) => (y === 10 && x === 0) || (y >= 20 && y < 22)));
  const cmds = p.map(b => b[2]);
  assert.deepEqual(cmds, [0x03, 0x13, 0x84, 0x83, 0x84, 0x85, 0x84, 0x84, 0xe3]);
  assert.deepEqual([...p[1].subarray(4, 10)], [1, 44, KOPF >> 8, KOPF & 255, 0, 1]);           // 300 Zeilen x 384, 1 Kopie
  assert.deepEqual([...p[2].subarray(4, 7)], [0, 0, 10]);                                      // Zeilen 0-9 leer
  assert.deepEqual([...p[3].subarray(4, 12)], [0, 10, 1, 0, 0, 1, 0, 4]);                      // Punkt bei x=4 (Versatz)
  assert.deepEqual([...p[5].subarray(4, 10)], [0, 20, 124, 128, 124, 2]);                      // 2 volle Zeilen, schwarze Punkte je Drittel des Kopfes
  assert.equal(p[5][3], 6 + KOPF / 8);
  assert.deepEqual([...p[6].subarray(4, 7)], [0, 22, 255]);                                    // hoechstens 255 je Paket
});

test('Seite: falsche Groesse wird abgelehnt', () => {
  assert.throws(() => seitenPakete(seite(400, 10)), /passt nicht/);
  assert.throws(() => seitenPakete({ breite: 8, hoehe: 2, bits: new Uint8Array(1) }), /Bilddaten/);
  assert.throws(() => seitenAusJson([]), /Seiten erwartet/);
});

/** Drucker-Attrappe: beantwortet jede Frage, zaehlt die Seiten, meldet optional einen Fehler. */
function attrappe({ fehlerBei } = {}) {
  const gesendet = [];
  let fn = () => {}, seiten = 0;
  const antwort = { 0x21: 0x31, 0x23: 0x33, 0x01: 0x02, 0x03: 0x04, 0x13: 0x14, 0xe3: 0xe4, 0xf3: 0xf4 };
  return {
    gesendet,
    transport: {
      beiPaket: f => { fn = f; },
      senden: b => {
        gesendet.push(b[2]);
        queueMicrotask(() => {
          if (b[2] === fehlerBei) { fn({ cmd: 0xdb, daten: [1] }); return; }
          if (b[2] === 0xe3) seiten++;
          if (b[2] === 0xa3) fn({ cmd: 0xb3, daten: [0, seiten, 100, 100, 0, 0, 0, 0, 0, 0] });
          else if (antwort[b[2]]) fn({ cmd: antwort[b[2]], daten: [1] });
        });
      },
    },
  };
}

test('Druckablauf wie B1PrintTask: Dichte, Art, Start, Seiten, Status, Ende', async () => {
  const { transport, gesendet } = attrappe();
  const n = await drucke([seite(384, 4, (x, y) => y === 1), seite(384, 4)], { dichte: 9, transport, pause: async () => {} });
  assert.equal(n, 2);
  assert.deepEqual(gesendet, [0x21, 0x23, 0x01, 0x03, 0x13, 0x84, 0x85, 0x84, 0xe3, 0x03, 0x13, 0x84, 0xe3, 0xa3, 0xf3]);
});

test('Druckerfehler bricht ab und nennt den Grund', async () => {
  const { transport } = attrappe({ fehlerBei: 0x03 });
  await assert.rejects(drucke([seite(384, 2)], { transport, pause: async () => {} }), /Deckel offen/);
});
