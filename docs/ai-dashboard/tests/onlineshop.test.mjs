import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR auf einen Testordner
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

// Ausgedachte Bestellungen und Produkte - echte Kunden, Umsaetze und Lieferanten gehoeren nie ins Repository.

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Onlineshop nur fuer den Inhaber, andere Rollen bekommen 403 ohne Betraege', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-os-'));
  const privat = path.join(dir, 'privat');
  fs.mkdirSync(privat, { recursive: true });
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  liste = benutzerAnlegen(liste, { name: 'Ina Inhaber', kuerzel: 'ina', passwort: 'platzhalter-inhaber-1', rolle: 'inhaber' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=onlineshop-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async base => {
      const status = {};
      for (const [name, pw] of [['lena', 'platzhalter-lesen-1'], ['mona', 'platzhalter-mitarbeiter-1'], ['ina', 'platzhalter-inhaber-1']]) {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort: pw }) });
        const keks = r.headers.get('set-cookie').split(';')[0];
        const a = await fetch(`${base}/api/onlineshop/gewinn`, { headers: { cookie: keks } });
        const body = await a.json();
        status[name] = [a.status, 'kaeufe' in body || 'sortiment' in body];
        // Kein Schreibweg: POST ist kein Schreibpfad und aendert nichts.
      }
      // Ohne Bestelldaten antwortet der Inhaber mit dem Hinweis statt mit Zahlen.
      assert.deepEqual(status, { lena: [403, false], mona: [403, false], ina: [200, false] });
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});

test('API: Mitarbeiter bekommt auch beim direkten Aufruf keine Betraege', async () => {
  const { createApi } = await import('../../../scripts/dashboard-api.mjs');
  const r = createApi({ privatDirPath: PRIVAT_DIR }).onlineshopGewinn({ rolle: 'mitarbeiter', name: 'Mona' });
  assert.equal(r.nurInhaber, true);
  assert.equal(JSON.stringify(r).match(/\d/), null);
});

/* ---- Ansicht (ohne Browser: Modul mit Platzhaltern im vm) ---------------------------------- */

const quelltext = fs.readFileSync(new URL('../ansichten/onlineshop.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function ansicht(daten, params = '') {
  const api = vm.runInNewContext(`${quelltext}\n({ onlineshop, viewOnlineshop })`, {
    esc, fmtPreis: n => Number(n).toFixed(2).replace('.', ','), fmtDateTime: v => v, render() {},
    state: { route: { view: 'onlineshop', params: new URLSearchParams(params) } },
    fetchEinkauf: async () => daten,
    emptyState: (t, h) => `<div class="empty">${esc(t)} ${esc(h)}</div>`, stoerungState: () => '<div class="notice crit">Störung</div>',
    Date, Number, String, Math, Array, URLSearchParams,
  });
  api.onlineshop.daten = daten;
  api.onlineshop.geladenAm = Date.now();
  return api.viewOnlineshop();
}

const DATEN = {
  verfuegbar: true, ziel: 0.3, stand: { bestellungen: '2099-03-06T10:00:00Z', belege: '2099-03-01', ekListe: '2099-02-01' }, hinweise: [], ausgeschlossen: { muster: 4 },
  monate: [{ monat: '2099-03', kaeufe: 3, rechenbar: 2, umsatzNetto: 300, umsatzRechenbar: 200, anteilRechenbar: 0.667, rohertrag: 40, quote: 0.2, verlust: 1 }],
  kaeufe: [
    { name: '#T3', datum: '2099-03-05T10:00:00Z', titel: 'Testboden <i>', netto: 100, ware: 80, kettel: 0, zuschlag: 30, weg: 0, gebuehr: 3, rohertrag: -13, quote: -0.13, guete: 'geschaetzt', gruende: [], hinweise: ['Annahme: Lieferweg nicht vermerkt.'] },
    { name: '#T2', datum: '2099-03-04T10:00:00Z', titel: 'Testteppich', netto: 100, ware: 30, kettel: 10, zuschlag: 0, weg: 4, gebuehr: 3, rohertrag: 53, quote: 0.53, guete: 'belegt', gruende: [], hinweise: [] },
    { name: '#T1', datum: '2099-03-03T10:00:00Z', titel: 'Testkleber', netto: 100, ware: null, kettel: null, zuschlag: null, weg: null, gebuehr: null, rohertrag: null, quote: null, guete: 'unbekannt', gruende: ['Einkaufspreis fehlt: Testkleber'], hinweise: [] },
  ],
  kaeufeKontrolle: {
    preisFaelle: [
      { titel: 'Testboden', variante: 'Grau', einheit: 'je m²', kaeufe: ['#T3'], noetigBrutto: 13.6, verkauftBrutto: 11.9, heuteBrutto: 11.9, guete: 'geschaetzt', verlust: true, stand: 'offen' },
      { titel: 'Testspachtel', variante: '10 kg', einheit: 'je Stück', kaeufe: ['#T0'], noetigBrutto: 50, verkauftBrutto: 40, heuteBrutto: 60, guete: 'belegt', verlust: false, stand: 'angehoben' },
    ],
    kaufFaelle: [{ ursache: 'kosten', name: '#T4', datum: '2099-03-02T10:00:00Z', titel: 'Testläufer', netto: 30, brutto: 35.7, rohertrag: 2, quote: 0.07, ware: 18, kante: 0, verschnitt: 0, zuschlag: 8, weg: 3, gebuehr: 1, guete: 'belegt',
      groesste: 'zuschlag', groessteBetrag: 8, hinweis: 'Mindermengen- bzw. Lieferaufschlag prüfen', mindestBrutto: 50.12, mehrBrutto: 14.42 }],
  },
  kanteReferenz: { breiteCm: 200, laengeCm: 300 },
  sortiment: { geprueft: 1200, ohneEk: 300, nichtVergleichbar: 20, imZiel: 870, unterZiel: 10, verlust: 0, kanteMitgerechnet: 40, ohneKante: 5, produkte: [
    { titel: 'Testteppich nach Maß', gruppe: 'Teppich nach Maß', verkauft: false, einheit: 'je m²', kante: 'ohne', varianten: 4, verlustVarianten: 0, schlechtesteQuote: 0.25, heuteBrutto: [39, 39], noetigBrutto: 41.5, guete: 'geschaetzt', verlust: false },
  ], nichtVergleichbarGruende: [{ grund: 'Shop verkauft je Stück, EK-Liste rechnet je m²', anzahl: 20, beispiele: ['Testboden Wunschmaß'] }] },
};

test('Ansicht Gewinn: Monat mit Abdeckung, Verlust rot, unbekannt ohne Zahl mit Grund, escaped', () => {
  const html = ansicht(DATEN);
  assert.match(html, /über 2 von 3 Käufen, 67 % des Umsatzes rechenbar/);
  assert.match(html, /davon 1 Kauf mit Verlust/);
  assert.match(html, /Testboden &lt;i&gt;/);
  assert.match(html, /class="num os-crit"><b>-13,00 €<\/b>/);
  assert.match(html, /Fehlt: Einkaufspreis fehlt: Testkleber/);
  assert.match(html, /<div class="cell-title">#T1<\/div><div class="small muted">[^<]*<\/div><span class="os-guete os-guete-unbekannt">unbekannt/, 'Güte steht unter der Kaufnummer');
  assert.doesNotMatch(html, /<button[^>]*data-(preis|speichern|aendern)/, 'kein Knopf, der Preise aendert');
});

test('Ansicht Preiskontrolle: offene Preisfaelle, angehoben ausserhalb der Handlungsliste, Kostenfall mit Empfehlung, Sortiment mit Zaehlern', () => {
  const html = ansicht(DATEN, 'teil=preise');
  assert.match(html, /Preise ändert nur der Inhaber/);
  const handlung = html.slice(0, html.indexOf('Inzwischen angehoben'));
  assert.match(handlung, /Testboden/);
  assert.doesNotMatch(handlung, /Testspachtel/);
  assert.match(html, /Inzwischen angehoben: Testspachtel \(#T0: damals 40,00 €, heute 60,00 €\)/);
  assert.match(html, /<b>50,12 €<\/b><div class="small">14,42 € mehr<\/div>/);
  assert.match(html, /<b>Lieferzuschläge<\/b> 8,00 €<div class="small muted">Mindermengen- bzw. Lieferaufschlag prüfen/);
  assert.match(html, /Kante für 200 × 300 cm mit dem Kettlertarif mitgerechnet, ebenso der Kettelservice, den der Kunde dafür extra zahlt \(40 Varianten\)/);
  assert.match(html, /Teppich nach Maß · ohne Kante gerechnet/);
  assert.doesNotMatch(html, /hilft kein höherer Preis/);
  assert.match(html, /1.200 Varianten geprüft · 300 ohne Einkaufspreis · 20 nicht vergleichbar · <b>10 unter Ziel<\/b> · keine mit Verlust/);
  assert.match(html, /Nicht vergleichbar: 20 Varianten/);
});

test('Ansicht: Rolle ohne Rechte sieht nur den Hinweis', () => {
  const html = ansicht({ verfuegbar: false, nurInhaber: true, hinweis: 'Gewinn und Preise sieht nur der Inhaber.' });
  assert.match(html, /sieht nur der Inhaber/);
  assert.doesNotMatch(html, /€/);
});
