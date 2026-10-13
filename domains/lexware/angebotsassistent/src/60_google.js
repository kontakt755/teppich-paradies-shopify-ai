/**
 * Google-Apps-Script-Schicht: Tabellen, Drive-Ablage, Lexware-Aufrufe, Menue.
 * Nur diese Datei benutzt Google-Dienste; alle Regeln stecken in den reinen
 * Funktionen (00–50) und sind mit Node getestet.
 *
 * Script-Eigenschaften (Projekteinstellungen -> Skripteigenschaften):
 *   LEXWARE_API_KEY   privater Lexware-API-Schluessel (nur ueber das Menue setzen)
 *   TP_ORDNER_ID      Drive-Ordner mit Artikel_aktuell.json und Ablage
 *   LEXWARE_BASIS_URL optional, Standard https://api.lexware.io
 */

var TP_BLATT = { kopf: 'Kopf', raeume: 'Räume', zusatz: 'Zusatz', vorschau: 'Vorschau', protokoll: 'Vorgänge', artikel: 'Artikel' };
var TP_ARTIKELDATEI = 'Artikel_aktuell.json';
var tpLetzteAnfrage = 0;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Angebote')
    .addItem('Vorschau berechnen', 'tpMenueVorschau')
    .addItem('Lexware-Entwurf erstellen …', 'tpMenueEntwurf')
    .addSeparator()
    .addItem('Offene Lexware-Entwürfe suchen', 'tpMenueOffeneEntwuerfe')
    .addItem('Artikel aus Lexware abrufen (nur lesen)', 'tpMenueArtikelAbrufen')
    .addItem('Lexware: Verbindung & Feldprüfung', 'tpMenueVerbindungTesten')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Beispiel laden')
      .addItem('Einfach (1 Raum)', 'tpBeispielEinfach')
      .addItem('Mit Verlegung (Aktion 649)', 'tpBeispielVerlegung')
      .addItem('Umfangreich (Vinyl, Berlin)', 'tpBeispielUmfangreich'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Einrichtung')
      .addItem('Tabellenblätter anlegen', 'tpMenueEinrichten')
      .addItem('Drive-Ordner festlegen', 'tpMenueOrdner')
      .addItem('Lexware-API-Schlüssel hinterlegen', 'tpMenueSchluessel'))
    .addToUi();
}

/* ---------- Einrichtung ---------- */

function tpMenueEinrichten() {
  var ss = SpreadsheetApp.getActive();
  var leer = tpVorgangZuTabellen({ raeume: [], zusatzpositionen: [] });
  // Vorhandene Eingaben nie ueberschreiben – nur leere Blaetter vorbereiten.
  [[TP_BLATT.kopf, [['Feld', 'Wert']].concat(leer.kopf)], [TP_BLATT.raeume, leer.raeume], [TP_BLATT.zusatz, leer.zusatz]].forEach(function (x) {
    var b = tpBlatt(x[0]);
    if (b.getLastRow() === 0) tpBlattFuellen(b, x[1]);
  });
  tpBlatt(TP_BLATT.vorschau);
  var prot = tpBlatt(TP_BLATT.protokoll);
  if (prot.getLastRow() === 0) prot.appendRow(['Zeit', 'Vorgangs-ID', 'Fingerabdruck', 'Status', 'Lexware-ID', 'Link', 'Netto', 'Brutto', 'Benutzer', 'Hinweis']);
  [TP_BLATT.kopf, TP_BLATT.raeume, TP_BLATT.zusatz, TP_BLATT.protokoll].forEach(function (n) { ss.getSheetByName(n).setFrozenRows(1); });
  SpreadsheetApp.getUi().alert('Tabellenblätter angelegt. Als Nächstes: Drive-Ordner festlegen und Artikel_aktuell.json dort ablegen.');
}

function tpMenueOrdner() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Drive-Ordner', 'Link oder ID des Ordners „TP Angebotsassistent“ (leer = neuen Ordner anlegen):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var t = a.getResponseText().trim();
  var id = (/[-\w]{25,}/.exec(t) || [])[0];
  var ordner = id ? DriveApp.getFolderById(id) : DriveApp.createFolder('TP Angebotsassistent');
  PropertiesService.getScriptProperties().setProperty('TP_ORDNER_ID', ordner.getId());
  ui.alert('Ordner gesetzt: ' + ordner.getName() + '\n' + ordner.getUrl());
}

function tpMenueSchluessel() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Lexware-API-Schlüssel', 'Schlüssel aus app.lexware.de/addons/public-api einfügen.\nEr wird nur in den Skripteigenschaften gespeichert, nicht in der Tabelle.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK || !a.getResponseText().trim()) return;
  PropertiesService.getScriptProperties().setProperty('LEXWARE_API_KEY', a.getResponseText().trim());
  ui.alert('Schlüssel gespeichert. Jetzt „Lexware: Verbindung & Feldprüfung“ ausführen.');
}

/* ---------- Tabellen ---------- */

function tpBlatt(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function tpBlattFuellen(blatt, zeilen) {
  blatt.clear();
  if (!zeilen.length) return;
  var breite = zeilen.reduce(function (m, z) { return Math.max(m, z.length); }, 0);
  var gleich = zeilen.map(function (z) { var k = z.slice(); while (k.length < breite) k.push(''); return k; });
  blatt.getRange(1, 1, gleich.length, breite).setValues(gleich);
}

function tpWerte(name) {
  var b = SpreadsheetApp.getActive().getSheetByName(name);
  return b && b.getLastRow() ? b.getDataRange().getValues() : [];
}

function tpVorgangLesen() {
  var v = tpVorgangAusTabellen(tpWerte(TP_BLATT.kopf), tpWerte(TP_BLATT.raeume), tpWerte(TP_BLATT.zusatz));
  if (!v.vorgangId) throw new Error('Vorgangs-ID fehlt (Blatt „Kopf“)');
  return v;
}

function tpBeispielSchreiben(v) {
  var t = tpVorgangZuTabellen(v);
  tpBlattFuellen(tpBlatt(TP_BLATT.kopf), [['Feld', 'Wert']].concat(t.kopf));
  tpBlattFuellen(tpBlatt(TP_BLATT.raeume), t.raeume);
  tpBlattFuellen(tpBlatt(TP_BLATT.zusatz), t.zusatz);
  tpMenueVorschau();
}
function tpBeispielEinfach() { tpBeispielSchreiben(TP_BEISPIELE.einfach); }
function tpBeispielVerlegung() { tpBeispielSchreiben(TP_BEISPIELE.verlegung); }
function tpBeispielUmfangreich() { tpBeispielSchreiben(TP_BEISPIELE.umfangreich); }

/* ---------- Artikelstamm (Drive) ---------- */

function tpOrdner() {
  var id = PropertiesService.getScriptProperties().getProperty('TP_ORDNER_ID');
  if (!id) throw new Error('Drive-Ordner nicht festgelegt (Menü Einrichtung)');
  return DriveApp.getFolderById(id);
}

function tpArtikelstammLaden() {
  var dateien = tpOrdner().getFilesByName(TP_ARTIKELDATEI);
  if (!dateien.hasNext()) throw new Error(TP_ARTIKELDATEI + ' fehlt im Drive-Ordner – ablegen oder „Artikel aus Lexware abrufen“');
  var neueste = null;
  while (dateien.hasNext()) {
    var d = dateien.next();
    if (!neueste || d.getLastUpdated() > neueste.getLastUpdated()) neueste = d;
  }
  return tpArtikelstammAufbauen(JSON.parse(neueste.getBlob().getDataAsString('UTF-8')));
}

function tpMenueArtikelAbrufen() {
  var alle = [];
  for (var seite = 0; seite < 50; seite++) {
    var r = tpLexAnfrage('get', '/v1/articles?page=' + seite + '&size=250');
    if (r.status !== 200) throw new Error(tpLexFehlerText(r.status, r.text));
    alle = alle.concat(r.json.content || []);
    if (r.json.last !== false) break;
  }
  var heute = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  var ordner = tpOrdner();
  var alt = ordner.getFilesByName(TP_ARTIKELDATEI);
  while (alt.hasNext()) {
    var f = alt.next();
    f.setName('Artikel_' + Utilities.formatDate(f.getLastUpdated(), 'Europe/Berlin', 'yyyy-MM-dd_HHmm') + '.json');
  }
  var exportJson = { exportDate: heute, source: 'Lexware, lesender Artikelabruf (Apps Script)', count: alle.length, articles: alle };
  ordner.createFile(TP_ARTIKELDATEI, JSON.stringify(exportJson, null, 1), 'application/json');
  var stamm = tpArtikelstammAufbauen(exportJson);
  var zeilen = [['Art.-Nr.', 'Bezeichnung', 'Einheit', 'Netto', 'Brutto', 'Steuer %', 'Führend', 'Preisstatus', 'Hinweise', 'Lexware-ID']];
  stamm.artikel.forEach(function (a) {
    zeilen.push([a.nr || '', a.titel, a.einheit, a.netto, a.brutto, a.steuersatz, a.fuehrend, a.preisStatus, a.preisHinweise.join('; '), a.id]);
  });
  tpBlattFuellen(tpBlatt(TP_BLATT.artikel), zeilen);
  SpreadsheetApp.getUi().alert(alle.length + ' Artikel abgerufen, ' + stamm.artikel.length + ' verwendbar, ' + stamm.ausgeschlossen.length + ' ausgeschlossen (archiviert/AUSORTIERT).\nGespeichert als ' + TP_ARTIKELDATEI + ' (ältere Stände umbenannt).');
}

/* ---------- Vorschau ---------- */

function tpVorschauBerechnen() {
  var stamm = tpArtikelstammLaden();
  var vorgang = tpVorgangLesen();
  var erg = tpAngebotBerechnen(vorgang, stamm);
  var pk = tpPflichtkontrolle(vorgang, erg);
  var payload = null, payloadFehler = [];
  try {
    payload = tpLexwarePayload(vorgang, erg);
    payloadFehler = tpPayloadPruefen(payload);
  } catch (e) {
    payloadFehler = [e.message];
  }
  return { vorgang: vorgang, erg: erg, pk: pk, payload: payload, payloadFehler: payloadFehler, fingerabdruck: payload ? tpPayloadFingerabdruck(payload) : '' };
}

function tpMenueVorschau() {
  var r = tpVorschauBerechnen();
  tpVorschauSchreiben(r);
  SpreadsheetApp.getActive().getSheetByName(TP_BLATT.vorschau).activate();
}

function tpVorschauSchreiben(r) {
  var e = r.erg, z = [], farben = [];
  var freigabe = r.pk.freigabe && !r.payloadFehler.length;
  function zeile(werte, farbe) { z.push(werte); farben.push(farbe || null); }
  zeile(['Angebotsvorschau – Vorgang ' + e.vorgangId]);
  zeile(['Artikelbasis', e.artikelQuelle]);
  zeile(['Lexware-Entwurf möglich', freigabe ? 'JA' : 'NEIN'], freigabe ? '#d9ead3' : '#f4cccc');
  r.pk.gruende.concat(r.payloadFehler).forEach(function (g) { zeile(['', g], '#f4cccc'); });
  zeile(['Aktion 649 €', (e.aktion.angewendet ? 'angewendet' : e.aktion.gilt ? 'Bedingungen erfüllt' : 'nicht anwendbar') + ' – ' + e.aktion.gruende.join('; ')]);
  zeile(['']);
  zeile(['Pos.', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Einheit', 'EP netto', 'Gesamt netto', 'Optional', 'Preisabweichung', 'Beschreibung']);
  e.positionen.forEach(function (p) {
    var ab = p.abweichung ? 'Lexware ' + tpFormat(p.abweichung.lexware) + ' → ' + tpFormat(p.abweichung.angebot) + ' (' + p.abweichung.begruendung + ')' : '';
    zeile([p.pos, p.artikel.nr || '(ohne Nr.)', p.name, p.menge, p.einheit, p.preisNetto, p.gesamtNetto, p.optional ? 'optional' : '', ab, p.beschreibung], ab ? '#fff2cc' : (p.optional ? '#eeeeee' : null));
  });
  zeile(['']);
  zeile(['', '', 'Summe netto', '', '', '', e.summen.netto]);
  Object.keys(e.summen.jeSteuersatz).forEach(function (k) { zeile(['', '', 'USt ' + k + ' %', '', '', '', tpRunden2(e.summen.jeSteuersatz[k] * Number(k) / 100)]); });
  zeile(['', '', 'Summe brutto', '', '', '', e.summen.brutto]);
  if (e.summen.optionalNetto) zeile(['', '', 'Optionale Positionen (nicht in Summe)', '', '', '', e.summen.optionalNetto], '#eeeeee');
  zeile(['']);
  zeile(['Meldungen', 'Stufe', 'Bezug', 'Text']);
  var farbe = { fehler: '#f4cccc', konflikt: '#f4cccc', offen: '#fff2cc', hinweis: null };
  e.meldungen.forEach(function (m) { zeile(['', m.stufe, m.bezug, m.text], farbe[m.stufe]); });
  zeile(['']);
  zeile(['Pflichtkontrolle', 'Status', 'Art', 'Frage', 'Hinweis']);
  r.pk.punkte.forEach(function (p) {
    zeile(['', p.status, p.art, p.frage, p.hinweis], p.status === 'fehler' ? '#f4cccc' : p.status === 'offen' ? '#fff2cc' : null);
  });
  zeile(['']);
  zeile(['Schlusstext', e.texte.schluss.join('\n\n')]);
  zeile(['Fingerabdruck', r.fingerabdruck]);

  var blatt = tpBlatt(TP_BLATT.vorschau);
  tpBlattFuellen(blatt, z);
  farben.forEach(function (f, i) { if (f) blatt.getRange(i + 1, 1, 1, 10).setBackground(f); });
  blatt.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  blatt.setColumnWidth(3, 320);
  blatt.setColumnWidth(10, 420);
  blatt.getRange(1, 10, z.length, 1).setWrap(true);
}

/* ---------- Lexware-Zugriff ---------- */

function tpLexAnfrage(methode, pfad, body) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('LEXWARE_API_KEY');
  if (!key) throw new Error('Lexware-API-Schlüssel fehlt (Menü Einrichtung)');
  var basis = props.getProperty('LEXWARE_BASIS_URL') || TP_KONFIG.lexware.basisUrl;
  var optionen = {
    method: methode,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }
  };
  if (body !== undefined) {
    optionen.contentType = 'application/json';
    optionen.payload = JSON.stringify(body);
  }
  for (var versuch = 0; versuch < 2; versuch++) {
    var warten = TP_KONFIG.lexware.pauseMs - (Date.now() - tpLetzteAnfrage);
    if (warten > 0) Utilities.sleep(warten);
    tpLetzteAnfrage = Date.now();
    var antwort;
    try {
      antwort = UrlFetchApp.fetch(basis + pfad, optionen);
    } catch (err) {
      return { status: 0, text: String(err), json: null };
    }
    var status = antwort.getResponseCode();
    var text = antwort.getContentText();
    // 429: Lexware fuehrt den Aufruf nicht aus -> genau ein Wiederholungsversuch.
    if (status === 429 && versuch === 0) { Utilities.sleep(1500); continue; }
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    return { status: status, text: text, json: json };
  }
}

/* ---------- Vorgangsprotokoll (Dublettenschutz) ---------- */

function tpProtokollLesen() {
  var w = tpWerte(TP_BLATT.protokoll);
  return w.slice(1).map(function (z) {
    return { zeit: z[0], vorgangId: String(z[1]), fingerabdruck: String(z[2]), status: String(z[3]), lexwareId: String(z[4]) };
  });
}

function tpProtokollSchreiben(r, status, lexwareId, hinweis) {
  tpBlatt(TP_BLATT.protokoll).appendRow([
    new Date(), r.vorgang.vorgangId, r.fingerabdruck, status, lexwareId || '',
    lexwareId ? tpLexwareLink(lexwareId) : '', r.erg.summen.netto, r.erg.summen.brutto,
    Session.getActiveUser().getEmail(), hinweis || ''
  ]);
  SpreadsheetApp.flush();
}

function tpAblageSichern(r, lexwareId, gelesen) {
  try {
    var ordner = tpOrdner();
    var unter = ordner.getFoldersByName('Vorgänge');
    var ziel = unter.hasNext() ? unter.next() : ordner.createFolder('Vorgänge');
    ziel.createFile(r.vorgang.vorgangId + '_' + lexwareId + '.json', JSON.stringify({
      vorgang: r.vorgang, gesendet: r.payload, gespeichert: gelesen || null, summen: r.erg.summen, meldungen: r.erg.meldungen
    }, null, 1), 'application/json');
  } catch (e) { /* Ablage ist Komfort, kein Abbruchgrund */ }
}

/* ---------- Entwurf erstellen ---------- */

function tpMenueEntwurf() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) { ui.alert('Eine andere Erstellung läuft gerade. Bitte kurz warten.'); return; }
  try {
    var r = tpVorschauBerechnen();
    tpVorschauSchreiben(r);
    if (!r.pk.freigabe || r.payloadFehler.length) {
      ui.alert('Kein Lexware-Entwurf', 'Erst diese Punkte klären (siehe Blatt „Vorschau“):\n\n' + r.pk.gruende.concat(r.payloadFehler).join('\n'), ui.ButtonSet.OK);
      return;
    }
    var d = tpErstellungErlaubt(tpProtokollLesen(), r.vorgang.vorgangId, r.fingerabdruck);
    if (!d.erlaubt) { ui.alert('Kein neuer Entwurf', d.grund, ui.ButtonSet.OK); return; }
    var antwort = ui.alert('Lexware-Entwurf anlegen?',
      'Vorgang ' + r.vorgang.vorgangId + '\n' + r.erg.positionen.length + ' Positionen\nNetto ' + tpFormat(r.erg.summen.netto) + ' € / Brutto ' + tpFormat(r.erg.summen.brutto) + ' €\n\n' +
      'Der Entwurf wird NICHT finalisiert und NICHT versendet.', ui.ButtonSet.YES_NO);
    if (antwort !== ui.Button.YES) return;

    tpProtokollSchreiben(r, 'ERSTELLUNG_LAEUFT', '', '');
    var res = tpLexAnfrage('post', '/v1/quotations', r.payload);
    if (res.status !== 200 && res.status !== 201) {
      var status = tpLexErgebnisUnklar(res.status) ? 'UNKLAR' : 'FEHLER';
      var text = tpLexFehlerText(res.status, res.text);
      tpProtokollSchreiben(r, status, '', text);
      ui.alert(status === 'UNKLAR' ? 'Ergebnis unklar' : 'Lexware hat abgelehnt', text + (status === 'UNKLAR' ? '\n\nBitte „Offene Lexware-Entwürfe suchen“ ausführen, bevor erneut erstellt wird.' : ''), ui.ButtonSet.OK);
      return;
    }
    var id = res.json && res.json.id;
    tpProtokollSchreiben(r, 'ENTWURF', id, 'angelegt, Kontrolle folgt');

    var gelesen = tpLexAnfrage('get', '/v1/quotations/' + id);
    var abweichungen = gelesen.status === 200
      ? tpEntwurfVergleichen(r.payload, gelesen.json, r.erg.summen)
      : ['Rücklesen fehlgeschlagen: ' + tpLexFehlerText(gelesen.status, gelesen.text)];
    tpProtokollSchreiben(r, abweichungen.length ? 'KONTROLLE_ABWEICHUNG' : 'KONTROLLE_OK', id, abweichungen.join(' | '));
    tpAblageSichern(r, id, gelesen.json);
    ui.alert(abweichungen.length ? 'Entwurf angelegt – Abweichungen prüfen' : 'Entwurf angelegt und kontrolliert',
      (abweichungen.length ? abweichungen.join('\n') + '\n\n' : 'Gespeicherter Entwurf stimmt vollständig mit der Vorschau überein.\n\n') +
      'Bearbeiten in Lexware:\n' + tpLexwareLink(id), ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

function tpMenueOffeneEntwuerfe() {
  var r = tpLexAnfrage('get', '/v1/voucherlist?voucherType=quotation&voucherStatus=draft&size=15');
  if (r.status !== 200) throw new Error(tpLexFehlerText(r.status, r.text));
  var zeilen = (r.json.content || []).map(function (x) {
    return [x.voucherDate ? String(x.voucherDate).slice(0, 10) : '', x.contactName || '', x.totalAmount, x.updatedDate ? String(x.updatedDate).slice(0, 16) : '', tpLexwareLink(x.id)].join(' | ');
  });
  SpreadsheetApp.getUi().alert('Offene Angebotsentwürfe (bis zu 15)', zeilen.join('\n') || 'keine', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Verbindung pruefen und die verwendeten Feldnamen an einem vorhandenen Angebot belegen. */
function tpMenueVerbindungTesten() {
  var bericht = [];
  var p = tpLexAnfrage('get', '/v1/profile');
  bericht.push('Profil: ' + (p.status === 200 ? 'OK (' + (p.json.companyName || '') + ')' : tpLexFehlerText(p.status, p.text)));
  var l = tpLexAnfrage('get', '/v1/voucherlist?voucherType=quotation&voucherStatus=draft,open,accepted,rejected&size=5');
  if (l.status !== 200) {
    bericht.push('Angebotsliste: ' + tpLexFehlerText(l.status, l.text));
  } else if (!(l.json.content || []).length) {
    bericht.push('Angebotsliste: leer – Feldprüfung nicht möglich');
  } else {
    var q = tpLexAnfrage('get', '/v1/quotations/' + l.json.content[0].id);
    if (q.status !== 200) bericht.push('Angebot lesen: ' + tpLexFehlerText(q.status, q.text));
    else {
      var j = q.json, li = (j.lineItems || [])[0] || {};
      var felder = {
        'voucherDate': !!j.voucherDate, 'expirationDate': !!j.expirationDate, 'address': !!j.address,
        'taxConditions.taxType': !!(j.taxConditions && j.taxConditions.taxType),
        'totalPrice.totalNetAmount': j.totalPrice && j.totalPrice.totalNetAmount !== undefined,
        'lineItems[].type/name/quantity/unitName': !!(li.type && li.name && li.quantity !== undefined && li.unitName),
        'lineItems[].unitPrice.netAmount': !!(li.unitPrice && li.unitPrice.netAmount !== undefined),
        'lineItems[].unitPrice.taxRatePercentage': !!(li.unitPrice && li.unitPrice.taxRatePercentage !== undefined),
        'lineItems[].optional (Feld vorhanden)': (j.lineItems || []).some(function (x) { return Object.prototype.hasOwnProperty.call(x, 'optional'); })
      };
      Object.keys(felder).forEach(function (k) { bericht.push((felder[k] ? '✔ ' : '✘ ') + k); });
      bericht.push('Datumsformat Beispiel: ' + j.voucherDate);
    }
  }
  SpreadsheetApp.getUi().alert('Lexware-Verbindung', bericht.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
