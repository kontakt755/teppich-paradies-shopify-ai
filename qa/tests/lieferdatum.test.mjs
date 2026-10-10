import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Das Asset ist ein Browser-Skript (UMD an globalThis) - einmal laden.
createRequire(import.meta.url)('../../assets/tp-lieferdatum.js');
const L = globalThis.TPLieferdatum;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (datei) => fs.readFileSync(path.join(REPO, datei), 'utf8');

// Zeitpunkt in Berlin als echter Instant: Sommerzeit bis 25.10.2026 (UTC+2),
// danach Winterzeit (UTC+1). Die Tests geben den Offset ausdruecklich an.
const berlin = (iso) => new Date(iso);
const tag = (d) => d.toISOString().slice(0, 10);
const spanne = (text, iso, annahmeschluss) => {
  const s = L.lieferspanne({ text, jetzt: berlin(iso), annahmeschluss });
  return s && [tag(s.von), tag(s.bis)];
};

test('Ostersonntag fuer bekannte Jahre', () => {
  assert.equal(tag(L.ostersonntag(2026)), '2026-04-05');
  assert.equal(tag(L.ostersonntag(2027)), '2027-03-28');
  assert.equal(tag(L.ostersonntag(2028)), '2028-04-16');
  assert.equal(tag(L.ostersonntag(2030)), '2030-04-21');
});

test('Feiertage bundesweit plus Brandenburg, ohne fremde Landesfeiertage', () => {
  const f = L.feiertage(2026);
  for (const d of ['2026-01-01', '2026-04-03', '2026-04-05', '2026-04-06', '2026-05-01', '2026-05-14',
    '2026-05-24', '2026-05-25', '2026-10-03', '2026-10-31', '2026-12-25', '2026-12-26']) {
    assert.ok(d in f, `${d} fehlt`);
  }
  // Frauentag (Berlin), Fronleichnam, Allerheiligen, Buss- und Bettag gelten in Brandenburg nicht.
  for (const d of ['2026-03-08', '2026-06-04', '2026-11-01', '2026-11-18']) assert.ok(!(d in f), `${d} zu viel`);
  assert.equal(Object.keys(f).length, 12);
});

test('Werktag: Wochenende und Feiertag zaehlen nicht', () => {
  const utc = (s) => new Date(`${s}T00:00:00Z`);
  assert.equal(L.istWerktag(utc('2026-10-12')), true); // Montag
  assert.equal(L.istWerktag(utc('2026-10-10')), false); // Samstag
  assert.equal(L.istWerktag(utc('2026-10-11')), false); // Sonntag
  assert.equal(L.istWerktag(utc('2026-10-03')), false); // Tag der Deutschen Einheit (Samstag)
  assert.equal(L.istWerktag(utc('2027-10-29')), true); // Freitag vor Reformationstag
  assert.equal(L.istWerktag(utc('2030-10-31')), false); // Reformationstag an einem Donnerstag
});

test('Werktage-Angaben lesen, Kalendertage und freie Texte ignorieren', () => {
  assert.deepEqual(L.leseWerktage('2–5 Werktage'), { min: 2, max: 5 });
  assert.deepEqual(L.leseWerktage('5-7 Werktage'), { min: 5, max: 7 });
  assert.deepEqual(L.leseWerktage('ca. 5–8 Werktage inkl. Ketteln'), { min: 5, max: 8 });
  assert.deepEqual(L.leseWerktage('3 bis 5 Werktage'), { min: 3, max: 5 });
  assert.deepEqual(L.leseWerktage('4 Werktage'), { min: 4, max: 4 });
  assert.deepEqual(L.leseWerktage('7–5 Werktage'), { min: 5, max: 7 });
  assert.equal(L.leseWerktage('ca. 14 Tage'), null);
  assert.equal(L.leseWerktage(''), null);
  assert.equal(L.leseWerktage(null), null);
  assert.equal(L.leseWerktage('0–2 Werktage'), null);
  assert.equal(L.leseWerktage('5–60 Werktage'), null);
});

test('Annahmeschluss lesen', () => {
  assert.equal(L.leseAnnahmeschluss('14:00'), 840);
  assert.equal(L.leseAnnahmeschluss('14.30'), 870);
  assert.equal(L.leseAnnahmeschluss('9'), 540);
  assert.equal(L.leseAnnahmeschluss('14 Uhr'), 840);
  assert.equal(L.leseAnnahmeschluss(''), null);
  assert.equal(L.leseAnnahmeschluss(null), null);
  assert.equal(L.leseAnnahmeschluss('25:00'), null);
  assert.equal(L.leseAnnahmeschluss('mittags'), null);
});

test('Bestelltag zaehlt nicht mit, Wochenende wird uebersprungen', () => {
  // Samstag 10.10.2026: Mo 12. = 1, Di 13. = 2, Fr 16. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-10T12:00:00+02:00'), ['2026-10-13', '2026-10-16']);
  // Montag 12.10.2026 morgens: Mi 14. bis Mo 19.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T08:00:00+02:00'), ['2026-10-14', '2026-10-19']);
  // Teppich nach Mass, Montag: 5. Werktag Mo 19., 8. Werktag Do 22.
  assert.deepEqual(spanne('ca. 5–8 Werktage inkl. Ketteln', '2026-10-12T08:00:00+02:00'), ['2026-10-19', '2026-10-22']);
});

test('Feiertage verschieben die Spanne (Tag der Deutschen Einheit, Ostern, Pfingsten)', () => {
  // Do 01.10.2026, der 03.10. faellt auf einen Samstag: Fr 02. = 1, Mo 05. = 2, Do 08. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-01T10:00:00+02:00'), ['2026-10-05', '2026-10-08']);
  // Mo 02.10.2028, Di 03.10.2028 Feiertag: Mi 04. = 1, Do 05. = 2
  assert.deepEqual(spanne('2–5 Werktage', '2028-10-02T10:00:00+02:00'), ['2028-10-05', '2028-10-10']);
  // Do 25.03.2027 vor Karfreitag/Ostermontag: Di 30.03. = 1, Mi 31.03. = 2, Fr 02.04. = 4, Mo 05.04. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2027-03-25T10:00:00+01:00'), ['2027-03-31', '2027-04-05']);
  // Mi 13.05.2026 vor Christi Himmelfahrt (Do 14.05.): Fr 15. = 1, Mo 18. = 2
  assert.deepEqual(spanne('2–5 Werktage', '2026-05-13T10:00:00+02:00'), ['2026-05-18', '2026-05-21']);
  // Fr 22.05.2026 vor Pfingstmontag (25.05.): Di 26. = 1, Mi 27. = 2
  assert.deepEqual(spanne('2–5 Werktage', '2026-05-22T10:00:00+02:00'), ['2026-05-27', '2026-06-01']);
});

test('Reformationstag (Brandenburg) wird uebersprungen', () => {
  // Di 29.10.2030, Do 31.10.2030 Feiertag: Mi 30. = 1, Fr 01.11. = 2
  assert.deepEqual(spanne('2–5 Werktage', '2030-10-29T10:00:00+01:00'), ['2030-11-01', '2030-11-06']);
});

test('Jahreswechsel: Weihnachten, Neujahr und Feiertage des Folgejahres', () => {
  // Mi 23.12.2026: Do 24. = 1 (kein Feiertag), Fr 25./Sa 26. frei, Mo 28. = 2 ... Do 31. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-12-23T10:00:00+01:00'), ['2026-12-28', '2026-12-31']);
  // Di 29.12.2026: Mi 30. = 1, Do 31. = 2, Fr 01.01.2027 Neujahr, Mo 04. = 3, Di 05. = 4, Mi 06. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-12-29T10:00:00+01:00'), ['2026-12-31', '2027-01-06']);
  // Do 31.12.2026 abends, 5–8 Werktage: Mo 04.01. = 1 ... Fr 08. = 5, Mi 13. = 8
  assert.deepEqual(spanne('ca. 5–8 Werktage inkl. Ketteln', '2026-12-31T22:00:00+01:00'), ['2027-01-08', '2027-01-13']);
});

test('Heute ist der Kalendertag in Berlin, nicht in UTC oder beim Kunden', () => {
  // 23:30 UTC am Sonntag ist in Berlin schon Montag 01:30 (Sommerzeit)
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-11T23:30:00Z'), ['2026-10-14', '2026-10-19']);
  // 22:59 UTC Sonntag = 00:59 Montag Berlin; 21:59 UTC Sonntag = 23:59 Sonntag Berlin
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-11T21:59:00Z'), ['2026-10-13', '2026-10-16']);
  // Zeitumstellung 25.10.2026: Sonntag 23:30 Berlin (UTC+1) bleibt Sonntag
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-25T22:30:00Z'), ['2026-10-27', '2026-10-30']);
  assert.equal(tag(L.berlin(new Date('2026-10-25T23:30:00Z')).datum), '2026-10-26');
});

test('Annahmeschluss: ab der Uhrzeit zaehlt der Folgetag', () => {
  // Montag 12.10.2026 13:59 vor 14:00: wie ohne Annahmeschluss
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T13:59:00+02:00', '14:00'), ['2026-10-14', '2026-10-19']);
  // Montag 14:00: als Dienstag eingegangen
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T14:00:00+02:00', '14:00'), ['2026-10-15', '2026-10-20']);
  // Freitag nach Annahmeschluss: wie Samstag, also Di bis Fr
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-16T15:00:00+02:00', '14:00'), ['2026-10-20', '2026-10-23']);
  // leerer oder ungueltiger Annahmeschluss: ohne
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T20:00:00+02:00', ''), ['2026-10-14', '2026-10-19']);
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T20:00:00+02:00', 'abends'), ['2026-10-14', '2026-10-19']);
});

test('Text: Datum mit Wochentag, Zusatz mit "ca." und der Quelle', () => {
  const t = L.lieferText({ text: '2–5 Werktage', jetzt: berlin('2026-10-12T08:00:00+02:00') });
  assert.equal(t.datum, 'Mi., 14.10. – Mo., 19.10.');
  assert.equal(t.zusatz, '(ca. 2–5 Werktage)');
  const m = L.lieferText({ text: 'ca. 5–8 Werktage inkl. Ketteln', jetzt: berlin('2026-10-12T08:00:00+02:00') });
  assert.equal(m.zusatz, '(ca. 5–8 Werktage inkl. Ketteln)');
  const e = L.lieferText({ text: '3 Werktage', jetzt: berlin('2026-10-12T08:00:00+02:00') });
  assert.equal(e.datum, 'Do., 15.10.');
  assert.equal(L.lieferText({ text: 'ca. 14 Tage', jetzt: new Date() }), null);
  assert.equal(L.formatiere(new Date('2027-01-06T00:00:00Z')), 'Mi., 06.01.');
});

test('Snippet: Metafeld vor Block-Einstellung, kein Datum bei Auslauf oder Kalendertagen', () => {
  const s = lies('snippets/tp-lieferzeit.liquid');
  assert.match(s, /product\.metafields\.service\.lieferzeit\.value/);
  assert.match(s, /product\.tags contains 'auslauf'/);
  assert.match(s, /tp_lz_text contains 'Werktag'/);
  assert.match(s, /settings\.tp_lieferdatum_annahmeschluss/);
  assert.match(s, /'tp-lieferdatum\.js' \| asset_url/);
  assert.doesNotMatch(s, /<style/);
  // Keine Bezugsquelle im ausgelieferten Theme (Vertrag aus masstepich-testmatrix)
  assert.doesNotMatch(s, /einkauf\./);
});

test('Alle Lieferzeit-Stellen laufen ueber das Snippet', () => {
  for (const datei of ['blocks/tp-service-links.liquid', 'blocks/tp-teppich-versand.liquid', 'blocks/tp-rollware-rechner.liquid', 'blocks/tp-einfass-konfigurator.liquid']) {
    assert.match(lies(datei), /render 'tp-lieferzeit'/, datei);
  }
  for (const datei of ['blocks/tp-service-links.liquid', 'blocks/tp-teppich-versand.liquid']) {
    assert.doesNotMatch(lies(datei), /<strong>Lieferzeit:<\/strong>/, datei);
  }
  const schema = JSON.parse(lies('config/settings_schema.json'));
  const ids = schema.flatMap((g) => (g.settings || []).map((x) => x.id));
  assert.ok(ids.includes('tp_lieferdatum_annahmeschluss'));
});
