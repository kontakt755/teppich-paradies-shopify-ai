import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR auf einen Testordner
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { parseKopfblock, parseFrist, fuehreZusammen, fristLage } from '../lib/ausschreibungen.mjs';

// Ausgedachte Verfahren und Auftraggeber - echte Namen gehoeren nie ins Repository.
const kopf = (zeilen) => `<!-- uebersicht\n${Object.entries(zeilen).map(([k, v]) => `${k}: ${v}`).join('\n')}\n-->\n# Checkliste\nText`;

test('Kopfblock: Felder gelesen, unbekannte Schluessel und Leerwerte ignoriert, ohne Block nicht gefunden', () => {
  const r = parseKopfblock(kopf({ status: 'bieten', titel: 'Musterschule, Boden', frist: '2026-12-01 10:00', quatsch: 'x', nebenfrist: '' }));
  assert.equal(r.gefunden, true);
  assert.deepEqual(r.felder, { status: 'bieten', titel: 'Musterschule, Boden', frist: '2026-12-01 10:00' });
  assert.equal(parseKopfblock('# Nur eine Checkliste').gefunden, false);
  assert.equal(parseKopfblock('Text\n<!-- uebersicht\nstatus: bieten\n-->').gefunden, false, 'Block muss ganz oben stehen');
  assert.equal(parseKopfblock('<!-- uebersicht\r\nstatus: bieten\r\n-->').felder.status, 'bieten', 'CRLF');
  assert.deepEqual(parseFrist('2026-12-01 10:00'), { tag: '2026-12-01', uhr: '10:00' });
  assert.deepEqual(parseFrist('2026-12-01'), { tag: '2026-12-01', uhr: '' });
  assert.equal(parseFrist('bald'), null);
});

const treffer = (id, frist, extra = {}) => ({ quelle: 'testportal', id, titel: `Treffer ${id}`, auftraggeber: 'Amt Beispiel', ort: '10000 Beispielstadt', frist, link: `https://portal.example/${id}`, ...extra });

test('Zusammenfuehren: Ordner vor Suche, Zuordnung ueber id oder Link, ungeprueft, abgelaufen faellt weg, neu markiert', () => {
  const r = fuehreZusammen({
    heute: '2026-11-26',
    ordner: [
      { name: 'schule-1', text: kopf({ status: 'in-arbeit', titel: 'Schule', frist: '2026-12-10 09:00', treffer: 'id-1' }) },
      { name: 'amt-2', text: kopf({ status: 'bieten', titel: 'Amt', frist: '2026-12-05', treffer: 'https://portal.example/id-2, id-x' }) },
      { name: 'rahmen-3', text: kopf({ status: 'abgegeben', titel: 'Rahmen', frist: '2026-11-20 11:00' }) },
      { name: 'absage-4', text: kopf({ status: 'nicht-geboten', titel: 'Absage', frist: '2026-12-30' }) },
      { name: 'ohne-kopf', text: '# nur Text' },
      { name: 'kaputt-5', text: kopf({ status: 'irgendwas', titel: 'Komisch' }) },
    ],
    status: {
      geprueftAm: '2026-11-26T09:00:00Z',
      treffer: [treffer('id-1', '2026-12-10'), treffer('id-2', '2026-12-05'), treffer('id-7', '2026-12-20'), treffer('id-8', '2026-11-01'), treffer('id-9', null), treffer('id-6', '2026-12-02')],
      neu: [{ id: 'id-6' }],
      ausfaelle: [{ quelle: 'Portal X', grund: 'Zeitueberschreitung' }, 'Portal Y'],
    },
  });
  assert.deepEqual(r.offen.map(e => e.ordner), ['amt-2', 'schule-1', 'kaputt-5', 'ohne-kopf'], 'nach Frist, ohne Frist zuletzt (dann nach Titel)');
  assert.deepEqual(r.ungeprueft.map(e => e.id), ['id-6', 'id-7', 'id-9'], 'abgelaufener Treffer weg, ohne Frist zuletzt');
  assert.equal(r.ungeprueft[0].neu, true);
  assert.equal(r.ungeprueft[1].neu, false);
  assert.deepEqual(r.erledigt.map(e => e.ordner), ['absage-4', 'rahmen-3'], 'erledigt: neueste Frist zuerst');
  assert.match(r.offen.find(e => e.ordner === 'ohne-kopf').hinweis, /Kopfblock fehlt/);
  assert.equal(r.offen.find(e => e.ordner === 'ohne-kopf').titel, 'ohne-kopf');
  assert.equal(r.offen.find(e => e.ordner === 'kaputt-5').status, null);
  assert.match(r.offen.find(e => e.ordner === 'kaputt-5').hinweis, /Status/);
  assert.deepEqual(r.ausfaelle, ['Portal X', 'Portal Y']);
  assert.equal(r.geprueftAm, '2026-11-26T09:00:00Z');
});

test('Ohne status.json und ohne Ordner: leere Listen, kein Fehler; javascript-Link wird verworfen', () => {
  const r = fuehreZusammen({ heute: '2026-11-26', ordner: [], status: null });
  assert.deepEqual([r.offen, r.ungeprueft, r.erledigt, r.ausfaelle], [[], [], [], []]);
  const b = fuehreZusammen({ heute: '2026-11-26', ordner: [{ name: 'x', text: kopf({ status: 'bieten', portal: 'javascript:alert(1)' }) }], status: null });
  assert.equal(b.offen[0].portal, null);
});

test('Frist: nah ab 7 Tagen, vorbei nur bei offenen, erledigte nie hervorgehoben', () => {
  const e = (tag, gruppe = 'offen') => ({ frist: tag ? { tag, uhr: '' } : null, gruppe });
  assert.deepEqual(fristLage(e('2026-12-03'), '2026-11-26'), { tage: 7, nah: true, vorbei: false });
  assert.equal(fristLage(e('2026-12-04'), '2026-11-26').nah, false);
  assert.equal(fristLage(e('2026-11-26'), '2026-11-26').nah, true);
  assert.deepEqual(fristLage(e('2026-11-20'), '2026-11-26'), { tage: -6, nah: false, vorbei: true });
  assert.deepEqual(fristLage(e('2026-11-20', 'erledigt'), '2026-11-26'), { tage: -6, nah: false, vorbei: false });
  assert.deepEqual(fristLage(e(null), '2026-11-26'), { tage: null, nah: false, vorbei: false });
});

test('API liest bei jedem Abruf frisch: Ordner ohne Checkliste zaehlt nicht, kaputtes status.json blockiert nicht', async () => {
  const api = createApi();
  const dir = path.join(PRIVAT_DIR, 'ausschreibungen');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal((await api.ausschreibungenListe()).verfuegbar, false, 'ohne Ordner ein Hinweis statt Fehler');
  fs.mkdirSync(path.join(dir, 'schule-1'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bietermappe'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'schule-1', 'CHECKLISTE.md'), kopf({ status: 'bieten', titel: 'Schule', frist: '2099-01-01' }));
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ geprueftAm: '2026-11-26T09:00:00Z', treffer: [treffer('id-1', '2099-02-01')], neu: [], ausfaelle: [] }));
  let r = await api.ausschreibungenListe();
  assert.equal(r.verfuegbar, true);
  assert.deepEqual([r.offen.length, r.ungeprueft.length, r.erledigt.length], [1, 1, 0]);
  // Eine Aenderung an der Checkliste ist beim naechsten Abruf sichtbar - ohne Neustart, ohne KI.
  fs.writeFileSync(path.join(dir, 'schule-1', 'CHECKLISTE.md'), kopf({ status: 'abgegeben', titel: 'Schule', frist: '2099-01-01' }));
  r = await api.ausschreibungenListe();
  assert.deepEqual([r.offen.length, r.erledigt.length], [0, 1]);
  fs.writeFileSync(path.join(dir, 'status.json'), '{kaputt');
  r = await api.ausschreibungenListe();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.erledigt.length, 1);
  assert.match(r.statusHinweis, /beschädigt/);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Ausschreibungen nur fuer den Inhaber (Mitarbeiter und Rolle lesen bekommen 403)', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aus-'));
  const privat = path.join(dir, 'privat');
  fs.mkdirSync(path.join(privat, 'ausschreibungen', 'schule-1'), { recursive: true });
  fs.writeFileSync(path.join(privat, 'ausschreibungen', 'schule-1', 'CHECKLISTE.md'), kopf({ status: 'bieten', titel: 'Musterschule' }));
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  liste = benutzerAnlegen(liste, { name: 'Ina Inhaber', kuerzel: 'ina', passwort: 'platzhalter-inhaber-1', rolle: 'inhaber' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=ausschreibungen-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async base => {
      const status = {};
      for (const [name, pw] of [['lena', 'platzhalter-lesen-1'], ['mona', 'platzhalter-mitarbeiter-1'], ['ina', 'platzhalter-inhaber-1']]) {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort: pw }) });
        const keks = r.headers.get('set-cookie').split(';')[0];
        const a = await fetch(`${base}/api/ausschreibungen/liste`, { headers: { cookie: keks } });
        status[name] = [a.status, a.status === 200 ? (await a.json()).offen?.[0]?.titel : null];
      }
      assert.deepEqual(status, { lena: [403, null], mona: [403, null], ina: [200, 'Musterschule'] });
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});

/* ---- Ansicht (ohne Browser: Modul mit Platzhaltern im vm) ---------------------------------- */

const quelltext = fs.readFileSync(new URL('../ansichten/ausschreibungen.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function ansicht(daten) {
  const api = vm.runInNewContext(`${quelltext}\n({ ausschreibungen, viewAusschreibungen })`, {
    ...{ STATUS_LABEL: { bieten: 'Wir bieten', ungeprueft: 'Ungeprüft', abgegeben: 'Abgegeben', 'in-arbeit': 'In Arbeit' }, fristLage },
    esc, fmtDateTime: v => v, render() {}, state: { route: { view: 'ausschreibungen' } },
    fetchEinkauf: async () => daten,
    emptyState: (t, h) => `<div class="empty">${esc(t)} ${esc(h)}</div>`, stoerungState: () => '<div class="notice crit">Störung</div>',
    Date, Number, String,
  });
  api.ausschreibungen.daten = daten;
  api.ausschreibungen.geladenAm = Date.now(); // frisch: die Ansicht stoesst kein Nachladen an
  return api.viewAusschreibungen();
}

test('Ansicht: Reihenfolge offen > ungeprueft > erledigt, Frist nah hervorgehoben, alles escaped', () => {
  const d = {
    verfuegbar: true, heute: '2026-11-26', statusHinweis: '',
    ...fuehreZusammen({
      heute: '2026-11-26',
      ordner: [
        { name: 'a', text: kopf({ status: 'bieten', titel: 'Musterschule <b>', frist: '2026-11-30 10:00', portal: 'https://portal.example/a', naechster_schritt: 'Preise eintragen' }) },
        { name: 'b', text: kopf({ status: 'abgegeben', titel: 'Rahmen', frist: '2026-11-20' }) },
      ],
      status: { geprueftAm: '2026-11-26T09:00:00Z', treffer: [treffer('id-9', '2026-12-30')], neu: [{ id: 'id-9' }], ausfaelle: ['Portal X'] },
    }),
  };
  const html = ansicht(d);
  assert.ok(html.indexOf('Musterschule') < html.indexOf('Treffer id-9') && html.indexOf('Treffer id-9') < html.indexOf('Rahmen'));
  assert.match(html, /<span class="aus-nah">Mo 30\.11\.2026, 10:00 Uhr – in 4 Tagen<\/span>/);
  assert.match(html, /Musterschule &lt;b&gt;/);
  assert.match(html, /<span class="badge status freigabe">neu<\/span>/);
  assert.match(html, /Suche zuletzt: 2026-11-26T09:00:00Z/);
  assert.match(html, /nicht alle Quellen erreichbar \(Portal X\)/);
  assert.match(html, /href="https:\/\/portal\.example\/a"/);
  assert.ok(!/aus-vorbei">[^<]*Nov/.test(html.split('Erledigt')[1] || ''), 'erledigte Verfahren werden nicht rot');
  assert.match(ansicht({ verfuegbar: false, hinweis: 'Ordner fehlt' }), /Keine Ausschreibungen auf diesem Rechner/);
});
