// Raumansicht fuer Hartboeden (blocks/tp-boden-raumansicht.liquid):
// oeffnet den Dialog, schaltet die Verlegerichtung um und verlegt den Boden.
//
// Verlegen (2026-10-19): Das Herstellerbild wird nicht mehr als Ganzes gekachelt
// (das ergab ein Gitter aus immer gleichen hellen/dunklen Dielen und Stossfugen
// auf einer Linie). Stattdessen werden die Laengsfugen im Bild gesucht, die
// Dielenstreifen ausgeschnitten und zufaellig versetzt, teils um 180 Grad gedreht,
// neu verlegt. Fliesen (Format kuerzer als 2,6 : 1) werden fugengenau zugeschnitten.
// Der Boden wird zeilenweise perspektivisch auf ein Canvas gezeichnet - schaerfer
// als die CSS-3D-Ebene, die bleibt nur als Rueckfall.
// Alles bleibt aus dem echten Dekorbild; nichts wird erfunden.

const MAX_TEXTUR_PX = 2600;
const MAX_PX_JE_CM = 7;

/** Laenge und Breite aus "126,1 × 19,2 cm" */
function formatCm(text) {
  const z = (String(text || '').match(/\d+(?:[.,]\d+)?/g) || []).slice(0, 2).map((x) => parseFloat(x.replace(',', '.')));
  if (z.length < 2 || !(z[0] > 0) || !(z[1] > 0)) return null;
  return { laenge: Math.max(z[0], z[1]), breite: Math.min(z[0], z[1]) };
}

/** Wiederholbarer Zufall je Produkt */
function zufall(seed) {
  let a = (Number(String(seed).replace(/\D/g, '').slice(-9)) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ladeBild(url) {
  return new Promise((ok, fehler) => {
    const bild = new Image();
    bild.decoding = 'async';
    bild.onload = () => ok(bild);
    bild.onerror = () => fehler(new Error('Dekorbild nicht geladen'));
    bild.src = url;
  });
}

function leinwand(b, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(b));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Kantenprofil quer zu den Fugen: je Spalte (achse 'x') bzw. Zeile ('y') das 35-%-Perzentil
 * der Kantenstaerke. Durchgehende Fugen ragen heraus, Maserung nicht. von/bis begrenzen die
 * Gegenrichtung (z. B. nur eine Dielenspalte).
 */
function kantenprofil(lum, b, h, achse, von = 0, bis = achse === 'x' ? h : b) {
  const lang = achse === 'x' ? b : h;
  const schritt = Math.max(1, Math.floor((bis - von) / 600));
  const hist = new Uint32Array(lang * 256);
  let proben = 0;
  for (let q = von; q < bis; q += schritt) {
    proben++;
    for (let i = 1; i < lang - 2; i++) {
      let m = 0;
      for (let k = -1; k <= 1; k++) {
        const a = achse === 'x' ? lum[q * b + i + k] : lum[(i + k) * b + q];
        const c = achse === 'x' ? lum[q * b + i + k + 1] : lum[(i + k + 1) * b + q];
        const d = a > c ? a - c : c - a;
        if (d > m) m = d;
      }
      hist[i * 256 + m]++;
    }
  }
  const prof = new Float32Array(lang);
  const ziel = proben * 0.35;
  for (let i = 0; i < lang; i++) {
    let s = 0;
    let bin = 0;
    for (; bin < 255; bin++) {
      const n = hist[i * 256 + bin];
      if (s + n >= ziel) {
        prof[i] = bin + (n ? (ziel - s) / n : 0);
        break;
      }
      s += n;
    }
    if (bin === 255) prof[i] = 255;
  }
  // Randspalten ohne Messung (erste, letzte zwei) mit dem Nachbarwert fuellen
  prof[0] = prof[1];
  prof[lang - 2] = prof[lang - 1] = prof[lang - 3];
  // langsamen Verlauf abziehen, Raender ausblenden
  const fenster = Math.max(9, Math.round(lang / 34)) | 1;
  const halb = fenster >> 1;
  const aus = new Float32Array(lang);
  for (let i = 0; i < lang; i++) {
    const lo = Math.max(0, i - halb);
    const hi = Math.min(lang - 1, i + halb);
    let s = 0;
    for (let k = lo; k <= hi; k++) s += prof[k];
    aus[i] = prof[i] - s / (hi - lo + 1);
  }
  const rand = Math.max(6, Math.floor(lang / 80));
  for (let i = 0; i < rand; i++) aus[i] = aus[lang - 1 - i] = 0;
  return aus;
}

/** Profil auf eine Periode falten: Deutlichkeit (z) und Lage der Fuge */
function falten(prof, periode, betrag = false) {
  const n = Math.max(8, Math.round(periode));
  const s = new Float64Array(n);
  const z = new Uint32Array(n);
  for (let i = 0; i < prof.length; i++) {
    const bin = Math.floor(((i % periode) / periode) * n) % n;
    s[bin] += prof[i];
    z[bin]++;
  }
  for (let i = 0; i < n; i++) s[i] /= Math.max(1, z[i]);
  if (betrag) {
    // Fuge als schmale helle oder dunkle Linie bzw. Helligkeitssprung zwischen zwei Dielen
    const sortiert = Array.from(s).sort((a, c) => a - c);
    const median = sortiert[n >> 1];
    for (let i = 0; i < n; i++) s[i] = Math.abs(s[i] - median);
  }
  let best = 0;
  for (let i = 1; i < n; i++) if (s[i] > s[best]) best = i;
  let m = 0;
  let q = 0;
  let anz = 0;
  for (let i = 0; i < n; i++) {
    const abst = Math.min((i - best + n) % n, (best - i + n) % n);
    if (abst <= 1) continue;
    m += s[i];
    q += s[i] * s[i];
    anz++;
  }
  m /= anz;
  const sd = Math.sqrt(Math.max(1e-9, q / anz - m * m));
  return { z: (s[best] - m) / sd, phase: ((best + 0.5) / n) * periode };
}

/** Spaltenhelligkeit ohne langsamen Verlauf: Dielen unterscheiden sich im Ton, der Sprung liegt auf der Fuge */
function hellprofil(lum, b, h) {
  const m = new Float32Array(b);
  const schritt = Math.max(1, Math.floor(h / 600));
  let n = 0;
  for (let y = 0; y < h; y += schritt, n++) for (let x = 0; x < b; x++) m[x] += lum[y * b + x];
  const aus = new Float32Array(b);
  for (let x = 0; x < b; x++) {
    const lo = Math.max(0, x - 4);
    const hi = Math.min(b - 1, x + 4);
    let s = 0;
    for (let k = lo; k <= hi; k++) s += m[k];
    aus[x] = (m[x] - s / (hi - lo + 1)) / n;
  }
  const rand = Math.max(6, Math.floor(b / 80));
  for (let i = 0; i < rand; i++) aus[i] = aus[b - 1 - i] = 0;
  return aus;
}

function besteFuge(prof, periode, spanne = 0.03, betrag = false) {
  let best = { z: -Infinity, phase: 0, periode };
  for (let f = 1 - spanne; f <= 1 + spanne + 1e-9; f += 0.0025) {
    const r = falten(prof, periode * f, betrag);
    if (r.z > best.z) best = { ...r, periode: periode * f };
  }
  return best;
}

/** Helligkeitsverlauf der Aufnahme (Vignette, Licht von einer Seite) herausrechnen */
function lichtAusgleichen(daten, lum, b, h) {
  const n = 24;
  const zeilen = [];
  const werte = [];
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x0 = Math.floor((gx * b) / n);
      const x1 = Math.floor(((gx + 1) * b) / n);
      const y0 = Math.floor((gy * h) / n);
      const y1 = Math.floor(((gy + 1) * h) / n);
      let s = 0;
      let c = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { s += lum[y * b + x]; c++; }
      const u = (gx + 0.5) / n - 0.5;
      const v = (gy + 0.5) / n - 0.5;
      zeilen.push([1, u, v, u * u, v * v, u * v]);
      werte.push(s / Math.max(1, c));
    }
  }
  // Normalgleichungen 6x6
  const A = Array.from({ length: 6 }, () => new Float64Array(7));
  zeilen.forEach((r, k) => {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) A[i][j] += r[i] * r[j];
      A[i][6] += r[i] * werte[k];
    }
  });
  for (let i = 0; i < 6; i++) {
    let p = i;
    for (let k = i + 1; k < 6; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    for (let k = 0; k < 6; k++) {
      if (k === i) continue;
      const f = A[k][i] / A[i][i];
      for (let j = i; j < 7; j++) A[k][j] -= f * A[i][j];
    }
  }
  const c = A.map((r, i) => r[6] / r[i]);
  const mittel = werte.reduce((a, x) => a + x, 0) / werte.length;
  if (!(mittel > 8)) return;
  const fl = (u, v) => c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * v * v + c[5] * u * v;
  let min = Infinity;
  let max = -Infinity;
  for (const [, u, v] of zeilen) { const w = fl(u, v); min = Math.min(min, w); max = Math.max(max, w); }
  if ((max - min) / mittel < 0.02) return;
  const px = daten.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h - 0.5;
    for (let x = 0; x < b; x++) {
      const u = (x + 0.5) / b - 0.5;
      const f = Math.min(1.33, Math.max(0.75, mittel / Math.max(1, fl(u, v))));
      const i = (y * b + x) * 4;
      px[i] = px[i] * f;
      px[i + 1] = px[i + 1] * f;
      px[i + 2] = px[i + 2] * f;
    }
  }
}

/** Uebliche Verbaende als Versatz-Anteil: Kreuzfuge, Halb-, Drittel-, Viertelverband */
const VERBAENDE = [0, 1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4];

/**
 * Fliesen: Fliesenzellen fugengenau ausschneiden und im Verband der Aufnahme zufaellig neu
 * legen (je Zelle eine echte Fliese, teils um 180 Grad gedreht). Laufen die durchgehenden
 * Fugen waagerecht, wird das Bild dafuer gespiegelt (transponiert) und am Ende zurueck.
 */
function fliesenVerlegen(quelle, lum, b, h, pxJeCm, format, zufallszahl) {
  const kandidaten = [];
  for (const achse of ['x', 'y']) {
    const prof = kantenprofil(lum, b, h, achse);
    for (const [quer, entlang] of [[format.breite, format.laenge], [format.laenge, format.breite]]) {
      const r = besteFuge(prof, quer * pxJeCm, 0.02);
      kandidaten.push({ ...r, achse, querCm: quer, entlangCm: entlang });
    }
  }
  kandidaten.sort((a, c) => c.z - a.z);
  const wahl = kandidaten[0];
  if (!(wahl.z >= 5)) return null;
  const quer = wahl.achse === 'y';
  // Rahmen: durchgehende Fugen senkrecht, Bildbreite B, Hoehe H
  let B = b;
  let H = h;
  let bildQ = quelle;
  let L = lum;
  if (quer) {
    B = h;
    H = b;
    bildQ = leinwand(B, H);
    const c = bildQ.getContext('2d');
    c.setTransform(0, 1, 1, 0, 0, 0);
    c.drawImage(quelle, 0, 0);
    L = new Uint8Array(B * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) L[x * B + y] = lum[y * b + x];
  }
  const p = wahl.periode;
  const qSoll = wahl.entlangCm * pxJeCm;
  const spalten = [];
  for (let x = wahl.phase % p; x + p <= B + 0.5; x += p) {
    const xa = Math.max(0, Math.round(x));
    const rand = Math.max(2, Math.round(p * 0.06));
    const r = besteFuge(kantenprofil(L, B, H, 'y', xa + rand, Math.min(B, Math.round(x + p) - rand)), qSoll, 0.02);
    spalten.push({ x: xa, z: r.z, phase: r.phase, q: r.periode });
  }
  const zellen = [];
  spalten.forEach((s) => {
    if (!(s.z >= 4)) return;
    for (let y = s.phase % s.q; y + s.q <= H + 0.5; y += s.q) zellen.push({ x: s.x, y: Math.max(0, y), q: s.q });
  });
  if (zellen.length < 3) return null;
  // Verband aus den Nachbarspalten
  const zaehler = new Map();
  for (let i = 1; i < spalten.length; i++) {
    const a = spalten[i - 1];
    const c = spalten[i];
    if (!(a.z >= 4 && c.z >= 4)) continue;
    const f = ((((c.phase - a.phase) / qSoll) % 1) + 1) % 1;
    let best = null;
    for (const v of VERBAENDE) {
      const d = Math.min(Math.abs(f - v), 1 - Math.abs(f - v));
      if (d < 0.07 && (!best || d < best.d)) best = { v, d };
    }
    const key = best ? best.v : 'wild';
    zaehler.set(key, (zaehler.get(key) || 0) + 1);
  }
  let verband = 0;
  let meist = 0;
  zaehler.forEach((n, key) => { if (n > meist) { meist = n; verband = key; } });
  const teiler = verband === 'wild' || verband === 0 ? 1 : verband === 1 / 2 ? 2 : verband === 1 / 3 || verband === 2 / 3 ? 3 : 4;
  const pCm = p / pxJeCm;
  const qCm = qSoll / pxJeCm;
  const anzahl = Math.max(teiler, Math.round(Math.max(4, 300 / pCm) / teiler) * teiler);
  const reihen = Math.max(2, Math.round(300 / qCm));
  const tB = anzahl * pCm;
  const tH = reihen * qCm;
  const k = Math.min(pxJeCm, MAX_PX_JE_CM, MAX_TEXTUR_PX / tB, MAX_TEXTUR_PX / tH);
  const ziel = leinwand(tB * k, tH * k);
  const ctx = ziel.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const zh = qCm * k;
  let vor = -1;
  for (let j = 0; j < anzahl; j++) {
    const xl = Math.round(j * pCm * k);
    const xr = Math.round((j + 1) * pCm * k);
    const versatz = verband === 'wild' ? zufallszahl() * zh : (((j * verband) % 1) * zh);
    for (let r = 0; r < reihen; r++) {
      let n = Math.floor(zufallszahl() * zellen.length);
      if (zellen.length > 2 && n === vor) n = (n + 1) % zellen.length;
      vor = n;
      const z = zellen[n];
      const drehen = zufallszahl() < 0.5;
      const y0 = versatz + r * zh;
      for (const y of [y0, y0 - ziel.height]) {
        if (y >= ziel.height || y + zh <= 0) continue;
        ctx.save();
        if (drehen) {
          ctx.translate(xl + xr, 2 * y + zh);
          ctx.scale(-1, -1);
        }
        ctx.drawImage(bildQ, z.x, z.y, Math.min(p, B - z.x), Math.min(z.q, H - z.y), xl, y, xr - xl, zh);
        ctx.restore();
      }
    }
  }
  if (bildQ !== quelle) bildQ.width = bildQ.height = 0;
  if (!quer) return { bild: ziel, breiteCm: tB, hoeheCm: tH, art: 'fliesen' };
  const zurueck = leinwand(ziel.height, ziel.width);
  const c2 = zurueck.getContext('2d');
  c2.setTransform(0, 1, 1, 0, 0, 0);
  c2.drawImage(ziel, 0, 0);
  ziel.width = ziel.height = 0;
  return { bild: zurueck, breiteCm: tH, hoeheCm: tB, art: 'fliesen' };
}

/**
 * Dielen laenger als die Aufnahme (Landhausdielen 2,2 m auf einem 1,6-m-Foto): jeder
 * Dielenstreifen wird mit seinem Spiegelbild verlaengert (ohne Naht), echte Stossfugen der
 * Aufnahme bleiben, eigene Stossfugen kommen erst nach einer vollen Dielenlaenge dazu.
 */
function langeDielen({ quelle, lum, b, h, pxJeCm, format, spalten, p, fugenFarbe, zufallszahl }) {
  const hoeheCm = h / pxJeCm;
  const L = format.laenge;
  const T = 2 * hoeheCm; // Periode des gespiegelten Streifens = Texturhoehe
  // echte Stossfugen je Quellspalte (cm ab oben)
  const quellen = spalten.map((x0) => {
    const rand = Math.max(2, Math.round(p * 0.08));
    const prof = kantenprofil(lum, b, h, 'y', Math.round(x0) + rand, Math.min(b, Math.round(x0 + p) - rand));
    let m = 0;
    let q = 0;
    for (const v of prof) { m += v; q += v * v; }
    m /= prof.length;
    const sd = Math.sqrt(Math.max(1e-9, q / prof.length - m * m));
    const fugen = [];
    const abstand = 0.15 * L * pxJeCm;
    const kand = [];
    for (let y = 1; y < h - 1; y++) if ((prof[y] - m) / sd > 5 && prof[y] >= prof[y - 1] && prof[y] >= prof[y + 1]) kand.push(y);
    kand.sort((a, c) => prof[c] - prof[a]);
    for (const y of kand) if (fugen.every((f) => Math.abs(f - y) > abstand)) fugen.push(y);
    // Unruhe an den Streifenenden: Aeste oder Wolken dort wuerden gespiegelt sichtbar -> dort eine Stossfuge
    const sp = new Float32Array(h);
    const xa = Math.round(x0 + p * 0.1);
    const xb = Math.max(xa + 1, Math.round(x0 + p * 0.9));
    for (let y = 0; y < h; y++) {
      let summe = 0;
      for (let x = xa; x < xb; x += 2) summe += lum[y * b + x];
      sp[y] = summe / Math.ceil((xb - xa) / 2);
    }
    const glatt = Math.max(3, Math.round(4 * pxJeCm));
    const mittelwert = (y) => {
      let summe = 0;
      let n = 0;
      for (let k = Math.max(0, y - glatt); k <= Math.min(h - 1, y + glatt); k++) { summe += sp[k]; n++; }
      return summe / n;
    };
    const zone = Math.min(h >> 2, Math.round(25 * pxJeCm));
    let gesamt = 0;
    for (let y = 0; y < h; y++) gesamt += sp[y];
    gesamt /= h;
    let oben = 0;
    let unten = 0;
    const o0 = mittelwert(0);
    const u0 = mittelwert(h - 1);
    for (let y = 0; y < zone; y += 2) {
      oben = Math.max(oben, Math.abs(mittelwert(y) - o0));
      unten = Math.max(unten, Math.abs(mittelwert(h - 1 - y) - u0));
    }
    return { x: x0, fugen: fugen.map((y) => y / pxJeCm), fugeOben: oben / gesamt > 0.08, fugeUnten: unten / gesamt > 0.08 };
  });
  const dielenCm = format.breite;
  const anzahl = Math.min(40, Math.max(6, Math.round(320 / dielenCm)));
  const tB = anzahl * dielenCm;
  const k = Math.min(pxJeCm, MAX_PX_JE_CM, MAX_TEXTUR_PX / tB, MAX_TEXTUR_PX / T);
  const ziel = leinwand(tB * k, T * k);
  const ctx = ziel.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const linie = Math.max(1, Math.round(0.12 * k));
  const mod = (v) => ((v % T) + T) % T;
  const andereQuelle = (ausser) => {
    let n = Math.floor(zufallszahl() * quellen.length);
    if (quellen.length > 1 && n === ausser) n = (n + 1 + Math.floor(zufallszahl() * (quellen.length - 1))) % quellen.length;
    return n;
  };
  // Endet ein Abschnitt ruhig, geht es nahtlos mit seinem Spiegelbild weiter; sonst neue Quelle + Stossfuge.
  // ruhigesEnde: normal endet unten, gespiegelt endet oben
  const ruhigesEnde = (abschnitt) => (abschnitt.gespiegelt ? !quellen[abschnitt.s].fugeOben : !quellen[abschnitt.s].fugeUnten);
  const nahtlos = (von, nach) => von.s === nach.s && von.gespiegelt !== nach.gespiegelt && ruhigesEnde(von);
  let vorFugen = [];
  let vorQuelle = -1;
  for (let j = 0; j < anzahl; j++) {
    const xl = Math.round(j * dielenCm * k);
    const xr = Math.round((j + 1) * dielenCm * k);
    const erster = { s: andereQuelle(vorQuelle), gespiegelt: zufallszahl() < 0.5 };
    vorQuelle = erster.s;
    const zweiter = ruhigesEnde(erster)
      ? { s: erster.s, gespiegelt: !erster.gespiegelt }
      : { s: andereQuelle(erster.s), gespiegelt: zufallszahl() < 0.5 };
    const abschnitte = [erster, zweiter];
    const feste = [];
    abschnitte.forEach((ab, i) => {
      const y0 = i * hoeheCm;
      for (const f of quellen[ab.s].fugen) feste.push({ y: y0 + (ab.gespiegelt ? hoeheCm - f : f), echt: true });
      const vor = abschnitte[(i + abschnitte.length - 1) % abschnitte.length];
      if (!nahtlos(vor, ab)) feste.push({ y: y0, echt: false });
    });
    // Versatz so waehlen, dass die Stossfugen nicht neben denen der Nachbarreihe liegen
    let best = null;
    for (let versuch = 0; versuch < 10; versuch++) {
      const a = zufallszahl() * T;
      const fugen = stossfugen(feste.map((f) => ({ y: mod(f.y - a), echt: f.echt })), L, T, zufallszahl());
      let abst = Infinity;
      for (const f of fugen) for (const g of vorFugen) {
        const d = Math.abs(f.y - g.y);
        abst = Math.min(abst, d, T - d);
      }
      if (!best || abst > best.abst) best = { a, fugen, abst };
      if (abst >= 0.25 * L) break;
    }
    vorFugen = best.fugen;
    const spiegelnX = zufallszahl() < 0.5;
    const sh = hoeheCm * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(xl, 0, xr - xl, ziel.height);
    ctx.clip();
    for (const basis of [-best.a * k, -best.a * k + ziel.height]) {
      abschnitte.forEach((ab, i) => {
        const y0 = basis + i * sh;
        if (y0 >= ziel.height || y0 + sh <= 0) return;
        ctx.save();
        ctx.translate(spiegelnX ? xl + xr : 0, ab.gespiegelt ? 2 * y0 + sh : 0);
        ctx.scale(spiegelnX ? -1 : 1, ab.gespiegelt ? -1 : 1);
        ctx.drawImage(quelle, quellen[ab.s].x, 0, Math.min(p, b - quellen[ab.s].x), h, xl, y0, xr - xl, sh);
        ctx.restore();
      });
    }
    ctx.restore();
    ctx.fillStyle = fugenFarbe;
    for (const f of best.fugen) {
      if (f.echt) continue;
      const yf = Math.round(f.y * k);
      ctx.fillRect(xl, yf - (linie >> 1), xr - xl, linie);
      if (yf < linie) ctx.fillRect(xl, ziel.height + yf - (linie >> 1), xr - xl, linie);
    }
  }
  return { bild: ziel, breiteCm: tB, hoeheCm: T, art: 'dielen-lang' };
}

/** Stossfugen einer Reihe (cm, zyklisch in T): feste (echte und an unruhigen Spiegelstellen) behalten, Luecken laenger als L auffuellen */
function stossfugen(feste, L, T, zufallszahl) {
  const liste = [...feste].sort((a, c) => a.y - c.y);
  if (!liste.length) {
    const n = Math.max(1, Math.ceil(T / L - 0.05));
    const start = zufallszahl * (T / n);
    return Array.from({ length: n }, (_, i) => ({ y: (start + (i * T) / n) % T, echt: false }));
  }
  const aus = [...liste];
  for (let i = 0; i < liste.length; i++) {
    const von = liste[i].y;
    const bis = i + 1 < liste.length ? liste[i + 1].y : liste[0].y + T;
    let y = von + L;
    while (bis - y > 0.15 * L) {
      aus.push({ y: y % T, echt: false });
      y += L;
    }
  }
  return aus;
}

/**
 * Aus dem Dekorbild eine nahtlos wiederholbare Bodentextur bauen.
 * Rueckgabe { bild: Canvas, breiteCm, hoeheCm, art } oder null (dann Rueckfall).
 */
export function baueTextur(bild, angaben) {
  const fuge = {};
  const textur = verlegeTextur(bild, angaben, fuge);
  if (textur) textur.fuge = `z ${fuge.z?.toFixed(1)} phase ${fuge.phase?.toFixed(1)} periode ${fuge.periode?.toFixed(1)}`;
  return textur;
}

function verlegeTextur(bild, { breiteCm, format, seed }, merker) {
  const b = bild.naturalWidth;
  const h = bild.naturalHeight;
  if (!(b >= 400 && h >= 300 && breiteCm > 20 && format)) return null;
  const quelle = leinwand(b, h);
  const qctx = quelle.getContext('2d', { willReadFrequently: true });
  qctx.drawImage(bild, 0, 0);
  const daten = qctx.getImageData(0, 0, b, h); // wirft bei fremder Herkunft -> Rueckfall
  const px = daten.data;
  const lum = new Uint8Array(b * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;

  const pxJeCm = b / breiteCm;
  let fuge = besteFuge(kantenprofil(lum, b, h, 'x'), format.breite * pxJeCm);
  if (fuge.z < 5) {
    const hell = besteFuge(hellprofil(lum, b, h), format.breite * pxJeCm, 0.03, true);
    if (hell.z >= 6) fuge = { ...hell, z: Math.min(hell.z, 5.5) };
  }
  Object.assign(merker, fuge);
  lichtAusgleichen(daten, lum, b, h);
  qctx.putImageData(daten, 0, 0);

  const zufallszahl = zufall(seed);
  const hoeheCm = h / pxJeCm;
  const istDiele = format.laenge / format.breite >= 2.6;

  if (istDiele && fuge.z >= 5) {
    const p = fuge.periode;
    const start = fuge.phase % p;
    const spalten = [];
    for (let x = start; x + p <= b + 0.5; x += p) spalten.push(Math.max(0, x));
    if (spalten.length >= 2) {
      // Fugen hell oder dunkel? Fuer die neuen Stossfugen
      let anFuge = 0;
      let daneben = 0;
      let n = 0;
      for (const x0 of spalten) {
        const xi = Math.round(x0);
        if (xi < 8 || xi > b - 8) continue;
        for (let y = 0; y < h; y += 4) {
          anFuge += lum[y * b + xi];
          daneben += (lum[y * b + xi - 5] + lum[y * b + xi + 5]) / 2;
          n++;
        }
      }
      const unterschied = n ? (anFuge - daneben) / n : -20;
      const fugenFarbe = unterschied >= 0
        ? `rgb(255 255 255 / ${Math.min(0.4, Math.max(0.12, unterschied / 50))})`
        : `rgb(0 0 0 / ${Math.min(0.4, Math.max(0.15, -unterschied / 50))})`;
      if (format.laenge > hoeheCm * 1.05) {
        const lang = langeDielen({ quelle, lum, b, h, pxJeCm, format, spalten, p, fugenFarbe, zufallszahl });
        quelle.width = quelle.height = 0;
        return lang;
      }
      const dielenCm = format.breite;
      const anzahl = Math.min(40, Math.max(6, Math.round(320 / dielenCm)));
      const reihen = hoeheCm >= 150 ? 2 : hoeheCm >= 100 ? 3 : 4;
      const tBreiteCm = anzahl * dielenCm;
      const tHoeheCm = reihen * hoeheCm;
      const k = Math.min(pxJeCm, MAX_PX_JE_CM, MAX_TEXTUR_PX / tBreiteCm, MAX_TEXTUR_PX / tHoeheCm);
      const ziel = leinwand(tBreiteCm * k, tHoeheCm * k);
      const ctx = ziel.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const streifenH = hoeheCm * k;
      const linie = Math.max(1, Math.round(0.12 * k));
      let vorVersatz = -1;
      let vorQuelle = -1;
      for (let j = 0; j < anzahl; j++) {
        const xl = Math.round(j * dielenCm * k);
        const xr = Math.round((j + 1) * dielenCm * k);
        // Stossfugen der Nachbarreihe mindestens ein Fuenftel der Streifenlaenge entfernt
        let versatz = 0;
        for (let versuch = 0; versuch < 12; versuch++) {
          versatz = zufallszahl() * streifenH;
          if (vorVersatz < 0) break;
          const d = Math.abs(versatz - vorVersatz) % streifenH;
          if (Math.min(d, streifenH - d) >= 0.2 * streifenH) break;
        }
        vorVersatz = versatz;
        for (let r = 0; r < reihen; r++) {
          let s = Math.floor(zufallszahl() * spalten.length);
          if (spalten.length > 2 && s === vorQuelle) s = (s + 1 + Math.floor(zufallszahl() * (spalten.length - 1))) % spalten.length;
          vorQuelle = s;
          const drehen = zufallszahl() < 0.5;
          const y0 = versatz + r * streifenH;
          for (const y of [y0, y0 - ziel.height]) {
            if (y >= ziel.height || y + streifenH <= 0) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(xl, 0, xr - xl, ziel.height);
            ctx.clip();
            if (drehen) {
              ctx.translate(xl + xr, 2 * y + streifenH);
              ctx.scale(-1, -1);
            }
            ctx.drawImage(quelle, spalten[s], 0, Math.min(p, b - spalten[s]), h, xl, y, xr - xl, streifenH);
            ctx.restore();
            ctx.fillStyle = fugenFarbe;
            const yf = Math.round(y);
            if (yf >= 0 && yf < ziel.height) ctx.fillRect(xl, yf - (linie >> 1), xr - xl, linie);
          }
        }
      }
      quelle.width = quelle.height = 0;
      return { bild: ziel, breiteCm: tBreiteCm, hoeheCm: tHoeheCm, art: 'dielen' };
    }
  }

  if (!istDiele) {
    const fliesen = fliesenVerlegen(quelle, lum, b, h, pxJeCm, format, zufallszahl);
    if (fliesen) {
      quelle.width = quelle.height = 0;
      return fliesen;
    }
  }

  // Kork und Dekore ohne erkennbare Fugen: fugengenau zuschneiden und kacheln
  let x0 = 0;
  let cb = b;
  if (fuge.z >= 5) {
    x0 = fuge.phase % fuge.periode;
    const n = Math.floor((b - x0 + 0.5) / fuge.periode);
    if (n >= 1) cb = Math.min(b - x0, n * fuge.periode);
    else x0 = 0;
  }
  let y0 = 0;
  let ch = h;
  if (!istDiele) {
    const zprof = kantenprofil(lum, b, h, 'y');
    let besteY = null;
    for (const cm of [format.laenge, format.breite]) {
      const r = besteFuge(zprof, cm * pxJeCm, 0.02);
      if (!besteY || r.z > besteY.z) besteY = r;
    }
    if (besteY && besteY.z >= 5) {
      y0 = besteY.phase % besteY.periode;
      const n = Math.floor((h - y0 + 0.5) / besteY.periode);
      if (n >= 1) ch = Math.min(h - y0, n * besteY.periode);
      else y0 = 0;
    }
  }
  const kBreiteCm = cb / pxJeCm;
  const kHoeheCm = ch / pxJeCm;
  const k = Math.min(pxJeCm, MAX_PX_JE_CM, MAX_TEXTUR_PX / kBreiteCm, MAX_TEXTUR_PX / kHoeheCm);
  const ziel = leinwand(kBreiteCm * k, kHoeheCm * k);
  const ctx = ziel.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(quelle, x0, y0, cb, ch, 0, 0, ziel.width, ziel.height);
  quelle.width = quelle.height = 0;
  return { bild: ziel, breiteCm: kBreiteCm, hoeheCm: kHoeheCm, art: 'kachel' };
}

/** Verkleinerte Stufen gegen Flimmern in der Tiefe */
function stufen(textur) {
  const liste = [textur.bild];
  let c = textur.bild;
  while (c.width > 64 && c.height > 64 && liste.length < 6) {
    const n = leinwand(c.width / 2, c.height / 2);
    const ctx = n.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, n.width, n.height);
    liste.push(n);
    c = n;
  }
  return liste;
}

/**
 * Boden zeilenweise perspektivisch zeichnen. Geometrie wie die CSS-Ebene im Block:
 * Rueckwand-Unterkante = oberer Rand der Bodenflaeche, 1 m = 16 % der Raumbreite dort,
 * Augpunkt 79 % der Bodenhoehe ueber der Rueckwand-Unterkante, Perspektive 115 % der Raumbreite.
 */
function zeichneBoden(canvas, textur, liste, richtung) {
  const css = canvas.getBoundingClientRect();
  if (!css.width || !css.height) return false;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(css.width * dpr);
  canvas.height = Math.round(css.height * dpr);
  const ctx = canvas.getContext('2d');
  const W = css.width;
  const meter = 0.16 * W; // CSS-Pixel je Meter an der Rueckwand
  const d = 1.15 * W;
  const e = 0.79 * css.height;
  const muster = liste.map((c) => ctx.createPattern(c, 'repeat'));
  const k0 = textur.bild.width / textur.breiteCm; // Texturpixel je cm, Stufe 0
  const quer = richtung === 'quer';
  const versatzU = textur.breiteCm * 0.37;
  const versatzV = textur.hoeheCm * 0.61;
  const tiefe = (yCss) => {
    const k = (yCss + e) / e;
    return { k, cm: ((d * (1 - 1 / k)) / meter) * 100 };
  };
  for (let zeile = 0; zeile < canvas.height; zeile++) {
    const y = (zeile + 0.5) / dpr;
    const t = tiefe(y);
    const t2 = tiefe(y + 1 / dpr);
    const geraetePxJeCm = (t.k * meter * dpr) / 100;
    const kleinH = k0 / geraetePxJeCm;
    const kleinV = (t2.cm - t.cm) * k0;
    const stufe = Math.max(0, Math.min(liste.length - 1, Math.floor(Math.log2(Math.max(1, Math.max(kleinH, 0.6 * kleinV))))));
    const c = liste[stufe];
    const kx = c.width / textur.breiteCm;
    const ky = c.height / textur.hoeheCm;
    const pat = muster[stufe];
    // Bildschirm-x = Mitte + Massstab * (Texturkoordinate - Versatz)
    if (!quer) {
      const s = geraetePxJeCm / kx;
      const v = (t.cm + versatzV) * ky;
      pat.setTransform(new DOMMatrix([s, 0, 0, 1, (W * dpr) / 2 - s * versatzU * kx, zeile - v]));
    } else {
      const s = geraetePxJeCm / ky;
      const v = (t.cm + versatzU) * kx;
      pat.setTransform(new DOMMatrix([0, 1, s, 0, (W * dpr) / 2 - s * versatzV * ky, zeile - v]));
    }
    ctx.fillStyle = pat;
    ctx.fillRect(0, zeile, canvas.width, 1);
  }
  return true;
}

class TpBodenRaumansicht extends HTMLElement {
  #abort = new AbortController();
  #textur = null;
  #stufen = null;
  #bau = null;
  #beobachter = null;

  connectedCallback() {
    this.#abort = new AbortController();
    const signal = this.#abort.signal;
    const dialog = this.querySelector('.tp-raum__dialog');
    if (!dialog) return;
    this.querySelector('[data-tp-raum-open]')?.addEventListener('click', () => {
      dialog.showModal();
      this.verlegen();
    }, { signal });
    this.querySelector('[data-tp-raum-close]')?.addEventListener('click', () => dialog.close(), { signal });
    // Klick auf den abgedunkelten Hintergrund schliesst ebenfalls (nicht der Innenrand)
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const innen = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!innen) dialog.close();
    }, { signal });
    this.querySelectorAll('[data-tp-raum-richtung]').forEach((knopf) => {
      knopf.addEventListener('click', () => this.richtung(knopf.dataset.tpRaumRichtung), { signal });
    });
  }

  disconnectedCallback() {
    this.#abort.abort();
    this.#beobachter?.disconnect();
  }

  /** Einmal je Seite: Textur bauen; bei jedem Fehler die alte CSS-Ebene mit dem Originalbild */
  verlegen() {
    if (this.#bau) return this.#bau;
    const raum = this.querySelector('.tp-raum__raum');
    if (!raum) return Promise.resolve();
    const url = raum.dataset.tpRaumBild;
    const rueckfall = () => {
      raum.style.setProperty('--tp-raum-tex', `url('${url}')`);
      this.dataset.verlegt = 'css';
    };
    this.#bau = (async () => {
      try {
        const bild = await ladeBild(url);
        await new Promise((ok) => requestAnimationFrame(() => ok()));
        const textur = baueTextur(bild, {
          breiteCm: parseFloat(raum.dataset.tpRaumBreite),
          format: formatCm(raum.dataset.tpRaumFormat),
          seed: raum.dataset.tpRaumSeed,
        });
        if (!textur) return rueckfall();
        this.#textur = textur;
        this.#stufen = stufen(textur);
        if (!this.zeichnen()) return rueckfall();
        this.dataset.verlegt = textur.art;
        raum.dataset.tpRaumFuge = textur.fuge || '';
        const canvas = this.querySelector('.tp-raum__canvas');
        if ('ResizeObserver' in window && canvas) {
          let breite = canvas.clientWidth;
          this.#beobachter = new ResizeObserver(() => {
            if (canvas.clientWidth && Math.abs(canvas.clientWidth - breite) > 1) {
              breite = canvas.clientWidth;
              this.zeichnen();
            }
          });
          this.#beobachter.observe(canvas);
        }
      } catch (fehler) {
        rueckfall();
      }
    })();
    return this.#bau;
  }

  zeichnen() {
    const canvas = this.querySelector('.tp-raum__canvas');
    if (!canvas || !this.#textur) return false;
    return zeichneBoden(canvas, this.#textur, this.#stufen, this.dataset.richtung || 'laengs');
  }

  richtung(wert) {
    this.dataset.richtung = wert;
    this.querySelectorAll('[data-tp-raum-richtung]').forEach((knopf) => {
      knopf.setAttribute('aria-pressed', String(knopf.dataset.tpRaumRichtung === wert));
    });
    if (this.#textur) this.zeichnen();
  }
}

if (!customElements.get('tp-boden-raumansicht')) {
  customElements.define('tp-boden-raumansicht', TpBodenRaumansicht);
}
