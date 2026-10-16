/**
 * Kleiner SMTP-Server fuer Tests (nur 127.0.0.1, ohne TLS): nimmt EHLO, AUTH PLAIN/LOGIN,
 * MAIL/RCPT/DATA/QUIT an und merkt sich jede Nachricht samt Umschlag. Kein Versand.
 *
 *   const s = await starteSmtpAttrappe();        // s.port, s.nachrichten, s.anmeldungen
 *   ... sendeMail({ host: '127.0.0.1', port: s.port, sicherheit: 'keine', ... }, mail)
 *   await s.schliessen();
 *
 * Optionen: { authFehlschlag: true } lehnt jede Anmeldung ab (535), { rcptAblehnen: adresse }
 * lehnt genau diesen Empfaenger ab (550).
 */
import net from 'node:net';

export async function starteSmtpAttrappe({ authFehlschlag = false, rcptAblehnen = null } = {}) {
  const nachrichten = [];
  const anmeldungen = [];
  const server = net.createServer((socket) => {
    let puffer = '';
    let inDaten = false;
    let umschlag = { von: null, an: [] };
    let daten = '';
    let loginSchritt = null;
    const s = t => socket.write(`${t}\r\n`);
    s('220 attrappe.test ESMTP bereit');
    socket.on('data', (chunk) => {
      puffer += chunk.toString('utf8');
      for (;;) {
        if (inDaten) {
          const ende = puffer.indexOf('\r\n.\r\n');
          if (ende < 0) return;
          daten = puffer.slice(0, ende);
          puffer = puffer.slice(ende + 5);
          inDaten = false;
          nachrichten.push({ ...umschlag, daten: daten.split('\r\n').map(z => (z.startsWith('..') ? z.slice(1) : z)).join('\r\n') });
          umschlag = { von: null, an: [] };
          s('250 2.0.0 OK angenommen');
          continue;
        }
        const i = puffer.indexOf('\r\n');
        if (i < 0) return;
        const zeile = puffer.slice(0, i);
        puffer = puffer.slice(i + 2);
        if (loginSchritt === 'benutzer') { anmeldungen.push({ art: 'LOGIN', benutzer: Buffer.from(zeile, 'base64').toString('utf8') }); loginSchritt = 'passwort'; s('334 UGFzc3dvcmQ6'); continue; }
        if (loginSchritt === 'passwort') { anmeldungen.at(-1).passwortLaenge = Buffer.from(zeile, 'base64').toString('utf8').length; loginSchritt = null; s(authFehlschlag ? '535 5.7.8 Anmeldung abgelehnt' : '235 2.7.0 angemeldet'); continue; }
        const [befehl, ...rest] = zeile.split(' ');
        const arg = rest.join(' ');
        switch (befehl.toUpperCase()) {
          case 'EHLO': s('250-attrappe.test'); s('250-AUTH PLAIN LOGIN'); s('250 8BITMIME'); break;
          case 'AUTH': {
            const [mech, wert] = arg.split(' ');
            if (mech === 'PLAIN') {
              const [, benutzer, passwort] = Buffer.from(wert || '', 'base64').toString('utf8').split('\0');
              anmeldungen.push({ art: 'PLAIN', benutzer, passwortLaenge: (passwort || '').length });
              s(authFehlschlag ? '535 5.7.8 Anmeldung abgelehnt' : '235 2.7.0 angemeldet');
            } else if (mech === 'LOGIN') { loginSchritt = 'benutzer'; s('334 VXNlcm5hbWU6'); }
            else s('504 5.5.4 Mechanismus unbekannt');
            break;
          }
          case 'MAIL': umschlag.von = arg.replace(/^FROM:<|>$/gi, ''); s('250 2.1.0 OK'); break;
          case 'RCPT': {
            const adr = arg.replace(/^TO:<|>$/gi, '');
            if (rcptAblehnen && adr.toLowerCase() === String(rcptAblehnen).toLowerCase()) { s('550 5.1.1 Empfaenger unbekannt'); break; }
            umschlag.an.push(adr); s('250 2.1.5 OK'); break;
          }
          case 'DATA': inDaten = true; s('354 Daten, Ende mit <CRLF>.<CRLF>'); break;
          case 'QUIT': s('221 2.0.0 tschuess'); socket.end(); break;
          case 'RSET': umschlag = { von: null, an: [] }; s('250 OK'); break;
          default: s('502 5.5.2 Befehl unbekannt');
        }
      }
    });
    socket.on('error', () => {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    nachrichten,
    anmeldungen,
    schliessen: () => new Promise(r => server.close(() => r())),
  };
}

/** Kopfzeile aus der rohen Nachricht (erste Zeile mit diesem Namen). */
export function kopfzeile(daten, name) {
  const m = String(daten).split('\r\n\r\n')[0].split('\r\n').find(z => z.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return m ? m.slice(name.length + 1).trim() : null;
}

/** Der Rumpf (base64) als Text. */
export function rumpfText(daten) {
  const teile = String(daten).split('\r\n\r\n');
  return Buffer.from(teile.slice(1).join('\r\n\r\n').replace(/\s+/g, ''), 'base64').toString('utf8');
}

/** Betreff dekodiert (RFC 2047 base64 oder roh). */
export function betreffText(daten) {
  const b = kopfzeile(daten, 'Subject') || '';
  const m = b.match(/^=\?UTF-8\?B\?(.+)\?=$/i);
  return m ? Buffer.from(m[1], 'base64').toString('utf8') : b;
}
