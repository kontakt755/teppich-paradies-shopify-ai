import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bestaetigeBeschaffung, arbeitsuebernahme } from '../lib/beschaffung.mjs';
import { leseAlle, setzeStatus, setzeStatusPositionen } from '../lib/auftragsstatus.mjs';
import { betriebszustand } from '../lib/betriebszustand.mjs';
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beschaffung-test-')), 'auftragsstatus.json');
const p = { orderId: 'o1', lineItemId: 'l1' };
const actor = 'Person Eins', jetzt = new Date('2026-10-13T10:00:00Z');
const eingang = (datei, felder) => bestaetigeBeschaffung(datei, { ...p, actor, jetzt, soll: 10, einheit: 'paket', felder });

test('Teilmengen bleiben bestellt; vollstaendig bestaetigte Menge wird geliefert, keine alte Sammelaktion umgeht den Rest', () => {
  const f = file();
  setzeStatus(f, { ...p, status: 'bestellt', actor, jetzt });
  const r = eingang(f, { angekommen: 8, verwendbar: 7, grund: 'Ein Paket beschädigt', liefertermin: '2026-10-20' });
  assert.equal(r.status, 'bestellt'); assert.equal(r.beschaffung.wareneingang.verwendbar, 7);
  const vorher = fs.readFileSync(f, 'utf8');
  for (const status of ['geliefert', 'raus', 'erledigt']) assert.throws(() => setzeStatus(f, { ...p, status, actor }), /Fehlmenge/);
  assert.equal(fs.readFileSync(f, 'utf8'), vorher);
  assert.equal(eingang(f, { angekommen: 10, verwendbar: 10, grund: null }).status, 'geliefert');
  assert.equal(leseAlle(f)['o1::l1'].beschaffung.liefertermin, '2026-10-20');
});
test('Echte Datenfehler: ungültige Termine/Mengen ändern keinen bestehenden Stand', () => {
  const f = file(); eingang(f, { liefertermin: '2026-10-20' }); const vor = fs.readFileSync(f, 'utf8');
  for (const felder of [{ liefertermin: '2026-02-31' }, { angekommen: 3, verwendbar: 4 }, { angekommen: 11, verwendbar: 11 }, { angekommen: 8, verwendbar: 7 }, { angekommen: '', verwendbar: 0 }, { angekommen: false, verwendbar: 0 }, { freiErfunden: 1 }]) assert.throws(() => eingang(f, felder));
  assert.equal(fs.readFileSync(f, 'utf8'), vor);
});
test('Aktuelles Soll gewinnt; neue Bestätigung übernimmt keine veraltete Menge und rechnet keine Einheit um', () => {
  const f = file(); eingang(f, { angekommen: 10, verwendbar: 10 });
  const vor = fs.readFileSync(f, 'utf8');
  assert.throws(() => setzeStatus(f, { ...p, status: 'erledigt', actor, bestellmenge: { menge: 12, einheit: 'paket' } }), e => e.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vor);
  const e = bestaetigeBeschaffung(f, { ...p, actor, jetzt, soll: 12, einheit: 'paket', felder: { angekommen: 10, verwendbar: 10 } });
  assert.equal(e.beschaffung.wareneingang.soll, 12); assert.equal(e.status, 'bestellt');
  const vorEinheit = fs.readFileSync(f, 'utf8');
  assert.throws(() => bestaetigeBeschaffung(f, { ...p, actor, jetzt, soll: 12, einheit: 'muster', felder: { angekommen: 10, verwendbar: 10 } }), e => e.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vorEinheit);
});
test('Sammelstatus ist atomar: ein gesperrter Eingang verhindert auch Änderungen vorheriger Positionen', () => {
  const f = file(); eingang(f, { angekommen: 7, verwendbar: 7 }); const vor = fs.readFileSync(f, 'utf8');
  assert.throws(() => setzeStatusPositionen(f, [{ orderId: 'o2', lineItemId: 'l2', status: 'erledigt', actor }, { ...p, status: 'erledigt', actor }]), e => e.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vor);
});
test('Ungültige optionale Beschaffungstypen verweigern Lesen und Schreiben ohne Verlust; Legacy bleibt lesbar', () => {
  const f = file();
  for (const beschaffung of [{ liefertermin: 123 }, { liefertermin: '2026-02-31' }, { grund: {} }, { bestaetigtVon: [] }, { wareneingang: { soll: 3, angekommen: 2, verwendbar: 2, einheit: 123 } }, { wareneingang: { soll: 0, angekommen: 0, verwendbar: 0, einheit: 'paket' } }]) {
    const inhalt = JSON.stringify({ version: 1, positionen: { 'o1::l1': { ...p, status: 'bestellt', beschaffung } } }); fs.writeFileSync(f, inhalt);
    assert.throws(() => leseAlle(f), /beschädigt/);
    assert.throws(() => eingang(f, { liefertermin: '2026-10-20' }), /beschädigt/);
    assert.throws(() => arbeitsuebernahme(f, { positionen: [p], aktion: 'nehmen', actor }), /beschädigt/);
    assert.equal(fs.readFileSync(f, 'utf8'), inhalt);
  }
  fs.writeFileSync(f, JSON.stringify({ version: 1, positionen: { 'o1::l1': { ...p, status: 'bestellt' } } }));
  assert.equal(leseAlle(f)['o1::l1'].status, 'bestellt');
});
test('Kaputte oder strukturell ungültige Datei bleibt unangetastet, auch bei Übernahme', () => {
  const f = file();
  for (const inhalt of ['{kaputt', '{"positionen":[]}', '{"positionen":{"x":null}}']) {
    fs.writeFileSync(f, inhalt);
    assert.throws(() => eingang(f, { liefertermin: '2026-10-20' }), /beschädigt/);
    assert.throws(() => arbeitsuebernahme(f, { positionen: [p], aktion: 'nehmen', actor }), /beschädigt/);
    assert.equal(fs.readFileSync(f, 'utf8'), inhalt);
  }
});
test('Arbeitsübernahme: Leser gesperrt, Mitarbeiter nur eigenes freigeben, Inhaber übernimmt bewusst, kein Ablauf', () => {
  const f = file(), a = { kuerzel: 'eins', name: actor, rolle: 'mitarbeiter' }, b = { kuerzel: 'zwei', name: 'Person Zwei', rolle: 'mitarbeiter' };
  const tun = (person, aktion, zeit = jetzt) => arbeitsuebernahme(f, { positionen: [p], person, actor: person.name, aktion, jetzt: zeit });
  assert.throws(() => tun({ ...a, rolle: 'lesen' }, 'nehmen'), e => e.status === 403);
  tun(a, 'nehmen');
  assert.throws(() => tun(b, 'nehmen', new Date('2027-01-01')), e => e.status === 409);
  assert.throws(() => tun(b, 'freigeben'), e => e.status === 403);
  assert.throws(() => tun(b, 'uebernehmen'), e => e.status === 403);
  tun({ ...b, rolle: 'inhaber' }, 'uebernehmen');
  assert.equal(leseAlle(f)['o1::l1'].uebernahme.id, 'zwei');
  tun(b, 'freigeben'); assert.equal(leseAlle(f)['o1::l1'].uebernahme, null);
});
test('Eine fremde Position verhindert die gesamte Sammelübernahme', () => {
  const f = file(); arbeitsuebernahme(f, { positionen: [p], actor, person: { kuerzel: 'eins' }, aktion: 'nehmen' }); const vor = fs.readFileSync(f, 'utf8');
  assert.throws(() => arbeitsuebernahme(f, { positionen: [{ orderId: 'o2', lineItemId: 'l2' }, p], actor: 'Zwei', person: { kuerzel: 'zwei', rolle: 'mitarbeiter' }, aktion: 'nehmen' }), e => e.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vor);
});
test('Gesundheit: unbekannt ist keine Null, alte und kaputte Metadaten melden keinen Erfolg', () => {
  const d = path.dirname(file());
  assert.equal(betriebszustand(d, { jetzt }).sicherung.status, 'unbekannt');
  fs.writeFileSync(path.join(d, 'sicherungsstand.json'), JSON.stringify({ letzterErfolg: '2026-10-13T08:00:00Z' }));
  fs.writeFileSync(path.join(d, 'fehlermeldungen-abgleich.json'), JSON.stringify({ aktualisiertAm: '2026-10-10T08:00:00Z', sensibleInhalte: 'nicht im Ergebnis' }));
  const r = betriebszustand(d, { jetzt }); assert.equal(r.sicherung.status, 'ok'); assert.equal(r.werkbank.lokalerStatus, 'alt'); assert.equal(r.werkbank.status, 'unbekannt'); assert.equal(r.werkbank.vollabgleich, 'unbekannt'); assert.ok(!JSON.stringify(r).includes('sensibleInhalte'));
  fs.writeFileSync(path.join(d, 'sicherungsstand.json'), '{kaputt'); assert.equal(betriebszustand(d, { jetzt }).sicherung.status, 'fehler');
});
