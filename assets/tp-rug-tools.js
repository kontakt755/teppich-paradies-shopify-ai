/*
 * tp-rug-tools.js - Werkzeuge des Teppichbereichs (Entwurf):
 *   <tp-rug-list>          Liste mit Filtern aus den Kartendaten (keine leeren Filter)
 *   <tp-rug-size-advisor>  Groessenberater (Regeln in tp-rug-core.js: adviseSize)
 *   <tp-rug-finder>        "Welcher Teppich passt zu mir?" - ordnet Antworten Kategorien zu
 *   <tp-rug-camper>        Wohnmobil-Assistent: Fahrzeug und Weg waehlen
 *   <tp-rug-request>       Sonderform-, Wohnmobil- und Musteranfrage mit Datei-Auswahl
 *   <tp-rug-vis-launch>    startet den Visualisierer erst bei Bedarf
 * Keine Preise, keine erfundenen Produkteigenschaften, keine KI-Behauptungen.
 */
import { ROOMS, SHAPES, EDGES, adviseSize, setHandoff, previewSVG, esc, fmtCm, makeReference, normalizeProduct } from './tp-rug-core.js';
import { UploadField } from './tp-rug-upload.js';
import { wireRequestForm } from './tp-rug-request.js';

const safeJson = (s, d = {}) => { try { return JSON.parse(s || ''); } catch (e) { return d; } };
const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
const svg = (inner, size = 20) => `<svg class="tp-rug-icon" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const CHECK = '<path d="M10 25l9 9 19-20"/>';
const ARROW = '<path d="M8 24h30m-10-10 10 10-10 10"/>';

/* ======================================================================
 * Liste mit Filtern
 * ====================================================================== */
const GROUPS = [
  ['raum', 'Raum', ROOMS],
  ['form', 'Form', Object.fromEntries(Object.entries(SHAPES).filter(([, v]) => v.group !== 'anfrage').map(([k, v]) => [k, v.label]))],
  ['kante', 'Einfassung', { kettel: 'Kettelung', paspel: 'Paspel', baumwolle: 'Baumwolle', cover: 'Cover (Kippkante)' }],
  ['material', 'Material', { velours: 'Velours', hochflor: 'Hochflor', schlinge: 'Schlinge', flachgewebe: 'Flachgewebe', objekt: 'Objektqualität', outdoor: 'Outdoor' }],
  ['flor', 'Florhöhe', { kurz: 'kurz', mittel: 'mittel', hoch: 'hoch', flach: 'flach gewebt' }],
  ['faser', 'Faser', { kunstfaser: 'Kunstfaser', wolle: 'Wolle', naturfaser: 'Naturfaser' }],
  ['eigenschaft', 'Eignung', { camper_suitable: 'Wohnmobil', outdoor_suitable: 'Outdoor', object_suitable: 'Objekt & Gewerbe' }],
  ['antirutsch', 'Antirutsch', { optional: 'Antirutschvlies wählbar', inklusive: 'Antirutschvlies inklusive' }],
];
const ATTR = { raum: 'raum', form: 'form', kante: 'kante', material: 'material', flor: 'flor', faser: 'faser', eigenschaft: 'eigenschaft', antirutsch: 'antirutsch' };
const TITLE = {
  raum: { wohnzimmer: 'Teppiche fürs Wohnzimmer', esszimmer: 'Teppiche fürs Esszimmer', schlafzimmer: 'Teppiche fürs Schlafzimmer', kueche: 'Teppiche für die Küche', flur: 'Teppiche für Flur & Diele', kinderzimmer: 'Teppiche fürs Kinderzimmer', homeoffice: 'Teppiche fürs Homeoffice', eingang: 'Teppiche für den Eingang', buero: 'Teppiche für Gewerbe & Büro', wohnmobil: 'Teppiche für Wohnmobil & Camper', outdoor: 'Outdoor-Teppiche' },
  form: { rechteck: 'Rechteckige Teppiche', quadrat: 'Quadratische Teppiche', rund: 'Runde Teppiche', oval: 'Ovale Teppiche', ellipse: 'Ellipsenförmige Teppiche', laeufer: 'Teppichläufer nach Maß', halbkreis: 'Halbrunde Teppiche', viertelkreis: 'Teppiche als Viertelkreis', dreieck: 'Dreieckige Teppiche', vieleck: 'Teppiche als Vieleck', organisch: 'Organisch geformte Teppiche' },
  kante: { kettel: 'Teppiche mit Kettelung', paspel: 'Teppiche mit Paspel', baumwolle: 'Teppiche mit Baumwoll-Einfassband', cover: 'Teppiche mit Cover-Kante' },
};
const INTRO = {
  wohnzimmer: 'Unter Sofa und Couchtisch: Der Teppich rahmt die Sitzgruppe. Tipp: Die Vorderfüße der Möbel dürfen darauf stehen.',
  esszimmer: 'Unter dem Esstisch soll der Teppich so groß sein, dass die Stühle auch zurückgeschoben noch darauf stehen.',
  schlafzimmer: 'Unter dem Bett, seitlich als Läufer oder quer am Fußende – für einen warmen ersten Schritt am Morgen.',
  kueche: 'Vor der Küchenzeile meist als Läufer. Flache, kurze Oberflächen sind hier praktisch.',
  flur: 'Läufer bis 10 m Länge – so schmal, dass links und rechts Boden sichtbar bleibt.',
  kinderzimmer: 'Runde und organische Formen machen den Spielbereich freundlich.',
  homeoffice: 'Unter dem Schreibtisch – groß genug, dass der Stuhl auch zurückgeschoben darauf steht.',
  eingang: 'Direkt hinter der Haustür, passend auf die Fläche zugeschnitten.',
  buero: 'Für Besprechung, Praxis, Hotel und Objekt – auch in großen Maßen.',
  wohnmobil: 'Als Rechteck mit Ihren Maßen oder als Sonderform nach Skizze oder Schablone.',
  outdoor: 'Für Terrasse und Balkon – Angaben zur Wetterbeständigkeit folgen mit den echten Produkten.',
};

class TpRugList extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.cards = [...this.querySelectorAll('[data-tp-rug-card]')];
    this.vals = (card, g) => (card.dataset[ATTR[g]] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const params = new URLSearchParams(location.search);
    this.sel = {};
    for (const [g] of GROUPS) {
      const v = params.get(g);
      if (v) this.sel[g] = new Set(v.split(',').filter(Boolean));
    }
    this.groupsEl = this.querySelector('[data-filter-groups]');
    this.filterEl = this.querySelector('[data-filter]');
    this.build();
    this.apply(false);
    this.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-f]');
      if (chip) { this.toggle(chip.dataset.f, chip.dataset.v); return; }
      if (e.target.closest('[data-filter-reset]')) { this.sel = {}; this.apply(true); return; }
      const tg = e.target.closest('[data-filter-toggle]');
      if (tg) { const c = this.filterEl.dataset.collapsed === 'true'; this.filterEl.dataset.collapsed = c ? 'false' : 'true'; tg.setAttribute('aria-expanded', String(c)); }
    });
  }

  build() {
    const html = [];
    this.groups = [];
    for (const [g, label, labels] of GROUPS) {
      const present = new Map();
      for (const c of this.cards) for (const v of this.vals(c, g)) if (labels[v]) present.set(v, (present.get(v) || 0) + 1);
      if (present.size < 2 && !(this.sel[g] && this.sel[g].size)) continue;
      this.groups.push(g);
      const order = Object.keys(labels).filter((k) => present.has(k));
      html.push(`<div class="tp-rug-filter__group" role="group" aria-label="${esc(label)}"><p class="tp-rug-filter__label">${esc(label)}</p><div class="tp-rug-filter__opts">${order.map((v) => {
        const ic = g === 'form' ? `form-${v}` : g === 'kante' ? `kante-${v}` : null;
        return `<button type="button" class="tp-rug-fchip" data-f="${g}" data-v="${v}" aria-pressed="false">${ic ? this.icon(ic) : ''}<span>${esc(labels[v])}</span><span class="tp-rug-fchip__n" data-n></span></button>`;
      }).join('')}</div></div>`);
    }
    // Raum, Form und Einfassung sofort; der Rest hinter "Weitere Filter" - sonst
    // schieben acht Gruppen die Teppiche unter die Falz.
    const main = 3;
    const extra = html.slice(main);
    const extraActive = this.groups.slice(main).some((g) => this.sel[g]?.size);
    this.groupsEl.innerHTML = html.slice(0, main).join('')
      + (extra.length ? `<div class="tp-rug-filter__more" data-more-groups ${extraActive ? '' : 'hidden'}>${extra.join('')}</div>
        <button type="button" class="tp-rug-textbtn tp-rug-filter__morebtn" data-more-toggle aria-expanded="${extraActive}">${extraActive ? 'Weniger Filter' : `Weitere Filter (${extra.length})`}</button>` : '');
    const mt = this.groupsEl.querySelector('[data-more-toggle]');
    if (mt) mt.addEventListener('click', () => {
      const box = this.groupsEl.querySelector('[data-more-groups]');
      box.hidden = !box.hidden;
      mt.setAttribute('aria-expanded', String(!box.hidden));
      mt.textContent = box.hidden ? `Weitere Filter (${extra.length})` : 'Weniger Filter';
    });
  }

  icon(name) {
    const tpl = document.querySelector(`template[data-tp-rug-icon="${name}"]`);
    return tpl ? tpl.innerHTML : '';
  }

  toggle(g, v) {
    const s = this.sel[g] || new Set();
    if (s.has(v)) s.delete(v); else s.add(v);
    if (s.size) this.sel[g] = s; else delete this.sel[g];
    this.apply(true);
  }

  matches(card, except) {
    for (const [g, s] of Object.entries(this.sel)) {
      if (g === except || !s.size) continue;
      const vals = this.vals(card, g);
      if (!vals.some((v) => s.has(v))) return false;
    }
    return true;
  }

  apply(pushUrl) {
    let shown = 0;
    for (const c of this.cards) { const ok = this.matches(c); c.hidden = !ok; if (ok) shown++; }
    this.querySelectorAll('[data-f]').forEach((b) => {
      const g = b.dataset.f; const v = b.dataset.v;
      const on = !!this.sel[g]?.has(v);
      b.setAttribute('aria-pressed', String(on));
      const n = this.cards.filter((c) => this.matches(c, g) && this.vals(c, g).includes(v)).length;
      b.querySelector('[data-n]').textContent = on ? '' : `(${n})`;
      b.disabled = !on && n === 0;
    });
    const active = Object.values(this.sel).reduce((a, s) => a + s.size, 0);
    this.querySelector('[data-count]').textContent = `${shown} von ${this.cards.length} ${this.cards.length === 1 ? 'Teppich' : 'Teppichen'}`;
    this.querySelectorAll('[data-filter-reset]').forEach((b) => { if (b.closest('[data-empty]')) return; b.hidden = !active; });
    const tg = this.querySelector('[data-filter-toggle]');
    if (tg) tg.textContent = active ? `Filter (${active})` : 'Filter';
    this.querySelector('[data-empty]').hidden = shown > 0;

    // Titel und Einleitung, wenn genau ein Wert gewaehlt ist
    const base = this.dataset.baseTitle || 'Alle Teppiche';
    let title = base; let intro = null;
    const singles = Object.entries(this.sel).filter(([, s]) => s.size);
    if (active === 1) {
      const [g, s] = singles[0]; const v = [...s][0];
      title = TITLE[g]?.[v] || `Teppiche: ${GROUPS.find((x) => x[0] === g)[2][v]}`;
      if (g === 'raum') intro = INTRO[v] || null;
    } else if (active > 1) title = 'Teppiche nach Ihrer Auswahl';
    const h = this.querySelector('[data-list-title]'); if (h) h.textContent = title;
    const introEl = this.querySelector('[data-list-intro]');
    if (introEl) { if (!introEl.dataset.base) introEl.dataset.base = introEl.textContent; introEl.textContent = intro || introEl.dataset.base; }
    const crumb = this.closest('section')?.querySelector('[data-crumb]'); if (crumb) crumb.textContent = title;
    document.title = `${title} (Entwurf)`;

    if (pushUrl) {
      const url = new URL(location.href);
      for (const [g] of GROUPS) url.searchParams.delete(g);
      for (const [g, s] of Object.entries(this.sel)) if (s.size) url.searchParams.set(g, [...s].join(','));
      history.replaceState(null, '', url);
    }
  }
}
define('tp-rug-list', TpRugList);

/* ======================================================================
 * Groessenberater
 * ====================================================================== */
const PLACES = {
  wohnzimmer: { label: 'Wohnzimmer', sub: 'unter der Sitzgruppe', fields: [['sofaBreite', 'Sofabreite', 220, true], ['sofaTiefe', 'Sofatiefe', 90], ['ueberstand', 'Überstand je Seite', 20]], extra: 'wohnzimmer' },
  esszimmer: { label: 'Esszimmer', sub: 'unter dem Esstisch', fields: [['tischLaenge', 'Tischlänge bzw. Durchmesser', 180, true], ['tischBreite', 'Tischbreite', 90], ['abstand', 'Platz hinter den Stühlen', 70]], extra: 'esszimmer' },
  schlafzimmer: { label: 'Schlafzimmer', sub: 'unter oder neben dem Bett', fields: [['bettBreite', 'Bettbreite', 180, true], ['bettLaenge', 'Bettlänge', 200]], extra: 'schlafzimmer' },
  flur: { label: 'Flur & Diele', sub: 'als Läufer', fields: [['flurBreite', 'Flurbreite', 120, true], ['flurLaenge', 'Flurlänge', 450, true]] },
  kueche: { label: 'Küche', sub: 'vor der Küchenzeile', fields: [['zeileLaenge', 'Länge der Küchenzeile', 300, true], ['gangBreite', 'Breite des Gangs', 110]] },
  homeoffice: { label: 'Homeoffice', sub: 'unter dem Schreibtisch', fields: [['tischBreite', 'Schreibtischbreite', 160, true], ['tischTiefe', 'Schreibtischtiefe', 80]] },
  wohnmobil: { label: 'Wohnmobil', sub: 'freie Bodenfläche', fields: [['flaecheBreite', 'Breite der Fläche', 90, true], ['flaecheLaenge', 'Länge der Fläche', 200, true]] },
  frei: { label: 'Freie Fläche', sub: 'mit Abstand zur Wand', fields: [['raumBreite', 'Raumbreite', 350, true], ['raumLaenge', 'Raumlänge', 450, true], ['wandAbstand', 'Abstand zur Wand', 30]] },
};

class TpRugSizeAdvisor extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.konf = this.dataset.konfUrl || '';
    this.products = safeJson(this.dataset.products);
    this.place = new URLSearchParams(location.search).get('raum') in PLACES ? new URLSearchParams(location.search).get('raum') : 'wohnzimmer';
    this.values = {};
    this.render();
    this.addEventListener('change', (e) => {
      if (e.target.name === 'tp-ra-place') { this.place = e.target.value; this.values = {}; this.renderFields(); this.calc(); return; }
      this.read(); this.calc();
    });
    this.addEventListener('input', () => { this.read(); this.calc(); });
    this.addEventListener('click', (e) => { if (e.target.closest('[data-apply]')) this.apply(); });
  }

  render() {
    const id = `ra${Math.random().toString(36).slice(2, 6)}`;
    this.id = id;
    this.innerHTML = `
      <fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">1 · Wo soll der Teppich liegen?</legend>
        <div class="tp-rug-stiles tp-rug-stiles--places">${Object.entries(PLACES).map(([k, p]) => `
          <label class="tp-rug-stile"><input type="radio" name="tp-ra-place" value="${k}" ${k === this.place ? 'checked' : ''}><span class="tp-rug-stile__label">${esc(p.label)}</span><span class="tp-rug-stile__hint">${esc(p.sub)}</span></label>`).join('')}</div>
      </fieldset>
      <div class="tp-rug-advisor__grid">
        <fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">2 · Maße eingeben (in cm)</legend><div data-fields></div></fieldset>
        <div class="tp-rug-advisor__result" data-result aria-live="polite"></div>
      </div>
      <p class="tp-rug-demo">Dies ist eine Empfehlung und ersetzt bei Sonderformen kein genaues Aufmaß.</p>`;
    this.renderFields();
    this.calc();
  }

  renderFields() {
    const p = PLACES[this.place]; const id = this.id;
    let extra = '';
    if (p.extra === 'wohnzimmer') {
      extra = `<fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">Wie soll der Teppich liegen?</legend><div class="tp-rug-radios">
        ${[['vorne', 'Vorderfüße darauf'], ['alle', 'Alle Möbel darauf'], ['davor', 'Nur vor dem Sofa']].map(([v, l], i) => `<label class="tp-rug-radio"><input type="radio" name="anordnung" value="${v}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
        <label class="tp-rug-check"><input type="checkbox" name="couchtisch" checked><span>Couchtisch vorhanden</span></label>
        <div class="tp-rug-field"><label for="${id}-tt">Tiefe des Couchtischs</label><div class="tp-rug-input"><input id="${id}-tt" type="text" inputmode="numeric" data-k="tischTiefe" placeholder="60"><span class="tp-rug-input__unit">cm</span></div></div>
        <label class="tp-rug-check"><input type="checkbox" name="sessel"><span>Sessel gegenüber vorhanden</span></label>`;
    } else if (p.extra === 'esszimmer') {
      extra = `<fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">Tischform</legend><div class="tp-rug-radios">
        <label class="tp-rug-radio"><input type="radio" name="tischForm" value="eckig" checked><span>rechteckig</span></label>
        <label class="tp-rug-radio"><input type="radio" name="tischForm" value="rund"><span>rund</span></label></div></fieldset>
        <div class="tp-rug-field"><label for="${id}-st">Anzahl Stühle <span class="tp-rug-field__unit">zur Orientierung</span></label><select id="${id}-st" name="stuehle">${[2, 4, 6, 8, 10, 12].map((n) => `<option ${n === 6 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    } else if (p.extra === 'schlafzimmer') {
      extra = `<fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">Wie soll der Teppich liegen?</legend><div class="tp-rug-radios">
        ${[['zweidrittel', 'Unter dem Bett (2/3)'], ['komplett', 'Komplett unter dem Bett'], ['seitlich', 'Nur seitlich'], ['fussende', 'Nur am Fußende']].map(([v, l], i) => `<label class="tp-rug-radio"><input type="radio" name="variante" value="${v}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>`;
    }
    this.querySelector('[data-fields]').innerHTML = p.fields.map(([k, l, ph, req]) => `
      <div class="tp-rug-field"><label for="${id}-${k}">${esc(l)}${req ? ' <span aria-hidden="true">*</span>' : ` <span class="tp-rug-field__unit">Standard ${ph} cm</span>`}</label>
        <div class="tp-rug-input"><input id="${id}-${k}" type="text" inputmode="numeric" data-k="${k}" placeholder="${ph}" ${req ? 'required' : ''}><span class="tp-rug-input__unit">cm</span></div></div>`).join('') + extra;
  }

  read() {
    const v = {};
    this.querySelectorAll('[data-k]').forEach((i) => { const n = Number(String(i.value).replace(',', '.')); if (n > 0) v[i.dataset.k] = n; });
    const radio = (n) => this.querySelector(`input[name="${n}"]:checked`)?.value;
    v.anordnung = radio('anordnung'); v.tischForm = radio('tischForm'); v.variante = radio('variante');
    const cb = (n) => this.querySelector(`input[name="${n}"]`)?.checked;
    v.couchtisch = cb('couchtisch') !== false; v.sessel = !!cb('sessel');
    this.values = v;
  }

  calc() {
    const out = this.querySelector('[data-result]');
    const res = adviseSize(this.place === 'frei' ? 'frei' : this.place, this.values);
    this.res = res;
    if (!res) {
      out.innerHTML = `<div class="tp-rug-advisor__empty">${svg('<path d="M6 30 30 6l12 12-24 24z"/><path d="m14 22 3 3m2-8 3 3m2-8 3 3m2-8 3 3"/>', 32)}<p>Geben Sie die mit * markierten Maße ein – die Empfehlung erscheint sofort.</p></div>`;
      return;
    }
    const dims = res.shape === 'rund' ? { diameter: String(res.width) } : { width: String(res.width), length: String(res.length) };
    const pv = previewSVG({ shape: res.shape, dims, edge: 'baumwolle', edgeColor: 'passend' }, { texture: 'velours', edgeWidths: { baumwolle: 3 } }, { width: 360, height: 240, fallbackColor: '#cdb99a' });
    out.innerHTML = `<p class="tp-rug-kicker">Unsere Empfehlung</p>
      <p class="tp-rug-advisor__size">ca. ${res.shape === 'rund' ? `Ø ${fmtCm(res.width)}` : `${res.width} × ${res.length} cm`}</p>
      <p class="tp-rug-small">${esc(SHAPES[res.shape]?.label || '')}${res.extra ? ` · ${esc(res.extra)}` : ''}</p>
      <div class="tp-rug-preview">${pv}</div>
      <ul class="tp-rug-checklist tp-rug-checklist--small" role="list">${res.why.map((w) => `<li>${svg(CHECK, 18)}<span>${esc(w)}</span></li>`).join('')}</ul>
      ${res.capped ? `<p class="tp-rug-note">${esc('Über 10 m Länge fertigen wir nur als Sonderanfertigung – bitte anfragen.')}</p>` : ''}
      <button type="button" class="tp-rug-btn tp-rug-btn--primary" data-apply>Maße in den Konfigurator übernehmen ${svg(ARROW, 18)}</button>`;
  }

  apply() {
    if (!this.res || !this.konf) return;
    const room = { wohnzimmer: 'wohnzimmer', esszimmer: 'esszimmer', schlafzimmer: 'schlafzimmer', flur: 'flur', kueche: 'kueche', homeoffice: 'homeoffice', wohnmobil: 'wohnmobil' }[this.place] || '';
    setHandoff({ shape: this.res.shape, width: this.res.width, length: this.res.length, room, source: 'berater' });
    const url = new URL(this.konf, location.href);
    const prod = this.products[this.place];
    if (prod) url.searchParams.set('produkt', prod);
    location.href = url.toString();
  }
}
define('tp-rug-size-advisor', TpRugSizeAdvisor);

/* ======================================================================
 * Einsatzort-Finder
 * ====================================================================== */
const F_ROOMS = { wohnzimmer: 'Wohnzimmer', esszimmer: 'Esszimmer', schlafzimmer: 'Schlafzimmer', kinderzimmer: 'Kinderzimmer', kueche: 'Küche', flur: 'Flur', buero: 'Büro', wohnmobil: 'Wohnmobil', outdoor: 'Outdoor', gewerbe: 'Gewerbe' };
const F_WISH = { weich: 'weich', pflegeleicht: 'pflegeleicht', robust: 'robust', natuerlich: 'natürlich', rutschfest: 'rutschfest', luxurioes: 'luxuriös', familie: 'familienfreundlich', tiere: 'Haustiere' };
const F_STYLE = { modern: 'modern', klassisch: 'klassisch', natuerlich: 'natürlich', minimal: 'minimalistisch', gemuetlich: 'gemütlich', auffaellig: 'auffällig' };

class TpRugFinder extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.base = this.dataset.listUrl || '';
    this.konf = this.dataset.konfUrl || '';
    this.catalog = safeJson(this.dataset.catalog, []);
    const q = (name, title, opts, multi) => `<fieldset class="tp-rug-fs"><legend class="tp-rug-fs__legend">${title}</legend><div class="tp-rug-radios">${Object.entries(opts).map(([k, l]) => `<label class="tp-rug-radio"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${k}"><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
    this.innerHTML = `${q('raum', '1 · Wo liegt der Teppich?', F_ROOMS)}${q('wunsch', '2 · Was ist Ihnen wichtig? (bis zu drei)', F_WISH, true)}${q('stil', '3 · Welcher Stil?', F_STYLE)}
      <div class="tp-rug-finder__result" data-result aria-live="polite"></div>
      <p class="tp-rug-demo">Der Berater ordnet Ihre Antworten Kategorien zu – feste Regeln, keine KI. Ob eine Qualität eine Eigenschaft wirklich hat, zeigen ihre Produktdaten.</p>`;
    this.addEventListener('change', (e) => {
      if (e.target.name === 'wunsch') {
        const on = this.querySelectorAll('input[name=wunsch]:checked');
        if (on.length > 3) e.target.checked = false;
      }
      this.result();
    });
    this.result();
  }

  result() {
    const raum = this.querySelector('input[name=raum]:checked')?.value;
    const wishes = [...this.querySelectorAll('input[name=wunsch]:checked')].map((i) => i.value);
    const stil = this.querySelector('input[name=stil]:checked')?.value;
    const out = this.querySelector('[data-result]');
    if (!raum) { out.innerHTML = '<p class="tp-rug-small">Beginnen Sie mit dem Raum – die Empfehlung baut sich mit jeder Antwort auf.</p>'; return; }
    const listRoom = { gewerbe: 'buero', buero: 'buero' }[raum] || raum;
    const recs = [];
    const q = new URLSearchParams();
    if (ROOMS[listRoom]) q.set('raum', listRoom);
    const shapeTip = { flur: ['laeufer', 'Als Läufer – schmal und lang.'], kueche: ['laeufer', 'Als Läufer vor der Zeile.'], kinderzimmer: ['rund', 'Rund oder organisch wirkt verspielt.'], esszimmer: ['rechteck', 'Rechteck oder rund – passend zur Tischform.'] }[raum];
    if (shapeTip) recs.push(['Form', shapeTip[1]]);
    if (wishes.some((w) => ['weich', 'luxurioes'].includes(w)) || stil === 'gemuetlich') recs.push(['Oberfläche', 'Velours oder Hochflor fühlen sich besonders weich an.']);
    if (wishes.some((w) => ['robust', 'familie', 'tiere'].includes(w)) || ['buero', 'gewerbe', 'flur'].includes(raum)) recs.push(['Oberfläche', 'Dichte, kurze Oberflächen wie Schlinge oder Objektqualitäten sind im Alltag oft die erste Wahl.']);
    if (wishes.includes('pflegeleicht')) recs.push(['Pflege', 'Kurzflorige und flach gewebte Teppiche lassen sich meist leichter reinigen – die Pflegehinweise stehen je Qualität.']);
    if (wishes.includes('natuerlich') || stil === 'natuerlich') recs.push(['Material', 'Wolle wirkt natürlich. Weitere Naturfasern folgen mit den echten Produkten.']);
    if (wishes.includes('rutschfest')) recs.push(['Extra', 'Wählen Sie das Antirutschvlies – bei der Cover-Kante ist es immer dabei.']);
    const edgeTip = { modern: 'Cover-Kante oder Paspel – ruhig und bandlos bzw. dezent.', minimal: 'Cover-Kante: kein Band, eine durchgehende Fläche.', klassisch: 'Kettelung oder Baumwoll-Einfassband.', natuerlich: 'Baumwoll-Einfassband in Beige oder Sand.', gemuetlich: 'Baumwoll-Einfassband in einem warmen Ton.', auffaellig: 'Baumwoll-Einfassband in Kontrastfarbe oder eine organische Form.' }[stil];
    if (edgeTip) recs.push(['Einfassung', edgeTip]);
    if (raum === 'wohnmobil') recs.push(['Tipp', 'Für Fahrzeuge ist eine Schablone meist die sicherste Grundlage.']);
    const listUrl = `${this.base}${this.base.includes('?') ? '&' : '?'}${q.toString()}`;
    const hits = this.catalog.map((p) => normalizeProduct(p)).filter((p) => !ROOMS[listRoom] || p.rooms.includes(listRoom)).slice(0, 3);
    out.innerHTML = `<p class="tp-rug-kicker">Unsere Empfehlung</p>
      <ul class="tp-rug-finder__recs" role="list">${recs.map(([k, t]) => `<li><strong>${esc(k)}:</strong> ${esc(t)}</li>`).join('') || '<li>Für diesen Raum passen viele Qualitäten – filtern Sie nach Form oder Einfassung.</li>'}</ul>
      ${hits.length ? `<p class="tp-rug-small" style="margin-top:12px">Passende Teppiche (Testdaten):</p><ul class="tp-rug-finder__hits" role="list">${hits.map((p) => `<li><a href="${esc(`${this.konf}${this.konf.includes('?') ? '&' : '?'}produkt=${encodeURIComponent(p.handle)}`)}"><img src="${esc(this.catalog.find((c) => c.handle === p.handle)?.image || '')}" alt="" width="120" height="90" loading="lazy"><span>${esc(p.title)}</span></a></li>`).join('')}</ul>` : ''}
      <a class="tp-rug-btn tp-rug-btn--primary" href="${esc(listUrl)}">Passende Kategorie ansehen ${svg(ARROW, 18)}</a>`;
  }
}
define('tp-rug-finder', TpRugFinder);

/* ======================================================================
 * Wohnmobil-Assistent
 * ====================================================================== */
class TpRugCamper extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    const p = new URLSearchParams(location.search).get('fahrzeug');
    const inp = p && this.querySelector(`input[name=fahrzeug][value="${CSS.escape(p)}"]`);
    if (inp) inp.checked = true;
    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-weg]');
      if (!btn) return;
      const vehicle = this.querySelector('input[name=fahrzeug]:checked')?.value || 'wohnmobil';
      const label = this.querySelector('input[name=fahrzeug]:checked')?.dataset.label || 'Wohnmobil';
      if (btn.dataset.weg === 'rechteck') {
        setHandoff({ room: 'wohnmobil', vehicle: label, source: 'wohnmobil' });
        return; // Link fuehrt weiter
      }
      e.preventDefault();
      const form = document.querySelector('tp-rug-request');
      if (form) { form.preset({ weg: btn.dataset.weg, fahrzeug: label, ort: 'wohnmobil' }); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    this.addEventListener('change', (e) => {
      if (e.target.name !== 'fahrzeug') return;
      const url = new URL(location.href); url.searchParams.set('fahrzeug', e.target.value); history.replaceState(null, '', url);
    });
  }
}
define('tp-rug-camper', TpRugCamper);

/* ======================================================================
 * Anfrage mit Datei-Auswahl (Sonderform, Wohnmobil, Muster)
 * ====================================================================== */
class TpRugRequest extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.form = this.querySelector('form[data-tp-rug-request]');
    const catalog = safeJson(this.dataset.catalog, []);
    const qsel = this.querySelector('[data-qselect]');
    if (qsel) qsel.insertAdjacentHTML('beforeend', catalog.map((c) => `<option value="${esc(c.handle)}">${esc(c.title)}</option>`).join(''));
    const mchecks = this.querySelector('[data-mchecks]');
    if (mchecks) mchecks.innerHTML = catalog.map((c) => `<label class="tp-rug-check"><input type="checkbox" data-q="qualitaeten" value="${esc(c.handle)}" data-label2="${esc(c.title)}"><span>${esc(c.title)}<small>${esc(c.subtitle || '')}</small></span></label>`).join('');
    const slot = this.querySelector('[data-upload-slot]');
    this.upload = slot ? new UploadField(slot, { label: this.dataset.uploadLabel || 'Skizze, Foto, Grundriss oder Schablone hochladen' }) : null;
    const p = new URLSearchParams(location.search);
    if (p.get('weg')) this.preset({ weg: p.get('weg') });
    if (p.get('produkt')) { const s = this.querySelector('select[data-q="qualitaet"]'); const opt = s && [...s.options].find((o) => o.value === p.get('produkt')); if (opt) s.value = opt.value; }
    wireRequestForm(this.form, { getPayload: () => this.payload() });
  }

  preset(v) {
    if (v.weg) { const s = this.querySelector('[data-q="weg"]'); if (s && [...s.options].some((o) => o.value === v.weg)) s.value = v.weg; }
    if (v.fahrzeug) { const s = this.querySelector('[data-q="fahrzeug"]'); if (s) s.value = v.fahrzeug; }
    if (v.ort) { const s = this.querySelector('[data-q="ort"]'); if (s && [...s.options].some((o) => o.value === v.ort)) s.value = v.ort; }
  }

  payload() {
    const ref = makeReference();
    const lines = [];
    this.querySelectorAll('[data-q]').forEach((el) => {
      const label = el.dataset.label || el.name;
      let val = el.type === 'checkbox' ? (el.checked ? 'ja' : '') : (el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value);
      if (el.dataset.q === 'qualitaeten') return;
      val = (val || '').trim();
      if (val) lines.push(`${label}: ${val}`);
    });
    const multi = [...this.querySelectorAll('[data-q="qualitaeten"]:checked')].map((i) => i.dataset.label2 || i.value);
    if (multi.length) lines.push(`Qualitäten: ${multi.join(', ')}`);
    const files = this.upload ? this.upload.meta() : [];
    if (files.length) lines.push(`Dateien: ${files.map((f) => f.name).join(', ')} (nicht mitgesendet – Kunde reicht nach)`);
    if (this.dataset.need === 'desc') {
      const d = (this.querySelector('[data-q="beschreibung"]')?.value || '').trim();
      if (d.length < 10 && !files.length) return { error: 'Bitte beschreiben Sie Ihre Form kurz oder wählen Sie eine Skizze oder ein Foto aus.' };
    }
    if (this.dataset.need === 'qualitaet' && !multi.length) return { error: 'Bitte wählen Sie mindestens eine Qualität für das Muster.' };
    return {
      subject: `${this.dataset.subject || 'Teppich-Anfrage'} ${ref}`,
      reference: ref,
      text: [`${this.dataset.subject || 'Teppich-Anfrage'} ${ref}`, ...lines, '', 'Unverbindliche Anfrage aus dem Teppichbereich (Entwurf, ohne Preise).'].join('\n'),
      files,
    };
  }
}
define('tp-rug-request', TpRugRequest);

/* ======================================================================
 * Visualisierer erst bei Bedarf laden
 * ====================================================================== */
class TpRugVisLaunch extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.catalog = safeJson(this.dataset.catalog, []).map((p) => ({ ...normalizeProduct(p), image: p.image }));
    const btn = this.querySelector('[data-start]');
    const sel = this.querySelector('[data-product]');
    const start = async () => {
      btn.disabled = true; btn.textContent = 'Wird geladen …';
      const mod = await import(this.dataset.module);
      const p = this.catalog.find((x) => x.handle === sel?.value) || this.catalog[0];
      this.querySelector('[data-intro]')?.remove();
      const mount = this.querySelector('[data-mount]');
      const edge = p?.edges?.[0] || '';
      this.inst?.destroy();
      this.inst = mod.mountVisualizer(mount, { colors: p?.colors, rug: { color: p?.colors?.[0]?.hex, edge, texture: p?.texture }, scene: p?.scene || 'wohnzimmer' });
      btn.hidden = true;
    };
    btn?.addEventListener('click', start);
    sel?.addEventListener('change', () => { if (this.inst) start(); });
  }
}
define('tp-rug-vis-launch', TpRugVisLaunch);
