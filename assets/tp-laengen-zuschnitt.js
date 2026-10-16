/*
  Laengen-Zuschnitt fuer Profile nach Mass (blocks/tp-laengen-zuschnitt.liquid).

  Abgerechnet wird wie beim Kettelservice: Variantenpreis je 0,01 laufendem
  Meter (1 cm), Menge = Laenge je Stueck x Stueckzahl in cm. Shopify rechnet
  Variantenpreis x Menge - der Preis hier ist nur die Vorschau davon.

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

  // Eingaben pruefen und rechnen. Gibt {ok, fehler, menge, summeCent,
  // meterpreisCent, altSummeCent} zurueck; fehler ist leer, solange nur etwas fehlt.
  function rechnen(e) {
    var erg = { ok: false, fehler: '', menge: 0, summeCent: 0, meterpreisCent: 0, altSummeCent: 0 };
    var laenge = ganzzahl(e.laenge);
    var anzahl = ganzzahl(e.anzahl);
    var preis = Number(e.preisCent) || 0;
    if (!(preis > 0)) { erg.fehler = 'Diese Ausführung ist gerade nicht bestellbar.'; return erg; }
    if (e.laenge == null || String(e.laenge).trim() === '') return erg;
    if (laenge === null) { erg.fehler = 'Bitte die Länge in ganzen Zentimetern angeben.'; return erg; }
    if (laenge < e.minCm) { erg.fehler = 'Mindestens ' + e.minCm + ' cm je Stück.'; return erg; }
    if (laenge > e.maxCm) { erg.fehler = 'Höchstens ' + e.maxCm + ' cm je Stück.'; return erg; }
    if (anzahl === null || anzahl < 1) { erg.fehler = 'Bitte die Stückzahl angeben.'; return erg; }
    if (anzahl > e.maxStueck) { erg.fehler = 'Höchstens ' + e.maxStueck + ' Stück je Bestellung – für mehr bitte kurz bei uns melden.'; return erg; }
    erg.ok = true;
    erg.laenge = laenge;
    erg.anzahl = anzahl;
    erg.menge = laenge * anzahl;
    erg.summeCent = preis * erg.menge;
    erg.meterpreisCent = preis * 100;
    var alt = Number(e.vergleichCent) || 0;
    if (alt > preis) erg.altSummeCent = alt * erg.menge;
    return erg;
  }

  // Properties der Warenkorbzeile - dieselben Namen liest
  // snippets/tp-cart-gruppe.liquid ("Länge je Stück").
  function eigenschaften(erg, bohrung, gruppe) {
    return {
      'Länge je Stück': erg.laenge + ' cm',
      'Anzahl': erg.anzahl + ' Stück',
      'Gesamtlänge': meter(erg.menge) + ' m',
      'Bohrung': bohrung,
      '_Gruppe': gruppe
    };
  }

  root.TPLaengenZuschnitt = { rechnen: rechnen, eigenschaften: eigenschaften, euro: euro, meter: meter };

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

    function zeigen() {
      var v = aktuelleVariante();
      stand = null;
      var erg = rechnen({
        laenge: inLaenge.value,
        anzahl: inAnzahl.value,
        preisCent: v && v.available ? v.price : 0,
        vergleichCent: v ? v.compare_at_price : 0,
        minCm: d.min_cm,
        maxCm: d.max_cm,
        maxStueck: d.max_stueck
      });
      fehler.textContent = erg.fehler;
      fehler.hidden = !erg.fehler;
      if (!erg.ok) {
        rechnung.hidden = true;
        cta.disabled = true;
        return;
      }
      stand = { erg: erg, variante: v };
      summe.textContent = euro(erg.summeCent);
      summeAlt.textContent = erg.altSummeCent ? euro(erg.altSummeCent) : '';
      summeAlt.hidden = !erg.altSummeCent;
      rechenzeile.textContent = erg.anzahl + ' × ' + erg.laenge + ' cm = ' + meter(erg.menge) + ' m × ' + euro(erg.meterpreisCent) + '/m';
      rechnung.hidden = false;
      if (!inFlight) {
        cta.disabled = false;
        cta.textContent = 'In den Warenkorb';
      }
    }

    function hinzufuegen() {
      if (inFlight || !stand) return;
      var b = bohrung();
      if (!b) return;
      var gruppe = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      var zeile = { id: stand.variante.id, quantity: stand.erg.menge, properties: eigenschaften(stand.erg, b, gruppe) };
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
          cta.textContent = 'Im Warenkorb';
          cta.classList.add('is-done');
          warenkorb.hidden = false;
          document.dispatchEvent(new CustomEvent('cart:update', {
            bubbles: true,
            detail: { resource: item, sourceId: el.id, data: { itemCount: zeile.quantity, source: 'product-form-component' } }
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
    document.addEventListener('variant:update', function () { setTimeout(zeigen, 60); });
    window.addEventListener('popstate', function () { gewaehlt = null; zeigen(); });
    zeigen();
  }

  function alle() { document.querySelectorAll('[data-tp-lz]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alle);
  else alle();
  document.addEventListener('shopify:block:select', alle);
  document.addEventListener('shopify:section:load', alle);
})(typeof window !== 'undefined' ? window : globalThis);
