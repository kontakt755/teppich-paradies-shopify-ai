// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

// Server-Seite der Startseite "Heute": der Datenstand ohne ueberholte Fehler und die
// Aufgabenliste, aus der lib/todos.mjs die To-dos je Zustaendigkeit ableitet.

const tmp = praefix => fs.mkdtempSync(path.join(os.tmpdir(), praefix));

test('Datenstand: ein Fehlversuch, der aelter ist als der letzte Erfolg derselben Quelle, warnt nicht mehr', () => {
  const dir = tmp('cc-heute-stand-');
  const jetzt = new Date('2026-10-01T08:00:00.000Z');
  const erfolg = (zeitpunkt) => ({ zeitpunkt, dauerMs: 10, erfolg: true, anzahl: 5, meldung: null });
  const alterFehler = { zeitpunkt: '2026-09-28T08:25:19.426Z', meldung: 'Kein Zugang in .env.local' };
  const neuerFehler = { zeitpunkt: '2026-10-01T07:30:00.000Z', meldung: 'Kein Zugang in .env.local' };
  const datei = path.join(dir, 'aktualisierung.json');
  const inhalt = { aktualisiertAm: '2026-10-01T05:12:29.514Z', teile: {
    lexikon: { ...erfolg('2026-10-01T05:12:29.514Z'), letzterFehler: alterFehler },      // danach erneuert -> ueberholt
    bestellungen: { ...erfolg('2026-10-01T05:12:29.514Z'), letzterFehler: neuerFehler }, // Fehler NACH dem Erfolg -> bleibt
    kunden: { ...erfolg('2026-09-26T07:30:38.870Z'), letzterFehler: alterFehler },       // Fehler nach dem Erfolg -> bleibt
    bestand: { zeitpunkt: '2026-10-01T05:00:00.000Z', erfolg: false, anzahl: null, meldung: 'Kein Zugang' }, // nie gelungen -> bleibt Fehler
  } };
  fs.writeFileSync(datei, JSON.stringify(inhalt));
  const api = createApi({ gh: async () => '', root: tmp('cc-heute-root-'), privatDirPath: dir, now: () => jetzt, env: {} });

  for (const r of [api.aktualisierung(), api.aktualisierungStatus()]) {
    assert.equal(r.teile.lexikon.letzterFehler, undefined, 'ueberholter Fehler faellt weg');
    assert.equal(r.teile.lexikon.erfolg, true);
    assert.equal(r.teile.lexikon.veraltet, false);
    assert.deepEqual(r.teile.bestellungen.letzterFehler, neuerFehler);
    assert.deepEqual(r.teile.kunden.letzterFehler, alterFehler);
    assert.equal(r.teile.kunden.veraltet, true);
    assert.equal(r.teile.bestand.erfolg, false);
  }
  // Lesen raeumt die Datei nicht um - das macht erst der naechste Lauf von daten:aktualisieren.
  assert.deepEqual(JSON.parse(fs.readFileSync(datei, 'utf8')), inhalt);
});

test('Aufgabenliste fuer "Heute": alle sichtbaren offenen Aufgaben, mit technisch/darfAendern je Eintrag', () => {
  const dir = tmp('cc-heute-org-');
  const api = createApi({ gh: async () => '', root: tmp('cc-heute-root-'), privatDirPath: dir });
  const chef = { kuerzel: 'chef', rolle: 'inhaber' };
  const vk = { kuerzel: 'vk', rolle: 'mitarbeiter' };
  api.orgNeu({ titel: 'Kunde wegen Muster anrufen', bereich: 'Kunden' }, { benutzer: chef });
  api.orgNeu({ titel: 'Filter im Shop reparieren', bereich: 'Online-Shop', verantwortlich: 'web' }, { benutzer: chef });
  api.orgNeu({ titel: 'Rechnung ablegen', bereich: 'Buchhaltung', verantwortlich: 'chef' }, { benutzer: chef });
  const fertig = api.orgNeu({ titel: 'Schon erledigt', bereich: 'Laden' }, { benutzer: chef }).eintrag;
  api.orgAendern({ id: fertig.id, felder: { status: 'DONE' } }, { benutzer: chef });
  api.orgNeu({ titel: 'Private Notiz', typ: 'NOTE', sichtbarkeit: 'PRIVAT' }, { benutzer: chef });

  const r = api.orgListe({ bereich: 'alle-aufgaben', ansicht: 'offen', gruppe: 'alles', benutzer: vk });
  assert.equal(r.ich, 'vk');
  const kurz = r.eintraege.map(e => [e.titel, e.technisch, e.darfAendern]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(kurz, [
    ['Filter im Shop reparieren', true, false],     // Technik, jemand anderem zugewiesen
    ['Kunde wegen Muster anrufen', false, true],    // freie Team-Aufgabe: darf uebernommen werden
    ['Rechnung ablegen', false, false],
  ]);
  assert.ok(r.eintraege.every(e => typeof e.dringlichkeit === 'string'));
  // Die bestehenden Listen bekommen dasselbe Feld, ihr Zuschnitt bleibt.
  const team = api.orgListe({ bereich: 'team-aufgaben', ansicht: 'offen', gruppe: 'alles', benutzer: vk });
  assert.deepEqual(team.eintraege.map(e => e.technisch), [false, false]);
});
