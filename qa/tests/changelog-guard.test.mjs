// Tests fuer scripts/changelog-guard.mjs und scripts/changelog.mjs - ein Changelog-Eintrag
// des Control Centers ist eine Datei, die alte Sammeldatei ist eingefroren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wegwerfOrdner } from '../../scripts/test-temp.mjs';
import {
  ALTE_DATEI, EINFRIERDATUM, ORDNER, ladeEintraege, pruefe, pruefeAlteDatei, pruefeEintrag,
} from '../../scripts/changelog-guard.mjs';
import { ausgabe, optionen } from '../../scripts/changelog.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const GUT = [
  '## 2026-10-29 · Ein Beispiel (#1)',
  '',
  '- **Geaendert:** etwas.',
  '- **Getestet:** `npm test` gruen.',
  '- **Risiken/Annahmen:** keine.',
  '- **Nächste Stufe:** keine.',
  '',
].join('\n');

function repo({ eintraege = {}, alt = '# Control Center – Fortschritt\n\n## 2026-10-20 · Alt\n' } = {}) {
  const root = wegwerfOrdner('tp-changelog-guard-');
  fs.mkdirSync(path.join(root, ORDNER), { recursive: true });
  fs.writeFileSync(path.join(root, ORDNER, 'README.md'), '# Format\n');
  for (const [name, text] of Object.entries(eintraege)) fs.writeFileSync(path.join(root, ORDNER, name), text);
  if (alt !== null) fs.writeFileSync(path.join(root, ALTE_DATEI), alt);
  return root;
}

test('gueltiger Eintrag: Dateiname, Kopfzeile und alle Abschnitte -> kein Fehler', () => {
  assert.deepEqual(pruefeEintrag('2026-10-29-beispiel.md', GUT), []);
});

test('die anderen Schreibweisen aus der alten Datei gelten weiter', () => {
  const text = GUT
    .replace('**Geaendert:**', '**Geändert:**')
    .replace('**Risiken/Annahmen:**', '**Risiken:**')
    .replace('**Nächste Stufe:**', '**Naechste Stufe:**');
  assert.deepEqual(pruefeEintrag('2026-10-29-beispiel.md', text), []);
});

test('Dateiname: Grossbuchstaben, Umlaute, Leerzeichen, fehlendes Datum fallen durch', () => {
  for (const name of ['2026-10-29-Beispiel.md', '2026-10-29-müster.md', '2026-10-29 beispiel.md', 'beispiel.md', '2026-10-29.md', '2026-10-29-beispiel.txt', '2026-10-29--doppelt.md']) {
    const f = pruefeEintrag(name, GUT);
    assert.equal(f.length, 1, name);
    assert.match(f[0], /Dateiname muss JJJJ-MM-TT-<kurzname>\.md sein/);
  }
});

test('Kopfzeile: Datum muss zum Dateinamen passen und der Form "## Datum · Titel" folgen', () => {
  const anderesDatum = pruefeEintrag('2026-10-30-beispiel.md', GUT);
  assert.equal(anderesDatum.length, 1);
  assert.match(anderesDatum[0], /Kopfzeile \(2026-10-29\) weicht vom Dateinamen \(2026-10-30\) ab/);
  const ohneTrenner = pruefeEintrag('2026-10-29-beispiel.md', GUT.replace(' · ', ' - '));
  assert.match(ohneTrenner[0], /erste Zeile muss "## 2026-10-29 · Titel" sein/);
  const ungueltig = pruefeEintrag('2026-13-01-beispiel.md', GUT.replace('2026-10-29', '2026-13-01'));
  assert.match(ungueltig[0], /kein gueltiges Datum/);
});

test('jeder fehlende Pflichtabschnitt wird einzeln genannt', () => {
  const ohne = GUT.split('\n').filter((z) => !z.includes('Getestet') && !z.includes('Nächste')).join('\n');
  const f = pruefeEintrag('2026-10-29-beispiel.md', ohne);
  assert.deepEqual(f, [
    '2026-10-29-beispiel.md: Abschnitt "- **Getestet:**" fehlt.',
    '2026-10-29-beispiel.md: Abschnitt "- **Nächste Stufe:**" fehlt.',
  ]);
});

test('alte Datei: eine Ueberschrift nach dem Einfrierdatum ist ein Fehler, am Einfrierdatum nicht', () => {
  assert.deepEqual(pruefeAlteDatei(`## ${EINFRIERDATUM} · Noch erlaubt\n## 2026-10-01 · Alt\n`), []);
  const f = pruefeAlteDatei('## 2026-10-30 · Zu spaet\n## 2026-11-02 – Auch\n');
  assert.equal(f.length, 2);
  assert.match(f[0], /neuer als das Einfrierdatum 2026-10-29/);
  assert.match(f[0], new RegExp(ORDNER.replace(/\\/g, '\\\\')));
});

test('pruefe: README wird ignoriert, Fehler aus Eintraegen und alter Datei kommen zusammen', () => {
  const sauber = repo({ eintraege: { '2026-10-29-a.md': GUT, '2026-10-30-b.md': GUT.replace('2026-10-29', '2026-10-30') } });
  assert.deepEqual(pruefe(sauber), { fehler: [], anzahl: 2 });

  const kaputt = repo({
    eintraege: { '2026-10-29-a.md': GUT, 'Notiz.md': GUT },
    alt: '# Alt\n\n## 2026-11-01 · Nachzuegler\n',
  });
  const { fehler } = pruefe(kaputt);
  assert.equal(fehler.length, 2);
  assert.match(fehler[0], /^Notiz\.md: Dateiname/);
  assert.match(fehler[1], /Nachzuegler/);
});

test('pruefe: fehlender Ordner ist ein Fehler', () => {
  const root = wegwerfOrdner('tp-changelog-guard-leer-');
  assert.match(pruefe(root).fehler[0], /fehlt/);
});

test('ladeEintraege: neueste zuerst, README nicht dabei', () => {
  const root = repo({ eintraege: { '2026-10-29-a.md': GUT, '2026-11-02-c.md': GUT, '2026-10-30-b.md': GUT } });
  assert.deepEqual(ladeEintraege(root).map((e) => e.name), ['2026-11-02-c.md', '2026-10-30-b.md', '2026-10-29-a.md']);
});

test('changelog: --letzte begrenzt, --namen listet nur Dateinamen, Unbekanntes bricht ab', () => {
  const eintraege = [
    { name: '2026-10-30-b.md', text: '## 2026-10-30 · B\n' },
    { name: '2026-10-29-a.md', text: '## 2026-10-29 · A\n' },
  ];
  assert.equal(ausgabe(eintraege, optionen(['--letzte', '1'])), '<!-- 2026-10-30-b.md -->\n## 2026-10-30 · B');
  assert.equal(ausgabe(eintraege, optionen(['--namen'])), '2026-10-30-b.md\n2026-10-29-a.md');
  assert.equal(optionen([]).letzte, 10);
  assert.throws(() => optionen(['--letzte', 'x']), /Zahl ab 1/);
  assert.throws(() => optionen(['--alles']), /Unbekannte Option/);
});

test('CLI: Exit 1 mit Fehlerzeilen, Exit 0 mit Zusammenfassung', () => {
  const skript = path.join(wurzel, 'scripts/changelog-guard.mjs');
  const kaputt = repo({ eintraege: { 'falsch.md': GUT } });
  const r1 = spawnSync(process.execPath, [skript, '--wurzel', kaputt], { encoding: 'utf8' });
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /FEHLER falsch\.md/);
  const gut = repo({ eintraege: { '2026-10-29-a.md': GUT } });
  const r2 = spawnSync(process.execPath, [skript, '--wurzel', gut], { encoding: 'utf8' });
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /1 Eintraege .* in Ordnung/);
});

test('das Repository selbst besteht den Guard (eigener Eintrag als Datei, alte Datei eingefroren)', () => {
  const { fehler, anzahl } = pruefe(wurzel);
  assert.deepEqual(fehler, []);
  assert.ok(anzahl >= 1, 'mindestens der Eintrag dieses Umbaus liegt als Datei vor');
});
