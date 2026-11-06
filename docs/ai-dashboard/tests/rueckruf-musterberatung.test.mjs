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
