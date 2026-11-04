import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NICHTS_VERFUEGBAR_TAGE, verlaufDatei, verlaufVeraltet, beobachteProdukte, fortschreibeVerlauf, eintraegeAusVerlauf, teilAusVerlauf,
} from '../lib/auslauf-bestand.mjs';
import { gesamtStand, pruefziele } from '../lib/auslauf.mjs';
import { leseBestandCsv } from '../lib/lieferanten-bestand.mjs';
import { aktualisiereAuslaufVerlauf } from '../scripts/bestand-abgleich.mjs';
import { main as auslaufMain, argumente } from '../scripts/auslauf-pruefen.mjs';

// Nur erfundene Daten.
const KOPF = 'item_no;EAN1;stock;reserved;available;design;color';
const csv = (...z) => [KOPF, ...z].join('\n');
const var_ = (sku, handle, status = 'ACTIVE', barcode = '') => ({ sku, barcode, handle, status });
const tag = (n) => new Date(Date.UTC(2026, 10, 1 + n, 6));
const leer = { handle: 'a', varianten: 2, verfuegbar: false, fehlend: [] };
const voll = { handle: 'a', varianten: 2, verfuegbar: true, fehlend: [] };

test('beobachteProdukte: je aktivem Produkt, EAN als Ersatz, reserviert ist nicht verfuegbar', () => {
  const b = leseBestandCsv(csv('A1;111;5;5;0;1;x', 'A2;222;3;0;2;1;x', 'B1;333;0;0;0;2;x', 'D1;444;9;0;9;3;x'));
  const erg = beobachteProdukte(b, [
    var_('A1', 'a'), var_('ALT', 'a', 'ACTIVE', '222'),
    var_('B1', 'b'), var_('WEG', 'b'),
    var_('D1', 'd', 'ARCHIVED'), var_('D1', 'e', 'DRAFT'), var_('D1', null),
  ]);
  assert.deepEqual(erg, [
    { handle: 'a', varianten: 2, verfuegbar: true, fehlend: [] },
    { handle: 'b', varianten: 2, verfuegbar: false, fehlend: ['WEG'] },
  ]);
});

test('fortschreibeVerlauf: seit bleibt stehen, einmal verfuegbar setzt zurueck', () => {
  let v = fortschreibeVerlauf(null, [leer], tag(0));
  assert.equal(v.beginn, tag(0).toISOString());
  assert.equal(v.produkte.a.seit, tag(0).toISOString());
  v = fortschreibeVerlauf(v, [leer], tag(1));
  assert.equal(v.produkte.a.seit, tag(0).toISOString());
  v = fortschreibeVerlauf(v, [voll], tag(2));
  assert.equal(v.produkte.a.seit, null);
  v = fortschreibeVerlauf(v, [leer], tag(3));
  assert.equal(v.produkte.a.seit, tag(3).toISOString());
  assert.equal(v.beginn, tag(0).toISOString());
});

test('fortschreibeVerlauf: fehlende SKU behaelt ihr Datum, zurueckgekehrte und inaktive fallen heraus', () => {
  let v = fortschreibeVerlauf(null, [{ ...voll, fehlend: ['S2'] }, { ...leer, handle: 'b' }], tag(0));
  v = fortschreibeVerlauf(v, [{ ...voll, fehlend: ['S1', 'S2'] }], tag(1));
  assert.deepEqual(v.produkte.a.fehlend, { S1: tag(1).toISOString(), S2: tag(0).toISOString() });
  assert.equal(v.produkte.b, undefined);
  v = fortschreibeVerlauf(v, [{ ...voll, fehlend: ['S1'] }], tag(2));
  assert.deepEqual(Object.keys(v.produkte.a.fehlend), ['S1']);
});

test('fortschreibeVerlauf: nach einer Luecke beginnt alles neu, genau 3 Tage sind noch keine', () => {
  const v = fortschreibeVerlauf(null, [leer], tag(0));
  assert.equal(fortschreibeVerlauf(v, [leer], tag(3)).produkte.a.seit, tag(0).toISOString());
  const neu = fortschreibeVerlauf(v, [leer], new Date(tag(3).getTime() + 1000));
  assert.equal(neu.produkte.a.seit, neu.stand);
  assert.equal(neu.beginn, neu.stand);
  assert.equal(fortschreibeVerlauf({ kaputt: true }, [leer], tag(0)).produkte.a.seit, tag(0).toISOString());
  assert.equal(verlaufVeraltet({ stand: 'quatsch' }, tag(0)), true);
});

test('eintraegeAusVerlauf: Frist genau 30 Tage, davor ok, kein Auslauf-Wort als Beleg', () => {
  const v = fortschreibeVerlauf(null, [leer], tag(0));
  assert.equal(NICHTS_VERFUEGBAR_TAGE, 30);
  const jetzt = (ms) => new Date(tag(0).getTime() + ms);
  const tagMs = 86400000;
  assert.equal(eintraegeAusVerlauf(v, { jetzt: jetzt(30 * tagMs - 1) })[0].ergebnis, 'ok');
  const e = eintraegeAusVerlauf(v, { jetzt: jetzt(30 * tagMs) })[0];
  assert.equal(e.ergebnis, 'nicht-verfuegbar');
  assert.deepEqual(e.handles, ['a']);
  assert.match(e.grund, /^Seit 30 Tagen \(2026-11-01\) in keiner Groesse verfuegbar - kein Auslaufbeleg/);
});

test('eintraegeAusVerlauf: fehlende Variante geht vor und nennt Anteil und SKUs', () => {
  const v = fortschreibeVerlauf(null, [{ ...voll, fehlend: ['S1'] }, { ...leer, handle: 'b', fehlend: ['S2', 'S3'] }], tag(0));
  const [a, b] = eintraegeAusVerlauf(v, { jetzt: tag(40) });
  assert.deepEqual([a.ergebnis, a.kennung, a.grund], ['fehlt', 'S1', '1 von 2 Varianten stehen nicht mehr in der Bestandsdatei (seit 2026-11-01)']);
  assert.deepEqual([b.ergebnis, b.kennung, b.grund], ['fehlt', 'S2, S3', 'Alle 2 Varianten stehen nicht mehr in der Bestandsdatei (seit 2026-11-01)']);
});

/** Verlauf mit n Produkten, davon die ersten `fehlend` mit fehlender Variante. */
function verlaufMit(n, fehlend, zeit) {
  const liste = Array.from({ length: n }, (_, i) => ({ handle: `p${i}`, varianten: 2, verfuegbar: true, fehlend: i < fehlend ? [`S${i}`] : [] }));
  return fortschreibeVerlauf(null, liste, zeit);
}

test('teilAusVerlauf: wenige Fehlende sind Befunde (rot), viele auf einmal eine Stoerung (gelb)', () => {
  const wenige = teilAusVerlauf(verlaufMit(100, 5, tag(0)), { jetzt: tag(0) });
  assert.equal(wenige.ausfall, null);
  assert.equal(wenige.geprueft, 100);
  assert.equal(wenige.befunde.length, 5);
  assert.equal(gesamtStand([wenige]).ampel, 'rot');
  const viele = teilAusVerlauf(verlaufMit(100, 6, tag(0)), { jetzt: tag(0) });
  assert.match(viele.ausfall, /6 von 100 angeblich weg/);
  assert.deepEqual(viele.befunde, []);
  assert.equal(gesamtStand([viele]).ampel, 'gelb');
});

test('teilAusVerlauf: lange nichts verfuegbar ergibt gelb, nie rot', () => {
  const teil = teilAusVerlauf(fortschreibeVerlauf(fortschreibeVerlauf(null, [leer], tag(0)), [leer], tag(0)), { jetzt: tag(2), tage: 2 });
  assert.equal(teil.nichtVerfuegbar, 1);
  assert.equal(teil.befunde[0].ergebnis, 'nicht-verfuegbar');
  assert.equal(teil.befunde[0].lieferant, 'I');
  assert.equal(gesamtStand([teil]).ampel, 'gelb');
});

test('teilAusVerlauf: fehlender oder veralteter Verlauf ist eine Stoerung ohne Befunde', () => {
  assert.match(teilAusVerlauf(null).ausfall, /fehlt oder ist unlesbar/);
  const alt = teilAusVerlauf(verlaufMit(10, 1, tag(0)), { jetzt: tag(4) });
  assert.match(alt.ausfall, /zuletzt am 2026-11-01/);
  assert.deepEqual(alt.befunde, []);
  assert.match(teilAusVerlauf({ stand: tag(0).toISOString(), produkte: {} }, { jetzt: tag(0) }).ausfall, /nichts geprueft/);
});

test('pruefziele: Lieferant I zaehlt nicht mehr als "ohne Online-Pruefung"', () => {
  const z = pruefziele([{ handle: 'x', status: 'ACTIVE', varianten: [{ einkauf: { lieferant: 'I', artikelnummer: '1' } }, { einkauf: { lieferant: 'B', artikelnummer: '2' } }] }]);
  assert.deepEqual(z.ohneOnline, { B: 1 });
});

test('aktualisiereAuslaufVerlauf: schreibt, liest fort, ueberlebt kaputte Datei und wirft nie', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auslauf-i-'));
  try {
    const datei = verlaufDatei(dir);
    const b = leseBestandCsv(csv('A1;111;0;0;0;1;x'));
    assert.deepEqual(aktualisiereAuslaufVerlauf(b, [var_('A1', 'a')], { datei, jetzt: tag(0) }), { ok: true, produkte: 1 });
    aktualisiereAuslaufVerlauf(b, [var_('A1', 'a')], { datei, jetzt: tag(1) });
    assert.equal(JSON.parse(fs.readFileSync(datei, 'utf8')).produkte.a.seit, tag(0).toISOString());
    assert.deepEqual(fs.readdirSync(path.dirname(datei)), ['auslauf-verlauf.json']);

    fs.writeFileSync(datei, '{kaputt');
    assert.equal(aktualisiereAuslaufVerlauf(b, [var_('A1', 'a')], { datei, jetzt: tag(2) }).ok, true);
    assert.equal(JSON.parse(fs.readFileSync(datei, 'utf8')).produkte.a.seit, tag(2).toISOString());

    // Eine Datei steht dort, wo der Ordner sein muesste: Fehler kommt als Ergebnis zurueck.
    const sperre = path.join(dir, 'sperre');
    fs.writeFileSync(sperre, '');
    const erg = aktualisiereAuslaufVerlauf(b, [var_('A1', 'a')], { datei: path.join(sperre, 'x', 'y.json') });
    assert.equal(erg.ok, false);
    assert.ok(erg.fehler);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auslauf-pruefen --nur I: liest den Verlauf ohne Netz und schreibt Befunde ins Statusformat', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auslauf-i-'));
  const alt = process.env.TP_PRIVAT_DIR;
  const log = console.log;
  process.env.TP_PRIVAT_DIR = dir;
  console.log = () => {};
  try {
    fs.mkdirSync(path.join(dir, 'lexikon'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ erstellt: '2026-11-01', produkte: [] }));
    const v = fortschreibeVerlauf(null, Array.from({ length: 30 }, (_, i) => ({ handle: `p${i}`, varianten: 1, verfuegbar: true, fehlend: i ? [] : ['S0'] })), new Date());
    fs.mkdirSync(path.dirname(verlaufDatei(dir)), { recursive: true });
    fs.writeFileSync(verlaufDatei(dir), JSON.stringify(v));
    await auslaufMain(['--nur', 'I']);
    const s = JSON.parse(fs.readFileSync(path.join(dir, 'auslauf', 'status.json'), 'utf8'));
    assert.equal(s.ampel, 'rot');
    assert.equal(s.lieferanten.I.geprueft, 30);
    assert.deepEqual(s.befunde.map((b) => [b.lieferant, b.ergebnis, b.kennung, b.handles]), [['I', 'fehlt', 'S0', ['p0']]]);
    assert.equal(s.neuheiten, undefined);

    fs.rmSync(verlaufDatei(dir));
    await auslaufMain(['--nur', 'I']);
    const ohne = JSON.parse(fs.readFileSync(path.join(dir, 'auslauf', 'status.json'), 'utf8'));
    assert.equal(ohne.ampel, 'gelb');
    assert.equal(ohne.ausfaelle[0].lieferant, 'I');
  } finally {
    console.log = log;
    if (alt === undefined) delete process.env.TP_PRIVAT_DIR; else process.env.TP_PRIVAT_DIR = alt;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('argumente: I gehoert zum Standardlauf und zu --nur, Unbekanntes bricht ab', () => {
  assert.deepEqual(argumente([]).nur, ['A', 'C', 'D', 'E', 'I']);
  assert.deepEqual(argumente(['--nur', 'i']).nur, ['I']);
  assert.throws(() => argumente(['--nur', 'X']), /kennt nur A,C,D,E,I/);
});
