/*
 * tp-rug-core.js - Kern des Teppichbereichs (Entwurf).
 *
 * Eine Quelle fuer Formen, Grenzen, Pruefung, Zustand und Zeichnungen.
 * Keine Abhaengigkeiten: laeuft im Browser (Konfigurator, Berater,
 * Visualisierer) und in Node (scripts/tp-rug/build-assets.mjs, Tests).
 *
 * Preise gibt es bewusst nicht. quote() liefert nur einen Status, damit eine
 * spaetere Preislogik andocken kann, ohne die Oberflaeche anzufassen.
 * Einfassungsbegriffe: siehe domains/shopify/teppiche/einfassungen.md.
 */

/* ------------------------------------------------------------------ */
/* Grenzen und Stammdaten                                              */
/* ------------------------------------------------------------------ */

// Maximale Laenge gilt shopweit (Vorgabe 2026-09-11). Breitengrenzen kommen
// ausschliesslich aus den Produktdaten (max_width_cm) - nie pauschal.
export const LIMITS = Object.freeze({ maxLengthCm: 1000, tinyCm: 20 });

export const EDGES = Object.freeze({
  kettel: {
    label: 'Kettelung',
    short: 'Kettelung',
    visual: 'stitch',
    colorLabel: 'Garnfarbe',
    text: 'Die Kante wird mit Garn umstochen. Klassisch, flach und unauffällig.',
    width: 'schmale Garnkante',
    use: 'Wohnräume, Läufer, Objektbereich',
  },
  paspel: {
    label: 'Paspel',
    short: 'Paspel',
    visual: 'band',
    colorLabel: 'Bandfarbe',
    defaultWidthCm: 1,
    seam: true,
    text: 'Ein schmales Band fasst die Kante ein – dezent, mit sauberem Abschluss.',
    use: 'Wohn- und Schlafräume, dezente Optik',
  },
  baumwolle: {
    label: 'Baumwoll-Einfassband',
    short: 'Baumwolle',
    visual: 'band',
    colorLabel: 'Bandfarbe',
    defaultWidthCm: 3,
    text: 'Breites Band aus Baumwolle rahmt den Teppich sichtbar ein.',
    use: 'Wohn- und Esszimmer, Rahmen- oder Kontrastoptik',
  },
  cover: {
    label: 'Cover (Kippkante)',
    short: 'Cover',
    visual: 'fold',
    colorLabel: null,
    includesAntislip: true,
    text: 'Die Teppichkante wird nach unten umgeschlagen – ohne sichtbares Band. Ein Antirutschvlies darunter gehört fest dazu.',
    width: 'kein sichtbares Band',
    use: 'ruhige, bandlose Optik',
  },
});

// Randfarben sind Demo-Werte, bis die echten Band- und Garnfarben feststehen.
export const DEMO_EDGE_COLORS = Object.freeze([
  { key: 'passend', name: 'Passend zum Teppich', hex: null },
  { key: 'beige', name: 'Beige', hex: '#d6c4a4' },
  { key: 'grau', name: 'Grau', hex: '#9a9892' },
  { key: 'anthrazit', name: 'Anthrazit', hex: '#3b3d40' },
  { key: 'braun', name: 'Braun', hex: '#6f5442' },
  { key: 'kontrast', name: 'Kontrastfarbe', hex: null },
]);

export const DIMS = Object.freeze({
  width: { label: 'Breite' },
  length: { label: 'Länge' },
  side: { label: 'Seitenlänge' },
  diameter: { label: 'Durchmesser' },
  radius: { label: 'Radius' },
  a: { label: 'Seite a (Grundseite)' },
  b: { label: 'Seite b (links)' },
  c: { label: 'Seite c (rechts)' },
  corners: { label: 'Anzahl Ecken', unit: '', integer: true, min: 5, max: 8, fallback: 6 },
  edge: { label: 'Seitenlänge' },
});

// Organische Grundformen - eigene Entwuerfe im 100er-Raster (M/C/Z).
export const ORGANIC = Object.freeze({
  kiesel: { label: 'Kiesel', d: 'M46 3C74 1 97 16 97 42C97 70 86 96 55 97C26 98 4 84 3 57C2 30 18 5 46 3Z' },
  welle: { label: 'Welle', d: 'M20 2C45 5 60-1 84 3C98 20 88 36 94 50C100 66 88 80 90 97C64 101 44 95 16 98C2 82 12 66 6 50C0 34 12 18 20 2Z' },
  wolke: { label: 'Wolke', d: 'M30 8C40-2 60-2 70 8C86 6 98 20 94 36C102 50 98 70 86 76C88 92 70 100 58 92C48 102 26 100 22 88C6 90-2 72 8 62C-2 48 4 26 18 24C16 14 22 8 30 8Z' },
  blatt: { label: 'Blatt', d: 'M48 0C86 18 100 58 54 100C8 70 4 30 48 0Z' },
  lagune: { label: 'Lagune', d: 'M30 4C60-4 96 8 97 40C98 70 80 98 50 97C34 96 30 82 38 70C44 60 34 52 22 58C8 64 2 46 4 30C6 14 16 7 30 4Z' },
});

export const SHAPES = Object.freeze({
  rechteck: { label: 'Rechteck', group: 'standard', dims: ['width', 'length'] },
  quadrat: { label: 'Quadrat', group: 'standard', dims: ['side'] },
  rund: { label: 'Rund', group: 'standard', dims: ['diameter'] },
  oval: { label: 'Oval', group: 'standard', dims: ['width', 'length'], note: 'Gerade Längsseiten, halbrunde Enden.' },
  ellipse: { label: 'Ellipse', group: 'standard', dims: ['width', 'length'], note: 'Durchgehend gleichmäßig gerundet.' },
  laeufer: { label: 'Läufer', group: 'standard', dims: ['width', 'length'], note: 'Schmal und lang – für Flur, Küche oder neben dem Bett.' },
  halbkreis: { label: 'Halbkreis', group: 'sonder', dims: ['diameter'], note: 'Die gerade Kante entspricht dem Durchmesser, die Tiefe ergibt sich daraus.' },
  viertelkreis: { label: 'Viertelkreis', group: 'sonder', dims: ['radius'], note: 'Für Ecken: beide geraden Kanten sind so lang wie der Radius.' },
  dreieck: { label: 'Dreieck', group: 'sonder', dims: ['a', 'b', 'c'], note: 'Drei Seitenlängen genügen – die Form ergibt sich daraus.' },
  vieleck: { label: 'Vieleck', group: 'sonder', dims: ['corners', 'edge'], note: 'Gleichseitig mit 5 bis 8 Ecken. Ungleichmäßige Vielecke bitte als Sonderform anfragen.' },
  organisch: { label: 'Organische Form', group: 'sonder', dims: ['width', 'length'], variants: true, note: 'Weiche, freie Konturen – skaliert auf Ihr Maß.' },
  freiform: { label: 'Freiform', group: 'anfrage', request: 'beschreibung', note: 'Beschreiben Sie Ihre Wunschform – wir melden uns mit einer Rückfrage oder einem Vorschlag.' },
  skizze: { label: 'Nach Skizze', group: 'anfrage', request: 'skizze', note: 'Maße auf eine Skizze schreiben, fotografieren und hochladen.' },
  schablone: { label: 'Nach Schablone', group: 'anfrage', request: 'schablone', note: 'Schablone aus Papier oder Folie anfertigen – ideal für Fahrzeuge und Nischen.' },
});

export const SHAPE_GROUPS = Object.freeze({
  standard: 'Standardformen',
  sonder: 'Besondere Formen',
  anfrage: 'Sonderanfertigung auf Anfrage',
});

export const ROOMS = Object.freeze({
  wohnzimmer: 'Wohnzimmer',
  esszimmer: 'Esszimmer',
  schlafzimmer: 'Schlafzimmer',
  kueche: 'Küche',
  flur: 'Flur & Diele',
  kinderzimmer: 'Kinderzimmer',
  homeoffice: 'Arbeitszimmer / Homeoffice',
  eingang: 'Eingangsbereich',
  buero: 'Gewerbe / Büro',
  wohnmobil: 'Wohnmobil & Camper',
  outdoor: 'Terrasse & Outdoor',
});

/* ------------------------------------------------------------------ */
/* Zahlen und Texte                                                     */
/* ------------------------------------------------------------------ */

export function fmtCm(v) {
  return `${Math.round(v).toLocaleString('de-DE')} cm`;
}

export function fmtM(cm) {
  return `${(cm / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function fmtNum(v, digits = 2) {
  return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Liest eine Zentimeter-Eingabe. Erkennt typische Verwechslungen:
 * "2,5" (Meter statt cm), "1.000" (Tausenderpunkt), Text.
 */
export function parseCm(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, '').replace(/cm$/i, '');
  if (s === '') return { ok: false, error: 'empty' };
  if (/^\d{1,2}\.\d{3}$/.test(s)) return { ok: true, value: Number(s.replace('.', '')) };
  if (/^\d+$/.test(s)) return { ok: true, value: Number(s) };
  if (/^\d{1,2}[.,]\d{1,2}m?$/i.test(s)) {
    const meters = Number(s.replace(/m$/i, '').replace(',', '.'));
    return { ok: false, error: 'meter', suggestion: Math.round(meters * 100) };
  }
  if (/^\d+[.,]\d+$/.test(s)) {
    return { ok: false, error: 'decimal', suggestion: Math.round(Number(s.replace(',', '.'))) };
  }
  return { ok: false, error: 'nan' };
}

/* ------------------------------------------------------------------ */
/* Geometrie                                                            */
/* ------------------------------------------------------------------ */

function ellipsePts(w, l, n = 96) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([w / 2 + (w / 2) * Math.cos(t), l / 2 + (l / 2) * Math.sin(t)]);
  }
  return pts;
}

function stadiumPts(w, l, n = 40) {
  const pts = [];
  if (l >= w) {
    const r = w / 2;
    for (let i = 0; i <= n; i++) { const t = Math.PI + (i / n) * Math.PI; pts.push([r + r * Math.cos(t), r + r * Math.sin(t)]); }
    for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI; pts.push([r + r * Math.cos(t), l - r + r * Math.sin(t)]); }
  } else {
    const r = l / 2;
    for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + (i / n) * Math.PI; pts.push([w - r + r * Math.cos(t), r + r * Math.sin(t)]); }
    for (let i = 0; i <= n; i++) { const t = Math.PI / 2 + (i / n) * Math.PI; pts.push([r + r * Math.cos(t), r + r * Math.sin(t)]); }
  }
  return pts;
}

function parsePathD(d) {
  const tokens = d.match(/[MCZ]|-?\d*\.?\d+/g) || [];
  const segs = [];
  let i = 0;
  let cur = null;
  let start = null;
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === 'M') { cur = [Number(tokens[i++]), Number(tokens[i++])]; start = cur; }
    else if (t === 'C') {
      while (i < tokens.length && !/[MCZ]/.test(tokens[i])) {
        const c1 = [Number(tokens[i++]), Number(tokens[i++])];
        const c2 = [Number(tokens[i++]), Number(tokens[i++])];
        const p = [Number(tokens[i++]), Number(tokens[i++])];
        segs.push([cur, c1, c2, p]);
        cur = p;
      }
    } else if (t === 'Z' && start && cur && (cur[0] !== start[0] || cur[1] !== start[1])) {
      segs.push([cur, cur, start, start]);
    }
  }
  return segs;
}

function bezierPts(d, perSeg = 18) {
  const pts = [];
  for (const [p0, p1, p2, p3] of parsePathD(d)) {
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const mt = 1 - t;
      pts.push([
        mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
        mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  return pts;
}

function bbox(pts) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function fitTo(pts, w, l) {
  const b = bbox(pts);
  return pts.map(([x, y]) => [((x - b.x0) / (b.w || 1)) * w, ((y - b.y0) / (b.h || 1)) * l]);
}

function normalize(pts) {
  const b = bbox(pts);
  return pts.map(([x, y]) => [x - b.x0, y - b.y0]);
}

/**
 * Umriss einer Form in cm (Ursprung oben links). Gibt null zurueck, wenn die
 * Masse nicht fuer eine Zeichnung reichen (z. B. unmoegliches Dreieck).
 */
export function outline(shape, v = {}, variant = 'kiesel') {
  const w = v.width; const l = v.length;
  switch (shape) {
    case 'rechteck':
    case 'laeufer':
      return w > 0 && l > 0 ? [[0, 0], [w, 0], [w, l], [0, l]] : null;
    case 'quadrat':
      return v.side > 0 ? [[0, 0], [v.side, 0], [v.side, v.side], [0, v.side]] : null;
    case 'rund':
      return v.diameter > 0 ? ellipsePts(v.diameter, v.diameter) : null;
    case 'ellipse':
      return w > 0 && l > 0 ? ellipsePts(w, l) : null;
    case 'oval':
      return w > 0 && l > 0 ? stadiumPts(w, l) : null;
    case 'halbkreis': {
      const d = v.diameter; if (!(d > 0)) return null;
      const r = d / 2; const pts = [[0, 0], [d, 0]];
      for (let i = 1; i < 48; i++) { const t = (i / 48) * Math.PI; pts.push([r + r * Math.cos(t), r * Math.sin(t)]); }
      return pts;
    }
    case 'viertelkreis': {
      const r = v.radius; if (!(r > 0)) return null;
      const pts = [[0, 0], [r, 0]];
      for (let i = 1; i < 32; i++) { const t = (i / 32) * (Math.PI / 2); pts.push([r * Math.cos(t), r * Math.sin(t)]); }
      pts.push([0, r]);
      return pts;
    }
    case 'dreieck': {
      const { a, b, c } = v; if (!(a > 0 && b > 0 && c > 0)) return null;
      if (a + b <= c || a + c <= b || b + c <= a) return null;
      const cx = (a * a + b * b - c * c) / (2 * a);
      const cy = Math.sqrt(Math.max(0, b * b - cx * cx));
      return normalize([[0, cy], [a, cy], [cx, 0]]);
    }
    case 'vieleck': {
      const n = Math.round(v.corners); const s = v.edge;
      if (!(n >= 3 && n <= 12 && s > 0)) return null;
      const R = s / (2 * Math.sin(Math.PI / n));
      const start = Math.PI / 2 + Math.PI / n;
      const pts = [];
      for (let i = 0; i < n; i++) { const t = start + (i / n) * Math.PI * 2; pts.push([R * Math.cos(t), R * Math.sin(t)]); }
      return normalize(pts);
    }
    case 'organisch': {
      const org = ORGANIC[variant] || ORGANIC.kiesel;
      return w > 0 && l > 0 ? fitTo(bezierPts(org.d), w, l) : null;
    }
    default:
      return null;
  }
}

export function metrics(pts) {
  if (!pts || pts.length < 3) return null;
  let area = 0; let per = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
    per += Math.hypot(x2 - x1, y2 - y1);
  }
  const b = bbox(pts);
  return { areaM2: Math.abs(area) / 2 / 10000, perimeterM: per / 100, widthCm: b.w, lengthCm: b.h };
}

export function pathD(pts, dx = 0, dy = 0, s = 1) {
  return `M${pts.map(([x, y]) => `${(dx + x * s).toFixed(1)} ${(dy + y * s).toFixed(1)}`).join('L')}Z`;
}

/* ------------------------------------------------------------------ */
/* Pruefung                                                             */
/* ------------------------------------------------------------------ */

export function productLimits(product = {}) {
  const maxLen = Math.min(Number(product.max_length_cm) || LIMITS.maxLengthCm, LIMITS.maxLengthCm);
  const maxWidth = Number(product.max_width_cm) > 0 ? Math.min(Number(product.max_width_cm), maxLen) : null;
  return { maxLengthCm: maxLen, maxWidthCm: maxWidth };
}

function dimMessage(key, res, limits) {
  const label = DIMS[key]?.label || key;
  switch (res.error) {
    case 'empty': return `Bitte ${label} in Zentimetern eingeben.`;
    case 'meter': return `Bitte in Zentimetern eingeben: ${res.suggestion.toLocaleString('de-DE')} cm statt Meter.`;
    case 'decimal': return 'Bitte ganze Zentimeter eingeben, ohne Komma.';
    case 'nan': return 'Bitte nur Zahlen eingeben, z. B. 200.';
    case 'zero': return `${label} muss größer als 0 cm sein.`;
    case 'tiny': return `Das sind nur ${res.value} cm. Maße bitte in Zentimetern eingeben – ${res.value} m wären ${fmtCm(res.value * 100)}.`;
    case 'max': return `Maximal ${limits.maxLengthCm.toLocaleString('de-DE')} cm möglich.`;
    default: return 'Bitte prüfen Sie diese Angabe.';
  }
}

/**
 * Prueft alle Masse einer Form. raw: { width: '200', ... } (Strings oder Zahlen).
 * Ergebnis: { ok, values, errors: { feld: text }, suggestions: { feld: zahl }, outline, metrics }
 */
export function validateDims(shape, raw = {}, product = {}) {
  const spec = SHAPES[shape];
  const limits = productLimits(product);
  const errors = {}; const suggestions = {}; const values = {};
  if (!spec || !spec.dims) return { ok: false, values, errors: { _form: 'Bitte wählen Sie eine Form.' }, suggestions, limits };

  for (const key of spec.dims) {
    const def = DIMS[key];
    if (def.integer) {
      const n = Number(String(raw[key] ?? def.fallback).trim());
      if (!Number.isInteger(n) || n < def.min || n > def.max) errors[key] = `Bitte ${def.min} bis ${def.max} Ecken wählen – andere Formen gern als Sonderform nach Skizze.`;
      else values[key] = n;
      continue;
    }
    const res = parseCm(raw[key]);
    if (!res.ok) {
      errors[key] = dimMessage(key, res, limits);
      if (res.suggestion) suggestions[key] = res.suggestion;
      continue;
    }
    if (res.value <= 0) { errors[key] = dimMessage(key, { error: 'zero' }, limits); continue; }
    if (res.value < LIMITS.tinyCm) {
      errors[key] = dimMessage(key, { error: 'tiny', value: res.value }, limits);
      if (res.value * 100 <= limits.maxLengthCm) suggestions[key] = res.value * 100;
      continue;
    }
    if (res.value > limits.maxLengthCm) { errors[key] = dimMessage(key, { error: 'max' }, limits); continue; }
    values[key] = res.value;
  }

  let pts = null; let m = null;
  if (Object.keys(errors).length === 0) {
    if (shape === 'dreieck') {
      const { a, b, c } = values;
      if (a + b <= c || a + c <= b || b + c <= a) {
        errors.c = 'Mit diesen Seiten entsteht kein Dreieck: Die längste Seite muss kürzer sein als die beiden anderen zusammen.';
      }
    }
    pts = Object.keys(errors).length ? null : outline(shape, values, raw.variant);
    m = metrics(pts);
    if (m) {
      const longer = Math.max(m.widthCm, m.lengthCm);
      const shorter = Math.min(m.widthCm, m.lengthCm);
      const lastKey = spec.dims[spec.dims.length - 1];
      if (longer > limits.maxLengthCm + 0.5) {
        errors[lastKey] = `Mit diesen Maßen wird die Form ${fmtCm(longer)} lang. Maximal ${limits.maxLengthCm.toLocaleString('de-DE')} cm möglich.`;
      } else if (limits.maxWidthCm && shorter > limits.maxWidthCm + 0.5) {
        const shortKey = spec.dims.includes('width') && values.width <= (values.length ?? Infinity) ? 'width'
          : spec.dims.includes('length') ? 'length' : lastKey;
        errors[shortKey] = `Bei dieser Qualität ist die kürzere Seite bis ${fmtCm(limits.maxWidthCm)} möglich.`;
      }
    }
  }
  const ok = Object.keys(errors).length === 0;
  return { ok, values, errors, suggestions, limits, outline: ok ? pts : null, metrics: ok ? m : null };
}

/* ------------------------------------------------------------------ */
/* Zustand                                                               */
/* ------------------------------------------------------------------ */

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// Zentrale Konfiguration (ein Zustand fuer alle Bausteine).
export function emptyConfig(productHandle = '') {
  return {
    product: productHandle,
    color: '',
    shape: '',
    variant: 'kiesel',
    dims: {},
    edge: '',
    edgeColor: 'passend',
    antiSlip: false,
    room: '',
    notes: '',
    method: '',
    uploadedFiles: [],
    step: 0,
  };
}

const DRAFT_KEY = 'tp-rug-entwurf';
const HANDOFF_KEY = 'tp-rug-uebergabe';

function storage() {
  try { return window.sessionStorage; } catch (e) { return null; }
}

// Nur Konfiguration, nie Kontaktdaten oder Dateien.
export function saveDraft(state) {
  const s = storage(); if (!s) return;
  const { product, color, shape, variant, dims, edge, edgeColor, antiSlip, room, step } = state;
  try { s.setItem(DRAFT_KEY, JSON.stringify({ v: 1, product, color, shape, variant, dims, edge, edgeColor, antiSlip, room, step })); } catch (e) { /* voll */ }
}

export function loadDraft() {
  const s = storage(); if (!s) return null;
  try { const d = JSON.parse(s.getItem(DRAFT_KEY) || 'null'); return d && d.v === 1 ? d : null; } catch (e) { return null; }
}

export function clearDraft() {
  const s = storage(); if (s) try { s.removeItem(DRAFT_KEY); } catch (e) { /* egal */ }
}

// Uebergabe zwischen Seiten (Groessenberater -> Konfigurator, Visualisierer).
export function setHandoff(data) {
  const s = storage(); if (!s) return;
  try { s.setItem(HANDOFF_KEY, JSON.stringify({ ...data, at: Date.now() })); } catch (e) { /* egal */ }
}

export function takeHandoff() {
  const s = storage(); if (!s) return null;
  try {
    const d = JSON.parse(s.getItem(HANDOFF_KEY) || 'null');
    s.removeItem(HANDOFF_KEY);
    return d && Date.now() - d.at < 30 * 60 * 1000 ? d : null;
  } catch (e) { return null; }
}

// Teilen per Link (vorbereitet, ohne Server): kompakter base64url-Parameter.
export function encodeShare(state) {
  const payload = { p: state.product, c: state.color, s: state.shape, v: state.variant, d: state.dims, e: state.edge, ec: state.edgeColor, a: state.antiSlip ? 1 : 0, r: state.room };
  const json = JSON.stringify(payload);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(str) {
  try {
    const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    const p = JSON.parse(json);
    const dims = {};
    for (const [k, v] of Object.entries(p.d || {})) if (DIMS[k] || k === 'variant') dims[k] = String(v).slice(0, 8);
    return {
      product: String(p.p || '').slice(0, 120), color: String(p.c || '').slice(0, 60),
      shape: SHAPES[p.s] ? p.s : '', variant: ORGANIC[p.v] ? p.v : 'kiesel', dims,
      edge: EDGES[p.e] ? p.e : '', edgeColor: String(p.ec || 'passend').slice(0, 40), antiSlip: p.a === 1,
      room: ROOMS[p.r] ? p.r : '',
    };
  } catch (e) { return null; }
}

// Referenz fuer Anfragen. Wird nur im Browser erzeugt, nicht gespeichert.
export function makeReference(now = new Date()) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  const rnd = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(4)) : [1, 2, 3, 4].map(() => Math.floor(Math.random() * 256));
  for (const b of rnd) r += abc[b % abc.length];
  const d = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `TPT-${d}-${r}`;
}

// Preisschnittstelle: bewusst ohne Preis, bis Preise freigegeben sind.
export function quote() {
  return { status: 'none', text: 'Individuell konfigurierbar – Preise folgen.' };
}

/* ------------------------------------------------------------------ */
/* Produktdaten                                                          */
/* ------------------------------------------------------------------ */

// Normalisiert eine Produktkonfiguration (Metafeld tp_rug.config oder Demo).
// Fail closed: Unbekanntes wird weggelassen, nicht geraten.
export function normalizeProduct(p = {}) {
  const shapes = (p.shapes || []).filter((s) => SHAPES[s]);
  const edges = (p.edges || []).filter((e) => EDGES[e]);
  const colors = (p.colors || []).filter((c) => c && c.name).map((c) => ({ name: String(c.name), hex: /^#[0-9a-f]{6}$/i.test(c.hex || '') ? c.hex : null, image: c.image || null }));
  const antislip = ['optional', 'inklusive', 'nicht_verfuegbar'].includes(p.antislip) ? p.antislip : 'nicht_verfuegbar';
  const flags = {};
  for (const k of ['camper_suitable', 'outdoor_suitable', 'object_suitable', 'underfloor_heating', 'castor_chair', 'pet_friendly', 'easy_care']) {
    if (p[k] === true) flags[k] = true;
  }
  return {
    handle: String(p.handle || ''),
    title: String(p.title || ''),
    subtitle: String(p.subtitle || ''),
    material: String(p.material || ''),
    materialKey: String(p.material_key || ''),
    pile: String(p.pile || ''),
    fiber: String(p.fiber || ''),
    texture: String(p.texture || 'velours'),
    rooms: (p.rooms || []).filter((r) => ROOMS[r]),
    shapes,
    edges,
    edgeWidths: p.edge_widths || {},
    edgeColors: Array.isArray(p.edge_colors) && p.edge_colors.length ? p.edge_colors : DEMO_EDGE_COLORS,
    antislip,
    colors,
    max_width_cm: Number(p.max_width_cm) > 0 ? Number(p.max_width_cm) : null,
    max_width_note: p.max_width_note || '',
    max_length_cm: Math.min(Number(p.max_length_cm) || LIMITS.maxLengthCm, LIMITS.maxLengthCm),
    scene: String(p.scene || 'wohnzimmer'),
    flags,
    test: p.test === true,
    description: String(p.description || ''),
    url: String(p.url || ''),
    image: p.image || null,
  };
}

export function edgeLabel(product, edgeKey) {
  const e = EDGES[edgeKey]; if (!e) return '';
  const w = product?.edgeWidths?.[edgeKey] ?? e.defaultWidthCm;
  return w ? `${e.label} (ca. ${fmtNum(w, 0)} cm sichtbar)` : e.label;
}

export function antislipState(product, state) {
  if (EDGES[state.edge]?.includesAntislip) return 'inklusive';
  if (product.antislip === 'inklusive') return 'inklusive';
  if (product.antislip === 'optional') return state.antiSlip ? 'ja' : 'nein';
  return 'nicht_verfuegbar';
}

export function summaryLines(state, product, extra = {}) {
  const lines = [];
  lines.push(['Produkt', product.title || '–']);
  if (state.color) lines.push(['Farbe', state.color]);
  const shape = SHAPES[state.shape];
  if (shape) lines.push(['Form', state.shape === 'organisch' ? `${shape.label}: ${ORGANIC[state.variant]?.label || ''}` : shape.label]);
  if (shape?.dims) {
    const v = validateDims(state.shape, { ...state.dims, variant: state.variant }, product);
    for (const k of shape.dims) {
      const raw = v.values[k];
      if (raw != null) lines.push([DIMS[k].label, DIMS[k].integer ? String(raw) : fmtCm(raw)]);
    }
    if (v.metrics) lines.push(['Fläche', `ca. ${fmtNum(v.metrics.areaM2)} m²`], ['Kantenlänge', `ca. ${fmtNum(v.metrics.perimeterM)} m`]);
  } else if (shape?.request) {
    if (state.dims.width) lines.push(['Breite ca.', `${state.dims.width} cm`]);
    if (state.dims.length) lines.push(['Länge ca.', `${state.dims.length} cm`]);
  }
  if (state.edge) {
    lines.push(['Einfassung', edgeLabel(product, state.edge)]);
    const ecLabel = EDGES[state.edge].colorLabel;
    if (ecLabel) {
      const ec = (product.edgeColors || DEMO_EDGE_COLORS).find((c) => c.key === state.edgeColor || c.name === state.edgeColor);
      lines.push([ecLabel, ec ? ec.name : state.edgeColor || 'Passend zum Teppich']);
    }
  }
  const as = antislipState(product, state);
  if (as !== 'nicht_verfuegbar') lines.push(['Antirutschvlies', as === 'inklusive' ? 'inklusive (gehört zur Cover-Kante)' : as === 'ja' ? 'Ja' : 'Nein']);
  if (state.room) lines.push(['Einsatzort', ROOMS[state.room] || state.room]);
  if (extra.vehicle) lines.push(['Fahrzeug', extra.vehicle]);
  if (state.uploadedFiles?.length) lines.push(['Dateien', `${state.uploadedFiles.map((f) => f.name).join(', ')} (nicht mitgesendet – bitte nachreichen)`]);
  if (state.notes) lines.push(['Bemerkung', state.notes]);
  return lines;
}

export function summaryText(state, product, reference, extra = {}) {
  const lines = summaryLines(state, product, extra);
  const w = Math.max(...lines.map(([k]) => k.length));
  return [
    `Teppich-Konfiguration ${reference || ''}`.trim(),
    ...lines.map(([k, v]) => `${k.padEnd(w)} : ${v}`),
    '',
    'Hinweis: Unverbindliche Anfrage aus dem Teppich-Konfigurator (Entwurf, ohne Preise).',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Groessenberater                                                       */
/* ------------------------------------------------------------------ */

const up10 = (v) => Math.ceil(v / 10) * 10;

/**
 * Empfiehlt eine Teppichgroesse. Alle Regeln sind hier sichtbar und getestet
 * (qa/tests/tp-rug-core.test.mjs) - keine Magie in der Oberflaeche.
 */
export function adviseSize(place, i = {}) {
  const n = (k, d = 0) => (Number(i[k]) > 0 ? Number(i[k]) : d);
  let w = 0; let l = 0; let shape = 'rechteck'; const why = []; let extra = null;
  switch (place) {
    case 'wohnzimmer': {
      const sofaW = n('sofaBreite'); const sofaD = n('sofaTiefe', 90);
      const over = n('ueberstand', 20); const table = i.couchtisch !== false;
      const zone = table ? n('tischTiefe', 60) + 2 * 45 : 120;
      if (!sofaW) return null;
      if (i.anordnung === 'alle') {
        w = sofaW + 2 * over; l = sofaD + zone + (i.sessel ? n('sesselTiefe', 80) : 0) + 2 * over;
        why.push('Alle Möbel stehen vollständig auf dem Teppich.');
      } else if (i.anordnung === 'davor') {
        w = Math.max(120, sofaW - 20); l = zone;
        why.push('Der Teppich liegt nur vor dem Sofa, etwas schmaler als das Sofa.');
      } else {
        w = sofaW + 2 * over; l = 25 + zone + (i.sessel ? 25 : 0);
        why.push('Die Vorderfüße des Sofas stehen rund 25 cm auf dem Teppich.');
      }
      why.push(`Seitlich ${over} cm Überstand${table ? ', um den Couchtisch 45 cm Laufweg' : ''}.`);
      break;
    }
    case 'esszimmer': {
      const tl = n('tischLaenge'); const tb = n('tischBreite'); const cl = n('abstand', 70);
      if (!tl) return null;
      if (i.tischForm === 'rund') { shape = 'rund'; w = l = tl + 2 * cl; why.push(`Tischdurchmesser plus ${cl} cm Stuhlraum ringsum.`); }
      else { if (!tb) return null; w = tb + 2 * cl; l = tl + 2 * cl; why.push(`Tisch plus ${cl} cm auf jeder Seite – so bleiben die Stuhlbeine beim Zurückschieben auf dem Teppich.`); }
      if (cl < 60) why.push('Unter 60 cm Abstand rutschen die Stühle beim Aufstehen oft über die Kante.');
      break;
    }
    case 'schlafzimmer': {
      const bb = n('bettBreite'); const bl = n('bettLaenge', 200);
      if (!bb) return null;
      if (i.variante === 'komplett') { w = bb + 2 * 60; l = bl + 60; why.push('Das Bett steht ganz auf dem Teppich, ringsum 60 cm sichtbar.'); }
      else if (i.variante === 'seitlich') { shape = 'laeufer'; w = 70; l = up10(bl * 0.8); extra = 'Zwei Läufer – je einer links und rechts vom Bett.'; why.push('Je ein Läufer neben dem Bett, rund 80 % der Bettlänge.'); }
      else if (i.variante === 'fussende') { shape = 'laeufer'; w = 90; l = bb + 40; why.push('Quer am Fußende, beidseitig 20 cm breiter als das Bett.'); }
      else { w = bb + 2 * 50; l = up10(bl * 2 / 3) + 60; why.push('Die unteren zwei Drittel des Betts stehen auf dem Teppich, seitlich 50 cm sichtbar.'); }
      break;
    }
    case 'flur': {
      const fb = n('flurBreite'); const fl = n('flurLaenge');
      if (!fb || !fl) return null;
      shape = 'laeufer'; w = Math.max(60, fb - 2 * 15); l = fl - 2 * 30;
      why.push('Seitlich je 15 cm Boden sichtbar, an den Enden je 30 cm – Türen gehen frei auf.');
      break;
    }
    case 'kueche': {
      const zl = n('zeileLaenge'); const gang = n('gangBreite', 100);
      if (!zl) return null;
      shape = 'laeufer'; w = Math.min(90, Math.max(60, gang - 40)); l = zl - 20;
      why.push('Vor der Küchenzeile, an den Enden je 10 cm kürzer. Zum Gang hin bleibt Platz.');
      break;
    }
    case 'homeoffice': {
      const tb = n('tischBreite'); const tt = n('tischTiefe', 80);
      if (!tb) return null;
      w = tb + 2 * 30; l = tt + 100;
      why.push('Der Stuhl bleibt auch zurückgeschoben auf dem Teppich (100 cm hinter der Tischkante).');
      why.push('Bei Rollen: Eignung für Stuhlrollen bei der Qualität prüfen.');
      break;
    }
    case 'wohnmobil': {
      const fb = n('flaecheBreite'); const fl = n('flaecheLaenge');
      if (!fb || !fl) return null;
      w = fb; l = fl;
      why.push('Rechteck mit Ihren gemessenen Maßen.');
      why.push('Bei Schienen, Sitzkonsolen oder Rundungen ist eine Schablone sicherer.');
      break;
    }
    default: {
      const rb = n('raumBreite'); const rl = n('raumLaenge'); const ab = n('wandAbstand', 30);
      if (!rb || !rl) return null;
      w = rb - 2 * ab; l = rl - 2 * ab;
      why.push(`Zu jeder Wand ${ab} cm Abstand.`);
    }
  }
  w = up10(w); l = up10(l);
  if (shape === 'rechteck' && w > l) [w, l] = [l, w];
  const capped = Math.max(w, l) > LIMITS.maxLengthCm;
  if (capped) why.push('Größer als 10 m – bitte als Sonderanfertigung anfragen.');
  return { shape, width: Math.min(w, LIMITS.maxLengthCm), length: Math.min(l, LIMITS.maxLengthCm), why, extra, capped };
}

/* ------------------------------------------------------------------ */
/* Farben                                                                */
/* ------------------------------------------------------------------ */

function hexToRgb(hex) {
  const h = (hex || '#999999').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255; const p = Math.abs(amt);
  return rgbToHex([r + (t - r) * p, g + (t - g) * p, b + (t - b) * p]);
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function resolveEdgeColor(rugHex, edgeColor, edgeColors = DEMO_EDGE_COLORS) {
  const c = edgeColors.find((x) => x.key === edgeColor || x.name === edgeColor);
  if (c && c.hex) return c.hex;
  if (c && c.key === 'kontrast') return luminance(rugHex) > 0.3 ? '#34312d' : '#e8dfcf';
  return shade(rugHex, luminance(rugHex) > 0.3 ? -0.22 : 0.18);
}

/* ------------------------------------------------------------------ */
/* Zeichnungen                                                           */
/* ------------------------------------------------------------------ */

let uidCounter = 0;
const uid = (p = 'r') => `${p}${Date.now().toString(36).slice(-3)}${(uidCounter++).toString(36)}`;

const TEXTURES = {
  velours: { freq: 1.35, oct: 2, alpha: 0.22 },
  hochflor: { freq: 0.5, oct: 3, alpha: 0.34 },
  schlinge: { freq: 0.9, oct: 2, alpha: 0.2, pattern: 'loop' },
  sisal: { freq: 0.8, oct: 2, alpha: 0.2, pattern: 'weave' },
  flach: { freq: 0.9, oct: 2, alpha: 0.16, pattern: 'stripe' },
  wolle: { freq: 0.75, oct: 3, alpha: 0.26 },
};

function textureDefs(id, texture, hex, scale = 1) {
  const t = TEXTURES[texture] || TEXTURES.velours;
  const dark = shade(hex, -0.35); const light = shade(hex, 0.25);
  let pat = '';
  if (t.pattern === 'loop') {
    const s = 7 * scale;
    pat = `<pattern id="${id}p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.32}" fill="none" stroke="${dark}" stroke-opacity=".35" stroke-width="${s * 0.12}"/></pattern>`;
  } else if (t.pattern === 'weave') {
    const s = 10 * scale;
    pat = `<pattern id="${id}p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="M0 ${s / 4}H${s / 2}M${s / 2} ${s * 0.75}H${s}M${s / 4} ${s / 2}V${s}M${s * 0.75} 0V${s / 2}" stroke="${dark}" stroke-opacity=".32" stroke-width="${s * 0.16}"/></pattern>`;
  } else if (t.pattern === 'stripe') {
    const s = 8 * scale;
    pat = `<pattern id="${id}p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><rect width="${s}" height="${s * 0.45}" fill="${light}" fill-opacity=".22"/></pattern>`;
  }
  return `<filter id="${id}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${(t.freq / scale).toFixed(3)}" numOctaves="${t.oct}" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${t.alpha}"/></feComponentTransfer></filter>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>${pat}`;
}

/**
 * Zeichnet einen Teppich als SVG-Gruppe. d: Pfad in Bildkoordinaten.
 * edge: kettel|paspel|baumwolle|cover|'' ; bandPx: sichtbare Bandbreite.
 */
export function rugGroup(d, o) {
  const id = o.id || uid('g');
  const hex = o.color || '#b9a88f';
  const band = o.edgeHex || shade(hex, -0.2);
  const bw = Math.max(o.bandPx || 0, 0);
  const b = o.bbox || { x0: 0, y0: 0, w: 1000, h: 1000 };
  let edgeSvg = '';
  if (o.edge === 'baumwolle' || o.edge === 'paspel') {
    edgeSvg = `<path d="${d}" fill="none" stroke="${shade(band, -0.3)}" stroke-opacity=".55" stroke-width="${(bw * 2 + 1.6).toFixed(1)}"/><path d="${d}" fill="none" stroke="${band}" stroke-width="${(bw * 2).toFixed(1)}"/>`;
    if (o.edge === 'paspel') edgeSvg += `<path d="${d}" fill="none" stroke="${shade(band, -0.35)}" stroke-opacity=".6" stroke-width="${(bw * 2 + 3).toFixed(1)}" stroke-dasharray="2 2.4" filter="none" opacity=".5"/>`;
    else edgeSvg += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="${(bw * 0.7).toFixed(1)}"/>`;
  } else if (o.edge === 'kettel') {
    const dash = Math.max(bw * 0.34, 1.1); const gap = Math.max(bw * 0.22, 0.9);
    edgeSvg = `<path d="${d}" fill="none" stroke="${shade(band, 0.06)}" stroke-width="${(bw * 2).toFixed(1)}"/><path d="${d}" fill="none" stroke="${shade(band, -0.32)}" stroke-width="${(bw * 2).toFixed(1)}" stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}"/><path d="${d}" fill="none" stroke="${shade(band, -0.4)}" stroke-opacity=".5" stroke-width="${(bw * 2 + 1.4).toFixed(1)}" stroke-dasharray="0" opacity=".35"/>`;
  } else if (o.edge === 'cover') {
    // Umgeschlagene Kante: kein Band, nur eine weiche Rundung (Licht aussen, Schatten innen).
    edgeSvg = `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".1" stroke-width="${Math.max(bw * 2.4, 6).toFixed(1)}" filter="url(#${id}b)"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="${Math.max(bw * 0.5, 1.4).toFixed(1)}"/>`;
  }
  return `<defs>${textureDefs(id, o.texture, hex, o.textureScale || 1)}<clipPath id="${id}c"><path d="${d}"/></clipPath><filter id="${id}b"><feGaussianBlur stdDeviation="2.2"/></filter><filter id="${id}s" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="${o.shadowBlur ?? 5}"/></filter></defs>
${o.shadow === false ? '' : `<path d="${d}" fill="#000" opacity="${o.shadowOpacity ?? 0.18}" transform="translate(0 ${o.shadowOffset ?? 5})" filter="url(#${id}s)"/>`}
<path d="${d}" fill="${hex}"/>
<g clip-path="url(#${id}c)"><rect x="${b.x0 - 10}" y="${b.y0 - 10}" width="${b.w + 20}" height="${b.h + 20}" filter="url(#${id}n)"/>${TEXTURES[o.texture]?.pattern ? `<rect x="${b.x0 - 10}" y="${b.y0 - 10}" width="${b.w + 20}" height="${b.h + 20}" fill="url(#${id}p)"/>` : ''}<rect x="${b.x0 - 10}" y="${b.y0 - 10}" width="${b.w + 20}" height="${b.h + 20}" fill="url(#${id}g)"/>${edgeSvg}</g>
<path d="${d}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1"/>`;
}

function edgePx(edge, product, pxPerCm) {
  if (!edge) return 0;
  const e = EDGES[edge];
  const cm = product?.edgeWidths?.[edge] ?? e.defaultWidthCm ?? 1;
  const min = { kettel: 2.4, paspel: 3, baumwolle: 6, cover: 3 }[edge] || 2;
  return Math.max(cm * pxPerCm, min);
}

function arrow(x1, y1, x2, y2, label, side) {
  const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
  const vertical = Math.abs(x1 - x2) < 1;
  const tx = vertical ? mx + (side === 'left' ? -10 : 10) : mx;
  const ty = vertical ? my : my + (side === 'top' ? -10 : 18);
  return `<g class="tp-rug-dim"><path d="M${x1} ${y1}L${x2} ${y2}" stroke="currentColor" stroke-width="1.2"/><path d="M${x1} ${y1}l${vertical ? '-4 7m4-7l4 7' : '7 -4m-7 4l7 4'}M${x2} ${y2}l${vertical ? '-4 -7m4 7l4 -7' : '-7 -4m7 4l-7 4'}" stroke="currentColor" stroke-width="1.2" fill="none"/>
<text x="${tx}" y="${ty}" text-anchor="${vertical ? (side === 'left' ? 'end' : 'start') : 'middle'}" dominant-baseline="${vertical ? 'middle' : 'auto'}" font-size="13" font-weight="600" fill="currentColor">${esc(label)}</text></g>`;
}

/**
 * Draufsicht mit Massketten und 1-m-Massstab. Seitenverhaeltnis stimmt immer.
 */
export function previewSVG(state, product = {}, o = {}) {
  const W = o.width || 420; const H = o.height || 320; const pad = 46;
  const v = validateDims(state.shape, { ...state.dims, variant: state.variant }, product);
  const colorHex = (product.colors || []).find((c) => c.name === state.color)?.hex || o.fallbackColor || '#b8a78e';
  const id = uid('pv');
  if (!v.ok || !v.outline) {
    const hint = SHAPES[state.shape]?.request ? 'Sonderform – Vorschau folgt nach Ihrer Skizze' : 'Maße eingeben – die Vorschau zeichnet sich live mit';
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Noch keine Vorschau"><rect x="${pad}" y="${pad - 10}" width="${W - 2 * pad}" height="${H - 2 * pad}" rx="10" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="6 6"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="14" fill="currentColor" fill-opacity=".6">${esc(hint)}</text></svg>`;
  }
  const m = v.metrics;
  const s = Math.min((W - 2 * pad) / m.widthCm, (H - 2 * pad - 14) / m.lengthCm);
  const ox = (W - m.widthCm * s) / 2; const oy = (H - 14 - m.lengthCm * s) / 2;
  const d = pathD(v.outline, ox, oy, s);
  const edgeHex = resolveEdgeColor(colorHex, state.edgeColor, product.edgeColors);
  const rug = rugGroup(d, { id, color: colorHex, texture: product.texture, edge: state.edge, edgeHex, bandPx: edgePx(state.edge, product, s), bbox: { x0: ox, y0: oy, w: m.widthCm * s, h: m.lengthCm * s }, shadowOffset: 4, shadowBlur: 4, textureScale: 0.8 });
  const x0 = ox; const x1 = ox + m.widthCm * s; const y0 = oy; const y1 = oy + m.lengthCm * s;
  let dims = '';
  const vals = v.values;
  if (state.shape === 'rund') dims = arrow(x0, y1 + 16, x1, y1 + 16, `Ø ${fmtCm(vals.diameter)}`);
  else if (state.shape === 'dreieck' || state.shape === 'vieleck') dims = arrow(x0, y1 + 16, x1, y1 + 16, `Breite ca. ${fmtCm(m.widthCm)}`) + arrow(x1 + 16, y0, x1 + 16, y1, `ca. ${fmtCm(m.lengthCm)}`);
  else dims = arrow(x0, y1 + 16, x1, y1 + 16, fmtCm(m.widthCm)) + arrow(x1 + 16, y0, x1 + 16, y1, fmtCm(m.lengthCm));
  const bar = 100 * s;
  const scaleBar = bar > 18 && bar < W - 40 ? `<g class="tp-rug-scale" font-size="11" fill="currentColor"><path d="M14 ${H - 12}h${bar.toFixed(1)}" stroke="currentColor" stroke-width="3" stroke-opacity=".5"/><text x="14" y="${H - 18}">1 m</text></g>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Vorschau: ${SHAPES[state.shape].label}, ${fmtCm(m.widthCm)} × ${fmtCm(m.lengthCm)}`)}">${rug}${dims}${scaleBar}</svg>`;
}

/* --- Raumszenen (Illustration, kein Foto) -------------------------- */

// Lochkamera: gleiche Brennweite fuer x und y, Augenhoehe 150 cm, Horizont bei y=180.
const CAM = { W: 1200, H: 900, cy: 180, f: 840, camH: 0.3 };
const CM = 500; // 1 Welteinheit = 500 cm
const K = CAM.f / 760;

function P(X, Y, Z) {
  return [CAM.W / 2 + (CAM.f * X) / Z, CAM.cy + (CAM.f * (CAM.camH - Y)) / Z];
}

// Weicher Kontaktschatten unter Moebeln (Filter #fs in sceneSVG).
function contact(x0, x1, z0, z1, o = 0.16) {
  const e = 0.012;
  return poly([P(x0 - e, 0, z0 - e), P(x1 + e, 0, z0 - e), P(x1 + e, 0, z1 + e), P(x0 - e, 0, z1 + e)], '#000', `opacity="${o}" filter="url(#fs)"`);
}

const poly = (pts, fill, extra = '') => `<path d="M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z" fill="${fill}" ${extra}/>`;

function box(x0, x1, z0, z1, h, color, y0 = 0) {
  const top = poly([P(x0, h, z0), P(x1, h, z0), P(x1, h, z1), P(x0, h, z1)], shade(color, 0.1));
  const front = poly([P(x0, y0, z0), P(x1, y0, z0), P(x1, h, z0), P(x0, h, z0)], color);
  let side = '';
  if (x1 < 0) side = poly([P(x1, y0, z0), P(x1, y0, z1), P(x1, h, z1), P(x1, h, z0)], shade(color, -0.14));
  else if (x0 > 0) side = poly([P(x0, y0, z0), P(x0, y0, z1), P(x0, h, z1), P(x0, h, z0)], shade(color, -0.14));
  return side + top + front;
}

function wallRect(x0, x1, yb, yt, fill, extra = '') {
  return poly([P(x0, yb, 1), P(x1, yb, 1), P(x1, yt, 1), P(x0, yt, 1)], fill, extra);
}

function legs(x0, x1, z0, z1, h, color, t = 0.012) {
  return [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]].map(([x, z]) => box(x, x + t, z, z + t, h, color)).join('');
}

function sofa(x0, x1, z0, z1, color) {
  const arm = 0.045;
  return box(x0, x1, z1 - 0.045, z1, 0.18, shade(color, -0.05), 0.02) + box(x0 + arm, x1 - arm, z0, z1 - 0.04, 0.095, color, 0.02)
    + box(x0, x0 + arm, z0, z1, 0.13, shade(color, -0.03), 0.02) + box(x1 - arm, x1, z0, z1, 0.13, shade(color, -0.03), 0.02)
    + box(x0 + 0.06, x0 + 0.15, z1 - 0.07, z1 - 0.045, 0.17, shade(color, 0.28), 0.09) + box(x1 - 0.15, x1 - 0.06, z1 - 0.07, z1 - 0.045, 0.17, '#c98f6a', 0.09);
}

function chair(x, z, color, facing = 'back') {
  const s = 0.09;
  const back = facing === 'back' ? box(x, x + s, z + s - 0.012, z + s, 0.19, shade(color, -0.08), 0.09) : box(x, x + s, z, z + 0.012, 0.19, shade(color, -0.08), 0.09);
  return legs(x, x + s, z, z + s, 0.09, shade(color, -0.3), 0.008) + box(x, x + s, z, z + s, 0.095, color, 0.085) + back;
}

function plant(x, z, s = 1) {
  const [px, py] = P(x, 0.1 * s, z); const r = ((26 * s) / z) * 0.4 * K;
  return contact(x - 0.04 * s, x + 0.04 * s, z - 0.03 * s, z + 0.03 * s, 0.14) + box(x - 0.03 * s, x + 0.03 * s, z - 0.03 * s, z + 0.03 * s, 0.1 * s, '#c7b29a')
    + `<g fill="#6f8a64"><ellipse cx="${px}" cy="${py - r * 1.6}" rx="${r}" ry="${r * 1.9}"/><ellipse cx="${px - r}" cy="${py - r * 1.1}" rx="${r * 0.8}" ry="${r * 1.5}" transform="rotate(-24 ${px - r} ${py - r})" fill="#7d9a70"/><ellipse cx="${px + r}" cy="${py - r * 1.2}" rx="${r * 0.8}" ry="${r * 1.6}" transform="rotate(26 ${px + r} ${py - r})" fill="#5f7a56"/></g>`;
}

function lamp(x, z, h = 0.32) {
  const [bx, by] = P(x, 0, z); const [tx, ty] = P(x, h, z); const sw = (22 / z) * 0.5 * K;
  return `<path d="M${bx} ${by}L${tx} ${ty}" stroke="#3b3a38" stroke-width="${((3 / z) * 0.5 * K).toFixed(1)}"/><ellipse cx="${bx}" cy="${by}" rx="${sw * 0.7}" ry="${sw * 0.18}" fill="#3b3a38"/><path d="M${tx - sw} ${ty + sw * 0.9}L${tx + sw} ${ty + sw * 0.9}L${tx + sw * 0.6} ${ty - sw * 0.5}L${tx - sw * 0.6} ${ty - sw * 0.5}Z" fill="#efe3cc"/>`;
}

function windowOn(x0, x1, yb, yt) {
  const [ax, ay] = P(x0, yt, 1); const [bx, by] = P(x1, yb, 1);
  const w = bx - ax; const h = by - ay;
  return `<rect x="${ax}" y="${ay}" width="${w}" height="${h}" fill="#dfe9ee"/><rect x="${ax}" y="${ay}" width="${w}" height="${h}" fill="url(#skyG)"/><path d="M${ax + w / 2} ${ay}V${by}M${ax} ${ay + h * 0.42}H${bx}" stroke="#f7f4ef" stroke-width="5"/><rect x="${ax}" y="${ay}" width="${w}" height="${h}" fill="none" stroke="#f7f4ef" stroke-width="7"/><path d="M${ax - 8} ${by + 4}H${bx + 8}" stroke="#e6dfd4" stroke-width="7"/>`;
}

function picture(x0, x1, yb, yt, color) {
  const [ax, ay] = P(x0, yt, 1); const [bx, by] = P(x1, yb, 1);
  return `<rect x="${ax}" y="${ay}" width="${bx - ax}" height="${by - ay}" fill="#fbf8f3" stroke="#3a3632" stroke-width="3"/><path d="M${ax + 10} ${by - 10}Q${(ax + bx) / 2} ${ay + (by - ay) * 0.2} ${bx - 10} ${by - 14}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="${ax + (bx - ax) * 0.7}" cy="${ay + (by - ay) * 0.35}" r="${(bx - ax) * 0.09}" fill="${shade(color, 0.3)}"/>`;
}

function door(x0, x1, color = '#f3efe8') {
  const [ax, ay] = P(x0, 0.42, 1); const [bx, by] = P(x1, 0, 1);
  return `<rect x="${ax}" y="${ay}" width="${bx - ax}" height="${by - ay}" fill="${color}" stroke="#d9d1c5" stroke-width="3"/><rect x="${ax + 10}" y="${ay + 12}" width="${bx - ax - 20}" height="${(by - ay) * 0.4}" fill="none" stroke="#e3dbcf" stroke-width="2"/><circle cx="${bx - 14}" cy="${ay + (by - ay) * 0.55}" r="4" fill="#8f8a82"/>`;
}

// Legt einen Umriss (cm) auf den Boden: Mittelpunkt (X, Z), quer = Laenge entlang X.
function floorRug(pts, X, Z, across = true) {
  const m = metrics(pts); const cx = m.widthCm / 2; const cy = m.lengthCm / 2;
  return pts.map(([x, y]) => {
    const u = across ? (y - cy) / CM : (x - cx) / CM;
    const v = across ? (x - cx) / CM : (cy - y) / CM;
    return P(X + u, 0.002, Z + v);
  });
}

const SCENE_DEFS = {
  wohnzimmer: { wall: '#ece5da', floor: 'holz', rug: { shape: 'rechteck', w: 200, l: 300, X: 0, Z: 0.75, across: true }, draw: 'wohnzimmer' },
  esszimmer: { wall: '#e9e3d8', floor: 'holz', rug: { shape: 'rechteck', w: 240, l: 320, X: 0, Z: 0.72, across: true }, draw: 'esszimmer' },
  schlafzimmer: { wall: '#e6e1dc', floor: 'holz', rug: { shape: 'rechteck', w: 200, l: 300, X: 0, Z: 0.74, across: true }, draw: 'schlafzimmer' },
  kueche: { wall: '#edeae3', floor: 'fliese', rug: { shape: 'laeufer', w: 80, l: 280, X: 0, Z: 0.73, across: true }, draw: 'kueche' },
  flur: { wall: '#ebe6de', floor: 'holz', narrow: true, rug: { shape: 'laeufer', w: 80, l: 300, X: 0, Z: 0.6, across: false }, draw: 'flur' },
  kinderzimmer: { wall: '#e8ece6', floor: 'holz', rug: { shape: 'rund', w: 200, l: 200, X: 0.02, Z: 0.68, across: true }, draw: 'kinderzimmer' },
  homeoffice: { wall: '#e7e5e1', floor: 'holz', rug: { shape: 'rechteck', w: 160, l: 230, X: 0.05, Z: 0.72, across: true }, draw: 'homeoffice' },
  eingang: { wall: '#ebe6de', floor: 'fliese', rug: { shape: 'rechteck', w: 90, l: 150, X: 0, Z: 0.8, across: true }, draw: 'eingang' },
  buero: { wall: '#e4e6e7', floor: 'beton', rug: { shape: 'rechteck', w: 250, l: 400, X: 0, Z: 0.72, across: true }, draw: 'buero' },
  wohnmobil: { wall: '#ece7df', floor: 'vinyl', narrow: true, rug: { shape: 'wohnmobil', w: 90, l: 220, X: 0, Z: 0.6, across: false }, draw: 'wohnmobil' },
  outdoor: { wall: 'sky', floor: 'deck', rug: { shape: 'rechteck', w: 200, l: 290, X: 0, Z: 0.72, across: true }, draw: 'outdoor' },
  sonderform: { wall: '#ebe4db', floor: 'holz', rug: { shape: 'organisch', variant: 'kiesel', w: 210, l: 290, X: 0, Z: 0.72, across: true }, draw: 'sonderform' },
  rund: { wall: '#ece5da', floor: 'holz', rug: { shape: 'rund', w: 220, l: 220, X: 0, Z: 0.7, across: true }, draw: 'rund' },
};

export const SCENES = Object.freeze(Object.fromEntries(Object.keys(SCENE_DEFS).map((k) => [k, true])));

function floorLayer(kind, narrow) {
  const xl = narrow ? -0.24 : -0.62; const xr = -xl;
  const back = [P(xl, 0, 1), P(xr, 0, 1)];
  const colors = { holz: ['#c9ab85', '#b9976f'], fliese: ['#d8d3ca', '#c6c0b5'], beton: ['#c9c6c0', '#b6b2ab'], vinyl: ['#cdb89a', '#b9a283'], deck: ['#a98f73', '#8f775f'] }[kind] || ['#c9ab85', '#b9976f'];
  let s = `<rect x="0" y="${back[0][1]}" width="${CAM.W}" height="${CAM.H - back[0][1]}" fill="url(#floorG)"/><defs><linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(colors[0], -0.06)}"/><stop offset="1" stop-color="${shade(colors[0], 0.08)}"/></linearGradient></defs>`;
  if (kind === 'holz' || kind === 'vinyl') {
    for (let x = xl; x <= xr + 1e-6; x += narrow ? 0.06 : 0.09) { const a = P(x, 0, 1); const b = P(x, 0, 0.25); s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${colors[1]}" stroke-width="1.4" opacity=".55"/>`; }
  } else if (kind === 'deck') {
    for (let z = 1; z > 0.3; z -= 0.045) { const a = P(-2, 0, z); const b = P(2, 0, z); s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${colors[1]}" stroke-width="2" opacity=".6"/>`; }
  } else if (kind === 'fliese') {
    for (let x = xl; x <= xr + 1e-6; x += 0.12) { const a = P(x, 0, 1); const b = P(x, 0, 0.25); s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#fff" stroke-width="1.2" opacity=".5"/>`; }
    for (let z = 1; z > 0.3; z -= 0.12) { const a = P(-2, 0, z); const b = P(2, 0, z); s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#fff" stroke-width="1.2" opacity=".5"/>`; }
  }
  return s;
}

function wallLayer(color, narrow) {
  const xl = narrow ? -0.24 : -0.62; const xr = -xl;
  const [bl] = [P(xl, 0, 1)]; const br = P(xr, 0, 1);
  if (color === 'sky') {
    return `<rect width="${CAM.W}" height="${bl[1]}" fill="url(#skyG)"/><path d="M0 ${bl[1] - 120}Q300 ${bl[1] - 190} 600 ${bl[1] - 140}T1200 ${bl[1] - 150}V${bl[1]}H0Z" fill="#8ea37f"/><path d="M0 ${bl[1] - 60}Q260 ${bl[1] - 110} 520 ${bl[1] - 70}T1200 ${bl[1] - 80}V${bl[1]}H0Z" fill="#7a9068"/>`;
  }
  const side = shade(color, -0.06);
  return `<defs><linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, 0.35)}"/><stop offset="1" stop-color="${shade(color, -0.03)}"/></linearGradient></defs><rect width="${CAM.W}" height="${bl[1] + 1}" fill="url(#wallG)"/><path d="M0 0L${bl[0]} 0L${bl[0]} ${bl[1]}L${P(xl, 0, 0.25)[0]} ${CAM.H}L0 ${CAM.H}Z" fill="${side}"/><path d="M${CAM.W} 0L${br[0]} 0L${br[0]} ${br[1]}L${P(xr, 0, 0.25)[0]} ${CAM.H}L${CAM.W} ${CAM.H}Z" fill="${side}"/><path d="M${bl[0]} ${bl[1]}H${br[0]}" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>`;
}

function furniture(kind) {
  switch (kind) {
    case 'wohnzimmer':
      return windowOn(-0.5, -0.3, 0.16, 0.44) + picture(0.08, 0.26, 0.26, 0.4, '#b5694a') + lamp(-0.36, 0.9) + plant(0.42, 0.9)
        + contact(-0.3, 0.3, 0.8, 0.98) + sofa(-0.3, 0.3, 0.8, 0.98, '#7f8b7c') + contact(-0.12, 0.12, 0.62, 0.72, 0.12)
        + box(-0.12, 0.12, 0.62, 0.72, 0.075, '#b08a64', 0.06) + legs(-0.11, 0.11, 0.63, 0.71, 0.062, '#6a543f', 0.01);
    case 'rund':
      return windowOn(-0.46, -0.26, 0.16, 0.44) + picture(0.1, 0.24, 0.24, 0.4, '#6f7552') + plant(0.36, 0.86)
        + contact(-0.33, -0.19, 0.74, 0.86) + box(-0.33, -0.19, 0.74, 0.86, 0.09, '#b98e6f', 0.03) + box(-0.33, -0.19, 0.84, 0.86, 0.18, '#a67d60', 0.03)
        + contact(-0.05, 0.05, 0.66, 0.74, 0.12) + box(-0.05, 0.05, 0.66, 0.74, 0.07, '#8b6d52', 0.0);
    case 'esszimmer': {
      let s = windowOn(0.26, 0.48, 0.16, 0.44) + picture(-0.3, -0.12, 0.26, 0.4, '#8fa08a');
      for (const x of [-0.2, -0.045, 0.11]) s += chair(x, 0.83, '#9a8069', 'back');
      s += box(-0.26, 0.26, 0.63, 0.81, 0.15, '#a4815f', 0.135) + legs(-0.25, 0.25, 0.64, 0.8, 0.14, '#6d5642', 0.014);
      for (const x of [-0.2, -0.045, 0.11]) s += chair(x, 0.53, '#9a8069', 'front');
      const [lx, ly] = P(0, 0.42, 0.72);
      return s + `<path d="M${lx} 0V${ly}" stroke="#3b3a38" stroke-width="2"/><path d="M${lx - 34} ${ly + 22}Q${lx} ${ly - 18} ${lx + 34} ${ly + 22}Z" fill="#2f2e2c"/>`;
    }
    case 'schlafzimmer':
      return windowOn(0.36, 0.54, 0.16, 0.44) + picture(-0.14, 0.14, 0.3, 0.4, '#d4a79b')
        + box(-0.4, -0.3, 0.86, 0.96, 0.1, '#b08a64') + box(0.3, 0.4, 0.86, 0.96, 0.1, '#b08a64') + lamp(-0.35, 0.91, 0.15) + lamp(0.35, 0.91, 0.15)
        + box(-0.22, 0.22, 0.97, 1, 0.22, '#8f8579') + box(-0.21, 0.21, 0.6, 0.97, 0.09, '#d9d3ca', 0.02) + box(-0.21, 0.21, 0.6, 0.84, 0.1, '#9fb0b8', 0.02)
        + box(-0.18, -0.02, 0.88, 0.95, 0.12, '#f4f1ec', 0.09) + box(0.02, 0.18, 0.88, 0.95, 0.12, '#f4f1ec', 0.09);
    case 'kueche':
      return wallRect(-0.5, 0.5, 0.26, 0.4, '#f5f2ec', 'stroke="#ddd6cb" stroke-width="2"') + wallRect(-0.5, 0.5, 0.185, 0.26, '#d7cfc3')
        + box(-0.5, 0.5, 0.86, 1, 0.18, '#f1ede6') + box(-0.5, 0.5, 0.86, 1, 0.19, '#8c8378', 0.18) + plant(0.36, 0.93, 0.5)
        + box(-0.2, -0.05, 0.9, 0.97, 0.21, '#d6d0c7', 0.19);
    case 'flur':
      return door(-0.1, 0.1) + wallRect(-0.22, -0.12, 0.3, 0.33, '#6a5a4b') + picture(0.12, 0.2, 0.25, 0.36, '#2f5d62')
        + box(0.14, 0.23, 0.8, 0.95, 0.09, '#b08a64') + plant(-0.18, 0.9, 0.7);
    case 'kinderzimmer':
      return windowOn(-0.52, -0.34, 0.16, 0.44) + wallRect(0.12, 0.44, 0.34, 0.35, '#c9a13b')
        + box(0.22, 0.54, 0.84, 1, 0.09, '#e9e2d6') + box(0.22, 0.54, 0.84, 1, 0.11, '#d4a79b', 0.09)
        + box(-0.08, -0.02, 0.62, 0.68, 0.05, '#b5694a') + box(0.0, 0.05, 0.66, 0.71, 0.05, '#2f5d62') + box(-0.04, 0.01, 0.62, 0.66, 0.1, '#c9a13b', 0.05)
        + box(-0.45, -0.34, 0.84, 0.95, 0.16, '#e6ddd0');
    case 'homeoffice':
      return windowOn(-0.48, -0.28, 0.16, 0.44) + wallRect(0.26, 0.5, 0.3, 0.31, '#8b6d52') + wallRect(0.28, 0.33, 0.31, 0.37, '#2f5d62') + wallRect(0.34, 0.38, 0.31, 0.36, '#b5694a')
        + legs(-0.15, 0.25, 0.86, 0.98, 0.15, '#3b3a38', 0.012) + box(-0.15, 0.25, 0.86, 0.98, 0.155, '#c9ab85', 0.145) + box(0.0, 0.08, 0.93, 0.95, 0.24, '#2e2d2b', 0.155)
        + chair(0.01, 0.7, '#4f5358', 'front') + plant(-0.36, 0.9);
    case 'eingang':
      return door(-0.1, 0.1, '#5b6770') + box(0.2, 0.42, 0.88, 0.98, 0.09, '#b08a64') + plant(-0.3, 0.92, 0.8) + wallRect(-0.3, -0.18, 0.3, 0.38, '#f3efe8', 'stroke="#c9c1b4" stroke-width="3"');
    case 'buero': {
      let s = wallRect(-0.6, 0.6, 0.12, 0.46, '#dfe8ec') + wallRect(-0.6, 0.6, 0.12, 0.46, 'url(#skyG)');
      for (let x = -0.6; x <= 0.61; x += 0.2) { const [ax, ay] = P(x, 0.46, 1); const [, by] = P(x, 0.12, 1); s += `<path d="M${ax} ${ay}V${by}" stroke="#f4f4f2" stroke-width="6"/>`; }
      for (const x of [-0.26, -0.1, 0.06, 0.22]) s += chair(x - 0.045, 0.86, '#50555b', 'back');
      s += contact(-0.34, 0.34, 0.66, 0.84, 0.12) + box(-0.34, 0.34, 0.66, 0.84, 0.15, '#e9e6e0', 0.14) + legs(-0.3, 0.3, 0.68, 0.82, 0.14, '#3b3a38', 0.014);
      s += chair(-0.47, 0.72, '#50555b', 'front') + chair(0.38, 0.72, '#50555b', 'front') + plant(0.52, 0.92, 1.1);
      return s;
    }
    case 'wohnmobil': {
      const [a] = [P(-0.24, 0.5, 1)]; const b = P(0.24, 0.5, 1); const c = P(0.24, 0.1, 1); const d = P(-0.24, 0.1, 1);
      return `<path d="M${d[0]} ${d[1]}L${a[0]} ${a[1] + 30}Q${(a[0] + b[0]) / 2} ${a[1] - 40} ${b[0]} ${b[1] + 30}L${c[0]} ${c[1]}Z" fill="#6f7e88"/><path d="M${d[0] + 16} ${d[1] - 8}L${a[0] + 20} ${a[1] + 44}Q${(a[0] + b[0]) / 2} ${a[1] - 14} ${b[0] - 20} ${b[1] + 44}L${c[0] - 16} ${c[1] - 8}Z" fill="url(#skyG)" opacity=".9"/>`
        + box(-0.21, -0.07, 0.86, 0.97, 0.1, '#5b5f66', 0.03) + box(-0.21, -0.07, 0.95, 0.97, 0.24, '#50545a', 0.03)
        + box(0.07, 0.21, 0.86, 0.97, 0.1, '#5b5f66', 0.03) + box(0.07, 0.21, 0.95, 0.97, 0.24, '#50545a', 0.03)
        + contact(0.16, 0.24, 0.56, 0.84) + box(0.16, 0.24, 0.56, 0.84, 0.18, '#efe9e0') + box(0.16, 0.24, 0.56, 0.84, 0.19, '#9c8b7a', 0.18);
    }
    case 'outdoor':
      return box(-0.5, -0.32, 0.8, 0.95, 0.08, '#e4ddd2', 0.03) + box(-0.5, -0.32, 0.92, 0.95, 0.17, '#d8cfc2', 0.03)
        + box(0.3, 0.48, 0.8, 0.95, 0.08, '#e4ddd2', 0.03) + box(0.3, 0.48, 0.92, 0.95, 0.17, '#d8cfc2', 0.03)
        + box(-0.08, 0.08, 0.66, 0.76, 0.07, '#8f775f', 0.06) + plant(-0.15, 0.95, 1.2) + plant(0.18, 0.97, 1);
    case 'sonderform':
      return windowOn(0.3, 0.5, 0.16, 0.44) + picture(-0.28, -0.1, 0.24, 0.4, '#9c4f33') + plant(-0.44, 0.88)
        + box(-0.3, 0.1, 0.84, 0.98, 0.09, '#c9b79f', 0.02) + box(-0.3, 0.1, 0.95, 0.98, 0.17, '#bba88f', 0.02) + box(0.12, 0.2, 0.62, 0.7, 0.1, '#3b3a38');
    default:
      return '';
  }
}

// Wohnmobil-Umriss: Rechteck mit Aussparung fuer die Trittstufe (Beispiel einer Schablone).
function camperOutline(w, l) {
  return [[0, 0], [w, 0], [w, l * 0.62], [w * 0.62, l * 0.62], [w * 0.62, l * 0.78], [w, l * 0.78], [w, l], [0, l]];
}

/**
 * Raumszene als SVG-Text (1200 x 900). rug: { color, shape, variant, edge, edgeHex, texture, w, l }.
 */
export function sceneSVG(key, rug = {}, o = {}) {
  const def = SCENE_DEFS[key] || SCENE_DEFS.wohnzimmer;
  const r = { ...def.rug, ...rug };
  const color = rug.color || '#b8a78e';
  let pts = rug.outline || (r.shape === 'wohnmobil' ? camperOutline(r.w, r.l) : outline(r.shape === 'laeufer' ? 'rechteck' : r.shape, r.shape === 'rund' ? { diameter: r.w } : { width: r.w, length: r.l }, r.variant));
  if (pts && rug.outline) {
    // Konfigurierte Form: laengere Seite quer legen und so verkleinern, dass sie in den Raum passt.
    const m0 = metrics(pts);
    if (m0.lengthCm > m0.widthCm) pts = pts.map(([x, y]) => [y, m0.widthCm - x]);
    const m1 = metrics(pts);
    const s = Math.min(1, 470 / m1.widthCm, 300 / m1.lengthCm);
    if (s < 1) pts = pts.map(([x, y]) => [x * s, y * s]);
    r.across = false;
  }
  let rugSvg = '';
  if (pts && !o.noRug) {
    const scr = floorRug(pts, r.X, r.Z, r.across);
    const d = `M${scr.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;
    const b = bbox(scr);
    const band = { baumwolle: 7, paspel: 3.4, kettel: 3, cover: 4 }[rug.edge] || 0;
    rugSvg = rugGroup(d, { id: `${o.idPrefix || 'sc'}${key}`, color, texture: rug.texture, edge: rug.edge, edgeHex: rug.edgeHex || resolveEdgeColor(color, 'passend'), bandPx: band, bbox: { x0: b.x0, y0: b.y0, w: b.w, h: b.h }, shadowOffset: 3, shadowBlur: 3, shadowOpacity: 0.22 });
  }
  const title = o.title ? `<title>${esc(o.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice"${o.title ? ` role="img" aria-label="${esc(o.title)}"` : ' aria-hidden="true"'}>${title}<defs><filter id="fs" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="7"/></filter><linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ea"/><stop offset="1" stop-color="#f1efe8"/></linearGradient><radialGradient id="lightG" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
${wallLayer(def.wall, def.narrow)}${floorLayer(def.floor, def.narrow)}${rugSvg}${furniture(def.draw)}<rect width="1200" height="900" fill="url(#lightG)"/></svg>`;
}

/**
 * Nahaufnahme: 'flor' (Oberflaeche) oder 'kante' (Ecke mit Einfassung).
 */
export function detailSVG(kind, o = {}) {
  const color = o.color || '#b8a78e';
  const id = o.idPrefix || uid('dt');
  if (kind === 'kante') {
    const edge = o.edge || 'baumwolle';
    const band = { baumwolle: 46, paspel: 16, kettel: 12, cover: 18 }[edge];
    const d = 'M140 120H1300V1000H140Z';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1000" height="750" fill="#d9ccb8"/><g>${rugGroup(d, { id, color, texture: o.texture, edge, edgeHex: o.edgeHex || resolveEdgeColor(color, o.edgeColor || 'passend'), bandPx: band, bbox: { x0: 140, y0: 120, w: 1160, h: 880 }, shadowOffset: 14, shadowBlur: 14, shadowOpacity: 0.28, textureScale: 3 })}</g></svg>`;
  }
  const d = 'M-10 -10H1010V760H-10Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${rugGroup(d, { id, color, texture: o.texture, shadow: false, bbox: { x0: -10, y0: -10, w: 1020, h: 770 }, textureScale: 4 })}</svg>`;
}

/* --- Formsymbole (Liquid-Snippet wird daraus erzeugt) -------------- */

export function shapeIconPath(shape, variant) {
  const fit = (pts, box = 36, off = 6) => {
    const b = bbox(pts); const s = box / Math.max(b.w, b.h);
    const dx = off + (box - b.w * s) / 2 - b.x0 * s; const dy = off + (box - b.h * s) / 2 - b.y0 * s;
    return pathD(pts, dx, dy, s);
  };
  switch (shape) {
    case 'rechteck': return fit(outline('rechteck', { width: 26, length: 36 }));
    case 'quadrat': return fit(outline('quadrat', { side: 30 }), 30, 9);
    case 'rund': return fit(outline('rund', { diameter: 36 }));
    case 'oval': return fit(outline('oval', { width: 22, length: 36 }));
    case 'ellipse': return fit(outline('ellipse', { width: 24, length: 36 }));
    case 'laeufer': return fit(outline('rechteck', { width: 12, length: 36 }));
    case 'halbkreis': return fit(outline('halbkreis', { diameter: 36 }));
    case 'viertelkreis': return fit(outline('viertelkreis', { radius: 36 }));
    case 'dreieck': return fit(outline('dreieck', { a: 36, b: 34, c: 34 }));
    case 'vieleck': return fit(outline('vieleck', { corners: 6, edge: 18 }));
    case 'organisch': return fit(outline('organisch', { width: 30, length: 36 }, variant || 'kiesel'));
    default: return '';
  }
}
