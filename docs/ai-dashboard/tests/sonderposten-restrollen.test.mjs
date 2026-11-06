// QR-Etikett an der Rolle und Zeile "Restrollen" auf Heute (Inhaber 2026-11-06).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rollenLink, rollenNummer, rollenEtikett, rollenEtikettText, restrollenStand, restrollenText } from '../lib/sonderposten.mjs';
import { freieEtiketten } from '../lib/freie-etiketten.mjs';

const GID = 'gid://shopify/Product/16212345678901';

test('rollenLink: eigene Adresse im Netz, am Mac die Netzadresse vom Server', () => {
  assert.equal(rollenNummer(GID), '16212345678901');
  const ts = { origin: 'https://mac.tailxyz.ts.net', hostname: 'mac.tailxyz.ts.net' };
  assert.equal(rollenLink(GID, { ort: ts, netzAdresse: 'https://anders.ts.net' }), 'https://mac.tailxyz.ts.net/#/sonderposten?rolle=16212345678901');
  const lokal = { origin: 'http://127.0.0.1:8001', hostname: '127.0.0.1' };
  assert.equal(rollenLink(GID, { ort: lokal, netzAdresse: 'https://mac.tailxyz.ts.net' }), 'https://mac.tailxyz.ts.net/#/sonderposten?rolle=16212345678901');
  assert.equal(rollenLink(GID, { ort: lokal }), '', 'am Mac ohne Netzadresse kein QR-Code, den kein Handy oeffnet');
  assert.equal(rollenLink(GID, { ort: lokal, netzAdresse: 'javascript:alert(1)' }), '');
  assert.equal(rollenLink('', { ort: ts }), '');
});

test('Etikett: Name ohne Zusatz, Breite, Hinweis - passt als freier Aufkleber mit QR', () => {
  const text = rollenEtikettText({ titel: 'Antigua 40 grün – Restposten, 400 cm', breiteM: 4 });
  assert.equal(text, 'RESTROLLE\nAntigua 40 grün\n4 m breit\nVerkauf: scannen + buchen');
  assert.match(rollenEtikettText({ titel: 'Celeste 840 grau – Restposten, 500 cm', breiteM: 5 }), /5 m breit/);
  const { zeilenSchrift } = rollenEtikett({ titel: 'Antigua 40 grün – Restposten, 400 cm', breiteM: 4 });
  assert.deepEqual(zeilenSchrift, { '0:0': 4, '0:2': 4, '0:3': 3 }, 'der Name bleibt automatisch und damit am groessten');
  const [e] = freieEtiketten(text, 1, { url: 'https://mac.tailxyz.ts.net/#/sonderposten?rolle=1', zeilenSchrift });
  assert.equal(e.art, 'frei');
  assert.deepEqual(e.schriften, [4, 0, 4, 3]);
  assert.equal(e.zeilen.length, 4);
  assert.match(e.url, /rolle=1$/);
});

test('Zeile Restrollen: Summe der verkaufbaren Rollen, Bernstein nur bei faelligem Nachmessen', () => {
  const d = { verfuegbar: true, eintraege: [
    { typ: 'rolle', verkaufbar: true, bestand: 80, laengeM: 20 },
    { typ: 'rolle', verkaufbar: true, bestand: 56, laengeM: 11.2 },
    { typ: 'rolle', verkaufbar: false, bestand: 0, laengeM: 0 },
    { typ: 'stueck', verkaufbar: true, bestand: 1, laengeM: 2.35 },
  ], ladenStand: { buchungen30: 0, letzteBuchung: null, letzteInventur: '2026-10-28T12:00:00.000Z', nachmessenAb: '2026-11-27T12:00:00.000Z', nachmessenFaellig: false } };
  const st = restrollenStand(d);
  assert.deepEqual([st.anzahl, st.qm, st.meter], [2, 136, 31.2]);
  const t = restrollenText(st);
  assert.equal(t.warn, false);
  assert.equal(t.text, '2 Rollen · noch 31,2 m (136 m²) · im Laden noch nie gebucht · nachmessen ab 27.11.');
  const faellig = restrollenText({ ...st, laden: { ...d.ladenStand, buchungen30: 3, letzteBuchung: '2026-11-05T12:00:00.000Z', nachmessenFaellig: true } });
  assert.equal(faellig.warn, true);
  assert.match(faellig.text, /Ladenbuchungen 30 Tage: 3 \(zuletzt 05\.11\.\) · nachmessen fällig \(zuletzt 28\.10\.\)/);
  assert.equal(restrollenStand({ verfuegbar: true, eintraege: [] }), null);
  assert.equal(restrollenStand({ verfuegbar: false }), null);
});

test('Ansicht: QR-Knopf, Direktlink oeffnet den Buchungsdialog nur einmal', () => {
  const src = fs.readFileSync(new URL('../ansichten/sonderposten.mjs', import.meta.url), 'utf8');
  assert.match(src, /data-sp-qr=/);
  assert.match(src, /params\.get\('rolle'\)/);
  assert.match(src, /sonderposten\.geoeffnet !== nr/);
  const heute = fs.readFileSync(new URL('../ansichten/heute.mjs', import.meta.url), 'utf8');
  assert.equal((heute.match(/restrollenZeile\(\)/g) || []).length, 2, 'Shop-Übersicht und "Im Hintergrund"');
});
