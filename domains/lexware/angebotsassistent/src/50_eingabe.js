/**
 * Eingabe aus Google Sheets -> Vorgang (reine Funktionen, testbar).
 *
 * Tabellenblatt "Kopf":   Spalte A = Feld, Spalte B = Wert
 * Tabellenblatt "Räume":  Zeile 1 = Spaltentitel (siehe TP_SPALTEN_RAEUME), je Raum eine Zeile
 * Tabellenblatt "Zusatz": Zeile 1 = Spaltentitel (siehe TP_SPALTEN_ZUSATZ), je Position eine Zeile
 */

function tpSetze(obj, pfad, wert) {
  var teile = pfad.split('.');
  var o = obj;
  for (var i = 0; i < teile.length - 1; i++) {
    if (!o[teile[i]]) o[teile[i]] = {};
    o = o[teile[i]];
  }
  o[teile[teile.length - 1]] = wert;
}

function tpText(w) {
  if (w === null || w === undefined) return '';
  if (w instanceof Date) return tpDatumText(w); // lokales Datum (Europe/Berlin), nicht UTC
  return String(w).trim();
}

function tpDatumText(w) {
  if (w instanceof Date) {
    return w.getFullYear() + '-' + ('0' + (w.getMonth() + 1)).slice(-2) + '-' + ('0' + w.getDate()).slice(-2);
  }
  var t = tpText(w);
  var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return t;
}

/** [Feldtitel, Pfad, Typ] */
var TP_FELDER_KOPF = [
  ['Vorgangs-ID', 'vorgangId', 'text'],
  ['Angebotsdatum', 'datum', 'datum'],
  ['Kundentyp (privat/gewerbe)', 'kunde.kundentyp', 'klein'],
  ['Lexware-Kontakt-ID', 'kunde.contactId', 'text'],
  ['Name', 'kunde.name', 'text'],
  ['Straße', 'kunde.strasse', 'text'],
  ['PLZ', 'kunde.plz', 'text'],
  ['Ort', 'kunde.ort', 'text'],
  ['Telefon', 'kunde.telefon', 'text'],
  ['E-Mail', 'kunde.email', 'text'],
  ['BV / Baustelle', 'baustelle.ort', 'text'],
  ['Entfernung km', 'baustelle.entfernungKm', 'zahl'],
  ['Fahrzone (nah/berlin/weiter)', 'baustelle.fahrzone', 'klein'],
  ['Anzahl Fahrten', 'fahrten.anzahl', 'zahl'],
  ['Fahrt: abweichender Preis netto', 'fahrten.preisNetto', 'zahl'],
  ['Fahrt: Begründung', 'fahrten.begruendung', 'text'],
  ['MG-010: abweichender Preis netto', 'materialReinigung.preisNetto', 'zahl'],
  ['MG-010: Begründung', 'materialReinigung.begruendung', 'text'],
  ['MG-010 weglassen (ja)', 'materialReinigung.weglassen', 'ja'],
  ['Aktion 649 (auto/aus)', 'aktion649', 'klein'],
  ['Grobe Erstkalkulation (ja)', 'erstkalkulation', 'ja'],
  ['Malerhinweis (ja)', 'maler', 'ja'],
  ['Untergrund ohne Arbeiten (ja)', 'untergrundOhneArbeiten', 'ja'],
  ['Keine Sockelleisten (ja)', 'keineSockelleisten', 'ja'],
  ['Gültigkeit Tage', 'gueltigkeitTage', 'zahl'],
  ['Einleitungstext', 'einleitung', 'text'],
  ['Bestätigt: Kunde/Anschrift korrekt', 'bestaetigungen.kunde', 'ja'],
  ['Bestätigt: Adresse öffentlich geprüft', 'bestaetigungen.adresseOeffentlich', 'ja'],
  ['Bestätigt: Untergrund berücksichtigt', 'bestaetigungen.untergrund', 'ja'],
  ['Bestätigt: Fahrten realistisch', 'bestaetigungen.fahrten', 'ja']
];

function tpWertNachTyp(w, typ) {
  if (typ === 'zahl') return tpZahl(w);
  if (typ === 'ja') return tpJa(w);
  if (typ === 'datum') return tpDatumText(w);
  if (typ === 'klein') return tpText(w).toLowerCase();
  if (typ === 'ref') return tpRefAusText(w);
  if (typ === 'liste') return tpText(w) ? tpText(w).split(/[;|]/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
  return tpText(w);
}

/** [Spaltentitel, Pfad im Raum, Typ] */
var TP_SPALTEN_RAEUME = [
  ['Raum', 'name', 'text'],
  ['Länge m', 'laengeM', 'zahl'],
  ['Breite m', 'breiteM', 'zahl'],
  ['Netto m² (optional)', 'nettoM2', 'zahl'],
  ['Abzug m²', 'abzugM2', 'zahl'],
  ['Schiefer Raum (ja)', 'schief', 'ja'],
  ['Bodenart', 'bodenart', 'klein'],
  ['Belag Art.-Nr./ID', 'belag.ref', 'ref'],
  ['Belag: abweichender Preis netto', 'belag.preisNetto', 'zahl'],
  ['Belag: Begründung', 'belag.begruendung', 'text'],
  ['Belag rabattiert (ja)', 'belag.rabattiert', 'ja'],
  ['Rollenbreite m', 'rollenbreiteM', 'zahl'],
  ['Bestelllänge m (optional)', 'bestellLaengeM', 'zahl'],
  ['Bahnen (Breite x Länge; …)', 'bahnen', 'bahnen'],
  ['Paketinhalt m²', 'belag.paketInhaltM2', 'zahl'],
  ['Verschnitt %', 'belag.verschnittProzent', 'zahl'],
  ['Anteilig statt Pakete (ja)', 'belag.anteilig', 'ja'],
  ['Verlegeart', 'verlegeart', 'klein'],
  ['Wolle (ja)', 'wolle', 'ja'],
  ['Fixierung (optional)', 'fixierung', 'klein'],
  ['Dämmung Art.-Nr./ID', 'daemmung.ref', 'ref'],
  ['Rolleninhalt m²', 'daemmung.rolleninhaltM2', 'zahl'],
  ['Nur ganze Rollen (ja)', 'daemmung.nurGanzeRollen', 'ja'],
  ['Silikon umlaufend (ja)', 'silikon.umlaufend', 'ja'],
  ['Türbreiten m (0,8; 0,9)', 'silikon.tuerbreitenM', 'liste'],
  ['Silikon zusätzlich lfm', 'silikon.zusatzLfm', 'zahl'],
  ['Türzargen Stück', 'silikon.tuerzargen', 'zahl'],
  ['Silikonfarbe', 'silikon.farbe', 'text'],
  ['Sockelleiste lfm', 'sockelleiste.lfm', 'zahl'],
  ['Sockelleiste vorläufig (ja)', 'sockelleiste.vorlaeufig', 'ja'],
  ['Sockelleiste Material Art.-Nr./ID', 'sockelleiste.material.ref', 'ref'],
  ['Sockelleiste Verschnitt %', 'sockelleiste.verschnittProzent', 'zahl'],
  ['Sockelleiste Montage-Typ', 'sockelleiste.montage', 'klein'],
  ['Einschub (bestehend/neu)', 'einschub.art', 'klein'],
  ['Einschub lfm', 'einschub.lfm', 'zahl'],
  ['Einschub Silikon (ja)', 'einschub.silikon', 'ja'],
  ['Profil Art.-Nr./ID (leer = PR-010)', 'profil.ref', 'ref'],
  ['Profil Länge m', 'profil.laengeM', 'zahl'],
  ['Profil vorläufig (ja)', 'profil.vorlaeufig', 'ja'],
  ['Keine Profile (ja)', 'keineProfile', 'ja']
];

var TP_SPALTEN_ZUSATZ = [
  ['Art.-Nr./ID', 'ref', 'ref'],
  ['Menge', 'menge', 'zahl'],
  ['Kategorie (optional)', 'kategorie', 'klein'],
  ['Optional (ja)', 'optional', 'ja'],
  ['Abweichender Preis netto', 'preisNetto', 'zahl'],
  ['Begründung', 'begruendung', 'text'],
  ['Zusatztext', 'text', 'text']
];

function tpBahnenLesen(w) {
  var t = tpText(w);
  if (!t) return null;
  return t.split(/[;|]/).map(function (teil) {
    var m = /^\s*([\d.,]+)\s*[x×*]\s*([\d.,]+)\s*$/i.exec(teil);
    return m ? { breiteM: tpZahl(m[1]), laengeM: tpZahl(m[2]) } : { breiteM: null, laengeM: null };
  });
}

function tpZeilenLesen(zeilen, spalten) {
  if (!zeilen || zeilen.length < 2) return [];
  var kopf = zeilen[0].map(tpText);
  var idx = spalten.map(function (s) { return kopf.indexOf(s[0]); });
  var aus = [];
  for (var z = 1; z < zeilen.length; z++) {
    var zeile = zeilen[z];
    if (!zeile.some(function (w) { return tpText(w) !== ''; })) continue;
    var obj = {};
    spalten.forEach(function (s, i) {
      if (idx[i] < 0) return;
      var roh = zeile[idx[i]];
      if (tpText(roh) === '') return;
      var wert = s[2] === 'bahnen' ? tpBahnenLesen(roh) : tpWertNachTyp(roh, s[2]);
      tpSetze(obj, s[1], wert);
    });
    aus.push(obj);
  }
  return aus;
}

/** Tabellenwerte (getValues()) -> Vorgang. */
function tpVorgangAusTabellen(kopfZeilen, raumZeilen, zusatzZeilen) {
  var v = { raeume: [], zusatzpositionen: [] };
  var felder = {};
  TP_FELDER_KOPF.forEach(function (f) { felder[f[0]] = f; });
  (kopfZeilen || []).forEach(function (z) {
    var f = felder[tpText(z[0])];
    if (!f || tpText(z[1]) === '') return;
    tpSetze(v, f[1], tpWertNachTyp(z[1], f[2]));
  });
  v.raeume = tpZeilenLesen(raumZeilen, TP_SPALTEN_RAEUME).map(function (r) {
    if (r.profil) {
      r.profile = [{ ref: r.profil.ref, laengeM: r.profil.laengeM, vorlaeufig: r.profil.vorlaeufig }];
      delete r.profil;
    }
    return r;
  });
  v.zusatzpositionen = tpZeilenLesen(zusatzZeilen, TP_SPALTEN_ZUSATZ);
  return v;
}

/** Vorgang -> Tabellenwerte (fuer "Beispiel laden"). */
function tpVorgangZuTabellen(v) {
  function hole(obj, pfad) {
    return pfad.split('.').reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, obj);
  }
  function anzeigen(w, typ) {
    if (w === undefined || w === null) return '';
    if (typ === 'ja') return w ? 'ja' : '';
    if (typ === 'ref') return w.nr || w.id || '';
    if (typ === 'liste') return w.join('; ');
    if (typ === 'bahnen') return w.map(function (b) { return b.breiteM + ' x ' + b.laengeM; }).join('; ');
    return w;
  }
  var kopf = TP_FELDER_KOPF.map(function (f) { return [f[0], anzeigen(hole(v, f[1]), f[2])]; });
  var raeume = [TP_SPALTEN_RAEUME.map(function (s) { return s[0]; })].concat((v.raeume || []).map(function (r) {
    var rr = Object.assign({}, r, r.profile && r.profile[0] ? { profil: r.profile[0] } : {});
    return TP_SPALTEN_RAEUME.map(function (s) { return anzeigen(hole(rr, s[1]), s[2]); });
  }));
  var zusatz = [TP_SPALTEN_ZUSATZ.map(function (s) { return s[0]; })].concat((v.zusatzpositionen || []).map(function (z) {
    return TP_SPALTEN_ZUSATZ.map(function (s) { return anzeigen(hole(z, s[1]), s[2]); });
  }));
  return { kopf: kopf, raeume: raeume, zusatz: zusatz };
}
