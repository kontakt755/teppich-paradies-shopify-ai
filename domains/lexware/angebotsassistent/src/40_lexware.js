/**
 * Lexware Office API – reine Funktionen (ohne Netz): Payload bauen, gespeicherten
 * Entwurf vergleichen, Fehlerantworten lesen, Dublettenschutz entscheiden.
 *
 * Stand der Feldnamen: Lexware Office Public API, Endpunkt /v1/quotations
 * (siehe domains/lexware/api-funktionsumfang.md). Das Menue
 * "Lexware: Verbindung & Feldprüfung" prueft die Felder vor dem ersten
 * Schreibzugriff gegen ein vorhandenes Angebot im Konto.
 *
 * Wichtig:
 * - POST /v1/quotations OHNE ?finalize=true legt einen Entwurf an. Finalisieren
 *   und Versenden macht dieses Programm nie.
 * - Angebote koennen per API nicht geaendert oder geloescht werden. Eine Korrektur
 *   ist ein neuer Entwurf; den alten loescht ein Mensch in Lexware.
 */

/** Payload fuer POST /v1/quotations. */
function tpLexwarePayload(vorgang, erg) {
  var K = TP_KONFIG;
  var k = vorgang.kunde || {};
  var datum = vorgang.datum;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datum || ''))) throw new Error('Angebotsdatum (JJJJ-MM-TT) fehlt');
  var adresse;
  if (k.contactId) {
    adresse = { contactId: k.contactId };
  } else {
    adresse = { name: k.name, street: k.strasse, zip: k.plz ? String(k.plz) : undefined, city: k.ort, countryCode: 'DE' };
  }
  var body = {
    voucherDate: tpLexDatum(datum),
    expirationDate: tpLexDatum(tpTagePlus(datum, Number(vorgang.gueltigkeitTage) || K.lexware.gueltigkeitTage)),
    address: adresse,
    lineItems: erg.positionen.map(function (p) {
      var li = {
        type: p.artikel.typ,
        id: p.artikel.id,
        name: p.name,
        description: p.beschreibung || undefined,
        quantity: p.menge,
        unitName: p.einheit,
        unitPrice: { currency: K.waehrung, netAmount: p.preisNetto, taxRatePercentage: p.steuersatz },
        discountPercentage: 0
      };
      if (p.optional) li.optional = true;
      return li;
    }),
    totalPrice: { currency: K.waehrung },
    taxConditions: { taxType: 'net' },
    title: K.lexware.titel,
    introduction: vorgang.einleitung || undefined,
    remark: erg.texte.schluss.length ? erg.texte.schluss.join('\n\n') : undefined
  };
  return JSON.parse(JSON.stringify(body));
}

/** Fingerabdruck des Angebotsinhalts (ohne Datum) fuer den Dublettenschutz. */
function tpPayloadFingerabdruck(payload) {
  return tpFingerabdruck({ address: payload.address, lineItems: payload.lineItems, remark: payload.remark || '', introduction: payload.introduction || '' });
}

/** Vor dem Senden: formale Pruefung der Payload gegen bekannte Lexware-Vorgaben. */
function tpPayloadPruefen(payload) {
  var fehler = [];
  if (!payload.address || (!payload.address.contactId && !(payload.address.name && payload.address.countryCode))) {
    fehler.push('Adresse: Lexware-Kontakt-ID oder Name + Land nötig');
  }
  if (!payload.lineItems.length) fehler.push('keine Positionen');
  if (payload.lineItems.length > 300) fehler.push('mehr als 300 Positionen');
  payload.lineItems.forEach(function (li, i) {
    var n = 'Pos. ' + (i + 1);
    if (!li.name || li.name.length > 255) fehler.push(n + ': Bezeichnung fehlt oder ist länger als 255 Zeichen');
    if (li.description && li.description.length > 2000) fehler.push(n + ': Beschreibung länger als 2000 Zeichen – kürzen');
    if (!(li.quantity > 0)) fehler.push(n + ': Menge fehlt');
    if (Math.abs(Math.round(li.quantity * 10000) - li.quantity * 10000) > 1e-6) fehler.push(n + ': Menge mit mehr als 4 Nachkommastellen');
    if (!tpHatZweiStellen(li.unitPrice.netAmount)) fehler.push(n + ': Netto-Einzelpreis mit mehr als 2 Nachkommastellen');
    if (!li.unitName) fehler.push(n + ': Einheit fehlt');
  });
  if (payload.expirationDate < payload.voucherDate) fehler.push('Gültig-bis liegt vor dem Angebotsdatum');
  return fehler;
}

/**
 * Gespeicherten Entwurf (GET /v1/quotations/{id}) mit dem Gesendeten und der
 * eigenen Berechnung vergleichen.
 * @return {Array<string>} Abweichungen (leer = Kontrolle bestanden)
 */
function tpEntwurfVergleichen(gesendet, gelesen, summen) {
  var ab = [];
  function norm(t) { return String(t || '').replace(/\r\n/g, '\n').trim(); }
  if (gelesen.voucherStatus && gelesen.voucherStatus !== 'draft') ab.push('Status ist „' + gelesen.voucherStatus + '“ statt Entwurf');
  if (gesendet.address.contactId && (gelesen.address || {}).contactId !== gesendet.address.contactId) ab.push('Kontakt-ID weicht ab');
  var g = gesendet.lineItems, l = gelesen.lineItems || [];
  if (g.length !== l.length) ab.push('Positionsanzahl: gesendet ' + g.length + ', gespeichert ' + l.length);
  for (var i = 0; i < Math.min(g.length, l.length); i++) {
    var a = g[i], b = l[i], n = 'Pos. ' + (i + 1) + ' (' + a.name + ')';
    if (b.id && a.id !== b.id) ab.push(n + ': Artikel-ID weicht ab');
    if (norm(a.name) !== norm(b.name)) ab.push(n + ': Bezeichnung weicht ab');
    if (norm(a.description) !== norm(b.description)) ab.push(n + ': Beschreibung weicht ab');
    if (Number(a.quantity) !== Number(b.quantity)) ab.push(n + ': Menge ' + a.quantity + ' ≠ ' + b.quantity);
    if (a.unitName !== b.unitName) ab.push(n + ': Einheit ' + a.unitName + ' ≠ ' + b.unitName);
    var bp = b.unitPrice || {};
    if (Number(a.unitPrice.netAmount) !== Number(bp.netAmount)) ab.push(n + ': Netto-Preis ' + a.unitPrice.netAmount + ' ≠ ' + bp.netAmount);
    if (Number(a.unitPrice.taxRatePercentage) !== Number(bp.taxRatePercentage)) ab.push(n + ': Steuersatz weicht ab');
    if (!!a.optional !== !!b.optional) ab.push(n + ': optional-Kennzeichen wurde nicht übernommen');
  }
  var t = gelesen.totalPrice || {};
  if (summen) {
    if (t.totalNetAmount !== undefined && Number(t.totalNetAmount) !== summen.netto) ab.push('Nettosumme Lexware ' + t.totalNetAmount + ' ≠ berechnet ' + summen.netto);
    if (t.totalTaxAmount !== undefined && Number(t.totalTaxAmount) !== summen.steuer) ab.push('Steuer Lexware ' + t.totalTaxAmount + ' ≠ berechnet ' + summen.steuer);
    if (t.totalGrossAmount !== undefined && Number(t.totalGrossAmount) !== summen.brutto) ab.push('Bruttosumme Lexware ' + t.totalGrossAmount + ' ≠ berechnet ' + summen.brutto);
  }
  if (norm(gesendet.remark) !== norm(gelesen.remark)) ab.push('Schlusstext weicht ab');
  if (String(gelesen.voucherDate || '').slice(0, 10) !== gesendet.voucherDate.slice(0, 10)) ab.push('Angebotsdatum weicht ab');
  return ab;
}

/** Fehlerantwort lesbar machen (altes und neues Lexware-Fehlerformat). */
function tpLexFehlerText(status, text) {
  var bedeutung = {
    400: 'Anfrage ungültig (Pflichtfeld/Format)',
    401: 'API-Schlüssel ungültig oder abgelaufen',
    402: 'Lexware-Tarif erlaubt diese Funktion nicht',
    403: 'keine Berechtigung (Scope des API-Schlüssels prüfen)',
    404: 'nicht gefunden',
    406: 'von Lexware abgelehnt (Validierung)',
    409: 'Konflikt (veraltete Version oder Status)',
    415: 'falscher Content-Type',
    429: 'zu viele Anfragen (max. 2 pro Sekunde)',
    500: 'Lexware-Serverfehler',
    503: 'Lexware vorübergehend nicht erreichbar'
  }[status] || 'unerwartete Antwort';
  var details = [];
  try {
    var j = JSON.parse(text);
    if (j.IssueList) j.IssueList.forEach(function (x) { details.push([x.source, x.i18nKey || x.type].filter(Boolean).join(': ')); });
    if (j.details) j.details.forEach(function (x) { details.push([x.field, x.message || x.violation].filter(Boolean).join(': ')); });
    if (j.message && !details.length) details.push(j.message);
  } catch (e) {
    if (text) details.push(String(text).slice(0, 300));
  }
  return 'HTTP ' + status + ' – ' + bedeutung + (details.length ? ': ' + details.join('; ') : '');
}

/** Ist ein Fehler moeglicherweise nach dem Anlegen passiert (Ergebnis unklar)? */
function tpLexErgebnisUnklar(status) {
  return status === 0 || status >= 500;
}

/**
 * Dublettenschutz: darf fuer diesen Vorgang ein Entwurf angelegt werden?
 * @param {Array} eintraege  Zeilen aus dem Vorgangsprotokoll [{vorgangId, fingerabdruck, status, lexwareId}]
 */
function tpErstellungErlaubt(eintraege, vorgangId, fingerabdruck) {
  // Das Protokoll ist nur fortlaufend ergaenzt; massgeblich ist der letzte Eintrag.
  // FEHLER (sicher abgelehnt) und GEKLAERT_KEIN_ENTWURF (von Hand geprueft) geben frei.
  var eigene = (eintraege || []).filter(function (e) { return e.vorgangId === vorgangId; });
  if (!eigene.length) return { erlaubt: true };
  var e = eigene[eigene.length - 1];
  if (e.status === 'ERSTELLUNG_LAEUFT' || e.status === 'UNKLAR') {
    return { erlaubt: false, grund: 'Letzter Versuch ohne eindeutiges Ergebnis (' + e.status + ') – erst in Lexware prüfen („Offene Lexware-Entwürfe suchen“). Ist kein Entwurf entstanden, im Blatt „Vorgänge“ eine Zeile mit Status GEKLAERT_KEIN_ENTWURF ergänzen.' };
  }
  if (e.status === 'ENTWURF' || e.status === 'KONTROLLE_OK' || e.status === 'KONTROLLE_ABWEICHUNG') {
    if (e.fingerabdruck === fingerabdruck) return { erlaubt: false, grund: 'Für diesen Vorgang mit identischem Inhalt existiert bereits der Entwurf ' + e.lexwareId + '.' };
    return { erlaubt: false, grund: 'Für diesen Vorgang existiert bereits Entwurf ' + e.lexwareId + ' mit anderem Inhalt. Änderung = neuer Entwurf: neue Vorgangs-ID (z. B. „' + vorgangId + '-v2“) verwenden und den alten Entwurf in Lexware löschen.' };
  }
  return { erlaubt: true };
}

/**
 * Feldpruefung fuer "Verbindung & Feldprüfung": sucht in gelesenen Angeboten
 * die erste echte Artikelposition (custom/material/service). Textzeilen
 * (type "text") haben keine Menge, Einheit und keinen Preis und werden
 * deshalb uebersprungen.
 * @param {Array<Object>} angebote  Antworten von GET /v1/quotations/{id}
 */
function tpFeldpruefungPositionen(angebote) {
  // Bevorzugt service/material (so schreibt der Assistent, mit Artikel-ID),
  // sonst eine freie custom-Zeile.
  var typen = {};
  var treffer = null, quelle = null, ersatz = null, ersatzQuelle = null;
  (angebote || []).forEach(function (q) {
    (q.lineItems || []).forEach(function (li) {
      typen[li.type || '(ohne Typ)'] = (typen[li.type || '(ohne Typ)'] || 0) + 1;
      if (!treffer && (li.type === 'service' || li.type === 'material')) { treffer = li; quelle = q; }
      if (!ersatz && li.type === 'custom') { ersatz = li; ersatzQuelle = q; }
    });
  });
  if (!treffer && ersatz) { treffer = ersatz; quelle = ersatzQuelle; }
  var li = treffer || {};
  var up = li.unitPrice || {};
  var felder = {
    'lineItems[].type': !!li.type,
    'lineItems[].name': !!li.name,
    'lineItems[].quantity': li.quantity !== undefined,
    'lineItems[].unitName': !!li.unitName,
    'lineItems[].unitPrice.netAmount': up.netAmount !== undefined,
    'lineItems[].unitPrice.taxRatePercentage': up.taxRatePercentage !== undefined,
    'lineItems[].id (Artikelbezug)': !!li.id
  };
  return {
    gefunden: !!treffer,
    angebotNr: quelle ? (quelle.voucherNumber || quelle.id) : null,
    positionstyp: treffer ? treffer.type : null,
    felder: felder,
    typen: typen,
    optionalFeld: (angebote || []).some(function (q) {
      return (q.lineItems || []).some(function (x) { return Object.prototype.hasOwnProperty.call(x, 'optional'); });
    })
  };
}

function tpLexwareLink(id) {
  return TP_KONFIG.lexware.appUrl + '/permalink/quotations/edit/' + id;
}
