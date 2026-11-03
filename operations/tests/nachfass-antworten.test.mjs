import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { erkenneAbmeldung, eigenerText, leseMail, fehlgeschlageneAdressen, werteAus, kopfPasst, kopfText, postfachAbgleich, SUCHE_ANTWORTEN, SUCHE_UNZUSTELLBAR } from '../lib/nachfass-antworten.mjs';
import { nachrichtenNurLesend, ImapFehler } from '../lib/imap-lesen.mjs';

// Nur erfundene Daten: Adressen unter example.invalid, erfundene Betreffe.
const BETREFF = 'Ihre Muster – passt die Farbe?';
const ID = '<abc123@example.invalid>';
const ZITAT = '> Guten Tag,\n> wie gefallen Ihnen die Muster?\n>\n> Keine weiteren Nachfragen gewünscht? Antworten Sie mit „Abmelden“.';
const SENDUNG = { orderId: 'gid://shopify/Order/1', orderName: '#T1', stufe: 'erste', an: 'kunde@example.invalid', betreff: BETREFF, messageId: ID, status: 'vermerkt' };

const q = s => `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
function antwort(text, { von = 'Testkunde <Kunde@Example.invalid>', betreff = `Re: ${q(BETREFF)}`, bezug = ID, zusatz = [] } = {}) {
  return Buffer.from([`From: ${von}`, `Subject: ${betreff}`, ...(bezug ? [`In-Reply-To: ${bezug}`] : []), ...zusatz, 'Content-Type: text/plain; charset=utf-8', '', text.replace(/\n/g, '\r\n')].join('\r\n'), 'utf8');
}
function bounce({ an = 'kunde@example.invalid', aktion = 'failed', status = '5.1.1', original = `Message-ID: ${ID}\r\nSubject: ${q(BETREFF)}\r\nTo: ${an}` } = {}) {
  return Buffer.from([
    'From: Mail Delivery Subsystem <mailer-daemon@googlemail.example>', 'Subject: Delivery Status Notification (Failure)',
    'Content-Type: multipart/report; boundary="xx1"; report-type=delivery-status', '',
    '--xx1', 'Content-Type: text/plain; charset=utf-8', '', 'Ihre Nachricht wurde nicht zugestellt.', '',
    '--xx1', 'Content-Type: message/delivery-status', '', 'Reporting-MTA: dns; example.invalid', '', `Final-Recipient: rfc822; ${an}`, `Action: ${aktion}`, `Status: ${status}`, '',
    '--xx1', 'Content-Type: message/rfc822', '', original, '', 'Inhalt', '', '--xx1--', '',
  ].join('\r\n'));
}

// --- Abmeldung erkennen -----------------------------------------------------

test('Abmeldung: das Wort allein, mit Hoeflichkeit, mit Signatur und Zitat', () => {
  for (const text of [
    'Abmelden',
    'abmelden!',
    'ABMELDEN\n\nMit freundlichen Grüßen\nErika Beispiel\nMusterstraße 1\n12345 Beispielstadt',
    'Bitte abmelden, danke.',
    `Abmelden\n\nAm 2. Nov. 2026 um 09:30 schrieb Teppich Paradies <kontakt@example.invalid>:\n${ZITAT}`,
    `Abmelden\n\nVon meinem iPhone gesendet\n\n${ZITAT}`,
    'Abmelden\n-- \nErika Beispiel, Geschäftsführerin',
  ]) {
    assert.deepEqual(erkenneAbmeldung(text), { abmeldung: true, weitererText: null }, text);
  }
});

test('Kein Abmelden: das Wort steht nur im Zitat oder in unserem eigenen Satz', () => {
  for (const text of [
    `Die Farbe gefaellt mir, ich melde mich.\n\n${ZITAT}`,
    // Gmail bricht die Einleitung um, Outlook zitiert ohne ">".
    'Danke fuer die Muster!\n\nAm Mo., 2. Nov. 2026 um 09:30 Uhr schrieb Teppich Paradies <\nkontakt@example.invalid>:\n\nKeine weiteren Nachfragen gewünscht? Antworten Sie mit „Abmelden“.',
    'Danke!\n\nVon: Teppich Paradies\nGesendet: Montag, 2. November 2026\nAn: Kunde\nBetreff: Ihre Muster\n\nAntworten Sie kurz mit „Abmelden“, dann schreiben wir Ihnen nicht mehr.',
    'Danke, sehr nett.\nAntworten Sie mit\n„Abmelden“.',
  ]) {
    assert.equal(erkenneAbmeldung(text).abmeldung, false, text);
  }
  // Das Wort als Teil eines anderen Worts zaehlt nicht.
  assert.equal(erkenneAbmeldung('Die Abmeldefrist kenne ich nicht.').abmeldung, false);
});

test('Abmelden und weiterer Text: Abmeldung gilt, der Text geht als Hinweis an einen Menschen', () => {
  const r = erkenneAbmeldung(`Bitte abmelden. Die Rechnung stimmt uebrigens nicht.\n\nMit freundlichen Grüßen\nErika Beispiel\n\n${ZITAT}`);
  assert.equal(r.abmeldung, true);
  assert.equal(r.weitererText, 'Bitte abmelden. Die Rechnung stimmt uebrigens nicht.');
  // Im Zweifel fuer die Abmeldung, aber ein Mensch liest mit.
  const zweifel = erkenneAbmeldung('Nein, bitte nicht abmelden, ich habe noch Fragen.');
  assert.equal(zweifel.abmeldung, true);
  assert.match(zweifel.weitererText, /noch Fragen/);
  assert.ok(erkenneAbmeldung(`Abmelden ${'x'.repeat(1000)}`).weitererText.length <= 300);
});

test('Zitat oben, Antwort unten: der Text darunter zaehlt', () => {
  assert.equal(eigenerText(`${ZITAT}\n\nAbmelden`), 'Abmelden');
});

// --- Mail lesen -------------------------------------------------------------

test('Mail lesen: Betreff RFC 2047, Text base64 und quoted-printable, HTML ohne Zitat, Anhang zaehlt nicht', () => {
  assert.equal(kopfText('=?UTF-8?Q?Ihre_Muster_=E2=80=93?= =?UTF-8?B?IHBhc3N0?='), 'Ihre Muster – passt');
  assert.equal(kopfText('=?ISO-8859-1?Q?gr=FCn?='), 'grün');

  const b64 = Buffer.from(`From: a@example.invalid\r\nSubject: x\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('Abmelden, schöne Grüße').toString('base64')}\r\n`);
  assert.equal(leseMail(b64).text.trim(), 'Abmelden, schöne Grüße');

  const qp = Buffer.from('From: a@example.invalid\r\nContent-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nabmelden gr=FC=DFe=\r\n weiter\r\n');
  assert.equal(leseMail(qp).text.trim(), 'abmelden grüße weiter');

  const html = Buffer.from([
    'From: a@example.invalid', 'Content-Type: multipart/mixed; boundary="m1"', '',
    '--m1', 'Content-Type: multipart/alternative; boundary="m2"', '',
    '--m2', 'Content-Type: text/html; charset=utf-8', '', '<div>Abmelden<br>Danke</div><div class="gmail_quote">Antworten Sie mit „Abmelden“ und noch mehr</div>', '',
    '--m2--',
    '--m1', 'Content-Type: text/plain', 'Content-Disposition: attachment; filename="a.txt"', '', 'Anhang', '',
    '--m1--', '',
  ].join('\r\n'));
  const m = leseMail(html);
  assert.equal(m.text.trim(), 'Abmelden\nDanke');
  assert.deepEqual(erkenneAbmeldung(m.text), { abmeldung: true, weitererText: null });
});

// --- Unzustellbar -----------------------------------------------------------

test('Unzustellbar: nur endgueltig (failed, 5.x.x), Verzoegerung und fremde Absender sperren nicht', () => {
  assert.deepEqual(fehlgeschlageneAdressen(leseMail(bounce({ an: 'Kunde@Example.invalid' }))), [{ email: 'kunde@example.invalid', status: '5.1.1' }]);
  assert.deepEqual(fehlgeschlageneAdressen(leseMail(bounce({ aktion: 'delayed', status: '4.4.1' }))), []);
  assert.deepEqual(fehlgeschlageneAdressen(leseMail(bounce({ status: '4.2.2' }))), []);
  assert.deepEqual(fehlgeschlageneAdressen(leseMail(antwort('Mailbox full'))), []);
  // Ohne Maschinenteil nur mit eindeutigem Betreff und X-Failed-Recipients.
  const kurz = b => leseMail(Buffer.from(`From: postmaster@example.invalid\r\nSubject: ${b}\r\nX-Failed-Recipients: kunde@example.invalid\r\n\r\ntext\r\n`));
  assert.deepEqual(fehlgeschlageneAdressen(kurz('Undeliverable: Ihre Muster')), [{ email: 'kunde@example.invalid', status: null }]);
  assert.deepEqual(fehlgeschlageneAdressen(kurz('Delivery delayed')), []);
});

// --- Abgleich ---------------------------------------------------------------

test('Abgleich: Antwort per Message-ID, per Absender plus Betreff, von anderer Adresse; Fremdes zaehlt nicht', () => {
  const m = (id, roh) => ({ id, roh });
  const r = werteAus([
    m('a', antwort('Abmelden')),
    m('b', antwort('Abmelden', { von: 'zweite@example.invalid', bezug: null, betreff: 'AW: nichts damit zu tun' })),
    m('c', antwort('abmelden', { von: 'Dritte <dritte@example.invalid>', bezug: null, betreff: 'Newsletter abmelden' })),
    m('d', antwort('Abmelden', { zusatz: ['Auto-Submitted: auto-replied'], von: 'auto@example.invalid' })),
    m('e', antwort('Abmelden', { von: 'kontakt@example.invalid' })),
  ], [SENDUNG], ['kontakt@example.invalid']);
  assert.deepEqual(r.abmeldungen.map(a => a.email), ['kunde@example.invalid']);
  assert.deepEqual(r.unzustellbar, []);
  assert.deepEqual(r.hinweise, []);

  const zweite = werteAus([m('f', antwort('Abmelden', { von: 'privat@example.invalid' }))], [SENDUNG]);
  assert.deepEqual(zweite.abmeldungen.map(a => a.email), ['kunde@example.invalid', 'privat@example.invalid'], 'angeschriebene Adresse und Absender');

  const nurBetreff = werteAus([m('g', antwort('Abmelden', { bezug: null }))], [SENDUNG]);
  assert.deepEqual(nurBetreff.abmeldungen.map(a => a.orderName), ['#T1']);

  // Fehlversuch hat keine Antwort.
  const fehlversuch = werteAus([m('h', antwort('Abmelden'))], [{ ...SENDUNG, status: 'fehler' }]);
  assert.deepEqual(fehlversuch.abmeldungen, []);
});

test('Abgleich: "Abmelden" nur im selbst geaenderten Betreff zaehlt, ohne das Wort bleibt die Mail beim Menschen', () => {
  const m = roh => ({ id: 'a', roh });
  assert.deepEqual(werteAus([m(antwort(ZITAT, { betreff: 'Abmelden' }))], [SENDUNG]).abmeldungen.map(a => a.email), ['kunde@example.invalid']);
  assert.deepEqual(werteAus([m(antwort('Bitte keine Mails mehr.'))], [SENDUNG]).abmeldungen, []);
  assert.deepEqual(werteAus([m(antwort('Danke', { betreff: 'Re: Abmelden moeglich?' }))], [{ ...SENDUNG, betreff: 'Abmelden moeglich?' }]).abmeldungen, [], 'unser Betreff zaehlt nicht');
});

test('Abgleich: Hinweis nur bei weiterem Text und mit Mail-Kennung', () => {
  const r = werteAus([{ id: 'a', roh: antwort(`Abmelden. Wann kommt meine Rechnung?\n\n${ZITAT}`) }], [SENDUNG]);
  assert.deepEqual(r.hinweise, [{ mailId: 'a', email: 'kunde@example.invalid', orderId: SENDUNG.orderId, orderName: '#T1', auszug: 'Abmelden. Wann kommt meine Rechnung?' }]);
});

test('Abgleich: Unzustellbar nur fuer Adressen, an die wir diese Nachfassmail geschickt haben', () => {
  const m = roh => ({ id: 'x', roh });
  assert.deepEqual(werteAus([m(bounce())], [SENDUNG]).unzustellbar.map(u => [u.email, u.status, u.orderName]), [['kunde@example.invalid', '5.1.1', '#T1']]);
  // Ueber den Betreff, wenn die Message-ID fehlt.
  assert.equal(werteAus([m(bounce({ original: `Subject: ${q(BETREFF)}` }))], [SENDUNG]).unzustellbar.length, 1);
  // Andere Mail an denselben Kunden (Rechnung, Lieferschein): sperrt die Nachfrage nicht.
  assert.deepEqual(werteAus([m(bounce({ original: 'Message-ID: <fremd@example.invalid>\r\nSubject: Ihre Rechnung' }))], [SENDUNG]).unzustellbar, []);
  // Nie angeschrieben, oder eine eigene Adresse.
  assert.deepEqual(werteAus([m(bounce({ an: 'andere@example.invalid' }))], [SENDUNG]).unzustellbar, []);
  assert.deepEqual(werteAus([m(bounce())], [SENDUNG], ['kunde@example.invalid']).unzustellbar, []);
});

test('Kopf-Vorauswahl: Antworten auf Nachfassmails und Unzustellbar-Meldungen, sonst nichts', () => {
  const kopf = roh => roh.subarray(0, roh.indexOf('\r\n\r\n') + 4);
  assert.equal(kopfPasst(kopf(antwort('x')), [SENDUNG]), true);
  assert.equal(kopfPasst(kopf(bounce()), []), true);
  assert.equal(kopfPasst(kopf(antwort('x', { von: 'x@example.invalid', bezug: null, betreff: 'Etwas anderes' })), [SENDUNG]), false);
});

test('postfachAbgleich: reicht den Lesefehler weiter - der Lauf darf dann nichts senden', async () => {
  await assert.rejects(postfachAbgleich({ zugang: { benutzer: 'a', passwort: 'test-passwort' }, lesen: async () => { throw new ImapFehler('IMAP: ECONNRESET'); } }), /ECONNRESET/);
  const r = await postfachAbgleich({ zugang: { benutzer: 'kontakt@example.invalid', absender: 'kontakt@example.invalid', kopie: null }, sendungen: [SENDUNG], lesen: async (_z, suchen) => {
    assert.deepEqual(suchen, [SUCHE_ANTWORTEN, SUCHE_UNZUSTELLBAR]);
    return { nachrichten: [{ id: 'a', roh: antwort('Abmelden') }], ohneOrdner: ['Junk'] };
  } });
  assert.deepEqual([r.geprueft, r.gelesen, r.ohneOrdner, r.abmeldungen.length], [true, 1, ['Junk'], 1]);
});

// --- IMAP: Holen, nur lesend ------------------------------------------------

/** Falscher IMAP-Server mit Literalen in FETCH-Antworten, Antwort in Stuecken (wie TLS es liefert). */
function falscherServer({ mails = {}, ordner = ['\\All', '\\Trash', '\\Junk'], suche = {}, fetchFehler = false, ohneRumpf = false } = {}) {
  const befehle = [];
  const NAMEN = { '\\All': '[Gmail]/All Mail', '\\Trash': '[Gmail]/Trash', '\\Junk': '[Gmail]/Spam' };
  let aktuell = null;
  const verbinden = () => {
    const sock = new EventEmitter();
    const senden = (teile) => {
      const ganz = Buffer.concat(teile.map(t => Buffer.from(t)));
      for (let i = 0; i < ganz.length; i += 40) { const s = ganz.subarray(i, i + 40); setImmediate(() => sock.emit('data', s)); }
    };
    sock.write = (zeile) => {
      const [marke, ...rest] = zeile.trim().split(' ');
      const cmd = rest.join(' ');
      befehle.push(cmd);
      if (cmd.startsWith('LOGIN')) senden([`${marke} OK\r\n`]);
      else if (cmd.startsWith('LIST')) senden([`* LIST (\\HasNoChildren) "/" "INBOX"\r\n`, ...ordner.map(k => `* LIST (${k} \\HasNoChildren) "/" "${NAMEN[k]}"\r\n`), `${marke} OK\r\n`]);
      else if (cmd.startsWith('EXAMINE')) { aktuell = /"(.*)"/.exec(cmd)[1]; senden([`* 1 EXISTS\r\n${marke} OK [READ-ONLY]\r\n`]); }
      else if (cmd.startsWith('UID SEARCH')) { const u = suche[aktuell] || []; senden([`* SEARCH${u.length ? ` ${u.join(' ')}` : ''}\r\n${marke} OK\r\n`]); }
      else if (cmd.startsWith('UID FETCH')) {
        if (fetchFehler) { senden([`${marke} NO kaputt\r\n`]); return true; }
        const kopf = /BODY\.PEEK\[HEADER\]/.test(cmd);
        if (!kopf && ohneRumpf) { senden([`${marke} OK\r\n`]); return true; }
        const teile = [];
        for (const u of cmd.split(' ')[2].split(',')) {
          const roh = Buffer.from(mails[u]);
          const inhalt = kopf ? roh.subarray(0, roh.indexOf('\r\n\r\n') + 4) : roh;
          teile.push(`* 7 FETCH (X-GM-MSGID ${Number(u) * 1000} UID ${u} BODY[${kopf ? 'HEADER' : ''}] {${inhalt.length}}\r\n`, inhalt, ')\r\n');
        }
        senden([...teile, `${marke} OK\r\n`]);
      } else if (cmd.startsWith('LOGOUT')) senden([`* BYE\r\n${marke} OK\r\n`]);
      else senden([`${marke} BAD unbekannt\r\n`]);
      return true;
    };
    sock.destroy = () => {};
    sock.end = () => {};
    senden(['* OK Gimap ready\r\n']);
    return sock;
  };
  return { befehle, verbinden };
}
const ZUGANG = { benutzer: 'kontakt@example.invalid', passwort: 'test-passwort' };

test('IMAP holen: nur EXAMINE und BODY.PEEK, auch Papierkorb und Spam, Rumpf nur fuer ausgewaehlte, Doppelte einmal', async () => {
  const passend = antwort('Abmelden');
  const fremd = antwort('Etwas ganz anderes', { von: 'x@example.invalid', bezug: null, betreff: 'Anderes' });
  const s = falscherServer({ mails: { 11: passend, 12: fremd, 13: bounce() }, suche: { '[Gmail]/All Mail': [11, 12], '[Gmail]/Trash': [13], '[Gmail]/Spam': [11] } });
  const r = await nachrichtenNurLesend(ZUGANG, ['abmelden'], { verbinden: s.verbinden, auswahl: k => kopfPasst(k, [SENDUNG]) });
  assert.deepEqual(r.nachrichten.map(n => n.id), [(11000).toString(16), (13000).toString(16)]);
  assert.deepEqual(r.ohneOrdner, []);
  assert.equal(r.nachrichten[0].roh.toString(), passend.toString(), 'Rumpf vollstaendig, auch ueber Paketgrenzen und mit Umlauten');
  // Nichts schreibt ins Postfach: kein SELECT/STORE/COPY/APPEND/EXPUNGE, jedes FETCH mit PEEK.
  assert.deepEqual(s.befehle.filter(b => /^(?:SELECT|STORE|UID STORE|COPY|UID COPY|MOVE|UID MOVE|APPEND|EXPUNGE|UID EXPUNGE|DELETE|CREATE)\b/i.test(b)), []);
  const fetches = s.befehle.filter(b => b.startsWith('UID FETCH'));
  assert.ok(fetches.length >= 4);
  assert.ok(fetches.every(b => /BODY\.PEEK\[/.test(b)), fetches.join(' | '));
  assert.deepEqual(s.befehle.filter(b => b.startsWith('EXAMINE')), ['EXAMINE "[Gmail]/All Mail"', 'EXAMINE "[Gmail]/Trash"', 'EXAMINE "[Gmail]/Spam"']);
  // Rumpf der fremden Mail (UID 12) wurde nie geholt.
  assert.ok(!s.befehle.some(b => /^UID FETCH 12 .*BODY\.PEEK\[\]/.test(b)));
});

test('IMAP holen: fehlender Papierkorb wird genannt, fehlendes "Alle Nachrichten" und Lesefehler werfen', async () => {
  const ohne = falscherServer({ ordner: ['\\All'] });
  assert.deepEqual((await nachrichtenNurLesend(ZUGANG, ['x'], { verbinden: ohne.verbinden })).ohneOrdner, ['Trash', 'Junk']);
  await assert.rejects(nachrichtenNurLesend(ZUGANG, ['x'], { verbinden: falscherServer({ ordner: ['\\Trash'] }).verbinden }), /Alle Nachrichten/);
  const mails = { 11: antwort('Abmelden') };
  await assert.rejects(nachrichtenNurLesend(ZUGANG, ['x'], { verbinden: falscherServer({ mails, suche: { '[Gmail]/All Mail': [11] }, fetchFehler: true }).verbinden }), ImapFehler);
  // Mail ausgewaehlt, Rumpf kommt nicht: das ist eine gescheiterte Suche, nicht "nichts gefunden".
  await assert.rejects(nachrichtenNurLesend(ZUGANG, ['x'], { verbinden: falscherServer({ mails, suche: { '[Gmail]/All Mail': [11] }, ohneRumpf: true }).verbinden }), /nicht lesbar/);
});
