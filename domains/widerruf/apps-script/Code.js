/**
 * Widerrufsfunktion nach § 356a BGB – Empfaenger fuer das Formular
 * „Vertrag widerrufen“ im Shop (sections/tp-widerruf.liquid).
 *
 * Laeuft als Web-App im Firmenkonto (Ausfuehren als: ich, Zugriff: jeder).
 * Pro Widerruf:
 *   1. Zeile im Protokoll-Sheet „Widerrufe Shop“ (Nachweis, auch wenn Mail scheitert)
 *   2. Eingangsbestaetigung an den Kunden: Inhalt, Datum, Uhrzeit (dauerhafter Datentraeger)
 *   3. Kopie an kontakt@, Antworten gehen direkt an den Kunden
 *
 * Keine Geheimnisse im Code: die Protokoll-ID steht in den Script-Properties.
 * Bereitstellen: siehe README.md in diesem Ordner.
 */

var KOPIE_AN = 'kontakt@teppich-paradies.net';
var ABSENDER_NAME = 'Teppich Paradies';
var ZEITZONE = 'Europe/Berlin';
var PROTOKOLL_NAME = 'Widerrufe Shop (Eingangsprotokoll)';

// Missbrauchsbremse: das Formular darf keine Mailschleuder werden.
var MAX_JE_ADRESSE_STUNDE = 3;
var MAX_GESAMT_STUNDE = 40;

var GRENZEN = { name: 120, bestellnummer: 40, email: 254, bestelldatum: 40, artikel: 2000 };

function doGet() {
  return json_({ ok: true, dienst: 'widerruf', hinweis: 'Nur POST aus dem Shop-Formular.' });
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    // Honigtopf: Menschen sehen das Feld nicht. Bots bekommen "ok", es passiert nichts.
    if (String(p.website || '').trim() !== '') return json_({ ok: true, ref: 'W-0' });

    var d = pruefen_(p);
    if (d.fehler) return json_({ ok: false, fehler: d.fehler });

    if (!bremse_(d.email)) {
      return json_({ ok: false, fehler: 'zu_viele', meldung: 'Zu viele Einsendungen in kurzer Zeit. Bitte schreiben Sie uns an ' + KOPIE_AN + '.' });
    }

    var jetzt = new Date();
    d.datum = Utilities.formatDate(jetzt, ZEITZONE, 'dd.MM.yyyy');
    d.uhrzeit = Utilities.formatDate(jetzt, ZEITZONE, 'HH:mm:ss');
    d.ref = 'W-' + Utilities.formatDate(jetzt, ZEITZONE, 'yyyyMMdd-HHmmss') + '-' + zufall_();

    var zeile = protokollieren_(d, jetzt);

    var kundeOk = true;
    try {
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

    // Kopie an uns immer, auch wenn die Kundenmail scheitert
    MailApp.sendEmail({
      to: KOPIE_AN,
      replyTo: d.email,
      name: 'Shop – Widerrufsfunktion',
      subject: 'Widerruf eingegangen: Bestellung ' + d.bestellnummer + ' (' + d.name + ')' + (kundeOk ? '' : ' – BESTÄTIGUNG AN KUNDEN FEHLGESCHLAGEN'),
      body: mailText_(d, true) + (kundeOk ? '' : '\n\nACHTUNG: Die Eingangsbestätigung an ' + d.email + ' konnte nicht zugestellt werden. Bitte den Kunden anders erreichen.'),
      htmlBody: mailHtml_(d, true)
    });

    if (zeile) zeile.getCell(1, 9).setValue(kundeOk ? 'gesendet' : 'FEHLER');

    return json_({ ok: true, ref: d.ref, datum: d.datum, uhrzeit: d.uhrzeit.slice(0, 5), mail: kundeOk });
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

function bremse_(email) {
  var cache = CacheService.getScriptCache();
  var schluessel = 'a:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase()));
  var stunde = 'g:' + Utilities.formatDate(new Date(), ZEITZONE, 'yyyyMMddHH');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var je = Number(cache.get(schluessel) || 0);
    var ges = Number(cache.get(stunde) || 0);
    if (je >= MAX_JE_ADRESSE_STUNDE || ges >= MAX_GESAMT_STUNDE) return false;
    cache.put(schluessel, String(je + 1), 3600);
    cache.put(stunde, String(ges + 1), 3600);
    return true;
  } finally {
    lock.releaseLock();
  }
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
