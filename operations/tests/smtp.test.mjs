import test from 'node:test';
import assert from 'node:assert/strict';
import { sendeMail, baueNachricht, kodiereKopf, adresse, SmtpFehler } from '../lib/smtp.mjs';
import { starteSmtpAttrappe, kopfzeile, rumpfText, betreffText } from './smtp-attrappe.mjs';

// Nur erfundene Adressen (example.invalid), nie echte Zugangsdaten.
const ZUGANG = port => ({ host: '127.0.0.1', port, sicherheit: 'keine', benutzer: 'kontakt@example.invalid', passwort: 'test-geheimnis' });
const MAIL = {
  von: { name: 'Teppich Paradies', adresse: 'kontakt@example.invalid' },
  an: ['kunde@example.invalid'], bcc: ['kontakt@example.invalid'],
  betreff: 'Ihre Muster – passt die Farbe?',
  text: 'Guten Tag Testkunde,\n\nIhre Muster sollten angekommen sein.\n.Zeile mit Punkt\n\nFreundliche Grüße',
  datum: new Date('2026-10-16T07:30:00Z'),
};

test('Nachricht: Kopfzeilen RFC-konform, Umlaute kodiert, Blindkopie nicht im Kopf, Rumpf base64', () => {
  const n = baueNachricht(MAIL);
  assert.match(n.messageId, /^<[0-9a-f-]+@example\.invalid>$/);
  assert.equal(kopfzeile(n.daten, 'Date'), 'Fri, 16 Oct 2026 07:30:00 +0000');
  assert.equal(kopfzeile(n.daten, 'From'), 'Teppich Paradies <kontakt@example.invalid>');
  assert.equal(kopfzeile(n.daten, 'To'), 'kunde@example.invalid');
  assert.equal(betreffText(n.daten), 'Ihre Muster – passt die Farbe?');
  assert.equal(kopfzeile(n.daten, 'Bcc'), null);
  assert.equal(kopfzeile(n.daten, 'Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(rumpfText(n.daten), MAIL.text.replace(/\n/g, '\r\n'));
  assert.ok(n.daten.split('\r\n').every(z => z.length <= 78), 'keine Zeile laenger als 78 Zeichen');
  assert.equal(kodiereKopf('Passt die Farbe?'), 'Passt die Farbe?');
  assert.equal(kodiereKopf('Grüße'), '=?UTF-8?B?R3LDvMOfZQ==?=');
  assert.equal(adresse(' Kunde@Example.invalid '), 'Kunde@Example.invalid');
  assert.equal(adresse('kein-at'), null);
  assert.throws(() => baueNachricht({ ...MAIL, an: ['ungueltig'] }), SmtpFehler);
});

test('Versand gegen die Attrappe: AUTH PLAIN, Umschlag mit Blindkopie, Punkt-Schutz, Antwort mit Message-ID', async () => {
  const s = await starteSmtpAttrappe();
  try {
    const r = await sendeMail(ZUGANG(s.port), MAIL, { eigenerName: 'test.local' });
    assert.match(r.messageId, /@example\.invalid>$/);
    assert.match(r.antwort, /^250/);
    assert.deepEqual(r.empfaenger, ['kunde@example.invalid', 'kontakt@example.invalid']);
    assert.deepEqual(s.anmeldungen, [{ art: 'PLAIN', benutzer: 'kontakt@example.invalid', passwortLaenge: 'test-geheimnis'.length }]);
    assert.equal(s.nachrichten.length, 1);
    const n = s.nachrichten[0];
    assert.equal(n.von, 'kontakt@example.invalid');
    assert.deepEqual(n.an, ['kunde@example.invalid', 'kontakt@example.invalid'], 'Blindkopie steht nur im Umschlag');
    assert.equal(kopfzeile(n.daten, 'Bcc'), null);
    assert.equal(kopfzeile(n.daten, 'Message-ID'), r.messageId);
    assert.equal(rumpfText(n.daten), MAIL.text.replace(/\n/g, '\r\n'), 'Rumpf kommt unversehrt an');
  } finally { await s.schliessen(); }
});

test('Fehler: abgelehnte Anmeldung und abgelehnter Empfaenger werden zum SmtpFehler ohne Passwort im Text', async () => {
  const s = await starteSmtpAttrappe({ authFehlschlag: true });
  try {
    await assert.rejects(sendeMail(ZUGANG(s.port), MAIL), (e) => {
      assert.ok(e instanceof SmtpFehler);
      assert.equal(e.code, 535);
      assert.equal(e.schritt, 'Anmeldung');
      assert.doesNotMatch(e.message, /test-geheimnis/);
      return true;
    });
    assert.equal(s.nachrichten.length, 0);
  } finally { await s.schliessen(); }

  const t = await starteSmtpAttrappe({ rcptAblehnen: 'kunde@example.invalid' });
  try {
    await assert.rejects(sendeMail(ZUGANG(t.port), MAIL), e => e instanceof SmtpFehler && e.code === 550 && /kunde@example\.invalid/.test(e.message));
    assert.equal(t.nachrichten.length, 0, 'nach Ablehnung geht nichts raus');
  } finally { await t.schliessen(); }
});

test('Zugang: ohne Verschluesselung nur lokal, host/port Pflicht', async () => {
  await assert.rejects(sendeMail({ host: 'mail.example.invalid', port: 25, sicherheit: 'keine' }, MAIL), /nur zu 127\.0\.0\.1/);
  await assert.rejects(sendeMail({ host: '', port: 465 }, MAIL), /host, port/);
  await assert.rejects(sendeMail({ host: '127.0.0.1', port: 1, sicherheit: 'ssl' }, MAIL), /Unbekannte Verschlüsselung/);
});
