import test from 'node:test';
import assert from 'node:assert/strict';
import { aktionAusMetaobjekt, ausAdminKnoten, heuteBerlin, istAngebot, plan, rabattSichtbar } from '../lib/angebote-abgleich.mjs';

const HEUTE = '2026-10-08';
const v = (preis, vergleichspreis, optionen = ['Grau'], kaufbar = true, titel = optionen.join(' / ')) => ({ preis, vergleichspreis, optionen, kaufbar, titel });
const p = (mf, varianten, extra = {}) => ({ id: 'gid://shopify/Product/1', typ: 'Teppichboden', tags: [], kollektionen: [], mf, varianten, ...extra });

test('Heute in Berliner Zeit (Mitternacht UTC ist dort schon der naechste Tag)', () => {
  assert.equal(heuteBerlin(new Date('2026-10-07T22:30:00Z')), '2026-10-08');
});

test('befristete Aktion: nur zwischen Start und Ende, beide Tage eingeschlossen', () => {
  const pr = (mf) => istAngebot(p(mf, [v('20.00', '25.00')]), { heute: HEUTE });
  assert.equal(pr({ aktion_start: '2026-10-08', aktion_ende: '2026-10-08' }), true);
  assert.equal(pr({ aktion_start: '2026-10-09' }), false);
  assert.equal(pr({ aktion_start: '2026-10-01', aktion_ende: '2026-10-07' }), false, 'Ende gestern');
  assert.equal(pr({}), false, 'ohne Start keine Aktion - stehen gebliebener Vergleichspreis zaehlt nicht');
});

test('Dauerrabatt preisanker bis einschliesslich Ende, ohne Ende unbefristet', () => {
  const pr = (mf) => istAngebot(p(mf, [v('20.00', '25.00')]), { heute: HEUTE });
  assert.equal(pr({ aktion_klasse: 'preisanker' }), true);
  assert.equal(pr({ aktion_klasse: 'preisanker', aktion_ende: '2026-10-08' }), true);
  assert.equal(pr({ aktion_klasse: 'preisanker', aktion_ende: '2026-10-07' }), false);
});

test('aktive Aktion ohne echten Rabatt an der angezeigten Variante ist kein Angebot', () => {
  assert.equal(istAngebot(p({ aktion_start: HEUTE }, [v('25.00', '25.00')]), { heute: HEUTE }), false);
  assert.equal(istAngebot(p({ aktion_start: HEUTE }, [v('25.00', null)]), { heute: HEUTE }), false);
  // angezeigt wird die erste kaufbare Variante
  assert.equal(istAngebot(p({ aktion_start: HEUTE }, [v('20.00', '25.00', ['A'], false), v('25.00', null, ['B'])]), { heute: HEUTE }), false);
});

test('Rollenware mit Raummass: nur wenn alle regulaeren Varianten reduziert sind', () => {
  const mf = { aktion_start: HEUTE };
  const beide = [v('30.00', '35.00', ['Grau', '400 cm']), v('40.00', '47.00', ['Grau', 'Wunschmaß'])];
  assert.equal(rabattSichtbar(p(mf, beide), HEUTE), true);
  const nurRaum = [v('30.00', '30.00', ['Grau', '400 cm']), v('40.00', '47.00', ['Grau', 'Wunschmaß'])];
  assert.equal(rabattSichtbar(p(mf, nurRaum), HEUTE), false);
  const mitOpc = [...beide, v('1.00', null, ['opc-123'], true, 'opc-123')];
  assert.equal(rabattSichtbar(p(mf, mitOpc), HEUTE), true, 'Rechnervarianten zaehlen nicht');
});

test('Sonderposten sind nie ein Angebot', () => {
  assert.equal(istAngebot(p({ aktion_klasse: 'preisanker' }, [v('89.00', '243.46')], { typ: 'Sonderposten' }), { heute: HEUTE }), false);
});

test('zentrale Aktion tp_aktion: aktiv, im Zeitraum, Produkt in der Aktionskollektion', () => {
  const aktion = aktionAusMetaobjekt({ fields: [
    { key: 'aktiv', value: 'true' }, { key: 'start', value: '2026-10-01' }, { key: 'ende', value: '2026-10-14' },
    { key: 'kollektion', value: 'gid://shopify/Collection/9' }, { key: 'prozent', value: '15' },
  ] });
  const drin = p({}, [v('20.00', null)], { kollektionen: ['gid://shopify/Collection/9'] });
  assert.equal(istAngebot(drin, { heute: HEUTE, aktionen: [aktion] }), true);
  assert.equal(istAngebot({ ...drin, kollektionen: [] }, { heute: HEUTE, aktionen: [aktion] }), false);
  assert.equal(istAngebot(drin, { heute: '2026-10-15', aktionen: [aktion] }), false);
  assert.equal(istAngebot(drin, { heute: HEUTE, aktionen: [{ ...aktion, aktiv: false }] }), false);
});

test('Plan: setzt fehlende Tags, entfernt ueberholte, laesst richtige stehen', () => {
  const a = { ...p({ aktion_start: HEUTE }, [v('20.00', '25.00')]), id: 'a' };
  const b = { ...p({}, [v('20.00', '25.00')]), id: 'b', tags: ['angebot'] };
  const c = { ...p({ aktion_start: HEUTE }, [v('20.00', '25.00')]), id: 'c', tags: ['angebot'] };
  const r = plan([a, b, c], { heute: HEUTE });
  assert.deepEqual(r.setzen.map((x) => x.id), ['a']);
  assert.deepEqual(r.entfernen.map((x) => x.id), ['b']);
  assert.equal(r.angebote, 2);
});

test('Admin-Knoten werden vollstaendig uebersetzt', () => {
  const m = ausAdminKnoten({
    id: 'x', handle: 'h', title: 'T', productType: 'Teppichboden', tags: ['angebot'],
    collections: { nodes: [{ id: 'k1' }] },
    aStart: { value: '2026-10-01' }, aEnde: null, aKlasse: { value: 'aktion' },
    variants: { nodes: [{ title: 'Grau / 400 cm', selectedOptions: [{ value: 'Grau' }, { value: '400 cm' }], price: '30.00', compareAtPrice: '35.00', availableForSale: true }] },
  });
  assert.deepEqual(m.kollektionen, ['k1']);
  assert.equal(m.mf.aktion_ende, '');
  assert.deepEqual(m.varianten[0].optionen, ['Grau', '400 cm']);
});
