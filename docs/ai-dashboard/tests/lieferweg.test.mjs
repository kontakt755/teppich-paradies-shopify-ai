// Lieferweg und "Von uns abschicken" (#1995) - nur erfundene Testdaten (TEST-LAGER-1 ...).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIEFERWEG_WORT, lagerRegelFuer, lieferwegVon, istLagerware, selbstStand, selbstStandText, wegeImAuftrag, lieferwegKurz } from '../lib/lieferweg.mjs';
import { lieferwegPlakette, lieferwegeAuftrag } from '../bausteine/lieferweg.mjs';
import { selbstAbschickenStand, vonSelbstAbschickenGedeckt } from '../ansichten/heute/selbst-abschicken.mjs';
import { leiteTodosAb, werWartet } from '../lib/todos.mjs';
import { einordnung, auftragsAblauf } from '../lib/auftrags-ablauf.mjs';
import { lieferantenKarten } from '../lib/einkauf-lieferanten.mjs';

const unterlage = (extra = {}) => ({ lineItemId: 'l1', titel: 'Testunterlage', sku: 'TEST-LAGER-1', route: 'SUPPLIER_TO_TP', lieferant: 'lieferant-a', ...extra });
const ware = (extra = {}) => ({ lineItemId: 'w1', titel: 'Testboden', sku: 'TEST-WARE-1', route: 'SUPPLIER_TO_TP', lieferant: 'lieferant-a', ...extra });
const REGELN = [{ skuPraefix: 'test-lager', hinweis: 'Rolle im Lager' }];

test('Reihenfolge: Vermerk beim Bestellen > Lagerware > Stammroute; Muster und Eigenleistung ohne Weg', () => {
  assert.deepEqual(lieferwegVon(ware()), { weg: 'uns', wort: 'über uns', belegt: false }, 'nur Stammroute: nicht vermerkt');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_DIRECT' })).weg, 'hersteller');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_TO_SITE' })).weg, 'baustelle');
  assert.equal(lieferwegVon(ware({ route: 'OWN_STOCK' })).weg, 'lager');
  assert.deepEqual(lieferwegVon(unterlage({ lagerware: true })), { weg: 'lager', wort: 'aus Lager', belegt: true }, 'Regeldatei schlaegt die Route');
  assert.equal(lieferwegVon(unterlage(), null, { regeln: REGELN }).weg, 'lager', 'Server: Regel ohne Markierung, Gross-/Kleinschreibung egal');
  assert.equal(lieferwegVon(unterlage({ lagerware: true }), { ueber: 'kunde' }).weg, 'hersteller', 'Vermerk schlaegt die Regeldatei');
  assert.equal(lieferwegVon(ware(), { ueber: 'kettler' }).wort, 'über Kettler');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_DIRECT' }), { ueber: 'laden' }).weg, 'uns');
  assert.equal(lieferwegVon(ware(), { ueber: 'lager' }).weg, 'lager');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_TO_SITE' }), { ueber: 'kunde' }).weg, 'baustelle', '"direkt" auf die Baustelle bleibt Baustelle');
  assert.equal(lieferwegVon(ware({ istMuster: true })), null);
  assert.equal(lieferwegVon(ware({ eigenleistung: true })), null);
  assert.deepEqual(Object.values(LIEFERWEG_WORT), ['Hersteller → Kunde', 'Hersteller → Baustelle', 'über uns', 'über Kettler', 'aus Lager']);
  assert.equal(lagerRegelFuer('TEST-LAGER-9', REGELN)?.hinweis, 'Rolle im Lager');
  assert.equal(lagerRegelFuer('TEST-WARE-1', REGELN), null);
  assert.equal(lagerRegelFuer('', [{ skuPraefix: '' }]), null, 'leerer Praefix passt nie');
  assert.equal(istLagerware(ware({ istMuster: true, lagerware: true })), false, 'Muster sind nie Lagerware');
});

test('selbstStand: zuschneiden -> packen -> versand, raus beendet; Hersteller-Direktware nie', () => {
  const p = unterlage({ lagerware: true });
  assert.equal(selbstStand(p, null), 'zuschneiden');
  assert.equal(selbstStand(p, { status: 'bestellt' }), 'zuschneiden', 'Altfall wie #1119: ohne Vermerk auf "bestellt"');
  assert.equal(selbstStand(p, { status: 'geliefert', ueber: 'lager', selbstversand: { zugeschnitten: { am: 'x' } } }), 'packen');
  assert.equal(selbstStand(p, { status: 'geliefert', selbstversand: { zugeschnitten: { am: 'x' }, gepackt: { am: 'y' } } }), 'versand');
  assert.equal(selbstStand(p, { status: 'raus' }), null);
  assert.equal(selbstStand(ware(), { status: 'geliefert' }), 'packen', 'eingetroffen über uns');
  assert.equal(selbstStand(ware(), { status: 'bestellt' }), null, 'noch unterwegs zu uns');
  assert.equal(selbstStand(ware(), { status: 'bestellt', ueber: 'kunde' }), null, 'Hersteller schickt');
  assert.equal(selbstStandText('packen', 'lager'), 'zugeschnitten – noch packen');
  assert.equal(selbstStandText('packen', 'uns'), 'eingetroffen – noch packen');
  assert.equal(selbstStandText('versand', 'lager'), 'gepackt – wartet auf Versand');
});

test('gemischte Auftraege: #1119 (Direktware + Lagerware), #1104 (Lagerware geliefert + Wunschmass), #1078 (Direktware)', () => {
  const eintraege = { l1: { status: 'bestellt' }, w1: { status: 'bestellt', ueber: 'kunde' } };
  const a1119 = [unterlage({ lagerware: true }), ware()];
  assert.equal(lieferwegKurz(a1119, p => eintraege[p.lineItemId]), '1 × Hersteller → Kunde · 1 × aus Lager');
  const html = lieferwegeAuftrag(a1119, p => eintraege[p.lineItemId]);
  assert.match(html, /1 × Hersteller → Kunde/); assert.match(html, /1 × aus Lager/);
  assert.doesNotMatch(html, /unbelegt/, 'beide Wege sind belegt');
  const a1104 = [unterlage({ lagerware: true }), ware({ lineItemId: 'w2' }), ware({ lineItemId: 'k1', eigenleistung: true })];
  const e1104 = { l1: { status: 'geliefert', ueber: 'lager' }, w2: { status: 'bestellt' } };
  assert.deepEqual(wegeImAuftrag(a1104, p => e1104[p.lineItemId]).map(w => [w.weg, w.anzahl, w.belegt]), [['uns', 1, false], ['lager', 1, true]], 'Kettelservice reist nicht');
  assert.equal(selbstStand(a1104[0], e1104.l1), 'packen', 'muss von uns raus');
  // Ein einziger Weg: keine Zahl vor dem Wort.
  assert.equal(lieferwegeAuftrag([ware()], () => ({ ueber: 'kunde' })).includes('×'), false);
  assert.match(lieferwegPlakette(lieferwegVon(ware())), /class="lieferweg unbelegt"[^>]*title="Lieferweg: über uns – nicht vermerkt – aus den Stammdaten"/);
});

test('#1078: Hersteller-Direktware wird "Je Auftrag" nie "Ist eingetroffen" - Lagerware kein Grund "Kunde informieren"', () => {
  const pos = (p, orderId = 'o1') => ({ ...p, orderId });
  const d = { gruppen: [{ lieferant: 'lieferant-a', positionen: [pos(unterlage({ lagerware: true })), pos(ware())] }] };
  const stand = { l1: { status: 'geliefert', ueber: 'lager', selbstversand: { zugeschnitten: { am: '2026-11-06T08:00:00Z' } } }, w1: { status: 'bestellt', ueber: 'kunde' } };
  const ab = auftragsAblauf({ id: 'o1' }, d, p => stand[p.lineItemId] || null);
  assert.deepEqual(ab.selbst.map(x => [x.pos.lineItemId, x.selbst]), [['l1', 'packen']]);
  const e = einordnung(ab, null, new Date('2026-11-06T12:00:00Z'));
  assert.ok(e.gruende.includes('selbst'), 'von uns abschicken');
  assert.ok(!e.gruende.includes('informieren'), 'Lagerware braucht keinen Termin');
});

test('To-dos: Lagerware nie "bestellen", "Nachhaken" oder "kein Beleg"; "Ware ist da" traegt ihre Schluessel', () => {
  const jetzt = new Date('2026-11-20T12:00:00Z');
  const zeile = (positionen, extra = {}) => ({ orderId: 'gid://test/Order/1', orderName: '#TEST-1', kundenname: 'Testkunde', datum: '2026-11-01T09:00:00Z',
    zahlungsstatus: 'PAID', offen: true, auftrag: { id: 'gid://test/Order/1', positionen, ampel: 'gruen' }, ...extra });
  const quellen = statusAlle => ({ bestellzeilen: [zeile([unterlage({ lagerware: true })])], statusAlle });
  const todos = statusAlle => leiteTodosAb(quellen(statusAlle), { sicht: 'alles', alle: true, jetzt });
  assert.equal(todos({}).filter(t => ['ware_bestellen', 'bestellen'].includes(t.art)).length, 0, 'nie beim Lieferanten bestellen');
  const alt = todos({ 'gid://test/Order/1::l1': { status: 'bestellt', bestelltAm: '2026-11-01T09:00:00Z' } });
  assert.equal(alt.filter(t => /nachhaken|bestaetigung|lieferschein/i.test(`${t.art} ${t.titel}`)).length, 0, 'Altfall "bestellt": kein Nachhaken, kein Beleg');
  const w = werWartet(quellen({}), { jetzt });
  assert.deepEqual(w.wir.map(x => x.schritt), ['Aus eigenem Lager zuschneiden']);
  const da = todos({ 'gid://test/Order/1::l1': { status: 'geliefert', geliefertAm: '2026-11-10T09:00:00Z', ueber: 'lager' } }).find(t => t.art === 'rausgeben');
  assert.deepEqual(da?.schluessel, ['gid://test/Order/1::l1']);
});

test('Heute-Zaehler: Lagerware (leer/bestellt/geliefert) und eingetroffene Ware über uns; Test, Muster, Direktware und raus nicht', () => {
  const zeile = (orderId, positionen, positionsstatus, extra = {}) => ({ orderId, orderName: orderId, kundenname: 'Testkunde', offen: true, datum: '2026-11-01T09:00:00Z',
    positionsstatus, auftrag: { positionen }, ...extra });
  const daten = { verfuegbar: true, zeilen: [
    zeile('o1', [unterlage({ lagerware: true }), ware()], { l1: null, w1: { status: 'bestellt', ueber: 'kunde' } }),
    zeile('o2', [ware(), ware({ lineItemId: 'm1', istMuster: true })], { w1: { status: 'geliefert', geliefertAm: '2026-11-04T09:00:00Z' }, m1: { status: 'geliefert' } }),
    zeile('o3', [unterlage({ lagerware: true })], { l1: { status: 'raus' } }),
    zeile('o4', [unterlage({ lagerware: true })], { l1: null }, { testbestellung: true }),
    zeile('o5', [unterlage({ lagerware: true })], { l1: { status: 'bestellt' } }),
  ] };
  const stand = selbstAbschickenStand({ daten, jetzt: new Date('2026-11-06T12:00:00Z') });
  assert.deepEqual(stand.zeilen.map(x => [x.key, x.stand]).sort(), [['o1::l1', 'zuschneiden'], ['o2::w1', 'packen'], ['o5::l1', 'zuschneiden']]);
  // Frist "Ware liegt bei uns" (2/5 Tage): o1 seit 5 Tagen rot, o2 seit 2 Tagen gelb.
  assert.deepEqual(Object.fromEntries(stand.zeilen.map(x => [x.key, x.ton])), { 'o1::l1': 'crit', 'o5::l1': 'crit', 'o2::w1': 'warn' });
  assert.equal(vonSelbstAbschickenGedeckt({ art: 'rausgeben', schluessel: ['o2::w1'] }, stand), true);
  assert.equal(vonSelbstAbschickenGedeckt({ art: 'rausgeben', schluessel: ['o2::w1', 'o2::x9'] }, stand), false, 'nur ganz gedeckte To-dos fallen weg');
  assert.equal(vonSelbstAbschickenGedeckt({ art: 'bestellen', schluessel: ['o2::w1'] }, stand), false);
  assert.equal(selbstAbschickenStand({ daten: null }).verfuegbar, false);
});

test('Lieferantenkarte: Lagerware steht unter "aus eigenem Lager", nie unter "zu bestellen" oder "nachfassen"', () => {
  const pos = p => ({ ...p, orderId: 'o1' });
  const gruppen = [{ lieferant: 'lieferant-a', positionen: [pos(unterlage({ lagerware: true })), pos(ware())] }];
  const stand = { l1: { status: 'bestellt', bestelltAm: '2026-10-01T08:00:00Z' } };
  const [k] = lieferantenKarten({ gruppen, eintragFuer: p => stand[p.lineItemId] || null, jetzt: Date.parse('2026-11-06T12:00:00Z') });
  assert.deepEqual(k.ware.eigen.map(x => x.pos.lineItemId), ['l1']);
  assert.deepEqual(k.ware.zuBestellen.map(x => x.pos.lineItemId), ['w1']);
  assert.equal(k.ware.bestellt.length, 0, 'Altfall "bestellt" ist kein Nachfassen');
  assert.equal(k.ueberfaellig.anzahl, 0);
  assert.equal(k.offenGesamt, 2, 'zaehlt trotzdem als offen');
});
