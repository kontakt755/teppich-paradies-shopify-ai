import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { musterAutomatikLauf, musterAutomatikPlan, musterAutomatikDaten, musterAutomatikAnzeige } from '../lib/muster-bestellautomatik.mjs';
import { pruefeStammdaten } from '../lib/lieferanten.mjs';
import { leseAlle, setzeStatus, setzeZurueckAufOffen, positionKey } from '../lib/auftragsstatus.mjs';
import { mustersperrePfad, leseSperren, stand as sperrStand, haengeAn, ereignis, GRUND } from '../lib/mustersperre.mjs';
const JETZT = new Date('2026-10-23T12:00:00Z');
function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-muster-auto-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const datei = (name, data, mode = 0o600) => { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data), { mode }); return f; };
  const exportFile = datei('bestelluebersicht/orders.json', { orders: [] }); fs.utimesSync(exportFile, JETZT, JETZT);
  const regel = { kostenlos: true, empfaenger: 'muster@lieferant-a.example', lieferziel: 'laden', produktgruppen: ['Teppichboden', 'Klebevinyl'] };
  const konfig = { aktiv: true, ab: '2026-10-23T10:00:00Z', lieferanten: { A: regel } };
  datei('muster-bestellung/konfiguration.json', konfig);
  datei('nachfassen/postfach.json', { host: 'mail.example.invalid', port: 465, benutzer: 'buero@example.invalid', passwort: 'synthetisch', absender: 'buero@example.invalid' });
  const p = { orderId: 'o1', orderName: '#T1', orderDatum: '2026-10-23T11:00:00Z', lineItemId: 'p1', lieferant: 'A', titel: 'Testteppich', handle: 'muster-testteppich', farbe: 'Grau', grosshaendlerId: 'TEST-1', istMuster: true, route: 'MUSTER', musterQuelle: { produktHandle: 'testteppich', farbnummer: '050' }, bestellmenge: { menge: 1, einheit: 'muster', text: '1 Muster' } };
  const a = { id: 'o1', name: '#T1', datum: p.orderDatum, offen: true, storniert: false, testbestellung: false, bezahlt: 'PAID', positionen: [p], details: { kunde: { name: 'Testkunde' }, lieferadresse: { name: 'Testkunde', strasse: 'Testweg 1', plz: '00000', ort: 'Testort', land: 'DE' } } };
  const modell = { auftraege: [a], musterGruppen: [{ lieferant: 'A', positionen: [p] }] };
  const stammdaten = pruefeStammdaten({ absender: { firma: 'Testfirma' }, lieferanten: { A: { kundennummer: 'TEST', muster: { weg: 'mail', mail: regel.empfaenger, lieferung: 'laden' } } } });
  const katalog = [{ handle: 'testteppich', produktgruppe: 'Teppichboden' }];
  const kontext = () => ({ modell, stammdaten, exportGueltig: true, statusAlle: leseAlle(path.join(dir, 'auftragsstatus.json')) });
  let mails = [];
  const senden = async (_, mail) => { mails.push(mail); return { messageId: mail.messageId }; };
  const lauf = extra => musterAutomatikLauf({ dir, kontext, katalog: () => katalog, jetzt: JETZT, senden, ...extra });
  const plan = () => { const { konfig, journal } = musterAutomatikDaten(dir); return musterAutomatikPlan(kontext(), katalog, konfig, journal, sperrStand(leseSperren(mustersperrePfad(dir)))); };
  return { dir, datei, regel, konfig, p, a, modell, stammdaten, katalog, kontext, lauf, plan, mails, exportFile, statusFile: path.join(dir, 'auftragsstatus.json') };
}
test('versendet vorhandene Vorlage einmal, setzt Bestellt und zeigt Artikel je Kunde', async t => {
  const u = umgebung(t);
  assert.equal(u.plan().geplant.length, 1);
  assert.equal((await u.lauf()).verschickt, 1);
  assert.match(u.mails[0].text, /TEST-1/); assert.match(u.mails[0].text, /050/);
  assert.deepEqual(u.mails[0].an, ['muster@lieferant-a.example']);
  const e = leseAlle(u.statusFile)[positionKey('o1', 'p1')];
  assert.equal(e.status, 'bestellt'); assert.equal(e.uebernahme, null);
  assert.equal((await u.lauf()).verschickt, 0); assert.equal(u.mails.length, 1);
  const s = musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).auftraege.o1;
  assert.equal(s.bestellt[0].positionen[0].farbe, 'Grau'); assert.equal(s.klaeren.length, 0);
});
test('Lieferziel Kunde: Bestellt mit Vermerk "direkt an den Kunden", Laden ohne Vermerk', async t => {
  const laden = umgebung(t);
  await laden.lauf();
  assert.equal(leseAlle(laden.statusFile)[positionKey('o1', 'p1')].ueber, null);
  const u = umgebung(t);
  u.regel.lieferziel = 'kunde'; u.stammdaten.lieferanten.A.muster.lieferung = 'kunde';
  u.datei('muster-bestellung/konfiguration.json', u.konfig);
  assert.equal((await u.lauf()).verschickt, 1);
  const e = leseAlle(u.statusFile)[positionKey('o1', 'p1')];
  assert.deepEqual([e.status, e.ueber], ['bestellt', 'kunde']);
});
for (const [name, aendern] of [
  ['alte Anfrage', u => u.a.datum = '2026-10-22T10:00:00Z'],
  ['nicht bezahlt', u => u.a.bezahlt = 'PENDING'],
  ['teilweise erstattet', u => u.a.bezahlt = 'PARTIALLY_REFUNDED'],
  ['Empfaenger geaendert', u => u.stammdaten.lieferanten.A.muster.mail = 'anderer@lieferant-a.example'],
  ['Lieferziel geaendert', u => u.stammdaten.lieferanten.A.muster.lieferung = 'kunde'],
  ['Probestueck kostet', u => u.katalog[0].produktgruppe = 'Vinyl von der Rolle'],
  ['unbekannte Kosten', u => { delete u.konfig.lieferanten.A.kostenlos; u.datei('muster-bestellung/konfiguration.json', u.konfig); }],
  ['Farbnummer fehlt', u => u.p.musterQuelle.farbnummer = 'UNGEKLAERT'],
  ['Artikelnummer fehlt', u => u.p.grosshaendlerId = null],
  ['Menge zu gross', u => u.p.bestellmenge.menge = 4],
  ['Bearbeiter reserviert', u => u.datei('auftragsstatus.json', { positionen: { [positionKey('o1', 'p1')]: { orderId: 'o1', lineItemId: 'p1', uebernahme: { id: 'team', person: 'Testperson' } } } })],
]) test(`${name}: keine Mail, klarer Klaerfall`, async t => {
  const u = umgebung(t); aendern(u);
  assert.equal((await u.lauf()).verschickt, 0); assert.equal(u.mails.length, 0); assert.equal(u.plan().klaeren.length, 1);
});
for (const [name, aendern] of [
  ['eigener Bestand', u => u.p.musterHerkunft = 'eigen_versand'],
  ['Lager', u => u.p.musterLager = { ort: 'Testfach' }],
  ['Storno', u => u.a.storniert = true],
  ['Testbestellung', u => u.a.testbestellung = true],
  ['abgeschlossen', u => u.a.offen = false],
]) test(`${name} wird nicht bestellt`, async t => { const u = umgebung(t); aendern(u); await u.lauf(); assert.equal(u.mails.length, 0); });
test('Probe bleibt ohne Versand und ohne Bestell- oder Versandvermerk', async t => {
  const u = umgebung(t); assert.equal((await u.lauf({ probe: true })).geplant, 1);
  assert.equal(fs.existsSync(u.statusFile), false); assert.equal(fs.existsSync(path.join(u.dir, 'muster-bestellung/versand.json')), false); assert.equal(u.mails.length, 0);
});
test('ohne Freigabe oder Postfach kein Versand', async t => {
  const u = umgebung(t); u.datei('muster-bestellung/konfiguration.json', { aktiv: false });
  assert.equal((await u.lauf()).status, 'inaktiv');
  u.datei('muster-bestellung/konfiguration.json', u.konfig); fs.unlinkSync(path.join(u.dir, 'nachfassen/postfach.json'));
  assert.equal((await u.lauf()).status, 'postfach-fehlt'); assert.equal(u.mails.length, 0);
});
test('alte oder ungueltige Exporte sperren Versand und zeigen Stoerung', async t => {
  const u = umgebung(t); fs.utimesSync(u.exportFile, new Date(0), new Date(0));
  assert.equal((await u.lauf()).status, 'daten-fehlen');
  assert.match(musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).hinweis, /nicht aktuell/);
  assert.equal(u.mails.length, 0);
});
test('SMTP-Timeout bleibt ungeklaert und wird auch nach Neustart nie blind wiederholt', async t => {
  const u = umgebung(t); let versuche = 0;
  await u.lauf({ senden: async () => { versuche++; throw new Error('Timeout'); } });
  await u.lauf(); assert.equal(versuche, 1); assert.equal(u.mails.length, 0);
  assert.equal(leseAlle(u.statusFile)[positionKey('o1', 'p1')].status, undefined);
  assert.match(musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).auftraege.o1.klaeren[0].grund, /Postfach/);
  assert.throws(() => setzeStatus(u.statusFile, { orderId: 'o1', lineItemId: 'p1', status: 'bestellt', actor: 'Team' }), /Mailversand/);
});
test('zweiter Prozess ist gesperrt, solange SMTP wartet', async t => {
  const u = umgebung(t); let weiter; let bereit;
  const start = new Promise(r => bereit = r), wartet = new Promise(r => weiter = r);
  const erster = u.lauf({ senden: async () => { bereit(); await wartet; return {}; } });
  await start; assert.equal((await u.lauf()).status, 'laeuft'); weiter(); await erster;
  assert.equal(musterAutomatikDaten(u.dir).journal.sendungen.length, 1);
});
test('angenommene Mail mit fehlendem Status wird nachgetragen, nie erneut gesendet', async t => {
  const u = umgebung(t); await u.lauf();
  const { journal } = musterAutomatikDaten(u.dir); journal.sendungen[0].status = 'gesendet';
  u.datei('muster-bestellung/versand.json', journal); fs.unlinkSync(u.statusFile);
  await u.lauf(); assert.equal(u.mails.length, 1); assert.equal(leseAlle(u.statusFile)[positionKey('o1', 'p1')].status, 'bestellt');
});
test('manuelles Wiedereroeffnen loest keine doppelte Bestellung aus; geaenderte Menge wird gemeldet', async t => {
  const u = umgebung(t); await u.lauf(); setzeZurueckAufOffen(u.statusFile, { orderId: 'o1', lineItemId: 'p1', actor: 'Team' });
  u.p.bestellmenge.menge = 2;
  await u.lauf(); assert.equal(u.mails.length, 1);
  assert.match(musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).auftraege.o1.klaeren[0].grund, /geändert/);
});
test('gesperrte oder kaputte Betriebsdateien werden nicht als leer interpretiert', async t => {
  const u = umgebung(t); fs.writeFileSync(path.join(u.dir, 'musterlager.json'), '{kaputt');
  await assert.rejects(u.lauf(), /Ablage/); assert.equal(u.mails.length, 0);
  assert.match(musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).hinweis, /unterbrochen/);
});
test('nach erstem Versand wird geaenderte Freigabe vor zweiter Mail frisch gelesen', async t => {
  const u = umgebung(t), p2 = { ...u.p, orderId: 'o2', lineItemId: 'p2' };
  u.modell.auftraege.push({ ...u.a, id: 'o2', name: '#T2', positionen: [p2] }); u.modell.musterGruppen[0].positionen.push(p2);
  let n = 0; await u.lauf({ senden: async () => { n++; u.datei('muster-bestellung/konfiguration.json', { aktiv: false }); return {}; } });
  assert.equal(n, 1);
});
test('verwaiste Prozesssperre wird sicher freigegeben, alter Versandversuch bleibt gesperrt', async t => {
  const u = umgebung(t);
  u.datei('muster-bestellung/lauf.json', { pid: 99999999, kennung: 'alter-prozess' });
  assert.equal((await u.lauf()).verschickt, 1);
  assert.equal(u.mails.length, 1);
});
test('Abbruch nach SMTP-Annahme: Versandjournal verhindert zweite Mail beim Statusnachtrag', async t => {
  const u = umgebung(t); let n = 0;
  await assert.rejects(u.lauf({ senden: async () => { n++; fs.writeFileSync(u.statusFile, '{kaputt'); return {}; } }), /beschädigt/);
  assert.equal(musterAutomatikDaten(u.dir).journal.sendungen[0].status, 'gesendet');
  fs.unlinkSync(u.statusFile);
  await u.lauf({ senden: async () => n++ });
  assert.equal(n, 1); assert.equal(leseAlle(u.statusFile)[positionKey('o1', 'p1')].status, 'bestellt');
});
test('nach erster Mail stornierter zweiter Kunde wird nicht angeschrieben', async t => {
  const u = umgebung(t), p2 = { ...u.p, orderId: 'o2', lineItemId: 'p2' }, a2 = { ...u.a, id: 'o2', positionen: [p2] };
  u.modell.auftraege.push(a2); u.modell.musterGruppen[0].positionen.push(p2);
  let n = 0;
  await u.lauf({ senden: async () => { n++; a2.storniert = true; return {}; } });
  assert.equal(n, 1);
});
test('formal gueltiges JSON mit verlorenem Musterlager-Inhalt sperrt statt nachzubestellen', async t => {
  const u = umgebung(t); u.datei('musterlager.json', { eintraege: {} });
  await assert.rejects(u.lauf(), /Musterlager/); assert.equal(u.mails.length, 0);
});

test('Klaerfall: nennt Position und Bestelldatum, der Lauf merkt sich seit wann, neuer Grund startet die Uhr neu', async t => {
  const u = umgebung(t);
  u.p.musterQuelle.farbnummer = 'UNGEKLAERT';
  const anzeige = () => musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).auftraege.o1.klaeren[0];
  assert.deepEqual([anzeige().lineItemIds, anzeige().grund, anzeige().seit], [['p1'], 'Farbnummer fehlt', u.a.datum], 'vor dem ersten Lauf zaehlt das Bestelldatum');
  await u.lauf();
  assert.equal(anzeige().seit, JETZT.toISOString());
  const spaeter = new Date(JETZT.getTime() + 864e5);
  fs.utimesSync(u.exportFile, spaeter, spaeter);
  await u.lauf({ jetzt: spaeter });
  assert.equal(anzeige().seit, JETZT.toISOString(), 'derselbe Grund: die Uhr laeuft weiter');
  u.p.musterQuelle.farbnummer = '050'; u.p.bestellmenge = { menge: 9 };
  await u.lauf({ jetzt: spaeter });
  assert.deepEqual([anzeige().grund, anzeige().seit], ['Mustermenge prüfen', spaeter.toISOString()], 'anderer Grund: neue Uhr');
});
test('Klaerstand: Probe schreibt nichts, unlesbar sperrt den Versand nicht, erledigte Faelle verschwinden', async t => {
  const u = umgebung(t);
  const datei = path.join(u.dir, 'muster-bestellung/klaerstand.json');
  u.p.musterQuelle.farbnummer = 'UNGEKLAERT';
  await u.lauf({ probe: true });
  assert.equal(fs.existsSync(datei), false);
  await u.lauf();
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(datei, 'utf8')).faelle).length, 1);
  fs.writeFileSync(datei, '{kaputt');
  await u.lauf();
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(datei, 'utf8')).faelle).length, 1, 'kaputte Stoppuhr wird neu geschrieben');
  fs.writeFileSync(datei, '{kaputt');
  u.p.musterQuelle.farbnummer = '050';
  assert.equal((await u.lauf()).verschickt, 1, 'kaputte Stoppuhr sperrt den Versand nicht');
  fs.writeFileSync(datei, JSON.stringify({ faelle: { alt: { grund: 'x', seit: JETZT.toISOString() } } }));
  await u.lauf();
  assert.deepEqual(JSON.parse(fs.readFileSync(datei, 'utf8')).faelle, {});
});
test('Mailversand unklar: der Klaerfall nennt die betroffenen Positionen', async t => {
  const u = umgebung(t);
  await u.lauf({ senden: async () => { throw new Error('SMTP'); } });
  const k = musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).auftraege.o1.klaeren[0];
  assert.deepEqual(k.lineItemIds, ['p1']);
  assert.equal(k.seit, JETZT.toISOString());
});

// --- Mustersperre (w-265) ---
const sperre = (u, sku, grund = GRUND.GESPERRT, shopify = { geschrieben: true }) => haengeAn(mustersperrePfad(u.dir), [ereignis({ sku, von: 'Test', grund, shopify, jetzt: JETZT })]);
/** Zweites Muster derselben Bestellung (gemischt) beim selben Lieferanten. */
function zweitesMuster(u) {
  u.p.sku = 'M-TEST-1';
  const p2 = { ...u.p, lineItemId: 'p2', sku: 'M-TEST-2', farbe: 'Sand', grosshaendlerId: 'TEST-2', musterQuelle: { produktHandle: 'testteppich', farbnummer: '060' } };
  u.a.positionen.push(p2); u.modell.musterGruppen[0].positionen.push(p2);
  return p2;
}
/** Zweite Bestellung: zeigt, was ein Lauf nach der ersten Mail noch tut. */
function zweiteBestellung(u) {
  u.p.sku = 'M-TEST-1';
  const p2 = { ...u.p, orderId: 'o2', orderName: '#T2', lineItemId: 'p2', sku: 'M-TEST-2', farbe: 'Sand', grosshaendlerId: 'TEST-2', musterQuelle: { produktHandle: 'testteppich', farbnummer: '060' } };
  u.modell.auftraege.push({ ...u.a, id: 'o2', name: '#T2', positionen: [p2] });
  u.modell.musterGruppen[0].positionen.push(p2);
  return p2;
}

test('gesperrtes Muster: keine Mail, kein Protokolleintrag, Klaerfall nennt den Grund', async t => {
  const u = umgebung(t); u.p.sku = 'M-TEST-1'; sperre(u, 'M-TEST-1');
  assert.equal((await u.lauf()).verschickt, 0); assert.equal(u.mails.length, 0);
  assert.equal(musterAutomatikDaten(u.dir).journal.sendungen.length, 0);
  assert.equal(leseAlle(u.statusFile)[positionKey('o1', 'p1')]?.status, undefined);
  const k = musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).auftraege.o1;
  assert.equal(k.geplant, 0); assert.match(k.klaeren[0].grund, /gesperrt/);
});
test('Sperre geht vor: auch die aeltere offene Bestellung nennt sie als Grund', t => {
  const u = umgebung(t); u.p.sku = 'M-TEST-1'; sperre(u, 'M-TEST-1'); u.a.datum = '2026-10-22T10:00:00Z';
  assert.match(u.plan().klaeren[0].grund, /gesperrt/);
});
test('im Shop noch nicht bestaetigte Sperre gilt ebenfalls', async t => {
  const u = umgebung(t); u.p.sku = 'M-TEST-1'; sperre(u, 'M-TEST-1', GRUND.GESPERRT, { geschrieben: false, fehler: 'kein Zugang', fehlerGrund: 'kein-zugang' });
  await u.lauf(); assert.equal(u.mails.length, 0);
});
test('Sammelprodukt: Sperre greift ueber die SKU der Quellvariante', async t => {
  const u = umgebung(t); u.p.sku = 'TP-MUSTER'; u.p.musterQuelle.sku = 'TEST-1'; sperre(u, 'M-TEST-1');
  await u.lauf(); assert.equal(u.mails.length, 0);
});
test('nicht gesperrt: eine Sperre auf einer anderen Farbe aendert nichts', async t => {
  const u = umgebung(t); u.p.sku = 'M-TEST-1'; sperre(u, 'M-ANDERE');
  assert.equal((await u.lauf()).verschickt, 1); assert.match(u.mails[0].text, /TEST-1/);
});
test('wieder verfuegbar: beim naechsten Lauf normal bestellt', async t => {
  const u = umgebung(t); u.p.sku = 'M-TEST-1'; sperre(u, 'M-TEST-1'); await u.lauf(); assert.equal(u.mails.length, 0);
  sperre(u, 'M-TEST-1', GRUND.FREI);
  assert.equal((await u.lauf()).verschickt, 1); assert.equal(u.plan().klaeren.length, 0);
});
test('gemischte Bestellung: nur das gesperrte Muster bleibt zurueck', async t => {
  const u = umgebung(t); zweitesMuster(u); sperre(u, 'M-TEST-1');
  assert.equal((await u.lauf()).verschickt, 1); assert.equal(u.mails.length, 1);
  assert.match(u.mails[0].text, /TEST-2/); assert.doesNotMatch(u.mails[0].text, /TEST-1/);
  const status = leseAlle(u.statusFile);
  assert.equal(status[positionKey('o1', 'p2')].status, 'bestellt');
  assert.equal(status[positionKey('o1', 'p1')]?.status, undefined);
  assert.deepEqual(u.plan().klaeren.map(k => k.lineItemId), ['p1']);
  assert.deepEqual(musterAutomatikDaten(u.dir).journal.sendungen[0].positionen.map(p => p.lineItemId), ['p2']);
});
test('Sperre waehrend des Laufs: das naechste Muster geht nicht mehr raus', async t => {
  const u = umgebung(t); zweiteBestellung(u);
  const r = await u.lauf({ senden: async (_, mail) => { u.mails.push(mail); sperre(u, 'M-TEST-2'); return {}; } });
  assert.equal(r.verschickt, 1); assert.equal(u.mails.length, 1); assert.match(u.mails[0].text, /TEST-1/);
});
for (const [name, kaputt] of [
  ['beschaedigtes JSON', f => fs.writeFileSync(f, '{"ereignisse": [')],
  ['falsche Form', f => fs.writeFileSync(f, '{"ereignisse": "nein"}')],
  ['nicht lesbar', f => fs.mkdirSync(f)],
  ['Sperre ohne Zeitpunkt', f => fs.writeFileSync(f, JSON.stringify({ version: 1, ereignisse: [{ sku: 'M-TEST-1', grund: 'nicht verfuegbar' }] }))],
  ['leerer Eintrag', f => fs.writeFileSync(f, JSON.stringify({ version: 1, ereignisse: [null] }))],
  ['leere SKU', f => fs.writeFileSync(f, JSON.stringify({ version: 1, ereignisse: [{ sku: '', grund: 'nicht verfuegbar', am: '2026-11-05T10:00:00.000Z' }] }))],
  ['Zeitpunkt keine Zeichenkette', f => fs.writeFileSync(f, JSON.stringify({ version: 1, ereignisse: [{ sku: 'M-TEST-1', grund: 'nicht verfuegbar', am: [] }] }))],
  ['Zeitpunkt kein Datum', f => fs.writeFileSync(f, JSON.stringify({ version: 1, ereignisse: [{ sku: 'M-TEST-1', grund: 'nicht verfuegbar', am: 'gestern' }] }))],
]) test(`kaputte Sperrliste (${name}): nichts bestellt, Hinweis sichtbar, Datei unberuehrt`, async t => {
  const u = umgebung(t); const f = mustersperrePfad(u.dir); kaputt(f);
  const inhalt = fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null;
  const r = await u.lauf();
  assert.equal(r.status, 'sperrliste-unlesbar'); assert.equal(r.verschickt, 0); assert.equal(u.mails.length, 0);
  const { journal } = musterAutomatikDaten(u.dir);
  assert.equal(journal.sendungen.length, 0); assert.match(journal.letzterLauf.hinweis, /Sperrliste nicht lesbar/);
  assert.match(musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).hinweis, /Sperrliste nicht lesbar/);
  if (inhalt !== null) assert.equal(fs.readFileSync(f, 'utf8'), inhalt);
});
test('kaputte Sperrliste: Probe schreibt nichts, ausgeschaltete Automatik bleibt inaktiv', async t => {
  const u = umgebung(t); fs.writeFileSync(mustersperrePfad(u.dir), 'kaputt');
  assert.equal((await u.lauf({ probe: true })).status, 'sperrliste-unlesbar');
  assert.equal(fs.existsSync(path.join(u.dir, 'muster-bestellung/versand.json')), false);
  u.datei('muster-bestellung/konfiguration.json', { aktiv: false });
  assert.equal((await u.lauf()).status, 'inaktiv');
});
test('Sperrliste kaputt mitten im Lauf: Abbruch, bereits Gesendetes bleibt vermerkt und sichtbar', async t => {
  const u = umgebung(t); zweiteBestellung(u);
  const r = await u.lauf({ senden: async (_, mail) => { u.mails.push(mail); fs.writeFileSync(mustersperrePfad(u.dir), 'kaputt'); return {}; } });
  assert.deepEqual([r.status, r.verschickt, u.mails.length], ['sperrliste-unlesbar', 1, 1]);
  assert.equal(leseAlle(u.statusFile)[positionKey('o1', 'p1')].status, 'bestellt');
  assert.equal(leseAlle(u.statusFile)[positionKey('o2', 'p2')]?.status, undefined);
  const a = musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog);
  assert.equal(a.auftraege.o1.bestellt.length, 1); assert.match(a.hinweis, /Sperrliste/);
});
test('Sperrliste repariert: Hinweis weg, Bestellung laeuft weiter', async t => {
  const u = umgebung(t); const f = mustersperrePfad(u.dir); fs.writeFileSync(f, 'kaputt');
  await u.lauf(); assert.equal(u.mails.length, 0);
  fs.unlinkSync(f);
  assert.equal((await u.lauf()).verschickt, 1);
  assert.equal(musterAutomatikAnzeige(u.dir, u.kontext(), u.katalog).hinweis, null);
});
test('Plan ohne Sperrliste bricht ab statt alles freizugeben', t => {
  const u = umgebung(t); const { konfig, journal } = musterAutomatikDaten(u.dir);
  assert.throws(() => musterAutomatikPlan(u.kontext(), u.katalog, konfig, journal), /Sperrliste fehlt/);
});
