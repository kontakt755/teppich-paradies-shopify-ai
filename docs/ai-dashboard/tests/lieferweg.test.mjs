// Lieferweg und "Von uns abschicken" (#1995) - nur erfundene Testdaten (TEST-LAGER-1 ...).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIEFERWEG_WORT, lagerRegelFuer, lieferwegVon, istLagerware, selbstStand, selbstStandText, wegeImAuftrag, lieferwegKurz } from '../lib/lieferweg.mjs';
import { lieferwegPlakette, lieferwegeAuftrag } from '../bausteine/lieferweg.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { selbstAbschickenStand } from '../ansichten/heute/selbst-abschicken.mjs';
import { leiteTodosAb, werWartet, rausgebenOhne } from '../lib/todos.mjs';
import { vorauswahl } from '../lib/versand.mjs';
import { einordnung, auftragsAblauf } from '../lib/auftrags-ablauf.mjs';
import { lieferantenKarten } from '../lib/einkauf-lieferanten.mjs';

const unterlage = (extra = {}) => ({ lineItemId: 'l1', titel: 'Testunterlage', sku: 'TEST-LAGER-1', route: 'SUPPLIER_TO_TP', lieferant: 'lieferant-a', ...extra });
const ware = (extra = {}) => ({ lineItemId: 'w1', titel: 'Testboden', sku: 'TEST-WARE-1', route: 'SUPPLIER_TO_TP', lieferant: 'lieferant-a', ...extra });
const REGELN = [{ skuPraefix: 'test-lager', hinweis: 'Rolle im Lager' }];

test('Reihenfolge: Vermerk beim Bestellen > Lagerware > Stammroute; Muster und Eigenleistung ohne Weg', () => {
  assert.deepEqual(lieferwegVon(ware()), { weg: 'uns', wort: 'über uns', belegt: false }, 'nur Stammroute: nicht vermerkt');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_DIRECT' })).weg, 'hersteller');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_TO_SITE' })).weg, 'baustelle');
  // OWN_STOCK bestellt routeFor beim Lieferanten (kein Bestand gefuehrt) - kein Lieferweg "aus Lager" (G3).
  assert.deepEqual(lieferwegVon(ware({ route: 'OWN_STOCK' })), { weg: 'uns', wort: 'über uns', belegt: false });
  assert.deepEqual(lieferwegVon(unterlage({ lagerware: true })), { weg: 'lager', wort: 'aus Lager', belegt: true }, 'Regeldatei schlaegt die Route');
  assert.equal(lieferwegVon(unterlage(), null, { regeln: REGELN }).weg, 'lager', 'Server: Regel ohne Markierung, Gross-/Kleinschreibung egal');
  assert.equal(lieferwegVon(unterlage({ lagerware: true }), { status: 'bestellt', ueber: 'kunde' }).weg, 'hersteller', 'Vermerk schlaegt die Regeldatei');
  assert.equal(lieferwegVon(ware(), { status: 'bestellt', ueber: 'kettler' }).wort, 'über Kettler');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_DIRECT' }), { status: 'bestellt', ueber: 'laden' }).weg, 'uns');
  assert.equal(lieferwegVon(ware(), { status: 'geliefert', ueber: 'lager' }).weg, 'lager');
  assert.equal(lieferwegVon(ware({ route: 'SUPPLIER_TO_SITE' }), { status: 'bestellt', ueber: 'kunde' }).weg, 'baustelle', '"direkt" auf die Baustelle bleibt Baustelle');
  assert.equal(lieferwegVon(ware({ istMuster: true })), null);
  assert.equal(lieferwegVon(ware({ eigenleistung: true })), null);
  assert.deepEqual(Object.values(LIEFERWEG_WORT), ['Hersteller → Kunde', 'Hersteller → Baustelle', 'über uns', 'über Kettler', 'aus Lager']);
  assert.equal(lagerRegelFuer('TEST-LAGER-9', REGELN)?.hinweis, 'Rolle im Lager');
  assert.equal(lagerRegelFuer('TEST-WARE-1', REGELN), null);
  assert.equal(lagerRegelFuer('', [{ skuPraefix: '' }]), null, 'leerer Praefix passt nie');
  assert.equal(istLagerware(ware({ istMuster: true, lagerware: true })), false, 'Muster sind nie Lagerware');
});

test('Pruefung 06.11.: ein Vermerk zaehlt nur mit Schritt, die Regeldatei nur bis zur Lieferung (G4, B1, B3)', () => {
  const p = unterlage({ lagerware: true });
  // Nach "Zurueck auf offen" bleibt ein alter Vermerk stehen - er macht Lagerware nicht wieder bestellbar.
  for (const ueber of ['kunde', 'laden', 'kettler']) assert.equal(lieferwegVon(p, { status: null, ueber }).weg, 'lager', `alter Vermerk "${ueber}" ohne Schritt`);
  assert.equal(lieferwegVon(ware(), { status: null, ueber: 'lager' }).weg, 'uns', 'alter Vermerk "aus Lager" ohne Schritt: keine Lagerware ohne Regel');
  // #1104: vor der Regel beim Lieferanten bestellt und geliefert - kam ueber uns, nicht aus der Rolle.
  for (const status of ['geliefert', 'raus', 'erledigt']) {
    assert.deepEqual(lieferwegVon(p, { status }), { weg: 'uns', wort: 'über uns', belegt: false }, `${status} ohne Vermerk "aus Lager"`);
    assert.equal(lieferwegVon(p, { status, ueber: 'lager' }).weg, 'lager', `${status} nach "Zugeschnitten"`);
  }
  assert.equal(lieferwegVon(p, { status: 'bestellt' }).weg, 'lager', 'Altfall "bestellt" (#1119) bleibt Lagerware');
});

test('istLagerware folgt lieferwegVon: bestellt mit Vermerk ist keine Lagerware, OWN_STOCK auch nicht (E8, G2, G3)', () => {
  const p = unterlage({ lagerware: true });
  for (const ueber of ['kunde', 'laden', 'kettler']) {
    const e = { status: 'bestellt', ueber };
    assert.equal(istLagerware(p, e), false, `bestellt mit "${ueber}"`);
    assert.equal(istLagerware(p, e), lieferwegVon(p, e).weg === 'lager');
  }
  assert.equal(istLagerware(p, { status: 'bestellt' }), true, 'Altfall ohne Vermerk');
  assert.equal(istLagerware(p, null), true);
  assert.equal(istLagerware(ware(), { status: 'geliefert', ueber: 'lager' }), true, 'zugeschnitten');
  assert.equal(istLagerware(ware({ route: 'OWN_STOCK' })), false, 'OWN_STOCK wird wie bisher bestellt');
  assert.equal(selbstStand(ware({ route: 'OWN_STOCK' }), null), null, 'und steht nicht unter "noch zuschneiden"');
});

test('selbstStand: zuschneiden -> packen -> versand, raus beendet; Hersteller-Direktware nie', () => {
  const p = unterlage({ lagerware: true });
  assert.equal(selbstStand(p, null), 'zuschneiden');
  assert.equal(selbstStand(p, { status: 'bestellt' }), 'zuschneiden', 'Altfall wie #1119: ohne Vermerk auf "bestellt"');
  assert.equal(selbstStand(p, { status: 'geliefert', ueber: 'lager', selbstversand: { zugeschnitten: { am: 'x' } } }), 'packen');
  assert.equal(selbstStand(p, { status: 'geliefert', ueber: 'lager', selbstversand: { zugeschnitten: { am: 'x' }, gepackt: { am: 'y' } } }), 'versand');
  assert.equal(selbstStand(p, { status: 'raus' }), null);
  assert.equal(selbstStand(ware(), { status: 'geliefert' }), 'packen', 'eingetroffen über uns');
  assert.equal(selbstStand(ware(), { status: 'bestellt' }), null, 'noch unterwegs zu uns');
  assert.equal(selbstStand(ware(), { status: 'bestellt', ueber: 'kunde' }), null, 'Hersteller schickt');
  assert.equal(selbstStandText('packen', 'lager', { status: 'geliefert', ueber: 'lager', selbstversand: { zugeschnitten: { am: 'x', von: 't' } } }), 'zugeschnitten – noch packen');
  // B3: ohne abgehakten Zuschnitt heisst es nie "zugeschnitten".
  assert.equal(selbstStandText('packen', 'lager', { status: 'geliefert', ueber: 'lager' }), 'eingetroffen – noch packen');
  assert.equal(selbstStandText('packen', 'lager'), 'eingetroffen – noch packen');
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
  // Echte Lage #1104 (B3): Unterlage vor der Regel bestellt und mit Wareneingang geliefert - "über uns", eingetroffen.
  const echt = { status: 'geliefert', bestelltAm: '2026-11-03T09:00:00Z', geliefertAm: '2026-11-05T09:00:00Z' };
  assert.equal(lieferwegVon(a1104[0], echt).weg, 'uns');
  assert.equal(selbstStand(a1104[0], echt), 'packen');
  assert.equal(selbstStandText('packen', 'uns', echt), 'eingetroffen – noch packen');
  // Ein einziger Weg: keine Zahl vor dem Wort.
  assert.equal(lieferwegeAuftrag([ware()], () => ({ status: 'bestellt', ueber: 'kunde' })).includes('×'), false);
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

test('E1/G5/B2: Altfall-Lagerware auf "bestellt" steht "Je Auftrag" nur unter "Von uns abschicken", nie unter "Ware unterwegs"', () => {
  const pos = p => ({ ...p, orderId: 'o1' });
  const d = { gruppen: [{ lieferant: 'lieferant-a', positionen: [pos(unterlage({ lagerware: true })), pos(ware())] }] };
  const stand = { l1: { status: 'bestellt', bestelltAm: '2026-11-06T08:00:00Z' }, w1: { status: 'bestellt', ueber: 'kunde', bestelltAm: '2026-11-06T08:00:00Z' } };
  const ab = auftragsAblauf({ id: 'o1' }, d, p => stand[p.lineItemId] || null);
  // Die Unterlage ist noch nicht zugeschnitten: nicht "Ware da · Lieferung/Montage" (Review 06.11.2026, #1119).
  assert.equal(ab.jetzt, 'bestellt');
  assert.equal(ab.schritte.find(s => s.key === 'bestellt').label, 'Aus eigenem Lager zuschneiden');
  assert.deepEqual(ab.unterwegs.map(x => x.pos.lineItemId), ['w1'], 'nur die Direktware ist unterwegs');
  assert.deepEqual(ab.selbst.map(x => [x.pos.lineItemId, x.selbst]), [['l1', 'zuschneiden']]);
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

test('E8/G2: Lagerware, die schon mit Vermerk beim Lieferanten bestellt ist, bekommt "Nachhaken" und steht beim Lieferanten', () => {
  const jetzt = new Date('2026-12-06T12:00:00Z');
  const zeile = { orderId: 'gid://test/Order/1', orderName: '#TEST-1', kundenname: 'Testkunde', datum: '2026-11-01T09:00:00Z',
    zahlungsstatus: 'PAID', offen: true, auftrag: { id: 'gid://test/Order/1', positionen: [unterlage({ lagerware: true })], ampel: 'gruen' } };
  const statusAlle = { 'gid://test/Order/1::l1': { status: 'bestellt', ueber: 'kunde', bestelltAm: '2026-11-06T09:00:00Z' } };
  const todos = leiteTodosAb({ bestellzeilen: [zeile], statusAlle }, { sicht: 'alles', alle: true, jetzt });
  assert.ok(todos.some(t => t.art === 'nachhaken'), 'seit 30 Tagen bestellt: nachhaken');
  const w = werWartet({ bestellzeilen: [zeile], statusAlle }, { jetzt });
  assert.equal(w.kunde.length, 0, 'nicht "Muster beim Kunden"');
  assert.equal(w.wir.length + w.lieferant.length, 1);
  const pos = p => ({ ...p, orderId: 'o1' });
  const [k] = lieferantenKarten({ gruppen: [{ lieferant: 'lieferant-a', positionen: [pos(unterlage({ lagerware: true }))] }],
    eintragFuer: () => ({ status: 'bestellt', ueber: 'laden', bestelltAm: '2026-10-01T08:00:00Z' }), jetzt: Date.parse('2026-11-06T12:00:00Z') });
  assert.equal(k.ware.eigen.length, 0, 'nicht unter "Aus eigenem Lager"');
  assert.deepEqual(k.ware.bestellt.map(x => x.pos.lineItemId), ['l1']);
});

test('E7: "Ware ist da – rausgeben" verliert nur die Positionen, die "Von uns abschicken" zeigt', () => {
  const jetzt = new Date('2026-11-10T12:00:00Z');
  const muster = { lineItemId: 'm1', titel: 'Muster Testteppich', farbe: 'grau', sku: 'M-TEST-1', istMuster: true, lieferant: 'lieferant-a' };
  const zeile = { orderId: 'gid://test/Order/1', orderName: '#TEST-1', kundenname: 'Testkunde', datum: '2026-11-01T09:00:00Z',
    zahlungsstatus: 'PAID', offen: true, auftrag: { id: 'gid://test/Order/1', positionen: [ware(), muster], ampel: 'gruen' } };
  const statusAlle = { 'gid://test/Order/1::w1': { status: 'geliefert', geliefertAm: '2026-11-04T09:00:00Z' }, 'gid://test/Order/1::m1': { status: 'geliefert', geliefertAm: '2026-11-09T09:00:00Z' } };
  const [todo] = leiteTodosAb({ bestellzeilen: [zeile], statusAlle }, { sicht: 'alles', alle: true, jetzt }).filter(t => t.art === 'rausgeben');
  assert.deepEqual(todo.schluessel, ['gid://test/Order/1::w1', 'gid://test/Order/1::m1']);
  assert.match(todo.titel, /^Ware ist da – an Testkunde rausgeben$/);
  assert.equal(todo.alterTage, 6);
  // Der Block zeigt die Ware: uebrig bleibt das Muster, mit eigenem Titel und Alter.
  const rest = rausgebenOhne(todo, new Set(['gid://test/Order/1::w1']));
  assert.match(rest.titel, /^Muster ist da – an Testkunde rausgeben$/);
  assert.deepEqual(rest.schluessel, ['gid://test/Order/1::m1']);
  assert.equal(rest.alterTage, 1);
  assert.equal(rest.ton, '');
  assert.doesNotMatch(rest.kontext, /Testboden/);
  assert.equal(rausgebenOhne(todo, new Set(['gid://test/Order/1::w1', 'gid://test/Order/1::m1'])), null, 'alles gedeckt: weg');
  assert.equal(rausgebenOhne(todo, new Set(['anderes::x'])), todo, 'nichts gedeckt: unveraendert');
  const anderes = { art: 'bestellen', schluessel: ['gid://test/Order/1::w1'] };
  assert.equal(rausgebenOhne(anderes, new Set(['gid://test/Order/1::w1'])), anderes);
  // Der Block zeigt die eingetroffene Ware tatsaechlich (und nicht das Muster).
  const daten = { verfuegbar: true, zeilen: [{ ...zeile, positionsstatus: { w1: statusAlle['gid://test/Order/1::w1'], m1: statusAlle['gid://test/Order/1::m1'] } }] };
  assert.deepEqual([...selbstAbschickenStand({ daten, jetzt }).schluessel], ['gid://test/Order/1::w1']);
});

test('E2: Versand-Dialog im gemischten Auftrag kreuzt nur an, was wir verschicken - Direktware nur, wenn sonst nichts offen ist', () => {
  const kandidaten = [{ lineItemId: 'l1' }, { lineItemId: 'd1' }, { lineItemId: 'k1', eigenleistung: true }];
  const weg = { l1: 'lager', d1: 'hersteller', k1: null };
  assert.deepEqual([...vorauswahl(kandidaten, { weg })], ['l1'], 'Direktware und Kettelservice nicht vorab');
  assert.deepEqual([...vorauswahl([{ lineItemId: 'd1' }, { lineItemId: 'k1', eigenleistung: true }], { weg })], ['d1', 'k1'], 'nur Direktware offen: wie bisher');
  assert.deepEqual([...vorauswahl([{ lineItemId: 'l1' }, { lineItemId: 'u1' }], { weg: { l1: 'lager', u1: 'uns' } })], ['l1', 'u1'], 'ohne Direktware wie bisher');
  assert.deepEqual([...vorauswahl(kandidaten)], ['l1', 'd1', 'k1'], 'ohne Wege wie bisher');
  assert.deepEqual([...vorauswahl(kandidaten, { geklickt: 'l1', weg })], ['l1'], 'angeklickt: nur diese');
});

// Ansicht Einkauf › Je Lieferant ohne Importe laden (wie bezugsweg-hinweis.test.mjs).
const lieferantenQuelle = fs.readFileSync(new URL('../ansichten/einkauf/lieferanten.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const ladeLieferantenAnsicht = (lesend = false) => vm.runInNewContext(`${lieferantenQuelle}\n({ ohneKnopf, kartenAnzahl })`, {
  state: {}, einkauf: {}, esc: v => String(v ?? '').replace(/</g, '&lt;'), anzeigeWert: v => v, istNurLesend: () => lesend,
});

test('E5/G6: Lagerware in der Bestellmail hat keinen Musterknopf "Ändern…", sondern "Von uns abschicken"', () => {
  const { ohneKnopf } = ladeLieferantenAnsicht();
  const lager = ohneKnopf({ orderId: 'o1', lineItemId: 'l1', titel: 'Testunterlage', istMuster: false, gruende: ['aus eigenem Lager – nicht bestellen'] });
  assert.doesNotMatch(lager, /data-lf-herkunft|Ändern/);
  assert.match(lager, /href="#\/heute"[^>]*>Von uns abschicken</);
  assert.match(ohneKnopf({ orderId: 'o1', lineItemId: 'm1', istMuster: true }), /data-lf-herkunft="o1"[^>]*>Ändern…</);
  assert.equal(ladeLieferantenAnsicht(true).ohneKnopf({ istMuster: false }), '', 'Rolle "lesen": kein Knopf');
});

test('B4: "Positionen bearbeiten (n)" zaehlt Lagerware unter "Aus eigenem Lager" mit - wie offenGesamt', () => {
  const { kartenAnzahl } = ladeLieferantenAnsicht();
  const pos = p => ({ ...p, orderId: 'o1' });
  const [k] = lieferantenKarten({ gruppen: [{ lieferant: 'lieferant-a', positionen: [pos(unterlage({ lagerware: true }))] }], eintragFuer: () => null, jetzt: Date.parse('2026-11-06T12:00:00Z') });
  assert.equal(k.ware.eigen.length, 1);
  assert.equal(kartenAnzahl(k), 1, 'vorher 0');
  assert.equal(kartenAnzahl(k), k.offenGesamt);
  assert.equal(kartenAnzahl(k, 'erledigt'), 0);
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
  assert.equal(selbstAbschickenStand({ daten: null }).verfuegbar, false);
});

test('E6: "Gepackt" setzt die Frist nicht zurueck - sie zaehlt ab Zuschnitt bzw. Eingang', () => {
  const jetzt = new Date('2026-11-10T12:00:00Z');
  const zeile = positionsstatus => ({ orderId: 'o1', orderName: '#TEST-1', kundenname: 'Testkunde', offen: true, datum: '2026-11-01T09:00:00Z', positionsstatus, auftrag: { positionen: [ware(), unterlage({ lineItemId: 'l2', lagerware: true })] } });
  const eingetroffen = { status: 'geliefert', geliefertAm: '2026-11-04T09:00:00Z' };
  const gepackt = { ...eingetroffen, selbstversand: { gepackt: { am: '2026-11-10T11:00:00Z', von: 'test' } } };
  const zugeschnitten = { status: 'geliefert', ueber: 'lager', geliefertAm: '2026-11-04T09:00:00Z', selbstversand: { zugeschnitten: { am: '2026-11-04T09:00:00Z', von: 'test', vorher: null }, gepackt: { am: '2026-11-10T11:00:00Z', von: 'test' } } };
  const vorher = selbstAbschickenStand({ daten: { verfuegbar: true, zeilen: [zeile({ w1: eingetroffen })] }, jetzt }).zeilen.find(x => x.key === 'o1::w1');
  const nachher = selbstAbschickenStand({ daten: { verfuegbar: true, zeilen: [zeile({ w1: gepackt, l2: zugeschnitten })] }, jetzt }).zeilen;
  assert.deepEqual([vorher.stand, vorher.tage, vorher.ton], ['packen', 6, 'crit']);
  assert.deepEqual(nachher.map(x => [x.key, x.stand, x.tage, x.ton]), [['o1::l2', 'versand', 6, 'crit'], ['o1::w1', 'versand', 6, 'crit']]);
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
