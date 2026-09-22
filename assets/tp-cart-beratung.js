/*
  Beratung, Masspruefung und Verlegeanfrage im Warenkorb (Auftrag Shop 2.0,
  Abschnitte 11-14). Speichert die Antworten als Cart-Attribute per
  /cart/update.js, damit sie auch bei Express-Checkout (Shop Pay, Apple Pay,
  Google Pay) an der Bestellung haengen - der Warenkorb-Formularpost erreicht
  diese Buttons nicht.

  Pflichtentscheidung: "Beratung Ja/Nein" ohne Vorauswahl. Solange sie fehlt
  oder bei Ja die Telefonnummer fehlt, bleibt der Checkout-Button gesperrt und
  die Express-Buttons bleiben verborgen (Klasse tp-beratung-offen am Element).

  Reiner Kern (pruefen, attributeAus) haengt als TPCartBeratung an globalThis
  und ist ohne DOM testbar (qa/tests/tp-cart-beratung.test.mjs). Markup:
  snippets/tp-cart-beratung.liquid.
*/
(function (root) {
  'use strict';

  var KEYS = {
    beratung: 'Beratung',
    telefon: 'Telefon',
    zeit: 'Rückruf',
    thema: 'Beratungsthema',
    mass: 'Maßprüfung',
    verlegung: 'Verlegung'
  };

  var TEXT = {
    BERATUNG_FEHLT: 'Bitte wählen Sie, ob Sie eine persönliche Beratung wünschen.',
    TELEFON_FEHLT: 'Bitte geben Sie eine Telefonnummer an, damit wir Sie erreichen können.',
    TELEFON_UNGUELTIG: 'Bitte prüfen Sie die Telefonnummer (mindestens 6 Ziffern).'
  };

  function ziffern(s) {
    return String(s || '').replace(/[^0-9]/g, '');
  }

  function telefonGueltig(s) {
    var t = String(s || '').trim();
    if (!t) return false;
    if (!/^[+0-9 ()\/.\-]+$/.test(t)) return false;
    return ziffern(t).length >= 6;
  }

  // Antworten pruefen. ctx.masspruefung / ctx.verlegung sagen, ob die Frage
  // im Warenkorb ueberhaupt gestellt wurde (nur bei passenden Positionen).
  function pruefen(attrs, ctx) {
    attrs = attrs || {};
    ctx = ctx || {};
    var fehler = [];
    var beratung = attrs[KEYS.beratung] || '';
    var mass = attrs[KEYS.mass] || '';
    var telefonNoetig = beratung === 'Ja' || (ctx.masspruefung && mass === 'Ja');

    if (beratung !== 'Ja' && beratung !== 'Nein') fehler.push({ feld: KEYS.beratung, code: 'BERATUNG_FEHLT', text: TEXT.BERATUNG_FEHLT });
    if (telefonNoetig) {
      var tel = attrs[KEYS.telefon] || '';
      if (!String(tel).trim()) fehler.push({ feld: KEYS.telefon, code: 'TELEFON_FEHLT', text: TEXT.TELEFON_FEHLT });
      else if (!telefonGueltig(tel)) fehler.push({ feld: KEYS.telefon, code: 'TELEFON_UNGUELTIG', text: TEXT.TELEFON_UNGUELTIG });
    }
    return { ok: fehler.length === 0, fehler: fehler, telefonNoetig: telefonNoetig };
  }

  // Aus den Formularwerten den /cart/update.js-Body bauen. Leerer String
  // loescht ein Attribut. Bei "Nein" werden Telefon/Zeit/Thema nur dann
  // geleert, wenn keine Masspruefung sie braucht.
  function attributeAus(werte, ctx) {
    werte = werte || {};
    ctx = ctx || {};
    var beratung = werte.beratung === 'Ja' || werte.beratung === 'Nein' ? werte.beratung : '';
    var mass = ctx.masspruefung && (werte.mass === 'Ja' || werte.mass === 'Nein') ? werte.mass : '';
    var telefonNoetig = beratung === 'Ja' || mass === 'Ja';
    var out = {};
    out[KEYS.beratung] = beratung;
    out[KEYS.telefon] = telefonNoetig ? String(werte.telefon || '').trim() : '';
    out[KEYS.zeit] = beratung === 'Ja' ? String(werte.zeit || '').trim() : '';
    out[KEYS.thema] = beratung === 'Ja' ? String(werte.thema || '').trim().slice(0, 500) : '';
    out[KEYS.mass] = mass;
    out[KEYS.verlegung] = ctx.verlegung && werte.verlegung ? 'Angefragt' : '';
    return out;
  }

  function gleich(a, b) {
    var k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k) && String(a[k] || '') !== String(b[k] || '')) return false;
    return true;
  }

  root.TPCartBeratung = { KEYS: KEYS, TEXT: TEXT, pruefen: pruefen, attributeAus: attributeAus, telefonGueltig: telefonGueltig, gleich: gleich };

  if (typeof document === 'undefined' || typeof customElements === 'undefined' || customElements.get('tp-cart-beratung')) return;

  function publish(name, payload) {
    var data = payload || {};
    try {
      if (root.Shopify && root.Shopify.analytics && typeof root.Shopify.analytics.publish === 'function') root.Shopify.analytics.publish(name, data);
    } catch (e) {}
    try {
      root.dataLayer = root.dataLayer || [];
      var d = { event: name };
      for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) d[k] = data[k];
      root.dataLayer.push(d);
    } catch (e) {}
  }

  var Beratung = function () { return Reflect.construct(HTMLElement, [], Beratung); };
  Beratung.prototype = Object.create(HTMLElement.prototype);
  Beratung.prototype.constructor = Beratung;

  Beratung.prototype.connectedCallback = function () {
    var self = this;
    this.ctx = { masspruefung: this.hasAttribute('data-masspruefung'), verlegung: this.hasAttribute('data-verlegung') };
    this.gespeichert = this.werte();
    this.timer = null;
    this.onChange = function (ev) { self.aendern(ev); };
    this.onSubmit = function (ev) { self.submit(ev); };
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onChange);
    document.addEventListener('submit', this.onSubmit, true);
    this.anzeigen(false);
  };

  Beratung.prototype.disconnectedCallback = function () {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('input', this.onChange);
    document.removeEventListener('submit', this.onSubmit, true);
    if (this.timer) clearTimeout(this.timer);
  };

  Beratung.prototype.feld = function (name) {
    return this.querySelector('[data-tp-feld="' + name + '"]');
  };

  Beratung.prototype.werte = function () {
    var q = function (sel) { var el = this.querySelector(sel); return el ? el.value : ''; }.bind(this);
    var r = this.querySelector('input[data-tp-feld="beratung"]:checked');
    var m = this.querySelector('input[data-tp-feld="mass"]:checked');
    var v = this.querySelector('input[data-tp-feld="verlegung"]');
    return {
      beratung: r ? r.value : '',
      telefon: q('[data-tp-feld="telefon"]'),
      zeit: q('[data-tp-feld="zeit"]'),
      thema: q('[data-tp-feld="thema"]'),
      mass: m ? m.value : '',
      verlegung: !!(v && v.checked)
    };
  };

  Beratung.prototype.aendern = function (ev) {
    var self = this;
    var werte = this.werte();
    var ziel = ev && ev.target;
    if (ev && ev.type === 'change' && ziel && ziel.getAttribute) {
      var f = ziel.getAttribute('data-tp-feld');
      if (f === 'beratung') publish(werte.beratung === 'Ja' ? 'tp_beratung_ja' : 'tp_beratung_nein', {});
      if (f === 'mass' && werte.mass === 'Ja') publish('tp_masspruefung_ja', {});
      if (f === 'verlegung' && werte.verlegung) publish('tp_verlegung_angefragt', {});
    }
    this.anzeigen(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.speichern(); }, ev && ev.type === 'input' ? 600 : 150);
  };

  Beratung.prototype.speichern = function () {
    var self = this;
    var attrs = attributeAus(this.werte(), this.ctx);
    if (gleich(attrs, this.gespeichert)) return Promise.resolve();
    this.setAttribute('data-tp-speichert', '1');
    return fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributes: attrs })
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function () { self.gespeichert = attrs; })
      .catch(function () { self.fehlerText('Die Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es noch einmal.'); })
      .then(function () { self.removeAttribute('data-tp-speichert'); });
  };

  Beratung.prototype.fehlerText = function (text) {
    var box = this.querySelector('[data-tp-fehler]');
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
  };

  // Sichtbarkeit der Folgefelder, Sperre des Checkouts, Fehlertext (nur bei
  // "laut": nach Klick auf Zur Kasse).
  Beratung.prototype.anzeigen = function (laut) {
    var werte = this.werte();
    var attrs = attributeAus(werte, this.ctx);
    var ergebnis = pruefen(attrs, this.ctx);
    var details = this.querySelector('[data-tp-beratung-details]');
    var telefonBox = this.querySelector('[data-tp-telefon-box]');
    if (details) details.hidden = werte.beratung !== 'Ja';
    if (telefonBox) telefonBox.hidden = !ergebnis.telefonNoetig;
    this.classList.toggle('tp-beratung-offen', !ergebnis.ok);
    this.querySelectorAll('[data-tp-feld]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (laut && !ergebnis.ok) {
      this.fehlerText(ergebnis.fehler[0].text);
      var erstes = ergebnis.fehler[0].feld === KEYS.telefon ? this.feld('telefon') : this.querySelector('input[data-tp-feld="beratung"]');
      if (erstes) { erstes.setAttribute('aria-invalid', 'true'); try { erstes.focus(); } catch (e) {} }
    } else {
      this.fehlerText('');
    }
    var sperre = !ergebnis.ok;
    document.querySelectorAll('.cart__checkout-button').forEach(function (b) {
      if (sperre) b.setAttribute('data-tp-beratung-offen', '1'); else b.removeAttribute('data-tp-beratung-offen');
    });
    document.querySelectorAll('.additional-checkout-buttons').forEach(function (w) {
      w.classList.toggle('tp-beratung-offen', sperre);
    });
    return ergebnis;
  };

  // Zur Kasse: nur mit vollstaendigen Angaben. Der Formularpost traegt die
  // Attribute zusaetzlich mit (Inputs stehen im Cart-Formular), gespeichert
  // wird vorher trotzdem, damit Express-Buttons dieselben Daten sehen.
  Beratung.prototype.submit = function (ev) {
    var form = ev.target;
    if (!form || form.id !== 'cart-form') return;
    var submitter = ev.submitter;
    if (submitter && submitter.name !== 'checkout') return;
    var ergebnis = this.anzeigen(true);
    if (!ergebnis.ok) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      try { this.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }
  };

  customElements.define('tp-cart-beratung', Beratung);
})(typeof window !== 'undefined' ? window : globalThis);
