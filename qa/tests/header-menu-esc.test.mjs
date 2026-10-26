import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Kopfzeile: Esc schliesst das offene Untermenue (Rundgang R2 #77, PR #1735).
// Pruefung PR #1735: Im "Mehr"-Menue blieb es offen, solange der Zeiger darueber
// stand, und der Fokus ging auf den dort verborgenen Hauptpunkt statt auf den
// sichtbaren "Mehr"-Knopf. Geladen wird das echte assets/header-menu.js mit
// einem kleinen DOM-Ersatz (nur die Selektoren, die das Skript benutzt).

const quelle = readFileSync(new URL('../../assets/header-menu.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '');

function passt(el, sel) {
  if (sel === ':hover') return el.hover;
  const attr = /^\[([\w-]+)="([^"]*)"\]?$/.exec(sel);
  if (attr) return el.getAttribute(attr[1]) === attr[2];
  if (sel.startsWith('.')) return (el.attrs.class ?? '').split(' ').includes(sel.slice(1));
  return el.tagName === sel.toUpperCase();
}

function buehne() {
  const doc = { activeElement: null, fokussiert: [] };
  class El {
    constructor(tag, attrs = {}, kinder = []) {
      this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.children = []; this.parentElement = null;
      this.dataset = {}; this.hover = false; this.offsetHeight = 120;
      const props = {};
      this.style = { props, setProperty: (k, w) => { props[k] = w; }, removeProperty: (k) => { delete props[k]; } };
      for (const k of kinder) this.append(k);
    }
    append(k) { k.parentElement = this; this.children.push(k); return k; }
    get slot() { return this.attrs.slot ?? ''; }
    getAttribute(n) { return this.attrs[n] ?? null; }
    hasAttribute(n) { return n in this.attrs; }
    contains(x) { for (let e = x; e; e = e.parentElement) if (e === this) return true; return false; }
    *alle() { for (const k of this.children) { yield k; yield* k.alle(); } }
    matches(sel) { return passt(this, sel); }
    querySelector(sel) {
      const teile = sel.split(' ');
      const letzter = teile.pop();
      for (const e of this.alle()) {
        if (!passt(e, letzter)) continue;
        if (!teile.length) return e;
        for (let a = e.parentElement; a && a !== this.parentElement; a = a.parentElement) if (passt(a, teile[0])) return e;
      }
      return null;
    }
    querySelectorAll() { return []; }
    closest(sel) { for (let e = this; e; e = e.parentElement) if (passt(e, sel)) return e; return null; }
    getBoundingClientRect() { return { top: 0, bottom: 120 }; }
    focus() { doc.activeElement = this; doc.fokussiert.push(this); }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {}
    setAttribute(n, w) { this.attrs[n] = w; }
  }
  class Component extends El {
    constructor() { super('header-menu'); this.horcher = {}; this.refs = {}; }
    connectedCallback() {}
    disconnectedCallback() {}
    addEventListener(typ, fn) { (this.horcher[typ] ??= []).push(fn); }
  }
  let Klasse = null;
  const ctx = vm.createContext({
    Component, HTMLElement: El, Element: El, Node: El,
    debounce: (fn) => fn, setHeaderMenuStyle() {}, MegaMenuHoverEvent: class {},
    customElements: { get: () => undefined, define: (_n, k) => { Klasse = k; } },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 0, setTimeout, clearTimeout,
    window: { addEventListener() {}, removeEventListener() {} },
    document: Object.assign(doc, { body: new El('body') }),
    PointerEvent: class {},
  });
  vm.runInContext(quelle, ctx);

  // Hauptpunkt mit Untermenue, zwei Punkte im "Mehr"-Menue (slot="overflow"), der "Mehr"-Knopf.
  const punkt = (slot, mitUnter) => {
    const link = new El('a', { ref: 'menuitem' });
    const unterLink = new El('a');
    const li = new El('li', slot ? { slot } : {}, [link, ...(mitUnter ? [new El('div', { ref: 'submenu[]' }, [unterLink])] : [])]);
    return { li, link, unterLink };
  };
  const haupt = punkt('', true); const mehr1 = punkt('overflow', true); const mehr2 = punkt('overflow', false);
  const mehrKnopf = new El('button');
  const mehrLi = new El('li', { slot: 'more' }, [mehrKnopf]);
  const menue = new Klasse();
  menue.append(new El('ul', {}, [haupt.li, mehr1.li, mehr2.li, mehrLi]));
  const kopf = new El('header-component', {}, [menue]);
  const ueberlauf = new El('div', { part: 'overflow' });
  const ueberlaufListe = new El('div', { part: 'overflow-list' });
  menue.refs.overflowMenu = { shadowRoot: new El('root', {}, [ueberlauf, ueberlaufListe]) };
  menue.connectedCallback();

  const esc = () => { let verhindert = false; for (const fn of menue.horcher.keydown) fn({ key: 'Escape', defaultPrevented: false, preventDefault: () => { verhindert = true; } }); return verhindert; };
  const fokusVerlassen = (el) => { for (const fn of menue.horcher.focusout) fn({ target: el }); };
  const offen = () => menue.ariaExpanded === 'true';
  return { doc, menue, kopf, haupt, mehr1, mehr2, mehrLi, mehrKnopf, ueberlauf, ueberlaufListe, esc, fokusVerlassen, offen };
}

test('Esc schliesst das "Mehr"-Menue auch, wenn der Zeiger darueber steht', () => {
  const b = buehne();
  b.menue.activate({ type: 'pointerenter', target: b.mehrLi });
  assert.equal(b.offen(), true); assert.equal(b.menue.dataset.overflowExpanded, 'true');
  b.ueberlauf.hover = true; b.ueberlaufListe.hover = true;
  assert.equal(b.esc(), true);
  assert.equal(b.offen(), false, 'geschlossen');
  assert.equal(b.mehr1.link.ariaExpanded, 'false');
  assert.equal(b.menue.dataset.overflowExpanded, 'false');
  assert.equal(b.kopf.style.props['--submenu-height'], '0px');
  // Der Zeiger allein (ohne Esc) schliesst es weiterhin nicht, solange er darueber steht.
  b.menue.activate({ type: 'pointerenter', target: b.mehrLi });
  b.menue.deactivate({ type: 'pointerleave', target: b.mehrLi, relatedTarget: null });
  assert.equal(b.offen(), true, 'Hover-Schutz fuer die Maus bleibt');
});

test('Esc aus einem Unterpunkt des "Mehr"-Menues: Fokus auf den sichtbaren "Mehr"-Knopf, kein Wiederoeffnen', () => {
  const b = buehne();
  b.doc.activeElement = b.mehr1.unterLink;
  b.menue.activate({ type: 'focus', target: b.mehr1.li });
  assert.equal(b.offen(), true);
  b.esc();
  assert.equal(b.offen(), false);
  assert.equal(b.doc.activeElement, b.mehrKnopf, 'Fokus auf "Mehr"');
  assert.ok(!b.doc.fokussiert.includes(b.mehr1.link), 'nicht auf den verborgenen Overflow-Link');
  // Der Fokus auf "Mehr" loest activate aus - das darf das Menue nicht sofort wieder oeffnen.
  b.menue.activate({ type: 'focus', target: b.mehrLi });
  assert.equal(b.offen(), false);
  // Verlaesst der Fokus den Knopf, gilt die Sperre nicht mehr.
  b.fokusVerlassen(b.mehrKnopf);
  b.menue.activate({ type: 'focus', target: b.mehrLi });
  assert.equal(b.offen(), true);
});

test('Esc auf dem "Mehr"-Knopf selbst und auf einem zweiten Overflow-Punkt', () => {
  const b = buehne();
  b.doc.activeElement = b.mehrKnopf;
  b.menue.activate({ type: 'focus', target: b.mehrLi });
  b.esc();
  assert.equal(b.offen(), false);
  assert.deepEqual(b.doc.fokussiert, [], 'Fokus steht schon auf "Mehr"');
  b.fokusVerlassen(b.mehrKnopf);
  b.doc.activeElement = b.mehr2.link;
  b.menue.activate({ type: 'focus', target: b.mehr2.li });
  assert.equal(b.offen(), true);
  b.esc();
  assert.equal(b.doc.activeElement, b.mehrKnopf);
  b.menue.activate({ type: 'focus', target: b.mehrLi });
  assert.equal(b.offen(), false, 'auch der erste Overflow-Punkt oeffnet nicht ueber den Fokus auf "Mehr"');
});

test('Hauptpunkt ausserhalb von "Mehr": Esc wie bisher - Fokus auf den Hauptpunkt, kein Wiederoeffnen', () => {
  const b = buehne();
  b.doc.activeElement = b.haupt.unterLink;
  b.menue.activate({ type: 'focus', target: b.haupt.li });
  assert.equal(b.offen(), true);
  b.esc();
  assert.equal(b.offen(), false);
  assert.equal(b.doc.activeElement, b.haupt.link);
  b.menue.activate({ type: 'focus', target: b.haupt.li });
  assert.equal(b.offen(), false);
  b.fokusVerlassen(b.haupt.link);
  b.menue.activate({ type: 'focus', target: b.haupt.li });
  assert.equal(b.offen(), true);
  // Ohne offenes Untermenue tut Esc nichts.
  const c = buehne();
  assert.equal(c.esc(), false);
});
