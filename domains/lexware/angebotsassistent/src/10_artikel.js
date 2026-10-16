/**
 * Artikelstamm: liest den Lexware-Artikelexport (Artikel_aktuell.json oder
 * einen Live-Abruf von /v1/articles) und macht daraus eine pruefbare Preisbasis.
 *
 * - Archivierte Artikel und AUSORTIERT-Positionen werden ausgeschlossen.
 * - Jeder Preis traegt Netto, Brutto, Steuersatz, Einheit, fuehrenden Preis und Quelle.
 * - Preise werden nie geschaetzt; 0,00 EUR ist nur zulaessig, wenn die Konfiguration
 *   die Leistung ausdruecklich als kostenlos bestaetigt (z. B. Aktionsposition).
 */

function tpIstAusortiert(roh) {
  var titel = String(roh.title || '').trim();
  return /^AUSORTIERT/i.test(titel);
}

function tpArtikelNormalisieren(roh, quelle) {
  var p = roh.price || {};
  var netto = typeof p.netPrice === 'number' ? p.netPrice : null;
  var brutto = typeof p.grossPrice === 'number' ? p.grossPrice : null;
  var steuer = typeof p.taxRate === 'number' ? p.taxRate : null;
  var status = 'ok';
  var hinweise = [];
  if (netto === null || brutto === null || steuer === null) {
    status = 'fehlt';
    hinweise.push('Preisangaben unvollständig');
  } else if (netto === 0 && brutto === 0) {
    status = 'null';
    hinweise.push('Preis 0,00 €');
  } else {
    var erwartet = tpRunden2(netto * (1 + steuer / 100));
    if (Math.abs(erwartet - brutto) > 0.011) {
      status = 'inkonsistent';
      hinweise.push('Netto ' + tpFormat(netto) + ' × ' + steuer + ' % ergibt ' + tpFormat(erwartet) + ', hinterlegt brutto ' + tpFormat(brutto));
    }
  }
  if (steuer !== null && steuer !== TP_KONFIG.steuersatzStandard) {
    hinweise.push('Steuersatz ' + steuer + ' % statt ' + TP_KONFIG.steuersatzStandard + ' %');
  }
  return {
    id: roh.id,
    nr: roh.articleNumber ? String(roh.articleNumber).trim() : null,
    titel: String(roh.title || '').trim(),
    beschreibung: roh.description || '',
    typ: roh.type === 'SERVICE' ? 'service' : 'material',
    einheit: roh.unitName || '',
    netto: netto,
    brutto: brutto,
    steuersatz: steuer,
    fuehrend: p.leadingPrice || null,
    preisStatus: status,
    preisHinweise: hinweise,
    aktualisiert: roh.updatedDate || null,
    version: roh.version,
    quelle: quelle
  };
}

/**
 * @param {Object} exportJson  {exportDate, source, articles:[...]} oder Array von Lexware-Artikeln
 * @return {{quelle:string, artikel:Array, ausgeschlossen:Array, nachId:Object, nachNr:Object}}
 */
function tpArtikelstammAufbauen(exportJson) {
  var liste = Array.isArray(exportJson) ? exportJson : (exportJson.articles || []);
  var stand = Array.isArray(exportJson) ? 'unbekannt' : (exportJson.exportDate || 'unbekannt');
  var herkunft = Array.isArray(exportJson) ? 'Lexware-Abruf' : (exportJson.source || 'Lexware-Export');
  var quelle = herkunft + ' vom ' + stand;
  var stamm = { quelle: quelle, stand: stand, artikel: [], ausgeschlossen: [], nachId: {}, nachNr: {} };

  liste.forEach(function (roh) {
    var grund = null;
    if (roh.archived === true) grund = 'archiviert';
    else if (tpIstAusortiert(roh)) grund = 'AUSORTIERT';
    else if (roh.usable === false) grund = 'im Export als nicht verwendbar markiert';
    if (grund) {
      stamm.ausgeschlossen.push({ id: roh.id, nr: roh.articleNumber || null, titel: roh.title, grund: grund });
      return;
    }
    var a = tpArtikelNormalisieren(roh, quelle);
    stamm.artikel.push(a);
    stamm.nachId[a.id] = a;
    if (a.nr) {
      if (!stamm.nachNr[a.nr]) stamm.nachNr[a.nr] = [];
      stamm.nachNr[a.nr].push(a);
    }
  });
  return stamm;
}

/**
 * Artikel ueber {nr} oder {id} finden.
 * @return {{artikel:Object}|{fehler:string}}
 */
function tpArtikelFinden(stamm, ref) {
  if (!ref) return { fehler: 'kein Artikel angegeben' };
  if (typeof ref === 'string') ref = tpRefAusText(ref);
  if (ref.id) {
    var a = stamm.nachId[ref.id];
    if (a) return { artikel: a };
    var aus = stamm.ausgeschlossen.filter(function (x) { return x.id === ref.id; })[0];
    if (aus) return { fehler: 'Artikel „' + aus.titel + '“ ist ' + aus.grund + ' und darf nicht verwendet werden' };
    return { fehler: 'Artikel-ID ' + ref.id + (ref.titel ? ' („' + ref.titel + '“)' : '') + ' nicht im aktuellen Artikelstamm' };
  }
  if (ref.nr) {
    var treffer = stamm.nachNr[ref.nr] || [];
    if (treffer.length === 1) return { artikel: treffer[0] };
    if (treffer.length > 1) return { fehler: 'Artikelnummer ' + ref.nr + ' ist mehrfach vergeben – bitte per ID wählen' };
    var ausNr = stamm.ausgeschlossen.filter(function (x) { return x.nr === ref.nr; })[0];
    if (ausNr) return { fehler: 'Artikel ' + ref.nr + ' ist ' + ausNr.grund + ' und darf nicht verwendet werden' };
    return { fehler: 'Artikelnummer ' + ref.nr + ' nicht im aktuellen Artikelstamm' };
  }
  return { fehler: 'kein Artikel angegeben' };
}

/** "MG-010" -> {nr}, UUID -> {id}. */
function tpRefAusText(text) {
  var t = String(text || '').trim();
  if (!t) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { id: t.toLowerCase() };
  return { nr: t };
}

/** Zahl aus Artikelbeschreibung lesen, z. B. Paketinhalt oder Leistenlaenge. */
function tpZahlAusText(text, muster) {
  var m = muster.exec(String(text || ''));
  return m ? tpZahl(m[1]) : null;
}

function tpPaketinhaltAusArtikel(a) {
  return tpZahlAusText(a.beschreibung, /Paket(?:inhalt)?[^0-9\n]{0,20}(\d+(?:[.,]\d+)?)\s*m/i) ||
    tpZahlAusText(a.beschreibung, /Inhalt[^0-9\n]{0,20}(\d+(?:[.,]\d+)?)\s*m/i);
}

function tpRolleninhaltAusArtikel(a) {
  return tpZahlAusText(a.beschreibung + ' ' + a.titel, /Rolle[^0-9\n]{0,12}(\d+(?:[.,]\d+)?)\s*m²/i);
}

function tpLeistenlaengeAusArtikel(a) {
  return tpZahlAusText(a.beschreibung, /L(?:ä|ae)nge\s*(\d+(?:[.,]\d+)?)\s*m/i);
}

/** Kategorie aus der Artikelnummer ableiten (AB-, UG-, SL- …). */
function tpKategorieAusArtikel(a) {
  // Fahrten ohne Artikelnummer (z. B. Berlin) sonst als "zusatz" eingeordnet und doppelt berechnet
  var fa = TP_KONFIG.artikel;
  if (a.id && (a.id === fa.fahrtBerlin.id || a.id === fa.fahrtNah.id)) return 'anfahrt';
  if (/^an- und abfahrt/i.test(a.titel || '')) return 'anfahrt';
  if (!a.nr) return 'zusatz';
  var praefix = a.nr.split('-')[0].toUpperCase();
  return TP_KONFIG.praefixKategorie[praefix] || 'zusatz';
}
