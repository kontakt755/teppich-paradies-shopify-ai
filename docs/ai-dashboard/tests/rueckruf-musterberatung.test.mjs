// "Lieber erst beraten lassen?" im Muster-Warenkorb: die Formular-Mail "RÜCKRUF – Musterberatung"
// wird ein Rueckruf in Kunden > Rueckrufe & Beratungen - keine Service-Anfrage, kein Antwortentwurf.
// Weg: Mail lesen (lib/serviceanfragen.mjs) -> Postfach-Abgleich legt in rueckrufe.json an
// (operations/scripts/serviceanfragen.mjs) -> /api/kunden/rueckrufe zeigt die Zeile -> Status
// setzen behaelt die Angaben -> "Heute" bekommt ein To-do. Alle Namen und Adressen sind ausgedacht.
import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wegwerfOrdner } from '../../../scripts/test-temp.mjs';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { ausFormularMail, automatischUebernehmbar, rueckrufAusMail, BETREFF_MUSTERBERATUNG, MAILFELDER } from '../lib/serviceanfragen.mjs';
import { leiteTodosAb } from '../lib/todos.mjs';
import { uebernehmen, bekannt, AKTEUR } from '../../../operations/scripts/serviceanfragen.mjs';
import { leseAlle as leseService, serviceanfragenPfad } from '../../../operations/lib/serviceanfragen.mjs';
import { leseAlle as leseRueckrufe, rueckrufePfad, rueckrufAusMailAnlegen, setzeStatus, mailRueckrufSchluessel } from '../../../operations/lib/rueckrufe.mjs';
import { rueckrufliste } from '../../../operations/lib/rueckrufliste.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
assert.ok(PRIVAT_DIR);

// Aufbau wie die Mail "Neue Kundennachricht" von Shopify (Klartextteil), Felder in der
// Reihenfolge des Formulars, der Kundentext zuletzt. Die Musterliste ist umbrochen.
const MAIL_TEXT = `Du hast eine neue Nachricht über das Kontaktformular deines
Onlineshops erhalten.

Betreff:
${BETREFF_MUSTERBERATUNG}

Muster:
Testboden Velours – Muster Sand (M-TEST-1) · Testboden Schlinge – Muster
Grau (M-TEST-2)

Name:
Rita Rückruf

Telefon:
0170 0000000

E-Mail:
rita@example.com

Text:
Welcher Boden passt ins Kinderzimmer?
Bitte nachmittags.`;
const mail = (id, mehr = {}) => ({
  id, von: 'Shopify <mailer@shopify.com>', datum: '2026-11-06T13:32:00Z',
  betreff: 'Neue Kundennachricht vom 6. November 2026 um 14:32', text: MAIL_TEXT, ...mehr,
});

test('Mail-Leser: Musterberatung ergibt Name, Telefon, Musterliste und Text - keine Service-Anfrage', () => {
  const gelesen = ausFormularMail(`${mail('x').betreff}\n\n${MAIL_TEXT}`);
  assert.equal(gelesen.erkannt, true);
  assert.equal(automatischUebernehmbar(gelesen).ok, false, 'bleibt aus der Serviceliste');
  assert.deepEqual(rueckrufAusMail(gelesen), {
    datum: '2026-11-06', name: 'Rita Rückruf', telefon: '0170 0000000', email: 'rita@example.com',
    muster: ['Testboden Velours – Muster Sand (M-TEST-1)', 'Testboden Schlinge – Muster Grau (M-TEST-2)'],
    nachricht: 'Welcher Boden passt ins Kinderzimmer?\nBitte nachmittags.',
  });
  // aus der Gmail-Ansicht kopiert: Feld und Wert in einer Zeile
  const zeile = rueckrufAusMail(ausFormularMail(`Betreff: ${BETREFF_MUSTERBERATUNG}\nMuster: A – B (M-1)\nName: X Y\nTelefon: 030 1\nE-Mail: x@example.com\nText: Hallo`));
  assert.deepEqual([zeile.muster, zeile.name, zeile.nachricht], [['A – B (M-1)'], 'X Y', 'Hallo']);
  // Bindestrich statt Gedankenstrich (kopiert oder weitergeleitet) zaehlt auch
  assert.equal(rueckrufAusMail(ausFormularMail('Betreff:\nRÜCKRUF - Musterberatung\n\nName:\nA B\n\nTelefon:\n030 1\n\nE-Mail:\na@example.com'))?.telefon, '030 1');
  // andere Betreffe sind kein Rueckruf
  assert.equal(rueckrufAusMail(ausFormularMail('Betreff:\nAnfrage Treppenverlegung\n\nName:\nA B\n\nE-Mail:\na@example.com')), null);
  assert.equal(rueckrufAusMail(ausFormularMail('Hallo')), null);
});

test('Theme: Betreff und jedes Feld der Musterberatung kennt der Mail-Leser', () => {
  const quelle = fs.readFileSync(path.join(REPO, 'snippets/tp-muster-beratungsanfrage.liquid'), 'utf8');
  assert.match(quelle, new RegExp(`name="contact\\[Betreff\\]" value="${BETREFF_MUSTERBERATUNG}"`));
  // So benennt Shopify die Felder in der Mail "Neue Kundennachricht".
  const standard = { name: 'Name', email: 'E-Mail', body: 'Text' };
  for (const [, feld] of quelle.matchAll(/name="contact\[([^\]]+)\]"/g)) {
    const inMail = standard[feld] || feld;
    assert.ok(MAILFELDER.includes(inMail), `Feld „${inMail}“ in MAILFELDER (lib/serviceanfragen.mjs) eintragen`);
  }
});

test('Postfach-Abgleich: Musterberatung wird ein Rueckruf, einmal, ohne Service-Anfrage und ohne Kundendaten in der Ausgabe', () => {
  const privatDir = wegwerfOrdner('tp-rueckruf-mail-');
  const jetzt = new Date('2026-11-06T13:40:00Z');
  const r = uebernehmen([mail('a1b2c3')], { privatDir, jetzt });
  assert.deepEqual(r, { angelegt: [], uebersprungen: [], rueckrufe: [{ mailId: 'a1b2c3' }] });
  assert.doesNotMatch(JSON.stringify(r), /Rita|example|0170/, 'Ausgabe ohne Kundendaten');
  assert.deepEqual(leseService(serviceanfragenPfad(privatDir)), [], 'keine Service-Anfrage');
  const e = leseRueckrufe(rueckrufePfad(privatDir))['mail-a1b2c3'];
  assert.equal(e.status, 'offen');
  assert.equal(e.quelle, 'mail');
  assert.equal(e.eingangAm, '2026-11-06T13:32:00.000Z');
  assert.equal(e.kundenname, 'Rita Rückruf');
  assert.equal(e.telefon, '0170 0000000');
  assert.equal(e.muster.length, 2);
  assert.equal(e.erstelltVon, AKTEUR);
  // Gegenprobe des Laufs (claude-lauf ergebnisBelegt): die Kennung gilt als erledigt.
  assert.ok(bekannt({ privatDir }).mailIds.includes('a1b2c3'));
  // zweiter Lauf: nichts Neues
  assert.deepEqual(uebernehmen([mail('a1b2c3')], { privatDir, jetzt }), { angelegt: [], uebersprungen: [], rueckrufe: [] });
  // ohne Telefon und E-Mail kann niemand zurueckrufen: einmal mit Grund vermerkt, nichts angelegt
  const ohne = uebernehmen([mail('d4e5f6', { text: MAIL_TEXT.replace('0170 0000000', '').replace('rita@example.com', '') })], { privatDir, jetzt });
  assert.equal(ohne.rueckrufe.length, 0);
  assert.match(ohne.uebersprungen[0].grund, /ohne Telefon und E-Mail/);
  assert.equal(Object.keys(leseRueckrufe(rueckrufePfad(privatDir))).length, 1);
  // fremder Absender bleibt draussen
  assert.equal(uebernehmen([mail('f0f0f0', { von: 'jemand@example.com' })], { privatDir, jetzt }).rueckrufe.length, 0);
});

test('Ablage: dieselbe Mail setzt einen bearbeiteten Rueckruf nicht zurueck, der Status behaelt die Angaben', () => {
  const file = rueckrufePfad(wegwerfOrdner('tp-rueckruf-ablage-'));
  const f = { mailId: 'abc', name: 'R R', telefon: '030 1', muster: ['M1'], nachricht: 'Text', eingangAm: '2026-11-06T08:00:00Z' };
  const { eintrag } = rueckrufAusMailAnlegen(file, f, { actor: AKTEUR });
  assert.equal(eintrag.orderId, mailRueckrufSchluessel('abc'));
  setzeStatus(file, { orderId: eintrag.orderId, status: 'nicht_erreicht', actor: 'Ben', wiedervorlage: '2026-11-07' });
  const nochmal = rueckrufAusMailAnlegen(file, f, { actor: AKTEUR });
  assert.equal(nochmal.doppelt, true);
  const jetzt = leseRueckrufe(file)[eintrag.orderId];
  assert.equal(jetzt.status, 'nicht_erreicht');
  assert.deepEqual([jetzt.kundenname, jetzt.telefon, jetzt.muster, jetzt.nachricht], ['R R', '030 1', ['M1'], 'Text']);
  assert.equal(mailRueckrufSchluessel('<a/b c>'), 'mail--a-b-c-', 'nur Zeichen, die in Adresse und data-Attribut bleiben');
  assert.throws(() => rueckrufAusMailAnlegen(file, { mailId: '' }, { actor: AKTEUR }), /mailId/);
});

test('Liste: Rueckrufe aus Mails stehen zwischen denen aus Bestellungen, aelteste zuerst', () => {
  const auftrag = (tag, checks) => ({ id: `gid://shopify/Order/${tag}`, name: `#${tag}`, datum: `2026-11-0${tag}T09:00:00Z`, checks, details: { kunde: { name: `Kunde ${tag}`, telefon: '030 2' }, beratungsangaben: {} } });
  const status = { 'mail-m1': { orderId: 'mail-m1', quelle: 'mail', eingangAm: '2026-11-04T10:00:00.000Z', kundenname: 'Mail Kunde', telefon: '030 3', muster: ['M'], nachricht: null, status: 'offen' },
    'gid://shopify/Order/5': { orderId: 'gid://shopify/Order/5', status: 'angerufen' } };
  const l = rueckrufliste({ auftraege: [auftrag(5, { beratung: 'Ja' }), auftrag(3, { masspruefung: 'Ja' })] }, status);
  assert.deepEqual(l.map(z => z.orderId), ['gid://shopify/Order/3', 'mail-m1', 'gid://shopify/Order/5']);
  const m = l[1];
  assert.deepEqual([m.quelle, m.thema, m.orderName, m.kundenname, m.muster], ['mail', 'Musterberatung', null, 'Mail Kunde', ['M']]);
  assert.deepEqual(rueckrufliste({ auftraege: [] }).map(z => z.orderId), [], 'ohne statusAlle wie bisher');
});

test('API: /api/kunden/rueckrufe zeigt den Rueckruf aus der Mail, Statuswechsel behaelt Muster und Text', async () => {
  const root = wegwerfOrdner('tp-rueckruf-api-');
  const dir = path.join(root, 'privat');
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ exportiertAm: '2026-11-06T10:00:00Z', orders: [], quellvarianten: [] }));
  uebernehmen([mail('a1b2c3')], { privatDir: dir, jetzt: new Date('2026-11-06T13:40:00Z') });
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.kundenRueckrufe();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.zeilen.length, 1);
  const z = r.zeilen[0];
  assert.deepEqual([z.orderId, z.status, z.kundenname, z.telefon, z.quelle, z.datum], ['mail-a1b2c3', 'offen', 'Rita Rückruf', '0170 0000000', 'mail', '2026-11-06T13:32:00.000Z']);
  assert.equal(z.muster.length, 2);
  assert.match(z.nachricht, /Kinderzimmer/);
  const gesetzt = await api.kundenRueckrufSetzen({ orderId: 'mail-a1b2c3', status: 'angerufen', notiz: 'Muster Sand passt' }, { name: 'Mona Mitarbeiter', kuerzel: 'mona', rolle: 'mitarbeiter' });
  assert.equal(gesetzt.eintrag.aktualisiertVon, 'Mona Mitarbeiter');
  const danach = api.kundenRueckrufe().zeilen[0];
  assert.deepEqual([danach.status, danach.notiz, danach.muster.length, danach.kundenname], ['angerufen', 'Muster Sand passt', 2, 'Rita Rückruf']);
});

test('Heute: faelliger Rueckruf aus der Mail wird ein To-do, Erledigtes und spaetere Wiedervorlage ruhen', () => {
  const jetzt = new Date('2026-11-09T10:00:00');
  const basis = { quelle: 'mail', thema: 'Musterberatung', kundenname: 'Rita Rückruf', telefon: '0170 0000000', muster: ['A', 'B'], testbestellung: false };
  const rueckrufe = [
    { ...basis, orderId: 'mail-1', status: 'offen', datum: '2026-11-06T13:32:00.000Z' },
    { ...basis, orderId: 'mail-2', status: 'erledigt', datum: '2026-11-06T13:32:00.000Z' },
    { ...basis, orderId: 'mail-3', status: 'nicht_erreicht', wiedervorlage: '2026-11-10', datum: '2026-11-06T13:32:00.000Z' },
  ];
  const todos = leiteTodosAb({ bestellzeilen: [], rueckrufe }, { sicht: 'laden', jetzt });
  assert.deepEqual(todos.map(t => t.id), ['rueckruf:mail-1']);
  const [t] = todos;
  assert.equal(t.titel, 'Zurückrufen: Rita Rückruf');
  // volle 24 Stunden wie bei jedem To-do (tageSeit): 06.11. 14:32 bis 09.11. 10:00 sind 2 Tage
  assert.equal(t.kontext, 'Musterberatung · 2 Muster angefragt · eingegangen vor 2 Tagen');
  assert.equal(t.ton, 'warn', 'ab 2 Tagen gelb wie jeder Rueckruf');
  const ziel = new URLSearchParams(t.knopf.href.split('?')[1]);
  assert.deepEqual([ziel.get('tab'), ziel.get('auftrag')], ['rueckrufe', 'mail-1']);
});

test('Doppelt abgeschickt (Doppelklick, zweites Geraet): ein Rueckruf, ergaenzt um Muster und Text der neueren Mail', () => {
  const privatDir = wegwerfOrdner('tp-rueckruf-doppelt-');
  const jetzt = new Date('2026-11-06T14:00:00Z');
  const zweite = mail('b2', {
    datum: '2026-11-06T13:33:10Z',
    text: MAIL_TEXT.replace(/Muster:\n[\s\S]*?\n\nName:/, 'Muster:\nTestboden Kurzflor – Muster Rot (M-TEST-3)\n\nName:').replace(/Text:\n[\s\S]*$/, 'Text:\nDoch lieber in Rot.'),
  });
  const r = uebernehmen([mail('a1'), zweite], { privatDir, jetzt });
  assert.deepEqual(r.rueckrufe, [{ mailId: 'a1' }, { mailId: 'b2', ergaenzt: 'mail-a1' }]);
  assert.doesNotMatch(JSON.stringify(r), /Rita|example|0170/, 'Ausgabe ohne Kundendaten');
  const alle = leseRueckrufe(rueckrufePfad(privatDir));
  assert.deepEqual(Object.keys(alle), ['mail-a1'], 'kein zweiter Rueckruf');
  const e = alle['mail-a1'];
  assert.deepEqual(e.muster, ['Testboden Kurzflor – Muster Rot (M-TEST-3)'], 'Musterliste der neueren Mail');
  assert.equal(e.nachricht, 'Doch lieber in Rot.');
  assert.equal(e.eingangAm, '2026-11-06T13:32:00.000Z', 'Alter zaehlt ab der ersten Mail');
  assert.equal(e.zuletztAm, '2026-11-06T13:33:10.000Z');
  assert.deepEqual(e.weitereMailIds, ['b2']);
  // beide Kennungen gelten als erledigt, ein erneuter Lauf aendert nichts
  assert.ok(['a1', 'b2'].every(id => bekannt({ privatDir }).mailIds.includes(id)));
  assert.deepEqual(uebernehmen([mail('a1'), zweite], { privatDir, jetzt }).rueckrufe, []);
  // Zeile und To-do nennen die zweite Anfrage
  const [zeile] = rueckrufliste({ auftraege: [] }, leseRueckrufe(rueckrufePfad(privatDir)));
  assert.deepEqual([zeile.anfragen, zeile.zuletztAm], [2, '2026-11-06T13:33:10.000Z']);
  // gleiche Telefonnummer mit anderer Adresse zaehlt auch als dieselbe Person
  const telGleich = mail('c3', { datum: '2026-11-07T09:00:00Z', text: MAIL_TEXT.replace('rita@example.com', 'rita.zwei@example.com').replace('0170 0000000', '0170 000 0000') });
  assert.deepEqual(uebernehmen([telGleich], { privatDir, jetzt }).rueckrufe, [{ mailId: 'c3', ergaenzt: 'mail-a1' }]);
});

test('Doppelt: nicht zusammengefasst nach dem Gespraech, nach 7 Tagen oder bei einer anderen Person', () => {
  const file = rueckrufePfad(wegwerfOrdner('tp-rueckruf-getrennt-'));
  const f = (mailId, mehr = {}) => ({ mailId, name: 'R R', telefon: '030 111111', email: 'r@example.com', muster: ['M'], nachricht: null, eingangAm: '2026-11-06T08:00:00Z', ...mehr });
  rueckrufAusMailAnlegen(file, f('x1'), { actor: AKTEUR });
  assert.equal(rueckrufAusMailAnlegen(file, f('x2'), { actor: AKTEUR }).zusammengefasst, true, 'offen: zusammen');
  setzeStatus(file, { orderId: 'mail-x1', status: 'nicht_erreicht', actor: 'Ben' });
  assert.equal(rueckrufAusMailAnlegen(file, f('x3'), { actor: AKTEUR }).zusammengefasst, true, 'nicht erreicht: noch niemand gesprochen');
  assert.equal(leseRueckrufe(file)['mail-x1'].status, 'nicht_erreicht', 'Status bleibt');
  setzeStatus(file, { orderId: 'mail-x1', status: 'angerufen', actor: 'Ben' });
  assert.equal(rueckrufAusMailAnlegen(file, f('x4'), { actor: AKTEUR }).zusammengefasst, false, 'nach dem Gespraech: neue Anfrage');
  assert.equal(rueckrufAusMailAnlegen(file, f('x5', { eingangAm: '2026-11-14T08:00:01Z' }), { actor: AKTEUR }).zusammengefasst, false, 'mehr als 7 Tage nach der letzten Mail');
  assert.equal(rueckrufAusMailAnlegen(file, f('x6', { telefon: '030 999999', email: 'anders@example.com' }), { actor: AKTEUR }).zusammengefasst, false, 'andere Person');
  assert.deepEqual(Object.keys(leseRueckrufe(file)).sort(), ['mail-x1', 'mail-x4', 'mail-x5', 'mail-x6']);
});

test('Ohne Telefon: Zeile zeigt die E-Mail als Link, To-do sagt "per Mail antworten"', async () => {
  const { state } = await import('../kern/zustand.mjs');
  const { kunden } = await import('../ansichten/kunden/gemeinsam.mjs');
  const { viewKundenRueckrufe } = await import('../ansichten/kunden/rueckrufe.mjs');
  const zeile = { orderId: 'mail-q1', orderName: null, quelle: 'mail', thema: 'Musterberatung', datum: '2026-11-06T13:32:00.000Z', kundenname: 'Ohne Telefon', telefon: null, email: 'ohne.tel@example.com', muster: ['M'], nachricht: null, anfragen: 2, zuletztAm: '2026-11-06T13:40:00.000Z', status: 'offen', testbestellung: false };
  state.route = { view: 'kunden', params: new URLSearchParams('tab=rueckrufe') };
  kunden.rueckrufe = { verfuegbar: true, zeilen: [zeile, { ...zeile, orderId: 'mail-q2', kundenname: 'Mit Telefon', telefon: '030 222222', anfragen: 1, zuletztAm: null }] };
  try {
    const h = viewKundenRueckrufe();
    assert.match(h, /<a href="mailto:ohne\.tel@example\.com" style="overflow-wrap:anywhere">ohne\.tel@example\.com<\/a> <span class="small muted">· keine Telefonnummer, per Mail antworten<\/span>/);
    assert.match(h, /2× angefragt, zuletzt/);
    assert.equal((h.match(/mailto:/g) || []).length, 1, 'mit Telefon bleibt es beim Anruf-Link');
    assert.match(h, /href="tel:030222222"/);
  } finally {
    kunden.rueckrufe = null;
  }
  const todos = leiteTodosAb({ bestellzeilen: [], rueckrufe: [zeile] }, { sicht: 'laden', jetzt: new Date('2026-11-06T15:00:00Z') });
  assert.equal(todos[0].kontext, 'Musterberatung · 1 Muster angefragt · eingegangen heute · 2× angefragt · keine Telefonnummer, per Mail antworten');
  const ohneAlles = leiteTodosAb({ bestellzeilen: [], rueckrufe: [{ ...zeile, email: null }] }, { sicht: 'laden', jetzt: new Date('2026-11-06T15:00:00Z') });
  assert.match(ohneAlles[0].kontext, /keine Telefonnummer$/);
});
