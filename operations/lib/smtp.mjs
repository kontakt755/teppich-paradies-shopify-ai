/**
 * Kleiner SMTP-Versand ohne Fremdpaket (Muster-Nachfassen, Inhaberentscheidung w-119 vom
 * 2026-10-16: die Nachfrage geht automatisch vom Firmenpostfach raus).
 *
 * Bewusst klein: ein Empfaenger-Kreis je Mail, reiner Text, UTF-8. Kein Anhang, kein HTML.
 * Verbindung: implizites TLS (Port 465) oder STARTTLS (Port 587); "keine" Verschluesselung
 * gibt es nur fuer 127.0.0.1/localhost - das braucht der Test mit dem Fake-Server.
 * Anmeldung: AUTH PLAIN, sonst AUTH LOGIN. Das Passwort steht nie in einer Fehlermeldung.
 *
 * Das Postfach selbst (Host, Benutzer, Passwort) liegt nur im Privatordner
 * (operations/lib/nachfass-versand.mjs), nie im Repository.
 */

import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export class SmtpFehler extends Error {
  constructor(message, { code = null, schritt = null } = {}) {
    super(message);
    this.code = code;
    this.schritt = schritt;
  }
}

const LOKAL = /^(?:127\.0\.0\.1|localhost|::1)$/i;
const ADRESSE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** E-Mail-Adresse in der Form, die SMTP und Kopfzeilen brauchen - oder null. */
export function adresse(wert) {
  const s = String(wert ?? '').trim();
  return ADRESSE.test(s) ? s : null;
}

/** Kopfzeilen-Text nach RFC 2047, wenn er nicht reines ASCII ist. */
export function kodiereKopf(text) {
  const s = String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!s) return '';
  // eslint-disable-next-line no-control-regex -- genau die Frage: nur ASCII?
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function absenderKopf(von) {
  if (typeof von === 'string') return von;
  const name = String(von?.name ?? '').trim();
  const adr = von?.adresse;
  if (!name) return adr;
  // Anzeigename in Anfuehrungszeichen, sobald er Sonderzeichen traegt (Punkt, Komma, Umlaut ...).
  const sicher = /^[A-Za-z0-9 ]+$/.test(name) ? name : (kodiereKopf(name).startsWith('=?') ? kodiereKopf(name) : `"${name.replace(/["\\]/g, '')}"`);
  return `${sicher} <${adr}>`;
}

function datumKopf(d) {
  // RFC 5322 verlangt die Form "Thu, 16 Oct 2026 09:30:00 +0000"; toUTCString liefert "GMT".
  return new Date(d).toUTCString().replace(/GMT$/, '+0000');
}

/**
 * Die Nachricht als Text mit CRLF - Kopfzeilen, Leerzeile, Rumpf (base64, damit Umlaute und
 * lange Zeilen jeden Server unbeschadet passieren). Blindkopien stehen nicht im Kopf.
 *
 * @param {object} p
 * @param {string|{name?: string, adresse: string}} p.von
 * @param {string[]} p.an
 * @param {string} p.betreff
 * @param {string} p.text
 * @param {string} [p.messageId]
 * @param {Date|string} [p.datum]
 * @returns {{ messageId: string, daten: string }}
 */
export function baueNachricht({ von, an, betreff, text, messageId = null, datum = new Date() } = {}) {
  const vonAdresse = typeof von === 'string' ? adresse(von) : adresse(von?.adresse);
  if (!vonAdresse) throw new SmtpFehler('Absenderadresse fehlt oder ist ungültig', { schritt: 'nachricht' });
  const empfaenger = (Array.isArray(an) ? an : [an]).map(adresse).filter(Boolean);
  if (!empfaenger.length) throw new SmtpFehler('Keine gültige Empfängeradresse', { schritt: 'nachricht' });
  const id = messageId || `<${randomUUID()}@${vonAdresse.split('@')[1]}>`;
  const rumpf = Buffer.from(String(text ?? '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g) || [];
  const kopf = [
    `Date: ${datumKopf(datum)}`,
    `From: ${absenderKopf(typeof von === 'string' ? { adresse: vonAdresse } : { ...von, adresse: vonAdresse })}`,
    `To: ${empfaenger.join(', ')}`,
    `Subject: ${kodiereKopf(betreff)}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];
  return { messageId: id, daten: `${kopf.join('\r\n')}\r\n\r\n${rumpf.join('\r\n')}\r\n` };
}

/** Zeilen, die mit einem Punkt beginnen, bekommen im DATA-Block einen zweiten (RFC 5321, 4.5.2). */
function punktSchutz(daten) {
  return daten.split('\r\n').map(z => (z.startsWith('.') ? `.${z}` : z)).join('\r\n');
}

/**
 * Verbindung mit Antwort-Leser. Eine SMTP-Antwort ist fertig, wenn eine Zeile "NNN " (Code,
 * Leerzeichen) beginnt; "NNN-" sind Fortsetzungszeilen.
 */
function verbinde(socket, zeitLimitMs) {
  let puffer = '';
  const warter = [];
  let fehler = null;
  const pruefe = () => {
    while (warter.length) {
      const m = puffer.match(/^(?:\d{3}-[^\r\n]*\r\n)*(\d{3})(?: [^\r\n]*)?\r\n/);
      if (!m) return;
      const antwort = m[0];
      puffer = puffer.slice(antwort.length);
      warter.shift().resolve({ code: Number(m[1]), text: antwort.replace(/\r\n$/, '') });
    }
  };
  const bricht = (e) => {
    fehler = fehler || e;
    while (warter.length) warter.shift().reject(fehler);
  };
  socket.setEncoding('utf8');
  socket.setTimeout(zeitLimitMs, () => bricht(new SmtpFehler(`Keine Antwort vom Mailserver innerhalb von ${Math.round(zeitLimitMs / 1000)} s`, { schritt: 'zeit' })));
  socket.on('data', (d) => { puffer += d; pruefe(); });
  socket.on('error', e => bricht(new SmtpFehler(`Verbindung zum Mailserver gestört: ${e?.code || e?.message}`, { schritt: 'verbindung' })));
  socket.on('close', () => bricht(new SmtpFehler('Der Mailserver hat die Verbindung beendet', { schritt: 'verbindung' })));
  return {
    socket,
    lies: () => new Promise((resolve, reject) => {
      if (fehler) return reject(fehler);
      warter.push({ resolve, reject });
      pruefe();
    }),
    schreib: (zeile) => new Promise((resolve, reject) => {
      if (fehler) return reject(fehler);
      socket.write(zeile.endsWith('\r\n') ? zeile : `${zeile}\r\n`, 'utf8', e => (e ? reject(e) : resolve()));
    }),
  };
}

function tlsVerbindung(host, port, socket = null) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, ...(socket ? { socket } : {}) }, () => resolve(s));
    s.once('error', reject);
  });
}

function netVerbindung(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port }, () => resolve(s));
    s.once('error', reject);
  });
}

/**
 * Verschickt genau eine Mail. Gibt { messageId, antwort } zurueck (die 250-Antwort auf DATA),
 * wirft SmtpFehler mit Schritt und Server-Code. Das Passwort erscheint in keiner Meldung.
 *
 * @param {{host: string, port: number, sicherheit?: 'tls'|'starttls'|'keine', benutzer?: string, passwort?: string}} zugang
 * @param {{von: string|{name?: string, adresse: string}, an: string[], bcc?: string[], betreff: string, text: string, messageId?: string, datum?: Date}} mail
 */
export async function sendeMail(zugang, mail, { zeitLimitMs = 30_000, eigenerName = os.hostname() || 'localhost' } = {}) {
  const host = String(zugang?.host ?? '').trim();
  const port = Number(zugang?.port);
  const sicherheit = zugang?.sicherheit || (port === 465 ? 'tls' : 'starttls');
  if (!host || !(port > 0)) throw new SmtpFehler('Mailserver (host, port) fehlt', { schritt: 'zugang' });
  if (!['tls', 'starttls', 'keine'].includes(sicherheit)) throw new SmtpFehler(`Unbekannte Verschlüsselung „${sicherheit}“ (tls, starttls)`, { schritt: 'zugang' });
  if (sicherheit === 'keine' && !LOKAL.test(host)) throw new SmtpFehler('Ohne Verschlüsselung nur zu 127.0.0.1 (Test) – für das Firmenpostfach tls oder starttls', { schritt: 'zugang' });

  const nachricht = baueNachricht(mail);
  const vonAdresse = typeof mail.von === 'string' ? adresse(mail.von) : adresse(mail.von?.adresse);
  const empfaenger = [...new Set([...(mail.an || []), ...(mail.bcc || [])].map(adresse).filter(Boolean))];

  let v = verbinde(sicherheit === 'tls' ? await tlsVerbindung(host, port) : await netVerbindung(host, port), zeitLimitMs);
  const erwarte = async (schritt, zeile, gut) => {
    if (zeile !== null) await v.schreib(zeile);
    const a = await v.lies();
    if (!gut.includes(a.code)) {
      const kurz = a.text.split('\r\n').pop().slice(0, 200);
      throw new SmtpFehler(`Mailserver lehnt ${schritt} ab (${a.code}): ${kurz}`, { code: a.code, schritt });
    }
    return a;
  };
  const ehlo = async () => (await erwarte('EHLO', `EHLO ${eigenerName}`, [250])).text.toUpperCase();
  try {
    await erwarte('Begrüßung', null, [220]);
    let faehigkeiten = await ehlo();
    if (sicherheit === 'starttls') {
      if (!faehigkeiten.includes('STARTTLS')) throw new SmtpFehler('Der Mailserver bietet kein STARTTLS – Port 465 mit tls versuchen', { schritt: 'STARTTLS' });
      await erwarte('STARTTLS', 'STARTTLS', [220]);
      const roh = v.socket;
      roh.removeAllListeners('data'); roh.removeAllListeners('close'); roh.removeAllListeners('error'); roh.setTimeout(0);
      v = verbinde(await tlsVerbindung(host, port, roh), zeitLimitMs);
      faehigkeiten = await ehlo();
    }
    if (zugang.benutzer) {
      const authZeile = faehigkeiten.split('\r\n').find(z => /^250[- ]AUTH\b/.test(z)) || '';
      if (/\bPLAIN\b/.test(authZeile) || !/\bLOGIN\b/.test(authZeile)) {
        await erwarte('Anmeldung', `AUTH PLAIN ${Buffer.from(`\0${zugang.benutzer}\0${zugang.passwort ?? ''}`, 'utf8').toString('base64')}`, [235]);
      } else {
        await erwarte('Anmeldung', 'AUTH LOGIN', [334]);
        await erwarte('Anmeldung', Buffer.from(zugang.benutzer, 'utf8').toString('base64'), [334]);
        await erwarte('Anmeldung', Buffer.from(zugang.passwort ?? '', 'utf8').toString('base64'), [235]);
      }
    }
    await erwarte('Absender', `MAIL FROM:<${vonAdresse}>`, [250]);
    for (const e of empfaenger) await erwarte(`Empfänger ${e}`, `RCPT TO:<${e}>`, [250, 251]);
    await erwarte('DATA', 'DATA', [354]);
    const antwort = await erwarte('Übergabe', `${punktSchutz(nachricht.daten)}.\r\n`, [250]);
    try { await erwarte('QUIT', 'QUIT', [221]); } catch { /* Die Mail ist angenommen - ein knurriges QUIT aendert nichts. */ }
    return { messageId: nachricht.messageId, antwort: antwort.text.split('\r\n').pop().slice(0, 200), empfaenger };
  } finally {
    try { v.socket.destroy(); } catch { /* schon zu */ }
  }
}
