/**
 * Widerrufsfunktion nach § 356a BGB – Empfaenger fuer das Formular
 * „Vertrag widerrufen“ im Shop (sections/tp-widerruf.liquid).
 *
 * Laeuft als Web-App im Firmenkonto (Ausfuehren als: ich, Zugriff: jeder).
 * Pro Widerruf:
 *   1. Zeile im Protokoll-Sheet „Widerrufe Shop“ (Nachweis, auch wenn Mail scheitert)
 *   2. Eingangsbestaetigung an den Kunden: Inhalt, Datum, Uhrzeit (dauerhafter Datentraeger)
 *   3. Kopie an kontakt@, Antworten gehen direkt an den Kunden
 *      (ueber der Stunden- oder Tagesgrenze statt Einzelkopien ein Sammelhinweis je Stunde)
 *
 * Keine Geheimnisse im Code: die Protokoll-ID steht in den Script-Properties.
 * Bereitstellen: siehe README.md in diesem Ordner.
 */

var KOPIE_AN = 'kontakt@teppich-paradies.net';
var ABSENDER_NAME = 'Teppich Paradies';
var ZEITZONE = 'Europe/Berlin';
var PROTOKOLL_NAME = 'Widerrufe Shop (Eingangsprotokoll)';

// Missbrauchsbremse: das Formular darf keine Mailschleuder werden. Ueber der
// Stunden- oder Tagesgrenze wird jede Einsendung weiter protokolliert (die
// Sheet-Zeile ist der Nachweis), aber es gehen keine Einzelmails mehr raus -
// weder an die eingegebene Adresse noch als Kopie an uns. Stattdessen kommt
// hoechstens ein Sammelhinweis je Stunde an kontakt@. So sperrt ein Angreifer
// keine echten Kunden aus und leert trotzdem weder Postfach noch Mail-Kontingent.
var MAX_JE_ADRESSE_STUNDE = 3;
var MAX_GESAMT_STUNDE = 40;
var MAX_GESAMT_TAG = 100;
// Das MailApp-Tageskontingent teilt sich das Firmenkonto mit anderen Skripten
// (u. a. den Terminerinnerungen der Auftrags-App). Vor jedem Senden pruefen:
// bleiben nicht mehr als so viele Mails uebrig, sendet das Formular nichts mehr.
var MAIL_RESERVE = 200;

var GRENZEN = { name: 120, bestellnummer: 40, email: 254, bestelldatum: 40, artikel: 2000 };

function doGet() {
  return json_({ ok: true, dienst: 'widerruf', hinweis: 'Nur POST aus dem Shop-Formular.' });
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var d = pruefen_(p);
    if (d.fehler) return json_({ ok: false, fehler: d.fehler });

    // Doppelt gesendet (Netzabbruch nach Verarbeitung, erneuter Klick): gleiche Antwort, keine zweite Mail
    var cache = CacheService.getScriptCache();
    var idSchluessel = /^[A-Za-z0-9-]{8,64}$/.test(String(p.id || '')) ? 'id:' + p.id : '';
    var frueher = idSchluessel && cache.get(idSchluessel);
    if (frueher) return ContentService.createTextOutput(frueher).setMimeType(ContentService.MimeType.JSON);

    // Honigtopf: Menschen sehen das Feld nicht. Fuellt es ein Bot (oder ein Autofill),
    // wird trotzdem protokolliert und intern gemeldet, nur ohne Mail an die Adresse.
    var verdacht = String(p.website || '').trim() !== '';
    var bremse = bremse_(d.email);
    var grenze = bremse.grenze;
    if (grenze === 'adresse') {
      return json_({ ok: false, fehler: 'zu_viele', meldung: 'Zu viele Einsendungen in kurzer Zeit. Bitte schreiben Sie uns an ' + KOPIE_AN + '.' });
    }
    // Einzelmails (Bestaetigung an den Kunden, Kopie an uns) nur innerhalb der Grenzen.
    var einzeln = grenze === 'ok';
    var kundeMailen = !verdacht && einzeln;

    var jetzt = new Date();
    d.datum = Utilities.formatDate(jetzt, ZEITZONE, 'dd.MM.yyyy');
    d.uhrzeit = Utilities.formatDate(jetzt, ZEITZONE, 'HH:mm:ss');
    d.ref = 'W-' + Utilities.formatDate(jetzt, ZEITZONE, 'yyyyMMdd-HHmmss') + '-' + zufall_();

    var zeile = protokollieren_(d, jetzt);

    var kontingent = kundeMailen ? kontingentFrei_() : true;
    var kundeOk = kundeMailen && kontingent;
    if (kundeOk) try {
      MailApp.sendEmail({
        to: d.email,
        replyTo: KOPIE_AN,
        name: ABSENDER_NAME,
        subject: 'Eingangsbestätigung Ihres Widerrufs – Bestellung ' + d.bestellnummer,
        body: mailText_(d, false),
        htmlBody: mailHtml_(d, false)
      });
    } catch (err) {
      kundeOk = false;
    }

    var grund = kundeOk ? '' : verdacht ? 'Verdacht auf Bot (Honigtopffeld gefüllt), keine Mail an die Adresse geschickt.'
      : grenze === 'stunde' ? 'Stundengrenze erreicht, keine Mail an die Adresse geschickt.'
      : grenze === 'tag' ? 'Tagesgrenze erreicht, keine Mail an die Adresse geschickt.'
      : !kontingent ? 'Mail-Kontingent des Kontos fast aufgebraucht (Reserve für andere Skripte), keine Mail an die Adresse geschickt.'
      : 'Die Eingangsbestätigung an ' + d.email + ' konnte nicht verschickt werden.';
    if (zeile) zeile.getCell(1, 9).setValue(kundeOk ? 'gesendet' : 'NICHT GESENDET: ' + grund);

    // Kopie an uns, auch wenn die Kundenmail scheitert - aber nur innerhalb der
    // Grenzen und solange das Kontingent reicht. Darueber steht der Widerruf nur im
    // Protokoll, und kontakt@ bekommt hoechstens einen Sammelhinweis je Stunde.
    // Scheitert eine Mail, ist der Widerruf trotzdem protokolliert - dem Kunden keinen Fehler melden.
    if (einzeln) {
      if (kontingentFrei_()) try {
        MailApp.sendEmail({
          to: KOPIE_AN,
          replyTo: d.email,
          name: 'Shop – Widerrufsfunktion',
          subject: 'Widerruf eingegangen: Bestellung ' + d.bestellnummer + ' (' + d.name + ')' + (kundeOk ? '' : ' – OHNE BESTÄTIGUNG AN KUNDEN'),
          body: mailText_(d, true) + (kundeOk ? '' : '\n\nACHTUNG: ' + grund + ' Bitte prüfen und den Kunden ggf. anders erreichen.'),
          htmlBody: mailHtml_(d, true)
        });
      } catch (err) {
        console.error('Kopie: ' + (err && err.stack || err));
      }
    } else if (bremse.sammel && kontingentFrei_()) {
      try {
        MailApp.sendEmail({
          to: KOPIE_AN,
          name: 'Shop – Widerrufsfunktion',
          subject: 'Widerrufsformular: ' + (grenze === 'tag' ? 'Tagesgrenze' : 'Stundengrenze') + ' erreicht – Einsendungen nur im Protokoll',
          body: sammelText_(grenze, zeile)
        });
      } catch (err) {
        console.error('Sammelhinweis: ' + (err && err.stack || err));
      }
    }

    var antwort = JSON.stringify({ ok: true, ref: d.ref, datum: d.datum, uhrzeit: d.uhrzeit.slice(0, 5), mail: kundeOk });
    if (idSchluessel) cache.put(idSchluessel, antwort, 21600);
    return ContentService.createTextOutput(antwort).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ ok: false, fehler: 'server' });
  }
}

function pruefen_(p) {
  var d = {};
  Object.keys(GRENZEN).forEach(function (k) {
    d[k] = String(p[k] || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  });
  if (String(p.bestaetigt || '') !== 'ja') return { fehler: 'nicht_bestaetigt' };
  if (d.name.length < 2) return { fehler: 'name' };
  if (!d.bestellnummer) return { fehler: 'bestellnummer' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return { fehler: 'email' };
  for (var k in GRENZEN) {
    if (d[k].length > GRENZEN[k]) return { fehler: 'zu_lang' };
  }
  // Zeilenumbrueche nur im Artikelfeld
  ['name', 'bestellnummer', 'email', 'bestelldatum'].forEach(function (k) { d[k] = d[k].replace(/\s+/g, ' '); });
  return d;
}

/**
 * { grenze, sammel }
 *   grenze: 'ok' | 'adresse' (Adresse gesperrt, abweisen) | 'stunde' | 'tag'
 *           (annehmen und protokollieren, aber keine Einzelmails)
 *   sammel: true nur fuer die erste Einsendung ueber einer Grenze in dieser Stunde -
 *           sie loest den einen Sammelhinweis an kontakt@ aus.
 */
function bremse_(email) {
  var cache = CacheService.getScriptCache();
  var schluessel = 'a:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase()));
  var jetzt = new Date();
  var stundeKennung = Utilities.formatDate(jetzt, ZEITZONE, 'yyyyMMddHH');
  var stunde = 'g:' + stundeKennung;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var je = Number(cache.get(schluessel) || 0);
    var ges = Number(cache.get(stunde) || 0);
    if (je >= MAX_JE_ADRESSE_STUNDE) return { grenze: 'adresse', sammel: false };
    cache.put(schluessel, String(je + 1), 3600);
    cache.put(stunde, String(ges + 1), 3600);
    var grenze = ges >= MAX_GESAMT_STUNDE ? 'stunde' : tagZaehlen_(jetzt) ? 'ok' : 'tag';
    var sammel = false;
    if (grenze !== 'ok' && !cache.get('s:' + stundeKennung)) {
      cache.put('s:' + stundeKennung, '1', 3600);
      sammel = true;
    }
    return { grenze: grenze, sammel: sammel };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Tageszaehler fuer alle angenommenen Einsendungen (Script-Properties, weil der Cache
 * hoechstens 6 Stunden haelt). Geschrieben wird nur unterhalb der Grenze - ein Angriff
 * erzeugt also hoechstens MAX_GESAMT_TAG Schreibzugriffe am Tag. Laeuft im Lock von bremse_.
 * @returns {boolean} true = noch innerhalb der Tagesgrenze (und gezaehlt)
 */
function tagZaehlen_(jetzt) {
  var props = PropertiesService.getScriptProperties();
  var heute = Utilities.formatDate(jetzt, ZEITZONE, 'yyyyMMdd');
  var stand = null;
  try { stand = JSON.parse(props.getProperty('TAGESZAEHLER') || 'null'); } catch (err) { stand = null; }
  var n = stand && stand.tag === heute ? Number(stand.n) || 0 : 0;
  if (n >= MAX_GESAMT_TAG) return false;
  props.setProperty('TAGESZAEHLER', JSON.stringify({ tag: heute, n: n + 1 }));
  return true;
}

/** Reicht das MailApp-Tageskontingent noch, ohne die Reserve fuer andere Skripte anzugreifen? */
function kontingentFrei_() {
  try {
    return MailApp.getRemainingDailyQuota() > MAIL_RESERVE;
  } catch (err) {
    // Abfrage gescheitert: senden versuchen - scheitert das Senden, ist der Widerruf trotzdem protokolliert.
    console.error('Kontingent: ' + (err && err.stack || err));
    return true;
  }
}

function sammelText_(grenze, zeile) {
  var url = '';
  try { url = zeile ? zeile.getSheet().getParent().getUrl() : ''; } catch (err) { url = ''; }
  return [
    'Am Widerrufsformular im Shop ist die ' + (grenze === 'tag' ? 'Tagesgrenze (' + MAX_GESAMT_TAG + ' Einsendungen)' : 'Stundengrenze (' + MAX_GESAMT_STUNDE + ' Einsendungen)') + ' erreicht.',
    '',
    'Weitere Einsendungen dieser Stunde werden nur noch im Protokoll erfasst – ohne Eingangsbestätigung an die eingegebene Adresse und ohne Einzelkopie an uns.',
    'Dieser Hinweis kommt höchstens einmal je Stunde.',
    '',
    'Bitte das Protokoll prüfen (Spalte „Bestätigung Kunde“: „NICHT GESENDET“) und echte Widerrufe von Hand bestätigen:',
    url || ('Tabelle „' + PROTOKOLL_NAME + '“ im Google Drive von ' + KOPIE_AN),
    '',
    'Häufen sich solche Hinweise, wird das Formular vermutlich missbraucht.'
  ].join('\n');
}

function protokollieren_(d, jetzt) {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('PROTOKOLL_ID');
    var ss;
    if (id) {
      ss = SpreadsheetApp.openById(id);
    } else {
      ss = SpreadsheetApp.create(PROTOKOLL_NAME);
      ss.getSheets()[0].appendRow(['Eingang', 'Vorgang', 'Name', 'Bestellnummer', 'E-Mail', 'Bestelldatum', 'Artikel', 'Kopie', 'Bestätigung Kunde']);
      ss.getSheets()[0].setFrozenRows(1);
      props.setProperty('PROTOKOLL_ID', ss.getId());
    }
    var blatt = ss.getSheets()[0];
    // Fuehrendes Apostroph: Eingaben wie "=..." nie als Formel auswerten
    var t = function (s) { return s ? "'" + s : ''; };
    blatt.appendRow([jetzt, d.ref, t(d.name), t(d.bestellnummer), t(d.email), t(d.bestelldatum), t(d.artikel), KOPIE_AN, 'offen']);
    return blatt.getRange(blatt.getLastRow(), 1, 1, 9);
  } catch (err) {
    console.error('Protokoll: ' + (err && err.stack || err));
    return null;
  }
}

function inhalt_(d) {
  return [
    ['Name', d.name],
    ['Bestellnummer', d.bestellnummer],
    ['E-Mail-Adresse', d.email],
    ['Bestelldatum', d.bestelldatum || '–'],
    ['Betroffene Artikel', d.artikel || 'gesamte Bestellung']
  ];
}

function mailText_(d, intern) {
  var z = [];
  if (intern) {
    z.push('Über die Widerrufsfunktion im Shop ist ein Widerruf eingegangen. Der Kunde hat eine automatische Eingangsbestätigung erhalten.');
  } else {
    z.push('Guten Tag ' + d.name + ',');
    z.push('');
    z.push('wir bestätigen den Eingang Ihrer Widerrufserklärung, die Sie über die Widerrufsfunktion in unserem Onlineshop abgegeben haben.');
  }
  z.push('');
  z.push('Eingegangen am: ' + d.datum + ' um ' + d.uhrzeit + ' Uhr');
  z.push('Vorgangsnummer: ' + d.ref);
  z.push('');
  z.push('Inhalt Ihrer Erklärung:');
  z.push('„Hiermit widerrufe ich den Vertrag über die folgende Bestellung.“');
  inhalt_(d).forEach(function (r) { z.push(r[0] + ': ' + r[1]); });
  if (!intern) {
    z.push('');
    z.push('Wie es weitergeht: Wir melden uns bei Ihnen mit den nächsten Schritten zur Rücksendung bzw. Rückzahlung. Bitte bewahren Sie diese E-Mail auf.');
    z.push('');
    z.push('Fragen? Antworten Sie einfach auf diese E-Mail oder rufen Sie uns an: 03301 573 37 20.');
    z.push('');
    z.push('Freundliche Grüße');
    z.push('Ihr Team von Teppich Paradies');
    z.push('');
    z.push('Teppich Paradies Oranienburg GmbH · Saarlandstraße 73–81 · 16515 Oranienburg · kontakt@teppich-paradies.net');
    z.push('Diese E-Mail wurde automatisch erstellt (Eingangsbestätigung nach § 356a BGB).');
  }
  return z.join('\n');
}

function mailHtml_(d, intern) {
  var e = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var zeilen = inhalt_(d).map(function (r) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap">' + e(r[0]) +
      '</td><td style="padding:4px 0;white-space:pre-wrap">' + e(r[1]) + '</td></tr>';
  }).join('');
  var h = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:600px">';
  if (intern) {
    h += '<p>Über die Widerrufsfunktion im Shop ist ein Widerruf eingegangen. Der Kunde hat eine automatische Eingangsbestätigung erhalten.</p>';
  } else {
    h += '<p>Guten Tag ' + e(d.name) + ',</p><p>wir bestätigen den Eingang Ihrer Widerrufserklärung, die Sie über die Widerrufsfunktion in unserem Onlineshop abgegeben haben.</p>';
  }
  h += '<p><strong>Eingegangen am: ' + e(d.datum) + ' um ' + e(d.uhrzeit) + ' Uhr</strong><br>Vorgangsnummer: ' + e(d.ref) + '</p>';
  h += '<p style="margin-bottom:4px">Inhalt Ihrer Erklärung:</p><p style="margin-top:0"><em>„Hiermit widerrufe ich den Vertrag über die folgende Bestellung.“</em></p>';
  h += '<table style="border-collapse:collapse;font-size:15px">' + zeilen + '</table>';
  if (!intern) {
    h += '<p>Wie es weitergeht: Wir melden uns bei Ihnen mit den nächsten Schritten zur Rücksendung bzw. Rückzahlung. Bitte bewahren Sie diese E-Mail auf.</p>';
    h += '<p>Fragen? Antworten Sie einfach auf diese E-Mail oder rufen Sie uns an: 03301 573 37 20.</p>';
    h += '<p>Freundliche Grüße<br>Ihr Team von Teppich Paradies</p>';
    h += '<p style="font-size:12px;color:#777">Teppich Paradies Oranienburg GmbH · Saarlandstraße 73–81 · 16515 Oranienburg · kontakt@teppich-paradies.net<br>Diese E-Mail wurde automatisch erstellt (Eingangsbestätigung nach § 356a BGB).</p>';
  }
  return h + '</div>';
}

function zufall_() {
  return Math.floor(Math.random() * 0x10000).toString(16).toUpperCase();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Im Editor ausfuehren: legt das Protokoll an und loest die Berechtigungsabfrage aus. Sendet nichts. */
function einrichten() {
  var d = { ref: 'W-EINRICHTUNG', name: '', bestellnummer: '', email: '', bestelldatum: '', artikel: '' };
  var r = protokollieren_(d, new Date());
  if (r) r.getSheet().deleteRow(r.getRow());
  console.log('Protokoll: ' + PropertiesService.getScriptProperties().getProperty('PROTOKOLL_ID') + ' · Mail-Kontingent heute: ' + MailApp.getRemainingDailyQuota());
}
