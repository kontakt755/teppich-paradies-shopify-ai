/**
 * Kleine, reine Hilfsfunktionen (keine Google-Dienste).
 */

/** Kaufmaennisch auf 2 Nachkommastellen runden (robust gegen 1.005-Fehler). */
function tpRunden2(x) {
  var n = Number(x);
  if (!isFinite(n)) return NaN;
  var vz = n < 0 ? -1 : 1;
  return vz * Math.round(Math.abs(n) * 100 + 1e-7) / 100;
}

/** Auf ein Vielfaches von schritt aufrunden (z. B. 0.5 fuer halbe Rollen). */
function tpAufrunden(x, schritt) {
  var s = schritt || 1;
  var n = Math.ceil(Number(x) / s - 1e-9) * s;
  return Math.round(n * 10000) / 10000;
}

/** Hat die Zahl hoechstens 2 Nachkommastellen? */
function tpHatZweiStellen(x) {
  return Math.abs(Math.round(Number(x) * 100) - Number(x) * 100) < 1e-6;
}

/** Deutsche Zahlschreibweise lesen: "4,15" -> 4.15, "1.234,5" -> 1234.5, leere Werte -> null. */
function tpZahl(wert) {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === 'number') return isFinite(wert) ? wert : null;
  var t = String(wert).trim().replace(/\s|€|m²|m2|lfm|%/gi, '');
  if (t === '') return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  var n = Number(t);
  return isFinite(n) ? n : null;
}

/** Ja/Nein aus Tabellenwerten. */
function tpJa(wert) {
  if (wert === true) return true;
  if (wert === false || wert === null || wert === undefined) return false;
  return /^(ja|j|x|yes|true|wahr|1)$/i.test(String(wert).trim());
}

/** Zahl deutsch formatieren: 1234.5 -> "1.234,50". */
function tpFormat(x, stellen) {
  var st = stellen === undefined ? 2 : stellen;
  var n = Number(x);
  if (!isFinite(n)) return '–';
  var teile = Math.abs(n).toFixed(st).split('.');
  teile[0] = teile[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + teile.join(',');
}

/** Menge ohne ueberfluessige Nullen: 6.5 -> "6,5", 42.25 -> "42,25". */
function tpFormatKurz(x) {
  var n = tpRunden2(x);
  return tpFormat(n, Number.isInteger(n) ? 0 : (Number.isInteger(n * 10) ? 1 : 2));
}

/** Stabiles JSON (Schluessel sortiert) fuer Fingerabdruecke. */
function tpStabilesJson(wert) {
  if (wert === null || typeof wert !== 'object') return JSON.stringify(wert);
  if (Array.isArray(wert)) return '[' + wert.map(tpStabilesJson).join(',') + ']';
  return '{' + Object.keys(wert).sort().filter(function (k) { return wert[k] !== undefined; })
    .map(function (k) { return JSON.stringify(k) + ':' + tpStabilesJson(wert[k]); }).join(',') + '}';
}

/** 64-Bit-Fingerabdruck (zwei FNV-1a-Laeufe), reicht fuer Dublettenschutz. */
function tpFingerabdruck(wert) {
  var text = tpStabilesJson(wert);
  function fnv(saat) {
    var h = saat >>> 0;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  return fnv(2166136261) + fnv(0x811c9dc5 ^ 0x5bd1e995);
}

/**
 * Datum fuer Lexware: "2026-10-13T00:00:00.000+02:00" (Europe/Berlin).
 * Sommerzeit: letzter Sonntag im Maerz bis letzter Sonntag im Oktober.
 */
function tpLexDatum(isoTag) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoTag));
  if (!m) throw new Error('Datum muss JJJJ-MM-TT sein: ' + isoTag);
  var j = Number(m[1]), mo = Number(m[2]), t = Number(m[3]);
  function letzterSonntag(monat) {
    var d = new Date(Date.UTC(j, monat, 0));
    return d.getUTCDate() - d.getUTCDay();
  }
  var sommer = (mo > 3 && mo < 10) ||
    (mo === 3 && t >= letzterSonntag(3)) ||
    (mo === 10 && t < letzterSonntag(10));
  return m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00.000' + (sommer ? '+02:00' : '+01:00');
}

/** Tage zu einem ISO-Tag addieren. */
function tpTagePlus(isoTag, tage) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoTag));
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + tage));
  return d.toISOString().slice(0, 10);
}
