/*
  Laengen-Zuschnitt fuer Profile und Laeufer nach Mass
  (blocks/tp-laengen-zuschnitt.liquid).

  Abgerechnet wird wie beim Kettelservice: Variantenpreis je 0,01 laufendem
  Meter (1 cm), Menge = Laenge je Stueck x Stueckzahl in cm. Shopify rechnet
  Variantenpreis x Menge - der Preis hier ist nur die Vorschau davon.

  Laeufer (Block-Einstellung modus = laeufer): je Laeufer kommen die Einfassung
  der beiden Schnittkanten (Variante des Einfass-Produkts zur Breite des
  Laeufers, Bandfarbe als Property) und die Pauschale als eigene Zeilen
  derselben _Gruppe dazu.

  Profile mit Schrauben (Block-Einstellung schrauben_produkt): auf Wunsch kommt
  je Bestellung eine Schraubenzeile derselben _Gruppe dazu. Bedarf = Bohrungen
  je Profil (lochzahl) x Stueckzahl; verkauft wird in ganzen Packungen
  (schrauben_packung Stueck je Packung, Variantenpreis je Packung).
  Ausfuehrung aus dem Varianten-Metafeld service.schraube.

  Profile als ganze Stange (Block-Einstellung stangen): wie beim Lieferanten
  stueckweise in der Stangenlaenge der Variante (service.stange_cm),
  auf Wunsch zugeschnitten - dann hoechstens so lang wie die Stange. Abgerechnet
  wird gleich (Menge = Laenge x Stueckzahl in cm).

  Sperrgut (Block-Einstellung sperrgut_produkt): ist ein Stueck laenger als
  sperrgut_ab_cm, kommt der Zuschlag einmal je Warenkorb als Zeile derselben
  _Gruppe dazu; steht er schon im Warenkorb, nicht noch einmal.

  Der Rechenkern (TPLaengenZuschnitt.rechnen) ist rein und laeuft auch in den
  Tests (qa/tests/tp-laengen-zuschnitt.test.mjs); die Bedienung startet nur im
  Browser.
*/
(function (root) {
  'use strict';

  function ganzzahl(wert) {
    var s = String(wert == null ? '' : wert).trim();
    if (!/^\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }

  function euro(cent) {
    var c = Math.round(cent);
    var e = Math.floor(c / 100);
    var r = String(c % 100);
    if (r.length < 2) r = '0' + r;
    return String(e).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + r + ' €';
  }

  // 950 cm -> "9,50"
  function meter(cm) {
    var m = Math.floor(cm / 100);
    var r = String(cm % 100);
    if (r.length < 2) r = '0' + r;
    return m + ',' + r;
  }

  // Bohrungen je Profil nach dem Bohrbild des Lieferanten: randMm vom Ende
  // entfernt die erste und letzte Bohrung, dazwischen gleichmaessig mit einem
  // Abstand unter abstandMm (Lieferant G: 30 mm Rand, unter 160 mm). 100 cm ->
  // 940 mm / 160 = 5,9 -> 6 Abstaende -> 7 Bohrungen. 0 bei unbrauchbaren Werten.
  function lochzahl(laengeCm, randMm, abstandMm) {
    var l = Number(laengeCm) * 10;
    var rand = Number(randMm);
    var abstand = Number(abstandMm);
    if (!(l > 0) || !(rand >= 0) || !(abstand > 0)) return 0;
    var innen = l - 2 * rand;
    if (innen <= 0) return 1;
    return Math.floor(innen / abstand) + 2;
  }

  // Schrauben-Variante zur Profil-Variante (v.schraube == Ausfuehrung, ohne
  // Gross-/Kleinschreibung); null, wenn es keine passende gibt.
  function schraubeFuer(schrauben, v) {
    var art = v && v.schraube ? String(v.schraube).trim().toLowerCase() : '';
    if (!art || !schrauben) return null;
    return (schrauben.varianten || []).filter(function (s) {
      return s && s.price > 0 && String(s.art || '').trim().toLowerCase() === art;
    })[0] || null;
  }

  // Eingaben pruefen und rechnen. Gibt {ok, fehler, menge, summeCent,
  // meterpreisCent, altSummeCent, materialCent, zusatzCent, loecher,
  // schraubenStueck, schraubenPackungen, schraubenCent, sperrgut,
  // sperrgutCent} zurueck; fehler ist leer, solange nur etwas fehlt.
  // e.zusatzCent: Betrag je Stueck obendrauf (Laeufer: Einfassung +
  // Pauschale), ohne Streichpreis. e.schraube: {preisCent, randMm, abstandMm,
  // packung} - packung > 0: preisCent gilt je Packung mit so vielen Schrauben,
  // sonst je Schraube; ebenfalls ohne Streichpreis. e.sperrgut: {preisCent,
  // abCm, schonDa} - Zuschlag einmal, sobald ein Stueck laenger als abCm ist
  // (schonDa: steht schon im Warenkorb, dann 0). e.je: Wort fuer ein Stueck in
  // den Fehlertexten (Standard "Stück", Laeufer "Läufer").
  function rechnen(e) {
    var erg = { ok: false, fehler: '', menge: 0, summeCent: 0, meterpreisCent: 0, altSummeCent: 0, materialCent: 0, zusatzCent: 0, loecher: 0, schraubenStueck: 0, schraubenPackungen: 0, schraubenCent: 0, sperrgut: false, sperrgutCent: 0 };
    var laenge = ganzzahl(e.laenge);
    var anzahl = ganzzahl(e.anzahl);
    var preis = Number(e.preisCent) || 0;
    var je = e.je || 'Stück';
    if (!(preis > 0)) { erg.fehler = 'Diese Ausführung ist gerade nicht bestellbar.'; return erg; }
    if (e.laenge == null || String(e.laenge).trim() === '') return erg;
    if (laenge === null) { erg.fehler = 'Bitte die Länge in ganzen Zentimetern angeben.'; return erg; }
    if (laenge < e.minCm) { erg.fehler = 'Mindestens ' + e.minCm + ' cm je ' + je + '.'; return erg; }
    if (laenge > e.maxCm) { erg.fehler = 'Höchstens ' + e.maxCm + ' cm je ' + je + '.'; return erg; }
    if (anzahl === null || anzahl < 1) { erg.fehler = e.je ? 'Bitte die Anzahl angeben.' : 'Bitte die Stückzahl angeben.'; return erg; }
    if (anzahl > e.maxStueck) { erg.fehler = 'Höchstens ' + e.maxStueck + ' ' + je + ' je Bestellung – für mehr bitte kurz bei uns melden.'; return erg; }
    erg.ok = true;
    erg.laenge = laenge;
    erg.anzahl = anzahl;
    erg.menge = laenge * anzahl;
    erg.materialCent = preis * erg.menge;
    erg.zusatzCent = (Number(e.zusatzCent) || 0) * anzahl;
    if (e.schraube && e.schraube.preisCent > 0) {
      erg.loecher = lochzahl(laenge, e.schraube.randMm, e.schraube.abstandMm);
      erg.schraubenStueck = erg.loecher * anzahl;
      var packung = Number(e.schraube.packung) || 0;
      if (packung > 0) {
        erg.schraubenPackungen = Math.ceil(erg.schraubenStueck / packung);
        erg.schraubenCent = e.schraube.preisCent * erg.schraubenPackungen;
      } else {
        erg.schraubenCent = e.schraube.preisCent * erg.schraubenStueck;
      }
    }
    if (e.sperrgut && e.sperrgut.preisCent > 0 && Number(e.sperrgut.abCm) > 0 && laenge > Number(e.sperrgut.abCm)) {
      erg.sperrgut = true;
      if (!e.sperrgut.schonDa) erg.sperrgutCent = e.sperrgut.preisCent;
    }
    var obendrauf = erg.zusatzCent + erg.schraubenCent + erg.sperrgutCent;
    erg.summeCent = erg.materialCent + obendrauf;
    erg.meterpreisCent = preis * 100;
    var alt = Number(e.vergleichCent) || 0;
    if (alt > preis) erg.altSummeCent = alt * erg.menge + obendrauf;
    return erg;
  }

  // Warenkorbzeilen eines Profils: das Profil und - bei gewaehlten Schrauben -
  // die Schraubenzeile, bei Ueberlaenge der Sperrgut-Zuschlag, alle in
  // derselben _Gruppe. Schraube und Zuschlag sind Produkttyp "Service" und
  // gehoeren damit zur Gruppe (ohne Profil sperren sie den Checkout).
  // a.zuschnitt: "ganze Stange" / "nach Maß" (nur bei Stangenware),
  // a.packung: Schrauben je Packung (0 = je Schraube), a.sperrgut: Variante.
  function profilZeilen(a) {
    var p = eigenschaften(a.erg, a.bohrung, a.gruppe);
    if (a.zuschnitt) {
      delete p._Gruppe;
      p.Zuschnitt = a.zuschnitt;
      p._Gruppe = a.gruppe;
    }
    var zeilen = [{ id: a.varianteId, quantity: a.erg.menge, properties: p }];
    var bezug = a.produkt + (a.variantenTitel ? ' – ' + a.variantenTitel : '');
    if (a.schraube && a.erg.schraubenStueck > 0) {
      var sp = { 'Zu Treppenkante': bezug, 'Bohrungen': a.erg.anzahl + ' Stück × ' + a.erg.loecher + ' je ' + a.erg.laenge + ' cm' };
      if (a.packung > 0 && a.erg.schraubenPackungen > 0) sp.Packung = a.packung + ' Stück, ' + a.erg.schraubenStueck + ' benötigt';
      sp._Gruppe = a.gruppe;
      zeilen.push({ id: a.schraube.id, quantity: a.packung > 0 && a.erg.schraubenPackungen > 0 ? a.erg.schraubenPackungen : a.erg.schraubenStueck, properties: sp });
    }
    if (a.sperrgut && a.erg.sperrgutCent > 0) {
      zeilen.push({ id: a.sperrgut.id, quantity: 1, properties: { 'Zu Treppenkante': bezug, 'Grund': 'Stück länger als ' + a.sperrgut.ab_cm + ' cm', '_Gruppe': a.gruppe } });
    }
    return zeilen;
  }

  // Laengen zur gewaehlten Art: "stange" nimmt die Stangenlaenge der Variante,
  // "zuschnitt" die Eingabe bis hoechstens zur Stangenlaenge (ohne
  // Stangenlaenge bis maxCm). Gibt {laenge, maxCm} fuer rechnen zurueck.
  function laengeFuer(art, eingabe, stangeCm, maxCm) {
    var stange = Number(stangeCm) || 0;
    if (art === 'stange' && stange > 0) return { laenge: String(stange), maxCm: Math.max(Number(maxCm) || 0, stange) };
    return { laenge: eingabe, maxCm: stange > 0 ? Math.min(Number(maxCm) || stange, stange) : maxCm };
  }

  // Properties der Warenkorbzeile - dieselben Namen liest
  // snippets/tp-cart-gruppe.liquid ("Länge je Stück"). schluessel: "Bohrung"
  // (Profile, Standard) oder "Einfassung" (Laeufer).
  function eigenschaften(erg, ausfuehrung, gruppe, schluessel, bandfarbe) {
    var p = {
      'Länge je Stück': erg.laenge + ' cm',
      'Anzahl': erg.anzahl + ' Stück',
      'Gesamtlänge': meter(erg.menge) + ' m'
    };
    p[schluessel || 'Bohrung'] = ausfuehrung;
    if (bandfarbe) p.Bandfarbe = bandfarbe;
    p._Gruppe = gruppe;
    return p;
  }

  // Bandfarben einer Ausfuehrung aus dem JSON des Einfass-Produkts
  // ({"Baumwollband": ["Mohn", ...], "Juteband": ["Natur"]}); leer = ohne Farbe.
  function bandfarbenFuer(bandfarben, art) {
    var l = bandfarben && art ? bandfarben[art] : null;
    return Array.isArray(l) ? l.filter(Boolean) : [];
  }

  // Einfassungen, die zur Breite des Laeufers passen ("65 cm" == "65 cm").
  function einfassungenFuer(einfassungen, breite) {
    if (!breite) return [];
    return (einfassungen || []).filter(function (x) { return x && x.breite === breite; });
  }

  // Warenkorbzeilen eines Laeufers: Laeufer, Einfassung (fehlt bei "ohne"),
  // Pauschale - je Laeufer eine Einheit, alle in derselben _Gruppe. Die
  // Servicezeilen tragen "Zu Teppich" wie im Einfass-Konfigurator, damit
  // Warenkorb, Einkauf und interne Mail sie dem Laeufer zuordnen. Bewusst kein
  // "Maße" an der Pauschale: das liest die Masspruefung als Flaeche.
  function laeuferZeilen(a) {
    var band = a.einfassung ? a.bandfarbe || '' : '';
    var p = eigenschaften(a.erg, a.einfassung ? a.einfassung.art : OHNE, a.gruppe, 'Einfassung', band);
    var zeilen = [{ id: a.varianteId, quantity: a.erg.menge, properties: p }];
    var bezug = { 'Zu Teppich': a.produkt, 'Ausführung': a.variantenTitel || '' };
    if (a.einfassung) {
      var ep = Object.assign({}, bezug, { 'Einfassung': a.einfassung.art });
      if (band) ep.Bandfarbe = band;
      ep._Gruppe = a.gruppe;
      zeilen.push({ id: a.einfassung.id, quantity: a.erg.anzahl, properties: ep });
    }
    zeilen.push({ id: a.pauschale.id, quantity: a.erg.anzahl, properties: Object.assign({}, bezug, { 'Läufer': a.erg.anzahl + ' × ' + a.erg.laenge + ' cm', '_Gruppe': a.gruppe }) });
    return zeilen;
  }

  // Variante aus Horizons variant:update fuer dieses Produkt: ihre ID, oder
  // 'keine', wenn es die gewaehlte Kombination nicht gibt. Meldungen ohne
  // oder mit fremder Produkt-ID aendern nichts (bisher bleibt).
  function variantVonHorizon(e, produktId, bisher) {
    var det = e && e.detail;
    var pid = det && det.data ? det.data.productId : null;
    if (!pid || !produktId || String(pid) !== String(produktId)) return bisher;
    return det.resource && det.resource.id ? String(det.resource.id) : 'keine';
  }

  var OHNE = 'ohne Einfassung';

  root.TPLaengenZuschnitt = { rechnen: rechnen, laengeFuer: laengeFuer, eigenschaften: eigenschaften, einfassungenFuer: einfassungenFuer, bandfarbenFuer: bandfarbenFuer, laeuferZeilen: laeuferZeilen, profilZeilen: profilZeilen, lochzahl: lochzahl, schraubeFuer: schraubeFuer, variantVonHorizon: variantVonHorizon, euro: euro, meter: meter, OHNE: OHNE };

  if (typeof document === 'undefined') return;

  function init(el) {
    if (el.dataset.tpLzInit) return;
    var datenEl = el.querySelector('[data-tp-lz-daten]');
    if (!datenEl) return;
    var d;
    try { d = JSON.parse(datenEl.textContent); } catch (err) { return; }
    var varianten = (d.varianten || []).filter(Boolean);
    if (!varianten.length) return;
    el.dataset.tpLzInit = '1';

    var inLaenge = el.querySelector('[data-laenge]');
    var inAnzahl = el.querySelector('[data-anzahl]');
    var fehler = el.querySelector('[data-fehler]');
    var rechnung = el.querySelector('[data-rechnung]');
    var summe = el.querySelector('[data-summe]');
    var summeAlt = el.querySelector('[data-summe-alt]');
    var rechenzeile = el.querySelector('[data-rechenzeile]');
    var cta = el.querySelector('[data-cta]');
    var warenkorb = el.querySelector('[data-warenkorb]');
    var gewaehlt = null;
    var inFlight = false;
    var stand = null;

    // Laeufer: Einfassung je Breite (Auswahlliste) und Pauschale je Stueck.
    var laeufer = d.modus === 'laeufer';
    var auswahl = el.querySelector('[data-einfassung]');
    var farbFeld = el.querySelector('[data-bandfarbe-feld]');
    var farbAuswahl = el.querySelector('[data-bandfarbe]');
    var ohneHinweis = el.querySelector('[data-ohne-hinweis]');
    var artFarben = null;
    var einfassungen = (d.einfassungen || []).filter(Boolean);
    var pauschale = d.pauschale && d.pauschale.id && d.pauschale.price > 0 ? d.pauschale : null;
    var breiteAngeboten = null;

    // Profile: Schrauben auf Wunsch (Kaestchen nie vorbelegt).
    var schraubenFeld = el.querySelector('[data-schrauben-feld]');
    var schraubenWahl = el.querySelector('[data-schrauben]');
    var schraubenText = el.querySelector('[data-schrauben-text]');

    // Profile: ganze Stange oder Zuschnitt; Sperrgut-Zuschlag einmal je Warenkorb.
    var artFeld = el.querySelector('[data-art-feld]');
    var stangeText = el.querySelector('[data-stange-text]');
    var laengeFelder = el.querySelectorAll('[data-laenge-feld]');
    var grenzen = el.querySelector('[data-grenzen]');
    var sperrgut = !laeufer && d.sperrgut && d.sperrgut.id && d.sperrgut.price > 0 ? d.sperrgut : null;
    var sperrgutDa = false;

    function warenkorbLesen() {
      if (!sperrgut || typeof fetch !== 'function') return;
      fetch('/cart.js', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
          if (!c) return;
          var da = (c.items || []).some(function (it) { return String(it.variant_id) === String(sperrgut.id); });
          if (da !== sperrgutDa) { sperrgutDa = da; zeigen(); }
        })
        .catch(function () {});
    }

    function art(v) {
      if (!d.stangen || !v || !(Number(v.stange_cm) > 0)) return 'zuschnitt';
      var c = el.querySelector('input[name^="tp-lz-art-"]:checked');
      return c ? c.value : 'stange';
    }

    function grenzenText(a, v, maxCm) {
      if (!grenzen) return;
      if (a === 'stange') {
        grenzen.textContent = 'Ganze Stange mit ' + v.stange_cm + ' cm Länge, wie vom Hersteller geliefert. Auf Wunsch schneiden wir zu.';
        return;
      }
      var hilfe = grenzen.getAttribute('data-messhilfe') || '';
      grenzen.textContent = 'Zentimetergenau von ' + d.min_cm + ' bis ' + maxCm + ' cm je Stück' + (d.stangen ? ', in einem Stück aus einer Stange geschnitten.' : '.') + (hilfe ? ' ' + hilfe : '');
    }

    // Wie im Einfass-Konfigurator: Farbwahl meldet ihre Variante per
    // tp:farbe-wechsel, sonst gilt ?variant=. Eine fremde ID fuehrt zu keiner
    // Auswahl statt zu einer geratenen.
    function aktuelleVariante() {
      var ausUrl = new URLSearchParams(window.location.search).get('variant');
      var id = gewaehlt || ausUrl || String(d.selected_id || '');
      var v = varianten.filter(function (x) { return String(x.id) === String(id); })[0];
      if (v) return v;
      if (gewaehlt || ausUrl) return null;
      return varianten.filter(function (x) { return x.available; })[0] || null;
    }

    function bohrung() {
      var c = el.querySelector('input[name^="tp-lz-bohrung-"]:checked');
      if (c) return c.value;
      return (d.bohrungen || [])[0] || '';
    }

    // Auswahlliste der Einfassungen zur Breite der gewaehlten Variante neu
    // aufbauen; eine gewaehlte Art bleibt erhalten, solange es sie gibt.
    function einfassListe(v) {
      var breite = v ? v.breite : null;
      if (!auswahl || breite === breiteAngeboten) return;
      breiteAngeboten = breite;
      var vorher = auswahl.value;
      var passend = einfassungenFuer(einfassungen, breite);
      auswahl.textContent = '';
      var leer = document.createElement('option');
      leer.value = '';
      leer.textContent = 'Bitte wählen';
      auswahl.appendChild(leer);
      passend.forEach(function (x) {
        var o = document.createElement('option');
        o.value = String(x.id);
        o.textContent = x.art + ' (+ ' + euro(x.price) + ')';
        auswahl.appendChild(o);
      });
      var ohne = document.createElement('option');
      ohne.value = 'ohne';
      ohne.textContent = OHNE + ' – Schnittkanten offen';
      auswahl.appendChild(ohne);
      var art = vorher && vorher !== 'ohne' ? (einfassungen.filter(function (x) { return String(x.id) === vorher; })[0] || {}).art : null;
      var gleich = art ? passend.filter(function (x) { return x.art === art; })[0] : null;
      auswahl.value = gleich ? String(gleich.id) : (vorher === 'ohne' ? 'ohne' : '');
    }

    // Bandfarben zur gewaehlten Ausfuehrung: eine Farbe ist fest, mehrere zur Wahl.
    function farbListe(ef) {
      var farben = ef ? bandfarbenFuer(d.bandfarben, ef.art) : [];
      var schluessel = ef ? ef.art : null;
      if (!farbAuswahl || schluessel === artFarben) return farben;
      artFarben = schluessel;
      var vorher = farbAuswahl.value;
      farbAuswahl.textContent = '';
      if (farben.length > 1) {
        var leer = document.createElement('option');
        leer.value = '';
        leer.textContent = 'Bitte wählen';
        farbAuswahl.appendChild(leer);
      }
      farben.forEach(function (f) {
        var o = document.createElement('option');
        o.value = f;
        o.textContent = f;
        farbAuswahl.appendChild(o);
      });
      farbAuswahl.value = farben.indexOf(vorher) >= 0 ? vorher : (farben.length === 1 ? farben[0] : '');
      if (farbFeld) farbFeld.hidden = farben.length === 0;
      return farben;
    }

    // null = noch nichts gewaehlt, false = ohne Einfassung, sonst die Variante.
    function einfassung() {
      if (!auswahl || !auswahl.value) return null;
      if (auswahl.value === 'ohne') return false;
      return einfassungen.filter(function (x) { return String(x.id) === auswahl.value; })[0] || null;
    }

    function zeigen() {
      var v = aktuelleVariante();
      stand = null;
      var ef = null;
      var zusatz = 0;
      var band = '';
      var farbeFehlt = false;
      if (laeufer) {
        einfassListe(v);
        ef = einfassung();
        var farben = farbListe(ef);
        band = farbAuswahl && farben.length ? farbAuswahl.value : '';
        farbeFehlt = !!ef && farben.length > 0 && !band;
        if (ohneHinweis) ohneHinweis.hidden = ef !== false;
        zusatz = (ef ? ef.price : 0) + (pauschale ? pauschale.price : 0);
      }
      // Schrauben nur bei gebohrten Profilen mit passender Ausfuehrung.
      var sv = null;
      if (!laeufer && schraubenFeld && d.schrauben) {
        var gebohrt = !/ungebohrt/i.test(bohrung());
        sv = gebohrt ? schraubeFuer(d.schrauben, v) : null;
        schraubenFeld.hidden = !sv;
        if (!sv && schraubenWahl) schraubenWahl.checked = false;
      }
      var packung = d.schrauben ? Number(d.schrauben.packung) || 0 : 0;
      var schraube = sv && schraubenWahl && schraubenWahl.checked
        ? { preisCent: sv.price, randMm: d.schrauben.rand_mm, abstandMm: d.schrauben.lochabstand_mm, packung: packung }
        : null;
      // Ganze Stange oder Zuschnitt bis zur Stangenlaenge der Variante.
      var a = laeufer ? 'zuschnitt' : art(v);
      if (artFeld) artFeld.hidden = !(d.stangen && v && Number(v.stange_cm) > 0);
      if (stangeText) stangeText.textContent = v && Number(v.stange_cm) > 0 ? v.stange_cm + ' cm' : '';
      laengeFelder.forEach(function (f) { f.hidden = a === 'stange'; });
      var lg = laengeFuer(a, inLaenge.value, !laeufer && d.stangen && v ? v.stange_cm : 0, d.max_cm);
      inLaenge.max = String(lg.maxCm);
      grenzenText(a, v, lg.maxCm);
      var erg = rechnen({
        laenge: lg.laenge,
        anzahl: inAnzahl.value,
        preisCent: v && v.available && (!laeufer || pauschale) ? v.price : 0,
        vergleichCent: v ? v.compare_at_price : 0,
        zusatzCent: zusatz,
        schraube: schraube,
        sperrgut: sperrgut ? { preisCent: sperrgut.price, abCm: sperrgut.ab_cm, schonDa: sperrgutDa } : null,
        minCm: d.min_cm,
        maxCm: lg.maxCm,
        maxStueck: d.max_stueck,
        je: laeufer ? 'Läufer' : ''
      });
      fehler.textContent = erg.fehler;
      fehler.hidden = !erg.fehler;
      if (schraubenText) {
        var je = sv && erg.ok ? lochzahl(erg.laenge, d.schrauben.rand_mm, d.schrauben.lochabstand_mm) : 0;
        var bedarf = je * (erg.ok ? erg.anzahl : 0);
        schraubenText.textContent = !sv ? '' : packung > 0
          ? '(' + sv.art + ', Packung mit ' + packung + ' Stück à ' + euro(sv.price) + (bedarf ? '; Sie brauchen ' + bedarf + ' Stück = ' + Math.ceil(bedarf / packung) + ' ' + (Math.ceil(bedarf / packung) === 1 ? 'Packung' : 'Packungen') : '') + ')'
          : '(' + sv.art + (je ? ', ' + je + ' je Stück, zusammen ' + bedarf + ' Stück à ' + euro(sv.price) : ', ' + euro(sv.price) + ' je Schraube') + ')';
      }
      if (!erg.ok) {
        rechnung.hidden = true;
        cta.disabled = true;
        return;
      }
      stand = { erg: erg, variante: v, einfassung: ef, bandfarbe: band, schraube: schraube ? sv : null, art: a, packung: packung };
      summe.textContent = euro(erg.summeCent);
      summeAlt.textContent = erg.altSummeCent ? euro(erg.altSummeCent) : '';
      summeAlt.hidden = !erg.altSummeCent;
      var zeilen = [erg.anzahl + ' × ' + (a === 'stange' ? 'ganze Stange ' : '') + erg.laenge + ' cm = ' + meter(erg.menge) + ' m × ' + euro(erg.meterpreisCent) + '/m'];
      if (laeufer) {
        zeilen[0] += ' = ' + euro(erg.materialCent);
        if (ef) zeilen.push('Einfassung ' + ef.art + (band ? ' ' + band : '') + ': ' + erg.anzahl + ' × ' + euro(ef.price) + ' = ' + euro(ef.price * erg.anzahl));
        else if (ef === null) zeilen.push('Einfassung: bitte wählen');
        zeilen.push('Pauschale je Läufer: ' + erg.anzahl + ' × ' + euro(pauschale.price) + ' = ' + euro(pauschale.price * erg.anzahl));
      }
      if (erg.schraubenStueck || erg.sperrgut) zeilen[0] += ' = ' + euro(erg.materialCent);
      if (erg.schraubenStueck) {
        zeilen.push(erg.schraubenPackungen
          ? 'Schrauben ' + stand.schraube.art + ': ' + erg.schraubenStueck + ' Stück benötigt = ' + erg.schraubenPackungen + ' × Packung ' + packung + ' Stück à ' + euro(stand.schraube.price) + ' = ' + euro(erg.schraubenCent)
          : 'Schrauben ' + stand.schraube.art + ': ' + erg.anzahl + ' × ' + erg.loecher + ' = ' + erg.schraubenStueck + ' Stück × ' + euro(stand.schraube.price) + ' = ' + euro(erg.schraubenCent));
      }
      if (erg.sperrgut) {
        zeilen.push(erg.sperrgutCent ? 'Sperrgut-Versand (Stück über ' + sperrgut.ab_cm + ' cm): ' + euro(erg.sperrgutCent) : 'Sperrgut-Versand: steht schon im Warenkorb');
      }
      rechenzeile.textContent = zeilen.join('\n');
      rechnung.hidden = false;
      if (!inFlight) {
        cta.disabled = laeufer && (ef === null || farbeFehlt);
        cta.textContent = !cta.disabled ? 'In den Warenkorb' : (ef === null ? 'Bitte Einfassung wählen' : 'Bitte Bandfarbe wählen');
      }
    }

    function hinzufuegen() {
      if (inFlight || !stand) return;
      var gruppe = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      var zeile;
      if (laeufer) {
        if (stand.einfassung === null || !pauschale || cta.disabled) return;
        var zeilen = laeuferZeilen({
          erg: stand.erg, varianteId: stand.variante.id, variantenTitel: stand.variante.titel,
          produkt: d.produkt, einfassung: stand.einfassung || null, bandfarbe: stand.bandfarbe,
          pauschale: pauschale, gruppe: gruppe
        });
        // Shopify zeigt die zuletzt angelegte Zeile oben: umgekehrt senden, damit
        // der Laeufer vor Einfassung und Pauschale steht.
        zeile = { items: zeilen.slice().reverse() };
      } else {
        var b = bohrung();
        if (!b) return;
        var pz = profilZeilen({
          erg: stand.erg, varianteId: stand.variante.id, variantenTitel: stand.variante.titel,
          produkt: d.produkt, bohrung: b, schraube: stand.schraube, gruppe: gruppe,
          zuschnitt: d.stangen && Number(stand.variante.stange_cm) > 0 ? (stand.art === 'stange' ? 'ganze Stange' : 'nach Maß') : '',
          packung: stand.packung, sperrgut: sperrgut
        });
        // Wie beim Laeufer umgekehrt senden: das Profil steht dann oben.
        zeile = pz.length > 1 ? { items: pz.slice().reverse() } : pz[0];
      }
      inFlight = true;
      cta.disabled = true;
      cta.textContent = 'Wird hinzugefügt …';
      warenkorb.hidden = true;
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(zeile)
      })
        .then(function (r) { if (!r.ok) throw new Error('add'); return r.json(); })
        .then(function (item) {
          inFlight = false;
          if (sperrgut && stand && stand.erg.sperrgutCent) sperrgutDa = true;
          cta.textContent = 'Im Warenkorb';
          cta.classList.add('is-done');
          warenkorb.hidden = false;
          var stueck = zeile.items ? zeile.items.reduce(function (n, z) { return n + z.quantity; }, 0) : zeile.quantity;
          document.dispatchEvent(new CustomEvent('cart:update', {
            bubbles: true,
            detail: { resource: item, sourceId: el.id, data: { itemCount: stueck, source: 'product-form-component' } }
          }));
          var drawer = document.querySelector('cart-drawer-component');
          if (drawer && typeof drawer.open === 'function') drawer.open();
          setTimeout(function () { cta.classList.remove('is-done'); zeigen(); }, 3000);
        })
        .catch(function () {
          inFlight = false;
          cta.textContent = 'Nicht hinzugefügt – erneut versuchen';
          cta.classList.add('is-error');
          setTimeout(function () { cta.classList.remove('is-error'); zeigen(); }, 3000);
        });
    }

    [inLaenge, inAnzahl].forEach(function (i) { i.addEventListener('input', zeigen); });
    el.addEventListener('change', zeigen);
    cta.addEventListener('click', hinzufuegen);
    document.addEventListener('tp:farbe-wechsel', function (e) {
      gewaehlt = e.detail && e.detail.variantId ? String(e.detail.variantId) : null;
      zeigen();
    });
    // Farbwahlen ohne eigenes Event schreiben nur ?variant= in die URL.
    document.addEventListener('change', function (e) {
      if (!el.contains(e.target)) setTimeout(zeigen, 120);
    });
    // Horizon-Variantenwahl (Breite, Staerke ...) meldet ihre Variante per
    // variant:update - die gilt, auch wenn vorher die Farbwahl eine gemeldet
    // hat (sonst blieb nach Farbe -> Breite die alte Breite im Warenkorb).
    // Keine Variante (Kombination gibt es nicht) = keine Auswahl. Meldungen
    // anderer Produkte (Schnellkauf, Empfehlungen) zaehlen nicht.
    document.addEventListener('variant:update', function (e) {
      gewaehlt = variantVonHorizon(e, d.produkt_id, gewaehlt);
      setTimeout(zeigen, 60);
    });
    window.addEventListener('popstate', function () { gewaehlt = null; zeigen(); });
    // Zuschlag schon im Warenkorb? Beim Laden und nach jeder Warenkorbaenderung.
    document.addEventListener('cart:update', function () { setTimeout(warenkorbLesen, 300); });
    zeigen();
    warenkorbLesen();
  }

  function alle() { document.querySelectorAll('[data-tp-lz]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alle);
  else alle();
  document.addEventListener('shopify:block:select', alle);
  document.addEventListener('shopify:section:load', alle);
})(typeof window !== 'undefined' ? window : globalThis);
