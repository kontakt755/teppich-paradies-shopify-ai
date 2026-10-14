/**
 * Kalkulation eines Angebotsentwurfs – deterministisch, ohne KI und ohne
 * Google-Dienste. Eingabe: Vorgang (siehe README "Vorgangsformat") und
 * Artikelstamm. Ausgabe: Positionen, Summen, Meldungen, Aktion, Texte.
 *
 * Meldungsstufen:
 *   fehler   – wesentliche Angabe fehlt oder Regel verletzt -> kein Lexware-Entwurf
 *   konflikt – Regelkonflikt, braucht eine Entscheidung     -> kein Lexware-Entwurf
 *   offen    – kleiner offener Punkt, wird transparent ausgewiesen (blockiert nicht)
 *   hinweis  – Information, z. B. bewusste Preisabweichung
 */

function tpAngebotBerechnen(vorgang, stamm) {
  var K = TP_KONFIG;
  var v = vorgang || {};
  var erg = {
    vorgangId: v.vorgangId || '',
    artikelQuelle: stamm.quelle,
    positionen: [],
    meldungen: [],
    raeume: [],
    aktion: { gilt: false, gruende: [], warenwertBrutto: 0 },
    verlegeangebot: false,
    texte: { schluss: [] },
    summen: null
  };
  var roh = [];

  function melde(stufe, text, bezug, kunde) {
    erg.meldungen.push({ stufe: stufe, text: text, bezug: bezug || '', kunde: !!kunde });
  }

  /** Position aus Lexware-Artikel bilden. Preis/Einheit/Beschreibung kommen nur aus dem Artikelstamm. */
  function position(ref, o) {
    var f = tpArtikelFinden(stamm, ref);
    var bezug = o.bezug || '';
    if (f.fehler) { melde('fehler', f.fehler, bezug); return null; }
    var a = f.artikel;
    for (var i = 0; i < K.titelVerboten.length; i++) {
      if (K.titelVerboten[i].test(a.titel)) {
        melde('fehler', '„' + a.titel + '“ darf nicht verwendet werden (Regel 4: keine Sprühkleber-Position)', bezug);
        return null;
      }
    }
    var preis = a.netto;
    var abweichung = null;
    var override = tpZahl(o.preisNetto);
    if (override !== null) {
      if (!tpHatZweiStellen(override)) {
        melde('fehler', 'Abweichender Netto-Preis ' + override + ' hat mehr als 2 Nachkommastellen', bezug);
      }
      if (!o.begruendung) {
        melde('fehler', 'Preisabweichung bei „' + a.titel + '“ ohne Begründung (Lexware ' + tpFormat(a.netto) + ' €, Angebot ' + tpFormat(override) + ' €)', bezug);
      }
      if (override !== a.netto) {
        abweichung = { lexware: a.netto, angebot: override, begruendung: o.begruendung || '' };
        melde('hinweis', 'Auftragsspezifische Preisabweichung „' + a.titel + '“: Lexware ' + tpFormat(a.netto) + ' € → Angebot ' + tpFormat(override) + ' € netto (' + (o.begruendung || 'ohne Begründung') + ')', bezug);
      }
      preis = override;
    } else if (a.preisStatus === 'fehlt') {
      melde('fehler', 'Kein hinterlegter Preis für „' + a.titel + '“ – Preis nie schätzen, bitte in Lexware klären', bezug);
      return null;
    }
    if (preis === 0 && !o.kostenlosBestaetigt) {
      melde('fehler', '„' + a.titel + '“ hat Preis 0,00 € ohne bestätigte kostenlose Leistung – Preis klären, nicht mit 0 ansetzen', bezug);
    }
    if (a.preisStatus === 'inkonsistent') melde('hinweis', '„' + a.titel + '“: ' + a.preisHinweise.join('; '), bezug);
    if (a.steuersatz !== K.steuersatzStandard) {
      melde('konflikt', '„' + a.titel + '“ hat Steuersatz ' + a.steuersatz + ' % – historische Einstellung, Artikel prüfen', bezug);
    }
    if (!tpHatZweiStellen(a.netto) && override === null) {
      melde('konflikt', '„' + a.titel + '“: Netto-Preis ' + a.netto + ' hat mehr als 2 Nachkommastellen', bezug);
    }
    var menge = Number(o.menge);
    if (!(menge > 0)) { melde('fehler', 'Menge für „' + a.titel + '“ fehlt oder ist 0', bezug); return null; }
    if (o.einheitErwartet && o.einheitErwartet.indexOf(a.einheit) < 0) {
      melde('konflikt', '„' + a.titel + '“ hat Einheit „' + a.einheit + '“, erwartet ' + o.einheitErwartet.join(' oder '), bezug);
    }
    var p = {
      artikel: a,
      kategorie: o.kategorie || tpKategorieAusArtikel(a),
      name: a.titel,
      einheit: a.einheit,
      menge: menge,
      rundung: o.rundung || null,
      preisNetto: preis,
      preisLexware: a.netto,
      steuersatz: a.steuersatz,
      optional: !!o.optional,
      abweichung: abweichung,
      details: o.details ? [].concat(o.details) : [],
      textbausteine: o.textbausteine ? [].concat(o.textbausteine) : [],
      bodenart: o.bodenart || null,
      rabattiert: !!o.rabattiert,
      herkunft: o.herkunft || 'regel',
      zusammenfassen: o.zusammenfassen !== false
    };
    roh.push(p);
    return p;
  }

  var sammelPaket = {};
  var sammelDaemmung = {};
  var sammelSockel = {};
  var verlegeRaeume = [];
  var designbelagRaeume = 0;
  var sockelAngabe = false;
  var profilAngabe = false;

  (v.raeume || []).forEach(function (r, i) {
    var name = r.name || ('Raum ' + (i + 1));
    var cfg = K.bodenarten[r.bodenart];
    if (!cfg) { melde('fehler', 'Bodenart „' + (r.bodenart || '') + '“ unbekannt', name); return; }
    var L = tpZahl(r.laengeM), B = tpZahl(r.breiteM);
    var netto = tpZahl(r.nettoM2);
    if (netto === null && L && B) netto = tpRunden2(L * B - (tpZahl(r.abzugM2) || 0));
    if (!(netto > 0)) { melde('fehler', 'Netto-Verlegefläche fehlt (Länge/Breite oder Netto m²)', name); return; }
    var info = { name: name, bodenart: r.bodenart, nettoM2: netto, laengeM: L, breiteM: B, bestellung: null };
    erg.raeume.push(info);
    if (r.schief) melde('offen', 'Schiefer Raum – Netto-Verlegefläche und Verschnitt vor Ort prüfen', name, true);
    if (cfg.designbelag) designbelagRaeume++;

    var belag = r.belag || {};
    if (belag.ref) {
      if (cfg.art === 'rolle') {
        var best = tpBestellmass(r, L, B, K.rollenware.zugabeM);
        best.meldungen.forEach(function (m) { melde(m.stufe, m.text, name); });
        if (best.flaeche) {
          info.bestellung = best;
          position(belag.ref, {
            menge: best.flaeche, kategorie: 'bodenbelag', bezug: name, bodenart: r.bodenart,
            preisNetto: belag.preisNetto, begruendung: belag.begruendung, rabattiert: tpJa(belag.rabattiert),
            einheitErwartet: ['m²'],
            details: [name + ': Bestellmaß ' + best.bahnen.map(function (b) {
              return tpFormat(b.breiteM) + ' m × ' + tpFormat(b.laengeM) + ' m';
            }).join(' + ') + ' = ' + tpFormat(best.flaeche) + ' m² (Netto-Verlegefläche ca. ' + tpFormat(netto) + ' m²)']
          });
        }
      } else {
        var key = (belag.ref.id || belag.ref.nr) + '|' + (belag.preisNetto || '');
        if (!sammelPaket[key]) sammelPaket[key] = { belag: belag, bodenart: r.bodenart, netto: 0, raeume: [] };
        sammelPaket[key].netto += netto;
        sammelPaket[key].raeume.push(name + ' ' + tpFormat(netto) + ' m²');
      }
    } else {
      melde('offen', 'Kein Bodenbelag-Artikel angegeben (bauseits oder noch offen?)', name, true);
    }

    if (r.verlegeart) {
      verlegeRaeume.push({ raum: r, name: name, netto: netto, cfg: cfg });
    }

    if (r.daemmung && r.daemmung.ref) {
      var dk = r.daemmung.ref.id || r.daemmung.ref.nr;
      if (!sammelDaemmung[dk]) sammelDaemmung[dk] = { d: r.daemmung, netto: 0, raeume: [] };
      sammelDaemmung[dk].netto += netto;
      sammelDaemmung[dk].raeume.push(name);
    } else if (r.verlegeart === 'mit_daemmung') {
      melde('offen', 'Verlegung mit Dämmunterlage gewählt, aber kein Dämmunterlage-Artikel angegeben', name);
    }

    // Regel 8: Silikon bei Vinyl/Designbelag
    if (cfg.designbelag) {
      var s = r.silikon;
      if (!s) {
        melde('offen', 'Silikon an Türzargen/Anschlüssen/Randbereichen prüfen (Regel 8)', name);
      } else {
        var lfm = 0, sDetails = [], vorl = false;
        if (tpJa(s.umlaufend)) {
          if (!L || !B) {
            melde('fehler', 'Umlaufende Abdichtung braucht Länge und Breite', name);
          } else {
            var tueren = (s.tuerbreitenM || []).map(tpZahl).filter(function (x) { return x !== null; });
            var tuerSumme = tueren.reduce(function (a, b) { return a + b; }, 0);
            lfm = 2 * (L + B) - tuerSumme;
            sDetails.push(name + ': 2 × (' + tpFormat(L) + ' + ' + tpFormat(B) + ') − Türen ' + tpFormat(tuerSumme) + ' m');
            if (!tueren.length) {
              vorl = true;
              melde('offen', 'Türöffnungsbreiten fehlen – Silikonlänge vorläufig ohne Abzug', name, true);
            }
          }
        }
        var zus = tpZahl(s.zusatzLfm) || 0;
        if (zus) { lfm += zus; sDetails.push(name + ': zusätzliche Anschlüsse ' + tpFormat(zus) + ' m'); }
        if (lfm > 0) {
          position(K.artikel.silikonLfm, {
            menge: lfm, kategorie: 'silikon', bezug: name, rundung: 1,
            details: sDetails.concat(vorl ? [name + ': Länge vorläufig'] : []),
            textbausteine: s.farbe ? [] : [TP_TEXTE.silikonfarbe]
          });
        }
        var zargen = tpZahl(s.tuerzargen);
        if (zargen) position(K.artikel.silikonTuerzarge, { menge: zargen, kategorie: 'silikon', bezug: name, textbausteine: s.farbe ? [] : [TP_TEXTE.silikonfarbe] });
      }
    }

    // Regel 9 / 9a: Sockelleisten
    var sl = r.sockelleiste;
    if (sl) {
      sockelAngabe = true;
      var slLfm = tpZahl(sl.lfm);
      if (!(slLfm > 0)) {
        melde('fehler', 'Sockelleiste angegeben, aber keine Laufmeter', name);
      } else {
        var vorlaeufig = tpJa(sl.vorlaeufig);
        if (vorlaeufig) melde('offen', 'Sockelleistenmenge vorläufig geschätzt', name, true);
        if (sl.material && sl.material.ref) {
          var mk = sl.material.ref.id || sl.material.ref.nr;
          if (!sammelSockel[mk]) sammelSockel[mk] = { material: sl.material, lfm: 0, verschnitt: null, raeume: [], vorlaeufig: false };
          sammelSockel[mk].lfm += slLfm;
          sammelSockel[mk].raeume.push(name + ' ' + tpFormat(slLfm) + ' m');
          if (tpZahl(sl.verschnittProzent) !== null) sammelSockel[mk].verschnitt = tpZahl(sl.verschnittProzent);
          sammelSockel[mk].vorlaeufig = sammelSockel[mk].vorlaeufig || vorlaeufig;
        }
        if (sl.montage) {
          var mnr = K.sockelleisteMontage[sl.montage];
          if (!mnr) melde('fehler', 'Montageart „' + sl.montage + '“ unbekannt', name);
          else position({ nr: mnr }, {
            menge: slLfm, kategorie: 'sockelleisten', bezug: name,
            details: [name + ': ' + tpFormat(slLfm) + ' m' + (vorlaeufig ? ' (vorläufig)' : '')],
            textbausteine: vorlaeufig ? [TP_TEXTE.sockelleistenOffen] : []
          });
        }
      }
    }
    var es = r.einschub;
    if (es) {
      sockelAngabe = true;
      var esLfm = tpZahl(es.lfm);
      if (!(esLfm > 0)) melde('fehler', 'Einschubsockelleiste angegeben, aber keine Laufmeter', name);
      else {
        var esDet = [name + ': ' + tpFormat(esLfm) + ' m'];
        if (es.art === 'bestehend') {
          position(K.artikel.einschubStreifenEntfernen, { menge: esLfm, kategorie: 'sockelleisten', bezug: name, details: esDet });
        } else if (es.art === 'neu') {
          position(K.artikel.einschubLeisteNeu, { menge: esLfm, kategorie: 'sockelleisten', bezug: name, details: esDet });
        } else {
          melde('fehler', 'Einschubsockelleiste: „bestehend“ oder „neu“ angeben', name);
        }
        position(K.artikel.einschubStreifenNeu, { menge: esLfm, kategorie: 'sockelleisten', bezug: name, details: esDet });
        if (tpJa(es.silikon)) {
          position(K.artikel.silikonLfm, { menge: esLfm, kategorie: 'silikon', bezug: name, rundung: 1, details: esDet, textbausteine: [TP_TEXTE.silikonfarbe] });
        }
      }
    }

    // Regel 8a: Profile
    (r.profile || []).forEach(function (pr) {
      profilAngabe = true;
      var len = tpZahl(pr.laengeM);
      if (!(len > 0)) { melde('fehler', 'Profil ohne Länge', name); return; }
      var pv = tpJa(pr.vorlaeufig);
      if (pv) melde('offen', 'Profillänge vorläufig – nach Aufmaß anpassen', name, true);
      position(pr.ref || K.artikel.profilStandard, {
        menge: len, kategorie: 'profile', bezug: name,
        details: [name + ': ' + tpFormat(len) + ' m' + (pv ? ' (vorläufig)' : '')],
        textbausteine: [TP_TEXTE.profileOffen].filter(function () { return pv || !pr.farbe; })
      });
    });
    if (cfg.designbelag && !(r.profile || []).length && !tpJa(r.keineProfile)) {
      melde('offen', 'Übergangs-/Abschlussprofile prüfen (Regel 8a)', name);
    }
  });

  // Paketware: Verpackungseinheiten aufrunden (oder bewusst anteilig)
  Object.keys(sammelPaket).forEach(function (key) {
    var s = sammelPaket[key];
    var f = tpArtikelFinden(stamm, s.belag.ref);
    if (f.fehler) { melde('fehler', f.fehler, s.raeume.join(', ')); return; }
    var a = f.artikel;
    var vers = tpZahl(s.belag.verschnittProzent);
    if (vers === null) {
      melde('fehler', 'Verschnitt % für „' + a.titel + '“ fehlt – Bestellmenge wird nicht geschätzt', s.raeume.join(', '));
      return;
    }
    var netto = tpRunden2(s.netto);
    var bedarf = netto * (1 + vers / 100);
    var inhalt = tpZahl(s.belag.paketInhaltM2) || tpPaketinhaltAusArtikel(a);
    var menge, det;
    if (tpJa(s.belag.anteilig)) {
      menge = tpAufrunden(bedarf, 0.01);
      det = 'Netto-Verlegefläche ' + tpFormat(netto) + ' m² + ' + tpFormatKurz(vers) + ' % Verschnitt = ' + tpFormat(menge) + ' m² (anteilig kalkuliert)';
    } else if (!inhalt) {
      melde('fehler', 'Paketinhalt für „' + a.titel + '“ fehlt – Pakete nicht berechenbar', s.raeume.join(', '));
      return;
    } else {
      var pakete = Math.ceil(bedarf / inhalt - 1e-9);
      menge = a.einheit === 'm²' ? tpRunden2(pakete * inhalt) : pakete;
      det = 'Netto-Verlegefläche ' + tpFormat(netto) + ' m² + ' + tpFormatKurz(vers) + ' % Verschnitt = ' + tpFormat(bedarf) + ' m² → ' + pakete + ' Pakete à ' + tpFormat(inhalt) + ' m²';
      if (a.einheit !== 'm²') melde('konflikt', '„' + a.titel + '“ hat Einheit „' + a.einheit + '“ – Menge als Paketanzahl angesetzt, bitte prüfen', s.raeume.join(', '));
    }
    position(s.belag.ref, {
      menge: menge, kategorie: 'bodenbelag', bodenart: s.bodenart, bezug: s.raeume.join(', '),
      preisNetto: s.belag.preisNetto, begruendung: s.belag.begruendung, rabattiert: tpJa(s.belag.rabattiert),
      details: ['Räume: ' + s.raeume.join(', '), det], zusammenfassen: false
    });
  });

  // Regel 5a: Daemmunterlagen – Netto ohne extra Verschnitt (Entscheidung 14.10.2026), auf halbe Rolle aufrunden
  Object.keys(sammelDaemmung).forEach(function (dk) {
    var s = sammelDaemmung[dk];
    var f = tpArtikelFinden(stamm, s.d.ref);
    if (f.fehler) { melde('fehler', f.fehler, s.raeume.join(', ')); return; }
    var a = f.artikel;
    var netto = tpRunden2(s.netto);
    var proz = K.daemmung.verschnittProzent;
    var bedarf = netto * (1 + proz / 100);
    var inhalt = tpZahl(s.d.rolleninhaltM2) || tpRolleninhaltAusArtikel(a);
    var menge, det;
    if (!inhalt) {
      melde('offen', 'Rolleninhalt für „' + a.titel + '“ unbekannt – Rollenanzahl fehlt in der Beschreibung', s.raeume.join(', '));
      menge = tpAufrunden(bedarf, 0.01);
      det = 'Netto-Verlegefläche ' + tpFormat(netto) + ' m² + ' + proz + ' % Verschnitt = ' + tpFormat(menge) + ' m²';
    } else {
      var rollenRoh = bedarf / inhalt;
      var rollen = tpJa(s.d.nurGanzeRollen) ? Math.ceil(rollenRoh - 1e-9) : tpAufrunden(rollenRoh, K.daemmung.rundungRollen);
      if (a.einheit === 'Rolle') menge = rollen;
      else if (a.einheit === 'm²') menge = tpRunden2(rollen * inhalt);
      else {
        melde('konflikt', '„' + a.titel + '“ hat Einheit „' + a.einheit + '“ – Regel 5a rechnet in m² bzw. Rollen', s.raeume.join(', '));
        menge = tpRunden2(rollen * inhalt);
      }
      det = 'entspricht ca. ' + tpFormatKurz(rollen) + ' Rollen à ' + tpFormat(inhalt) + ' m² (Netto-Verlegefläche ' + tpFormat(netto) + ' m²' + (proz ? ' + ' + proz + ' % Verschnitt' : '') + ')';
    }
    position(s.d.ref, { menge: menge, kategorie: 'daemmung', bezug: s.raeume.join(', '), details: [det], zusammenfassen: false });
  });

  // Regel 9a: Sockelleisten-Material mit Verschnitt, auf ganze Leisten
  Object.keys(sammelSockel).forEach(function (mk) {
    var s = sammelSockel[mk];
    var f = tpArtikelFinden(stamm, s.material.ref);
    if (f.fehler) { melde('fehler', f.fehler, s.raeume.join(', ')); return; }
    var a = f.artikel;
    var vers = s.verschnitt;
    if (vers === null) {
      vers = K.sockelleiste.verschnittProzentStandard;
      melde('hinweis', 'Sockelleisten-Verschnitt: Standard ' + vers + ' %', s.raeume.join(', '));
    }
    var bedarf = s.lfm * (1 + vers / 100);
    var menge, det = tpFormat(s.lfm) + ' m + ' + tpFormatKurz(vers) + ' % Verschnitt = ' + tpFormat(bedarf) + ' m';
    if (a.einheit === 'lfm') {
      menge = tpAufrunden(bedarf, 1);
    } else if (a.einheit === 'Stück' || a.einheit === 'Leiste') {
      var len = tpZahl(s.material.leistenlaengeM) || tpLeistenlaengeAusArtikel(a);
      if (!len) { melde('fehler', 'Leistenlänge für „' + a.titel + '“ unbekannt', s.raeume.join(', ')); return; }
      menge = Math.ceil(bedarf / len - 1e-9);
      det += ' → ' + menge + ' Leisten à ' + tpFormat(len) + ' m';
    } else {
      melde('konflikt', 'Sockelleisten-Material „' + a.titel + '“ hat Einheit „' + a.einheit + '“', s.raeume.join(', '));
      return;
    }
    position(s.material.ref, {
      menge: menge, kategorie: 'sockelleisten', bezug: s.raeume.join(', '),
      details: ['Räume: ' + s.raeume.join(', '), det + (s.vorlaeufig ? ' (vorläufig)' : '')],
      textbausteine: s.vorlaeufig ? [TP_TEXTE.sockelleistenOffen] : [], zusammenfassen: false
    });
  });

  // Regel 3: Aktion 649 EUR – nur reiner Rollenware-Bodenbelag zaehlt
  erg.aktion = tpAktionPruefen(v, roh.filter(function (p) {
    return p.kategorie === 'bodenbelag' && K.aktion649.bodenarten.indexOf(p.bodenart) >= 0 && !p.optional;
  }), melde);

  // Verlegung
  var aktionRaeume = [];
  var gruppen = {};
  verlegeRaeume.forEach(function (x) {
    var ba = x.raum.bodenart;
    var art = x.raum.verlegeart;
    if (erg.aktion.gilt && K.aktion649.bodenarten.indexOf(ba) >= 0) { aktionRaeume.push(x); return; }
    if (ba === 'teppichboden' && art === 'verklebt' && tpJa(x.raum.wolle)) art = 'verklebt_wolle';
    var g = ba + '|' + art;
    if (!gruppen[g]) gruppen[g] = { bodenart: ba, art: art, raeume: [] };
    gruppen[g].raeume.push(x);
    var fix = x.raum.fixierung;
    if (K.bodenarten[ba].art === 'rolle' && (art === 'lose' || art === 'band') && !fix) {
      melde('offen', 'Fixierung bei Rollenware zusätzlich prüfen/anbieten (Regel 4)', x.name);
    }
  });
  Object.keys(gruppen).forEach(function (g) {
    var gr = gruppen[g];
    var tab = K.verlegung[gr.bodenart];
    var nr = tab && tab.m2[gr.art];
    var bezug = gr.raeume.map(function (x) { return x.name; }).join(', ');
    if (!nr) { melde('fehler', 'Keine Verlegeposition für ' + gr.bodenart + ' / „' + gr.art + '“', bezug); return; }
    var pnr = tab.pauschal[gr.art];
    var summe = tpRunden2(gr.raeume.reduce(function (a, x) { return a + x.netto; }, 0));
    var dets = gr.raeume.map(function (x) { return x.name + ': ' + tpFormat(x.netto) + ' m²'; });
    if (pnr && gr.raeume.length === 1 && summe <= K.pauschale.maxFlaecheM2) {
      position({ nr: pnr }, { menge: 1, kategorie: 'verlegung', bezug: bezug, details: dets.concat(['Einzelraum bis ' + K.pauschale.maxFlaecheM2 + ' m² – Pauschale']) });
      melde('hinweis', 'Pauschale ' + pnr + ' angesetzt (einzelne Fläche ' + tpFormat(summe) + ' m² ≤ ' + K.pauschale.maxFlaecheM2 + ' m²)', bezug);
    } else {
      position({ nr: nr }, { menge: summe, kategorie: 'verlegung', bezug: bezug, details: dets.concat(['Netto-Verlegefläche gesamt ' + tpFormat(summe) + ' m²']) });
    }
  });
  erg.aktion.angewendet = aktionRaeume.length > 0;
  if (erg.aktion.gilt && !aktionRaeume.length) {
    melde('hinweis', 'Aktionsbedingungen erfüllt, aber keine Rollenware-Verlegung angefragt – Aktion nicht angewendet', 'Kopf');
  }
  if (aktionRaeume.length) {
    var aSumme = tpRunden2(aktionRaeume.reduce(function (a, x) { return a + x.netto; }, 0));
    position(K.artikel.aktionVerlegung, {
      menge: 1, kategorie: 'verlegung', kostenlosBestaetigt: true, bezug: aktionRaeume.map(function (x) { return x.name; }).join(', '),
      details: aktionRaeume.map(function (x) { return x.name + ': ' + tpFormat(x.netto) + ' m²'; }).concat(['Netto-Verlegefläche gesamt ' + tpFormat(aSumme) + ' m²'])
    });
    aktionRaeume.forEach(function (x) {
      var art = x.raum.verlegeart;
      var fix = x.raum.fixierung;
      var det = [x.name + ': ' + tpFormat(x.netto) + ' m²'];
      if (art === 'fixiert') {
        position(K.artikel.aktionFixierung, { menge: x.netto, kategorie: 'fixierung', bezug: x.name, details: det });
      } else if (art === 'klett') {
        position(K.artikel.aktionKlettband, { menge: x.netto, kategorie: 'fixierung', bezug: x.name, details: det });
      } else if (art === 'lose' || art === 'aktion') {
        if (fix === 'optional') position(K.artikel.aktionFixierung, { menge: x.netto, kategorie: 'fixierung', bezug: x.name, details: det, optional: true });
        else if (!fix) melde('offen', 'Fixierung bei Rollenware zusätzlich prüfen/anbieten (Regel 4)', x.name);
      } else {
        melde('konflikt', 'Verlegeart „' + art + '“ ist bei aktiver 649-€-Aktion nicht über eine vorhandene Zusatzposition abbildbar – Vorgabe nötig', x.name);
      }
    });
  }

  // Zusatzpositionen (Altbelag, Untergrund, Zusatzarbeiten …)
  var zusatzMg = false, zusatzFahrt = false;
  (v.zusatzpositionen || []).forEach(function (z, i) {
    var ref = typeof z.ref === 'string' ? tpRefAusText(z.ref) : z.ref;
    var p = position(ref, {
      menge: tpZahl(z.menge), kategorie: z.kategorie || null, optional: tpJa(z.optional),
      preisNetto: z.preisNetto, begruendung: z.begruendung, bezug: 'Zusatz ' + (i + 1),
      details: z.text ? [z.text] : [], herkunft: 'zusatz'
    });
    if (!p) return;
    if (p.artikel.nr === 'MG-010') zusatzMg = true;
    if (p.kategorie === 'anfahrt') zusatzFahrt = true;
    if (erg.aktion.angewendet && K.aktionVerboten.indexOf(p.artikel.nr) >= 0) {
      melde('konflikt', p.artikel.nr + ' darf bei aktiver 649-€-Aktion nicht verwendet werden (Regel 4)', 'Zusatz ' + (i + 1));
    }
    if (p.artikel.nr === K.artikel.einschubLeisteNeu.nr && (v.raeume || []).some(function (r) { return r.einschub && r.einschub.art === 'bestehend'; })) {
      melde('konflikt', 'Neue Einschubsockelleiste berechnet, obwohl bestehende Leisten bleiben (Regel 9)', 'Zusatz ' + (i + 1));
    }
  });

  erg.verlegeangebot = roh.some(function (p) { return p.kategorie === 'verlegung'; });

  // Regel 7: MG-010 bei Verlegeangeboten
  if (erg.verlegeangebot && !zusatzMg) {
    var mg = v.materialReinigung || {};
    if (tpJa(mg.weglassen)) {
      if (!mg.begruendung) melde('konflikt', 'MG-010 soll entfallen – Begründung fehlt (Regel 7: bei Verlegeangeboten immer vorhanden)', 'Kopf');
      else melde('hinweis', 'MG-010 bewusst weggelassen: ' + mg.begruendung, 'Kopf');
    } else {
      position(K.artikel.materialReinigung, { menge: 1, kategorie: 'material_reinigung', bezug: 'Regel 7', preisNetto: mg.preisNetto, begruendung: mg.begruendung });
    }
  }

  // Regel 6: Fahrten
  var fahrten = v.fahrten || {};
  if ((erg.verlegeangebot || tpZahl(fahrten.anzahl) > 0) && !zusatzFahrt) {
    var anzahl = tpZahl(fahrten.anzahl);
    if (anzahl === null) {
      anzahl = 1;
      melde('offen', 'Anzahl An-/Abfahrten nicht angegeben – 1 Fahrt angesetzt, nach Arbeitsablauf prüfen (Vorarbeiten, Trocknung, Verlegung, Nacharbeiten)', 'Kopf');
    }
    var zone = (v.baustelle || {}).fahrzone;
    var km = tpZahl((v.baustelle || {}).entfernungKm);
    if (!zone && km !== null && km <= K.aktion649.maxEntfernungKm) zone = 'nah';
    var fahrRef = null;
    if (zone === 'nah') fahrRef = K.artikel.fahrtNah;
    else if (zone === 'berlin') fahrRef = K.artikel.fahrtBerlin;
    else if (zone === 'weiter') melde('fehler', 'Weitere Entfernung: Fahrtkosten nach Strecke/Fahrzeit separat prüfen – keine Standardposition', 'Kopf');
    else melde('fehler', 'Fahrzone fehlt (nah/berlin/weiter)', 'Kopf');
    var berechnet = erg.aktion.angewendet ? anzahl - 1 : anzahl;
    if (fahrRef && berechnet > 0) {
      position(fahrRef, {
        menge: berechnet, kategorie: 'anfahrt', bezug: 'Regel 6',
        preisNetto: fahrten.preisNetto, begruendung: fahrten.begruendung,
        details: erg.aktion.angewendet ? ['1. An-/Abfahrt im Aktionsangebot enthalten, weitere Fahrten: ' + berechnet] : (anzahl > 1 ? [anzahl + ' An-/Abfahrten'] : [])
      });
    }
  }

  // Regel 10: Untergrund
  var hatUntergrund = roh.some(function (p) { return p.kategorie === 'untergrund' || p.kategorie === 'altbelag'; });
  if (erg.verlegeangebot && !hatUntergrund && !tpJa(v.untergrundOhneArbeiten)) {
    melde('offen', 'Untergrund/Altbelag nicht kalkuliert – Zustand prüfen (Regel 10)', 'Kopf', true);
  }
  if (roh.some(function (p) { return /^SG-/.test(p.artikel.nr || ''); })) {
    erg.texte.schluss.push(TP_TEXTE.siganHinweis);
    melde('offen', 'Sigan auf Bestandsboden: geeignete Reinigung bei Bedarf optional anbieten (Regel 10)', 'Kopf');
  }
  if (erg.verlegeangebot && !sockelAngabe && !roh.some(function (p) { return p.kategorie === 'sockelleisten'; }) && !tpJa(v.keineSockelleisten)) {
    melde('offen', 'Sockelleisten nicht angegeben – prüfen (Regel 9a)', 'Kopf');
  }

  erg.positionen = tpPositionenOrdnen(tpZusammenfassen(roh));
  tpReihenfolgePruefen(erg, melde);
  erg.summen = tpSummen(erg.positionen);

  if (erg.verlegeangebot) erg.texte.schluss.unshift(TP_TEXTE.untergrund);
  if (tpJa(v.erstkalkulation)) {
    var offen = erg.meldungen.filter(function (m) { return m.kunde && m.stufe === 'offen'; })
      .map(function (m) { return '– ' + (m.bezug && m.bezug !== 'Kopf' ? m.bezug + ': ' : '') + m.text; });
    erg.texte.schluss.unshift(TP_TEXTE.erstkalkulation + (offen.length ? '\nOffene Punkte:\n' + offen.join('\n') : ''));
  } else if (erg.meldungen.some(function (m) { return m.kunde && m.stufe === 'offen'; })) {
    melde('hinweis', 'Es gibt offene Punkte – ggf. als „grobe Erstkalkulation“ kennzeichnen (Regel 11)', 'Kopf');
  }
  if (tpJa(v.maler)) erg.texte.schluss.push(TP_TEXTE.maler);

  erg.blockiert = erg.meldungen.some(function (m) { return m.stufe === 'fehler' || m.stufe === 'konflikt'; });
  return erg;
}

/** Bestellmass Rollenware je Bahn. Bestelllaenge = Laenge + Zugabe, auf volle cm aufgerundet. */
function tpBestellmass(r, L, B, zugabe) {
  var out = { bahnen: [], flaeche: null, meldungen: [] };
  var rb = tpZahl(r.rollenbreiteM);
  if (r.bahnen && r.bahnen.length) {
    r.bahnen.forEach(function (b) {
      var bb = tpZahl(b.breiteM), bl = tpZahl(b.laengeM);
      if (!(bb > 0 && bl > 0)) { out.meldungen.push({ stufe: 'fehler', text: 'Bahn ohne Breite/Länge' }); return; }
      if (rb && bb > rb + 1e-9) out.meldungen.push({ stufe: 'konflikt', text: 'Bahnbreite ' + tpFormat(bb) + ' m größer als Rollenbreite ' + tpFormat(rb) + ' m' });
      out.bahnen.push({ breiteM: bb, laengeM: bl });
    });
  } else {
    if (!rb) { out.meldungen.push({ stufe: 'fehler', text: 'Rollenbreite fehlt – Bestellmaß nicht berechenbar' }); return out; }
    if (!L || !B) { out.meldungen.push({ stufe: 'fehler', text: 'Länge und Breite für das Bestellmaß fehlen' }); return out; }
    var moeglich = [];
    if (B <= rb + 1e-9) moeglich.push({ quer: B, laengs: L });
    if (L <= rb + 1e-9) moeglich.push({ quer: L, laengs: B });
    if (!moeglich.length) {
      out.meldungen.push({ stufe: 'fehler', text: 'Raum breiter als Rolle (' + tpFormat(rb) + ' m) – Bahnen mit Naht angeben' });
      return out;
    }
    moeglich.sort(function (a, b) { return a.laengs - b.laengs; });
    var noetig = tpAufrunden(moeglich[0].laengs + zugabe, 0.01);
    var laenge = noetig;
    var vorgabe = tpZahl(r.bestellLaengeM);
    if (vorgabe !== null) {
      if (vorgabe < noetig - 1e-9) {
        out.meldungen.push({ stufe: 'konflikt', text: 'Bestelllänge ' + tpFormat(vorgabe) + ' m kleiner als Länge + Zugabe (' + tpFormat(moeglich[0].laengs) + ' + ' + tpFormat(zugabe) + ' = ' + tpFormat(noetig) + ' m)' });
      }
      laenge = vorgabe;
    }
    out.bahnen.push({ breiteM: rb, laengeM: laenge });
  }
  out.flaeche = tpRunden2(out.bahnen.reduce(function (a, b) { return a + b.breiteM * b.laengeM; }, 0));
  return out;
}

/** Regel 3: Aktion "Verlegung inklusive ab 649 EUR" pruefen. */
function tpAktionPruefen(v, rollenPos, melde) {
  var A = TP_KONFIG.aktion649;
  var res = { gilt: false, gruende: [], warenwertNetto: 0, warenwertBrutto: 0 };
  if (!rollenPos.length) { res.gruende.push('keine Rollenware (Teppichboden/PVC) im Angebot'); return res; }
  // Wie im Angebot: gleiche Artikel/Preise erst zusammenfassen, dann runden
  // (sonst weicht der Warenwert je Raum gerundet um Cent-Betraege ab).
  var gruppen = {};
  rollenPos.forEach(function (p) {
    var k = p.artikel.id + '|' + p.preisNetto;
    if (!gruppen[k]) gruppen[k] = { menge: 0, preis: p.preisNetto };
    gruppen[k].menge += p.menge;
  });
  var netto = Object.keys(gruppen).reduce(function (a, k) {
    return a + tpRunden2(tpRunden2(gruppen[k].menge) * gruppen[k].preis);
  }, 0);
  res.warenwertNetto = tpRunden2(netto);
  res.warenwertBrutto = tpRunden2(netto * (1 + TP_KONFIG.steuersatzStandard / 100));
  var ok = true;
  if (v.aktion649 === 'aus') { res.gruende.push('im Vorgang ausgeschlossen'); ok = false; }
  var typ = (v.kunde || {}).kundentyp;
  if (!typ) { res.gruende.push('Kundentyp fehlt'); melde('offen', 'Kundentyp (privat/gewerbe) fehlt – Aktion nicht angewendet', 'Kopf'); ok = false; }
  else if (typ !== A.kundentyp) { res.gruende.push('kein Privatkunde'); ok = false; }
  var km = tpZahl((v.baustelle || {}).entfernungKm);
  if (km === null) { res.gruende.push('Entfernung nicht geprüft'); ok = false; }
  else if (km > A.maxEntfernungKm) { res.gruende.push('Entfernung ' + tpFormatKurz(km) + ' km > ' + A.maxEntfernungKm + ' km'); ok = false; }
  var rabatt = rollenPos.some(function (p) { return p.rabattiert || p.preisNetto < p.preisLexware; });
  if (rabatt) { res.gruende.push('rabattierter Bodenbelag – keine Kombination mit Produkt-/Shoprabatt'); ok = false; }
  if (res.warenwertBrutto < A.grenzeBrutto) { res.gruende.push('Bodenbelags-Warenwert ' + tpFormat(res.warenwertBrutto) + ' € brutto < ' + A.grenzeBrutto + ' €'); ok = false; }
  res.gilt = ok;
  if (ok) res.gruende.push('alle Bedingungen erfüllt (Warenwert ' + tpFormat(res.warenwertBrutto) + ' € brutto, ' + tpFormatKurz(km) + ' km, Privatkunde, Rollenware)');
  if (km === null && res.warenwertBrutto >= A.grenzeBrutto && v.aktion649 !== 'aus') {
    melde('offen', 'Aktion 649 € möglich (Warenwert ' + tpFormat(res.warenwertBrutto) + ' € brutto) – Entfernung prüfen', 'Kopf');
  }
  return res;
}

/** Gleiche Artikel/Preise zusammenfassen; Rundung (z. B. volle lfm) auf die Summe anwenden. */
function tpZusammenfassen(roh) {
  var aus = [];
  var index = {};
  roh.forEach(function (p) {
    var key = p.zusammenfassen ? [p.artikel.id, p.preisNetto, p.optional, p.kategorie, p.rundung].join('|') : null;
    if (key && index[key]) {
      var z = index[key];
      z.menge += p.menge;
      z.details = z.details.concat(p.details);
      p.textbausteine.forEach(function (t) { if (z.textbausteine.indexOf(t) < 0) z.textbausteine.push(t); });
      return;
    }
    var kopie = Object.assign({}, p, { details: p.details.slice(), textbausteine: p.textbausteine.slice() });
    aus.push(kopie);
    if (key) index[key] = kopie;
  });
  aus.forEach(function (p) {
    p.menge = p.rundung ? tpAufrunden(p.menge, p.rundung) : tpRunden2(p.menge);
    var teile = [];
    if (p.artikel.beschreibung) teile.push(p.artikel.beschreibung);
    if (p.details.length) teile.push(p.details.join('\n'));
    if (p.textbausteine.length) teile.push(p.textbausteine.join('\n'));
    p.beschreibung = teile.join('\n\n');
  });
  return aus;
}

function tpPositionenOrdnen(liste) {
  var rang = TP_KONFIG.kategorien;
  return liste.map(function (p, i) { return { p: p, i: i }; })
    .sort(function (a, b) {
      var ra = rang[a.p.kategorie] || rang.zusatz, rb = rang[b.p.kategorie] || rang.zusatz;
      return ra - rb || (a.p.optional ? 1 : 0) - (b.p.optional ? 1 : 0) || a.i - b.i;
    })
    .map(function (x) { return x.p; });
}

/** Regel 7/14: MG-010 vorletzte, An-/Abfahrt letzte Position. */
function tpReihenfolgePruefen(erg, melde) {
  var ps = erg.positionen.filter(function (p) { return !p.optional; });
  var n = ps.length;
  var fahrtIdx = -1, mgIdx = -1;
  ps.forEach(function (p, i) {
    if (p.kategorie === 'anfahrt') fahrtIdx = i;
    if (p.kategorie === 'material_reinigung') mgIdx = i;
  });
  if (fahrtIdx >= 0 && fahrtIdx !== n - 1) melde('konflikt', 'An-/Abfahrt ist nicht die letzte Position', 'Reihenfolge');
  if (erg.verlegeangebot && mgIdx >= 0) {
    var soll = fahrtIdx >= 0 ? n - 2 : n - 1;
    if (mgIdx !== soll) melde('konflikt', 'MG-010 ist nicht die vorletzte Position', 'Reihenfolge');
  }
  erg.positionen.forEach(function (p, i) { p.pos = i + 1; });
}

/** Summen wie Lexware (Steuer auf Nettosumme je Steuersatz). Optionale Positionen zaehlen nicht. */
function tpSummen(positionen) {
  var s = { netto: 0, steuer: 0, brutto: 0, optionalNetto: 0, jeSteuersatz: {} };
  positionen.forEach(function (p) {
    p.gesamtNetto = tpRunden2(p.menge * p.preisNetto);
    if (p.optional) { s.optionalNetto = tpRunden2(s.optionalNetto + p.gesamtNetto); return; }
    s.netto = tpRunden2(s.netto + p.gesamtNetto);
    var k = String(p.steuersatz);
    s.jeSteuersatz[k] = tpRunden2((s.jeSteuersatz[k] || 0) + p.gesamtNetto);
  });
  Object.keys(s.jeSteuersatz).forEach(function (k) {
    s.steuer = tpRunden2(s.steuer + tpRunden2(s.jeSteuersatz[k] * Number(k) / 100));
  });
  s.brutto = tpRunden2(s.netto + s.steuer);
  return s;
}
