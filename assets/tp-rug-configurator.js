/*
 * tp-rug-configurator.js - Teppich-Konfigurator (Entwurf).
 *
 * Ein zentraler Zustand (createStore aus tp-rug-core.js) fuer alle Teile:
 * Galerie, acht Schritte, Vorschau, Zusammenfassung, Produktinfos und Anfrage.
 * Kein Preis, kein Warenkorb - der letzte Schritt ist eine unverbindliche
 * Anfrage ueber das Shopify-Kontaktformular.
 *
 * Daten: <script type="application/json" data-tp-rug-products> - entweder der
 * Demo-Katalog (snippets/tp-rug-katalog.liquid) oder ein echtes Produkt mit
 * Metafeld tp_rug.config. normalizeProduct() laesst Unbekanntes weg (fail closed).
 */
import {
  SHAPES, SHAPE_GROUPS, DIMS, EDGES, ORGANIC, ROOMS, DEMO_EDGE_COLORS,
  validateDims, outline, previewSVG, sceneSVG, detailSVG, shapeIconPath, normalizeProduct,
  createStore, emptyConfig, saveDraft, loadDraft, clearDraft, takeHandoff,
  encodeShare, decodeShare, makeReference, summaryLines, summaryText, antislipState, edgeLabel,
  resolveEdgeColor, esc, fmtCm, fmtM, parseCm,
} from './tp-rug-core.js';
import { UploadField } from './tp-rug-upload.js';
import { wireRequestForm } from './tp-rug-request.js';

const STEPS = [
  { key: 'qualitaet', label: 'Qualität' },
  { key: 'farbe', label: 'Farbe' },
  { key: 'form', label: 'Form' },
  { key: 'masse', label: 'Maße' },
  { key: 'kante', label: 'Einfassung' },
  { key: 'extras', label: 'Extras' },
  { key: 'vorschau', label: 'Vorschau' },
  { key: 'anfrage', label: 'Anfrage' },
];
const IDX = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));

const PILE = { kurz: 'kurzer Flor', mittel: 'mittlerer Flor', hoch: 'hoher Flor', flach: 'flach gewebt' };
const FIBER = { kunstfaser: 'Kunstfaser', wolle: 'Wolle', naturfaser: 'Naturfaser' };
const DIM_HINT = {
  rechteck: 'Breite × Länge', quadrat: 'Seitenlänge', rund: 'Durchmesser', oval: 'Breite × Länge', ellipse: 'Breite × Länge',
  laeufer: 'Breite × Länge', halbkreis: 'Durchmesser', viertelkreis: 'Radius', dreieck: 'drei Seiten', vieleck: 'Ecken + Seite',
  organisch: '5 Grundformen', freiform: 'Beschreibung', skizze: 'Skizze hochladen', schablone: 'Schablone',
};
const SAMPLE = {
  rechteck: { width: 200, length: 300 }, laeufer: { width: 80, length: 300 }, quadrat: { side: 200 }, rund: { diameter: 200 },
  oval: { width: 160, length: 230 }, ellipse: { width: 160, length: 230 }, halbkreis: { diameter: 160 }, viertelkreis: { radius: 150 },
  dreieck: { a: 200, b: 180, c: 160 }, vieleck: { corners: 6, edge: 100 }, organisch: { width: 180, length: 240 },
};
const REQ_ICON = {
  freiform: '<path d="M9 30c3-12 9-18 15-12s9 12 15-2" fill="none"/><path d="M8 38h32" stroke-dasharray="3 3"/>',
  skizze: '<path d="M10 8h20l8 8v24H10z"/><path d="M15 30c3-6 6-9 9-5s5 2 8-3" fill="none"/><path d="M15 20h8"/>',
  schablone: '<rect x="8" y="8" width="32" height="32" rx="3" stroke-dasharray="4 3"/><circle cx="17" cy="31" r="4"/><circle cx="29" cy="31" r="4"/><path d="M19 28l10-16m0 16L19 12"/>',
};
const ICON = {
  check: '<path d="M10 25l9 9 19-20"/>',
  info: '<circle cx="24" cy="24" r="18"/><path d="M24 22v11m0-17v1"/>',
  next: '<path d="M8 24h30m-10-10 10 10-10 10"/>',
  back: '<path d="M40 24H10m10-10L10 24l10 10"/>',
  auge: '<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>',
  kopieren: '<rect x="15" y="15" width="23" height="25" rx="3"/><path d="M11 32H9V9h21v3"/>',
  teilen: '<circle cx="34" cy="12" r="5"/><circle cx="14" cy="24" r="5"/><circle cx="34" cy="36" r="5"/><path d="m19 21 10-6m-10 12 10 6"/>',
  reset: '<path d="M10 12v9h9"/><path d="M11 21a14 14 0 1 1 4 12"/>',
  warn: '<path d="M24 7 43 40H5z"/><path d="M24 19v10m0 5v1"/>',
};
const svg = (inner, size = 20, cls = '') => `<svg class="tp-rug-icon ${cls}" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const dataUri = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const safeJson = (s, d = {}) => { try { return JSON.parse(s || ''); } catch (e) { return d; } };

function shapeIcon(key, variant, size = 40) {
  if (REQ_ICON[key]) return svg(REQ_ICON[key], size);
  return svg(`<path d="${shapeIconPath(key, variant)}" fill="currentColor" fill-opacity=".14"/>`, size);
}

// Kleine Zeichnung neben jedem Massfeld: welche Strecke ist gemeint?
function dimIcon(shape, key, variant) {
  const pts = outline(shape, SAMPLE[shape], variant);
  if (!pts) return '';
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const s = 30 / Math.max(x1 - x0, y1 - y0);
  const ox = 5 + (30 - (x1 - x0) * s) / 2 - x0 * s; const oy = 5 + (30 - (y1 - y0) * s) / 2 - y0 * s;
  const T = ([x, y]) => [ox + x * s, oy + y * s];
  const d = `M${pts.map((p) => T(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
  const bx0 = ox + x0 * s; const bx1 = ox + x1 * s; const by0 = oy + y0 * s; const by1 = oy + y1 * s;
  const line = (a, b) => `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}" stroke="#8a5a3c" stroke-width="3" stroke-linecap="round"/>`;
  let mark = '';
  if (key === 'width' || key === 'side' || (key === 'a' && shape === 'dreieck')) mark = line([bx0, by1 + 5], [bx1, by1 + 5]);
  else if (key === 'length') mark = line([bx1 + 5, by0], [bx1 + 5, by1]);
  else if (key === 'diameter') mark = shape === 'halbkreis' ? line([bx0, by0 + 1], [bx1, by0 + 1]) : line([bx0, (by0 + by1) / 2], [bx1, (by0 + by1) / 2]);
  else if (key === 'radius') mark = line([bx0, by0 + 1], [bx1, by0 + 1]);
  else if (key === 'b') mark = line(T(pts[0]), T(pts[2]));
  else if (key === 'c') mark = line(T(pts[1]), T(pts[2]));
  else if (key === 'edge') mark = line(T(pts[0]), T(pts[1]));
  else if (key === 'corners') mark = pts.map((p) => { const [x, y] = T(p); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#8a5a3c"/>`; }).join('');
  return `<svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true" focusable="false"><path d="${d}" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".5" stroke-width="1.5"/>${mark}</svg>`;
}

class TpRugConfigurator extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    const raw = this.querySelector('script[data-tp-rug-products]');
    const list = safeJson(raw?.textContent, []);
    this.products = (Array.isArray(list) ? list : []).filter(Boolean).map((p) => {
      const base = p.config ? { ...p.config, handle: p.handle, title: p.title, url: p.url, description: p.description } : p;
      if (p.config && Array.isArray(p.option_colors)) {
        // Farben: Liste aus dem Metafeld ist fuehrend; die Option "Farbe" ergaenzt
        // Swatch/Bild. Ohne Metafeld-Farben gelten die Optionswerte.
        const opts = p.option_colors.filter(Boolean);
        const byName = new Map(opts.map((c) => [c.name, c]));
        base.colors = (base.colors && base.colors.length)
          ? base.colors.map((c) => ({ ...(byName.get(c.name) || {}), ...c, image: byName.get(c.name)?.image || c.image || null }))
          : opts;
      }
      const n = normalizeProduct(base);
      n.images = (p.images || []).filter(Boolean);
      n.image = p.image || n.images[0] || null;
      n.extras = Array.isArray(base.extras) ? base.extras.filter((x) => x && x.key && x.label) : [];
      return n;
    }).filter((p) => p.handle && p.shapes.length);

    this.app = this.querySelector('[data-app]');
    this.gal = this.querySelector('[data-gallery]');
    this.info = this.querySelector('[data-info]');
    this.form = this.querySelector('form[data-tp-rug-request]');
    if (!this.products.length) {
      this.app.innerHTML = '<p class="tp-rug-err-box">Für dieses Produkt ist noch kein Maßteppich eingerichtet.</p>';
      return;
    }
    this.routes = safeJson(this.dataset.routes);
    this.assets = safeJson(this.dataset.assets);
    this.uid = `c${Math.random().toString(36).slice(2, 7)}`;
    this.attempted = new Set();
    this.touched = new Set();
    this.uploadRoot = document.createElement('div');
    this.upload = new UploadField(this.uploadRoot, { onChange: (files) => this.store && this.store.set({ uploadedFiles: files.map((f) => ({ name: f.name, size: f.size })) }) });

    const params = new URLSearchParams(location.search);
    let product = this.find(params.get('produkt')) || this.find(this.dataset.default) || this.products[0];
    let state = emptyConfig(product.handle);
    let restored = false;
    const shared = params.get('cfg') ? decodeShare(params.get('cfg')) : null;
    if (shared && this.find(shared.product)) {
      product = this.find(shared.product);
      state = { ...state, ...shared };
      restored = 'link';
    } else {
      const draft = loadDraft();
      if (draft && draft.product === product.handle) { state = { ...state, ...draft }; restored = 'entwurf'; }
    }
    const hand = takeHandoff();
    if (hand && hand.shape && product.shapes.includes(hand.shape)) {
      state.shape = hand.shape;
      state.dims = hand.shape === 'rund' ? { diameter: String(hand.width) } : { width: String(hand.width), length: String(hand.length) };
      if (hand.room && ROOMS[hand.room]) state.room = hand.room;
      // Nicht direkt zu "Masse": Farbe fehlt noch - der Kunde geht die Schritte, die Masse sind vorbelegt.
      state.step = IDX.farbe;
      this.handoff = hand;
    }
    const pForm = params.get('form');
    if (pForm && product.shapes.includes(pForm) && !hand) { state.shape = pForm; if (state.step < IDX.farbe) state.step = IDX.farbe; }
    const pRoom = params.get('raum');
    if (pRoom && ROOMS[pRoom]) state.room = pRoom;
    if (!restored && !hand && (params.get('produkt') || this.dataset.mode === 'product') && state.step === 0) state.step = IDX.farbe;
    this.restored = restored;

    this.product = product;
    this.store = createStore(this.sanitize(state, product));
    // Ein wiederhergestellter Schritt darf nicht hinter einem unvollstaendigen liegen.
    if (this.s.step > this.maxReachable()) this.store.set({ step: this.maxReachable() });
    this.renderShell();
    this.renderBodies();
    this.renderGallery();
    this.renderInfo();
    this.syncHeader();
    this.bind();
    this.store.subscribe(() => this.onState());
    this.onState();
    if (this.form) {
      wireRequestForm(this.form, { getPayload: () => this.payload(), onSent: () => clearDraft() });
    }
  }

  find(handle) {
    return handle ? this.products.find((p) => p.handle === handle) : null;
  }

  sanitize(s, p) {
    const out = { ...s, product: p.handle, dims: { ...(s.dims || {}) } };
    if (!p.colors.some((c) => c.name === out.color)) out.color = '';
    if (out.shape && !p.shapes.includes(out.shape)) out.shape = '';
    if (out.edge && !p.edges.includes(out.edge)) out.edge = '';
    if (!out.edge && p.edges.length === 1) out.edge = p.edges[0];
    if (!ORGANIC[out.variant]) out.variant = 'kiesel';
    if (!out.edge || !EDGES[out.edge].colorLabel) out.edgeColor = 'passend';
    if (p.antislip !== 'optional') out.antiSlip = false;
    if (out.room && !ROOMS[out.room]) out.room = '';
    out.step = Math.min(Math.max(Number(out.step) || 0, 0), STEPS.length - 1);
    return out;
  }

  get s() { return this.store.get(); }

  colorHex(s = this.s, p = this.product) {
    return p.colors.find((c) => c.name === s.color)?.hex || p.colors[0]?.hex || '#b8a78e';
  }

  /* ---------------- Gueltigkeit ---------------- */

  dimCheck(s = this.s, p = this.product) {
    return validateDims(s.shape, { ...s.dims, variant: s.variant }, p);
  }

  stepValid(i, s = this.s, p = this.product) {
    switch (STEPS[i].key) {
      case 'farbe': return !!s.color || p.colors.length === 0;
      case 'form': return !!s.shape;
      case 'masse': {
        const sh = SHAPES[s.shape];
        if (!sh) return false;
        if (sh.request) return (s.requestText || '').trim().length >= 10 || this.upload.files.length > 0;
        return this.dimCheck(s, p).ok;
      }
      case 'kante': return p.edges.length === 0 || !!s.edge;
      default: return true;
    }
  }

  firstInvalid(upto = STEPS.length) {
    for (let i = 0; i < upto; i++) if (!this.stepValid(i)) return i;
    return -1;
  }

  maxReachable() {
    const f = this.firstInvalid();
    return f === -1 ? STEPS.length - 1 : f;
  }

  /* ---------------- Grundgeruest ---------------- */

  renderShell() {
    const u = this.uid;
    this.app.innerHTML = `
      <div class="tp-rug-prog">
        <div class="tp-rug-prog__top">
          <p class="tp-rug-prog__label" data-prog-label aria-live="polite"></p>
          <button type="button" class="tp-rug-textbtn" data-reset>${svg(ICON.reset, 16)}Zurücksetzen</button>
        </div>
        <div class="tp-rug-prog__bar" role="progressbar" aria-label="Fortschritt" aria-valuemin="1" aria-valuemax="${STEPS.length}" data-prog-bar><span></span></div>
        <div class="tp-rug-prog__confirm" data-reset-box hidden>
          <span>Alle Angaben löschen und neu beginnen?</span>
          <button type="button" class="tp-rug-btn tp-rug-btn--primary tp-rug-btn--small" data-reset-yes>Ja, zurücksetzen</button>
          <button type="button" class="tp-rug-btn tp-rug-btn--ghost tp-rug-btn--small" data-reset-no>Abbrechen</button>
        </div>
        <p class="tp-rug-prog__note" data-restored hidden></p>
      </div>
      <ol class="tp-rug-csteps" role="list">
        ${STEPS.map((st, i) => `
          <li class="tp-rug-cstep" data-step="${i}">
            <h2 class="tp-rug-cstep__h">
              <button type="button" class="tp-rug-cstep__btn" data-goto="${i}" id="${u}-h${i}" aria-controls="${u}-b${i}" aria-expanded="false">
                <span class="tp-rug-cstep__num" aria-hidden="true">${i + 1}</span>
                <span class="tp-rug-cstep__title"><span class="tp-rug-sr">Schritt ${i + 1}: </span>${st.label}</span>
                <span class="tp-rug-cstep__sum" data-sum="${i}"></span>
                <span class="tp-rug-cstep__edit" aria-hidden="true">Ändern</span>
              </button>
            </h2>
            <div class="tp-rug-cstep__body" id="${u}-b${i}" role="region" aria-labelledby="${u}-h${i}" data-body="${i}" hidden></div>
          </li>`).join('')}
      </ol>`;
  }

  nav(i) {
    const last = i === STEPS.length - 1;
    const next = STEPS[i + 1];
    return `<div class="tp-rug-cnav">
      ${i > 0 ? `<button type="button" class="tp-rug-btn tp-rug-btn--ghost" data-back>${svg(ICON.back, 18)}Zurück</button>` : '<span></span>'}
      ${last ? '' : `<button type="button" class="tp-rug-btn tp-rug-btn--primary" data-next>Weiter: ${next.label}${svg(ICON.next, 18)}</button>`}
    </div>
    <p class="tp-rug-err tp-rug-cnav__err" data-steperr="${i}" role="alert" hidden></p>`;
  }

  renderBodies() {
    STEPS.forEach((st, i) => this.renderBody(i));
  }

  renderBody(i) {
    const body = this.querySelector(`[data-body="${i}"]`);
    if (!body) return;
    const fn = {
      qualitaet: () => this.bodyQualitaet(), farbe: () => this.bodyFarbe(), form: () => this.bodyForm(), masse: () => this.bodyMasse(),
      kante: () => this.bodyKante(), extras: () => this.bodyExtras(), vorschau: () => this.bodyVorschau(), anfrage: () => this.bodyAnfrage(),
    }[STEPS[i].key];
    body.innerHTML = fn() + this.nav(i);
    if (STEPS[i].key === 'masse') {
      const slot = body.querySelector('[data-upload-slot]');
      if (slot) slot.appendChild(this.uploadRoot);
    }
    if (STEPS[i].key === 'anfrage' && this.form) {
      const slot = body.querySelector('[data-form-slot]');
      if (slot) slot.appendChild(this.form);
    }
  }

  /* ---------------- Schritt 1: Qualitaet ---------------- */

  facts(p) {
    const rows = [];
    if (p.material) rows.push(['Material', p.material]);
    if (p.pile && PILE[p.pile]) rows.push(['Oberfläche', PILE[p.pile]]);
    if (p.fiber && FIBER[p.fiber]) rows.push(['Faser', FIBER[p.fiber]]);
    rows.push(['Einfassungen', p.edges.map((e) => EDGES[e].short).join(', ') || 'auf Anfrage']);
    rows.push(['Länge', `bis ${fmtCm(p.max_length_cm)} (10 m)`]);
    rows.push(['Breite', p.max_width_cm ? `bis ${fmtCm(p.max_width_cm)}` : 'je nach Qualität – wir prüfen Ihr Maß']);
    return `<dl class="tp-rug-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  bodyQualitaet() {
    const p = this.product;
    const others = this.products.length > 1
      ? `<fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">Andere Qualität wählen</legend>
          <div class="tp-rug-qlist">${this.products.map((q) => `
            <label class="tp-rug-qopt">
              <input type="radio" name="product" value="${esc(q.handle)}" ${q.handle === p.handle ? 'checked' : ''}>
              ${q.image ? `<img src="${esc(q.image)}" alt="" width="96" height="72" loading="lazy">` : ''}
              <span class="tp-rug-qopt__text"><span class="tp-rug-qopt__title">${esc(q.title)}</span><span class="tp-rug-qopt__sub">${esc(q.subtitle)}</span></span>
            </label>`).join('')}</div></fieldset>`
      : (this.routes.alle ? `<p class="tp-rug-small"><a href="${esc(this.routes.alle)}">Andere Teppiche ansehen</a></p>` : '');
    return `<div class="tp-rug-q">
      <div class="tp-rug-q__current">
        ${p.image ? `<img class="tp-rug-q__img" src="${esc(p.image)}" alt="" width="160" height="120">` : ''}
        <div class="tp-rug-q__text">
          <p class="tp-rug-q__title">${esc(p.title)} ${p.test ? '<span class="tp-rug-tag">Testprodukt</span>' : ''}</p>
          ${p.subtitle ? `<p class="tp-rug-small">${esc(p.subtitle)}</p>` : ''}
          ${this.facts(p)}
        </div>
      </div>
      ${others}
      ${this.routes.finder ? `<p class="tp-rug-small">Unsicher, welche Qualität passt? <a href="${esc(this.routes.finder)}">Welcher Teppich passt zu mir?</a></p>` : ''}
    </div>`;
  }

  /* ---------------- Schritt 2: Farbe ---------------- */

  bodyFarbe() {
    const p = this.product; const s = this.s;
    if (!p.colors.length) return '<p class="tp-rug-small">Die Farbe stimmen wir mit Ihrer Anfrage ab.</p>';
    const many = p.colors.length > 12;
    return `<fieldset class="tp-rug-fs">
      <legend class="tp-rug-sr">Farbe wählen</legend>
      ${p.colors.length > 8 ? `<div class="tp-rug-search"><label class="tp-rug-sr" for="${this.uid}-cs">Farbe suchen</label>${svg('<circle cx="21" cy="21" r="12"/><path d="m31 31 9 9"/>', 18)}<input id="${this.uid}-cs" type="search" data-color-search placeholder="Farbe suchen, z. B. Grau" autocomplete="off"></div>` : ''}
      <div class="tp-rug-swatches" data-swatches>
        ${p.colors.map((c, i) => `
          <label class="tp-rug-swatch" data-name="${esc(c.name.toLowerCase())}" ${many && i >= 12 && s.color !== c.name ? 'data-extra hidden' : ''}>
            <input type="radio" name="color" value="${esc(c.name)}" ${s.color === c.name ? 'checked' : ''}>
            <span class="tp-rug-swatch__chip" style="--c:${esc(c.hex || '#cfc6b8')}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : ''}${svg(ICON.check, 18, 'tp-rug-swatch__ok')}</span>
            <span class="tp-rug-swatch__name">${esc(c.name)}</span>
          </label>`).join('')}
      </div>
      <p class="tp-rug-small" data-color-empty hidden>Keine Farbe mit diesem Namen.</p>
      ${many ? `<button type="button" class="tp-rug-textbtn" data-more-colors>Alle ${p.colors.length} Farben zeigen</button>` : ''}
      ${p.test ? '<p class="tp-rug-demo">Demo-Farben – die echten Farben kommen mit der Qualität.</p>' : ''}
    </fieldset>`;
  }

  /* ---------------- Schritt 3: Form ---------------- */

  bodyForm() {
    const p = this.product; const s = this.s;
    const groups = Object.keys(SHAPE_GROUPS).map((g) => [g, p.shapes.filter((k) => SHAPES[k].group === g)]).filter(([, l]) => l.length);
    return `${groups.map(([g, keys]) => `
      <fieldset class="tp-rug-fs">
        <legend class="tp-rug-fs__legend">${SHAPE_GROUPS[g]}</legend>
        <div class="tp-rug-stiles">${keys.map((k) => `
          <label class="tp-rug-stile">
            <input type="radio" name="shape" value="${k}" ${s.shape === k ? 'checked' : ''}>
            <span class="tp-rug-stile__icon">${shapeIcon(k, s.variant, 42)}</span>
            <span class="tp-rug-stile__label">${SHAPES[k].label}</span>
            <span class="tp-rug-stile__hint">${DIM_HINT[k]}</span>
          </label>`).join('')}</div>
      </fieldset>`).join('')}
      <fieldset class="tp-rug-fs tp-rug-variants" data-variants ${s.shape === 'organisch' ? '' : 'hidden'}>
        <legend class="tp-rug-fs__legend">Grundform wählen</legend>
        <div class="tp-rug-stiles tp-rug-stiles--small">${Object.entries(ORGANIC).map(([k, o]) => `
          <label class="tp-rug-stile">
            <input type="radio" name="variant" value="${k}" ${s.variant === k ? 'checked' : ''}>
            <span class="tp-rug-stile__icon">${shapeIcon('organisch', k, 38)}</span>
            <span class="tp-rug-stile__label">${o.label}</span>
          </label>`).join('')}</div>
      </fieldset>
      <p class="tp-rug-note" data-shape-note ${s.shape ? '' : 'hidden'}>${svg(ICON.info, 18)}<span>${esc(SHAPES[s.shape]?.note || '')}</span></p>`;
  }

  /* ---------------- Schritt 4: Masse ---------------- */

  bodyMasse() {
    const p = this.product; const s = this.s; const sh = SHAPES[s.shape];
    if (!sh) return '<p class="tp-rug-small">Bitte wählen Sie zuerst eine Form.</p>';
    if (sh.request) return this.bodySonderform();
    const limitW = p.max_width_cm ? `Maximale Breite bei dieser Qualität: ${fmtCm(p.max_width_cm)}` : 'Breite je nach Qualität – wir prüfen Ihr Maß';
    const hand = this.handoff ? `<p class="tp-rug-note tp-rug-note--ok">${svg(ICON.check, 18)}<span>Maße aus dem Größen-Berater übernommen – bitte prüfen.</span></p>` : '';
    return `<div class="tp-rug-dims">
      <div class="tp-rug-dims__fields">
        ${hand}
        ${sh.dims.map((k) => this.dimField(k)).join('')}
        <p class="tp-rug-limit">${svg(ICON.info, 18)}<span><strong>Maximale Länge: 1.000 cm / 10 m.</strong> ${esc(limitW)}.</span></p>
        ${this.routes.berater ? `<p class="tp-rug-small">Größe unsicher? <a href="${esc(this.routes.berater)}#groesse">Größen-Berater öffnen</a></p>` : ''}
      </div>
      <figure class="tp-rug-dims__preview">
        <div class="tp-rug-preview" data-preview></div>
        <figcaption>Maßstäbliche Vorschau. Kanten zur Verdeutlichung breiter gezeichnet.</figcaption>
      </figure>
    </div>`;
  }

  dimField(k) {
    const s = this.s; const d = DIMS[k]; const id = `${this.uid}-d-${k}`;
    const pic = dimIcon(s.shape, k, s.variant);
    if (d.integer) {
      const v = Number(s.dims[k] || d.fallback);
      return `<div class="tp-rug-field" data-field="${k}">
        <label for="${id}">${d.label}</label>
        <div class="tp-rug-field__row"><span class="tp-rug-field__pic">${pic}</span>
          <select id="${id}" data-dim="${k}">${[5, 6, 7, 8].map((n) => `<option value="${n}" ${n === v ? 'selected' : ''}>${n} Ecken</option>`).join('')}</select></div>
      </div>`;
    }
    return `<div class="tp-rug-field" data-field="${k}">
      <label for="${id}">${d.label} <span class="tp-rug-field__unit">in cm</span></label>
      <div class="tp-rug-field__row">
        <span class="tp-rug-field__pic">${pic}</span>
        <div class="tp-rug-input"><input id="${id}" type="text" inputmode="numeric" autocomplete="off" data-dim="${k}" value="${esc(s.dims[k] ?? '')}" placeholder="z. B. ${SAMPLE[s.shape]?.[k] ?? 200}" aria-describedby="${id}-conv ${id}-err"><span class="tp-rug-input__unit" aria-hidden="true">cm</span></div>
      </div>
      <p class="tp-rug-field__conv" id="${id}-conv" data-conv="${k}"></p>
      <p class="tp-rug-err" id="${id}-err" data-err="${k}" hidden></p>
    </div>`;
  }

  bodySonderform() {
    const s = this.s; const sh = SHAPES[s.shape];
    const tips = {
      skizze: ['Form auf Papier zeichnen – Maßstab ist egal.', 'Jede Kante in Zentimetern beschriften.', 'Türen, Ausschnitte und Rundungen markieren.', 'Foto machen und hier hochladen.'],
      schablone: ['Schablone aus Packpapier oder Folie genau zuschneiden.', 'Eine Kontrollstrecke von 50 cm einzeichnen und beschriften.', 'Oben und „Teppichseite“ kennzeichnen.', 'Fotografieren und hochladen – die Schablone selbst schicken Sie nur nach Absprache.'],
      beschreibung: ['Wo liegt der Teppich, welche Form hat die Fläche?', 'Ungefähre Breite und Länge angeben.', 'Besonderheiten nennen: Schrägen, Aussparungen, Türen.'],
    }[sh.request] || [];
    const id = this.uid;
    return `<div class="tp-rug-special">
      <p class="tp-rug-note">${svg(ICON.info, 18)}<span>${esc(sh.note)} Wir prüfen Ihre Angaben und melden uns mit einer Rückfrage oder einem Vorschlag.</span></p>
      <ol class="tp-rug-ministeps">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <div class="tp-rug-grid2">
        ${['width', 'length'].map((k) => `<div class="tp-rug-field"><label for="${id}-sf-${k}">${k === 'width' ? 'Breite' : 'Länge'} ca. <span class="tp-rug-field__unit">in cm, optional</span></label>
          <div class="tp-rug-input"><input id="${id}-sf-${k}" type="text" inputmode="numeric" data-dim="${k}" data-optional value="${esc(s.dims[k] ?? '')}" placeholder="z. B. ${k === 'width' ? 180 : 240}" aria-describedby="${id}-sf-${k}-err"><span class="tp-rug-input__unit" aria-hidden="true">cm</span></div>
          <p class="tp-rug-err" id="${id}-sf-${k}-err" data-err="${k}" hidden></p></div>`).join('')}
      </div>
      <div class="tp-rug-field">
        <label for="${id}-rt">Beschreibung Ihrer Form <span aria-hidden="true">*</span></label>
        <textarea id="${id}-rt" name="requestText" rows="4" maxlength="1500" placeholder="z. B. Nische 180 × 90 cm, rechte Seite abgeschrägt, Tür öffnet nach innen" aria-describedby="${id}-rt-err">${esc(s.requestText || '')}</textarea>
        <p class="tp-rug-err" id="${id}-rt-err" data-err="requestText" hidden></p>
      </div>
      <div data-upload-slot></div>
      ${this.routes.sonderform ? `<p class="tp-rug-small">Mehr Hilfe: <a href="${esc(this.routes.sonderform)}">So funktioniert die Sonderanfertigung</a></p>` : ''}
    </div>`;
  }

  /* ---------------- Schritt 5: Einfassung ---------------- */

  bodyKante() {
    const p = this.product; const s = this.s;
    if (!p.edges.length) return '<p class="tp-rug-small">Die Einfassung stimmen wir mit Ihrer Anfrage ab.</p>';
    return `<fieldset class="tp-rug-fs">
      <legend class="tp-rug-sr">Einfassung wählen</legend>
      <div class="tp-rug-ecards">${p.edges.map((e) => {
        const E = EDGES[e]; const w = p.edgeWidths[e] ?? E.defaultWidthCm;
        return `<label class="tp-rug-ecard">
          <input type="radio" name="edge" value="${e}" ${s.edge === e ? 'checked' : ''}>
          <span class="tp-rug-ecard__img">${this.assets[e] ? `<img src="${esc(this.assets[e])}" alt="" width="1000" height="750" loading="lazy">` : ''}</span>
          <span class="tp-rug-ecard__body">
            <span class="tp-rug-ecard__title">${esc(E.label)}</span>
            <span class="tp-rug-ecard__w">${w ? `ca. ${w} cm sichtbar` : esc(E.width || '')}</span>
            <span class="tp-rug-ecard__text">${esc(E.text)}</span>
            ${E.includesAntislip ? '<span class="tp-rug-tag tp-rug-tag--ok">inkl. Antirutschvlies</span>' : ''}
          </span>
        </label>`;
      }).join('')}</div>
    </fieldset>
    <div data-edgecolors>${this.edgeColors()}</div>
    ${this.routes.einfassungen ? `<p class="tp-rug-small"><a href="${esc(this.routes.einfassungen)}">Alle Einfassungen im Vergleich</a></p>` : ''}`;
  }

  edgeColors() {
    const p = this.product; const s = this.s; const E = EDGES[s.edge];
    if (!E || !E.colorLabel) return '';
    const rug = this.colorHex();
    return `<fieldset class="tp-rug-fs">
      <legend class="tp-rug-fs__legend">${esc(E.colorLabel)}</legend>
      <div class="tp-rug-swatches tp-rug-swatches--small">${p.edgeColors.map((c) => {
        const hex = resolveEdgeColor(rug, c.key || c.name, p.edgeColors);
        return `<label class="tp-rug-swatch">
          <input type="radio" name="edgeColor" value="${esc(c.key || c.name)}" ${(s.edgeColor === (c.key || c.name)) ? 'checked' : ''}>
          <span class="tp-rug-swatch__chip" style="--c:${hex}">${svg(ICON.check, 16, 'tp-rug-swatch__ok')}</span>
          <span class="tp-rug-swatch__name">${esc(c.name)}</span>
        </label>`;
      }).join('')}</div>
      <p class="tp-rug-demo">Demo-Auswahl – die echten Band- und Garnfarben folgen.</p>
    </fieldset>`;
  }

  /* ---------------- Schritt 6: Extras ---------------- */

  bodyExtras() {
    const p = this.product; const s = this.s; const as = antislipState(p, s);
    let anti = '';
    if (as === 'inklusive') {
      anti = `<p class="tp-rug-note tp-rug-note--ok">${svg(ICON.check, 18)}<span><strong>Antirutschvlies inklusive</strong> – ${EDGES[s.edge]?.includesAntislip ? 'es gehört fest zur Cover-Kante' : 'bei dieser Qualität immer dabei'}.</span></p>`;
    } else if (p.antislip === 'optional') {
      anti = `<fieldset class="tp-rug-fs">
        <legend class="tp-rug-fs__legend">Antirutschvlies</legend>
        <ul class="tp-rug-checklist tp-rug-checklist--small" role="list">
          <li>${svg(ICON.check, 18)}<span>verringert das Verrutschen auf glatten Böden</span></li>
          <li>${svg(ICON.check, 18)}<span>etwas mehr Trittkomfort</span></li>
          <li>${svg(ICON.check, 18)}<span>auf Ihr Teppichmaß zugeschnitten</span></li>
        </ul>
        <div class="tp-rug-radios">
          <label class="tp-rug-radio"><input type="radio" name="antislip" value="0" ${s.antiSlip ? '' : 'checked'}><span>ohne</span></label>
          <label class="tp-rug-radio"><input type="radio" name="antislip" value="1" ${s.antiSlip ? 'checked' : ''}><span>mit Antirutschvlies</span></label>
        </div>
      </fieldset>`;
    }
    const extras = (p.extras || []).map((x) => `<label class="tp-rug-check"><input type="checkbox" name="extra" value="${esc(x.key)}"><span>${esc(x.label)}${x.text ? `<small>${esc(x.text)}</small>` : ''}</span></label>`).join('');
    return `${anti}${extras ? `<fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">Weitere Extras</legend>${extras}</fieldset>` : ''}
      <div class="tp-rug-field">
        <label for="${this.uid}-room">Wo soll der Teppich liegen? <span class="tp-rug-field__unit">optional</span></label>
        <select id="${this.uid}-room" name="room"><option value="">Bitte wählen</option>${Object.entries(ROOMS).map(([k, v]) => `<option value="${k}" ${s.room === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      </div>
      <div class="tp-rug-field">
        <label for="${this.uid}-notes">Bemerkung <span class="tp-rug-field__unit">optional</span></label>
        <textarea id="${this.uid}-notes" name="notes" rows="3" maxlength="1000" placeholder="z. B. Teppich soll unter die Sofafüße reichen">${esc(s.notes || '')}</textarea>
      </div>
      <p class="tp-rug-small">Weitere Extras wie Komfortvlies oder Fleckenschutz erscheinen hier, sobald sie für eine Qualität freigegeben sind.</p>`;
  }

  /* ---------------- Schritt 7: Vorschau ---------------- */

  bodyVorschau() {
    return `<div class="tp-rug-review">
      <figure class="tp-rug-review__fig"><div class="tp-rug-preview tp-rug-preview--big" data-preview-big></div>
        <figcaption>Unverbindliche Vorschau – Darstellung kann vom Original abweichen.</figcaption></figure>
      <dl class="tp-rug-summary" data-summary></dl>
      <div class="tp-rug-actions tp-rug-actions--wrap">
        <button type="button" class="tp-rug-btn tp-rug-btn--ghost tp-rug-btn--small" data-visualize>${svg(ICON.auge, 18)}Im eigenen Raum ansehen</button>
        <button type="button" class="tp-rug-btn tp-rug-btn--ghost tp-rug-btn--small" data-copy>${svg(ICON.kopieren, 18)}Als Text kopieren</button>
        <button type="button" class="tp-rug-btn tp-rug-btn--ghost tp-rug-btn--small" data-share>${svg(ICON.teilen, 18)}Link kopieren</button>
      </div>
      <p class="tp-rug-status" data-copy-status role="status" aria-live="polite"></p>
      <details class="tp-rug-acc">
        <summary>Wichtige Hinweise zur Maßanfertigung</summary>
        <div class="tp-rug-acc__body">
          <ul class="tp-rug-bullets">
            <li>Bitte prüfen Sie Ihre Maße sorgfältig – gemessen wird in Zentimetern.</li>
            <li>Maßteppiche und Sonderformen werden individuell für Sie gefertigt.</li>
            <li>Farben können je nach Bildschirm abweichen. Ein Muster schafft Sicherheit.</li>
            <li>Vorschau und Raum-Visualisierer sind unverbindliche Illustrationen.</li>
          </ul>
          <p class="tp-rug-legal">Prüfhinweis (vor Livegang): Angaben zu Widerruf und Rückgabe bei Maßanfertigungen folgen nach juristischer Prüfung.</p>
        </div>
      </details>
    </div>`;
  }

  /* ---------------- Schritt 8: Anfrage ---------------- */

  bodyAnfrage() {
    return `<div class="tp-rug-send">
      <div class="tp-rug-send__sum"><p class="tp-rug-send__title">Ihre Konfiguration</p><dl class="tp-rug-summary tp-rug-summary--compact" data-summary-2></dl>
        <p class="tp-rug-small">Referenz: <strong data-ref></strong></p></div>
      <p class="tp-rug-note">${svg(ICON.info, 18)}<span>Unverbindlich und ohne Kauf: Sie senden uns Ihre Konfiguration, wir prüfen sie und melden uns persönlich. Preise für den Teppichbereich folgen.</span></p>
      <div data-form-slot></div>
    </div>`;
  }

  /* ---------------- Aktualisieren ---------------- */

  onState() {
    const s = this.s; const p = this.product;
    const step = s.step;
    const reach = this.maxReachable();
    this.querySelector('[data-prog-label]').textContent = `Schritt ${step + 1} von ${STEPS.length} · ${STEPS[step].label}`;
    const bar = this.querySelector('[data-prog-bar]');
    bar.setAttribute('aria-valuenow', String(step + 1));
    bar.setAttribute('aria-valuetext', `Schritt ${step + 1} von ${STEPS.length}: ${STEPS[step].label}`);
    bar.querySelector('span').style.width = `${((step + 1) / STEPS.length) * 100}%`;
    const restoredEl = this.querySelector('[data-restored]');
    if (this.restored && restoredEl.hidden && !this.restoredShown) {
      restoredEl.hidden = false;
      restoredEl.textContent = this.restored === 'link' ? 'Konfiguration aus einem geteilten Link geladen.' : 'Ihre letzte Auswahl in diesem Tab wurde wiederhergestellt.';
      this.restoredShown = true;
    }

    STEPS.forEach((st, i) => {
      const li = this.querySelector(`[data-step="${i}"]`);
      const btn = li.querySelector('[data-goto]');
      const bodyEl = li.querySelector('[data-body]');
      const active = i === step;
      const done = i < step && this.stepValid(i);
      li.classList.toggle('is-active', active);
      li.classList.toggle('is-done', done);
      li.classList.toggle('is-locked', i > reach);
      btn.setAttribute('aria-expanded', active ? 'true' : 'false');
      btn.disabled = i > reach && !active;
      bodyEl.hidden = !active;
      this.querySelector(`[data-sum="${i}"]`).textContent = active ? '' : this.stepSummary(i);
    });

    if (s.shape === 'organisch' || this.querySelector('[data-variants]')) {
      const v = this.querySelector('[data-variants]');
      if (v) v.hidden = s.shape !== 'organisch';
    }
    const note = this.querySelector('[data-shape-note]');
    if (note) { note.hidden = !s.shape; note.querySelector('span').textContent = SHAPES[s.shape]?.note || ''; }

    this.updateDims();
    this.updateReview();
    this.scheduleGallery();
    saveDraft(s);
  }

  stepSummary(i) {
    const s = this.s; const p = this.product;
    switch (STEPS[i].key) {
      case 'qualitaet': return p.title;
      case 'farbe': return s.color;
      case 'form': return s.shape ? (s.shape === 'organisch' ? `${SHAPES.organisch.label} · ${ORGANIC[s.variant].label}` : SHAPES[s.shape].label) : '';
      case 'masse': {
        const sh = SHAPES[s.shape]; if (!sh) return '';
        if (sh.request) return this.stepValid(i) ? 'Angaben vorhanden' : '';
        const v = this.dimCheck(); if (!v.ok) return '';
        if (s.shape === 'rund') return `Ø ${fmtCm(v.values.diameter)}`;
        return `${Math.round(v.metrics.widthCm)} × ${Math.round(v.metrics.lengthCm)} cm`;
      }
      case 'kante': {
        if (!s.edge) return '';
        const ec = EDGES[s.edge].colorLabel ? p.edgeColors.find((c) => (c.key || c.name) === s.edgeColor) : null;
        return `${EDGES[s.edge].short}${ec ? ` · ${ec.name}` : ''}`;
      }
      case 'extras': {
        const as = antislipState(p, s);
        const parts = [];
        if (as === 'ja' || as === 'inklusive') parts.push('mit Antirutschvlies');
        if (s.room) parts.push(ROOMS[s.room]);
        return parts.join(' · ');
      }
      default: return '';
    }
  }

  updateDims() {
    const s = this.s; const sh = SHAPES[s.shape];
    const body = this.querySelector(`[data-body="${IDX.masse}"]`);
    if (!sh || !body) return;
    const attempted = this.attempted.has(IDX.masse);
    if (sh.request) {
      for (const k of ['width', 'length']) {
        const raw = s.dims[k]; const errEl = body.querySelector(`[data-err="${k}"]`);
        if (!errEl) continue;
        let msg = '';
        if (raw && String(raw).trim()) {
          const r = parseCm(raw);
          if (!r.ok) msg = r.error === 'meter' ? `Bitte in Zentimetern: ${r.suggestion} cm.` : 'Bitte nur ganze Zentimeter eingeben.';
          else if (r.value > 1000) msg = 'Maximal 1.000 cm möglich.';
        }
        errEl.textContent = msg; errEl.hidden = !msg;
      }
      const rt = body.querySelector('[data-err="requestText"]');
      if (rt) {
        const bad = attempted && !this.stepValid(IDX.masse);
        rt.hidden = !bad;
        rt.textContent = bad ? 'Bitte beschreiben Sie Ihre Form (mindestens ein kurzer Satz) oder laden Sie eine Skizze hoch.' : '';
      }
      return;
    }
    const v = this.dimCheck();
    for (const k of sh.dims) {
      const conv = body.querySelector(`[data-conv="${k}"]`);
      const errEl = body.querySelector(`[data-err="${k}"]`);
      const input = body.querySelector(`[data-dim="${k}"]`);
      if (DIMS[k].integer || !input) continue;
      const r = parseCm(s.dims[k]);
      if (conv) conv.textContent = r.ok && r.value > 0 ? `= ${fmtM(r.value)}` : '';
      const show = (this.touched.has(k) || attempted) && v.errors[k];
      if (errEl) {
        errEl.hidden = !show;
        errEl.innerHTML = show ? `${esc(v.errors[k])}${v.suggestions[k] ? ` <button type="button" class="tp-rug-textbtn" data-suggest="${k}" data-value="${v.suggestions[k]}">${v.suggestions[k].toLocaleString('de-DE')} cm übernehmen</button>` : ''}` : '';
      }
      input.setAttribute('aria-invalid', show ? 'true' : 'false');
    }
    const pv = body.querySelector('[data-preview]');
    if (pv) pv.innerHTML = previewSVG(s, this.product, { fallbackColor: this.colorHex() });
  }

  updateReview() {
    const s = this.s; const p = this.product;
    const lines = summaryLines(s, p);
    const html = lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    const sum = this.querySelector('[data-summary]'); if (sum) sum.innerHTML = html;
    const sum2 = this.querySelector('[data-summary-2]'); if (sum2) sum2.innerHTML = html;
    const big = this.querySelector('[data-preview-big]');
    if (big && s.step === IDX.vorschau) big.innerHTML = previewSVG(s, p, { width: 520, height: 380, fallbackColor: this.colorHex() });
    if (s.step === IDX.anfrage && !this.reference) this.reference = makeReference();
    const ref = this.querySelector('[data-ref]'); if (ref) ref.textContent = this.reference || '–';
  }

  /* ---------------- Galerie ---------------- */

  renderGallery() {
    this.gal.innerHTML = `
      <div class="tp-rug-gal__main" data-gal-main></div>
      <p class="tp-rug-gal__cap" data-gal-cap></p>
      <div class="tp-rug-gal__thumbs" role="group" aria-label="Ansichten" data-gal-thumbs></div>
      <button type="button" class="tp-rug-btn tp-rug-btn--ghost tp-rug-gal__vis" data-visualize>${svg(ICON.auge, 20)}Teppich in meinem Raum ansehen</button>`;
    this.slideKind = this.product.images.length ? 'foto-0' : 'raum';
  }

  rugLook() {
    const s = this.s; const p = this.product; const color = this.colorHex();
    const edge = s.edge || '';
    const edgeHex = resolveEdgeColor(color, s.edgeColor, p.edgeColors);
    let pts = null;
    if (SHAPES[s.shape]?.dims) {
      const v = this.dimCheck();
      pts = v.ok ? v.outline : outline(s.shape, SAMPLE[s.shape], s.variant);
    }
    return { color, edge, edgeHex, texture: p.texture, outline: pts };
  }

  slides() {
    const p = this.product; const look = this.rugLook();
    const out = p.images.map((src, i) => ({ kind: `foto-${i}`, label: `Foto ${i + 1}`, src, alt: p.title, photo: true }));
    out.push({ kind: 'raum', label: 'Im Raum', svg: () => sceneSVG(p.scene, look, { idPrefix: 'g' }), alt: 'Illustration: Teppich im Raum in der gewählten Farbe' });
    out.push({ kind: 'flor', label: 'Oberfläche', svg: () => detailSVG('flor', { color: look.color, texture: p.texture, idPrefix: 'gf' }), alt: 'Illustration: Oberfläche in der gewählten Farbe' });
    if (look.edge || p.edges[0]) out.push({ kind: 'kante', label: 'Kante', svg: () => detailSVG('kante', { color: look.color, texture: p.texture, edge: look.edge || p.edges[0], edgeHex: look.edgeHex, idPrefix: 'gk' }), alt: 'Illustration: Teppichecke mit der gewählten Einfassung' });
    out.push({ kind: 'masse', label: 'Maße', inline: () => previewSVG(this.s, p, { fallbackColor: look.color }), alt: 'Maßzeichnung' });
    return out;
  }

  scheduleGallery() {
    if (this.galQueued) return;
    this.galQueued = true;
    requestAnimationFrame(() => { this.galQueued = false; this.updateGallery(); });
  }

  updateGallery() {
    const slides = this.slides();
    let cur = slides.find((x) => x.kind === this.slideKind) || slides[0];
    this.slideKind = cur.kind;
    const main = this.gal.querySelector('[data-gal-main]');
    const cap = this.gal.querySelector('[data-gal-cap]');
    const thumbs = this.gal.querySelector('[data-gal-thumbs]');
    const srcOf = (x) => (x.photo ? x.src : x.svg ? dataUri(x.svg()) : null);
    main.innerHTML = cur.inline ? `<div class="tp-rug-gal__inline">${cur.inline()}</div>` : `<img src="${esc(srcOf(cur))}" alt="${esc(cur.alt)}" width="1200" height="900">`;
    cap.textContent = cur.photo ? '' : 'Illustration – Darstellung kann vom Original abweichen.';
    thumbs.innerHTML = slides.map((x) => `<button type="button" class="tp-rug-gal__thumb${x.kind === cur.kind ? ' is-active' : ''}" data-thumb="${x.kind}" aria-pressed="${x.kind === cur.kind}" aria-label="Ansicht: ${esc(x.label)}">
      ${x.inline ? `<span class="tp-rug-gal__tico">${svg('<path d="M8 40V8h32v32z" stroke-dasharray="0"/><path d="M8 44h32M44 8v32" stroke-width="2"/>', 26)}</span>` : `<img src="${esc(srcOf(x))}" alt="" width="120" height="90">`}
      <span>${esc(x.label)}</span></button>`).join('');
  }

  focusSlide(kind) {
    this.slideKind = kind;
    this.scheduleGallery();
  }

  /* ---------------- Produktinfos (Tabs / Akkordeon) ---------------- */

  renderInfo() {
    if (!this.info) return;
    const p = this.product;
    const flags = { camper_suitable: 'für Wohnmobil und Camper vorgesehen', outdoor_suitable: 'für den Außenbereich vorgesehen', object_suitable: 'für Objekt und Gewerbe vorgesehen', underfloor_heating: 'für Fußbodenheizung geeignet', castor_chair: 'für Stuhlrollen geeignet', pet_friendly: 'haustierfreundlich', easy_care: 'pflegeleicht' };
    const props = Object.keys(p.flags).map((k) => flags[k]).filter(Boolean);
    const edgeList = p.edges.map((e) => `<li><strong>${esc(EDGES[e].label)}</strong> – ${esc(EDGES[e].text)}</li>`).join('');
    const panels = [
      ['beschreibung', 'Beschreibung', `<p>${esc(p.description || 'Beschreibung folgt mit der echten Qualität.')}</p>${p.test ? '<p class="tp-rug-demo">Testprodukt – Angaben dienen nur der Darstellung.</p>' : ''}`],
      ['eigenschaften', 'Eigenschaften', `<ul class="tp-rug-bullets">${p.material ? `<li>Material: ${esc(p.material)}</li>` : ''}${p.pile ? `<li>Oberfläche: ${esc(PILE[p.pile] || p.pile)}</li>` : ''}${p.fiber ? `<li>Faser: ${esc(FIBER[p.fiber] || p.fiber)}</li>` : ''}${p.rooms.length ? `<li>Gedacht für: ${esc(p.rooms.map((r) => ROOMS[r]).join(', '))}</li>` : ''}${props.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="tp-rug-small">Eigenschaften wie Fußbodenheizung, Stuhlrollen oder Pflegeleichtigkeit nennen wir nur, wenn sie für die Qualität belegt sind.</p>`],
      ['material', 'Material & Flor', `<p>${esc([p.material, PILE[p.pile], FIBER[p.fiber]].filter(Boolean).join(' · ') || 'Angaben folgen.')}</p><p class="tp-rug-small">Florhöhe, Gewicht und Zusammensetzung folgen mit dem Datenblatt der echten Qualität.</p>`],
      ['ruecken', 'Rücken', '<p class="tp-rug-small">Angabe folgt mit dem Datenblatt der echten Qualität.</p>'],
      ['einfassung', 'Einfassung', edgeList ? `<ul class="tp-rug-bullets">${edgeList}</ul>` : '<p>Die Einfassung stimmen wir mit Ihrer Anfrage ab.</p>'],
      ['antirutsch', 'Antirutsch', `<p>${p.antislip === 'optional' ? 'Antirutschvlies ist bei dieser Qualität als Extra wählbar.' : p.antislip === 'inklusive' ? 'Antirutschvlies ist bei dieser Qualität inklusive.' : 'Für diese Qualität ist kein Antirutschvlies vorgesehen.'}${p.edges.includes('cover') ? ' Bei der Cover-Kante gehört es immer dazu.' : ''}</p>`],
      ['masse', 'Maße', `<ul class="tp-rug-bullets"><li>Länge bis 1.000 cm (10 m).</li><li>Breite: ${p.max_width_cm ? `bis ${fmtCm(p.max_width_cm)}` : 'je nach Qualität – wir prüfen Ihr Maß'}.</li><li>Angabe in ganzen Zentimetern.</li><li>Fertigungstoleranzen nennen wir mit dem Angebot.</li></ul>${p.max_width_note ? `<p class="tp-rug-demo">${esc(p.max_width_note)}</p>` : ''}`],
      ['pflege', 'Pflege', '<p class="tp-rug-small">Pflegehinweise folgen je Qualität.</p>'],
      ['hinweise', 'Hinweise zur Maßanfertigung', '<ul class="tp-rug-bullets"><li>Maße sorgfältig prüfen – am besten zweimal messen.</li><li>Sonderanfertigungen werden individuell hergestellt.</li><li>Farben können je nach Bildschirm abweichen.</li><li>Ein Muster vorab ist sinnvoll.</li><li>Darstellungen im Visualisierer sind unverbindlich.</li></ul><p class="tp-rug-legal">Prüfhinweis (vor Livegang): Angaben zu Widerruf und Rückgabe folgen nach juristischer Prüfung.</p>'],
      ['sonderformen', 'Sonderformen', `<p>Neben Standardformen sind organische Formen, Vielecke und Sonderanfertigungen nach Skizze oder Schablone möglich – je nach Qualität.</p>${this.routes.sonderform ? `<p><a href="${esc(this.routes.sonderform)}">So funktioniert die Sonderanfertigung</a></p>` : ''}`],
      ['muster', 'Muster', `<p>Farben wirken auf jedem Bildschirm anders. Fordern Sie ein Muster an – wir melden uns mit den Details.</p>${this.routes.muster ? `<p><a href="${esc(this.routes.muster)}">Muster anfragen</a></p>` : ''}`],
      ['faq', 'FAQ', `<p>Antworten zu Messen, Größen, Einfassungen und Sonderformen.</p>${this.routes.faq ? `<p><a href="${esc(this.routes.faq)}">Zu den häufigen Fragen</a></p>` : ''}`],
    ];
    const u = this.uid;
    this.info.innerHTML = `<h2 class="tp-rug-h2 tp-rug-info__h">Alles zum Produkt</h2>
      <div class="tp-rug-info__tabs" role="tablist" aria-label="Produktinformationen">${panels.map(([k, t], i) => `<button type="button" role="tab" id="${u}-t-${k}" aria-controls="${u}-p-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${k}">${esc(t)}</button>`).join('')}</div>
      <div class="tp-rug-info__panels">${panels.map(([k, t, html], i) => `
        <section class="tp-rug-info__panel${i === 0 ? ' is-open' : ''}" id="${u}-p-${k}" role="tabpanel" aria-labelledby="${u}-t-${k}" data-panel="${k}">
          <button type="button" class="tp-rug-info__acc" aria-expanded="${i === 0}" data-acc="${k}">${esc(t)}</button>
          <div class="tp-rug-info__body">${html}</div>
        </section>`).join('')}</div>`;
  }

  openTab(key, focus) {
    this.info.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    this.info.querySelectorAll('[data-panel]').forEach((p) => { const on = p.dataset.panel === key; p.classList.toggle('is-open', on); p.querySelector('[data-acc]').setAttribute('aria-expanded', String(on)); });
  }

  syncHeader() {
    const p = this.product;
    const t = this.querySelector('[data-title]'); if (t) t.textContent = p.title;
    const st = this.querySelector('[data-subtitle]'); if (st) st.textContent = p.subtitle;
    const cr = this.closest('section')?.querySelector('[data-crumb]'); if (cr) cr.textContent = p.title;
    const tt = document.documentElement.dataset.tpRugTitleBase || document.title.replace(/^.*?\(Entwurf\)/, '(Entwurf)');
    document.documentElement.dataset.tpRugTitleBase = tt;
    if (this.dataset.mode === 'demo') document.title = `${p.title} – Teppich-Konfigurator ${tt}`;
  }

  /* ---------------- Ereignisse ---------------- */

  bind() {
    this.addEventListener('click', (e) => {
      const t = e.target.closest('[data-goto],[data-next],[data-back],[data-more-colors],[data-suggest],[data-copy],[data-share],[data-reset],[data-reset-yes],[data-reset-no],[data-visualize],[data-thumb],[data-tab],[data-acc]');
      if (!t || !this.contains(t)) return;
      if (t.dataset.goto !== undefined) this.go(Number(t.dataset.goto));
      else if (t.hasAttribute('data-next')) this.next();
      else if (t.hasAttribute('data-back')) this.go(this.s.step - 1);
      else if (t.hasAttribute('data-more-colors')) { this.querySelectorAll('[data-extra]').forEach((el) => { el.hidden = false; }); t.remove(); }
      else if (t.dataset.suggest) { this.setDim(t.dataset.suggest, t.dataset.value); const inp = this.querySelector(`[data-dim="${t.dataset.suggest}"]`); if (inp) { inp.value = t.dataset.value; inp.focus(); } }
      else if (t.hasAttribute('data-copy')) this.copy(summaryText(this.s, this.product, this.reference || ''), 'Konfiguration als Text kopiert.');
      else if (t.hasAttribute('data-share')) this.copy(this.shareUrl(), 'Link kopiert – er enthält nur Ihre Auswahl, keine persönlichen Daten.');
      else if (t.hasAttribute('data-reset')) { const box = this.querySelector('[data-reset-box]'); box.hidden = false; box.querySelector('[data-reset-no]').focus(); }
      else if (t.hasAttribute('data-reset-no')) { this.querySelector('[data-reset-box]').hidden = true; this.querySelector('[data-reset]').focus(); }
      else if (t.hasAttribute('data-reset-yes')) this.reset();
      else if (t.hasAttribute('data-visualize')) this.visualize(t);
      else if (t.dataset.thumb) { this.slideKind = t.dataset.thumb; this.updateGallery(); }
      else if (t.dataset.tab) this.openTab(t.dataset.tab);
      else if (t.dataset.acc) {
        const panel = t.closest('[data-panel]');
        const open = !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', open);
        t.setAttribute('aria-expanded', String(open));
      }
    });

    this.addEventListener('keydown', (e) => {
      const tab = e.target.closest?.('[data-tab]');
      if (!tab || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      const tabs = [...this.info.querySelectorAll('[data-tab]')];
      let i = tabs.indexOf(tab);
      i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault();
      this.openTab(tabs[i].dataset.tab, true);
    });

    this.addEventListener('change', (e) => {
      const t = e.target;
      if (!this.contains(t)) return;
      switch (t.name) {
        case 'product': this.switchProduct(t.value); return;
        case 'color': this.store.set({ color: t.value }); this.focusSlide('raum'); this.renderColorDependent(); return;
        case 'shape': this.setShape(t.value); return;
        case 'variant': this.store.set({ variant: t.value }); this.renderBody(IDX.masse); this.focusSlide('masse'); return;
        case 'edge': this.store.set({ edge: t.value, edgeColor: EDGES[t.value].colorLabel ? this.s.edgeColor : 'passend' }); this.querySelector('[data-edgecolors]').innerHTML = this.edgeColors(); this.renderBody(IDX.extras); this.focusSlide('kante'); return;
        case 'edgeColor': this.store.set({ edgeColor: t.value }); this.focusSlide('kante'); return;
        case 'antislip': this.store.set({ antiSlip: t.value === '1' }); return;
        case 'room': this.store.set({ room: t.value }); return;
        default: break;
      }
      if (t.dataset.dim && t.tagName === 'SELECT') this.setDim(t.dataset.dim, t.value);
    });

    this.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.dim && t.tagName === 'INPUT') this.setDim(t.dataset.dim, t.value);
      else if (t.name === 'notes' || t.name === 'requestText') this.store.set({ [t.name]: t.value });
      else if (t.matches('[data-color-search]')) this.filterColors(t.value);
    });

    this.addEventListener('focusout', (e) => {
      const t = e.target;
      if (t.dataset?.dim && t.tagName === 'INPUT') { this.touched.add(t.dataset.dim); this.updateDims(); }
    });
  }

  renderColorDependent() {
    const ec = this.querySelector('[data-edgecolors]');
    if (ec) ec.innerHTML = this.edgeColors();
  }

  setDim(k, v) {
    this.store.set((s) => ({ dims: { ...s.dims, [k]: String(v).slice(0, 12) } }));
    if (this.slideKind !== 'masse' && this.s.step === IDX.masse) this.focusSlide('masse');
  }

  setShape(shape) {
    const s = this.s;
    const keep = {};
    for (const k of SHAPES[shape].dims || []) if (s.dims[k]) keep[k] = s.dims[k];
    if (shape === 'quadrat' && !keep.side && s.dims.width) keep.side = s.dims.width;
    if ((shape === 'rund' || shape === 'halbkreis') && !keep.diameter && s.dims.width) keep.diameter = s.dims.width;
    this.touched.clear();
    this.attempted.delete(IDX.masse);
    this.store.set({ shape, dims: keep });
    this.renderBody(IDX.masse);
    this.focusSlide(SHAPES[shape].request ? 'raum' : 'masse');
  }

  switchProduct(handle) {
    const p = this.find(handle);
    if (!p) return;
    this.product = p;
    this.store.set(this.sanitize({ ...this.s, product: p.handle }, p));
    this.renderBodies();
    this.renderInfo();
    this.syncHeader();
    this.slideKind = p.images.length ? 'foto-0' : 'raum';
    const url = new URL(location.href);
    url.searchParams.set('produkt', p.handle);
    url.searchParams.delete('cfg');
    history.replaceState(null, '', url);
  }

  filterColors(q) {
    const needle = q.trim().toLowerCase();
    let shown = 0;
    this.querySelectorAll('[data-swatches] .tp-rug-swatch').forEach((el) => {
      const hit = !needle || el.dataset.name.includes(needle);
      el.hidden = !hit || (!needle && el.hasAttribute('data-extra') && !!this.querySelector('[data-more-colors]'));
      if (!el.hidden) shown++;
    });
    const empty = this.querySelector('[data-color-empty]');
    if (empty) empty.hidden = shown > 0;
  }

  blockStep(i) {
    this.attempted.add(i);
    const msgs = { farbe: 'Bitte wählen Sie eine Farbe.', form: 'Bitte wählen Sie eine Form.', masse: 'Bitte prüfen Sie die Maße.', kante: 'Bitte wählen Sie eine Einfassung.' };
    const err = this.querySelector(`[data-steperr="${i}"]`);
    if (err) { err.hidden = false; err.textContent = msgs[STEPS[i].key] || 'Bitte vervollständigen Sie diesen Schritt.'; }
    this.updateDims();
    const firstBad = this.querySelector(`[data-body="${i}"] [aria-invalid="true"], [data-body="${i}"] input[type=radio]`);
    if (firstBad) firstBad.focus();
  }

  next() {
    const i = this.s.step;
    if (!this.stepValid(i)) { this.blockStep(i); return; }
    const err = this.querySelector(`[data-steperr="${i}"]`);
    if (err) err.hidden = true;
    // Ist ein frueherer Schritt noch offen, dorthin fuehren statt still stehenzubleiben.
    const reach = this.maxReachable();
    if (i + 1 > reach) { this.go(reach); requestAnimationFrame(() => this.blockStep(reach)); return; }
    this.go(i + 1);
  }

  go(i) {
    if (i < 0 || i >= STEPS.length) return;
    if (i > this.maxReachable()) return;
    this.store.set({ step: i });
    if (i === IDX.vorschau || i === IDX.anfrage) this.focusSlide(i === IDX.vorschau ? 'raum' : this.slideKind);
    requestAnimationFrame(() => {
      const li = this.querySelector(`[data-step="${i}"]`);
      li?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      li?.querySelector('[data-goto]')?.focus({ preventScroll: true });
    });
  }

  reset() {
    clearDraft();
    this.handoff = null;
    this.reference = null;
    this.touched.clear();
    this.attempted.clear();
    this.restored = false;
    this.querySelector('[data-restored]').hidden = true;
    this.querySelector('[data-reset-box]').hidden = true;
    this.store.set(this.sanitize({ ...emptyConfig(this.product.handle), step: this.products.length > 1 && this.dataset.mode === 'demo' ? 0 : IDX.farbe }, this.product));
    this.renderBodies();
    this.slideKind = this.product.images.length ? 'foto-0' : 'raum';
    this.go(this.s.step);
  }

  shareUrl() {
    const url = new URL(location.href);
    url.searchParams.set('produkt', this.product.handle);
    url.searchParams.set('cfg', encodeShare(this.s));
    url.hash = 'konfigurator';
    return url.toString();
  }

  async copy(text, ok) {
    const status = this.querySelector('[data-copy-status]');
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = ok;
    } catch (e) {
      if (status) status.textContent = 'Kopieren ist hier nicht möglich. Bitte markieren und kopieren Sie den Text manuell.';
    }
  }

  payload() {
    const bad = this.firstInvalid(IDX.anfrage);
    if (bad !== -1) return { error: `Bitte vervollständigen Sie zuerst Schritt ${bad + 1} (${STEPS[bad].label}).` };
    if (!this.reference) this.reference = makeReference();
    const p = this.product;
    return {
      subject: `Teppich-Anfrage ${this.reference} – ${p.title}`,
      text: summaryText(this.s, p, this.reference),
      reference: this.reference,
      files: this.upload.meta(),
    };
  }

  async visualize(btn) {
    const src = this.dataset.visualizer;
    if (!src) return;
    btn.setAttribute('aria-busy', 'true');
    try {
      const mod = await import(src);
      const look = this.rugLook();
      const v = this.dimCheck();
      mod.openVisualizer({
        title: this.product.title,
        rug: { ...look, outline: look.outline || outline('rechteck', SAMPLE.rechteck), widthCm: v.ok ? v.metrics.widthCm : null, lengthCm: v.ok ? v.metrics.lengthCm : null },
        products: this.products.map((q) => ({ handle: q.handle, title: q.title, colors: q.colors, texture: q.texture, edges: q.edges })),
        returnFocus: btn,
      });
    } catch (e) {
      console.warn('tp-rug-visualizer:', e);
    } finally {
      btn.removeAttribute('aria-busy');
    }
  }
}

if (!customElements.get('tp-rug-configurator')) customElements.define('tp-rug-configurator', TpRugConfigurator);
