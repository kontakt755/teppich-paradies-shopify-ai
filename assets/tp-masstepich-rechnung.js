/*
  Rechenkern fuer Raummass und Teppiche nach Mass.
  Reine Funktionen ohne DOM: dieselbe Datei rechnet im Shop
  (blocks/tp-rollware-rechner.liquid, blocks/tp-einfass-konfigurator.liquid)
  und in den Tests (qa/tests/masstepich-rechnung.test.mjs). Preise kommen nie
  von hier - abgerechnet wird immer Variantenpreis x Menge durch Shopify.
*/
(function (root) {
  'use strict';

  var EPS = 1e-9;

  function flaecheM2(wCm, lCm) {
    return (wCm * lCm) / 10000;
  }

  // Abgerechnet wird das Material, aus dem das Stueck geschnitten wird:
  // rund und oval nach dem umschliessenden Rechteck.
  function abrechnungsflaecheM2(form, wCm, lCm) {
    if (form === 'rund') return flaecheM2(wCm, wCm);
    return flaecheM2(wCm, lCm);
  }

  function echteFlaecheM2(form, wCm, lCm) {
    if (form === 'rund') return Math.PI * Math.pow(wCm / 200, 2);
    if (form === 'oval') return Math.PI * (wCm / 200) * (lCm / 200);
    return flaecheM2(wCm, lCm);
  }

  // Laenge der Kante in Metern (Ellipse nach Ramanujan).
  function umfangM(form, wCm, lCm) {
    if (form === 'rund') return (Math.PI * wCm) / 100;
    if (form === 'oval') {
      var a = wCm / 200;
      var b = lCm / 200;
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    return (2 * (wCm + lCm)) / 100;
  }

  // Warenkorbmenge bei Preis pro m2: volle Quadratmeter, aufgerundet.
  function mengeVolleM2(areaM2) {
    return Math.max(1, Math.ceil(areaM2 - EPS));
  }

  // Warenkorbmenge bei Preis pro 0,01 m2.
  function mengeHundertstelM2(areaM2) {
    return Math.max(1, Math.ceil(areaM2 * 100 - EPS));
  }

  // Raummass-Preis je m2: Meterware-Preis plus Aufschlag, auf Cent gerundet.
  function raummassPreis(m2Preis, prozent) {
    return Math.round(m2Preis * (1 + prozent / 100) * 100) / 100;
  }

  // Beim Cover wird die Kante umgeschlagen - das Stueck muss 10 cm schmaler
  // als die Rolle sein.
  function maxBreiteCm(rollenbreiteCm, einfassung) {
    return einfassung === 'cover' ? rollenbreiteCm - 10 : rollenbreiteCm;
  }

  // Kleinste Rolle, aus der sich die Breite schneiden laesst.
  function rolleFuer(wCm, rollen) {
    var sortiert = rollen.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < sortiert.length; i++) {
      if (wCm <= sortiert[i] + EPS) return sortiert[i];
    }
    return null;
  }

  function rollenAnzahl(areaM2, deckungM2) {
    if (!(deckungM2 > 0)) return 0;
    return Math.max(1, Math.ceil(areaM2 / deckungM2 - EPS));
  }

  // o: { form, w, l, maxW, maxL, minW, minL } in cm
  // Rechteck und Oval werden quer oder laengs aus der Rolle geschnitten:
  // entscheidend ist, dass die kuerzere Seite in die Rolle passt (maxW) und
  // die laengere hoechstens maxL misst. 500 x 300 aus der 400er-Rolle geht.
  function pruefeMasse(o) {
    var f = [];
    var minW = o.minW || 50;
    var minL = o.minL || 50;
    if (!(o.w > 0)) return ['Bitte Maße eingeben.'];
    if (o.form === 'rund') {
      if (o.w < minW) f.push('Durchmesser mindestens ' + minW + ' cm.');
      if (o.maxW && o.w > o.maxW) f.push('Durchmesser höchstens ' + o.maxW + ' cm.');
      return f;
    }
    if (!(o.l > 0)) return ['Bitte die Länge eingeben.'];
    var kurz = Math.min(o.w, o.l);
    var lang = Math.max(o.w, o.l);
    if (o.w < minW) f.push('Breite mindestens ' + minW + ' cm.');
    if (o.l < minL) f.push('Länge mindestens ' + minL + ' cm.');
    if (o.maxW && kurz > o.maxW) {
      f.push('Eine Seite darf höchstens ' + o.maxW + ' cm messen.');
    } else if (o.maxL && lang > o.maxL) {
      f.push('Die längere Seite darf höchstens ' + o.maxL + ' cm messen.');
    }
    return f;
  }

  // Menge in 0,01-m2-Einheiten inklusive Mindestpreis (alles in Cent).
  function mengeMitMindestpreis(areaM2, preisJeEinheitCent, mindestCent) {
    var menge = mengeHundertstelM2(areaM2);
    if (mindestCent > 0 && preisJeEinheitCent > 0 && menge * preisJeEinheitCent < mindestCent) {
      menge = Math.ceil(mindestCent / preisJeEinheitCent - EPS);
    }
    return menge;
  }

  root.TPMass = {
    flaecheM2: flaecheM2,
    abrechnungsflaecheM2: abrechnungsflaecheM2,
    echteFlaecheM2: echteFlaecheM2,
    umfangM: umfangM,
    mengeVolleM2: mengeVolleM2,
    mengeHundertstelM2: mengeHundertstelM2,
    raummassPreis: raummassPreis,
    maxBreiteCm: maxBreiteCm,
    rolleFuer: rolleFuer,
    rollenAnzahl: rollenAnzahl,
    pruefeMasse: pruefeMasse,
    mengeMitMindestpreis: mengeMitMindestpreis
  };
})(typeof window !== 'undefined' ? window : globalThis);
