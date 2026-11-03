import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { zerlegeMail, kopfText, parameterZerlegen, quotedPrintable } from '../lib/mime.mjs';
import { mitNurLesen, nachrichtenDaten, ImapFehler } from '../lib/imap-lesen.mjs';

const b64 = b => Buffer.from(b).toString('base64').replace(/(.{76})/g, '$1\r\n');
// Bytes, die UTF-8 nicht ueberleben wuerden.
const BINAER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0xfe, 0x00, 0x80, 0xe4, 0x0d, 0x0a, 0x2d, 0x2d]);

test('MIME: verschachtelte Teile, Umlaute im Namen, Anhang bleibt Byte fuer Byte gleich', () => {
  const roh = Buffer.from([
    'From: =?utf-8?B?TcO8bGxlciBHbWJI?= <Rechnung@Muster-Anbieter.example>',
    'Subject: =?iso-8859-1?Q?Rechnung_f=FCr?=',
    ' =?iso-8859-1?Q?_Oktober?=',
    'Date: Thu, 15 Oct 2026 10:00:00 +0200 (CEST)',
    'Content-Type: multipart/mixed; boundary="aussen"',
    '',
    'Vorspann',
    '--aussen',
    'Content-Type: multipart/alternative; boundary="innen"',
    '',
    '--innen',
    'Content-Type: text/plain; charset=iso-8859-1',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Gr=FC=DFe',
    '--innen',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Hallo</p>',
    '--innen--',
    '--aussen',
    'Content-Type: application/pdf',
    "Content-Disposition: attachment; filename*=UTF-8''Rechnung%20M%C3%A4rz.pdf",
    'Content-Transfer-Encoding: base64',
    '',
    b64(BINAER),
    '--aussen--',
    '',
  ].join('\r\n'), 'latin1');
  const m = zerlegeMail(roh);
  assert.equal(m.von.adresse, 'rechnung@muster-anbieter.example');
  assert.equal(m.von.name, 'Müller GmbH');
  assert.equal(m.betreff, 'Rechnung für Oktober');
  assert.equal(m.datum, '2026-10-15T08:00:00.000Z');
  assert.equal(m.text, 'Grüße');
  assert.equal(m.anhaenge.length, 1);
  assert.equal(m.anhaenge[0].name, 'Rechnung März.pdf');
  assert.ok(m.anhaenge[0].inhalt.equals(BINAER));
});

test('MIME: angehaengte Mail liefert ihren Anhang, ohne Schlussmarke geht nichts verloren', () => {
  const innen = ['From: a@b.example', 'Content-Type: application/pdf; name="innen.pdf"', 'Content-Transfer-Encoding: base64', '', b64('%PDF-x')].join('\r\n');
  const roh = Buffer.from(['From: c@d.example', 'Content-Type: multipart/mixed; boundary=g', '', '--g', 'Content-Type: message/rfc822', '', innen, '--g', 'Content-Type: application/pdf; name="zwei.pdf"', 'Content-Transfer-Encoding: base64', '', b64('%PDF-y')].join('\r\n'));
  const m = zerlegeMail(roh);
  assert.deepEqual(m.anhaenge.map(a => a.name), ['innen.pdf', 'zwei.pdf']);
  assert.equal(m.anhaenge[0].ausAngehaengterMail, true);
  assert.equal(m.anhaenge[0].inhalt.toString(), '%PDF-x');
  assert.equal(m.anhaenge[1].inhalt.toString(), '%PDF-y');
});

test('MIME: Grenze als Anfang einer laengeren Grenze trennt nicht', () => {
  const roh = Buffer.from(['Content-Type: multipart/mixed; boundary=g', '', '--g', 'Content-Type: application/pdf; name="a.pdf"', '', 'x', '--g2', 'y', '--g--'].join('\r\n'));
  assert.equal(zerlegeMail(roh).anhaenge[0].inhalt.toString(), 'x\r\n--g2\r\ny');
});

test('MIME: Kopfzeilen und Parameter', () => {
  assert.equal(kopfText('=?utf-8?Q?a=C3=A4?= =?utf-8?Q?b?= c'), 'aäb c');
  assert.equal(kopfText(Buffer.from('Größe').toString('latin1')), 'Größe');
  assert.equal(kopfText('=?unbekannt?Q?a?='), 'a');
  const p = parameterZerlegen("attachment; filename*0*=utf-8''Rechnung%20; filename*1*=M%C3%A4rz.pdf");
  assert.equal(p.wert, 'attachment');
  assert.equal(p.parameter.filename, 'Rechnung März.pdf');
  assert.equal(parameterZerlegen('application/pdf; name="=?utf-8?B?w6Qu?=pdf"').parameter.name, 'ä.pdf');
  assert.equal(quotedPrintable('a=\r\nb=E4').toString('latin1'), 'abä');
});

test('IMAP-Daten: Kennungen und Labels aus FETCH, auch Labels mit Leerzeichen', () => {
  const d = nachrichtenDaten(['* 3 FETCH (X-GM-THRID 255 X-GM-MSGID 4095 X-GM-LABELS ("08 Rechnungen" \\Inbox) UID 17 INTERNALDATE "15-Oct-2026 10:00:00 +0000")']);
  assert.deepEqual(d, [{ uid: 17, id: 'fff', thread: 'ff', labels: ['08 Rechnungen', '\\Inbox'], eingang: '15-Oct-2026 10:00:00 +0000' }]);
});

/** Falscher IMAP-Server, der Antworten absichtlich in kleinen Stuecken schickt. */
function falscherServer({ examine = '[READ-ONLY] geoeffnet', stueck = 3 } = {}) {
  const befehle = [];
  const verbinden = () => {
    const sock = new EventEmitter();
    const senden = (bytes) => {
      const teile = [];
      for (let i = 0; i < bytes.length; i += stueck) teile.push(bytes.subarray(i, i + stueck));
      setImmediate(() => { for (const t of teile) sock.emit('data', t); });
    };
    sock.write = (zeile) => {
      const [marke, ...rest] = zeile.trim().split(' ');
      const cmd = rest.join(' ');
      befehle.push(cmd);
      if (cmd.startsWith('LIST')) senden(Buffer.from(`* LIST (\\All) "/" "[Gmail]/Alle"\r\n${marke} OK\r\n`));
      else if (cmd.startsWith('EXAMINE')) senden(Buffer.from(`${marke} OK ${examine}\r\n`));
      else if (cmd.includes('BODY.PEEK[]')) {
        senden(Buffer.concat([Buffer.from(`* 1 FETCH (UID 5 BODY[] {${BINAER.length}}\r\n`), BINAER, Buffer.from(`)\r\n${marke} OK\r\n`)]));
      } else if (cmd.includes('BODY.PEEK[HEADER]')) {
        senden(Buffer.from(`* 1 FETCH (UID 5 BODY[HEADER] {6}\r\nA: b\r\n)\r\n${marke} OK\r\n`));
      } else if (cmd.includes('SEARCH')) senden(Buffer.from(`* SEARCH 5\r\n${marke} OK\r\n`));
      else senden(Buffer.from(`${marke} OK\r\n`));
    };
    sock.destroy = () => {};
    sock.end = () => {};
    setImmediate(() => sock.emit('data', Buffer.from('* OK bereit\r\n')));
    return sock;
  };
  return { befehle, verbinden };
}

test('IMAP nur lesend: EXAMINE und BODY.PEEK, binaere Mail unveraendert, auch in kleinen Stuecken', async () => {
  const s = falscherServer();
  const r = await mitNurLesen({ benutzer: 'a', passwort: 'b' }, async (v) => ({
    uids: await v.suche('label:x'), roh: await v.nachricht(5), kopf: await v.kopf(5),
  }), { verbinden: s.verbinden });
  assert.deepEqual(r.uids, [5]);
  assert.ok(r.roh.equals(BINAER));
  assert.equal(r.kopf.toString(), 'A: b\r\n');
  assert.ok(s.befehle.some(c => c.startsWith('EXAMINE')));
  assert.ok(!s.befehle.some(c => /^SELECT\b/i.test(c)));
  for (const c of s.befehle.filter(x => x.includes('FETCH'))) assert.match(c, /BODY\.PEEK\[/);
});

test('IMAP nur lesend: ohne [READ-ONLY] vom Server wird nichts geholt', async () => {
  const s = falscherServer({ examine: '[READ-WRITE] geoeffnet' });
  let geholt = false;
  await assert.rejects(mitNurLesen({ benutzer: 'a', passwort: 'b' }, async () => { geholt = true; }, { verbinden: s.verbinden }), ImapFehler);
  assert.equal(geholt, false);
  assert.ok(!s.befehle.some(c => c.includes('FETCH')));
});

test('IMAP-Leser enthaelt keinen aendernden Befehl', () => {
  const code = fs.readFileSync(new URL('../lib/imap-lesen.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\b(STORE|EXPUNGE|APPEND|COPY|MOVE|SELECT|DELETE|CREATE|RENAME)\b/);
  assert.doesNotMatch(code, /BODY\[/);
});
