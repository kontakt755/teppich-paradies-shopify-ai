/**
 * Postfach-Abgleich vor jedem Nachfass-Lauf (Inhaber 03.11.2026): Wer auf die Nachfassmail mit
 * "Abmelden" antwortet oder dessen Adresse nicht zustellbar ist, kommt von selbst auf die
 * Stoppliste. Bis dahin musste ein Mensch die Antwort sehen und den Knopf druecken.
 *
 * Hier stehen nur die Regeln und das Lesen; eingetragen wird im Lauf
 * (scripts/dashboard-api.mjs, kundenNachfassenSenden), nicht im Trockenlauf.
 *
 * Eine Mail zaehlt nur, wenn sie nachweislich zu einer Nachfassmail gehoert: als Antwort ueber
 * die Message-ID aus dem Versandprotokoll oder ueber Absender plus Betreff; als Unzustellbar-
 * Meldung ueber die fehlgeschlagene Adresse plus Message-ID oder Betreff der Originalmail.
 *
 * Unsere eigene Mail enthaelt am Ende "Antworten Sie mit „Abmelden“" - und fast jede Antwort
 * zitiert sie. Darum zaehlt nur der eigene Text des Kunden (eigenerText()), nie das Zitat.
 *
 * Mailinhalte sind Daten: sie landen hoechstens als kurzer Auszug in der privaten Ablage und
 * loesen nie etwas anderes aus als den Stoppliste-Eintrag.
 */

import { nachrichtenNurLesend } from './imap-lesen.mjs';

/** So weit zurueck suchen - reicht auch nach einer laengeren Pause des Laufs. */
export const SUCH_TAGE = 60;
export const SUCHE_ANTWORTEN = `(abmelden OR abmeldung) -from:me newer_than:${SUCH_TAGE}d`;
export const SUCHE_UNZUSTELLBAR = `from:(mailer-daemon OR postmaster) newer_than:${SUCH_TAGE}d`;
/** Laenge des Auszugs fuer den Hinweis im Control Center. */
const AUSZUG_ZEICHEN = 300;

const normAdr = e => String(e ?? '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Mail lesen (kleinster MIME-Leser - wie smtp.mjs und imap-lesen.mjs ohne Fremdpaket)
// ---------------------------------------------------------------------------

function textAus(buf, zeichensatz) {
  try { return new TextDecoder(String(zeichensatz || 'utf-8').trim().toLowerCase()).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

function qpBytes(text, kopf = false) {
  const s = (kopf ? text.replace(/_/g, ' ') : text.replace(/=\r?\n/g, ''));
  const aus = [];
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '=' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) { aus.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else aus.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(aus);
}

/** "=?UTF-8?Q?...?=" in Kopfzeilen (RFC 2047). */
export function kopfText(wert) {
  return String(wert ?? '')
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (_, satz, art, inhalt) => textAus(art.toLowerCase() === 'b' ? Buffer.from(inhalt, 'base64') : qpBytes(inhalt, true), satz));
}

/** Kopf und Rumpf trennen; Fortsetzungszeilen zusammenziehen; Namen klein. */
function zerlege(buf) {
  const roh = buf.toString('latin1');
  const m = /\r?\n\r?\n/.exec(roh);
  const kopfRoh = m ? roh.slice(0, m.index) : roh;
  const rumpf = m ? roh.slice(m.index + m[0].length) : '';
  const kopf = new Map();
  for (const zeile of kopfRoh.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = zeile.indexOf(':');
    if (i <= 0) continue;
    const name = zeile.slice(0, i).trim().toLowerCase();
    if (!kopf.has(name)) kopf.set(name, []);
    kopf.get(name).push(zeile.slice(i + 1).trim());
  }
  return { kopf, rumpf };
}

function param(wert, name) {
  const m = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(String(wert ?? ''));
  return m ? (m[1] ?? m[2]) : null;
}

function sammleTeile(buf, teile, tiefe = 0) {
  const { kopf, rumpf } = zerlege(buf);
  const ct = kopf.get('content-type')?.[0] || 'text/plain';
  const typ = ct.split(';')[0].trim().toLowerCase();
  if (typ.startsWith('multipart/') && tiefe < 6) {
    const grenze = param(ct, 'boundary');
    if (grenze) {
      const stuecke = `\n${rumpf}`.split(`--${grenze}`).slice(1);
      for (const st of stuecke) {
        if (st.startsWith('--')) break; // Schlussgrenze
        sammleTeile(Buffer.from(st.replace(/^[ \t]*\r?\n/, ''), 'latin1'), teile, tiefe + 1);
      }
      return;
    }
  }
  const verfahren = (kopf.get('content-transfer-encoding')?.[0] || '').toLowerCase();
  const inhalt = verfahren === 'base64' ? Buffer.from(rumpf.replace(/\s+/g, ''), 'base64')
    : verfahren === 'quoted-printable' ? qpBytes(rumpf)
      : Buffer.from(rumpf, 'latin1');
  const anhang = /^attachment\b/i.test(kopf.get('content-disposition')?.[0] || '');
  teile.push({ typ, anhang, text: textAus(inhalt, param(ct, 'charset')) });
}

function htmlZuText(html) {
  // Zitat-Container der gaengigen Mailprogramme: alles dahinter ist nicht der Text des Kunden.
  const ende = html.search(/<blockquote\b|class=["']?gmail_(?:quote|attr)|id=["']?(?:divRplyFwdMsg|appendonsend)|class=["']?(?:moz-cite-prefix|yahoo_quoted)|type=["']?cite/i);
  const zeichen = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '„', ldquo: '“', rdquo: '”', ndash: '–', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };
  return (ende >= 0 ? html.slice(0, ende) : html)
    .replace(/<(head|style|script)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>?/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (ganz, c) => {
      if (c[0] !== '#') return zeichen[c] ?? ganz;
      const code = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : Number(c.slice(1));
      return code <= 0x10ffff ? String.fromCodePoint(code) : ganz;
    });
}

/**
 * @param {Buffer} roh  die Mail, ggf. abgeschnitten (imap-lesen.mjs)
 * @returns {{ absender: string|null, betreff: string, verweise: string[], automatisch: boolean, text: string, teile: object[], kopf: Map }}
 */
export function leseMail(roh) {
  const teile = [];
  sammleTeile(roh, teile);
  const { kopf } = zerlege(roh);
  const von = kopfText(kopf.get('from')?.[0] || '');
  const absender = normAdr(/<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(von)?.[1] || /[^\s<>"',;]+@[^\s<>"',;]+/.exec(von)?.[0]) || null;
  const verweise = `${kopf.get('in-reply-to')?.join(' ') || ''} ${kopf.get('references')?.join(' ') || ''}`.match(/<[^<>\s]+>/g) || [];
  const auto = kopf.get('auto-submitted')?.[0] || '';
  const inhalt = teile.filter(t => !t.anhang);
  const plain = inhalt.find(t => t.typ === 'text/plain')?.text;
  const html = inhalt.find(t => t.typ === 'text/html')?.text;
  return {
    absender, betreff: kopfText(kopf.get('subject')?.[0] || '').trim(), verweise,
    automatisch: Boolean(auto) && !/^no\b/i.test(auto),
    text: (plain?.trim() ? plain : html ? htmlZuText(html) : '').replace(/\r\n/g, '\n'),
    teile, kopf,
  };
}

// ---------------------------------------------------------------------------
// "Abmelden" im eigenen Text
// ---------------------------------------------------------------------------

/** Unser eigener Satz aus der Vorlage - auch ungekennzeichnet zitiert und umbrochen. */
// Um das Wort jedes Zeichen ausser Buchstaben: Mailprogramme machen aus „Abmelden“ auch ?Abmelden? oder *Abmelden*.
const EIGENER_SATZ = /Antworten\s+Sie\s+(?:kurz\s+)?mit\s+[^\p{L}\d]{0,4}Abmelden[^\p{L}\d]{0,4}/giu;
const WORT_ABMELDEN = /(?<![\p{L}])abmeld(?:en|ung)(?![\p{L}])/iu;

function istEinleitung(zeilen, i) {
  const z = zeilen[i].trim();
  if (/^-{2,}\s*(?:urspr(?:ü|ue)ngliche nachricht|original message|weitergeleitete nachricht|forwarded message)/i.test(z)) return true;
  if (/^_{5,}$/.test(z)) return true;
  // Outlook: Block aus "Von:", "Gesendet:", "An:", "Betreff:" ohne ">"
  if (/^(?:von|from):\s/i.test(z) && zeilen.slice(i + 1, i + 5).some(x => /^\s*(?:gesendet|sent|datum|date|betreff|subject):\s/i.test(x))) return true;
  // "Am 2. Nov. 2026 um 09:30 schrieb Teppich Paradies <...>:" - Gmail bricht das auch um.
  // Mehrzeilig nur ab "Am"/"On" - sonst schluckte es die Zeile "Abmelden" direkt davor.
  for (const n of /^(?:am|on)\s/i.test(z) ? [1, 2, 3] : [1]) {
    const zusammen = zeilen.slice(i, i + n).map(x => x.trim()).join(' ');
    if (/(?:^|\s)(?:schrieb|geschrieben|wrote)\b.{0,160}:$/i.test(zusammen) && /\d|@/.test(zusammen) && zusammen.length < 300) return n;
  }
  return false;
}

/**
 * Der Text, den der Absender selbst geschrieben hat: ohne ">"-Zeilen, ohne Zitatblock, ohne
 * unseren eigenen Abmelde-Satz. Steht das Zitat oben und der Text darunter, bleibt der Text.
 */
export function eigenerText(text) {
  const zeilen = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const aus = [];
  for (let i = 0; i < zeilen.length; i += 1) {
    if (/^\s*>/.test(zeilen[i])) continue;
    const einleitung = zeilen[i].trim() ? istEinleitung(zeilen, i) : false;
    if (einleitung) {
      const spanne = einleitung === true ? 1 : einleitung;
      const danach = zeilen.slice(i + spanne).find(x => x.trim());
      // Folgen ">"-Zeilen, nur die Einleitung ueberspringen; sonst ist alles Weitere Zitat.
      if (danach === undefined || !/^\s*>/.test(danach)) break;
      i += spanne - 1;
      continue;
    }
    aus.push(zeilen[i]);
  }
  return aus.join('\n').replace(EIGENER_SATZ, ' ').trim();
}

const SIGNATUR = /^(?:--\s*$|(?:mit\s+)?(?:freundlich\w*|best\w*|herzlich\w*|lieb\w*|viele|schöne\w*)\s+gr(?:ü|ue)(?:ß|ss)\w*|mfg\b|lg\b|vg\b|gr(?:ü|ue)(?:ß|ss)\w*\b|gesendet\s+(?:von|mit|über)\b|von\s+meinem\s+(?:iphone|ipad|android|samsung|galaxy|smartphone|handy|mobil\w*|tablet)\b|sent\s+from\b|get\s+outlook\b)/i;
/** Hoeflichkeit zaehlt nicht als weiterer Text. */
const FUELLWORTE = new Set('abmelden abmeldung bitte danke dankeschön vielen dank hallo guten tag morgen abend moin sehr geehrte geehrter geehrtes damen und herren liebes liebe lieber team ich mich möchte moechte will mir mein meine von der dem den die das hiermit gern gerne sie uns wir ihnen'.split(' '));

/** Gruss vor dem Wort: "Viele Gruesse, bitte abmelden" ist eine Abmeldung. */
const GRUSSWORT = /^(?:mit|freundlich\w*|best\w*|herzlich\w*|viele|gr(?:ü|ue)(?:ß|ss)\w*|mfg|lg|vg)$/;

/**
 * Das Wort steht erst im Fuss: Nur eine Zeile, die aus nichts anderem besteht, ist eine Abmeldung.
 * "Newsletter abmelden" im Firmenfuss ist keine - sonst sperrte ein "Danke, ist angekommen".
 */
function abmeldungImFuss(text) {
  return text.split('\n').some(z => WORT_ABMELDEN.test(z)
    && (z.toLowerCase().match(/\p{L}+/gu) || []).every(w => FUELLWORTE.has(w) || GRUSSWORT.test(w)));
}

function ohneSignatur(text) {
  const zeilen = text.split('\n');
  const i = zeilen.findIndex(z => SIGNATUR.test(z.trim()));
  const rest = (i >= 0 ? zeilen.slice(0, i) : zeilen).join('\n').trim().split('\n');
  // Letzte Zeile nur aus ein bis drei gross geschriebenen Worten: der Name unter "Abmelden".
  if (rest.length > 1 && /^\p{Lu}[\p{L}.'-]*(?:\s+\p{Lu}[\p{L}.'-]*){0,2}$/u.test(rest.at(-1).trim()) && !WORT_ABMELDEN.test(rest.at(-1))) rest.pop();
  return rest.join('\n').trim();
}

/**
 * @returns {{ abmeldung: boolean, weitererText: string|null }} `weitererText`: was ein Mensch
 *   lesen sollte. Im Zweifel gilt die Abmeldung - lieber eine Nachfrage zu wenig als eine gegen
 *   den Wunsch des Kunden; der Text steht dann als Hinweis im Control Center.
 */
export function erkenneAbmeldung(text) {
  const eigen = eigenerText(text);
  if (!WORT_ABMELDEN.test(eigen)) return { abmeldung: false, weitererText: null };
  const kern = ohneSignatur(eigen);
  if (!WORT_ABMELDEN.test(kern) && !abmeldungImFuss(eigen)) return { abmeldung: false, weitererText: null };
  const worte = kern.toLowerCase().match(/\p{L}+/gu) || [];
  const weiter = worte.some(w => !FUELLWORTE.has(w));
  return { abmeldung: true, weitererText: weiter ? kern.replace(/\s+/g, ' ').trim().slice(0, AUSZUG_ZEICHEN) : null };
}

// ---------------------------------------------------------------------------
// Unzustellbar-Meldungen
// ---------------------------------------------------------------------------

/**
 * Nur diese Status sagen, dass es die Adresse nicht (mehr) gibt (RFC 3463): 5.1.1 Postfach,
 * 5.1.2 Domain, 5.1.3 Schreibweise, 5.1.6 umgezogen, 5.1.10 Domain nimmt keine Mail an.
 * Alles andere ist kein Beleg gegen die Adresse: 5.7.x (Richtlinie) kann an unserer eigenen
 * Einrichtung liegen, 5.2.2 ist ein volles Postfach. Das sperrt nicht, sondern wird Hinweis.
 */
const ADRESSFEHLER = new Set(['5.1.1', '5.1.2', '5.1.3', '5.1.6', '5.1.10']);
export const istAdressfehler = status => ADRESSFEHLER.has(status);

/**
 * Endgueltig fehlgeschlagene Adressen aus einer Unzustellbar-Meldung: Maschinenteil
 * (message/delivery-status: Action failed, Status 5.x.x), sonst X-Failed-Recipients bei
 * eindeutigem Betreff (Status dann aus dem Text). "delayed" und 4.x.x sind nur Verzoegerungen
 * und zaehlen nicht. Ob gesperrt wird, entscheidet danach istAdressfehler().
 * @returns {{ email: string, status: string|null }[]}
 */
export function fehlgeschlageneAdressen(mail) {
  if (!/mailer-daemon|postmaster/i.test(mail.absender || '')) return [];
  const aus = new Map();
  const dsn = mail.teile.filter(t => t.typ === 'message/delivery-status');
  for (const t of dsn) {
    for (const block of t.text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
      // Bei Weiterleitungen stehen zwei Adressen im Block; welche unsere ist, klaert der Abgleich.
      const adressen = [...block.matchAll(/^(?:final|original)-recipient:\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)>?/gim)].map(m => normAdr(m[1]));
      const aktion = /^action:\s*(\S+)/im.exec(block)?.[1];
      const status = /^status:\s*(\d\.\d+\.\d+)/im.exec(block)?.[1];
      if (/^failed$/i.test(aktion || '') && String(status || '').startsWith('5.')) for (const email of adressen) aus.set(email, { email, status });
    }
  }
  if (!dsn.length && /undeliver|delivery.*fail|fail.*deliver|unzustellbar|nicht zugestellt/i.test(mail.betreff) && !/delay|verz(?:ö|oe)ger/i.test(mail.betreff)) {
    // Nicht aus einer IP-Adresse lesen: "10.5.1.1" im Text ist kein Status 5.1.1.
    const status = /(?<![\d.])5\.\d{1,3}\.\d{1,3}(?![\d]|\.\d)/.exec(mail.teile.filter(t => t.typ === 'text/plain').map(t => t.text).join('\n'))?.[0] || null;
    for (const k of mail.kopf.get('x-failed-recipients') || []) {
      for (const a of k.split(',')) if (a.includes('@')) aus.set(normAdr(a), { email: normAdr(a), status });
    }
  }
  return [...aus.values()];
}

// ---------------------------------------------------------------------------
// Abgleich gegen das Versandprotokoll
// ---------------------------------------------------------------------------

const ohneAntwortPraefix = b => String(b ?? '').replace(/^(?:\s*(?:re|aw|antw|sv)\s*(?:\[\d+\])?\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim();
const betreffGleich = (a, b) => Boolean(a) && ohneAntwortPraefix(a).toLowerCase() === ohneAntwortPraefix(b).toLowerCase();

/** Nur Mails, die wirklich rausgingen: ein Fehlversuch hat keine Antwort. */
function versandIndex(sendungen = []) {
  const nachId = new Map();
  const nachAdresse = new Map();
  for (const s of sendungen) {
    if (!s || s.status === 'fehler' || !s.an) continue;
    if (s.messageId) { if (!nachId.has(s.messageId)) nachId.set(s.messageId, s); }
    const a = normAdr(s.an);
    if (!nachAdresse.has(a)) nachAdresse.set(a, []);
    nachAdresse.get(a).push(s);
  }
  return { nachId, nachAdresse };
}

/** Zu welcher Nachfassmail gehoert diese Antwort? Message-ID zuerst, sonst Absender plus Betreff. */
function sendungZurAntwort(mail, index) {
  for (const v of mail.verweise) if (index.nachId.has(v)) return index.nachId.get(v);
  return (index.nachAdresse.get(mail.absender) || []).find(s => betreffGleich(mail.betreff, s.betreff)) || null;
}

function istUnzustellbarAbsender(absender) {
  return /mailer-daemon|postmaster/i.test(absender || '');
}

/** Gehoert die Meldung zu einer Nachfassmail an diese Adresse? Sucht in der mitgeschickten Originalmail. */
function sendungZurMeldung(mail, email, index) {
  const an = index.nachAdresse.get(email) || [];
  for (const v of mail.verweise) { const s = index.nachId.get(v); if (s && normAdr(s.an) === email) return s; }
  const original = mail.teile.filter(t => t.typ === 'message/rfc822' || t.typ === 'text/rfc822-headers').map(t => t.text).join('\n');
  const betreffe = [...original.matchAll(/^subject:\s*((?:.*)(?:\r?\n[ \t].*)*)/gim)].map(m => kopfText(m[1].replace(/\r?\n[ \t]+/g, ' ')));
  return an.find(s => (s.messageId && original.includes(s.messageId)) || betreffe.some(b => betreffGleich(b, s.betreff))) || null;
}

/**
 * Wertet gelesene Mails aus - ohne Seiteneffekte.
 * @param {{id: string, suche?: number, roh: Buffer}[]} nachrichten
 * @param {object[]} sendungen  versand.json -> sendungen
 * @param {string[]} [eigene]   eigene Adressen: kommen nie auf die Stoppliste
 * @returns {{ abmeldungen: object[], unzustellbar: object[], hinweise: object[] }}
 */
export function werteAus(nachrichten, sendungen, eigene = []) {
  const index = versandIndex(sendungen);
  const meine = new Set(eigene.filter(Boolean).map(normAdr));
  const abmeldungen = new Map();
  const unzustellbar = new Map();
  const hinweise = [];
  for (const n of nachrichten) {
    const mail = leseMail(n.roh);
    if (istUnzustellbarAbsender(mail.absender)) {
      for (const { email, status } of fehlgeschlageneAdressen(mail)) {
        const s = meine.has(email) ? null : sendungZurMeldung(mail, email, index);
        if (!s) continue;
        if (!istAdressfehler(status)) {
          hinweise.push({ art: 'zustellung', mailId: n.id, email, orderId: s.orderId || null, orderName: s.orderName || null, auszug: `Zustellung abgelehnt (Status ${status || 'unbekannt'}). Nicht gesperrt, der Grund kann auch bei uns liegen. Bitte prüfen.` });
          continue;
        }
        if (!unzustellbar.has(email)) unzustellbar.set(email, { email, status, orderId: s.orderId || null, orderName: s.orderName || null, mailId: n.id });
      }
      continue;
    }
    if (mail.automatisch || !mail.absender || meine.has(mail.absender)) continue; // Abwesenheitsnotiz, eigene Mail
    const s = sendungZurAntwort(mail, index);
    if (!s) continue;
    // Schreibt jemand "Abmelden" nur in den selbst geaenderten Betreff, gilt das ebenso; unser eigener Betreff zaehlt nie.
    const eigenerBetreff = betreffGleich(mail.betreff, s.betreff) ? '' : ohneAntwortPraefix(mail.betreff);
    const { abmeldung, weitererText } = erkenneAbmeldung([eigenerBetreff, mail.text].filter(Boolean).join('\n'));
    if (!abmeldung) continue;
    // Gesperrt wird die angeschriebene Adresse und, falls er von woanders antwortet, auch der Absender.
    for (const email of new Set([normAdr(s.an), mail.absender])) {
      if (!meine.has(email) && !abmeldungen.has(email)) abmeldungen.set(email, { email, orderId: s.orderId || null, orderName: s.orderName || null, mailId: n.id });
    }
    if (weitererText) hinweise.push({ mailId: n.id, email: normAdr(s.an), orderId: s.orderId || null, orderName: s.orderName || null, auszug: weitererText });
  }
  return { abmeldungen: [...abmeldungen.values()], unzustellbar: [...unzustellbar.values()], hinweise };
}

/** Kopf-Vorauswahl, damit nur Antworten auf Nachfassmails und Unzustellbar-Meldungen ganz geholt werden. */
export function kopfPasst(kopf, sendungen) {
  const index = versandIndex(sendungen);
  const mail = leseMail(kopf);
  return istUnzustellbarAbsender(mail.absender) || Boolean(sendungZurAntwort(mail, index));
}

/**
 * Sucht und wertet aus. Wirft, wenn die Suche nicht geht - der Lauf verschickt dann nichts.
 * @param {object} p
 * @param {object} p.zugang  aus lesePostfach()
 * @param {object[]} p.sendungen
 * @param {Function} [p.lesen]  Tests: Attrappe statt IMAP
 */
export async function postfachAbgleich({ zugang, sendungen = [], lesen = nachrichtenNurLesend } = {}) {
  const { nachrichten, ohneOrdner = [] } = await lesen(zugang, [SUCHE_ANTWORTEN, SUCHE_UNZUSTELLBAR], { auswahl: kopf => kopfPasst(kopf, sendungen) });
  const r = werteAus(nachrichten, sendungen, [zugang.absender, zugang.benutzer, zugang.kopie]);
  return { geprueft: true, gelesen: nachrichten.length, ohneOrdner, ...r };
}
