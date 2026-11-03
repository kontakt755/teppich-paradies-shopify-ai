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
 *
 * Der Nachfass-Lauf braucht zusaetzlich den Inhalt einzelner Mails (Antwort "Abmelden",
 * Unzustellbar-Meldung): nachrichtenNurLesend() holt erst die Koepfe und nur fuer die passenden
 * den Rumpf. Das Rechnungs-Archiv (belege:monat) holt ganze Nachrichten (mitNurLesen).
 * Beides unter EXAMINE und nur mit BODY.PEEK - das setzt kein \Seen. Es gibt hier bewusst keinen
 * Befehl, der etwas aendert (kein STORE, COPY, EXPUNGE, APPEND).
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

/** Bis zu dieser Groesse steht ein Literal auch als Text in der Zeile (Ordnernamen, Labels). */
const LITERAL_IN_ZEILE_MAX = 4096;

/** Name des Ordners mit einem Kennzeichen (\All, \Trash, \Junk) aus LIST-Antworten - der Name haengt von der Sprache ab. */
export function ordnerMitKennzeichen(zeilen, kennzeichen) {
  for (const z of zeilen) {
    const m = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))$/i.exec(z);
    if (m && m[1].split(/\s+/).some(k => k.toLowerCase() === kennzeichen.toLowerCase())) return m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[3];
  }
  return null;
}

/** Name des Ordners "Alle Nachrichten" aus LIST-Antworten (Kennzeichen \All, Name je nach Sprache). */
export function alleNachrichtenOrdner(zeilen) {
  return ordnerMitKennzeichen(zeilen, '\\All');
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
 * Kennungen aus "* n FETCH (X-GM-THRID 1 X-GM-MSGID 2 X-GM-LABELS ("a" b) UID 3 INTERNALDATE "...")".
 * Thread- und Nachrichten-ID hexadezimal wie in der Gmail-API.
 */
export function nachrichtenDaten(zeilen) {
  const daten = [];
  for (const z of zeilen) {
    if (!/^\* \d+ FETCH \(/i.test(z)) continue;
    const uid = /\bUID (\d+)/i.exec(z);
    const id = /\bX-GM-MSGID (\d+)/i.exec(z);
    if (!uid || !id) continue;
    const thread = /\bX-GM-THRID (\d+)/i.exec(z);
    const eingang = /\bINTERNALDATE "([^"]*)"/i.exec(z);
    const labels = [];
    const l = /\bX-GM-LABELS \(((?:[^()"]|"(?:[^"\\]|\\.)*")*)\)/i.exec(z);
    if (l) for (const m of l[1].matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) labels.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]);
    daten.push({
      uid: Number(uid[1]),
      id: BigInt(id[1]).toString(16),
      thread: thread ? BigInt(thread[1]).toString(16) : null,
      labels,
      eingang: eingang ? eingang[1] : null,
    });
  }
  return daten;
}

/**
 * Eine IMAP-Verbindung mit nacheinander gesendeten Befehlen. Antworten werden zeilenweise
 * gesammelt; Literale ({n}) haengen an ihrer Zeile, die Bytes stehen unveraendert in
 * antwort.literale und je Zeile in antwort.eintraege (Mails und Anhaenge sind kein UTF-8; in
 * zeilen steht nur bis LITERAL_IN_ZEILE_MAX der Text). Ein Befehl endet mit seiner Marke
 * (A1 OK/NO/BAD). Zeitlimit fuer die ganze Verbindung.
 */
export function verbinde({ host, port = 993, verbinden = tls.connect, zeitLimitMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = verbinden({ host, port, servername: host });
    let puffer = Buffer.alloc(0);
    let zeilen = [];
    let eintraege = []; // je Antwortzeile: { aussen: Zeile ohne Literale, literale: Buffer[] }
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
    function zeile(z, roh) {
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
        // literale: alle Bytes der Antwort flach, eintraege: dieselben Puffer je Antwortzeile.
        const antwort = { status: m[2].toUpperCase(), text: m[3], zeilen, eintraege, literale: eintraege.flatMap(e => e.literale) };
        zeilen = [];
        eintraege = [];
        return w.resolve(antwort);
      }
      zeilen.push(z);
      eintraege.push(roh);
    }
    // Angefangene Zeile: ein Literal ({n} am Zeilenende, danach n Bytes) gehoert zur Zeile davor
    // und wird als Text in Anfuehrungszeichen eingesetzt; die Zeile geht danach weiter.
    let angefangen = '';
    let aussen = '';
    let zeilenLiterale = [];
    // Solange ein grosses Literal unterwegs ist, wird nur gesammelt - nicht bei jedem Stueck neu
    // zusammengefuegt (eine Mail mit 20 MB Anhang kommt in Tausenden kleinen Stuecken).
    let gesammelt = [];
    let gesammeltLaenge = 0;
    let brauche = 0;
    sock.on('data', (d) => {
      gesammelt.push(d);
      gesammeltLaenge += d.length;
      if (gesammeltLaenge < brauche) return;
      puffer = gesammelt.length === 1 ? gesammelt[0] : Buffer.concat(gesammelt);
      gesammelt = [];
      gesammeltLaenge = 0;
      brauche = 0;
      const fertig = () => { gesammelt = [puffer]; gesammeltLaenge = puffer.length; };
      for (;;) {
        const i = puffer.indexOf('\r\n');
        if (i < 0) return fertig();
        const stueck = puffer.subarray(0, i).toString('utf8');
        const lit = /\{(\d+)\}$/.exec(stueck);
        if (lit) {
          const n = Number(lit[1]);
          if (puffer.length < i + 2 + n) { // Literal noch nicht vollstaendig
            fertig();
            brauche = i + 2 + n;
            return;
          }
          const bytes = puffer.subarray(i + 2, i + 2 + n);
          zeilenLiterale.push(Buffer.from(bytes));
          aussen += `${stueck.slice(0, lit.index)}{}`;
          angefangen += stueck.slice(0, lit.index) + (n <= LITERAL_IN_ZEILE_MAX ? imapTextLocker(bytes.toString('utf8')) : `"[${n} Bytes]"`);
          puffer = puffer.subarray(i + 2 + n);
          continue;
        }
        puffer = puffer.subarray(i + 2);
        const z = angefangen + stueck;
        const roh = { aussen: aussen + stueck, literale: zeilenLiterale };
        angefangen = '';
        aussen = '';
        zeilenLiterale = [];
        zeile(z, roh);
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

async function anmelden(v, zugang) {
  const anmeldung = await v.befehl(`LOGIN ${imapText(zugang.benutzer)} ${imapText(zugang.passwort)}`);
  if (anmeldung.status !== 'OK') throw new ImapFehler('IMAP-Anmeldung abgelehnt (App-Passwort oder IMAP im Postfach nicht freigegeben)');
}

/** Meldet an und oeffnet "Alle Nachrichten" mit EXAMINE. */
async function oeffneNurLesend(v, zugang) {
  await anmelden(v, zugang);
  const ordner = alleNachrichtenOrdner(pruefe(await v.befehl('LIST "" "*"'), 'LIST').zeilen);
  if (!ordner) throw new ImapFehler('IMAP: Ordner „Alle Nachrichten“ nicht gefunden');
  return pruefe(await v.befehl(`EXAMINE ${imapText(ordner)}`), 'EXAMINE');
}

/**
 * Meldet an, oeffnet "Alle Nachrichten" nur lesend und fuehrt die Gmail-Suchen aus.
 * Ergebnis: je Suche die Liste der Nachrichten-IDs (hexadezimal). Das Passwort geht nur in den
 * LOGIN-Befehl, nie in eine Meldung.
 */
export async function suchenNurLesend(zugang, suchen, { host = 'imap.gmail.com', port = 993, verbinden, zeitLimitMs } = {}) {
  const v = await verbinde({ host, port, verbinden, zeitLimitMs });
  try {
    await oeffneNurLesend(v, zugang);
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

/**
 * Sucht in "Alle Nachrichten" sowie Papierkorb und Spam und holt die passenden Mails - nur
 * lesend. Papierkorb und Spam gehoeren dazu, weil dort auch Kundenantworten landen und eine
 * Abmeldung auch dann gilt. Zeigt Gmail einen der beiden Ordner nicht per IMAP, steht er in `ohneOrdner`.
 *
 * @param {object} zugang  { benutzer, passwort }
 * @param {string[]} suchen  Gmail-Suchen
 * @param {object} [o]
 * @param {(kopf: Buffer) => boolean} [o.auswahl]  entscheidet am Mailkopf, ob der Rumpf geholt wird
 * @param {number} [o.maxBytes]  so viel je Mail - die Anhaenge einer Unzustellbar-Meldung braucht niemand
 * @returns {Promise<{ nachrichten: {id: string, suche: number, roh: Buffer}[], ohneOrdner: string[] }>}
 */
export async function nachrichtenNurLesend(zugang, suchen, { auswahl = () => true, maxBytes = 300_000, host = 'imap.gmail.com', port = 993, verbinden, zeitLimitMs = 120_000 } = {}) {
  const v = await verbinde({ host, port, verbinden, zeitLimitMs });
  try {
    await anmelden(v, zugang);
    const liste = pruefe(await v.befehl('LIST "" "*"'), 'LIST').zeilen;
    const ohneOrdner = [];
    const nachrichten = [];
    const gesehen = new Set();
    for (const kennzeichen of ['\\All', '\\Trash', '\\Junk']) {
      const ordner = ordnerMitKennzeichen(liste, kennzeichen);
      if (!ordner) {
        if (kennzeichen === '\\All') throw new ImapFehler('IMAP: Ordner „Alle Nachrichten“ nicht gefunden');
        ohneOrdner.push(kennzeichen.slice(1));
        continue;
      }
      pruefe(await v.befehl(`EXAMINE ${imapText(ordner)}`), 'EXAMINE');
      for (const [suche, text] of suchen.entries()) {
        const uids = suchErgebnis(pruefe(await v.befehl(`UID SEARCH X-GM-RAW ${imapText(text)}`), 'SEARCH').zeilen);
        const passend = [];
        for (let i = 0; i < uids.length; i += 200) {
          const antwort = pruefe(await v.befehl(`UID FETCH ${uids.slice(i, i + 200).join(',')} (X-GM-MSGID BODY.PEEK[HEADER])`), 'FETCH');
          for (const e of antwort.eintraege) {
            const uid = /\bUID (\d+)/i.exec(e.aussen)?.[1];
            const [id] = nachrichtenIds([e.aussen]);
            if (uid && id && e.literale[0] && !gesehen.has(id) && auswahl(e.literale[0])) { gesehen.add(id); passend.push({ uid, id, suche }); }
          }
        }
        for (const p of passend) {
          const antwort = pruefe(await v.befehl(`UID FETCH ${p.uid} (X-GM-MSGID BODY.PEEK[]<0.${maxBytes}>)`), 'FETCH');
          const roh = antwort.eintraege.find(e => e.literale[0])?.literale[0];
          // Eine ausgewaehlte Mail, die nicht kommt, ist eine gescheiterte Suche - nicht "nichts gefunden".
          if (!roh) throw new ImapFehler('IMAP: gefundene Mail nicht lesbar');
          nachrichten.push({ id: p.id, suche: p.suche, roh });
        }
      }
    }
    return { nachrichten, ohneOrdner };
  } finally {
    await v.schliessen();
  }
}

/**
 * Arbeitet in einer nur lesenden Sitzung: `arbeit` bekommt suche(q) -> UIDs,
 * daten(uids) -> Kennungen und Labels, kopf(uid) und nachricht(uid) -> Bytes. Nur BODY.PEEK,
 * Gmail setzt dadurch kein \Seen. Oeffnet der Server das Postfach nicht nachweislich
 * schreibgeschuetzt ([READ-ONLY]), bricht die Sitzung ab, bevor etwas geholt wird.
 */
export async function mitNurLesen(zugang, arbeit, { host = 'imap.gmail.com', port = 993, verbinden, zeitLimitMs = 600_000 } = {}) {
  const v = await verbinde({ host, port, verbinden, zeitLimitMs });
  try {
    const geoeffnet = await oeffneNurLesend(v, zugang);
    if (!/\[READ-ONLY\]/i.test(geoeffnet.text)) throw new ImapFehler('IMAP: Postfach nicht schreibgeschützt geöffnet – Abbruch');
    const holeBytes = async (uid, teil) => {
      const a = pruefe(await v.befehl(`UID FETCH ${Number(uid)} (BODY.PEEK[${teil}])`), 'FETCH');
      if (a.literale.length) return a.literale[a.literale.length - 1];
      throw new ImapFehler(`IMAP: Nachricht ${Number(uid)} nicht geliefert`);
    };
    return await arbeit({
      suche: async q => suchErgebnis(pruefe(await v.befehl(`UID SEARCH X-GM-RAW ${imapText(q)}`), 'SEARCH').zeilen),
      daten: async (uids) => {
        const daten = [];
        for (let i = 0; i < uids.length; i += 200) {
          const teil = uids.slice(i, i + 200).map(Number).join(',');
          daten.push(...nachrichtenDaten(pruefe(await v.befehl(`UID FETCH ${teil} (X-GM-MSGID X-GM-THRID X-GM-LABELS INTERNALDATE)`), 'FETCH').zeilen));
        }
        return daten;
      },
      kopf: uid => holeBytes(uid, 'HEADER'),
      nachricht: uid => holeBytes(uid, ''),
    });
  } finally {
    await v.schliessen();
  }
}
