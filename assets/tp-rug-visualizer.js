/*
 * tp-rug-visualizer.js - "Teppich in meinem Raum ansehen" (Prototyp).
 *
 * Raumfoto im Browser laden (es wird NICHT hochgeladen), Teppich als Overlay
 * darueberlegen: verschieben, groesser/kleiner, drehen, neigen (Perspektive),
 * Form, Seitenverhaeltnis und Farbe wechseln, Vorher/Nachher vergleichen.
 * Keine KI - eine unverbindliche Overlay-Vorschau, und so steht es auch da.
 *
 * Austauschbar: openVisualizer(opts) und mountVisualizer(root, opts) sind die
 * einzige Schnittstelle. Ein spaeterer Anbieter ersetzt nur diese Datei.
 * Wird erst geladen, wenn jemand den Visualisierer oeffnet (dynamic import).
 */
import { sceneSVG, rugGroup, outline, pathD, resolveEdgeColor, ORGANIC, esc, metrics } from './tp-rug-core.js';

const SHAPE_OPTS = [
  ['konfig', 'Ihre Form aus dem Konfigurator'],
  ['rechteck', 'Rechteck'], ['quadrat', 'Quadrat'], ['rund', 'Rund'], ['oval', 'Oval'], ['ellipse', 'Ellipse'], ['laeufer', 'Läufer'],
  ...Object.entries(ORGANIC).map(([k, o]) => [`organisch:${k}`, `Organisch: ${o.label}`]),
];
const DEFAULT_COLORS = [
  { name: 'Sand', hex: '#cdb99a' }, { name: 'Anthrazit', hex: '#3b3d40' }, { name: 'Steingrau', hex: '#8b8a86' }, { name: 'Creme', hex: '#ece3d0' },
  { name: 'Terrakotta', hex: '#b5694a' }, { name: 'Salbei', hex: '#8fa08a' }, { name: 'Petrol', hex: '#2f5d62' }, { name: 'Mokka', hex: '#6e5746' },
];
const MAX_PHOTO = 20 * 1024 * 1024;
const dataUri = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

function outlineFor(shapeKey, ratio, base) {
  if (shapeKey === 'konfig' && base) return base;
  const [shape, variant] = shapeKey.split(':');
  const w = 100; const l = Math.round(100 * ratio);
  if (shape === 'quadrat') return outline('quadrat', { side: 100 });
  if (shape === 'rund') return outline('rund', { diameter: 100 });
  if (shape === 'laeufer') return outline('rechteck', { width: 100, length: Math.max(250, l) });
  return outline(shape, { width: w, length: l }, variant);
}

export function mountVisualizer(root, opts = {}) {
  const base = opts.rug?.outline || null;
  const baseM = base ? metrics(base) : null;
  const colors = (opts.colors && opts.colors.length ? opts.colors : DEFAULT_COLORS).filter((c) => c.hex);
  const st = {
    shape: base ? 'konfig' : 'rechteck',
    ratio: baseM ? baseM.lengthCm / baseM.widthCm : 1.5,
    color: opts.rug?.color || colors[0]?.hex || '#cdb99a',
    edge: opts.rug?.edge || '',
    edgeHex: opts.rug?.edgeHex || null,
    texture: opts.rug?.texture || 'velours',
    x: 0, y: 0.12, size: 0.46, rot: 0, tilt: 58,
    compare: false, split: 0.5,
    photo: null,
  };
  const id = `v${Math.random().toString(36).slice(2, 7)}`;
  const demoBg = dataUri(sceneSVG(opts.scene || 'wohnzimmer', {}, { noRug: true, idPrefix: 'vb' }));

  root.classList.add('tp-rug-vis');
  root.innerHTML = `
    <div class="tp-rug-vis__stage" data-stage>
      <img class="tp-rug-vis__photo" data-photo src="${demoBg}" alt="Beispielraum (Illustration)">
      <div class="tp-rug-vis__layer" data-layer>
        <div class="tp-rug-vis__rug" data-rug tabindex="0" role="group" aria-roledescription="verschiebbarer Teppich" aria-label="Teppich. Mit der Maus oder dem Finger verschieben. Tastatur: Pfeile verschieben, Plus und Minus Größe, Q und E drehen.">
          <div class="tp-rug-vis__rugsvg" data-rugsvg></div>
          <span class="tp-rug-vis__h tp-rug-vis__h--rot" data-h="rot" aria-hidden="true" title="Drehen"></span>
          <span class="tp-rug-vis__h tp-rug-vis__h--size" data-h="size" aria-hidden="true" title="Größe"></span>
        </div>
      </div>
      <div class="tp-rug-vis__split" data-split hidden><span>Vorher</span><span>Nachher</span></div>
      <p class="tp-rug-vis__badge">Unverbindliche Vorschau</p>
    </div>
    <div class="tp-rug-vis__panel">
      <div class="tp-rug-vis__row">
        <label class="tp-rug-btn tp-rug-btn--primary tp-rug-btn--small tp-rug-vis__file">Raumfoto wählen<input type="file" accept="image/jpeg,image/png,image/webp" data-file class="tp-rug-sr"></label>
        <button type="button" class="tp-rug-btn tp-rug-btn--ghost tp-rug-btn--small" data-demo>Beispielraum</button>
      </div>
      <p class="tp-rug-err" data-ferr role="alert" hidden></p>
      <div class="tp-rug-field"><label for="${id}-shape">Form</label>
        <select id="${id}-shape" data-shape>${SHAPE_OPTS.filter(([k]) => base || k !== 'konfig').map(([k, l]) => `<option value="${k}" ${k === st.shape ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">Farbe</legend>
        <div class="tp-rug-swatches tp-rug-swatches--small">${colors.map((c, i) => `<label class="tp-rug-swatch"><input type="radio" name="${id}-c" value="${esc(c.hex)}" ${c.hex === st.color || (!colors.some((x) => x.hex === st.color) && i === 0) ? 'checked' : ''}><span class="tp-rug-swatch__chip" style="--c:${esc(c.hex)}"></span><span class="tp-rug-swatch__name">${esc(c.name)}</span></label>`).join('')}</div></fieldset>
      ${[['size', 'Größe', 15, 95, Math.round(st.size * 100)], ['rot', 'Drehung', -180, 180, st.rot], ['tilt', 'Neigung (Blickwinkel)', 0, 75, st.tilt], ['ratio', 'Seitenverhältnis', 30, 400, Math.round(st.ratio * 100)]].map(([k, l, mn, mx, v]) => `
        <div class="tp-rug-vis__range"><label for="${id}-${k}">${l}</label><input id="${id}-${k}" type="range" min="${mn}" max="${mx}" value="${v}" data-r="${k}"></div>`).join('')}
      <label class="tp-rug-check"><input type="checkbox" data-compare><span>Vorher / Nachher vergleichen</span></label>
      <div class="tp-rug-vis__range" data-splitrow hidden><label for="${id}-split">Trennlinie</label><input id="${id}-split" type="range" min="5" max="95" value="50" data-r="split"></div>
      <button type="button" class="tp-rug-textbtn" data-reset>Position zurücksetzen</button>
      <p class="tp-rug-demo">Unverbindliche Vorschau – Größe, Farbe und Perspektive können vom Original abweichen. Ihr Foto bleibt auf Ihrem Gerät und wird nicht hochgeladen.</p>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const stage = $('[data-stage]'); const rugEl = $('[data-rug]'); const rugSvg = $('[data-rugsvg]');
  const layer = $('[data-layer]'); const photo = $('[data-photo]'); const split = $('[data-split]');
  let photoUrl = null;

  function drawRug() {
    const pts = outlineFor(st.shape, st.ratio, base);
    const m = metrics(pts);
    const W = 400; const s = W / m.widthCm; const H = m.lengthCm * s;
    const d = pathD(pts, 0, 0, s);
    const edgeHex = st.edgeHex && st.color === (opts.rug?.color) ? st.edgeHex : resolveEdgeColor(st.color, 'passend');
    const band = { baumwolle: 9, paspel: 4, kettel: 3.5, cover: 5 }[st.edge] || 0;
    rugSvg.innerHTML = `<svg viewBox="-8 -8 ${W + 16} ${H + 16}" width="100%" aria-hidden="true">${rugGroup(d, { id: `${id}r`, color: st.color, texture: st.texture, edge: st.edge, edgeHex, bandPx: band, bbox: { x0: 0, y0: 0, w: W, h: H }, shadowOpacity: 0.3, shadowOffset: 6, shadowBlur: 6, textureScale: 1.4 })}</svg>`;
    rugEl.style.setProperty('--ar', `${W + 16} / ${H + 16}`);
  }

  function place() {
    const r = stage.getBoundingClientRect();
    const w = r.width * st.size;
    rugEl.style.width = `${w}px`;
    rugEl.style.left = `${50 + st.x * 100}%`;
    rugEl.style.top = `${50 + st.y * 100}%`;
    rugEl.style.transform = `translate(-50%, -50%) perspective(${Math.round(r.width * 1.3)}px) rotateX(${st.tilt}deg) rotateZ(${st.rot}deg)`;
    layer.style.clipPath = st.compare ? `inset(0 0 0 ${st.split * 100}%)` : '';
    split.hidden = !st.compare;
    split.style.left = `${st.split * 100}%`;
    root.querySelectorAll('[data-r]').forEach((inp) => {
      const k = inp.dataset.r;
      const v = k === 'size' ? st.size * 100 : k === 'ratio' ? st.ratio * 100 : k === 'split' ? st.split * 100 : st[k];
      if (document.activeElement !== inp) inp.value = String(Math.round(v));
    });
    $('[data-splitrow]').hidden = !st.compare;
  }

  function update(redraw) { if (redraw) drawRug(); place(); }

  // Ziehen, Drehen, Groesse - Maus und Touch ueber Pointer Events, zwei Finger fuer Zoom/Drehung.
  const pointers = new Map();
  let mode = null; let start = null;
  function center() { const r = rugEl.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  rugEl.addEventListener('pointerdown', (e) => {
    rugEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const h = e.target.closest('[data-h]')?.dataset.h;
    mode = pointers.size === 2 ? 'pinch' : h || 'move';
    const [cx, cy] = center();
    start = { x: st.x, y: st.y, size: st.size, rot: st.rot, px: e.clientX, py: e.clientY, cx, cy, ang: Math.atan2(e.clientY - cy, e.clientX - cx), dist: Math.hypot(e.clientX - cx, e.clientY - cy) };
    if (mode === 'pinch') {
      const [a, b] = [...pointers.values()];
      start.pd = Math.hypot(a[0] - b[0], a[1] - b[1]); start.pa = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    e.preventDefault();
  });
  rugEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !start) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const r = stage.getBoundingClientRect();
    if (mode === 'move') {
      st.x = Math.max(-0.5, Math.min(0.5, start.x + (e.clientX - start.px) / r.width));
      st.y = Math.max(-0.5, Math.min(0.5, start.y + (e.clientY - start.py) / r.height));
    } else if (mode === 'rot') {
      st.rot = Math.round(start.rot + ((Math.atan2(e.clientY - start.cy, e.clientX - start.cx) - start.ang) * 180) / Math.PI);
    } else if (mode === 'size') {
      st.size = Math.max(0.12, Math.min(0.98, start.size * (Math.hypot(e.clientX - start.cx, e.clientY - start.cy) / (start.dist || 1))));
    } else if (mode === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      st.size = Math.max(0.12, Math.min(0.98, start.size * (Math.hypot(a[0] - b[0], a[1] - b[1]) / (start.pd || 1))));
      st.rot = Math.round(start.rot + ((Math.atan2(b[1] - a[1], b[0] - a[0]) - start.pa) * 180) / Math.PI);
    }
    place();
  });
  const end = (e) => { pointers.delete(e.pointerId); if (!pointers.size) { mode = null; start = null; } };
  rugEl.addEventListener('pointerup', end);
  rugEl.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.altKey) return;
    e.preventDefault();
    st.size = Math.max(0.12, Math.min(0.98, st.size * (e.deltaY > 0 ? 0.95 : 1.05)));
    place();
  }, { passive: false });

  rugEl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const map = {
      ArrowLeft: () => { st.x -= step; }, ArrowRight: () => { st.x += step; }, ArrowUp: () => { st.y -= step; }, ArrowDown: () => { st.y += step; },
      '+': () => { st.size = Math.min(0.98, st.size * 1.05); }, '=': () => { st.size = Math.min(0.98, st.size * 1.05); }, '-': () => { st.size = Math.max(0.12, st.size * 0.95); },
      q: () => { st.rot -= 5; }, e: () => { st.rot += 5; }, Q: () => { st.rot -= 5; }, E: () => { st.rot += 5; },
    };
    if (map[e.key]) { e.preventDefault(); map[e.key](); place(); }
  });

  root.addEventListener('input', (e) => {
    const k = e.target.dataset?.r;
    if (!k) return;
    const v = Number(e.target.value);
    if (k === 'size') st.size = v / 100;
    else if (k === 'ratio') { st.ratio = v / 100; if (st.shape === 'konfig') { st.shape = 'rechteck'; $('[data-shape]').value = 'rechteck'; } update(true); return; }
    else if (k === 'split') st.split = v / 100;
    else st[k] = v;
    place();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-shape]')) { st.shape = t.value; if (t.value === 'rund' || t.value === 'quadrat') st.ratio = 1; update(true); }
    else if (t.name === `${id}-c`) { st.color = t.value; update(true); }
    else if (t.matches('[data-compare]')) { st.compare = t.checked; place(); }
    else if (t.matches('[data-file]')) {
      const f = t.files?.[0];
      const err = $('[data-ferr]');
      err.hidden = true;
      if (!f) return;
      if (/heic|heif/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) { err.hidden = false; err.textContent = 'HEIC-Fotos bitte als JPG oder PNG wählen.'; return; }
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { err.hidden = false; err.textContent = 'Bitte ein Foto im Format JPG, PNG oder WebP wählen.'; return; }
      if (f.size > MAX_PHOTO) { err.hidden = false; err.textContent = 'Das Foto ist größer als 20 MB.'; return; }
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(f);
      photo.src = photoUrl;
      photo.alt = 'Ihr Raumfoto (nur auf Ihrem Gerät)';
      t.value = '';
    }
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-demo]')) { if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = null; photo.src = demoBg; photo.alt = 'Beispielraum (Illustration)'; }
    if (e.target.closest('[data-reset]')) { Object.assign(st, { x: 0, y: 0.12, size: 0.46, rot: 0, tilt: 58 }); place(); }
  });

  const ro = new ResizeObserver(() => place());
  ro.observe(stage);
  update(true);
  return { destroy() { ro.disconnect(); if (photoUrl) URL.revokeObjectURL(photoUrl); root.innerHTML = ''; } };
}

export function openVisualizer(opts = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'tp-rug tp-rug-vis-dialog';
  dlg.setAttribute('aria-labelledby', 'tp-rug-vis-title');
  dlg.innerHTML = `<div class="tp-rug-vis-dialog__head"><h2 class="tp-rug-h3" id="tp-rug-vis-title">${esc(opts.title ? `${opts.title} im eigenen Raum` : 'Teppich im eigenen Raum')}</h2>
    <button type="button" class="tp-rug-vis-dialog__close" data-close aria-label="Schließen">×</button></div><div data-mount></div>`;
  document.body.appendChild(dlg);
  const product = opts.products?.[0];
  const inst = mountVisualizer(dlg.querySelector('[data-mount]'), { ...opts, colors: opts.colors || (product ? product.colors : null) });
  const close = () => { inst.destroy(); dlg.close(); dlg.remove(); opts.returnFocus?.focus(); };
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.showModal();
  return { close };
}
