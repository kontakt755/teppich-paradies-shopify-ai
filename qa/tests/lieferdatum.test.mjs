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

test('Heiligabend und Silvester: kein Feiertag, aber je ein Werktag Puffer (Inhaber 13.10.)', () => {
  const utc = (s) => new Date(`${s}T00:00:00Z`);
  assert.ok(!('2026-12-24' in L.feiertage(2026)));
  assert.deepEqual(Object.keys(L.puffertage(2026)).sort(), ['2026-12-24', '2026-12-31']);
  assert.equal(L.istWerktag(utc('2026-12-23')), true); // Mittwoch
  assert.equal(L.istWerktag(utc('2026-12-24')), false); // Donnerstag, Puffer
  assert.equal(L.istWerktag(utc('2026-12-31')), false); // Donnerstag, Puffer
  assert.equal(L.istWerktag(utc('2027-01-06')), true); // Heilige Drei Koenige gilt in Brandenburg nicht
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

test('Eingangstag zaehlt nicht mit, Wochenende wird uebersprungen', () => {
  // Samstag 10.10.2026: Eingangstag ist Montag 12. - Di 13. = 1, Mi 14. = 2, Mo 19. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-10T09:00:00+02:00'), ['2026-10-14', '2026-10-19']);
  // Sonntag wie Samstag
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-11T18:00:00+02:00'), ['2026-10-14', '2026-10-19']);
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

test('Jahreswechsel: Weihnachten, Neujahr und Puffertage 24.12./31.12.', () => {
  // Mi 23.12.2026: Do 24. Puffer, Fr 25./Sa 26. Feiertag, Mo 28. = 1, Di 29. = 2, Mi 30. = 3,
  // Do 31. Puffer, Fr 01.01.2027 Neujahr, Mo 04. = 4, Di 05. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-12-23T10:00:00+01:00'), ['2026-12-29', '2027-01-05']);
  // Di 29.12.2026: Mi 30. = 1, Do 31. Puffer, Fr 01.01. Neujahr, Mo 04. = 2, Di 05. = 3, Mi 06. = 4, Do 07. = 5
  assert.deepEqual(spanne('2–5 Werktage', '2026-12-29T10:00:00+01:00'), ['2027-01-04', '2027-01-07']);
  // Do 31.12.2026 (Puffertag) abends, 5–8 Werktage: Eingangstag Mo 04.01., Di 05. = 1 ... Mo 11. = 5, Do 14. = 8
  assert.deepEqual(spanne('ca. 5–8 Werktage inkl. Ketteln', '2026-12-31T22:00:00+01:00'), ['2027-01-11', '2027-01-14']);
  // Ohne Puffer waeren es fuer den 23.12. Mo 28.12. bis Mi 30.12. - der Puffer kostet je Tag einen Werktag
});

test('Heute ist der Kalendertag in Berlin, nicht in UTC oder beim Kunden', () => {
  // 23:30 UTC am Montag ist in Berlin schon Dienstag 01:30 (Sommerzeit): Do 15. bis Di 20.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T23:30:00Z'), ['2026-10-15', '2026-10-20']);
  // 21:59 UTC Montag = 23:59 Montag Berlin: noch Montag (ohne Annahmeschluss)
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T21:59:00Z'), ['2026-10-14', '2026-10-19']);
  // Zeitumstellung 25.10.2026: Montag 26.10. 23:30 Berlin (UTC+1) = 22:30 UTC bleibt Montag;
  // mit Sommerzeit gerechnet waere es schon Dienstag. Sa 31.10. Reformationstag + Wochenende.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-26T22:30:00Z'), ['2026-10-28', '2026-11-02']);
  assert.equal(tag(L.berlin(new Date('2026-10-25T23:30:00Z')).datum), '2026-10-26');
});

test('Annahmeschluss 12:00 (Inhaber 13.10.): ab 12 Uhr zaehlt der naechste Werktag', () => {
  // Montag 12.10.2026 11:59: Eingangstag Montag, Mi 14. bis Mo 19.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T11:59:00+02:00', '12:00'), ['2026-10-14', '2026-10-19']);
  // Montag 12:00 genau: als Dienstag eingegangen, Do 15. bis Di 20.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T12:00:00+02:00', '12:00'), ['2026-10-15', '2026-10-20']);
  // Winterzeit: Montag 02.11.2026 11:59 / 12:00 Berlin = 10:59 / 11:00 UTC
  assert.deepEqual(spanne('2–5 Werktage', '2026-11-02T10:59:00Z', '12:00'), ['2026-11-04', '2026-11-09']);
  assert.deepEqual(spanne('2–5 Werktage', '2026-11-02T11:00:00Z', '12:00'), ['2026-11-05', '2026-11-10']);
  // Freitag 16.10. nach 12 Uhr: Eingangstag Montag 19. (naechster Werktag), Mi 21. bis Mo 26.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-16T12:30:00+02:00', '12:00'), ['2026-10-21', '2026-10-26']);
  // Freitag vor 12 Uhr: Eingangstag Freitag, Di 20. bis Fr 23.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-16T11:00:00+02:00', '12:00'), ['2026-10-20', '2026-10-23']);
  // Freitag 02.10.2026 nach 12 Uhr, Sa 03.10. Feiertag + Wochenende: Eingangstag Mo 05., Mi 07. bis Mo 12.
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-02T13:00:00+02:00', '12:00'), ['2026-10-07', '2026-10-12']);
  // Mi 23.12.2026 nach 12 Uhr: Eingangstag Mo 28. (24. Puffer, 25./26. Feiertag), Mi 30. bis Mi 06.01.
  assert.deepEqual(spanne('2–5 Werktage', '2026-12-23T13:00:00+01:00', '12:00'), ['2026-12-30', '2027-01-06']);
  // Samstag: Annahmeschluss spielt keine Rolle, Eingangstag Montag
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-17T09:00:00+02:00', '12:00'), ['2026-10-21', '2026-10-26']);
  assert.equal(tag(L.eingangstag(berlin('2026-10-17T09:00:00+02:00'), '12:00')), '2026-10-19');
});

test('Annahmeschluss: andere Uhrzeit, leer oder ungueltig', () => {
  // Montag 12.10.2026 13:59 vor 14:00: wie ohne Annahmeschluss
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T13:59:00+02:00', '14:00'), ['2026-10-14', '2026-10-19']);
  // Montag 14:00: als Dienstag eingegangen
  assert.deepEqual(spanne('2–5 Werktage', '2026-10-12T14:00:00+02:00', '14:00'), ['2026-10-15', '2026-10-20']);
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
  assert.match(s, /tp_lz_text == blank and product\.tags contains 'sonderposten'/);
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
  const einstellungen = Object.fromEntries(schema.flatMap((g) => (g.settings || []).map((x) => [x.id, x])));
  // Inhaber 13.10.: Annahmeschluss 12:00, Sonderposten 5–7 Werktage
  assert.equal(einstellungen.tp_lieferdatum_annahmeschluss?.default, '12:00');
  assert.equal(L.leseAnnahmeschluss(einstellungen.tp_lieferdatum_annahmeschluss.default), 720);
  assert.equal(einstellungen.tp_lieferzeit_sonderposten?.default, '5–7 Werktage');
});

test('Mass-Konfigurator: Datumszeile nutzt tp_ek_lieferzeit, keinen eigenen Wert', () => {
  const k = lies('blocks/tp-einfass-konfigurator.liquid');
  assert.match(k, /render 'tp-lieferzeit', text: tp_ek_lieferzeit, product: product, kontext: 'mass'/);
  assert.doesNotMatch(k, /4–8 Werktage/);
  const s = lies('snippets/tp-lieferzeit.liquid');
  assert.match(s, /if tp_lz_kontext == 'mass'\s+assign tp_lz_text = text \| strip/);
});

test('Laminat, Parkett, Kork: Lieferzeit der Vorlage wird nicht mehr geleert', () => {
  const sl = lies('blocks/tp-service-links.liquid');
  assert.doesNotMatch(sl, /assign tp_sl_delivery_time = ''/);
  for (const v of ['planken', 'rolle', 'fliese', 'fixpreis', 'zubehoer']) {
    assert.match(lies(`templates/product.${v}.json`), /"(delivery_time|lieferzeit)": "2–5 Werktage"/, v);
  }
  assert.match(lies('templates/product.dekofell.json'), /"delivery_time": "5–7 Werktage"/);
});
