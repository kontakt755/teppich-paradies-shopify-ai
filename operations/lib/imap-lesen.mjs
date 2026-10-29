/**
 * Kleinster IMAP-Leser fuer Gmail: findet Nachrichten per Gmail-Suche (X-GM-RAW) und gibt
 * nur ihre Kennungen zurueck - nie Betreff, Absender oder Text. Grundlage der Vorpruefung des
 * Postfach-Laufs (operations/lib/postfach-vorpruefung.mjs): Claude startet nur, wenn es
 * Nachrichten gibt, die noch kein Lauf gesehen hat.
 *
 * Nur lesend: das Postfach wird mit EXAMINE geoeffnet (Nur-Lese-Modus, setzt kein \Seen),
 * abgefragt wird nur X-GM-MSGID. Die Kennung ist dieselbe wie die Nachrichten-ID der Gmail-API
 * (dort als Hexadezimalzahl), die die Routinen in lieferbelege/serviceanfragen ablegen.
 *
 * Zugang: derselbe wie der Nachfass-Versand (nachfassen/postfach.json, App-Passwort des
 * Firmenpostfachs), Host imap.gmail.com statt smtp.gmail.com.
 */

import tls from 'node:tls';

export class ImapFehler extends Error {}

/** IMAP-Zeichenkette in Anfuehrungszeichen; nur druckbares ASCII (sonst bräuchte es Literale). */
export function imapText(wert) {
  const s = String(wert ?? '');
  if (!/^[\x20-\x7e]*$/.test(s)) throw new ImapFehler('IMAP-Text nur mit druckbaren ASCII-Zeichen');
  return `"${s.replace(/[\\"]/g, c => `\\${c}`)}"`;
}

/** Literal aus einer Antwort als Text in Anfuehrungszeichen (nur zum Weiterparsen, nie gesendet). */
const imapTextLocker = s => `"${String(s).replace(/[\r\n]+/g, ' ').replace(/[\\"]/g, c => `\\${c}`)}"`;

/** Name des Ordners "Alle Nachrichten" aus LIST-Antworten (Kennzeichen \All, Name je nach Sprache). */
export function alleNachrichtenOrdner(zeilen) {
  for (const z of zeilen) {
    const m = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))$/i.exec(z);
    if (m && /(^|\s)\\All(\s|$)/i.test(m[1])) return m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[3];
  }
  return null;
}

/** UIDs aus "* SEARCH 1 2 3". */
export function suchErgebnis(zeilen) {
  const uids = [];
  for (const z of zeilen) {
    const m = /^\* SEARCH(?: (.*))?$/i.exec(z);
    if (m?.[1]) for (const u of m[1].trim().split(/\s+/)) if (/^\d+$/.test(u)) uids.push(Number(u));
  }
  return uids;
}

/** Gmail-Nachrichten-IDs (hexadezimal wie in der Gmail-API) aus "* n FETCH (X-GM-MSGID 123 UID 4)". */
export function nachrichtenIds(zeilen) {
  const ids = [];
  for (const z of zeilen) {
    const m = /^\* \d+ FETCH \(.*\bX-GM-MSGID (\d+)/i.exec(z);
    if (m) ids.push(BigInt(m[1]).toString(16));
  }
  return ids;
}

/**
 * Eine IMAP-Verbindung mit nacheinander gesendeten Befehlen. Antworten werden zeilenweise
 * gesammelt; Literale ({n}) haengen an ihrer Zeile. Ein Befehl endet mit seiner Marke
 * (A1 OK/NO/BAD). Zeitlimit fuer die ganze Verbindung.
 */
export function verbinde({ host, port = 993, verbinden = tls.connect, zeitLimitMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = verbinden({ host, port, servername: host });
    let puffer = Buffer.alloc(0);
    let zeilen = [];
    let warten = null; // { marke, resolve, reject }
    let begruesst = false;
    let nr = 0;
    let beendet = false;
    const uhr = setTimeout(() => fehler(new ImapFehler(`IMAP: Zeitlimit (${Math.round(zeitLimitMs / 1000)} s)`)), zeitLimitMs);
    function fehler(e) {
      if (beendet) return;
      beendet = true;
      clearTimeout(uhr);
      try { sock.destroy(); } catch { /* schon zu */ }
      if (warten) warten.reject(e); else if (!begruesst) reject(e);
      warten = null;
    }
    function zeile(z) {
      if (!begruesst) {
        begruesst = true;
        if (!/^\* (OK|PREAUTH)\b/i.test(z)) return fehler(new ImapFehler('IMAP: unerwartete Begrüßung'));
        return resolve({ befehl, schliessen });
      }
      if (!warten) return;
      const m = /^(A\d+) (OK|NO|BAD)\b ?(.*)$/i.exec(z);
      if (m && m[1] === warten.marke) {
        const w = warten;
        warten = null;
        const antwort = { status: m[2].toUpperCase(), text: m[3], zeilen };
        zeilen = [];
        return w.resolve(antwort);
      }
      zeilen.push(z);
    }
    // Angefangene Zeile: ein Literal ({n} am Zeilenende, danach n Bytes) gehoert zur Zeile davor
    // und wird als Text in Anfuehrungszeichen eingesetzt; die Zeile geht danach weiter.
    let angefangen = '';
    sock.on('data', (d) => {
      puffer = Buffer.concat([puffer, d]);
      for (;;) {
        const i = puffer.indexOf('\r\n');
        if (i < 0) break;
        const stueck = puffer.subarray(0, i).toString('utf8');
        const lit = /\{(\d+)\}$/.exec(stueck);
        if (lit) {
          const n = Number(lit[1]);
          if (puffer.length < i + 2 + n) break; // Literal noch nicht vollstaendig
          angefangen += stueck.slice(0, lit.index) + imapTextLocker(puffer.subarray(i + 2, i + 2 + n).toString('utf8'));
          puffer = puffer.subarray(i + 2 + n);
          continue;
        }
        puffer = puffer.subarray(i + 2);
        const z = angefangen + stueck;
        angefangen = '';
        zeile(z);
      }
    });
    sock.on('error', e => fehler(new ImapFehler(`IMAP: ${e.code || e.message}`)));
    sock.on('close', () => fehler(new ImapFehler('IMAP: Verbindung beendet')));
    function befehl(text) {
      if (beendet) return Promise.reject(new ImapFehler('IMAP: Verbindung schon beendet'));
      if (/[\r\n]/.test(text)) return Promise.reject(new ImapFehler('IMAP: Zeilenumbruch im Befehl'));
      nr += 1;
      const marke = `A${nr}`;
      return new Promise((res, rej) => {
        warten = { marke, resolve: res, reject: rej };
        sock.write(`${marke} ${text}\r\n`);
      });
    }
    async function schliessen() {
      if (beendet) return;
      try { await befehl('LOGOUT'); } catch { /* egal */ }
      beendet = true;
      clearTimeout(uhr);
      try { sock.end(); } catch { /* schon zu */ }
    }
  });
}

function pruefe(antwort, was) {
  if (antwort.status !== 'OK') throw new ImapFehler(`IMAP ${was}: ${antwort.status} ${String(antwort.text || '').slice(0, 120)}`);
  return antwort;
}

/**
 * Meldet an, oeffnet "Alle Nachrichten" nur lesend und fuehrt die Gmail-Suchen aus.
 * Ergebnis: je Suche die Liste der Nachrichten-IDs (hexadezimal). Das Passwort geht nur in den
 * LOGIN-Befehl, nie in eine Meldung.
 */
export async function suchenNurLesend(zugang, suchen, { host = 'imap.gmail.com', port = 993, verbinden, zeitLimitMs } = {}) {
  const v = await verbinde({ host, port, verbinden, zeitLimitMs });
  try {
    const anmeldung = await v.befehl(`LOGIN ${imapText(zugang.benutzer)} ${imapText(zugang.passwort)}`);
    if (anmeldung.status !== 'OK') throw new ImapFehler('IMAP-Anmeldung abgelehnt (App-Passwort oder IMAP im Postfach nicht freigegeben)');
    const ordner = alleNachrichtenOrdner(pruefe(await v.befehl('LIST "" "*"'), 'LIST').zeilen);
    if (!ordner) throw new ImapFehler('IMAP: Ordner „Alle Nachrichten“ nicht gefunden');
    pruefe(await v.befehl(`EXAMINE ${imapText(ordner)}`), 'EXAMINE');
    const ergebnis = [];
    for (const suche of suchen) {
      const uids = suchErgebnis(pruefe(await v.befehl(`UID SEARCH X-GM-RAW ${imapText(suche)}`), 'SEARCH').zeilen);
      const ids = [];
      for (let i = 0; i < uids.length; i += 200) {
        const teil = uids.slice(i, i + 200).join(',');
        ids.push(...nachrichtenIds(pruefe(await v.befehl(`UID FETCH ${teil} (X-GM-MSGID)`), 'FETCH').zeilen));
      }
      ergebnis.push(ids);
    }
    return ergebnis;
  } finally {
    await v.schliessen();
  }
}
