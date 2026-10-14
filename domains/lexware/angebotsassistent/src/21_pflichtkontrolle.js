/**
 * Pflichtkontrolle vor der Lexware-Erstellung (references/pflichtkontrolle.md).
 *
 * art 'auto'    – wird aus dem Berechnungsergebnis geprueft
 * art 'manuell' – kann das Programm nicht belegen (z. B. oeffentliche
 *                 Adresspruefung); muss im Vorgang unter bestaetigungen.<id>
 *                 ausdruecklich bestaetigt werden, sonst kein Lexware-Entwurf.
 *
 * Status: ok | fehler | offen | entfaellt
 */
var TP_PFLICHTKONTROLLE = [
  { id: 'kunde', art: 'manuell', frage: 'Kunde, Rechnungsanschrift, BV, Telefon/E-Mail korrekt?' },
  { id: 'adresseOeffentlich', art: 'manuell', frage: 'Straße, PLZ und Ort öffentlich verifiziert (Straße im Ort, PLZ passt, Schreibfehler korrigiert)?' },
  {
    id: 'flaechen', art: 'auto', frage: 'Maße, Netto-Verlegefläche, Bestellmaße und Verschnitt getrennt?',
    pruefe: function (e) {
      var rolle = e.raeume.filter(function (r) { return TP_KONFIG.bodenarten[r.bodenart].art === 'rolle'; });
      var ohne = rolle.filter(function (r) { return !r.bestellung; });
      if (!e.raeume.length) return { status: 'fehler', hinweis: 'keine Räume' };
      return ohne.length ? { status: 'fehler', hinweis: 'ohne Bestellmaß: ' + ohne.map(function (r) { return r.name; }).join(', ') } : { status: 'ok' };
    }
  },
  {
    id: 'verpackung', art: 'auto', frage: 'Verpackungseinheiten korrekt; Dämmunterlage ohne extra Verschnitt auf halbe Rolle, Rollenanzahl in Beschreibung?',
    pruefe: function (e) {
      var d = e.positionen.filter(function (p) { return p.kategorie === 'daemmung'; });
      var ohneRollen = d.filter(function (p) { return !/Rollen à/.test(p.beschreibung); });
      if (ohneRollen.length) return { status: 'offen', hinweis: 'Rollenanzahl fehlt bei ' + ohneRollen.map(function (p) { return p.name; }).join(', ') };
      return { status: d.length || e.positionen.some(function (p) { return /Pakete à/.test(p.beschreibung); }) ? 'ok' : 'entfaellt' };
    }
  },
  {
    id: 'preiseZweiStellen', art: 'auto', frage: 'Materialpreise korrekt und netto mit 2 Nachkommastellen?',
    pruefe: function (e) {
      var schlecht = e.positionen.filter(function (p) { return !tpHatZweiStellen(p.preisNetto); });
      return schlecht.length ? { status: 'fehler', hinweis: schlecht.map(function (p) { return p.name; }).join(', ') } : { status: 'ok' };
    }
  },
  {
    id: 'aktionBasis', art: 'auto', frage: '649-€-Aktion ausschließlich aus Bodenbelags-Warenwert geprüft?',
    pruefe: function (e) { return { status: 'ok', hinweis: (e.aktion.gilt ? 'gilt: ' : 'gilt nicht: ') + e.aktion.gruende.join('; ') }; }
  },
  {
    id: 'kundentyp', art: 'auto', frage: 'Privat-/Objektkunde geprüft?',
    pruefe: function (e, v) { var t = (v.kunde || {}).kundentyp; return t ? { status: 'ok', hinweis: t } : { status: 'fehler', hinweis: 'Kundentyp fehlt' }; }
  },
  {
    id: 'entfernung', art: 'auto', frage: 'Entfernung für Aktion bzw. Fahrtpreis geprüft?',
    pruefe: function (e, v) {
      var b = v.baustelle || {};
      if (!e.verlegeangebot && !e.aktion.warenwertBrutto) return { status: 'entfaellt' };
      return tpZahl(b.entfernungKm) !== null || b.fahrzone ? { status: 'ok', hinweis: (b.entfernungKm || '?') + ' km, Zone ' + (b.fahrzone || 'aus km') } : { status: 'fehler', hinweis: 'Entfernung/Fahrzone fehlt' };
    }
  },
  {
    id: 'verlegelogik', art: 'auto', frage: 'Richtige Verlege-/Fixierlogik?',
    pruefe: function (e) {
      var verboten = e.aktion.angewendet && e.positionen.some(function (p) { return TP_KONFIG.aktionVerboten.indexOf(p.artikel.nr) >= 0; });
      var konflikt = e.meldungen.some(function (m) { return m.stufe === 'konflikt' && /Verlege|Fixier|Aktion/.test(m.text); });
      return verboten || konflikt ? { status: 'fehler', hinweis: 'siehe Meldungen' } : { status: 'ok' };
    }
  },
  {
    id: 'untergrund', art: 'manuell', frage: 'Untergrund berücksichtigt bzw. offene Punkte gekennzeichnet?',
    auto: function (e) { return e.meldungen.some(function (m) { return /Untergrund/.test(m.text) && m.stufe === 'offen'; }) ? 'Untergrund nicht kalkuliert – bestätigen oder Positionen ergänzen' : ''; }
  },
  {
    id: 'silikon', art: 'auto', frage: 'Vinyl/Designbelag: Silikon/Anschlüsse geprüft?',
    pruefe: function (e) {
      var design = e.raeume.filter(function (r) { return TP_KONFIG.bodenarten[r.bodenart].designbelag; });
      if (!design.length) return { status: 'entfaellt' };
      var offen = e.meldungen.some(function (m) { return /Silikon/.test(m.text) && m.stufe === 'offen'; });
      return { status: offen ? 'offen' : 'ok' };
    }
  },
  {
    id: 'sockelleisten', art: 'auto', frage: 'Sockelleistenmenge inkl. Verschnitt geprüft?',
    pruefe: function (e) {
      var offen = e.meldungen.some(function (m) { return /Sockelleiste/.test(m.text) && m.stufe !== 'hinweis'; });
      return { status: offen ? 'offen' : 'ok' };
    }
  },
  {
    id: 'profile', art: 'auto', frage: 'Übergangsprofile/Schienen geprüft?',
    pruefe: function (e) { return { status: e.meldungen.some(function (m) { return /Profil/.test(m.text) && m.stufe !== 'hinweis'; }) ? 'offen' : 'ok' }; }
  },
  { id: 'fahrten', art: 'manuell', frage: 'Fahrten realistisch nach Arbeitsablauf?' },
  {
    id: 'mgVorletzte', art: 'auto', frage: 'MG-010 bei Verlegeangebot vorletzte Position?',
    pruefe: function (e) {
      if (!e.verlegeangebot) return { status: 'entfaellt' };
      var ps = e.positionen.filter(function (p) { return !p.optional; });
      var mg = ps.map(function (p) { return p.artikel.nr; }).lastIndexOf('MG-010');
      var fahrt = ps.length && ps[ps.length - 1].kategorie === 'anfahrt';
      if (mg < 0) return { status: e.meldungen.some(function (m) { return /MG-010 bewusst/.test(m.text); }) ? 'ok' : 'fehler', hinweis: 'MG-010 fehlt' };
      return mg === ps.length - (fahrt ? 2 : 1) ? { status: 'ok' } : { status: 'fehler' };
    }
  },
  {
    id: 'anfahrtLetzte', art: 'auto', frage: 'Anfahrt letzte Position?',
    pruefe: function (e) {
      var ps = e.positionen.filter(function (p) { return !p.optional; });
      var idx = -1;
      ps.forEach(function (p, i) { if (p.kategorie === 'anfahrt') idx = i; });
      if (idx < 0) return { status: e.aktion.angewendet || !e.verlegeangebot ? 'entfaellt' : 'fehler', hinweis: e.aktion.angewendet ? '1. Fahrt im Aktionsangebot' : '' };
      return idx === ps.length - 1 ? { status: 'ok' } : { status: 'fehler' };
    }
  },
  {
    id: 'vorhandeneArtikel', art: 'auto', frage: 'Vorhandene Lexware-Artikel verwendet; Preise und Einheiten aus Lexware übernommen?',
    pruefe: function (e) {
      var ohne = e.positionen.filter(function (p) { return !p.artikel || !p.artikel.id; });
      return ohne.length ? { status: 'fehler' } : { status: 'ok', hinweis: e.artikelQuelle };
    }
  },
  {
    id: 'keinePreisSchaetzung', art: 'auto', frage: 'Keine unbekannten Preise geschätzt oder fälschlich mit 0,00 € angesetzt?',
    pruefe: function (e) {
      var f = e.meldungen.some(function (m) { return m.stufe === 'fehler' && /Preis/.test(m.text); });
      return { status: f ? 'fehler' : 'ok' };
    }
  },
  {
    id: 'keinAusortiert', art: 'auto', frage: 'Keine AUSORTIERT- oder unnötige freie Position?',
    pruefe: function (e) {
      var schlecht = e.positionen.filter(function (p) { return /^AUSORTIERT/i.test(p.name); });
      return { status: schlecht.length ? 'fehler' : 'ok' };
    }
  },
  {
    id: 'summen', art: 'auto', frage: 'Summen rechnerisch korrekt?',
    pruefe: function (e) {
      var n = e.positionen.filter(function (p) { return !p.optional; }).reduce(function (a, p) { return tpRunden2(a + tpRunden2(p.menge * p.preisNetto)); }, 0);
      return n === e.summen.netto ? { status: 'ok' } : { status: 'fehler', hinweis: tpFormat(n) + ' ≠ ' + tpFormat(e.summen.netto) };
    }
  },
  {
    id: 'maler', art: 'auto', frage: 'Malerarbeiten-Hinweis nur als unverbindlicher Zusatz?',
    pruefe: function (e) { return { status: e.positionen.some(function (p) { return /maler/i.test(p.name); }) ? 'offen' : 'ok' }; }
  }
];

/** @return {{punkte:Array, freigabe:boolean, gruende:Array}} */
function tpPflichtkontrolle(vorgang, erg) {
  var best = (vorgang && vorgang.bestaetigungen) || {};
  var punkte = TP_PFLICHTKONTROLLE.map(function (d) {
    var r;
    if (d.art === 'manuell') {
      var zusatz = d.auto ? d.auto(erg, vorgang) : '';
      r = tpJa(best[d.id]) ? { status: 'ok', hinweis: 'bestätigt' + (zusatz ? ' – ' + zusatz : '') } : { status: 'offen', hinweis: 'Bestätigung fehlt' + (zusatz ? ' – ' + zusatz : '') };
    } else {
      try { r = d.pruefe(erg, vorgang); } catch (err) { r = { status: 'fehler', hinweis: 'Prüfung fehlgeschlagen: ' + err.message }; }
    }
    return { id: d.id, art: d.art, frage: d.frage, status: r.status, hinweis: r.hinweis || '' };
  });
  var gruende = [];
  punkte.forEach(function (p) {
    if (p.status === 'fehler') gruende.push(p.frage);
    if (p.art === 'manuell' && p.status !== 'ok') gruende.push('Bestätigung fehlt: ' + p.frage);
  });
  if (erg.blockiert) gruende.unshift('Fehler/Regelkonflikte in den Meldungen');
  return { punkte: punkte, freigabe: gruende.length === 0, gruende: gruende };
}
