// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner - merke() schreibt ins Protokoll dort,
// sonst landeten Testeintraege in ~/teppich-paradies-analyse/protokoll.jsonl.
import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError, buildComment } from '../../../scripts/dashboard-api.mjs';

/** Fake-gh: merkt sich Aufrufe, liefert Issue/Labels/User. */
function fakeGh({ issue, labels = ['status:geplant', 'status:in-arbeit', 'status:review', 'status:blockiert', 'status:fertig', 'reviewer:mensch'], user = 'tobias' } = {}) {
  const calls = [];
  const gh = async args => {
    calls.push(args);
    const a = args.join(' ');
    if (a === 'api user --jq .login') return `${user}\n`;
    if (/api --paginate repos\/.*\/labels/.test(a)) return JSON.stringify(labels.map(name => ({ name })));
    if (/^api repos\/[^ ]+\/issues\/\d+$/.test(a)) return JSON.stringify(issue);
    if (/issues\/\d+\/events/.test(a)) return JSON.stringify([{ event: 'labeled', label: { name: 'status:in-arbeit' }, actor: { login: 'tobias' }, created_at: '2026-09-07T10:00:00Z' }]);
    if (/issues\/\d+\/comments/.test(a)) return JSON.stringify([{ body: 'Hallo <!-- tp-control-center -->', user: { login: 'tobias' }, created_at: '2026-09-07T11:00:00Z' }]);
    return '';
  };
  return { gh, calls };
}

const baseIssue = (over = {}) => ({
  number: 41, title: '[SHP-015] Live-Collection-Zuordnungen', state: 'open', html_url: 'https://github.com/x/y/issues/41',
  labels: [{ name: 'status:geplant' }, { name: 'priority:p1' }, { name: 'area:produktseite' }],
  assignee: null, assignees: [], comments: 0,
  body: '## Akzeptanzkriterien\n- [ ] Nur belegte Zuordnungen\n- [ ] Preise unverändert\n\n## Nächster Schritt\nIDs genehmigen',
  created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z', closed_at: null, ...over,
});

function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-api-')); }

test('capabilities meldet lokalen Modus mit Nutzer und Labels', async () => {
  const { gh } = fakeGh({});
  const api = createApi({ gh, root: tmpRoot() });
  const c = await api.capabilities();
  assert.equal(c.mode, 'local');
  assert.equal(c.user, 'tobias');
  assert.equal(c.actions, true);
  assert.ok(c.labelsAvailable.includes('status:geplant'));
});

test('transition lehnt fehlende Pflichtangaben serverseitig ab', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue() });
  const api = createApi({ gh, root: tmpRoot() });
  await assert.rejects(() => api.transition(41, { target: 'in-arbeit' }), e => e instanceof ApiError && e.status === 400 && e.extra.missing[0].includes('Owner'));
  await assert.rejects(() => api.transition(41, { target: 'fertig' }), e => e.status === 400 && /nicht vorgesehen/.test(e.extra.missing[0]));
  await assert.rejects(() => api.transition(41, { target: 'unsinn' }), e => e.status === 400);
  assert.ok(!calls.some(c => c[0] === 'issue' && c[1] === 'edit'), 'kein Schreibzugriff bei Ablehnung');
});

test('transition setzt Labels, Assignee und Kommentar und protokolliert', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue() });
  const root = tmpRoot();
  let rebuilt = 0;
  const api = createApi({ gh, root, rebuild: async () => { rebuilt += 1; } });
  const r = await api.transition(41, { target: 'in-arbeit', owner: 'ahmet' });
  assert.equal(r.ok, true);
  assert.equal(r.to, 'in-arbeit');
  const edit = calls.find(c => c[0] === 'issue' && c[1] === 'edit');
  assert.ok(edit.includes('--remove-label') && edit.includes('status:geplant'));
  assert.ok(edit.includes('--add-label') && edit.includes('status:in-arbeit'));
  assert.ok(edit.includes('--add-assignee') && edit.includes('ahmet'));
  const comment = calls.find(c => c[0] === 'issue' && c[1] === 'comment');
  assert.match(comment[comment.length - 1], /Control Center: Status Geplant → In Arbeit/);
  assert.match(comment[comment.length - 1], /Owner: @ahmet/);
  assert.equal(rebuilt, 1, 'issues.json wird nach dem Schreiben neu erzeugt');
  const audit = fs.readFileSync(path.join(root, '.router/control-center-audit.jsonl'), 'utf8');
  assert.match(audit, /"action":"transition"/);
});

test('transition nach Freigabe nutzt die Uebergangsregel, wenn status:freigabe fehlt', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue({ labels: [{ name: 'status:in-arbeit' }, { name: 'priority:p1' }, { name: 'area:produktseite' }], assignee: { login: 'ahmet' }, assignees: [{ login: 'ahmet' }] }) });
  const api = createApi({ gh, root: tmpRoot() });
  const r = await api.transition(41, { target: 'freigabe', reason: 'Scopes write_products freigeben?' });
  assert.deepEqual(r.labels.add, ['status:blockiert', 'reviewer:mensch']);
  assert.match(r.note, /Übergangsregel/);
  const comment = calls.find(c => c[0] === 'issue' && c[1] === 'comment');
  assert.match(comment[comment.length - 1], /write_products/);
});

test('Freigabe erteilen: Legacy-Marker wird entfernt, Entscheidung im Kommentar benannt', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue({ labels: [{ name: 'status:blockiert' }, { name: 'reviewer:mensch' }, { name: 'priority:p1' }, { name: 'area:produktseite' }], assignee: { login: 'ahmet' }, assignees: [{ login: 'ahmet' }] }) });
  const api = createApi({ gh, root: tmpRoot() });
  const r = await api.transition(41, { target: 'bereit', decision: 'approve', reason: 'Option 2' });
  assert.equal(r.from, 'freigabe');
  const edit = calls.find(c => c[0] === 'issue' && c[1] === 'edit');
  assert.ok(edit.includes('reviewer:mensch'), 'Legacy-Marker entfernt');
  const comment = calls.find(c => c[0] === 'issue' && c[1] === 'comment');
  assert.match(comment[comment.length - 1], /Freigabe erteilt/);
});

test('Erledigt schliesst das Issue nur mit Bestaetigung', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue({ labels: [{ name: 'status:review' }, { name: 'priority:p1' }, { name: 'area:produktseite' }], assignee: { login: 'ahmet' }, assignees: [{ login: 'ahmet' }] }) });
  const api = createApi({ gh, root: tmpRoot() });
  await assert.rejects(() => api.transition(41, { target: 'fertig' }), e => /0\/2/.test(e.extra.missing[0]));
  await api.transition(41, { target: 'fertig', confirmAcceptance: true });
  assert.ok(calls.some(c => c[0] === 'issue' && c[1] === 'close'));
});

test('assign und comment schreiben ueber gh; ohne Login gesperrt', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue() });
  const api = createApi({ gh, root: tmpRoot() });
  await api.assign(41, { owner: '@ahmet' });
  assert.ok(calls.some(c => c.includes('--add-assignee') && c.includes('ahmet')));
  await assert.rejects(() => api.comment(41, { body: '  ' }), e => e.status === 400);
  await api.comment(41, { body: 'Rückfrage: welche IDs?', decision: 'question' });
  assert.match(calls.at(-1).at(-1), /Rückfrage/);
  const noUser = createApi({ gh: fakeGh({ issue: baseIssue(), user: '' }).gh, root: tmpRoot() });
  await assert.rejects(() => noUser.comment(41, { body: 'x' }), e => e.status === 403);
});

test('activityForTask mischt Events und Kommentare, erkennt Control-Center-Kommentare', async () => {
  const { gh } = fakeGh({ issue: baseIssue() });
  const api = createApi({ gh, root: tmpRoot() });
  const a = await api.activityForTask(41);
  assert.equal(a.events.length, 2);
  assert.equal(a.events[0].type, 'Control Center');
  assert.match(a.events[1].text, /status:in-arbeit/);
});

test('agentRuns liest Steuerzentrale-State und Ledger read-only', () => {
  const dir = tmpRoot();
  fs.writeFileSync(path.join(dir, 'dashboard-state.json'), JSON.stringify({ current: null, history: [{ id: 'DASH-1', state: 'PASS', task: 'Mega Menu', issue: { number: 92, title: 'Mega Menu' }, startedAt: '2026-09-04T05:00:00Z', finishedAt: '2026-09-04T05:10:00Z', result: { status: 'PASS', costUsd: 0.42, summary: 'Fertig', findings: [{}, {}] } }] }));
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, `${JSON.stringify({ timestamp: '2026-09-08T13:26:06Z', provider: 'GEMINI_FREE', model: 'g', usage: { costUsd: 0 } })}\n${JSON.stringify({ timestamp: '2026-09-08T12:00:00Z', provider: 'OPENROUTER', model: 'x', usage: { costUsd: 0.05 } })}\n`);
  const api = createApi({ gh: async () => '', root: dir, stateDir: dir, ledgerPath: ledger });
  const r = api.agentRuns();
  assert.equal(r.runs.length, 1);
  assert.equal(r.runs[0].issue.number, 92);
  assert.equal(r.runs[0].findings, 2);
  assert.equal(r.usage.requests, 2);
  assert.equal(r.usage.last.provider, 'GEMINI_FREE');
});

test('buildComment traegt Marker und Actor', () => {
  const c = buildComment({ actor: 'tobias', heading: 'Kommentar', text: 'Hallo' });
  assert.match(c, /^## Control Center: Kommentar/);
  assert.match(c, /@tobias/);
  assert.match(c, /tp-control-center/);
});

// ---------------------------------------------------------------------------
// Einkauf: Bestelluebersicht und Produktdaten-Status (synthetische Fixtures,
// keine echten Kunden-/Lieferantendaten)
// ---------------------------------------------------------------------------
function privatFixture(root) {
  const dir = path.join(root, 'privat');
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'einkauf-dryrun'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'einkauf-klaerung'), { recursive: true });
  const orders = {
    exportiertAm: '2026-09-22T10:00:00Z',
    orders: [{
      id: 'gid://shopify/Order/1', name: '#2001', createdAt: '2026-09-20T08:00:00Z', cancelledAt: null,
      displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [],
      lineItems: { nodes: [{
        id: 'gid://shopify/LineItem/1', sku: 'TEST-1', title: 'Testboden', variantTitle: 'Blau', quantity: 500,
        currentQuantity: 500, unfulfilledQuantity: 500, customAttributes: [],
        variant: {
          id: 'gid://shopify/ProductVariant/1', sku: 'TEST-1', title: 'Blau',
          metafields: { nodes: [{ namespace: 'einkauf', key: 'bestelleinheit', value: 'paket' }, { namespace: 'lieferant', key: 'a_artikelnummer', value: 'A-123' }] },
          product: { id: 'gid://shopify/Product/1', handle: 'testboden', title: 'Testboden', metafields: { nodes: [{ namespace: 'custom', key: 'qm_pro_paket', value: '2' }] }, grosshandel: { nodes: [] } },
        },
      }] },
    }],
    quellvarianten: [],
  };
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify(orders));
  const plan = [
    { gid: 'gid://shopify/ProductVariant/1', product_gid: 'gid://shopify/Product/1', handle: 'testboden', product_title: 'Testboden', variant_title: 'Blau', sku: 'TEST-1', gruppe: 'Rollenware', fields: {
      lieferant: { value: 'A', confidence: 'SICHER', source: 'lieferant.a_artikelnummer belegt' },
      artikelnummer: { value: 'A-123', confidence: 'SICHER', source: 'lieferant.a_artikelnummer' },
      bestelleinheit: { value: 'paket', confidence: 'SICHER', source: 'custom.qm_pro_paket' },
    } },
    { gid: 'gid://shopify/ProductVariant/2', product_gid: 'gid://shopify/Product/2', handle: 'offener-artikel', product_title: 'Offener Artikel', variant_title: 'Default Title', sku: null, grosshandel_sku: 'Lieferant B Muster 42', gruppe: 'Klebevinyl', fields: {
      lieferant: { value: null, confidence: 'UNKLAR', source: 'Lieferant nicht belegt' },
      artikelnummer: { value: null, confidence: 'UNKLAR', source: 'keine Artikelnummer' },
      bestelleinheit: { value: null, confidence: 'UNKLAR', source: 'Bestelleinheit fehlt' },
    } },
    { gid: 'gid://shopify/ProductVariant/3', product_gid: 'gid://shopify/Product/3', handle: 'nur-kollektion-offen', product_title: 'Nur Kollektion offen', variant_title: 'Default Title', sku: 'TEST-3', gruppe: 'Rollenware', fields: {
      lieferant: { value: 'A', confidence: 'SICHER', source: 'lieferant.a_artikelnummer belegt' },
      artikelnummer: { value: 'A-999', confidence: 'SICHER', source: 'lieferant.a_artikelnummer' },
      bestelleinheit: { value: 'paket', confidence: 'SICHER', source: 'custom.qm_pro_paket' },
      lieferant_kollektion: { value: null, confidence: 'UNKLAR', source: 'keine strukturierte Quelle' },
    } },
  ];
  fs.writeFileSync(path.join(dir, 'einkauf-dryrun', 'plan.json'), JSON.stringify(plan));
  const offen = [
    { gid: 'gid://shopify/ProductVariant/2', field: 'lieferant', reason: 'Lieferant nicht belegt', next_step: 'siehe Methodennotiz im Bericht' },
    { gid: 'gid://shopify/ProductVariant/2', field: 'artikelnummer', reason: 'keine Artikelnummer (Lieferant unklar)', next_step: 'siehe Methodennotiz im Bericht' },
    { gid: 'gid://shopify/ProductVariant/3', field: 'lieferant_kollektion', reason: 'keine strukturierte Quelle', next_step: 'siehe Methodennotiz im Bericht' },
  ];
  fs.writeFileSync(path.join(dir, 'einkauf-klaerung', 'offen.json'), JSON.stringify(offen));
  return dir;
}

test('einkaufBestellungen liest orders.json und liefert das Bestelluebersicht-Modell', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.einkaufBestellungen();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.auftraege.length, 1);
  assert.equal(r.zahlen.offeneAuftraege, 1);
});

test('einkaufBestellungen meldet fehlende Datei statt zu werfen', () => {
  const root = tmpRoot();
  const api = createApi({ gh: async () => '', root, privatDirPath: path.join(root, 'nirgends') });
  const r = api.einkaufBestellungen();
  assert.equal(r.verfuegbar, false);
  assert.match(r.hinweis, /orders\.json/);
});

test('einkaufProduktstatus fasst je PRODUKT zusammen (nicht je Variante/Feld) und paginiert', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.einkaufProduktstatus({ page: 1, pageSize: 10 });
  assert.equal(r.verfuegbar, true);
  assert.equal(r.gesamt.anzahl, 3);
  assert.equal(r.gesamt.vollstaendig, 1, 'Testboden hat keine offenen Felder');
  assert.equal(r.gesamt.handarbeit, 1, 'Offener Artikel braucht einen Menschen (Lieferant)');
  assert.equal(r.gesamt.automatisch, 1, 'Nur Kollektion offen fuellt sich automatisch, blockiert nichts');
  assert.equal(r.offen.count, 2);
  // Dringlichkeit: blockierendes Produkt zuerst
  assert.equal(r.offen.items[0].handle, 'offener-artikel');
  assert.equal(r.offen.items[0].status, 'handarbeit');
  assert.equal(r.offen.items[0].blockiertBestellung, true);
  const lieferantFeld = r.offen.items[0].offeneFelder.find(f => f.feld === 'lieferant');
  assert.ok(lieferantFeld);
  assert.equal(lieferantFeld.klartext, 'Lieferant');
  assert.equal(lieferantFeld.blockierend, true);
  // Kaskade: artikelnummer-Grund nennt "Lieferant unklar" und wird nicht doppelt gelistet
  assert.ok(!r.offen.items[0].offeneFelder.some(f => f.feld === 'artikelnummer'));

  const zweitesProdukt = r.offen.items[1];
  assert.equal(zweitesProdukt.handle, 'nur-kollektion-offen');
  assert.equal(zweitesProdukt.status, 'automatisch');
  assert.equal(zweitesProdukt.blockiertBestellung, false);
  assert.equal(zweitesProdukt.offeneFelder[0].feld, 'lieferant_kollektion');
  assert.equal(zweitesProdukt.offeneFelder[0].klartext, 'Kollektion');
  assert.match(zweitesProdukt.offeneFelder[0].naechsterSchritt, /automatisch/);
});

test('einkaufProduktstatus filtert nach Suche, Gruppe und Dringlichkeit (blockierend/handarbeit)', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  assert.equal(api.einkaufProduktstatus({ q: 'offener' }).offen.count, 1);
  assert.equal(api.einkaufProduktstatus({ q: 'nichts-passt' }).offen.count, 0);
  assert.equal(api.einkaufProduktstatus({ gruppe: 'Rollenware' }).offen.count, 1);
  assert.equal(api.einkaufProduktstatus({ gruppe: 'Klebevinyl' }).offen.count, 1);
  assert.equal(api.einkaufProduktstatus({ filter: 'blockierend' }).offen.count, 1);
  assert.equal(api.einkaufProduktstatus({ filter: 'blockierend' }).offen.items[0].handle, 'offener-artikel');
  assert.equal(api.einkaufProduktstatus({ filter: 'handarbeit' }).offen.count, 1);
  assert.equal(api.einkaufProduktstatus({}).offen.count, 2, 'ohne Filter: alle offenen Produkte');
});

test('einkaufProduktstatus meldet fehlendes offen.json statt nur plan.json zu nehmen', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-nur-plan');
  fs.mkdirSync(path.join(dir, 'einkauf-dryrun'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'einkauf-dryrun', 'plan.json'), JSON.stringify([]));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.einkaufProduktstatus();
  assert.equal(r.verfuegbar, false);
  assert.match(r.hinweis, /offen\.json/);
});

test('einkaufKlaerung meldet fehlende Exporte statt zu werfen', () => {
  const root = tmpRoot();
  const api = createApi({ gh: async () => '', root, privatDirPath: path.join(root, 'nirgends') });
  const r = api.einkaufKlaerung();
  assert.equal(r.verfuegbar, false);
});

/**
 * Fixture fuer die drei-Gruppen-Einstufung: blockierend (Lieferant/Artikelnummer
 * fehlt bei bestellbarer Variante), nachtragen (Farbnummer, procurement_id
 * innerhalb Rollenware) und strukturell offen - zaehlt nirgends (Wunschmaß-
 * Variante, Umrechnung, procurement_id ausserhalb Rollenware).
 */
function privatFixtureGruppen(root) {
  const dir = path.join(root, 'privat-gruppen');
  fs.mkdirSync(path.join(dir, 'einkauf-dryrun'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'einkauf-klaerung'), { recursive: true });
  const plan = [
    { gid: 'gid://shopify/ProductVariant/10', product_gid: 'gid://shopify/Product/10', handle: 'nur-farbnummer-offen', product_title: 'Nur Farbnummer offen', variant_title: 'Rot', sku: 'F-1', gruppe: 'Teppiche', fields: {} },
    { gid: 'gid://shopify/ProductVariant/11', product_gid: 'gid://shopify/Product/11', handle: 'wunschmass-lieferant-offen', product_title: 'Wunschmaß-Teppichboden', variant_title: 'Blau / Wunschmaß', sku: null, gruppe: 'Rollenware', fields: {} },
    { gid: 'gid://shopify/ProductVariant/12', product_gid: 'gid://shopify/Product/12', handle: 'nur-umrechnung-offen', product_title: 'Nur Umrechnung offen', variant_title: 'Default Title', sku: 'U-1', gruppe: 'Zubehoer', fields: {} },
    { gid: 'gid://shopify/ProductVariant/13', product_gid: 'gid://shopify/Product/13', handle: 'einkaufs-id-ausserhalb-rollenware', product_title: 'Einkaufs-ID außerhalb Rollenware', variant_title: 'Default Title', sku: 'P-1', gruppe: 'Zubehoer', fields: {} },
    { gid: 'gid://shopify/ProductVariant/14', product_gid: 'gid://shopify/Product/14', handle: 'einkaufs-id-in-rollenware', product_title: 'Einkaufs-ID in Rollenware', variant_title: 'Grün', sku: 'P-2', gruppe: 'Rollenware', fields: {} },
  ];
  fs.writeFileSync(path.join(dir, 'einkauf-dryrun', 'plan.json'), JSON.stringify(plan));
  const offen = [
    { gid: 'gid://shopify/ProductVariant/10', field: 'farbnummer', reason: 'Farbnummer nicht in Preisliste gefunden', next_step: '' },
    { gid: 'gid://shopify/ProductVariant/11', field: 'lieferant', reason: 'Lieferant unklar', next_step: '' },
    { gid: 'gid://shopify/ProductVariant/12', field: 'umrechnung', reason: 'kein JSON-Schema festgelegt', next_step: '' },
    { gid: 'gid://shopify/ProductVariant/13', field: 'procurement_id', reason: 'Format nur fuer Rollenware mit Breite definiert', next_step: '' },
    { gid: 'gid://shopify/ProductVariant/14', field: 'procurement_id', reason: 'Format nur fuer Rollenware mit Breite definiert', next_step: '' },
  ];
  fs.writeFileSync(path.join(dir, 'einkauf-klaerung', 'offen.json'), JSON.stringify(offen));
  return dir;
}

test('einkaufProduktstatus trennt blockierend / nachtragen / strukturell offen ehrlich', () => {
  const root = tmpRoot();
  const dir = privatFixtureGruppen(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.einkaufProduktstatus({ pageSize: 20 });
  assert.equal(r.gesamt.anzahl, 5);
  // Farbnummer allein blockiert nichts - Nachtragen, nicht Handarbeit.
  const farbnummer = r.offen.items.find(e => e.handle === 'nur-farbnummer-offen');
  assert.equal(farbnummer.status, 'automatisch');
  assert.equal(farbnummer.blockiertBestellung, false);
  assert.equal(farbnummer.offeneFelder[0].feld, 'farbnummer');
  assert.equal(farbnummer.offeneFelder[0].blockierend, false);
  // Wunschmaß-Variante: Lieferant fehlt zaehlt nicht - Masse/Artikelnummer entstehen erst beim Zuschnitt.
  assert.equal(r.offen.items.some(e => e.handle === 'wunschmass-lieferant-offen'), false);
  // Umrechnung ist nie definiert - zaehlt nirgends.
  assert.equal(r.offen.items.some(e => e.handle === 'nur-umrechnung-offen'), false);
  // procurement_id ausserhalb Rollenware ist strukturell nicht vorgesehen - zaehlt nirgends.
  assert.equal(r.offen.items.some(e => e.handle === 'einkaufs-id-ausserhalb-rollenware'), false);
  // procurement_id innerhalb Rollenware ist eine echte, nicht-blockierende Luecke.
  const procRoll = r.offen.items.find(e => e.handle === 'einkaufs-id-in-rollenware');
  assert.ok(procRoll);
  assert.equal(procRoll.status, 'automatisch');
  assert.equal(procRoll.offeneFelder[0].feld, 'procurement_id');
  // Nur die zwei echten Luecken bleiben als "offen" stehen; drei sind faktisch vollstaendig.
  assert.equal(r.gesamt.vollstaendig, 3);
  assert.equal(r.gesamt.handarbeit, 0);
  assert.equal(r.gesamt.automatisch, 2);
});

// ---------------------------------------------------------------------------
// Einkauf: Shop-Kennzahlen (Startseite "Heute")
// ---------------------------------------------------------------------------

test('einkaufKennzahlen meldet fehlenden Export mit Befehl statt erfundener Zahlen', () => {
  const root = tmpRoot();
  const api = createApi({ gh: async () => '', root, privatDirPath: path.join(root, 'nirgends') });
  const r = api.einkaufKennzahlen();
  assert.equal(r.verfuegbar, false);
  assert.ok(r.befehl);
});

test('einkaufKennzahlen liest kennzahlen/shop-snapshot.json', () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-kennzahlen-'));
  fs.mkdirSync(path.join(dir, 'kennzahlen'), { recursive: true });
  const snapshot = {
    erstellt: '2026-09-23T06:00:00.000Z',
    zeitraeume: {
      7: { bestellungen: 12, umsatz: 4321.5, waehrung: 'EUR', durchschnitt: 360.13 },
      30: { bestellungen: 48, umsatz: 15234.9, waehrung: 'EUR', durchschnitt: 317.39 },
    },
    topProdukte: [{ titel: 'Beispielteppich', anzahl: 5 }],
  };
  fs.writeFileSync(path.join(dir, 'kennzahlen', 'shop-snapshot.json'), JSON.stringify(snapshot));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.einkaufKennzahlen();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.zeitraeume['7'].bestellungen, 12);
  assert.equal(r.zeitraeume['30'].umsatz, 15234.9);
  assert.equal(r.topProdukte.length, 1);
});

// ---------------------------------------------------------------------------
// Einkauf: Auftragsfluss-Status (lokal, nie im Repository)
// ---------------------------------------------------------------------------

test('einkaufAuftragsstatus liefert leere Liste, wenn die Datei fehlt', () => {
  const root = tmpRoot();
  const api = createApi({ gh: async () => '', root, privatDirPath: path.join(root, 'nirgends') });
  const r = api.einkaufAuftragsstatus();
  assert.equal(r.verfuegbar, true);
  assert.deepEqual(r.positionen, {});
});

test('einkaufAuftragsstatusSetzen lehnt ohne angemeldeten gh-Nutzer ab', async () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat');
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  await assert.rejects(
    () => api.einkaufAuftragsstatusSetzen({ orderId: '1', lineItemId: '1', status: 'bestellt' }),
    e => e instanceof ApiError && e.status === 403,
  );
});

test('einkaufAuftragsstatusSetzen lehnt fehlende Pflichtangaben und unbekannten Status ab', async () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat');
  const { gh } = fakeGh({});
  const api = createApi({ gh, root, privatDirPath: dir });
  await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ status: 'bestellt' }), e => e instanceof ApiError && e.status === 400);
  await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ orderId: '1', lineItemId: '1', status: 'unsinn' }), e => e instanceof ApiError && e.status === 400);
});

test('einkaufBestellungen liest auch den Admin-API-Export {data:{orders:{nodes}}}', async () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-einkauf-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  const order = {
    id: 'gid://shopify/Order/1', name: '#1001', createdAt: '2026-09-01T10:00:00Z',
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [],
    lineItems: { nodes: [{ id: 'gid://shopify/LineItem/1', sku: 'ART-1', title: 'Testartikel', quantity: 1, customAttributes: [], variant: null }] },
  };
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ data: { orders: { nodes: [order] } } }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = await api.einkaufBestellungen();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.zahlen.auftraege, 1);
  assert.equal(r.zahlen.positionen, 1);
});

test('einkaufAuftragsstatusSetzen schreibt lokal und GET liest es danach', async () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat');
  const { gh } = fakeGh({});
  const now = () => new Date('2026-09-23T09:00:00Z');
  const api = createApi({ gh, root, privatDirPath: dir, now });
  const r = await api.einkaufAuftragsstatusSetzen({ orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1', status: 'bestellt', lieferantBestellnummer: 'LB-42' });
  assert.equal(r.ok, true);
  assert.equal(r.eintrag.status, 'bestellt');
  assert.equal(r.eintrag.aktualisiertVon, 'tobias');

  const liste = api.einkaufAuftragsstatus();
  const key = 'gid://shopify/Order/1::gid://shopify/LineItem/1';
  assert.equal(liste.positionen[key].status, 'bestellt');
  assert.equal(liste.positionen[key].lieferantBestellnummer, 'LB-42');
});

test('einkaufAuftragsstatusSetzen: wiederOeffnen macht "Ohne Einkauf abschließen" rückgängig und protokolliert', async () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat');
  const { gh } = fakeGh({});
  let jetzt = new Date('2026-09-23T09:00:00Z');
  const api = createApi({ gh, root, privatDirPath: dir, now: () => jetzt });
  const pos = { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1' };
  await api.einkaufAuftragsstatusSetzen({ ...pos, status: 'erledigt', notiz: 'Testbestellung' });
  jetzt = new Date('2026-09-24T10:00:00Z');
  const r = await api.einkaufAuftragsstatusSetzen({ ...pos, aktion: 'wiederOeffnen', notiz: 'doch echt' });
  assert.equal(r.ok, true);
  assert.equal(r.eintrag.status, null, 'ohne vorherigen Schritt wieder "noch nicht bestellt"');
  assert.equal(r.eintrag.wiederGeoeffnetVon, 'tobias');
  assert.equal(r.eintrag.wiederGeoeffnetAm, '2026-09-24T10:00:00.000Z');
  assert.equal(r.eintrag.verlauf.at(-1).abschlussGrund, 'Testbestellung');

  const key = `${pos.orderId}::${pos.lineItemId}`;
  assert.equal(api.einkaufAuftragsstatus().positionen[key].status, null);
  const audit = fs.readFileSync(path.join(root, '.router', 'control-center-audit.jsonl'), 'utf8');
  assert.match(audit, /auftragsstatus-wieder-geoeffnet/);
  const protokoll = fs.readFileSync(path.join(PRIVAT_DIR, 'protokoll.jsonl'), 'utf8');
  assert.match(protokoll, /Auftragsstatus wieder geöffnet/);

  // Nicht erledigte Position und unbekannte Aktion werden abgelehnt.
  await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ ...pos, aktion: 'wiederOeffnen' }), e => e instanceof ApiError && e.status === 400);
  await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ ...pos, aktion: 'loeschen' }), e => e instanceof ApiError && e.status === 400);
});

function lexikonFixture(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-lexikon-'));
  fs.mkdirSync(path.join(dir, 'lexikon'), { recursive: true });
  const produkte = [
    {
      handle: 'traum-teppich-grau', titel: 'Traum-Teppich Grau', shopUrl: 'https://www.teppich-paradies.net/products/traum-teppich-grau',
      adminUrl: 'https://admin.shopify.com/store/sjjyq1-6w/products/111', status: 'active', produktgruppe: 'Teppichboden',
      bild: 'https://cdn.example/bild1.jpg',
      eigenschaften: { material: 'Wolle', rollenbreite: '400', qmProPaket: '2.5' },
      muster: { vorhanden: true, handle: 'muster-traum-teppich-grau' },
      varianten: [
        { id: 'gid://shopify/ProductVariant/1', titel: 'Grau', sku: 'TT-GR-01', farbe: 'Grau', preis: 49.9, waehrung: 'EUR', verfuegbar: true,
          preisJeEinheit: { betrag: 19.96, einheit: 'm2' },
          einkauf: { lieferant: 'Lieferant A', artikelnummer: 'A-4711', farbnummer: '023', produktname: 'Traumteppich', url: 'https://lieferant-a.example/artikel/4711', kollektion: 'Trend', marke: 'Hausmarke von A', hersteller: null, bestelleinheit: 'paket', procurementId: 'p1' },
          link: { status: 'vorhanden', grund: null, suchlink: null } },
        { id: 'gid://shopify/ProductVariant/2', titel: 'Beige', sku: 'TT-BE-01', farbe: 'Beige', preis: 39.9, waehrung: 'EUR', verfuegbar: false,
          preisJeEinheit: { betrag: 15.96, einheit: 'm2' },
          einkauf: { lieferant: 'Lieferant A', artikelnummer: 'A-4712', farbnummer: '024', produktname: 'Traumteppich', url: 'https://lieferant-a.example/artikel/4712', kollektion: 'Trend', marke: 'Hausmarke von A', hersteller: null, bestelleinheit: 'paket', procurementId: 'p2' },
          link: { status: 'vorhanden', grund: null, suchlink: null } },
      ],
    },
    {
      handle: 'vinyl-clic-eiche', titel: 'Vinyl Clic Eiche', shopUrl: 'https://www.teppich-paradies.net/products/vinyl-clic-eiche',
      adminUrl: 'https://admin.shopify.com/store/sjjyq1-6w/products/222', status: 'active', produktgruppe: 'Vinylboden',
      bild: null, eigenschaften: {}, muster: { vorhanden: false, handle: null },
      varianten: [
        { id: 'gid://shopify/ProductVariant/3', titel: 'Eiche', sku: 'VC-EI-01', farbe: 'Eiche', preis: null, waehrung: null, verfuegbar: true,
          einkauf: { lieferant: 'Lieferant B', artikelnummer: 'B-9001', farbnummer: null, produktname: 'Clic Eiche', url: null, kollektion: 'Holzoptik', marke: null, hersteller: null, bestelleinheit: 'paket', procurementId: 'p3' },
          link: { status: 'fehlt', grund: 'Artikelnummer bei Lieferant B fehlt noch', suchlink: null } },
      ],
    },
    {
      handle: 'muster-traum-teppich-grau', titel: 'Muster Traum-Teppich Grau', shopUrl: 'https://www.teppich-paradies.net/products/muster-traum-teppich-grau',
      adminUrl: 'https://admin.shopify.com/store/sjjyq1-6w/products/333', status: 'active', produktgruppe: 'Muster',
      bild: null, eigenschaften: {}, muster: { vorhanden: true, handle: 'muster-traum-teppich-grau' },
      varianten: [
        { id: 'gid://shopify/ProductVariant/4', titel: 'Muster', sku: 'M-9099', farbe: null, preis: 4.9, waehrung: 'EUR', verfuegbar: true,
          einkauf: { lieferant: null, artikelnummer: null, farbnummer: null, produktname: null, url: null, kollektion: null, marke: null, hersteller: null, bestelleinheit: null, procurementId: null },
          original: { gefunden: true, quelle: 'sku', artikelnummer: 'A-4711', farbnummer: '023', lieferant: 'Lieferant A', url: 'https://lieferant-a.example/artikel/4711', kollektion: 'Trend', hersteller: null, produktTitel: 'Traum-Teppich Grau', produktHandle: 'traum-teppich-grau' } },
      ],
    },
  ];
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ erstellt: '2026-09-23T08:00:00Z', anzahl: produkte.length, produkte }));
  return dir;
}

test('lexikonListe meldet fehlende Datei mit Exportbefehl statt zu werfen', () => {
  const root = tmpRoot();
  const api = createApi({ gh: async () => '', root, privatDirPath: path.join(root, 'nirgends') });
  const r = api.lexikonListe({});
  assert.equal(r.verfuegbar, false);
  assert.equal(r.befehl, 'npm run lexikon:export');
});

test('lexikonListe liefert Trefferliste mit Bild, Produktgruppe und Farbanzahl', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonListe({});
  assert.equal(r.verfuegbar, true);
  assert.equal(r.anzahl, 3);
  assert.equal(r.treffer.count, 3);
  const grau = r.treffer.items.find(i => i.handle === 'traum-teppich-grau');
  assert.equal(grau.farbenAnzahl, 2);
  assert.equal(grau.produktgruppe, 'Teppichboden');
});

test('lexikonListe liefert Preis ab und Link-Zeichen in der Trefferliste', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonListe({});
  const grau = r.treffer.items.find(i => i.handle === 'traum-teppich-grau');
  assert.equal(grau.preisAb, 15.96);
  assert.equal(grau.preisEinheit, 'm2');
  assert.equal(grau.linkVorhanden, true, 'beide Varianten haben einen Link');

  const vinyl = r.treffer.items.find(i => i.handle === 'vinyl-clic-eiche');
  assert.equal(vinyl.linkVorhanden, false, 'Variante ohne Artikelnummer hat keinen Link');

  const muster = r.treffer.items.find(i => i.handle === 'muster-traum-teppich-grau');
  assert.equal(muster.linkVorhanden, true, 'Mustervariante hat ein gefundenes Original');
});

test('lexikonListe sucht ueber Produktname, Handle, SKU, Lieferanten-Artikelnummer, Farbe und Kollektion', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  assert.deepEqual(api.lexikonListe({ q: 'traum-teppich-grau' }).treffer.items.map(i => i.handle).sort(), ['muster-traum-teppich-grau', 'traum-teppich-grau']);
  assert.equal(api.lexikonListe({ q: 'vinyl-clic-eiche' }).treffer.count, 1);
  assert.equal(api.lexikonListe({ q: 'TT-BE-01' }).treffer.count, 1);
  assert.equal(api.lexikonListe({ q: 'A-4712' }).treffer.count, 1);
  assert.equal(api.lexikonListe({ q: 'Beige' }).treffer.count, 1);
  assert.equal(api.lexikonListe({ q: 'Holzoptik' }).treffer.count, 1);
  assert.equal(api.lexikonListe({ q: 'nichts-passt-hier' }).treffer.count, 0);
});

test('lexikonListe paginiert serverseitig', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonListe({ page: 1, pageSize: 1 });
  assert.equal(r.treffer.items.length, 1);
  assert.equal(r.treffer.pages, 3);
});

test('lexikonProdukt liefert das volle Produkt inkl. Varianten und Einkaufsdaten', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonProdukt('traum-teppich-grau');
  assert.equal(r.verfuegbar, true);
  assert.equal(r.produkt.varianten.length, 2);
  assert.equal(r.produkt.varianten[0].einkauf.artikelnummer, 'A-4711');
  assert.equal(r.produkt.muster.vorhanden, true);
});

test('lexikonProdukt meldet unbekanntes Handle statt zu werfen', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonProdukt('gibt-es-nicht');
  assert.equal(r.verfuegbar, false);
});

test('lexikonMengenhilfe rechnet Paketware ueber operations/lib/umrechnung.mjs', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonMengenhilfe({ handle: 'traum-teppich-grau', variantenId: 'gid://shopify/ProductVariant/1', kundenmengeM2: '6' });
  assert.equal(r.verfuegbar, true);
  assert.equal(r.ergebnis.pakete, 3); // ceil(6/2.5)
  assert.equal(r.ergebnis.qmGesamt, 7.5);
});

test('lexikonMengenhilfe meldet ehrlich UNGEKLAERT statt zu schaetzen, wenn eine Angabe fehlt', () => {
  const root = tmpRoot();
  const dir = lexikonFixture(root);
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.lexikonMengenhilfe({ handle: 'vinyl-clic-eiche', variantenId: 'gid://shopify/ProductVariant/3', kundenmengeM2: '10' });
  assert.equal(r.verfuegbar, true);
  assert.equal(r.ergebnis, null);
  assert.match(r.grund, /m² pro Paket.*nicht hinterlegt/);
});

// ---------------------------------------------------------------------------
// Datenstand: aktualisierung.json (operations/scripts/aktualisieren.mjs)
// ---------------------------------------------------------------------------

test('aktualisierung meldet fehlende Datei mit Befehl statt erfundenem Stand', () => {
  const root = tmpRoot();
  const api = createApi({ gh: async () => '', root, privatDirPath: path.join(root, 'nirgends') });
  const r = api.aktualisierung();
  assert.equal(r.verfuegbar, false);
  assert.ok(r.befehl.includes('daten:aktualisieren'));
});

test('aktualisierung berechnet Alter und Veraltet-Flag je Teil (Schwelle 24h)', () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisierung-'));
  const jetzt = new Date('2026-09-23T12:00:00.000Z');
  const frisch = new Date(jetzt.getTime() - 2 * 60 * 60 * 1000).toISOString(); // vor 2h
  const alt = new Date(jetzt.getTime() - 30 * 60 * 60 * 1000).toISOString(); // vor 30h
  fs.writeFileSync(path.join(dir, 'aktualisierung.json'), JSON.stringify({
    aktualisiertAm: frisch,
    teile: {
      lexikon: { zeitpunkt: frisch, dauerMs: 1200, erfolg: true, anzahl: 50, meldung: null },
      bestellungen: { zeitpunkt: alt, dauerMs: 900, erfolg: true, anzahl: 50, meldung: null },
      kennzahlen: { zeitpunkt: frisch, dauerMs: 300, erfolg: false, anzahl: null, meldung: 'Kein Zugang in .env.local' },
    },
  }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir, now: () => jetzt });
  const r = api.aktualisierung();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.teile.lexikon.veraltet, false);
  assert.equal(r.teile.bestellungen.veraltet, true);
  assert.equal(r.teile.kennzahlen.erfolg, false);
  assert.equal(r.teile.kennzahlen.meldung, 'Kein Zugang in .env.local');
});

test('aktualisierung: fehlender Zeitpunkt eines Teils liefert veraltet=null statt zu werfen', () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisierung-'));
  fs.writeFileSync(path.join(dir, 'aktualisierung.json'), JSON.stringify({ aktualisiertAm: null, teile: { lexikon: { erfolg: false, meldung: 'x' } } }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.aktualisierung();
  assert.equal(r.teile.lexikon.veraltet, null);
});

// ---------------------------------------------------------------------------
// Knopf "Jetzt aktualisieren" (aktualisierungStarten/aktualisierungStatus)
// ---------------------------------------------------------------------------

/** Legt unter root/operations/scripts/aktualisieren.mjs ein Fake-Skript ab, das
 * kurz "laeuft" (setTimeout) und dann eine eigene aktualisierung.json schreibt -
 * ohne echten Shopify-Zugang, aber mit demselben Vertrag wie das echte Skript. */
function fakeAktualisierenSkript(root, privatDir, { verzoegerungMs = 150, wirftFehler = false } = {}) {
  const dir = path.join(root, 'operations', 'scripts');
  fs.mkdirSync(dir, { recursive: true });
  const datei = path.join(dir, 'aktualisieren.mjs');
  fs.writeFileSync(datei, `
    import fs from 'node:fs';
    setTimeout(() => {
      ${wirftFehler ? "throw new Error('absichtlicher Testfehler');" : `
      fs.mkdirSync(${JSON.stringify(privatDir)}, { recursive: true });
      fs.writeFileSync(${JSON.stringify(path.join(privatDir, 'aktualisierung.json'))}, JSON.stringify({
        aktualisiertAm: new Date().toISOString(),
        teile: { lexikon: { zeitpunkt: new Date().toISOString(), dauerMs: 5, erfolg: true, anzahl: 3, meldung: null } },
      }));`}
    }, ${verzoegerungMs});
  `);
  return datei;
}

test('aktualisierungStarten: startet den Kindprozess und meldet gestartet:true', async () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisierung-'));
  fakeAktualisierenSkript(root, dir, { verzoegerungMs: 100 });
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.aktualisierungStarten();
  assert.equal(r.gestartet, true);
  assert.equal(r.laeuft, true);
  assert.ok(r.seit);
});

test('aktualisierungStarten: zweiter Aufruf waehrend eines Laufs startet nichts neu ("laeuft bereits")', async () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisierung-'));
  fakeAktualisierenSkript(root, dir, { verzoegerungMs: 300 });
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const erster = api.aktualisierungStarten();
  assert.equal(erster.gestartet, true);
  const zweiter = api.aktualisierungStarten();
  assert.equal(zweiter.gestartet, false);
  assert.equal(zweiter.laeuft, true);
  assert.equal(zweiter.seit, erster.seit);
});

test('aktualisierungStatus: laeuft waehrend des Laufs, danach fertig mit neuem Stand', async () => {
  const root = tmpRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisierung-'));
  fakeAktualisierenSkript(root, dir, { verzoegerungMs: 150 });
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const vorher = api.aktualisierungStatus();
  assert.equal(vorher.laeuft, false);
  api.aktualisierungStarten();
  const waehrend = api.aktualisierungStatus();
  assert.equal(waehrend.laeuft, true);
  await new Promise(r => setTimeout(r, 500));
  const danach = api.aktualisierungStatus();
  assert.equal(danach.laeuft, false);
  assert.equal(danach.verfuegbar, true);
  assert.equal(danach.teile.lexikon.erfolg, true);
  assert.equal(danach.teile.lexikon.anzahl, 3);
});

test('kundenSuche ergaenzt fehlende Telefonnummern aus dem Kundenstamm', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  // Die Bestellung der Fixture traegt keine Telefonnummer; der Kundenstamm schon.
  fs.mkdirSync(path.join(dir, 'kunden'), { recursive: true });
  const kundeName = api0KundenName(createApi({ gh: async () => '', root, privatDirPath: dir }));
  fs.writeFileSync(path.join(dir, 'kunden', 'kunden.json'), JSON.stringify({
    erstellt: '2026-09-24T10:00:00Z', anzahl: 1,
    kunden: [{ name: kundeName, email: null, telefon: '+4930999888', telefonQuelle: 'lieferadresse' }],
  }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const treffer = api.kundenSuche({ filter: 'alle' }).treffer;
  const mitTelefon = treffer.find(t => t.name === kundeName);
  assert.equal(mitTelefon.telefon, '+4930999888');
  assert.equal(mitTelefon.telefonQuelle, 'lieferadresse');
});

/** Name, unter dem die Fixture-Bestellung gefuehrt wird - der Stamm muss darauf passen. */
function api0KundenName(api) {
  const t = api.kundenSuche({ filter: 'alle' }).treffer;
  return t[0]?.name;
}

test('kundenSuche zeigt auch Shopify-Kunden ohne Bestellung in dieser Datei', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  fs.mkdirSync(path.join(dir, 'kunden'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'kunden', 'kunden.json'), JSON.stringify({
    erstellt: '2026-09-24T10:00:00Z', anzahl: 1,
    kunden: [{
      name: 'Erika Musterfrau', email: 'erika@example.test', telefon: '+4930111222',
      telefonQuelle: 'lieferadresse', anzahlBestellungen: 0, gesamtumsatz: 0, waehrung: 'EUR',
      anschrift: { ort: 'Oranienburg' },
    }],
  }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const treffer = api.kundenSuche({ filter: 'alle' }).treffer;
  const neu = treffer.find(t => t.name === 'Erika Musterfrau');
  assert.ok(neu, 'Kunde ohne Bestellung fehlt in der Liste');
  assert.equal(neu.nurStammdaten, true);
  assert.equal(neu.telefon, '+4930111222');
  // Freitextsuche erfasst ihn ebenfalls
  assert.ok(api.kundenSuche({ q: 'erika', filter: 'alle' }).treffer.some(t => t.name === 'Erika Musterfrau'));
});

test('kundenDetail zeigt auch einen Kunden ohne Bestellung in dieser Datei', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  fs.mkdirSync(path.join(dir, 'kunden'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'kunden', 'kunden.json'), JSON.stringify({
    erstellt: '2026-09-24T10:00:00Z', anzahl: 1,
    kunden: [{
      name: 'Erika Musterfrau', email: 'erika@example.test', telefon: '+4930111222',
      anzahlBestellungen: 2, gesamtumsatz: 250, waehrung: 'EUR',
      anschrift: { name: 'Erika Musterfrau', strasse: 'Musterweg 1', plz: '16515', ort: 'Oranienburg', land: 'DE', telefon: null },
    }],
  }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.kundenDetail({ key: 'email:erika@example.test' });
  assert.equal(r.verfuegbar, true);
  assert.equal(r.nurStammdaten, true);
  assert.equal(r.kunde.kunde.name, 'Erika Musterfrau');
  assert.equal(r.kunde.lieferadresse.ort, 'Oranienburg');
  assert.match(r.kunde.hinweis, /ausserhalb der hier exportierten Daten/);
  // Unbekannter Schluessel bleibt eine ehrliche Fehlanzeige
  assert.equal(api.kundenDetail({ key: 'email:gibtsnicht@example.test' }).verfuegbar, false);
});

test('shopwacheStatus liest das Pruefergebnis und meldet sonst ehrlich nichts', () => {
  const root = tmpRoot();
  const dir = privatFixture(root);
  const api0 = createApi({ gh: async () => '', root, privatDirPath: dir });
  assert.equal(api0.shopwacheStatus().verfuegbar, false);

  fs.mkdirSync(path.join(dir, 'shopwache'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'shopwache', 'status.json'), JSON.stringify({
    geprueftAm: '2026-09-24T12:00:00Z', basis: 'https://shop.example', ampel: 'gelb',
    kritisch: 0, warnungen: 1, seiten: [], preise: [], befunde: [{ art: 'warnung', titel: 'Suche laedt langsam', text: '3.4 s' }],
  }));
  const api = createApi({ gh: async () => '', root, privatDirPath: dir });
  const r = api.shopwacheStatus();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.ampel, 'gelb');
  assert.equal(r.befunde.length, 1);
});

// -- Aufgaben & Organisation: Rechte serverseitig --------------------------

function orgApi(root, dir) {
  return createApi({ gh: async () => '', root, privatDirPath: dir });
}

test('persönliche Notizen erreichen die API eines anderen Benutzers nicht', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-org');
  const ahmet = { kuerzel: 'ahmet', name: 'Ahmet', rolle: 'inhaber' };
  const ben = { kuerzel: 'ben', name: 'Ben', rolle: 'mitarbeiter' };

  const api = orgApi(root, dir);
  api.orgNeu({ typ: 'NOTE', titel: 'Private Preisidee', sichtbarkeit: 'PRIVAT' }, { benutzer: ahmet });
  api.orgNeu({ typ: 'NOTE', titel: 'Musterrollen hinten links', sichtbarkeit: 'TEAM' }, { benutzer: ahmet });

  // Ben sieht nur die Team-Notiz - in JEDER Liste, auch in der Suche
  const teamNotizen = api.orgListe({ bereich: 'team-notizen', benutzer: ben });
  assert.deepEqual(teamNotizen.eintraege.map(e => e.titel), ['Musterrollen hinten links']);
  const suche = api.orgListe({ bereich: 'archiv', q: 'preisidee', benutzer: ben });
  assert.equal(suche.eintraege.length, 0);
  const eigene = api.orgListe({ bereich: 'meine-notizen', benutzer: ben });
  assert.equal(eigene.eintraege.length, 0);

  // Ahmet sieht seine eigene
  assert.equal(api.orgListe({ bereich: 'meine-notizen', benutzer: ahmet }).eintraege.length, 1);
});

test('fremde Einträge lassen sich nicht über die ID öffnen oder ändern', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-org2');
  const ahmet = { kuerzel: 'ahmet', rolle: 'inhaber' };
  const ben = { kuerzel: 'ben', rolle: 'mitarbeiter' };
  const api = orgApi(root, dir);
  const { eintrag } = api.orgNeu({ typ: 'NOTE', titel: 'Geheim', sichtbarkeit: 'PRIVAT' }, { benutzer: ahmet });

  assert.equal(api.orgEintrag({ id: eintrag.id, benutzer: ben }).verfuegbar, false);
  assert.throws(() => api.orgAendern({ id: eintrag.id, felder: { titel: 'gekapert' } }, { benutzer: ben }), /Berechtigung/);
  assert.throws(() => api.orgKommentar({ id: eintrag.id, text: 'hallo' }, { benutzer: ben }), /Berechtigung/);
});

test('Mitarbeiter darf eigene zugewiesene Aufgabe ändern, fremde nicht', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-org3');
  const chef = { kuerzel: 'ahmet', rolle: 'inhaber' };
  const ben = { kuerzel: 'ben', rolle: 'mitarbeiter' };
  const api = orgApi(root, dir);
  const meins = api.orgNeu({ titel: 'Muster prüfen', verantwortlich: 'ben' }, { benutzer: chef }).eintrag;
  const fremd = api.orgNeu({ titel: 'Buchhaltung', verantwortlich: 'thomas' }, { benutzer: chef }).eintrag;

  assert.equal(api.orgAendern({ id: meins.id, felder: { status: 'IN_PROGRESS' } }, { benutzer: ben }).ok, true);
  assert.throws(() => api.orgAendern({ id: fremd.id, felder: { status: 'DONE' } }, { benutzer: ben }), /Berechtigung/);
});

test('Analyse schlägt vor und meldet Doppelgänger, ohne zu speichern', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-org4');
  const ahmet = { kuerzel: 'ahmet', rolle: 'inhaber' };
  const api = orgApi(root, dir);
  api.orgNeu({ titel: 'Neues Logo in Shopify einbauen' }, { benutzer: ahmet });

  const a = api.orgAnalyse({ text: 'Shop Logo austauschen', benutzer: ahmet });
  assert.equal(a.vorschlag.typ, 'TASK');
  assert.equal(a.doppelgaenger.length, 1);
  assert.match(a.doppelgaenger[0].titel, /Logo/);
  // nichts gespeichert
  assert.equal(api.orgListe({ bereich: 'team-aufgaben', ansicht: 'alle', benutzer: ahmet }).anzahl, 1);
});

test('Kennzahlen zählen nur, was der Benutzer sehen darf', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-org5');
  const ahmet = { kuerzel: 'ahmet', rolle: 'inhaber' };
  const ben = { kuerzel: 'ben', rolle: 'mitarbeiter' };
  const api = orgApi(root, dir);
  api.orgNeu({ titel: 'Für Ben', verantwortlich: 'ben', prioritaet: 'URGENT' }, { benutzer: ahmet });
  api.orgNeu({ titel: 'Für Ahmet', verantwortlich: 'ahmet', prioritaet: 'URGENT' }, { benutzer: ahmet });

  const k = api.orgKennzahlen({ benutzer: ben });
  assert.equal(k.meine.offen, 1, 'Ben sieht eine eigene Aufgabe');
  assert.equal(k.team.offen, 2, 'Team-Aufgaben sind für alle sichtbar');
});

test('"Meine Aufgaben" zeigt nur Zugewiesenes - Unzugewiesenes bleibt im Team', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'privat-org6');
  const ich = { kuerzel: 'tristan', rolle: 'inhaber' };
  const api = orgApi(root, dir);
  api.orgNeu({ titel: 'Dashboard-Skript anpassen', verantwortlich: 'tristan', prioritaet: 'HIGH' }, { benutzer: ich });
  api.orgNeu({ titel: 'Muster beim Lieferanten bestellen' }, { benutzer: ich });   // ohne Namen

  const meine = api.orgListe({ bereich: 'meine-aufgaben', ansicht: 'fokus', benutzer: ich });
  assert.deepEqual(meine.eintraege.map(e => e.titel), ['Dashboard-Skript anpassen']);

  const team = api.orgListe({ bereich: 'team-aufgaben', ansicht: 'alle', person: 'unzugewiesen', benutzer: ich });
  assert.deepEqual(team.eintraege.map(e => e.titel), ['Muster beim Lieferanten bestellen']);

  assert.equal(api.orgKennzahlen({ benutzer: ich }).meine.offen, 1);

  // Technik ohne Namen darf nicht zwischen den Listen verschwinden: das Team
  // sieht sie nicht, also muss sie bei dem stehen, der die Technik macht.
  api.orgNeu({ titel: 'Produktseite reparieren', bereich: 'Online-Shop' }, { benutzer: ich });
  const nachher = api.orgListe({ bereich: 'meine-aufgaben', ansicht: 'offen', benutzer: ich });
  assert.ok(nachher.eintraege.some(e => e.titel === 'Produktseite reparieren'));
  const team2 = api.orgListe({ bereich: 'team-aufgaben', ansicht: 'offen', gruppe: '', benutzer: ich });
  assert.equal(team2.eintraege.some(e => e.titel === 'Produktseite reparieren'), false);
});
