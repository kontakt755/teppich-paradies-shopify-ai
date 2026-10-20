import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { aendereMusterDruckliste, leseMusterDruckliste, musterDrucklistePfad } from '../../../operations/lib/muster-druckliste.mjs';

const exec = promisify(execFile);
const am = '2026-10-20T09:00:00.000Z';
const spaeter = '2026-10-20T10:00:00.000Z';
const actor = { id: 'test-mitarbeiter', name: 'Mitarbeiter Test' };
const etikett = { serie: 'Testvelours', farbe: 'Sand', sku: 'TEST-SA', url: 'https://www.teppich-paradies.net/products/testvelours', technik: [{ label: 'Art', wert: 'Testart' }], fehlt: [] };
const eintrag = (id = randomUUID(), anzahl = 1) => ({ id, produktHandle: 'testvelours', produktTitel: 'Testvelours Teppichboden', bezeichnung: 'Sand · TEST-SA', etikett: structuredClone(etikett), anzahl });
const ref = e => ({ id: e.id, revision: e.revision });
const ist = status => e => e?.status === status && e?.statusCode === status;

function umgebung(t) {
  const privatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-druckliste-test-'));
  t.after(() => fs.rmSync(privatDir, { recursive: true, force: true }));
  const file = musterDrucklistePfad(privatDir);
  const aendern = daten => aendereMusterDruckliste({ privatDir, actor, now: am, vorgangId: randomUUID(), ...daten });
  const add = (e = eintrag()) => aendern({ aktion: 'hinzufuegen', vorgangId: e.id, eintrag: e });
  return { privatDir, file, aendern, add, lesen: () => leseMusterDruckliste({ privatDir }) };
}

test('Erstbetrieb ist nur lesend leer; neue Snapshots bleiben bei Statuswechseln unveraendert und privat', t => {
  const u = umgebung(t);
  assert.deepEqual(u.lesen(), { schema: 1, eintraege: [] });
  assert.equal(fs.existsSync(u.file), false);
  const e = eintrag();
  const a = u.add(e).eintraege[0];
  e.etikett.serie = 'Nachtraeglich geaendert';
  assert.deepEqual(a.etikett, etikett);
  assert.deepEqual([a.status, a.revision, a.erstelltAm, a.erstelltVon, a.druckauftrag], ['offen', 1, am, actor.name, null]);
  assert.equal(fs.statSync(u.file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(u.privatDir), ['muster-druckliste.json']);
  const batch = randomUUID();
  const r = u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: batch }).eintraege[0];
  assert.deepEqual(r.etikett, etikett);
  assert.equal(r.status, 'in_druck');
  assert.equal(r.revision, 2);
  assert.deepEqual(r.druckauftrag, { id: batch, von: actor.name, am });
});

test('Replay ist idempotent, liefert den aktuellen Stand und schreibt weder nach Hinzufuegen noch spaeter neu', t => {
  const u = umgebung(t), e = eintrag();
  u.add(e);
  const a = u.lesen().eintraege[0];
  u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: randomUUID() });
  const vorher = fs.readFileSync(u.file, 'utf8');
  const replay = u.aendern({ aktion: 'hinzufuegen', vorgangId: e.id, eintrag: e, now: spaeter });
  assert.equal(replay.wiederholt, true);
  assert.equal(replay.eintraege.length, 1);
  assert.equal(replay.eintraege[0].status, 'in_druck');
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  assert.equal(u.aendern({ aktion: 'hinzufuegen', vorgangId: e.id.toUpperCase(), eintrag: { ...e, id: e.id.toUpperCase() } }).wiederholt, true, 'UUID-Schreibweise erzeugt keinen neuen Vorgang');
  assert.throws(() => u.aendern({ aktion: 'hinzufuegen', vorgangId: e.id, eintrag: { ...e, anzahl: 2 } }), ist(409));
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
});

test('stale Revision oder fremde Reservierung laesst die ganze Auswahl unveraendert', t => {
  const u = umgebung(t);
  u.add(); u.add();
  const [a, b] = u.lesen().eintraege;
  const vorher = fs.readFileSync(u.file, 'utf8');
  assert.throws(() => u.aendern({ aktion: 'reservieren', eintraege: [ref(a), { id: b.id, revision: 2 }], druckauftragId: randomUUID() }), ist(409));
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  const batch = randomUUID();
  const stand = u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: batch });
  const reserviert = stand.eintraege.find(e => e.id === a.id);
  const gesperrt = fs.readFileSync(u.file, 'utf8');
  for (const aktion of ['reservieren', 'entfernen', 'freigeben', 'erledigen']) {
    assert.throws(() => u.aendern({ aktion, eintraege: [ref(reserviert)], ...(aktion === 'entfernen' ? {} : { druckauftragId: randomUUID() }) }), ist(409));
    assert.equal(fs.readFileSync(u.file, 'utf8'), gesperrt);
  }
});

test('nur passender Druckauftrag kann freigeben oder abschliessen; manueller Freigabeklick darf anderer Mitarbeiter sein', t => {
  const u = umgebung(t);
  const a = u.add().eintraege[0], batch = randomUUID();
  const b = u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: batch }).eintraege[0];
  const c = u.aendern({ aktion: 'freigeben', eintraege: [ref(b)], druckauftragId: batch, actor: 'Anderer Mitarbeiter', now: spaeter }).eintraege[0];
  assert.equal(c.status, 'offen'); assert.equal(c.revision, 3); assert.equal(c.druckauftrag, null);
  assert.equal(c.geaendertVon, 'Anderer Mitarbeiter');
  const batch2 = randomUUID();
  const d = u.aendern({ aktion: 'reservieren', eintraege: [ref(c)], druckauftragId: batch2 }).eintraege[0];
  const vorgangId = randomUUID();
  const args = { aktion: 'erledigen', vorgangId, eintraege: [ref(d)], druckauftragId: batch2, now: spaeter };
  const fertig = u.aendern(args).eintraege[0];
  assert.deepEqual([fertig.status, fertig.revision, fertig.gedrucktAm, fertig.gedrucktVon], ['gedruckt', 5, spaeter, actor.name]);
  assert.equal(fertig.druckauftrag.id, batch2);
  assert.equal(u.aendern(args).wiederholt, true);
  assert.throws(() => u.aendern({ ...args, vorgangId: randomUUID(), eintraege: [ref(fertig)] }), ist(409));
});

test('Entfernen erzeugt einen Tombstone und Replay kann keinen zweiten Eintrag hinzufuegen', t => {
  const u = umgebung(t), e = eintrag();
  const a = u.add(e).eintraege[0], vorgangId = randomUUID();
  const args = { aktion: 'entfernen', vorgangId, eintraege: [ref(a)] };
  const b = u.aendern(args).eintraege[0];
  assert.equal(b.status, 'entfernt'); assert.equal(b.revision, 2);
  assert.equal(u.aendern(args).wiederholt, true);
  assert.equal(u.add(e).eintraege[0].status, 'entfernt');
  assert.equal(u.lesen().eintraege.length, 1);
  assert.throws(() => u.aendern({ aktion: 'hinzufuegen', eintrag: e }), ist(409));
});

test('einzelnes Entfernen beendet den vollstaendigen Auftrag atomar und gibt den Rest wieder frei', t => {
  const u = umgebung(t), job = randomUUID();
  for (let i = 0; i < 5; i++) u.add(eintrag(randomUUID(), i + 1));
  const reserviert = u.aendern({ aktion: 'reservieren', eintraege: u.lesen().eintraege.map(ref), druckauftragId: job }).eintraege;
  const ziel = reserviert[2];
  const r = u.aendern({ aktion: 'auftrag_entfernen', eintraege: reserviert.map(ref), druckauftragId: job, entfernenIds: [ziel.id], actor: 'Anderer Mitarbeiter', now: spaeter });
  assert.deepEqual(r.eintraege.map(e => e.status), ['offen', 'offen', 'entfernt', 'offen', 'offen']);
  for (const e of r.eintraege) {
    const alt = reserviert.find(a => a.id === e.id);
    assert.deepEqual(e.etikett, alt.etikett);
    assert.deepEqual([e.revision, e.druckauftrag, e.geaendertAm, e.geaendertVon], [alt.revision + 1, null, spaeter, 'Anderer Mitarbeiter']);
    assert.equal(e.anzahl, alt.anzahl);
    assert.equal(Object.hasOwn(e, 'gedrucktAm'), false);
    assert.equal(Object.hasOwn(e, 'gedrucktVon'), false);
    if (e.id === ziel.id) assert.deepEqual([e.entferntAm, e.entferntVon], [spaeter, 'Anderer Mitarbeiter']);
    else assert.equal(Object.hasOwn(e, 'entferntAm'), false);
  }
  assert.deepEqual(u.lesen().eintraege, r.eintraege, 'Ergebnis bleibt gueltig lesbar');
  const vorher = fs.readFileSync(u.file, 'utf8');
  assert.throws(() => u.aendern({ aktion: 'erledigen', eintraege: reserviert.map(ref), druckauftragId: job }), ist(409), 'alter Papierabschluss darf keinen Rest bestaetigen');
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  const offen = r.eintraege.filter(e => e.status === 'offen');
  assert.equal(u.aendern({ aktion: 'reservieren', eintraege: offen.map(ref), druckauftragId: randomUUID() }).eintraege.filter(e => e.status === 'in_druck').length, 4);
});

test('gesamten Auftrag entfernen laesst andere Auftraege, spaetere Vormerkungen und Historie unveraendert', t => {
  const u = umgebung(t), job = randomUUID(), andererJob = randomUUID();
  const historie = u.aendern({ aktion: 'entfernen', eintraege: [ref(u.add().eintraege[0])] }).eintraege[0];
  const papier = eintrag(); u.add(papier);
  const papierJob = randomUUID(), p = u.lesen().eintraege.find(e => e.id === papier.id);
  const pReserviert = u.aendern({ aktion: 'reservieren', eintraege: [ref(p)], druckauftragId: papierJob }).eintraege.find(e => e.id === papier.id);
  u.aendern({ aktion: 'erledigen', eintraege: [ref(pReserviert)], druckauftragId: papierJob });
  const eigene = [eintrag(), eintrag()];
  for (const e of eigene) u.add(e);
  u.aendern({ aktion: 'reservieren', eintraege: u.lesen().eintraege.filter(e => eigene.some(a => a.id === e.id)).map(ref), druckauftragId: job });
  const fremd = eintrag(); u.add(fremd);
  const f = u.lesen().eintraege.find(e => e.id === fremd.id);
  u.aendern({ aktion: 'reservieren', eintraege: [ref(f)], druckauftragId: andererJob });
  const spaeterVorgemerkt = eintrag(); u.add(spaeterVorgemerkt);
  const stand = u.lesen().eintraege, es = stand.filter(e => e.druckauftrag?.id === job);
  const r = u.aendern({ aktion: 'auftrag_entfernen', eintraege: es.map(ref), druckauftragId: job, entfernenIds: es.map(e => e.id), now: spaeter });
  for (const e of es) {
    const neu = r.eintraege.find(a => a.id === e.id);
    assert.deepEqual([neu.status, neu.revision, neu.druckauftrag, neu.entferntAm, neu.entferntVon], ['entfernt', e.revision + 1, null, spaeter, actor.name]);
  }
  assert.deepEqual(r.eintraege.filter(e => !eigene.some(a => a.id === e.id)), stand.filter(e => !eigene.some(a => a.id === e.id)));
  assert.deepEqual(r.eintraege.find(e => e.id === historie.id), historie);
});

test('Auftrag entfernen verlangt vollstaendige aktuelle Mitgliedschaft und laesst Konflikte atomar unveraendert', t => {
  const u = umgebung(t), job = randomUUID();
  u.add(); u.add();
  const es = u.aendern({ aktion: 'reservieren', eintraege: u.lesen().eintraege.map(ref), druckauftragId: job }).eintraege;
  const offen = eintrag(); u.add(offen);
  const offenerEintrag = u.lesen().eintraege.find(e => e.id === offen.id);
  const anderer = eintrag(); u.add(anderer);
  const andererEintrag = u.lesen().eintraege.find(e => e.id === anderer.id);
  const fremd = u.aendern({ aktion: 'reservieren', eintraege: [ref(andererEintrag)], druckauftragId: randomUUID() }).eintraege.find(e => e.id === anderer.id);
  const basis = { aktion: 'auftrag_entfernen', eintraege: es.map(ref), druckauftragId: job, entfernenIds: [es[0].id] };
  const vorher = fs.readFileSync(u.file, 'utf8');
  const fehlerhafte = [
    { ...basis, eintraege: [ref(es[0])] },
    { ...basis, eintraege: [...es.map(ref), ref(offenerEintrag)] },
    { ...basis, eintraege: [...es.map(ref), ref(fremd)] },
    { ...basis, eintraege: [ref(es[0]), { id: es[1].id, revision: es[1].revision - 1 }] },
    { ...basis, eintraege: [ref(es[0]), { id: randomUUID(), revision: 1 }] },
    { ...basis, druckauftragId: randomUUID() },
  ];
  for (const eingabe of fehlerhafte) {
    assert.throws(() => u.aendern(eingabe), ist(409));
    assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  }
});

test('ungueltige Entfernziele oder Auftragsreferenzen schreiben nichts', t => {
  const u = umgebung(t), job = randomUUID();
  u.add(); u.add();
  const es = u.aendern({ aktion: 'reservieren', eintraege: u.lesen().eintraege.map(ref), druckauftragId: job }).eintraege;
  const basis = { aktion: 'auftrag_entfernen', eintraege: es.map(ref), druckauftragId: job, entfernenIds: [es[0].id] };
  const vorher = fs.readFileSync(u.file, 'utf8');
  for (const entfernenIds of [undefined, null, [], 'kein-array', [null], ['keine-uuid'], [randomUUID()], [es[0].id, es[0].id.toUpperCase()], [...es.map(e => e.id), randomUUID()]]) {
    assert.throws(() => u.aendern({ ...basis, entfernenIds }), ist(400));
    assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  }
  for (const eingabe of [
    { ...basis, druckauftragId: undefined }, { ...basis, druckauftragId: 'kein-auftrag' },
    { ...basis, eintraege: [] }, { ...basis, eintraege: [ref(es[0]), ref(es[0])] },
    { ...basis, eintraege: [{ id: es[0].id, revision: 0 }] },
  ]) {
    assert.throws(() => u.aendern(eingabe), ist(400));
    assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  }
});

test('Auftrag entfernen normalisiert Kennungen und ist auch nach erneuter Reservierung idempotent', t => {
  const u = umgebung(t), job = randomUUID(), vorgangId = randomUUID();
  u.add(); u.add(); u.add();
  const es = u.aendern({ aktion: 'reservieren', eintraege: u.lesen().eintraege.map(ref), druckauftragId: job }).eintraege;
  const args = { aktion: 'auftrag_entfernen', vorgangId, eintraege: es.map(ref), druckauftragId: job, entfernenIds: [es[1].id, es[0].id] };
  const r = u.aendern(args);
  const wiederOffen = r.eintraege.filter(e => e.status === 'offen');
  u.aendern({ aktion: 'reservieren', eintraege: wiederOffen.map(ref), druckauftragId: randomUUID() });
  const vorher = fs.readFileSync(u.file, 'utf8');
  const replay = u.aendern({ ...args, vorgangId: vorgangId.toUpperCase(), druckauftragId: job.toUpperCase(), eintraege: [...es].reverse().map(e => ({ id: e.id.toUpperCase(), revision: e.revision })), entfernenIds: [es[0].id.toUpperCase(), es[1].id.toUpperCase()], now: spaeter });
  assert.equal(replay.wiederholt, true);
  assert.deepEqual(replay.eintraege.map(e => e.status), ['entfernt', 'entfernt', 'in_druck']);
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  assert.throws(() => u.aendern({ ...args, entfernenIds: [es[2].id] }), ist(409));
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
});

test('Auftrag entfernen bewahrt Bestellquelle und unveraenderliches Etikett samt Wiederholungsschutz', t => {
  const u = umgebung(t), job = randomUUID();
  const quelle = { art: 'musterbestellung', orderId: 'gid://shopify/Order/901', lineItemId: 'gid://shopify/LineItem/301', orderName: '#TEST-901', bestellmenge: 3 };
  const original = { ...eintrag(randomUUID(), 2), quelle };
  const a = u.aendern({ aktion: 'bestellung_hinzufuegen', eintraege: [original] }).eintraege[0];
  const b = u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: job }).eintraege[0];
  const c = u.aendern({ aktion: 'auftrag_entfernen', eintraege: [ref(b)], druckauftragId: job, entfernenIds: [b.id] }).eintraege[0];
  assert.deepEqual(c.quelle, quelle); assert.deepEqual(c.etikett, original.etikett);
  const erneut = u.aendern({ aktion: 'bestellung_hinzufuegen', eintraege: [{ ...original, id: randomUUID() }] });
  assert.deepEqual([erneut.neu, erneut.bereits, erneut.eintraege.length], [0, 1, 1]);
  assert.deepEqual(erneut.eintraege[0], c);
});

test('Eingabelimits, UUIDs und doppelte Auswahl werden vor dem Schreiben abgewiesen', t => {
  const u = umgebung(t);
  for (const anzahl of [0, 21, 1.5, '2']) assert.throws(() => u.add(eintrag(randomUUID(), anzahl)), ist(400));
  assert.throws(() => u.aendern({ aktion: 'hinzufuegen', vorgangId: 'keine-uuid', eintrag: eintrag() }), ist(400));
  assert.throws(() => u.add({ ...eintrag(), etikett: { ...etikett, fehlt: ['Farbe'] } }), ist(400));
  assert.equal(fs.existsSync(u.file), false);
  const a = u.add().eintraege[0];
  assert.throws(() => u.aendern({ aktion: 'reservieren', eintraege: [ref(a), ref(a)], druckauftragId: randomUUID() }), ist(400));
  assert.throws(() => u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: 'kein-auftrag' }), ist(400));
  assert.throws(() => u.aendern({ aktion: 'entfernen', eintraege: [{ id: a.id, revision: 0 }] }), ist(400));
});

test('Sammeldruck erlaubt 5000 Aufkleber, verweigert mehr atomar und Entfernen zaehlt Positionen', t => {
  const u = umgebung(t);
  u.add(eintrag(randomUUID(), 20));
  const daten = JSON.parse(fs.readFileSync(u.file, 'utf8'));
  daten.eintraege = Array.from({ length: 251 }, () => ({ ...daten.eintraege[0], id: randomUUID() }));
  fs.writeFileSync(u.file, JSON.stringify(daten));
  const alle = u.lesen().eintraege, vorher = fs.readFileSync(u.file, 'utf8');
  assert.throws(() => u.aendern({ aktion: 'reservieren', eintraege: alle.map(ref), druckauftragId: randomUUID() }), ist(400));
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  const r = u.aendern({ aktion: 'reservieren', eintraege: alle.slice(0, 250).map(ref), druckauftragId: randomUUID() });
  assert.equal(r.eintraege.filter(e => e.status === 'in_druck').reduce((n, e) => n + e.anzahl, 0), 5000);
  const letzter = r.eintraege.at(-1);
  assert.equal(u.aendern({ aktion: 'entfernen', eintraege: [ref(letzter)] }).eintraege.at(-1).status, 'entfernt');
});

test('Sammelentfernen scheitert auch bei mehr als 5000 Kopien nicht am Drucklimit', t => {
  const u = umgebung(t);
  const basis = u.add(eintrag(randomUUID(), 20)).eintraege[0];
  const daten = JSON.parse(fs.readFileSync(u.file, 'utf8'));
  daten.eintraege = Array.from({ length: 300 }, () => ({ ...basis, id: randomUUID() }));
  fs.writeFileSync(u.file, JSON.stringify(daten));
  const r = u.aendern({ aktion: 'entfernen', eintraege: daten.eintraege.map(ref) });
  assert.equal(r.eintraege.filter(e => e.status === 'entfernt').length, 300);
  assert.throws(() => u.aendern({ aktion: 'entfernen', eintraege: Array.from({ length: 1001 }, () => ({ id: randomUUID(), revision: 1 })) }), ist(400));
});

test('kaputtes JSON, falsches Schema oder falsche Eintraege werden nie als leer gelesen/ueberschrieben', t => {
  const u = umgebung(t);
  const valide = () => { fs.rmSync(u.file, { force: true }); u.add(); return JSON.parse(fs.readFileSync(u.file, 'utf8')); };
  const falsch = valide(); falsch.eintraege[0].anzahl = 0;
  const doppelt = valide(); doppelt.eintraege.push(structuredClone(doppelt.eintraege[0]));
  for (const roh of ['', '{kaputt', '{}', JSON.stringify({ schema: 99, eintraege: [], vorgaenge: [] }), JSON.stringify(falsch), JSON.stringify(doppelt)]) {
    fs.writeFileSync(u.file, roh);
    assert.throws(() => u.lesen(), ist(500));
    assert.throws(() => u.add(), ist(500));
    assert.equal(fs.readFileSync(u.file, 'utf8'), roh);
    assert.equal(fs.existsSync(`${u.file}.lock`), false);
  }
  fs.unlinkSync(u.file); fs.mkdirSync(u.file);
  assert.throws(() => u.lesen(), ist(500));
});

test('exklusive fremde Sperre bleibt bestehen und eine erfolgreiche Ersetzung hat Modus0600', t => {
  const u = umgebung(t);
  fs.writeFileSync(`${u.file}.lock`, 'anderer-besitzer');
  assert.throws(() => u.add(), ist(409));
  assert.equal(fs.readFileSync(`${u.file}.lock`, 'utf8'), 'anderer-besitzer');
  fs.unlinkSync(`${u.file}.lock`);
  const a = u.add().eintraege[0];
  fs.chmodSync(u.file, 0o644);
  u.aendern({ aktion: 'entfernen', eintraege: [ref(a)] });
  assert.equal(fs.statSync(u.file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(u.privatDir), ['muster-druckliste.json']);
});

test('alte Sperre eines nachweislich beendeten Prozesses wird geraeumt, Druckreservierung bleibt erhalten', async t => {
  const u = umgebung(t), batch = randomUUID();
  const a = u.add().eintraege[0];
  u.aendern({ aktion: 'reservieren', eintraege: [ref(a)], druckauftragId: batch });
  const { stdout } = await exec(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']);
  const tot = Number(stdout), vorhin = new Date(Date.now() - 60_000);
  const schreibeAlteSperre = file => {
    fs.writeFileSync(file, JSON.stringify({ pid: tot, kennung: randomUUID(), am }));
    fs.utimesSync(file, vorhin, vorhin);
  };
  schreibeAlteSperre(`${u.file}.lock`);
  schreibeAlteSperre(`${u.file}.lock.raeumen`);
  const stand = u.add().eintraege;
  assert.equal(stand.length, 2);
  assert.equal(stand[0].status, 'in_druck');
  assert.equal(stand[0].druckauftrag.id, batch);
  assert.deepEqual(fs.readdirSync(u.privatDir), ['muster-druckliste.json']);
});

test('alte lebende oder unbekannte Sperren werden nicht wegen ihres Alters entfernt', t => {
  const u = umgebung(t), lock = `${u.file}.lock`, vorhin = new Date(Date.now() - 60_000);
  for (const roh of [JSON.stringify({ pid: process.pid, kennung: randomUUID(), am }), '{kaputt', JSON.stringify({ kennung: randomUUID() })]) {
    fs.writeFileSync(lock, roh); fs.utimesSync(lock, vorhin, vorhin);
    assert.throws(() => u.add(), ist(409));
    assert.equal(fs.readFileSync(lock, 'utf8'), roh);
    assert.equal(fs.existsSync(u.file), false);
  }
});

test('zwei Serverprozesse verlieren bei parallelen Aenderungen keine Eintraege und reservieren nicht doppelt', async t => {
  const u = umgebung(t);
  const modul = new URL('../../../operations/lib/muster-druckliste.mjs', import.meta.url).href;
  const code = `
    import { aendereMusterDruckliste } from ${JSON.stringify(modul)};
    const [privatDir, eintraege] = JSON.parse(process.argv[1]);
    for (const eintrag of eintraege) {
      let fertig = false;
      for (let i = 0; i < 500 && !fertig; i++) {
        try { aendereMusterDruckliste({ privatDir, actor:'Testprozess', aktion:'hinzufuegen', vorgangId:eintrag.id, eintrag }); fertig = true; }
        catch (e) { if (e.status !== 409) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2); }
      }
      if (!fertig) throw new Error('Sperre wurde nicht frei');
    }
  `;
  const a = Array.from({ length: 8 }, () => eintrag()), b = Array.from({ length: 8 }, () => eintrag());
  await Promise.all([a, b].map(es => exec(process.execPath, ['--input-type=module', '-e', code, JSON.stringify([u.privatDir, es])])));
  assert.equal(u.lesen().eintraege.length, 16);
  const alle = u.lesen().eintraege;
  const reserviere = `
    import { aendereMusterDruckliste } from ${JSON.stringify(modul)};
    const args = JSON.parse(process.argv[1]);
    try { aendereMusterDruckliste(args); process.stdout.write('200'); }
    catch (e) { process.stdout.write(String(e.status)); }
  `;
  const antworten = await Promise.all([1, 2].map(() => exec(process.execPath, ['--input-type=module', '-e', reserviere, JSON.stringify({ privatDir: u.privatDir, actor: 'Testprozess', aktion: 'reservieren', vorgangId: randomUUID(), druckauftragId: randomUUID(), eintraege: alle.map(ref) })])));
  assert.deepEqual(antworten.map(r => r.stdout).sort(), ['200', '409']);
  assert.equal(u.lesen().eintraege.filter(e => e.status === 'in_druck').length, 16);
});
