import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { musterwirkung } from '../../../operations/lib/musterwirkung.mjs';

const quelltext = fs.readFileSync(new URL('../ansichten/kunden/musterwirkung.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const fixture = () => musterwirkung({ orders: [], exportiertAm: '2026-10-22T12:00:00Z' }, { jetzt: new Date('2026-10-22T12:00:00Z') });
const tick = () => new Promise(resolve => setImmediate(resolve));
function umgebung() {
  const config = { antwort: fixture(), jetzt: 1000 }, aufrufe = [];
  const api = vm.runInNewContext(quelltext + '\n({ viewMusterwirkung, ensureMusterwirkung, verwirfMusterwirkung, musterwirkungKlick, musterwirkungCache })', {
    state: { route: { view: 'kunden', params: new URLSearchParams('tab=musterwirkung') } },
    Date: class extends Date { static now() { return config.jetzt; } },
    esc: v => String(v ?? '').replaceAll('<', '&lt;'), fmtDateTime: v => v,
    render() {}, stoerungState: d => `<p>${d.hinweis}<button data-action="reload">Erneut laden</button></p>`,
    fetchEinkauf: async pfad => { aufrufe.push(pfad); return config.antwort; },
  });
  return { ...api, config, aufrufe };
}

test('Musterwirkung zeigt Ladezustand statt falscher Nullzahlen und liest nur eigenen Endpunkt', async () => {
  const u = umgebung();
  const html = u.viewMusterwirkung();
  assert.match(html, /werden ausgewertet/);
  assert.ok(!html.includes('<table>'));
  await tick();
  assert.deepEqual(u.aufrufe, ['/api/kunden/musterwirkung']);
  const fertig = u.viewMusterwirkung();
  assert.match(fertig, /kein Beweis|beweist keine Kaufursache/);
  assert.match(fertig, /Kein vollständiges Bestellarchiv/);
  assert.match(fertig, /keine scheinbar genaue Konversionsrate/);
  assert.match(fertig, /keine Rentabilität/);
  assert.ok(!fertig.includes('undefined'));
  assert.match(fertig, /class="table-scroll"/);
});

test('fehlende Rabattwerte bleiben offen erkennbar; kein Marktpreis- oder Gratisversand-Kaufbeleg', async () => {
  const u = umgebung();
  u.config.antwort.qualitaet.unklareRabattwerte = 4;
  u.config.antwort.zahlen.musterkundenMitUnklaremWarenkauf = 2;
  await u.ensureMusterwirkung();
  const html = u.viewMusterwirkung();
  assert.match(html, /4 Warenbestellungen ohne vollständige Rabattwerte/);
  assert.match(html, /Unklare Fälle werden nicht als bestätigter Kauf gezählt/);
  assert.match(html, /Davon späterer Warenkauf unklar/);
});

test('Fehler erhalten vorherige Aggregate, wiederholen sich nicht im Render und besitzen gezielten Retry', async () => {
  const u = umgebung(); await u.ensureMusterwirkung();
  const vorher = u.musterwirkungCache.daten;
  u.config.antwort = { verfuegbar: false, fehler: true, hinweis: 'Synthetischer Lesefehler' };
  await u.ensureMusterwirkung({ erzwingen: true });
  const html = u.viewMusterwirkung();
  assert.equal(u.musterwirkungCache.daten, vorher);
  assert.match(html, /Synthetischer Lesefehler/);
  assert.match(html, /data-mw-neuladen/);
  assert.ok(!html.includes('data-action="reload"'));
  assert.equal(u.aufrufe.length, 2);
  u.config.antwort = fixture();
  assert.equal(u.musterwirkungKlick({ target: { closest: s => s === '[data-mw-neuladen]' ? {} : null }, preventDefault() {} }), true);
  await tick();
  assert.equal(u.musterwirkungCache.fehler, null);
  assert.equal(u.aufrufe.length, 3);
});

test('abgebrochener alter Abruf darf frisch verworfenen Cache nicht wieder fuellen', async () => {
  const config = { fertig: null };
  const api = vm.runInNewContext(quelltext + '\n({ ensureMusterwirkung, verwirfMusterwirkung, musterwirkungCache })', {
    state: { route: { view: 'kunden', params: new URLSearchParams('tab=musterwirkung') } },
    fetchEinkauf: () => new Promise(resolve => { config.fertig = resolve; }), render() {},
  });
  const lauf = api.ensureMusterwirkung();
  api.verwirfMusterwirkung();
  config.fertig(fixture()); await lauf;
  assert.equal(api.musterwirkungCache.daten, null);
  assert.equal(api.musterwirkungCache.loading, false);
});

test('Altersangaben behaupten keine vollstaendige Beobachtung und alte Muster zeigen Historienluecke', async () => {
  const u = umgebung();
  u.config.antwort.zahlen.musterkundenMitLueckenhafterHistorie = 1;
  await u.ensureMusterwirkung();
  const html = u.viewMusterwirkung();
  assert.match(html, /Lückenhafte Historie nach älteren Mustern/);
  assert.match(html, /abgeschlossene Zwischenkäufe können fehlen/);
  assert.match(html, /liegt mindestens 30 Tage zurück/);
  assert.ok(!html.includes('Mindestens 30 Tage beobachtet'));
});

test('Versand und Zustellung stehen getrennt und behaupten keinen Empfang durch Versandbuchung', async () => {
  const u = umgebung();
  Object.assign(u.config.antwort.zahlen, { musterkunden: 3, musterkundenMitVersandbuchung: 2, musterkundenOhneVersandbuchung: 1, musterkundenMitZustellnachweis: 0 });
  await u.ensureMusterwirkung();
  const html = u.viewMusterwirkung();
  assert.match(html, /Musterkunden mit Versandbuchung<\/th><td>2/);
  assert.match(html, /Musterkunden ohne belegte Versandbuchung<\/th><td>1/);
  assert.match(html, /Musterkunden mit Zustellnachweis<\/th><td>0/);
  assert.match(html, /kein physischer Empfang belegt/);
  assert.match(html, /fehlende digitale Buchung/);
  assert.match(html, /Produktübereinstimmung.*nicht geprüft/);
});
