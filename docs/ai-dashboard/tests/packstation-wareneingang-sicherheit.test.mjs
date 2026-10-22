import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const quelltext = datei => fs.readFileSync(new URL(`../ansichten/${datei}.mjs`, import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/^export\s/gm, '');

test('gemischten Wareneingang sofort mit leerem Cache oeffnen liest frisch und schreibt beim Abbrechen nichts', async () => {
  let writes = 0, reads = 0, resolve;
  const tor = new Promise(r => { resolve = r; });
  const root = { innerHTML: '' }, dialog = { innerHTML: '' };
  const einkauf = { auftragsstatus: null };
  const m = { orderId: 'o1', lineItemId: 'm1', istMuster: true, titel: 'Testmuster' };
  const w = { orderId: 'o1', lineItemId: 'w1', istMuster: false, titel: 'Testware' };
  const api = vm.runInNewContext(quelltext('einkauf/beschaffung') + '\n({ beschaffungKlick })', {
    $: s => s === '#dialogRoot' ? root : dialog, esc: String, istNurLesend: () => false,
    state: { route: { view: 'kunden', params: new URLSearchParams('tab=bestellungen') } }, einkauf,
    alleAuftraege: () => [{ id: 'o1', positionen: [m, w] }], afEintragFuer: () => einkauf.auftragsstatus ? { status: 'bestellt' } : null,
    fetchEinkauf: async () => { reads++; return tor; }, setzeAuftragsstatus: () => { writes++; }, toast() {},
  });
  const schritt = { dataset: { zlOrder: 'o1' } };
  assert.equal(api.beschaffungKlick({ target: { closest: s => s === '[data-zl-schritt="geliefert"]' ? schritt : null }, preventDefault() {} }), true);
  assert.equal(writes, 0);
  assert.match(root.innerHTML, /Positionsstand laden/);
  resolve({ verfuegbar: true, positionen: {} });
  await new Promise(r => setImmediate(r));
  assert.equal(reads, 1);
  assert.match(dialog.innerHTML, /m1/);
  assert.match(dialog.innerHTML, /w1/);
  assert.match(dialog.innerHTML, /als angekommen bestätigen/);
  root.innerHTML = '';
  assert.equal(writes, 0);
});

test('Positionsabruf nach geschlossenem Dialog wird verworfen; Lesefehler zeigt gezielten Retry ohne Write', async () => {
  let current, resolve;
  const root = { innerHTML: '' }, dialog = { innerHTML: '' };
  current = dialog;
  let antwort = new Promise(r => { resolve = r; });
  const api = vm.runInNewContext(quelltext('einkauf/beschaffung') + '\n({ oeffneGemischtenWareneingang })', {
    $: s => s === '#dialogRoot' ? root : current, esc: String,
    state: { route: { view: 'kunden', params: new URLSearchParams() } }, einkauf: {},
    fetchEinkauf: async () => antwort,
  });
  const lauf = api.oeffneGemischtenWareneingang('o1');
  current = null;
  resolve({ verfuegbar: true, positionen: {} });
  await lauf;
  assert.equal(dialog.innerHTML, '');
  current = dialog;
  antwort = { verfuegbar: false, hinweis: 'Testverbindung fehlt' };
  await api.oeffneGemischtenWareneingang('o1');
  assert.match(dialog.innerHTML, /Testverbindung fehlt/);
  assert.match(dialog.innerHTML, /Positionsstand erneut laden/);
  assert.match(dialog.innerHTML, /Es wurde nichts bestätigt/);
});

function packUmgebung({ writeFehler = false, leseFehler = false } = {}) {
  const alt = { verfuegbar: true, kunden: [{ packSchluessel: 'o1', muster: [{ lineItemId: 'm1', abgehakt: null }] }] };
  const kunden = { musterPacken: alt };
  let reads = 0, writes = 0;
  const api = vm.runInNewContext(quelltext('kunden/muster-packen') + '\n({ schreiben, packlisteErneutLaden, packFehlerHtml, fehler: () => packFehler })', {
    kunden, esc: String, orgSchreiben: async () => { writes++; if (writeFehler) throw new Error('Writekonflikt'); },
    fetchEinkauf: async () => { reads++; return leseFehler ? { verfuegbar: false, hinweis: 'Lesestoerung' } : { verfuegbar: true, kunden: [], neu: true }; },
    render() {}, toast() {},
  });
  return { ...api, kunden, alt, reads: () => reads, writes: () => writes, setLesefehler: v => { leseFehler = v; } };
}

test('abgelehnter Packwrite behaelt Altstand und erfindet keinen Haken; kein Folgeabruf', async () => {
  const u = packUmgebung({ writeFehler: true });
  await u.schreiben({ aktion: 'haken' });
  assert.equal(u.kunden.musterPacken, u.alt);
  assert.equal(u.alt.kunden[0].muster[0].abgehakt, null);
  assert.equal(u.reads(), 0);
  assert.match(u.fehler(), /Nicht gespeichert/);
  assert.equal(u.kunden.loadingMusterPacken, false);
});

test('bestaetigter Packwrite mit Lesefehler bewahrt Altstand und zeigt differenzierte Stoerung', async () => {
  const u = packUmgebung({ leseFehler: true });
  await u.schreiben({ aktion: 'gepackt' });
  assert.equal(u.kunden.musterPacken, u.alt);
  assert.match(u.fehler(), /Gespeichert, aber/);
  assert.equal(u.reads(), 1);
});

test('erfolgreicher Packwrite uebernimmt die frische Liste ohne leeren Ladezwischenstand', async () => {
  const u = packUmgebung();
  await u.schreiben({ aktion: 'gepackt' });
  assert.equal(u.kunden.musterPacken.neu, true);
  assert.equal(u.fehler(), null);
});


test('Packwarnung verschwindet bei frischem erfolgreichem Cache; gezielter Wiederholknopf liest ohne Write', async () => {
  const u = packUmgebung({ leseFehler: true });
  await u.schreiben({ aktion: 'gepackt' });
  assert.match(u.packFehlerHtml(u.alt), /Packliste erneut laden/);
  await u.packlisteErneutLaden();
  assert.equal(u.kunden.musterPacken, u.alt);
  assert.equal(u.writes(), 1, 'wiederholter Leseversuch schreibt nichts');
  u.setLesefehler(false);
  await u.packlisteErneutLaden();
  assert.equal(u.kunden.musterPacken.neu, true);
  assert.equal(u.fehler(), null);
  assert.equal(u.writes(), 1);
  const anderer = packUmgebung({ writeFehler: true });
  await anderer.schreiben({ aktion: 'haken' });
  assert.ok(anderer.fehler());
  assert.equal(anderer.packFehlerHtml({ verfuegbar: true, kunden: [] }), '');
  assert.equal(anderer.fehler(), null, 'auch stiller erfolgreicher Cachewechsel hebt alte Warnung auf');
});

test('bewusster Muster-Wareneingang sperrt Doppelklick und zeigt Erfolg; Fehler erlaubt erneuten Versuch', async () => {
  let writes = 0, erfolg = true, resolve;
  const tor = new Promise(r => { resolve = r; });
  const api = vm.runInNewContext(quelltext('einkauf/beschaffung') + '\n({ beschaffungKlick })', {
    istNurLesend: () => false, toast() {},
    setzeAuftragsstatus: async () => { writes++; await tor; return erfolg; },
  });
  const knopf = { dataset: { afOrder: 'o1', afItem: 'm1' }, disabled: false, textContent: 'Bestätigen' };
  const event = { target: { closest: s => s === '[data-b-muster-angekommen]' ? knopf : null }, preventDefault() {} };
  api.beschaffungKlick(event);
  api.beschaffungKlick(event);
  await Promise.resolve();
  assert.equal(writes, 1);
  assert.equal(knopf.disabled, true);
  resolve();
  await new Promise(r => setImmediate(r));
  assert.equal(knopf.textContent, 'Angekommen bestätigt');
  assert.equal(knopf.disabled, true);
  erfolg = false; knopf.disabled = false;
  api.beschaffungKlick(event);
  await new Promise(r => setImmediate(r));
  assert.equal(writes, 2);
  assert.equal(knopf.disabled, false);
});
