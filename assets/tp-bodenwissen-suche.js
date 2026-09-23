/**
 * Vorschlaege fuer die Bodenwissen-Suche (sections/tp-bodenwissen-suche.liquid).
 *
 * Das Formular funktioniert ohne diese Datei - es ist ein gewoehnliches
 * GET-Formular auf /search. Hier kommt nur der Vorschlagsteil dazu. Deshalb
 * setzt erst dieses Skript die combobox-Auszeichnung: Ohne JavaScript gibt es
 * keine Liste, und eine aria-expanded-Angabe ohne Liste waere eine Luege
 * gegenueber dem Screenreader.
 *
 * Ereignisse an Shopify.analytics.publish und window.dataLayer, gleiches Muster
 * wie snippets/tp-lead-events.liquid:
 *   tp_bodenwissen_suche       { begriff, treffer }
 *   tp_bodenwissen_suche_leer  { begriff }   <- die Contentluecken-Quelle
 * Kein personenbezogenes Datum; der Begriff ist die Eingabe des Besuchers.
 */
(function () {
  'use strict';

  var MAX = 8;
  var MIN_ZEICHEN = 2;

  function melden(name, daten) {
    try {
      if (window.Shopify && window.Shopify.analytics && typeof window.Shopify.analytics.publish === 'function') {
        window.Shopify.analytics.publish(name, daten);
      }
      window.dataLayer = window.dataLayer || [];
      var kopie = { event: name };
      for (var schluessel in daten) {
        if (Object.prototype.hasOwnProperty.call(daten, schluessel)) kopie[schluessel] = daten[schluessel];
      }
      window.dataLayer.push(kopie);
    } catch (fehler) { /* Messung darf die Suche nie aufhalten */ }
  }

  // Umlaute falten, damit "ruckseite" auch "Rueckseite" findet und umgekehrt.
  function falten(text) {
    return String(text || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/\s+/g, ' ').trim();
  }

  function suchen(index, eingabe) {
    var begriff = falten(eingabe);
    if (begriff.length < MIN_ZEICHEN) return [];
    var woerter = begriff.split(' ');
    var treffer = [];
    for (var i = 0; i < index.length; i += 1) {
      var eintrag = index[i];
      var heuhaufen = eintrag._s || '';
      var alle = true;
      for (var w = 0; w < woerter.length; w += 1) {
        if (heuhaufen.indexOf(woerter[w]) === -1) { alle = false; break; }
      }
      if (!alle) continue;
      // Treffer am Titelanfang stehen oben - das ist fast immer das Gemeinte.
      eintrag._r = falten(eintrag.t).indexOf(begriff) === 0 ? 0 : 1;
      treffer.push(eintrag);
      if (treffer.length > 40) break;
    }
    treffer.sort(function (a, b) { return a._r - b._r; });
    return treffer.slice(0, MAX);
  }

  function aufbauen(form) {
    var input = form.querySelector('[data-tp-bw-input]');
    var liste = form.querySelector('[data-tp-bw-liste]');
    if (!input || !liste) return;

    // Der Index gehoert zu genau diesem Formular; die id steht am Formular.
    // Ueber DOM-Nachbarschaft zu suchen bricht, sobald die Section umgebaut wird.
    var quelle = document.getElementById(form.getAttribute('data-tp-bw-index-id'));
    var index = [];
    try { index = JSON.parse((quelle && quelle.textContent) || '[]'); } catch (fehler) { index = []; }
    if (!index.length) return;

    for (var i = 0; i < index.length; i += 1) {
      index[i]._s = falten(index[i].t + ' ' + (index[i].k || '') + ' ' + (index[i].s || ''));
    }

    var id = 'tp-bw-liste-' + Math.random().toString(36).slice(2, 8);
    liste.id = id;
    liste.setAttribute('role', 'listbox');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id);
    input.setAttribute('aria-autocomplete', 'list');

    var offen = [];
    var aktiv = -1;

    function schliessen() {
      liste.hidden = true;
      liste.textContent = '';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      offen = [];
      aktiv = -1;
    }

    function markieren(neu) {
      var knoten = liste.querySelectorAll('.tp-bw-suche__treffer');
      for (var i = 0; i < knoten.length; i += 1) knoten[i].setAttribute('aria-selected', i === neu ? 'true' : 'false');
      aktiv = neu;
      if (neu >= 0 && knoten[neu]) input.setAttribute('aria-activedescendant', knoten[neu].id);
      else input.removeAttribute('aria-activedescendant');
    }

    function zeichnen(treffer) {
      liste.textContent = '';
      if (!treffer.length) { schliessen(); return; }
      for (var i = 0; i < treffer.length; i += 1) {
        var eintrag = treffer[i];
        var li = document.createElement('li');
        li.setAttribute('role', 'presentation');
        var a = document.createElement('a');
        a.className = 'tp-bw-suche__treffer';
        a.id = id + '-' + i;
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', 'false');
        a.href = eintrag.u;
        var art = document.createElement('span');
        art.className = 'tp-bw-suche__art';
        art.textContent = eintrag.k || '';
        var titel = document.createElement('span');
        titel.textContent = eintrag.t;
        a.appendChild(art);
        a.appendChild(titel);
        li.appendChild(a);
        liste.appendChild(li);
      }
      offen = treffer;
      liste.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      markieren(-1);
    }

    input.addEventListener('input', function () { zeichnen(suchen(index, input.value)); });

    input.addEventListener('keydown', function (ereignis) {
      if (liste.hidden) return;
      var knoten = liste.querySelectorAll('.tp-bw-suche__treffer');
      if (ereignis.key === 'ArrowDown') { ereignis.preventDefault(); markieren(aktiv + 1 >= knoten.length ? 0 : aktiv + 1); }
      else if (ereignis.key === 'ArrowUp') { ereignis.preventDefault(); markieren(aktiv - 1 < 0 ? knoten.length - 1 : aktiv - 1); }
      else if (ereignis.key === 'Escape') { schliessen(); }
      else if (ereignis.key === 'Enter' && aktiv >= 0 && knoten[aktiv]) { ereignis.preventDefault(); knoten[aktiv].click(); }
    });

    document.addEventListener('click', function (ereignis) {
      if (!form.contains(ereignis.target)) schliessen();
    });

    form.addEventListener('submit', function () {
      var begriff = input.value.trim();
      if (!begriff) return;
      var treffer = suchen(index, begriff).length;
      melden('tp_bodenwissen_suche', { begriff: begriff, treffer: treffer });
      // Kein Treffer im eigenen Bestand: moegliche Contentluecke. Die Shop-Suche
      // laeuft trotzdem weiter - sie kennt auch Produkte, die hier nicht im Index stehen.
      if (treffer === 0) melden('tp_bodenwissen_suche_leer', { begriff: begriff });
    });
  }

  function start() {
    var formulare = document.querySelectorAll('[data-tp-bw-form]');
    for (var i = 0; i < formulare.length; i += 1) aufbauen(formulare[i]);
  }

  // Reine Logik nach aussen, damit qa/tests sie ohne Browser pruefen kann -
  // gleiches Muster wie assets/tp-masstepich-rechnung.js.
  var api = { falten: falten, suchen: suchen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.TPBodenwissenSuche = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
}());
