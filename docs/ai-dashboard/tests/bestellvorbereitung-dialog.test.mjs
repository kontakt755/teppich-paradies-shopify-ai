import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Nur synthetische Vorlagen; alle Netz-, Zwischenablage- und Fensteraktionen sind Stubs.
const quelle = fs.readFileSync(new URL('../ansichten/einkauf/lieferanten.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const vorlage = (nr = 0) => ({ art: 'muster', text: `Testmuster ${nr}`, betreff: `Testvorlage ${nr}`, an: 'test@example.invalid',
  weg: 'mail', mailto: `mailto:test@example.invalid?subject=Test${nr}`, lieferziel: 'laden', vorbereitungStand: `hash-${nr}`,
  positionen: [{ orderId: `test-order-${nr}`, lineItemId: `test-item-${nr}`, titel: 'Testmuster' }], fehlt: [], ohneBestellung: [] });
const daten = () => ({ verfuegbar: true, name: 'Lieferant Test', mails: [vorlage(0), vorlage(1)] });

function knopf({ index = 0, href = null, target = '', text } = {}) {
  return { dataset: { lfGeoeffnet: String(index), ...(text === undefined ? {} : { kopiertext: text }) }, target,
    tagName: href ? 'A' : 'BUTTON', disabled: false, attrs: {}, textContent: '',
    getAttribute: key => key === 'href' ? href : null,
    setAttribute(key, wert) { this.attrs[key] = wert; }, removeAttribute(key) { if (key === 'href') href = null; },
  };
}

function umgebung(optionen = {}) {
  const config = { lesend: false, konflikt: false, popupBlockiert: false, clipboardFehler: false, modern: true, geste: true, execFehler: false, ...optionen };
  const posts = [], gets = [], kopien = [], clipboardStarts = [], fenster = [], statuswrites = [], toasts = [], fallback = [];
  const browser = { location: { href: '' } };
  const root = { innerHTML: '' }, warnung = { hidden: true }, neu = { hidden: true };
  const fragen = new Map(), elemente = [];
  const state = { route: { params: new URLSearchParams('auftrag=test-order') } };
  const einkauf = { auftragsstatus: null, bestellungen: { auftraege: [] } };
  const $ = selector => {
    if (selector === '#dialogRoot') return root;
    if (selector === '#dialogRoot .lf-dialog') return root.innerHTML.includes('class="dialog lf-dialog"') ? root : null;
    if (selector === '#dialogRoot [data-lf-fehler]') return warnung;
    if (selector === '#dialogRoot [data-lf-neu]') return neu;
    const frage = selector.match(/data-lf-frage="(\d+)"/);
    if (frage) { if (!fragen.has(frage[1])) fragen.set(frage[1], { hidden: true }); return fragen.get(frage[1]); }
    if (selector.startsWith('#lfNr')) return { value: 'TEST-AB' };
    return { focus() {} };
  };
  const modul = vm.runInNewContext(quelle + '\n({ openBestellmailDialog, ladeDialog, uebergebeVorlage, markiereMail, einkaufKlickLieferanten, dialog })', {
    state, einkauf, $, URLSearchParams, Blob,
    Date: class extends Date { static now() { return config.jetzt ?? Date.now(); } },
    ClipboardItem: config.modern ? class { constructor(inhalt) { this.inhalt = inhalt; } } : undefined,
    esc: v => String(v ?? ''), plural: (n, a, b) => `${n} ${n === 1 ? a : b}`,
    istNurLesend: () => config.lesend,
    uebernahmeBlock: () => config.lesend ? '' : '<button data-einkauf-uebernahme="freigeben">Freigeben</button><button data-einkauf-uebernahme="uebernehmen">Als Inhaber übernehmen</button>',
    anzeigeWert: v => v,
    gmailLink: () => ({ url: 'https://mail.google.com/test' }), telLink: n => `tel:${n}`,
    toast: (...args) => toasts.push(args), render() {},
    afEintragFuer: () => ({ status: 'bestellt' }), kundeUndOrt: () => ({ name: 'Testkunde', ort: 'Testort' }),
    markiereAlsBestellt: async (positionen, nr, opt) => { statuswrites.push({ positionen, nr, opt }); return positionen.length; },
    fetchEinkauf: async pfad => { gets.push(pfad); return pfad.startsWith('/api/einkauf/bestellmail') ? daten() : { verfuegbar: true, positionen: { frisch: true } }; },
    orgSchreiben: async (pfad, payload) => {
      posts.push({ pfad, payload });
      if (config.konflikt) throw new Error('409: Uebernahme geaendert');
      if (payload.aktion === 'bestellPruefen' && config.pruefen) return config.pruefen();
      return payload.aktion === 'bestellVorbereitung' ? daten() : {};
    },
    navigator: { clipboard: {
      write: async items => {
        clipboardStarts.push({ geste: config.geste });
        if (!config.geste || config.clipboardFehler) throw new Error('NotAllowedError');
        const blob = await items[0].inhalt['text/plain'];
        kopien.push(await blob.text());
      },
    } },
    document: {
      querySelectorAll: () => elemente,
      body: { append: el => fallback.push({ aktion: 'append', el }) },
      createElement: () => ({ value: '', setAttribute() {}, select() { fallback.push({ aktion: 'select' }); }, remove() { fallback.push({ aktion: 'remove' }); } }),
      execCommand: befehl => { fallback.push({ aktion: befehl, geste: config.geste }); return config.geste && !config.execFehler; },
    },
    window: {
      location: browser.location,
      open: (url, ziel) => {
        if (config.popupBlockiert) return null;
        const f = { url, ziel, closed: false, location: { href: url }, close() { this.closed = true; } };
        fenster.push(f); return f;
      },
    },
  });
  return { ...modul, config, posts, gets, kopien, clipboardStarts, fenster, statuswrites, toasts, fallback, browser, root, warnung, neu, fragen, elemente, einkauf,
    async oeffnen() { modul.openBestellmailDialog('TEST', 'muster'); await tick(); },
    geschlossen() { root.innerHTML = ''; },
  };
}

test('Oeffnen reserviert Vorbereitung per POST und holt aktuellen Status; zweite Vorlage behaelt eigenen Hash', async () => {
  const u = umgebung(); await u.oeffnen();
  assert.equal(u.posts.length, 1);
  assert.equal(u.posts[0].payload.aktion, 'bestellVorbereitung');
  assert.equal(u.posts[0].payload.auftrag, 'test-order');
  assert.deepEqual(u.gets, ['/api/einkauf/auftragsstatus']);
  assert.equal(u.einkauf.auftragsstatus.positionen.frisch, true);
  const zweite = u.dialog.daten.mails[1];
  await u.uebergebeVorlage(knopf({ index: 0, text: 'Testmuster 0' }));
  assert.equal(u.dialog.daten.mails[1], zweite);
  assert.equal(zweite.vorbereitungStand, 'hash-1');
  await u.uebergebeVorlage(knopf({ index: 1, text: 'Testmuster 1' }));
  assert.deepEqual(u.posts.slice(1).map(p => p.payload.mailStand), ['hash-0', 'hash-1']);
});

test('Nur Ansicht liest ausschliesslich und bietet keine Kopier-, Handoff- oder Bestellbestaetigung', async () => {
  const u = umgebung({ lesend: true }); await u.oeffnen();
  assert.equal(u.posts.length, 0);
  assert.equal(u.gets.length, 2);
  assert.match(u.gets[0], /^\/api\/einkauf\/bestellmail\?/);
  assert.ok(!/data-lf-geoeffnet|data-lf-markieren|data-kopiertext/.test(u.root.innerHTML));
  await u.uebergebeVorlage(knopf({ href: 'https://example.invalid', target: '_blank' }));
  assert.equal(u.fenster.length, 0);
  assert.equal(u.posts.length, 0);
});

test('Vorbereitungskonflikt zeigt Lesekopie und sperrt jede Uebergabe', async () => {
  const u = umgebung({ konflikt: true }); await u.oeffnen();
  assert.match(u.root.innerHTML, /Testmuster 0/);
  assert.match(u.root.innerHTML, /409/);
  assert.ok(!/data-lf-geoeffnet|data-kopiertext/.test(u.root.innerHTML));
  await u.uebergebeVorlage(knopf({ text: 'Test' }));
  assert.equal(u.posts.length, 1);
  assert.equal(u.kopien.length, 0);
});

test('vor Kopieren und Markieren wird die konkrete Vorlage frisch geprueft', async () => {
  const u = umgebung(); await u.oeffnen();
  await u.uebergebeVorlage(knopf({ text: 'Testmuster 0' }));
  assert.equal(u.posts.at(-1).payload.aktion, 'bestellPruefen');
  assert.equal(u.posts.at(-1).payload.mailStand, 'hash-0');
  assert.deepEqual(u.kopien, ['Testmuster 0']);
  const b = knopf(); await u.markiereMail(1, b);
  assert.equal(u.posts.at(-1).payload.mailStand, 'hash-1');
  assert.equal(u.statuswrites.length, 1);
  assert.equal(u.statuswrites[0].positionen[0].lineItemId, 'test-item-1');
  assert.equal(u.statuswrites[0].nr, 'TEST-AB');
});

test('409 unmittelbar vor Uebergabe verhindert Clipboard, externe Navigation und Statusschreiben', async () => {
  for (const art of ['kopie', 'gmail', 'markieren']) {
    const u = umgebung(); await u.oeffnen(); u.config.konflikt = true;
    const b = knopf(art === 'gmail' ? { href: 'https://mail.google.com/test', target: '_blank' } : { text: 'Test' });
    u.elemente.push(b);
    if (art === 'markieren') await u.markiereMail(0, b); else await u.uebergebeVorlage(b);
    assert.equal(u.kopien.length, 0);
    assert.equal(u.statuswrites.length, 0);
    assert.ok(u.fenster.every(f => f.location.href === 'about:blank' && f.closed));
    assert.equal(u.warnung.hidden, false);
    assert.equal(u.neu.hidden, false);
  }
});

test('Dialogabbruch und neuer Dialog waehrend der Pruefung verhindern alte Uebergabe', async () => {
  for (const wechsel of ['abbruch', 'neu']) {
    const u = umgebung(); await u.oeffnen();
    let fertig; u.config.pruefen = () => new Promise(resolve => { fertig = resolve; });
    const lauf = u.uebergebeVorlage(knopf({ href: 'https://example.invalid/portal', target: '_blank' }));
    assert.equal(typeof fertig, 'function');
    if (wechsel === 'abbruch') u.geschlossen(); else { u.openBestellmailDialog('ANDERER', 'muster'); await tick(); }
    fertig({}); await lauf;
    assert.ok(u.fenster[0].closed);
    assert.equal(u.fenster[0].location.href, 'about:blank');
    assert.equal(u.kopien.length, 0);
    assert.equal(u.statuswrites.length, 0);
  }
});

test('Mailprogramm, Gmail und Portal gehen erst nach erfolgreicher Serverpruefung auf', async () => {
  for (const href of ['mailto:test@example.invalid?subject=Test', 'https://mail.google.com/test', 'https://example.invalid/portal']) {
    const u = umgebung(); await u.oeffnen();
    const b = knopf({ href, target: href.startsWith('https:') ? '_blank' : '' });
    await u.uebergebeVorlage(b);
    assert.equal(u.posts.at(-1).payload.aktion, 'bestellPruefen');
    if (href.startsWith('https:')) {
      assert.equal(u.fenster[0].url, 'about:blank');
      assert.equal(u.fenster[0].location.href, href);
      assert.equal(u.fenster[0].opener, null);
    } else assert.equal(u.browser.location.href, href);
    assert.equal(u.fragen.get('0').hidden, false);
    assert.equal(u.statuswrites.length, 0);
  }
});

test('Popupblocker bietet Hinweis ohne Bestellmarkierung; Clipboardfallback entfernt Hilfsfeld', async () => {
  const popup = umgebung({ popupBlockiert: true }); await popup.oeffnen();
  await popup.uebergebeVorlage(knopf({ href: 'https://example.invalid/portal', target: '_blank' }));
  assert.match(popup.toasts[0][0], /Popups/);
  assert.equal(popup.statuswrites.length, 0);
  assert.equal(popup.fragen.size, 0);
  const u = umgebung({ clipboardFehler: true }); await u.oeffnen();
  const b = knopf({ text: 'Testmuster 0' }); await u.uebergebeVorlage(b);
  assert.equal(b.textContent, 'Jetzt kopieren');
  await u.uebergebeVorlage(b);
  assert.deepEqual(u.fallback.map(f => f.aktion), ['append', 'select', 'copy', 'remove']);
  assert.equal(b.textContent, 'Kopiert');
  assert.equal(u.fallback[0].el.value, 'Testmuster 0');
});


test('Klickhandler verhindert native Linknavigation und uebergibt erst nach Pruefung', async () => {
  const u = umgebung(); await u.oeffnen();
  const b = knopf({ href: 'mailto:test@example.invalid' });
  let verhindert = false;
  assert.equal(u.einkaufKlickLieferanten({
    target: { closest: selector => selector === '[data-lf-geoeffnet]' ? b : null },
    preventDefault() { verhindert = true; },
  }), true);
  assert.equal(verhindert, true);
  await tick();
  assert.equal(u.browser.location.href, 'mailto:test@example.invalid');
  assert.equal(u.posts.at(-1).payload.aktion, 'bestellPruefen');
});

test('auch Markieren nach Dialogabbruch oder Besitzerkonflikt schreibt keinen Status', async () => {
  for (const abbruch of [false, true]) {
    const u = umgebung(); await u.oeffnen();
    let fertig;
    u.config.pruefen = () => new Promise((resolve, reject) => { fertig = abbruch ? resolve : () => reject(new Error('409: Besitzer gewechselt')); });
    const lauf = u.markiereMail(0, knopf());
    if (abbruch) u.geschlossen();
    fertig({}); await lauf;
    assert.equal(u.statuswrites.length, 0);
    assert.equal(u.kopien.length, 0);
    assert.equal(u.fenster.length, 0);
  }
});


test('Freigabe zieht Anzeige nach, sperrt Vorlage und nimmt Arbeit nicht automatisch erneut', async () => {
  const u = umgebung(); await u.oeffnen();
  assert.match(u.root.innerHTML, /data-lf-uebernahme="freigeben"/);
  assert.ok(!u.root.innerHTML.includes('data-einkauf-uebernahme='));
  const b = { dataset: { lfUebernahme: 'freigeben', einkaufPositionen: JSON.stringify(vorlage().positionen) }, disabled: false };
  let verhindert = false;
  assert.equal(u.einkaufKlickLieferanten({ target: { closest: selector => selector === '[data-lf-uebernahme]' ? b : null }, preventDefault() { verhindert = true; } }), true);
  await tick();
  assert.equal(verhindert, true);
  assert.deepEqual(u.posts.map(p => p.payload.aktion), ['bestellVorbereitung', 'uebernahme']);
  assert.equal(u.posts[1].payload.uebernahmeAktion, 'freigeben');
  assert.equal(u.gets.filter(p => p === '/api/einkauf/auftragsstatus').length, 2);
  assert.match(u.root.innerHTML, /Arbeit freigegeben/);
  assert.match(u.root.innerHTML, /data-lf-neu>Vorbereitung erneut prüfen/);
  assert.ok(!/data-lf-geoeffnet|data-kopiertext/.test(u.root.innerHTML));
  await u.uebergebeVorlage(knopf({ text: 'Test' }));
  await tick();
  assert.equal(u.posts.length, 2, 'gesperrte Uebergabe darf weder neu reservieren noch pruefen');
  assert.equal(u.kopien.length, 0);
  assert.equal(u.statuswrites.length, 0);
});

test('Inhaberuebernahme passiert nur durch bewussten Dialogknopf und bereitet anschliessend frisch vor', async () => {
  const u = umgebung({ konflikt: true }); await u.oeffnen();
  assert.equal(u.posts.length, 1);
  assert.equal(u.posts[0].payload.aktion, 'bestellVorbereitung');
  assert.match(u.root.innerHTML, /data-lf-uebernahme="uebernehmen"/);
  await tick();
  assert.equal(u.posts.length, 1, 'Lesekopie darf keine Inhaberuebernahme ausloesen');
  u.config.konflikt = false;
  const b = { dataset: { lfUebernahme: 'uebernehmen', einkaufPositionen: JSON.stringify(vorlage().positionen) }, disabled: false };
  assert.equal(u.einkaufKlickLieferanten({ target: { closest: selector => selector === '[data-lf-uebernahme]' ? b : null }, preventDefault() {} }), true);
  await tick();
  assert.deepEqual(u.posts.map(p => p.payload.aktion), ['bestellVorbereitung', 'uebernahme', 'bestellVorbereitung']);
  assert.equal(u.posts[1].payload.uebernahmeAktion, 'uebernehmen');
  assert.equal(u.dialog.fehler, null);
  assert.match(u.root.innerHTML, /data-lf-geoeffnet="0"/);
  assert.equal(u.gets.filter(p => p === '/api/einkauf/auftragsstatus').length, 2);
  assert.equal(u.statuswrites.length, 0);
  assert.equal(u.kopien.length, 0);
  assert.equal(u.fenster.length, 0);
});

test('Safari-Schreibaufruf nutzt erste Geste, Promise gibt Text erst nach verzoegerter Serverfreigabe heraus', async () => {
  const u = umgebung(); await u.oeffnen();
  let freigeben;
  u.config.pruefen = () => new Promise(resolve => { freigeben = resolve; });
  const lauf = u.uebergebeVorlage(knopf({ text: 'Testmuster 0' }));
  assert.deepEqual(u.clipboardStarts, [{ geste: true }], 'write startet vor dem ersten await noch im Klick');
  assert.equal(u.kopien.length, 0, 'ungepruefter Text wird nicht an die Zwischenablage geliefert');
  u.config.geste = false;
  freigeben({}); await lauf;
  assert.deepEqual(u.kopien, ['Testmuster 0'], 'bereits gestartetes write darf spaeter geprueften Blob erhalten');
  assert.equal(u.fallback.length, 0);
});

test('verzoegerter Konflikt oder geschlossener Dialog liefert auch einem wartenden ClipboardItem keinen Text', async () => {
  for (const abbruch of [false, true]) {
    const u = umgebung(); await u.oeffnen();
    let fertig;
    u.config.pruefen = () => new Promise((resolve, reject) => { fertig = abbruch ? resolve : () => reject(new Error('409: geaendert')); });
    const lauf = u.uebergebeVorlage(knopf({ text: 'Testmuster 0' }));
    if (abbruch) u.geschlossen();
    fertig({}); await lauf; await tick();
    assert.equal(u.kopien.length, 0);
    assert.equal(u.fallback.length, 0);
    assert.equal(u.statuswrites.length, 0);
  }
});

test('Legacy und Clipboard-Verweigerung kopieren erst mit zweiter Geste nach bestandener Pruefung', async () => {
  for (const optionen of [{ modern: false }, { clipboardFehler: true }]) {
    const u = umgebung(optionen); await u.oeffnen();
    let freigeben;
    u.config.pruefen = () => new Promise(resolve => { freigeben = resolve; });
    const b = knopf({ text: 'Testmuster 0' });
    const erster = u.uebergebeVorlage(b);
    u.config.geste = false;
    freigeben({}); await erster;
    assert.equal(u.kopien.length, 0);
    assert.equal(u.fallback.length, 0, 'kein execCommand nach dem Server-await');
    assert.equal(b.textContent, 'Jetzt kopieren');
    u.config.geste = true;
    const zweiter = u.uebergebeVorlage(b);
    assert.equal(u.fallback.find(f => f.aktion === 'copy')?.geste, true, 'execCommand erfolgt synchron im neuen Klick');
    u.config.geste = false;
    await zweiter;
    assert.equal(b.textContent, 'Kopiert');
    assert.equal(u.posts.filter(p => p.payload.aktion === 'bestellPruefen').length, 1);
  }
});

test('kurze Legacy-Freigabe gilt nur fuer unveraenderten Dialog, Scope, Hash und Text', async () => {
  for (const aenderung of ['zeit', 'abruf', 'scope', 'hash', 'text']) {
    const u = umgebung({ modern: false, jetzt: 1000 }); await u.oeffnen();
    const b = knopf({ text: 'Testmuster 0' });
    await u.uebergebeVorlage(b);
    if (aenderung === 'zeit') u.config.jetzt = 11_001;
    if (aenderung === 'abruf') u.dialog.abruf++;
    if (aenderung === 'scope') u.dialog.ziel = 'kunde';
    if (aenderung === 'hash') u.dialog.daten.mails[0].vorbereitungStand = 'hash-neu';
    if (aenderung === 'text') u.dialog.daten.mails[0].text = 'Geaenderter Testtext';
    await u.uebergebeVorlage(b);
    assert.equal(u.fallback.length, 0, `${aenderung}: alte Freigabe darf nichts kopieren`);
    assert.equal(u.posts.filter(p => p.payload.aktion === 'bestellPruefen').length, 2);
    assert.equal(b.textContent, 'Jetzt kopieren');
  }
});

test('dauerhafte Clipboard-Verweigerung laesst sichtbare manuelle Auswahl mit Erklaerung erreichbar', async () => {
  const u = umgebung({ clipboardFehler: true, execFehler: true }); await u.oeffnen();
  const b = knopf({ text: 'Testmuster 0' });
  await u.uebergebeVorlage(b);
  await u.uebergebeVorlage(b);
  assert.equal(b.textContent, 'Text markiert – bitte manuell kopieren');
  assert.deepEqual(u.fallback.map(f => f.aktion), ['append', 'select', 'copy']);
  assert.equal(u.fallback[0].el.value, 'Testmuster 0');
  assert.equal(u.fallback[0].el.readOnly, true);
  assert.ok(u.toasts.some(t => /⌘C oder Strg\+C/.test(t[0])));
  assert.equal(u.statuswrites.length, 0);
  assert.equal(u.fragen.size, 0, 'unbestaetigtes manuelles Kopieren ist keine erfolgte Uebergabe');
});
