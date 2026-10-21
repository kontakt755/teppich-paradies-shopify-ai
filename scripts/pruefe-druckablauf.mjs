#!/usr/bin/env node
/**
 * Browser-Regressionen fuer die gemeinsame Druckliste.
 *
 * node scripts/pruefe-druckablauf.mjs
 *
 * Laedt echte Dashboardmodule auf einem eigenen Loopback-Server. Alle Daten
 * sind synthetisch, alle API-Antworten kommen aus dem Speicher. Der Drucker,
 * die Geraeteauswahl und die QR-Bibliothek sind Attrappen. Externe Anfragen
 * werden abgewiesen; echte Privatdateien und Drucker werden nie angesprochen.
 * Die bestehenden API-/Canvas-Tests pruefen Datenregeln und echte QR-Inhalte.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { etikettenAusLexikon } from '../docs/ai-dashboard/lib/lexikon-etiketten.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/ai-dashboard');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const kopie = wert => structuredClone(wert);
const jetzt = '2026-10-20T10:00:00.000Z';
const produkt = {
  handle: 'testvelours-teppichboden', titel: 'Testvelours Teppichboden', produktgruppe: 'Teppichboden', status: 'ACTIVE', eigenschaften: {},
  varianten: [{ id: 'test-sand', sku: 'TEST-SA', farbe: 'Sand', titel: 'Sand / 400cm' }, { id: 'test-grau', sku: 'TEST-GR', farbe: 'Grau', titel: 'Grau / 400cm' }],
};
function eintrag(i, anzahl = 1) {
  return {
    id: `test-position-${i}`, revision: 1, status: 'offen', anzahl,
    produktHandle: `testmuster-${i}`, produktTitel: `Testmuster ${i}`, bezeichnung: `Testfarbe ${i}`,
    erstelltVon: { name: 'Testperson' }, erstelltAm: jetzt, geaendertAm: jetzt,
    etikett: { serie: `Testserie ${i}`, farbe: `Testfarbe ${i}`, sku: `TEST-${i}`, url: `https://www.teppich-paradies.net/products/testmuster-${i}`, technik: [], fehlt: [] },
  };
}
function reserviert(i, auftrag = 'test-frueherer-auftrag', anzahl = 1) {
  return { ...eintrag(i, anzahl), revision: 2, status: 'in_druck', druckauftrag: { id: auftrag, von: { name: 'Anderer Testarbeitsplatz' }, am: jetzt } };
}
function fixture(eintraege = [eintrag(1, 2), eintrag(2), eintrag(3, 2)], rolle = 'mitarbeiter') {
  return {
    eintraege: kopie(eintraege), rolle, anfragen: [], versuche: [], gets: 0,
    antwort() { return { schema: 1, verfuegbar: true, eintraege: kopie(this.eintraege) }; },
    schreiben(auftrag) {
      this.anfragen.push(kopie(auftrag));
      if (auftrag.aktion === 'vormerken') {
        assert.equal(auftrag.handle, produkt.handle);
        const auswahl = etikettenAusLexikon(produkt).find(e => e.key === auftrag.key);
        assert(auswahl, 'Nur vorhandene Testausfuehrung vormerken.');
        const neu = eintrag(this.eintraege.length + 1, auftrag.anzahl);
        Object.assign(neu, { produktHandle: produkt.handle, produktTitel: produkt.titel, bezeichnung: auswahl.bezeichnung, etikett: auswahl.etikett });
        this.eintraege.push(neu);
        return this.antwort();
      }
      const referenzen = auftrag.eintraege || [];
      const es = referenzen.map(r => this.eintraege.find(e => e.id === r.id));
      assert(referenzen.length, 'Eine Schreibaktion braucht konkrete Positionen.');
      assert(es.every((e, i) => e && e.revision === referenzen[i].revision), 'Veraltete Revision in der Browseranfrage.');
      if (auftrag.aktion === 'auftrag_entfernen') {
        const job = this.eintraege.filter(e => e.status === 'in_druck' && e.druckauftrag?.id === auftrag.druckauftragId);
        const ziele = new Set(auftrag.entfernenIds);
        assert.equal(job.length, es.length, 'Entfernen muss den vollstaendigen Auftrag mit allen Revisionen pruefen.');
        assert.deepEqual(new Set(job.map(e => e.id)), new Set(es.map(e => e.id)));
        assert(ziele.size && ziele.size === auftrag.entfernenIds.length, 'Entfernungsziele sind eindeutig und nicht leer.');
        assert([...ziele].every(id => job.some(e => e.id === id)), 'Entfernungsziele gehoeren zum Auftrag.');
        for (const e of job) {
          e.status = ziele.has(e.id) ? 'entfernt' : 'offen';
          if (e.status === 'entfernt') e.entferntAm = jetzt;
          e.druckauftrag = null; ++e.revision;
        }
        return this.antwort();
      }
      for (const e of es) {
        if (auftrag.aktion === 'reservieren') {
          assert.equal(e.status, 'offen');
          e.status = 'in_druck'; e.druckauftrag = { id: auftrag.druckauftragId, von: { name: 'Testperson' }, am: jetzt };
        } else {
          if (auftrag.aktion !== 'entfernen') {
            assert.equal(e.status, 'in_druck'); assert.equal(e.druckauftrag.id, auftrag.druckauftragId);
          }
          if (auftrag.aktion === 'freigeben') { e.status = 'offen'; delete e.druckauftrag; }
          else if (auftrag.aktion === 'erledigen') { e.status = 'gedruckt'; e.gedrucktAm = jetzt; e.gedrucktVon = 'Testperson'; }
          else if (auftrag.aktion === 'entfernen') { e.status = 'entfernt'; e.entferntAm = jetzt; }
          else throw new Error(`Unerwartete Testaktion: ${auftrag.aktion}`);
        }
        ++e.revision;
      }
      return this.antwort();
    },
  };
}

let aktuell;
const server = http.createServer(async (req, res) => {
  const json = (daten, status = 200) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(daten)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/session') return json({ required: true, authenticated: true, benutzer: { rolle: aktuell.rolle, name: 'Testperson', kuerzel: 'testperson' } });
    if (url.pathname === '/api/capabilities') return json({ mode: 'local', agentRuns: false, user: { name: 'Testperson' } });
    if (url.pathname === '/issues.json') return json({ schema: 2, issues: [], generated_at: jetzt, count: 0 });
    if (url.pathname === '/api/lexikon/produkt') return json({ verfuegbar: true, produkt: kopie(produkt) });
    if (url.pathname === '/api/lexikon/liste') return json({ verfuegbar: true, erstellt: jetzt, anzahl: 1, treffer: { count: 1, page: 1, pages: 1, items: [{ ...kopie(produkt), farbenAnzahl: 2 }] } });
    if (url.pathname === '/api/lexikon/druckliste') {
      if (req.method === 'GET') { ++aktuell.gets; return json(aktuell.antwort()); }
      assert.equal(req.method, 'POST');
      let roh = ''; for await (const teil of req) roh += teil;
      if (aktuell.rolle === 'lesen') return json({ error: 'Nur lesend' }, 403);
      const daten = aktuell, auftrag = JSON.parse(roh);
      daten.versuche.push(auftrag);
      if (auftrag.aktion === 'vormerken' && daten.vormerkHalten) await new Promise(ok => { daten.vormerkFortsetzen = ok; });
      if (auftrag.aktion === 'vormerken' && daten.vormerkFehler) return json({ error: 'Synthetischer Konflikt bei der Vormerkung' }, 409);
      if (auftrag.aktion === 'auftrag_entfernen') {
        if (daten.entfernenHalten) await new Promise(ok => { daten.entfernenFortsetzen = ok; });
        if (daten.entfernenFehler) { daten.vorEntfernenFehler?.(); return json({ error: 'Synthetischer Konflikt beim Entfernen' }, daten.entfernenFehler); }
      }
      return json(daten.schreiben(auftrag));
    }
    if (url.pathname.startsWith('/api/')) return json({ verfuegbar: true, eintraege: [], antworten: [] });
    const datei = path.resolve(ROOT, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    assert(datei.startsWith(`${ROOT}${path.sep}`), 'Nur Dashboarddateien ausliefern.');
    const inhalt = await fs.readFile(datei);
    res.writeHead(200, { 'content-type': MIME[path.extname(datei)] || 'application/octet-stream' }); res.end(inhalt);
  } catch (err) {
    json({ error: err.message }, 500);
  }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const basis = `http://127.0.0.1:${server.address().port}`;
let browser;
let bestanden = 0, gescheitert = 0;

async function geraeteAttrappen(page, umgebung = {}) {
  await page.evaluateOnNewDocument(optionen => {
    const f = window.__druckAttrappe = { aktiv: true, modus: 'ok', verbindungen: 0, verbindungswege: [], trennungen: 0, teile: [], seiten: [], ende: 0 };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: optionen.ohneGeraete || optionen.nurSeriell ? undefined : {} });
    Object.defineProperty(navigator, 'serial', { configurable: true, value: optionen.ohneGeraete ? undefined : {} });
    if (optionen.unsicher) Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    // Die echte Bibliothek wird nicht geladen. Canvas/DOM und Dashboard bleiben echt.
    if (!optionen.qrFehler) window.qrcode = () => ({ addData() {}, make() {}, getModuleCount: () => 21, isDark: (r, c) => (r + c) % 2 === 0 });
    const fuellen = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (x === 0 && y === 0 && w === this.canvas.width && h === this.canvas.height) this.canvas.__testtexte = [];
      return fuellen.call(this, x, y, w, h);
    };
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { (this.canvas.__testtexte ||= []).push(String(t)); return text.call(this, t, ...rest); };
    class Client {
      constructor(weg) { this.weg = weg; this.ereignisse = {}; }
      verbunden = false;
      protocol = { newPrintTask: (_art, optionen) => {
        f.teile.push(optionen);
        return {
          async printInit() { if (f.modus === 'initfehler' || (f.modus === 'zweiter-teil-fehler' && f.teile.length === 2)) throw new Error('Synthetischer Verbindungsfehler'); },
          async printPage(bild, kopien) {
            f.seiten.push({ texte: bild.texte, kopien });
            if (f.modus === 'seite-halten' && f.seiten.length === 1) await new Promise(ok => { f.seiteFortsetzen = ok; });
          },
          async waitForFinished() {},
          async printEnd() { ++f.ende; return f.modus !== 'abschlussfehler'; },
        };
      } };
      async connect() {
        ++f.verbindungen;
        f.verbindungswege.push(this.weg);
        if (f.modus === 'auswahl-halten') await new Promise(ok => { f.auswahlFortsetzen = ok; });
        if (f.modus === 'auswahl-abbruch') throw new Error('User cancelled the requestDevice chooser');
        if (f.modus === 'verbindungsfehler') throw new Error('Synthetischer Verbindungsfehler');
        this.verbunden = f.modus !== 'falscher-erfolg';
      }
      isConnected() { return this.verbunden; }
      async disconnect() {
        ++f.trennungen;
        if (f.modus === 'trennen-halten') await new Promise(ok => { f.trennenFortsetzen = ok; });
        this.verbunden = false; this.ereignisse.disconnect?.();
      }
      on(name, fn) { this.ereignisse[name] = fn; }
      getModelMetadata() { return { printDirection: 'top' }; }
      getPrintTaskType() { return 'B1'; }
    }
    window.niimbluelib = { NiimbotBluetoothClient: class extends Client { constructor() { super('bluetooth'); } }, NiimbotSerialClient: class extends Client { constructor() { super('usb'); } }, ImageEncoder: { encodeCanvas: c => ({ texte: [...c.__testtexte] }) } };
    const append = Element.prototype.append;
    Element.prototype.append = function (...knoten) {
      for (const k of knoten) {
        if (this === document.head && k.tagName === 'SCRIPT' && k.src.startsWith('https://cdn.jsdelivr.net/npm/')) queueMicrotask(() => optionen.qrFehler && k.src.includes('qrcode-generator') ? k.onerror?.() : k.onload?.());
        else append.call(this, k);
      }
    };
  }, umgebung);
}
async function warteAuf(fn, fehler = 'Bedingung nicht erreicht') {
  const ende = Date.now() + 5000;
  while (!fn()) { if (Date.now() > ende) throw new Error(fehler); await new Promise(ok => setTimeout(ok, 20)); }
}
async function pruefe(name, test, daten = fixture()) {
  const kontext = await browser.createBrowserContext();
  const page = await kontext.newPage();
  const jsFehler = [], fremdeAnfragen = [];
  aktuell = daten;
  try {
    page.setDefaultTimeout(5000);
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().startsWith(basis) || req.url().startsWith('data:')) void req.continue();
      else { fremdeAnfragen.push(req.url()); void req.abort(); }
    });
    page.on('pageerror', err => jsFehler.push(err.message));
    page.on('dialog', dialog => { (daten.dialoge ||= []).push(dialog.message()); void (daten.dialogAntwort === false ? dialog.dismiss() : dialog.accept()); });
    await geraeteAttrappen(page, daten.umgebung);
    await page.goto(`${basis}/#/lexikon?tab=druckliste`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-md-aktualisieren]');
    await test(page, daten);
    assert.deepEqual(jsFehler, [], 'Keine JavaScript-Fehler.');
    assert.deepEqual(fremdeAnfragen, [], 'Keine externen Anfragen, auch keine echten Druckerbibliotheken.');
    ++bestanden; console.log(`OK ${name}`);
  } catch (err) {
    ++gescheitert; console.error(`FEHLER ${name}\n${err.stack}`);
    console.error((await page.$eval('#main', e => e.innerText).catch(() => '')).slice(0, 1700));
  } finally { daten.vormerkFortsetzen?.(); daten.entfernenFortsetzen?.(); await kontext.close(); }
}
async function vorschau(page) {
  await page.waitForFunction(() => document.querySelector('[data-md-reservieren]') && !document.querySelector('[data-md-reservieren]').disabled);
  await page.click('[data-md-reservieren]');
  await page.waitForFunction(() => document.querySelector('#etkDrucken') && !document.querySelector('#etkDrucken').disabled);
}
async function attrappenDruck(page, modus = 'ok') {
  assert.equal(await page.evaluate(() => window.__druckAttrappe?.aktiv), true, 'Druckklick ausschliesslich auf Attrappe.');
  await page.evaluate(m => { window.__druckAttrappe.modus = m; }, modus);
  await page.click('#etkDrucken');
}
async function fertig(page) { await page.waitForFunction(() => !document.querySelector('#etkBestaetigung')?.hidden && !!document.querySelector('#etkBestaetigen')); }
async function geschlossen(page) { await page.waitForFunction(() => !document.querySelector('.etk-dialog')); }
const aktionen = daten => daten.anfragen.map(a => a.aktion);

async function direkterDialog(page, { leer = false, titel = 'Verbindung pruefen' } = {}) {
  await page.evaluate(async optionen => {
    window.__verbindungsCallbacks = { versuche: 0, pruefungen: 0, papier: 0, geschlossen: [] };
    const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
    await oeffneEtikettenDruck({ titel: optionen.titel,
      etiketten: optionen.leer ? [] : [{ serie: 'Testserie', farbe: 'Testfarbe', sku: 'TEST-1', url: 'https://www.teppich-paradies.net/products/testmuster', technik: [], fehlt: [] }],
      druckVersucht: () => { ++window.__verbindungsCallbacks.versuche; },
      vorDruck: async () => { ++window.__verbindungsCallbacks.pruefungen; return true; },
      beiBestaetigen: async () => { ++window.__verbindungsCallbacks.papier; return true; },
      beiSchliessen: async ({ versucht }) => { window.__verbindungsCallbacks.geschlossen.push(versucht); },
    });
  }, { leer, titel });
}
async function attrappenVerbindung(page, modus = 'ok') {
  assert.equal(await page.evaluate(() => window.__druckAttrappe?.aktiv), true, 'Verbindung ausschliesslich zur Attrappe.');
  await page.evaluate(m => { window.__druckAttrappe.modus = m; }, modus);
  await page.click('#etkVerbinden');
}
async function verbunden(page) { await page.waitForFunction(() => /verbunden/i.test(document.querySelector('#etkVerbinden')?.textContent || '') && document.querySelector('#etkVerbinden').disabled); }
async function keinDruck(page) {
  assert.deepEqual(await page.evaluate(() => ({ teile: window.__druckAttrappe.teile.length, seiten: window.__druckAttrappe.seiten.length, ende: window.__druckAttrappe.ende })), { teile: 0, seiten: 0, ende: 0 });
}

try {
  browser = await puppeteer.launch({ headless: true });
  await pruefe('Einzelnes Muster aus frueherem Druckauftrag entfernen gibt den Rest frei und behaelt andere Auftraege', async (page, daten) => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-md-auftrag-entfernen="test-frueherer-auftrag"][data-md-eintrag="test-position-2"]');
    assert.equal(await page.$$('[data-md-vorschau]').then(es => es.length), 0, 'Nach einem Neustart gehoert der alte Auftrag nicht dieser Sitzung.');
    await page.$eval('.md-auftrag details', el => { el.open = true; });
    const unbeeinflusst = kopie(daten.eintraege.slice(3));
    await page.click('[data-md-auftrag-entfernen="test-frueherer-auftrag"][data-md-eintrag="test-position-2"]');
    await warteAuf(() => daten.eintraege[1].status === 'entfernt');
    await page.waitForFunction(() => document.querySelectorAll('.md-offen .md-zeile').length === 3);
    assert.deepEqual(daten.eintraege.slice(0, 3).map(e => [e.status, e.revision, e.druckauftrag]), [['offen', 3, null], ['entfernt', 3, null], ['offen', 3, null]]);
    assert.deepEqual(daten.eintraege.slice(3), unbeeinflusst, 'Spaetere Vormerkung und anderer Druckauftrag bleiben unveraendert.');
    assert.deepEqual(aktionen(daten), ['auftrag_entfernen']);
    assert.deepEqual(daten.anfragen[0].eintraege, [1, 2, 3].map(i => ({ id: `test-position-${i}`, revision: 2 })));
    assert.deepEqual(daten.anfragen[0].entfernenIds, ['test-position-2']);
    assert.equal(daten.dialoge.length, 1); assert.match(daten.dialoge[0], /entfernen/i); assert.match(daten.dialoge[0], /offen|freigegeben|freigeben|Noch zu drucken/i);
    await keinDruck(page);
  }, fixture([reserviert(1), reserviert(2, undefined, 2), reserviert(3), eintrag(4), reserviert(5, 'test-anderer-auftrag')]));
  await pruefe('Gesamten frueheren Druckauftrag entfernen ohne als gedruckt zu markieren', async (page, daten) => {
    const spaeter = kopie(daten.eintraege.at(-1));
    await page.click('[data-md-auftrag-entfernen="test-frueherer-auftrag"]:not([data-md-eintrag])');
    await warteAuf(() => daten.eintraege.slice(0, 3).every(e => e.status === 'entfernt'));
    await page.waitForFunction(() => !document.querySelector('[data-md-auftrag-entfernen="test-frueherer-auftrag"]'));
    assert.deepEqual(daten.eintraege.at(-1), spaeter);
    assert.deepEqual(aktionen(daten), ['auftrag_entfernen']);
    assert.deepEqual(daten.anfragen[0].entfernenIds, ['test-position-1', 'test-position-2', 'test-position-3']);
    assert(daten.eintraege.every(e => !e.gedrucktAm && e.status !== 'gedruckt'));
    await keinDruck(page);
  }, fixture([reserviert(1), reserviert(2), reserviert(3), eintrag(4)]));
  for (const ziel of ['einzeln', 'gesamt']) {
    await pruefe(`Entfernen ${ziel} abbrechen laesst Auftrag und Liste unveraendert`, async (page, daten) => {
      const vorher = kopie(daten.eintraege); daten.dialogAntwort = false;
      if (ziel === 'einzeln') await page.$eval('.md-auftrag details', el => { el.open = true; });
      const selector = ziel === 'einzeln' ? '[data-md-auftrag-entfernen][data-md-eintrag="test-position-2"]' : '[data-md-auftrag-entfernen]:not([data-md-eintrag])';
      await page.click(selector);
      await warteAuf(() => daten.dialoge?.length === 1);
      assert.deepEqual(daten.versuche, []); assert.deepEqual(daten.anfragen, []); assert.deepEqual(daten.eintraege, vorher);
      assert.equal(await page.$eval(selector, el => el.disabled), false);
      await keinDruck(page);
    }, fixture([reserviert(1), reserviert(2)]));
  }
  for (const status of [409, 500]) {
    await pruefe(`Fehler ${status} beim Entfernen laedt frischen Stand ohne falschen Erfolg und erlaubt neuen Versuch`, async (page, daten) => {
      daten.entfernenFehler = status;
      daten.vorEntfernenFehler = () => { daten.eintraege[0].produktTitel = 'Frisch aktualisiertes Testmuster'; ++daten.eintraege[0].revision; };
      await page.click('[data-md-auftrag-entfernen]:not([data-md-eintrag])');
      await page.waitForFunction(() => /Änderung wurde nicht bestätigt/.test(document.querySelector('#main')?.innerText || ''));
      assert.match(await page.$eval('.md-auftrag', el => el.textContent), /Frisch aktualisiertes Testmuster/);
      assert.doesNotMatch(await page.$eval('#toastRoot', el => el.innerText), /aus der Druckliste entfernt|Auftrag entfernt/i);
      assert.deepEqual(daten.anfragen, []);
      assert(daten.eintraege.every(e => e.status === 'in_druck'));
      daten.entfernenFehler = 0;
      await page.click('[data-md-auftrag-entfernen]:not([data-md-eintrag])');
      await warteAuf(() => daten.eintraege.every(e => e.status === 'entfernt'));
      assert.equal(daten.versuche.length, 2);
      assert.equal(daten.anfragen[0].eintraege[0].revision, 3, 'Wiederholung benutzt den frisch geladenen Stand.');
      await keinDruck(page);
    }, fixture([reserviert(1), reserviert(2)]));
  }
  await pruefe('Doppelklick auf Auftragsentfernen erzeugt nur eine bestaetigte Aenderung', async (page, daten) => {
    daten.entfernenHalten = true;
    await page.$eval('[data-md-auftrag-entfernen]:not([data-md-eintrag])', el => { el.click(); el.click(); });
    await warteAuf(() => typeof daten.entfernenFortsetzen === 'function');
    assert.equal(daten.versuche.length, 1); assert.equal(daten.dialoge.length, 1);
    assert.equal(await page.$eval('[data-md-auftrag-entfernen]:not([data-md-eintrag])', el => el.disabled), true);
    daten.entfernenFortsetzen();
    await warteAuf(() => daten.eintraege.every(e => e.status === 'entfernt'));
    assert.deepEqual(aktionen(daten), ['auftrag_entfernen']);
    await keinDruck(page);
  }, fixture([reserviert(1), reserviert(2)]));
  await pruefe('Reservierter Auftrag ist am Handy vollstaendig aufklappbar und Position nach 25 entfernbar', async (page, daten) => {
    await page.setViewport({ width: 390, height: 844 });
    await page.click('.md-auftrag details summary');
    assert.equal(await page.$$eval('.md-auftrag .md-liste > .md-zeile', es => es.length), 25);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.click('[data-md-auftrag-mehr="test-frueherer-auftrag"]');
    await page.waitForFunction(() => document.querySelectorAll('.md-auftrag .md-liste > .md-zeile').length === 50);
    await page.click('[data-md-auftrag-mehr="test-frueherer-auftrag"]');
    await page.waitForFunction(() => document.querySelectorAll('.md-auftrag .md-liste > .md-zeile').length === 56);
    assert.equal(await page.$$('[data-md-auftrag-mehr]').then(es => es.length), 0);
    assert.equal(await page.$eval('.md-auftrag details', el => el.open), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.click('[data-md-auftrag-entfernen][data-md-eintrag="test-position-55"]');
    await warteAuf(() => daten.eintraege[54].status === 'entfernt');
    assert.equal(daten.eintraege.filter(e => e.status === 'offen').length, 55);
    assert.equal(daten.anfragen[0].eintraege.length, 56, 'Entfernen am Listenende prueft auch ausgeblendete Positionen.');
    assert.deepEqual(daten.anfragen[0].entfernenIds, ['test-position-55']);
    await keinDruck(page);
  }, fixture(Array.from({ length: 56 }, (_, i) => reserviert(i + 1))));
  await pruefe('Lesender Zugang kann reservierte Positionen ansehen aber keinen Auftrag aendern', async (page, daten) => {
    await page.click('.md-auftrag details summary');
    assert.equal(await page.$$eval('[data-md-auftrag-entfernen],[data-md-erledigen],[data-md-freigeben],[data-md-vorschau]', es => es.length), 0);
    assert.deepEqual(daten.versuche, []); assert.deepEqual(daten.anfragen, []);
    await keinDruck(page);
  }, fixture([reserviert(1), reserviert(2)], 'lesen'));
  await pruefe('Entfernung an anderem Arbeitsplatz waehrend Druckerwahl verhindert alle Hardwareseiten', async (page, daten) => {
    await vorschau(page); await attrappenDruck(page, 'auswahl-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
    const druckauftragId = daten.eintraege[0].druckauftrag.id;
    daten.schreiben({ aktion: 'auftrag_entfernen', druckauftragId, eintraege: daten.eintraege.map(e => ({ id: e.id, revision: e.revision })), entfernenIds: ['test-position-2'] });
    await page.evaluate(() => window.__druckAttrappe.auswahlFortsetzen());
    await page.waitForFunction(() => /geändert|freigegeben|prüfen|unterbrochen/.test(document.querySelector('#etkStatus')?.textContent || ''));
    await keinDruck(page);
    assert.deepEqual(daten.eintraege.map(e => e.status), ['offen', 'entfernt', 'offen']);
    assert.deepEqual(aktionen(daten), ['reservieren', 'auftrag_entfernen']);
    assert.equal(await page.$eval('#etkBestaetigung', el => el.hidden), true);
  });
  await pruefe('Nur verbinden prueft den Drucker ohne Druck und gibt Vorschau beim Schliessen frei', async (page, daten) => {
    await vorschau(page);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'etkVerbinden', 'Die sichere Verbindungsaktion erhaelt zuerst den Fokus.');
    await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'etkDrucken', 'Verbindungserfolg fokussiert keinen Druckstart.');
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
    assert(daten.eintraege.every(e => e.status === 'in_druck'));
    assert.deepEqual(aktionen(daten), ['reservieren']);
    assert.equal(await page.$eval('#etkBestaetigung', el => el.hidden), true);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    await warteAuf(() => daten.eintraege.every(e => e.status === 'offen'));
    assert.deepEqual(aktionen(daten), ['reservieren', 'freigeben']);
  });
  await pruefe('Verbindung ruft keine Druckcallbacks auf; Doppelklick und spaeterer Druck nutzen denselben Client', async page => {
    await direkterDialog(page);
    await page.$eval('#etkVerbinden', el => { el.click(); el.click(); });
    await verbunden(page); await keinDruck(page);
    assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks), { versuche: 0, pruefungen: 0, papier: 0, geschlossen: [] });
    await page.$eval('#etkVerbinden', el => el.click());
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
    assert.equal(await page.$eval('#etkWeg', el => el.disabled), true, 'Ein verbundener Client wird nicht als anderer Verbindungsweg ausgegeben.');
    await attrappenDruck(page); await fertig(page);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
    assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks), { versuche: 1, pruefungen: 1, papier: 0, geschlossen: [] });
    await page.click('#etkBestaetigen'); await geschlossen(page);
    assert.equal(await page.evaluate(() => window.__verbindungsCallbacks.papier), 1);
  });
  await pruefe('Verzoegertes Trennen sperrt Verbindung und Druck bis zum bestaetigten Ende', async page => {
    await direkterDialog(page); await attrappenVerbindung(page); await verbunden(page);
    await page.evaluate(() => { window.__druckAttrappe.modus = 'trennen-halten'; });
    await page.$eval('#etkTrennen', el => { el.click(); el.click(); });
    await page.waitForFunction(() => typeof window.__druckAttrappe.trennenFortsetzen === 'function');
    assert.equal(await page.$eval('#etkVerbinden', el => el.disabled), true);
    assert.equal(await page.$eval('#etkDrucken', el => el.disabled), true);
    await page.$eval('#etkVerbinden', el => el.click());
    await page.$eval('#etkDrucken', el => el.click());
    assert.equal(await page.evaluate(() => window.__druckAttrappe.trennungen), 1);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
    await keinDruck(page);
    await page.evaluate(() => window.__druckAttrappe.trennenFortsetzen());
    await page.waitForFunction(() => !document.querySelector('#etkVerbinden').disabled);
    assert.match(await page.$eval('#etkStatus', el => el.textContent), /getrennt/i);
    await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 2);
    assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks), { versuche: 0, pruefungen: 0, papier: 0, geschlossen: [] });
  });
  for (const weg of ['Schliessen', 'Ersetzen']) {
    await pruefe(`${weg} mit alter Druckerwahl sperrt neue Verbindung bis auch alte Bereinigung fertig ist`, async page => {
      await direkterDialog(page, { titel: 'Alter Verbindungstest' });
      await page.evaluate(() => { window.__alteCallbacks = window.__verbindungsCallbacks; });
      await attrappenVerbindung(page, 'auswahl-halten');
      await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
      if (weg === 'Schliessen') { await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page); }
      else await page.evaluate(() => { document.querySelector('#dialogRoot').innerHTML = '<p>Anderer Dialog</p>'; });
      await page.waitForFunction(() => window.__alteCallbacks.geschlossen.length === 1);
      await direkterDialog(page, { titel: 'Neuer Verbindungstest' });
      const nachfolger = await page.evaluate(() => ({ titel: document.querySelector('#etkTitel').textContent, liste: document.querySelector('#etkListe').innerHTML, status: document.querySelector('#etkStatus').textContent }));
      for (const selector of ['#etkVerbinden', '#etkDrucken']) {
        assert.equal(await page.$eval(selector, el => el.disabled), true, 'Die alte Druckerwahl haelt den Hardwarezugriff global gesperrt.');
        await page.$eval(selector, el => el.click());
      }
      assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
      await page.evaluate(() => { window.__druckAttrappe.modus = 'trennen-halten'; window.__druckAttrappe.auswahlFortsetzen(); });
      await page.waitForFunction(() => typeof window.__druckAttrappe.trennenFortsetzen === 'function');
      for (const selector of ['#etkVerbinden', '#etkDrucken']) {
        assert.equal(await page.$eval(selector, el => el.disabled), true, 'Auch das noch laufende Trennen des alten Clients blockiert neue Hardwarezugriffe.');
        await page.$eval(selector, el => el.click());
      }
      assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
      await keinDruck(page);
      await page.evaluate(() => window.__druckAttrappe.trennenFortsetzen());
      await page.waitForFunction(() => !document.querySelector('#etkVerbinden').disabled);
      assert.deepEqual(await page.evaluate(() => ({ titel: document.querySelector('#etkTitel').textContent, liste: document.querySelector('#etkListe').innerHTML, status: document.querySelector('#etkStatus').textContent })), nachfolger);
      assert.deepEqual(await page.evaluate(() => window.__alteCallbacks.geschlossen), [false]);
      assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks), { versuche: 0, pruefungen: 0, papier: 0, geschlossen: [] });
      await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
      assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 2);
    });
  }
  for (const modus of ['auswahl-abbruch', 'verbindungsfehler', 'falscher-erfolg']) {
    await pruefe(`${modus} beim Verbindungstest erlaubt Wiederholung ohne Druckversuch`, async page => {
      await direkterDialog(page); await attrappenVerbindung(page, modus);
      await page.waitForFunction(() => !document.querySelector('#etkVerbinden').disabled);
      await keinDruck(page);
      assert.equal(await page.evaluate(() => window.__verbindungsCallbacks.versuche), 0);
      assert.equal(await page.evaluate(() => window.__verbindungsCallbacks.pruefungen), 0);
      await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
      assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 2);
      await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
      assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks.geschlossen), [false]);
    });
  }
  for (const weg of ['Schliessen', 'Escape', 'Hintergrund']) {
    await pruefe(`${weg} beendet offene Druckerwahl ohne Druck und trennt spaete Verbindung`, async (page, daten) => {
      await vorschau(page); await attrappenVerbindung(page, 'auswahl-halten');
      await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
      assert.equal(await page.$eval('#etkDrucken', el => el.disabled), true);
      if (weg === 'Schliessen') await page.click('.etk-dialog [data-close-dialog]');
      else if (weg === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(2, 2);
      await geschlossen(page);
      await warteAuf(() => daten.eintraege.every(e => e.status === 'offen'));
      await page.evaluate(() => window.__druckAttrappe.auswahlFortsetzen());
      await page.waitForFunction(() => window.__druckAttrappe.trennungen > 0);
      await keinDruck(page);
      assert.deepEqual(aktionen(daten), ['reservieren', 'freigeben']);
      assert.equal(await page.$$('.etk-dialog').then(es => es.length), 0);
    });
  }
  await pruefe('Sitzungsende bei reinem Verbinden verhindert spaete UI- und Druckaktionen', async (page, daten) => {
    await vorschau(page); await attrappenVerbindung(page, 'auswahl-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
    await page.evaluate(async () => { const s = await import('/kern/sitzung.mjs'); s.markiereSitzungAbgelaufen(); window.__druckAttrappe.auswahlFortsetzen(); });
    await geschlossen(page);
    await page.waitForFunction(() => window.__druckAttrappe.trennungen > 0);
    await keinDruck(page);
    assert.deepEqual(aktionen(daten), ['reservieren'], 'Eine beendete Sitzung schreibt keine automatische Freigabe.');
  });
  await pruefe('Dialogersatz beim Verbindungstest laesst den Nachfolger unveraendert', async page => {
    await direkterDialog(page); await attrappenVerbindung(page, 'auswahl-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
    await page.evaluate(() => { document.querySelector('#dialogRoot').innerHTML = '<div class="dialog" id="nachfolger"><h2>Anderes Fenster</h2><p id="etkStatus">Unveraenderter Hinweis</p></div>'; window.__nachfolgerHtml = document.querySelector('#dialogRoot').innerHTML; });
    await page.waitForFunction(() => window.__verbindungsCallbacks.geschlossen.length === 1);
    await page.evaluate(() => window.__druckAttrappe.auswahlFortsetzen());
    await page.waitForFunction(() => window.__druckAttrappe.trennungen > 0);
    assert.equal(await page.evaluate(() => document.querySelector('#dialogRoot').innerHTML === window.__nachfolgerHtml), true);
    assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks.geschlossen), [false]);
    await keinDruck(page);
  });
  await pruefe('Leerer manueller Aufkleberdialog kann den Drucker schon verbinden', async page => {
    await direkterDialog(page, { leer: true });
    assert.equal(await page.$eval('#etkDrucken', el => el.disabled), true);
    await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
    assert.deepEqual(await page.evaluate(() => window.__verbindungsCallbacks), { versuche: 0, pruefungen: 0, papier: 0, geschlossen: [] });
  });
  await pruefe('Fehlende QR-Bibliothek sperrt Druck, erlaubt aber Verbindungstest', async page => {
    await direkterDialog(page);
    assert.equal(await page.evaluate(() => typeof window.qrcode), 'undefined');
    assert.equal(await page.$eval('#etkDrucken', el => el.disabled), true);
    await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
  }, Object.assign(fixture(), { umgebung: { qrFehler: true } }));
  for (const [name, umgebung] of [['unsicherer Kontext', { unsicher: true }], ['Browser ohne Geraeteschnittstelle', { ohneGeraete: true }]]) {
    await pruefe(`${name} sperrt auch reines Verbinden`, async page => {
      await direkterDialog(page);
      assert.equal(await page.$eval('#etkVerbinden', el => el.disabled), true);
      await page.$eval('#etkVerbinden', el => el.click());
      assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 0);
      await keinDruck(page);
    }, Object.assign(fixture(), { umgebung }));
  }
  await pruefe('Bereits per USB verbundener Drucker behaelt den richtigen Weg im naechsten Dialog', async page => {
    await direkterDialog(page);
    await page.$eval('.etk-einstellungen', el => { el.open = true; });
    await page.select('#etkWeg', 'usb');
    await attrappenVerbindung(page); await verbunden(page);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    await direkterDialog(page, { titel: 'Weiterer Aufkleber' });
    await verbunden(page);
    assert.equal(await page.$eval('#etkWeg', el => el.value), 'usb');
    assert.equal(await page.$eval('#etkWeg', el => el.disabled), true);
    await keinDruck(page);
    assert.deepEqual(await page.evaluate(() => window.__druckAttrappe.verbindungswege), ['usb']);
  });
  await pruefe('Browser nur mit serieller Schnittstelle bietet direkt den verfuegbaren USB-Weg', async page => {
    await direkterDialog(page);
    assert.equal(await page.$eval('#etkWeg', el => el.value), 'usb');
    assert.equal(await page.$eval('#etkWeg option[value="bluetooth"]', el => el.disabled), true);
    await attrappenVerbindung(page); await verbunden(page); await keinDruck(page);
    assert.deepEqual(await page.evaluate(() => window.__druckAttrappe.verbindungswege), ['usb']);
  }, Object.assign(fixture(), { umgebung: { nurSeriell: true } }));
  await pruefe('Alle offenen ohne Auswahlpflicht; Vorschau druckt nichts', async (page, daten) => {
    assert.equal(await page.$$eval('[data-md-auswahl]', es => es.length), 0);
    assert.match(await page.$eval('[data-md-reservieren]', e => e.textContent), /Druckvorschau öffnen/);
    await vorschau(page);
    assert.equal(daten.eintraege.filter(e => e.status === 'in_druck').length, 3);
    assert.match(await page.$eval('#etkDrucken', e => e.textContent), /Jetzt 5 Aufkleber drucken/);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 0);
    assert.equal(await page.$eval('#etkTrennen', e => e.hidden), true);
    assert.equal(await page.$eval('#etkDichte', e => e.closest('details').open), false);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    await warteAuf(() => daten.eintraege.every(e => e.status === 'offen'));
    assert.deepEqual(aktionen(daten), ['reservieren', 'freigeben']);
  });
  for (const weg of ['Escape', 'Hintergrund']) {
    await pruefe(`${weg} gibt reine Vorschau wieder frei`, async (page, daten) => {
      await vorschau(page);
      if (weg === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(2, 2);
      await geschlossen(page);
      await warteAuf(() => daten.eintraege.every(e => e.status === 'offen'));
      assert.deepEqual(aktionen(daten), ['reservieren', 'freigeben']);
      assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 0);
    });
  }
  await pruefe('Eigene Auswahl bleibt Teilmenge; leere Auswahl druckt niemals alle', async (page, daten) => {
    await page.click('[data-md-auswahlmodus]');
    await page.waitForSelector('[data-md-auswahl]');
    await page.click('[data-md-auswahl-leeren]');
    assert.equal(await page.$eval('[data-md-reservieren]', e => e.disabled), true);
    await page.click('[data-md-auswahl="test-position-2"]');
    await vorschau(page);
    assert.deepEqual(daten.eintraege.filter(e => e.status === 'in_druck').map(e => e.id), ['test-position-2']);
    assert.match(await page.$eval('#etkDrucken', e => e.textContent), /Jetzt 1 Aufkleber drucken/);
  });
  await pruefe('Transport allein bestaetigt nichts; Papierkontrolle schliesst Auftrag ab', async (page, daten) => {
    await vorschau(page); await attrappenDruck(page); await fertig(page);
    assert.equal(daten.eintraege.every(e => e.status === 'in_druck'), true);
    assert.deepEqual(aktionen(daten), ['reservieren']);
    const seiten = await page.evaluate(() => window.__druckAttrappe.seiten);
    assert.deepEqual(seiten.map(s => s.texte.find(t => /Art.-Nr./.test(t))), ['Art.-Nr. TEST-1', 'Art.-Nr. TEST-1', 'Art.-Nr. TEST-2', 'Art.-Nr. TEST-3', 'Art.-Nr. TEST-3']);
    assert(seiten.every(s => s.kopien === 1));
    await page.click('#etkBestaetigen'); await geschlossen(page);
    await warteAuf(() => daten.eintraege.every(e => e.status === 'gedruckt'));
    assert.deepEqual(aktionen(daten), ['reservieren', 'erledigen']);
  });
  await pruefe('Schliessen nach erfolgreichem Transport bleibt unbestaetigt reserviert', async (page, daten) => {
    await vorschau(page); await attrappenDruck(page); await fertig(page);
    await page.keyboard.press('Escape'); await geschlossen(page);
    assert(daten.eintraege.every(e => e.status === 'in_druck'));
    assert.deepEqual(aktionen(daten), ['reservieren']);
  });
  for (const modus of ['auswahl-abbruch', 'initfehler', 'abschlussfehler']) {
    await pruefe(`${modus}: kein automatischer Abschluss oder Freigabe`, async (page, daten) => {
      await vorschau(page); await attrappenDruck(page, modus);
      await page.waitForFunction(() => !document.querySelector('#etkDrucken').disabled);
      assert.match(await page.$eval('#etkStatus', e => e.textContent), /Kein Drucker|unterbrochen|abgebrochen/);
      await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
      assert(daten.eintraege.every(e => e.status === 'in_druck'));
      assert.deepEqual(aktionen(daten), ['reservieren']);
      if (modus === 'auswahl-abbruch') assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 0);
    });
  }
  await pruefe('Ein abgebrochener Druckversuch bleibt auch nach erneutem Vorschauoeffnen reserviert', async (page, daten) => {
    await vorschau(page); await attrappenDruck(page, 'auswahl-abbruch');
    await page.waitForFunction(() => /Kein Drucker gewählt/.test(document.querySelector('#etkStatus')?.textContent || ''));
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    await page.click('[data-md-vorschau]');
    await page.waitForSelector('.etk-dialog');
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    assert(daten.eintraege.every(e => e.status === 'in_druck'));
    assert.deepEqual(aktionen(daten), ['reservieren']);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 0);
  });
  for (const [grenze, es] of [
    ['1000 Positionen', Array.from({ length: 1001 }, (_, i) => eintrag(i + 1))],
    ['5000 Aufkleber', Array.from({ length: 251 }, (_, i) => eintrag(i + 1, 20))],
  ]) {
    await pruefe(`Mehr als ${grenze} sperrt alle; bewusste kleine Auswahl bleibt vollstaendig`, async (page, daten) => {
      assert.equal(await page.$eval('[data-md-reservieren]', e => e.disabled), true);
      assert.match(await page.$eval('.md-offen', e => e.innerText), /höchstens 1000 Positionen und 5000 Aufkleber/);
      assert.deepEqual(daten.anfragen, []);
      await page.click('[data-md-auswahlmodus]');
      await page.click('[data-md-auswahl-leeren]');
      await page.click('[data-md-auswahl="test-position-1"]');
      await vorschau(page);
      assert.deepEqual(daten.eintraege.filter(e => e.status === 'in_druck').map(e => e.id), ['test-position-1']);
      assert.equal(daten.eintraege.filter(e => e.status === 'offen').length, es.length - 1);
      assert.match(await page.$eval('#etkDrucken', e => e.textContent), new RegExp(`Jetzt ${es[0].anzahl} Aufkleber drucken`));
      assert.equal(daten.anfragen[0].eintraege.length, 1, 'Keine stille Kuerzung eines grossen Druckauftrags.');
    }, fixture(es));
  }
  await pruefe('Fremdfreigabe waehrend Geraeteauswahl verhindert Hardwareseiten', async (page, daten) => {
    await vorschau(page); await attrappenDruck(page, 'auswahl-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
    for (const e of daten.eintraege) { e.status = 'offen'; ++e.revision; delete e.druckauftrag; }
    await page.evaluate(() => window.__druckAttrappe.auswahlFortsetzen());
    await page.waitForFunction(() => !document.querySelector('#etkDrucken').disabled);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 0);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.teile.length), 0);
    assert.match(await page.$eval('#etkStatus', e => e.textContent), /geändert|freigegeben|prüfen|unterbrochen/);
  });
  await pruefe('Sitzungsende waehrend Geraeteauswahl verhindert spaeten Druck', async page => {
    await vorschau(page); await attrappenDruck(page, 'auswahl-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
    await page.evaluate(async () => { const s = await import('/kern/sitzung.mjs'); s.markiereSitzungAbgelaufen(); window.__druckAttrappe.auswahlFortsetzen(); });
    await geschlossen(page);
    await page.waitForFunction(() => window.__druckAttrappe.trennungen > 0);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 0);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.teile.length), 0);
  });
  await pruefe('Sitzungsende bei laufender Seite verhindert Folgeseiten', async page => {
    await vorschau(page); await attrappenDruck(page, 'seite-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.seiteFortsetzen === 'function');
    await page.evaluate(async () => { const s = await import('/kern/sitzung.mjs'); s.markiereSitzungAbgelaufen(); window.__druckAttrappe.seiteFortsetzen(); });
    await geschlossen(page);
    await page.waitForFunction(() => window.__druckAttrappe.trennungen > 0);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 1);
  });
  await pruefe('Neue Vormerkung waehrend Vorschau bleibt nach altem Abschluss offen', async (page, daten) => {
    await vorschau(page); daten.eintraege.push(eintrag(4));
    await attrappenDruck(page); await fertig(page); await page.click('#etkBestaetigen'); await geschlossen(page);
    await warteAuf(() => daten.eintraege.slice(0, 3).every(e => e.status === 'gedruckt'));
    assert.equal(daten.eintraege.at(-1).status, 'offen');
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 5);
  });
  await pruefe('101 Aufkleber laufen in zwei Teilen ueber eine Verbindung', async page => {
    await vorschau(page); await attrappenDruck(page); await fertig(page);
    assert.deepEqual(await page.evaluate(() => window.__druckAttrappe.teile.map(t => t.totalPages)), [100, 1]);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.verbindungen), 1);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 101);
  }, fixture([eintrag(1, 101)]));
  await pruefe('Fehler im zweiten Transportteil verhindert dritten Teil und Abschluss', async (page, daten) => {
    await vorschau(page); await attrappenDruck(page, 'zweiter-teil-fehler');
    await page.waitForFunction(() => /Druck unterbrochen/.test(document.querySelector('#etkStatus')?.textContent || ''));
    assert.deepEqual(await page.evaluate(() => window.__druckAttrappe.teile.map(t => t.totalPages)), [100, 100]);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 100);
    assert.equal(await page.$eval('#etkBestaetigung', e => e.hidden), true);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    assert(daten.eintraege.every(e => e.status === 'in_druck'));
    assert.deepEqual(aktionen(daten), ['reservieren']);
  }, fixture([eintrag(1, 201)]));
  await pruefe('Seitenuebergreifend alle Positionen; Handy ohne seitlichen Ueberlauf', async (page, daten) => {
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.$$eval('.md-offen .md-zeile', es => es.length), 25);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await vorschau(page);
    assert.equal(daten.eintraege.filter(e => e.status === 'in_druck').length, 27);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  }, fixture(Array.from({ length: 27 }, (_, i) => eintrag(i + 1))));
  await pruefe('Lesender Zugang hat keine Druck- oder Auswahlaktion', async (page, daten) => {
    assert.equal(await page.$$eval('[data-md-reservieren],[data-md-auswahlmodus],[data-md-entfernen]', es => es.length), 0);
    assert.deepEqual(daten.anfragen, []);
  }, fixture(undefined, 'lesen'));
  await pruefe('Lexikon erhaelt Anzahl beim Farbwechsel und bestaetigt einmalige Vormerkung', async (page, daten) => {
    daten.vormerkHalten = true;
    await page.goto(`${basis}/#/lexikon?handle=${produkt.handle}&lq=alte-suche`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-lex-etikett-vormerken]');
    await page.$eval('[data-lex-etikett-anzahl]', el => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.select('[data-param="letikett"]', '1');
    assert.equal(await page.$eval('[data-lex-etikett-anzahl]', el => el.value), '3');
    await page.$eval('[data-lex-etikett-vormerken]', el => { el.click(); el.click(); });
    await warteAuf(() => !!daten.vormerkFortsetzen);
    assert.equal(daten.versuche.filter(a => a.aktion === 'vormerken').length, 1, 'Doppelklick loest genau einen Schreibversuch aus.');
    daten.vormerkFortsetzen();
    await page.waitForSelector('.lex-vorgemerkt');
    assert.match(await page.$eval('.lex-vorgemerkt', el => el.innerText), /3 × Grau · TEST-GR/);
    assert.equal(daten.eintraege.at(-1).anzahl, 3);
    assert.equal(daten.eintraege.at(-1).etikett.sku, 'TEST-GR');
    await page.click('[data-lex-weiteres-muster]');
    await page.waitForFunction(() => document.activeElement?.matches('input[data-param="lq"]'));
    assert.equal(await page.$eval('input[data-param="lq"]', el => el.value), '');
  }, fixture([]));
  await pruefe('Unbestaetigte Lexikon-Vormerkung zeigt Fehler ohne Erfolgsanzeige', async (page, daten) => {
    daten.vormerkFehler = true;
    await page.goto(`${basis}/#/lexikon?handle=${produkt.handle}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-lex-etikett-vormerken]');
    await page.click('[data-lex-etikett-vormerken]');
    await page.waitForFunction(() => /Vormerkung nicht bestätigt/.test(document.querySelector('.lex-etiketten')?.innerText || ''));
    assert.equal(await page.$$('.lex-vorgemerkt').then(es => es.length), 0);
    assert.equal(daten.eintraege.length, 0);
  }, fixture([]));
  for (const fehler of ['false', 'throw']) {
    await pruefe(`Schliessen-Callback ${fehler} laesst Vorschau offen und erlaubt Retry`, async (page, daten) => {
      await page.evaluate(async art => {
        window.__callbackAufrufe = 0;
        const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
        await oeffneEtikettenDruck({ etiketten: [{ serie: 'Testserie', farbe: 'Testfarbe', sku: 'TEST-1', url: 'https://www.teppich-paradies.net/products/testmuster', technik: [], fehlt: [] }], allowEditing: false,
          beiSchliessen: async ({ versucht }) => { if (versucht) throw new Error('Unerwarteter Druckversuch'); if (++window.__callbackAufrufe > 1) return true; if (art === 'throw') throw new Error('Testfreigabe fehlgeschlagen'); return false; },
        });
      }, fehler);
      await page.click('.etk-dialog [data-close-dialog]');
      await page.waitForFunction(() => /erneut|fehlgeschlagen/.test(document.querySelector('#etkStatus')?.textContent || ''));
      assert.equal(await page.$$('.etk-dialog').then(es => es.length), 1);
      await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
      assert.equal(await page.evaluate(() => window.__callbackAufrufe), 2);
      assert.deepEqual(daten.anfragen, []);
    });
    await pruefe(`Papierbestaetigung ${fehler} behaelt Vorschau und erlaubt Retry ohne Nachdruck`, async (page, daten) => {
      await page.evaluate(async art => {
        window.__callbackAufrufe = 0; window.__unerwartetGeschlossen = 0;
        const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
        await oeffneEtikettenDruck({ etiketten: [{ serie: 'Testserie', farbe: 'Testfarbe', sku: 'TEST-1', url: 'https://www.teppich-paradies.net/products/testmuster', technik: [], fehlt: [] }], allowEditing: false,
          beiSchliessen: async () => { ++window.__unerwartetGeschlossen; },
          beiBestaetigen: async () => { if (++window.__callbackAufrufe > 1) return true; if (art === 'throw') throw new Error('Testbestaetigung fehlgeschlagen'); return false; },
        });
      }, fehler);
      await attrappenDruck(page); await fertig(page); await page.click('#etkBestaetigen');
      await page.waitForFunction(() => /erneut|fehlgeschlagen/.test(document.querySelector('#etkStatus')?.textContent || ''));
      assert.equal(await page.$$('.etk-dialog').then(es => es.length), 1);
      await page.click('#etkBestaetigen'); await geschlossen(page);
      assert.equal(await page.evaluate(() => window.__callbackAufrufe), 2);
      assert.equal(await page.evaluate(() => window.__unerwartetGeschlossen), 0);
      assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 1);
      assert.deepEqual(daten.anfragen, []);
    });
  }
  await pruefe('Direkter Aufkleberdialog ohne Drucklisten-Callbacks bleibt nutzbar', async (page, daten) => {
    await page.evaluate(async () => {
      const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
      await oeffneEtikettenDruck({ etiketten: [{ serie: 'Testserie', farbe: 'Testfarbe', sku: 'TEST-1', url: 'https://www.teppich-paradies.net/products/testmuster', technik: [], fehlt: [] }], allowEditing: false });
    });
    await attrappenDruck(page);
    await page.waitForFunction(() => /Drucklauf ist fertig/.test(document.querySelector('#etkStatus')?.textContent || ''));
    assert.equal(await page.$$('#etkBestaetigen').then(es => es.length), 0);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 1);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    assert.deepEqual(daten.anfragen, []);
  });
  await pruefe('Dialogersatz waehrend Geraeteauswahl entwertet alten Druck und schliesst einmal', async page => {
    await page.evaluate(async () => {
      window.__altGeschlossen = 0; window.__neuGeschlossen = 0;
      const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
      await oeffneEtikettenDruck({ titel: 'Alter Dialog', etiketten: [{ serie: 'Alte Testserie', farbe: 'Testfarbe', sku: 'TEST-ALT', url: 'https://www.teppich-paradies.net/products/test-alt', technik: [], fehlt: [] }], allowEditing: false,
        beiSchliessen: async ({ versucht }) => { if (!versucht) throw new Error('Druckversuch wurde vergessen'); ++window.__altGeschlossen; },
      });
    });
    await attrappenDruck(page, 'auswahl-halten');
    await page.waitForFunction(() => typeof window.__druckAttrappe.auswahlFortsetzen === 'function');
    await page.evaluate(async () => {
      document.querySelector('#dialogRoot').innerHTML = '<p>Zwischenzeitlich ein anderer Dialog</p>';
      await Promise.resolve();
      const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
      await oeffneEtikettenDruck({ titel: 'Neuer Dialog', etiketten: [{ serie: 'Neue Testserie', farbe: 'Testfarbe', sku: 'TEST-NEU', url: 'https://www.teppich-paradies.net/products/test-neu', technik: [], fehlt: [] }], allowEditing: false,
        beiSchliessen: async () => { ++window.__neuGeschlossen; },
      });
      window.__nachfolgerInhalt = { titel: document.querySelector('#etkTitel').textContent, liste: document.querySelector('#etkListe').innerHTML, status: document.querySelector('#etkStatus').textContent };
      window.__druckAttrappe.auswahlFortsetzen();
    });
    await page.waitForFunction(() => window.__druckAttrappe.trennungen > 0 && window.__altGeschlossen === 1);
    await page.waitForFunction(() => !document.querySelector('#etkDrucken').disabled);
    assert.equal(await page.evaluate(() => JSON.stringify({ titel: document.querySelector('#etkTitel').textContent, liste: document.querySelector('#etkListe').innerHTML, status: document.querySelector('#etkStatus').textContent }) === JSON.stringify(window.__nachfolgerInhalt)), true);
    assert.equal(await page.evaluate(() => window.__druckAttrappe.seiten.length), 0);
    assert.equal(await page.evaluate(() => window.__neuGeschlossen), 0);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    assert.equal(await page.evaluate(() => window.__altGeschlossen), 1);
    assert.equal(await page.evaluate(() => window.__neuGeschlossen), 1);
  });
  await pruefe('Dialogersatz bei verzoegertem Schliessen veraendert Nachfolger nicht', async page => {
    await page.evaluate(async () => {
      window.__altGeschlossen = 0;
      const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
      await oeffneEtikettenDruck({ titel: 'Alter Dialog', etiketten: [{ serie: 'Alte Testserie', farbe: 'Testfarbe', sku: 'TEST-ALT', url: 'https://www.teppich-paradies.net/products/test-alt', technik: [], fehlt: [] }], allowEditing: false,
        beiSchliessen: async () => { ++window.__altGeschlossen; return new Promise(ok => { window.__schliessenFortsetzen = ok; }); },
      });
    });
    await page.click('.etk-dialog [data-close-dialog]');
    await page.waitForFunction(() => typeof window.__schliessenFortsetzen === 'function');
    await page.evaluate(async () => {
      document.querySelector('#dialogRoot').innerHTML = '<p>Zwischenzeitlich ein anderer Dialog</p>';
      await Promise.resolve();
      const { oeffneEtikettenDruck } = await import('/bausteine/etiketten-druck.mjs');
      await oeffneEtikettenDruck({ titel: 'Neuer Dialog', etiketten: [{ serie: 'Neue Testserie', farbe: 'Testfarbe', sku: 'TEST-NEU', url: 'https://www.teppich-paradies.net/products/test-neu', technik: [], fehlt: [] }], allowEditing: false });
      window.__nachfolgerHtml = document.querySelector('#dialogRoot').innerHTML;
      window.__schliessenFortsetzen(true);
    });
    await page.waitForFunction(() => document.querySelector('#etkTitel')?.textContent === 'Neuer Dialog' && !document.querySelector('#etkDrucken').disabled);
    assert.equal(await page.evaluate(() => document.querySelector('#dialogRoot').innerHTML === window.__nachfolgerHtml), true);
    assert.equal(await page.evaluate(() => window.__altGeschlossen), 1);
    await page.click('.etk-dialog [data-close-dialog]'); await geschlossen(page);
    assert.equal(await page.evaluate(() => window.__altGeschlossen), 1);
  });
} finally {
  await browser?.close();
  await new Promise(ok => server.close(ok));
}
console.log(`${bestanden} Browserstrecken erfolgreich, ${gescheitert} fehlgeschlagen. Kein echter Druck.`);
process.exitCode = gescheitert ? 1 : 0;
