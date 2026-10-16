import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const QUELLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser-uebergabe');
const code = name => fs.readFileSync(path.join(QUELLE, name), 'utf8');
const ZIEL = 'https://chatgpt.com/g/g-p-00000000000000000000000000000000/project';
const ORIGIN = 'http://127.0.0.1:8001';
const ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = '00000000-0000-4000-8000-000000000002';
const TEXT = 'Arbeitsauftrag\nLiteral <script>unerwuenscht()</script> & "Test"\n\nLetzte Zeile';
const HTML = '<!doctype html><html><body><main><h1>Lexware</h1><form><div contenteditable="true" role="textbox" aria-multiline="true" aria-label="Neuer Chat in Lexware" class="ProseMirror"><p><br></p></div><button type="button" aria-label="Senden" disabled>Senden</button></form></main></body></html>';

async function mitBrowser(fn) {
  const browser = await puppeteer.launch({ headless: true });
  try { await fn(browser); } finally { await browser.close(); }
}

async function empfaengerSeite(browser, optionen = {}) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.isNavigationRequest()) req.respond({ status: 200, contentType: 'text/html', body: HTML });
    else req.abort();
  });
  await page.goto(ZIEL);
  await page.evaluate(({ optionen, ziel, id, token, text }) => {
    window.__ergebnisse = [];
    window.__sendeklicks = 0;
    window.__einfuegeaufrufe = 0;
    const editor = document.querySelector('[contenteditable]');
    const send = document.querySelector('button');
    send.addEventListener('click', () => window.__sendeklicks++);
    if (optionen.entwurf) editor.textContent = optionen.entwurf;
    editor.addEventListener('input', () => {
      if (!optionen.frameworkBlockiert) send.disabled = false;
    });
    const original = document.execCommand.bind(document);
    document.execCommand = (...args) => { window.__einfuegeaufrufe++; return optionen.fallback ? false : original(...args); };
    if (optionen.rahmenPausiert) window.requestAnimationFrame = () => {};
    let listener;
    window.chrome = { runtime: {
      id: 'erweiterung',
      onMessage: { addListener: fn => { listener = fn; } },
      sendMessage: async m => {
        if (m.aktion === 'bereit') return { status: 'wartet', id, token, ziel, bis: Date.now() + 120000 };
        if (m.aktion === 'holen') {
          if (optionen.abbruchVorEinfuegen) listener({ kanal: 'empfaenger', aktion: 'abbrechen', id, token }, { id: 'erweiterung' });
          if (optionen.editorGetauscht) editor.replaceWith(editor.cloneNode(true));
          return { status: 'einsetzen', id, token, ziel, text, bis: Date.now() + 120000 };
        }
        if (m.aktion === 'ergebnis') { window.__ergebnisse.push({ ok: m.ok, code: m.code }); return { angenommen: true }; }
      },
    } };
  }, { optionen, ziel: ZIEL, id: ID, token: TOKEN, text: TEXT });
  await page.addScriptTag({ content: code('logik.js') });
  await page.addScriptTag({ content: code('empfaenger.js') });
  await page.waitForFunction(() => window.__ergebnisse.length, { timeout: 4000, polling: 50 });
  return page;
}

test('Echter Editor ohne ID: nativer Textpfad und ProseMirror-Fallback erhalten Zeilen/HTML-Literale, nie Sendeklick', async () => {
  await mitBrowser(async browser => {
    for (const fallback of [false, true]) {
      const page = await empfaengerSeite(browser, { fallback });
      const r = await page.evaluate(() => ({ ergebnis: window.__ergebnisse, sends: window.__sendeklicks,
        scripts: document.querySelector('[contenteditable]').querySelectorAll('script').length,
        disabled: document.querySelector('button').disabled }));
      assert.equal(r.ergebnis[0].ok, true, JSON.stringify({ fallback, ...r }));
      assert.equal(r.sends, 0);
      assert.equal(r.scripts, 0);
      assert.equal(r.disabled, false, 'Erfolg setzt vom Eingabeereignis aktivierte Frameworkaktion voraus');
      await page.close();
    }
  });
});

test('Echter Editor: vorhandener Entwurf, Abbruch und ausgetauschter Editor werden weder ueberschrieben noch gesendet', async () => {
  await mitBrowser(async browser => {
    for (const [optionen, code] of [
      [{ entwurf: 'Bestehender privater Testentwurf' }, 'entwurf_vorhanden'],
      [{ abbruchVorEinfuegen: true }, 'abgebrochen'],
      [{ editorGetauscht: true }, 'nicht_eingefuegt'],
      [{ frameworkBlockiert: true }, 'nicht_eingefuegt'],
    ]) {
      const page = await empfaengerSeite(browser, optionen);
      const r = await page.evaluate(() => ({ ergebnis: window.__ergebnisse[0], sends: window.__sendeklicks,
        inhalt: document.querySelector('[contenteditable]').textContent, aufrufe: window.__einfuegeaufrufe }));
      assert.equal(r.ergebnis.ok, false);
      assert.equal(r.ergebnis.code, code);
      assert.equal(r.sends, 0);
      if (optionen.entwurf) assert.equal(r.inhalt, optionen.entwurf);
      if (!optionen.frameworkBlockiert) assert.equal(r.aufrufe, 0);
      await page.close();
    }
  });
});

test('Hintergrundtab ohne rAF bleibt nach Textpruefung antwortfaehig', async () => {
  await mitBrowser(async browser => {
    const page = await empfaengerSeite(browser, { rahmenPausiert: true });
    assert.equal(await page.evaluate(() => window.__ergebnisse[0].ok), true);
    await page.close();
  });
});

test('Dashboardgate: synthetischer Klick reicht nicht; echter Klick wird einmalig und synchron verbraucht', async () => {
  await mitBrowser(async browser => {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.isNavigationRequest()
      ? req.respond({ status: 200, contentType: 'text/html', body: '<button data-prozess-direkt>Einfügen</button>' }) : req.abort());
    await page.goto(ORIGIN);
    await page.evaluate(({ origin, ziel, id }) => {
      window.__antworten = [];
      window.__worker = [];
      window.TPBrowserUebergabeKonfiguration = { dashboardUrspruenge: [origin] };
      window.chrome = { runtime: { id: 'erweiterung', onMessage: { addListener() {} }, sendMessage: async m => {
        window.__worker.push({ aktion: m.aktion, id: m.id }); return { status: 'oeffnet' };
      } } };
      window.addEventListener('message', e => { if (e.data.typ === 'tp-prozess-uebergabe-antwort') window.__antworten.push(e.data); });
      document.querySelector('button').addEventListener('click', () => {
        const m = { typ: 'tp-prozess-uebergabe', version: 1, aktion: 'einfuegen', id, ziel, text: 'Testtext' };
        window.postMessage(m, location.origin);
      });
    }, { origin: ORIGIN, ziel: ZIEL, id: ID });
    await page.addScriptTag({ content: code('logik.js') });
    await page.addScriptTag({ content: code('dashboard.js') });
    await page.evaluate(() => document.querySelector('button').click());
    await page.waitForFunction(() => window.__antworten.length === 1);
    assert.equal(await page.evaluate(() => window.__antworten[0].code), 'klick_fehlt');
    await page.click('button');
    await page.waitForFunction(() => window.__worker.length === 1);
    await page.evaluate(({ ziel, id }) => window.postMessage({ typ: 'tp-prozess-uebergabe', version: 1, aktion: 'einfuegen', id, ziel, text: 'Anderer Test' }, location.origin), { ziel: ZIEL, id: '00000000-0000-4000-8000-000000000003' });
    await page.waitForFunction(() => window.__antworten.length === 3);
    assert.equal(await page.evaluate(() => window.__worker.length), 1);
    assert.equal(await page.evaluate(() => window.__antworten.at(-1).code), 'klick_fehlt');
  });
});
