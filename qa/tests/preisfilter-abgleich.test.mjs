import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BEREICHE, LABELS, JE_AUFRUF, bereichFuer, meterpreisCent, sollWert, planeAbgleich, rueckwegFuer,
  bauePakete, setzenAufruf, fehlerAus, argumente, ladeExport, definitionMutation, KEY, NAMESPACE,
  laufOrdner, erwartung, vergleiche, main,
} from '../../scripts/preisfilter-abgleich.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Preisfilter Teppichboden (w-189): Metafeld custom.meterpreis_bereich aus dem
// Meterpreis der Karte ableiten, nicht aus der teureren Wunschmass-Variante.

const V = (price, breite = '400cm', extra = {}) => ({
  id: `gid://shopify/ProductVariant/${Math.round(price * 100)}-${breite}`, sku: 'TEP1', title: `Sand / ${breite}`, price: String(price),
  selectedOptions: [{ name: 'Farbe', value: 'Sand' }, { name: 'Breite', value: breite }], ...extra,
});
const P = (o = {}) => ({
  id: 'gid://shopify/Product/1', handle: 'zafira-teppichboden-400cm-500cm', status: 'ACTIVE', productType: 'Teppichboden',
  qm: null, p001: null, mpb: null, variants: { nodes: [V(33), V(33, '500cm'), V(44.9, 'Wunschmaß')] }, ...o,
});

test('Bereiche: untere Grenze einschliesslich, obere ausschliesslich, lueckenlos', () => {
  assert.equal(bereichFuer(1549), 'unter 30 €/m²');
  assert.equal(bereichFuer(2999), 'unter 30 €/m²');
  assert.equal(bereichFuer(3000), '30 bis 40 €/m²');
  assert.equal(bereichFuer(3999), '30 bis 40 €/m²');
  assert.equal(bereichFuer(4000), '40 bis 60 €/m²');
  assert.equal(bereichFuer(5999), '40 bis 60 €/m²');
  assert.equal(bereichFuer(6000), '60 bis 80 €/m²');
  assert.equal(bereichFuer(8000), '80 bis 100 €/m²');
  assert.equal(bereichFuer(10000), '100 bis 150 €/m²');
  assert.equal(bereichFuer(15000), 'ab 150 €/m²');
  assert.equal(bereichFuer(99999), 'ab 150 €/m²');
  assert.equal(bereichFuer(0), null);
  assert.equal(bereichFuer(-5), null);
  for (let i = 1; i < BEREICHE.length; i++) assert.equal(BEREICHE[i].von, BEREICHE[i - 1].bis, 'Bereiche schliessen aneinander an');
  assert.equal(LABELS.length, 7);
});

test('Rollenware: Meterpreis ist der niedrigste Meterware-Preis, Wunschmass zaehlt nicht', () => {
  assert.deepEqual(meterpreisCent(P()), { cent: 3300, quelle: 'meterware' });
  // Wunschmass guenstiger als Meterware kommt nicht vor - und wuerde trotzdem nicht zaehlen
  assert.deepEqual(meterpreisCent(P({ variants: { nodes: [V(36.9), V(20, 'Wunschmaß'), V(21, 'Raummaß')] } })), { cent: 3690, quelle: 'meterware' });
  assert.equal(sollWert(P()).label, '30 bis 40 €/m²');
  assert.equal(sollWert(P({ variants: { nodes: [V(15.49), V(20.9, 'Wunschmaß')] } })).label, 'unter 30 €/m²');
});

test('Muster-Varianten, OPC-Konfigurator und Nullpreise bleiben aussen vor', () => {
  const p = P({ variants: { nodes: [V(1, '400cm', { sku: 'M-TEP1' }), V(5, '400cm', { title: 'OPC-Konfigurator' }), V(0), V(58.9)] } });
  assert.deepEqual(meterpreisCent(p), { cent: 5890, quelle: 'meterware' });
});

test('Paketware: Paketpreis je m2 wie auf der Karte (Cent gerundet)', () => {
  const p = P({ qm: { value: '5.0' }, variants: { nodes: [V(294.5, 'Paket'), V(310, 'Paket')] } });
  assert.deepEqual(meterpreisCent(p), { cent: 5890, quelle: 'paket' });
  assert.equal(sollWert(p).label, '40 bis 60 €/m²');
});

test('Preis je 0,01 m2 wird auf den Quadratmeter hochgerechnet', () => {
  const p = P({ p001: { value: 'true' }, variants: { nodes: [V(0.89, '400cm')] } });
  assert.deepEqual(meterpreisCent(p), { cent: 8900, quelle: 'meterware' });
});

test('Kein Wert fuer Entwuerfe, Archiviertes, andere Produkttypen, Musterprodukte und Produkte ohne Meterware', () => {
  assert.equal(meterpreisCent(P({ status: 'DRAFT' })).grund, 'nicht aktiv');
  assert.equal(meterpreisCent(P({ status: 'ARCHIVED' })).grund, 'nicht aktiv');
  assert.equal(meterpreisCent(P({ productType: 'Klickvinyl' })).grund, 'Produkttyp Klickvinyl');
  assert.equal(meterpreisCent(P({ handle: 'muster-zafira' })).grund, 'Musterprodukt');
  assert.equal(meterpreisCent(P({ variants: { nodes: [V(44.9, 'Wunschmaß')] } })).grund, 'keine Meterware-Variante');
  assert.equal(meterpreisCent(P({ variants: { nodes: [] } })).grund, 'keine Variante mit Preis');
  assert.equal(sollWert(P({ status: 'DRAFT' })).label, null);
});

test('Plan: setzen, unveraendert lassen, entfernen - und idempotent', () => {
  const produkte = [
    P(),                                                                   // leer -> setzen
    P({ id: 'gid://shopify/Product/2', handle: 'b', mpb: { value: '30 bis 40 €/m²' } }), // passt
    P({ id: 'gid://shopify/Product/3', handle: 'c', mpb: { value: '40 bis 60 €/m²' } }), // falsch -> setzen
    P({ id: 'gid://shopify/Product/4', handle: 'd', status: 'ARCHIVED', mpb: { value: '30 bis 40 €/m²' } }), // -> loeschen
    P({ id: 'gid://shopify/Product/5', handle: 'e', variants: { nodes: [V(44.9, 'Wunschmaß')] } }), // offen
    P({ id: 'gid://shopify/Product/6', handle: 'muster-e', variants: { nodes: [] } }), // Muster: weder offen noch loeschen
  ];
  const plan = planeAbgleich(produkte);
  assert.deepEqual(plan.setzen.map((e) => [e.handle, e.alt, e.neu]), [['zafira-teppichboden-400cm-500cm', null, '30 bis 40 €/m²'], ['c', '40 bis 60 €/m²', '30 bis 40 €/m²']]);
  assert.deepEqual(plan.loeschen.map((e) => [e.handle, e.alt]), [['d', '30 bis 40 €/m²']]);
  assert.deepEqual(plan.offen, [{ handle: 'e', grund: 'keine Meterware-Variante' }]);
  assert.equal(plan.unveraendert, 1);
  assert.deepEqual(plan.zaehlung, { '30 bis 40 €/m²': 3 });

  // Nach dem Schreiben steht der Sollwert im Feld -> nichts mehr zu tun
  const nachher = produkte.map((p) => {
    const s = plan.setzen.find((e) => e.ownerId === p.id);
    if (s) return { ...p, mpb: { value: s.neu } };
    if (plan.loeschen.find((e) => e.ownerId === p.id)) return { ...p, mpb: null };
    return p;
  });
  const plan2 = planeAbgleich(nachher);
  assert.equal(plan2.setzen.length + plan2.loeschen.length, 0);
  assert.equal(plan2.unveraendert, 3);
});

test('Rueckweg stellt Altwerte her und loescht, was vorher leer war', () => {
  const plan = {
    setzen: [{ ownerId: 'p1', handle: 'a', alt: null, neu: 'x' }, { ownerId: 'p2', handle: 'b', alt: '40 bis 60 €/m²', neu: '30 bis 40 €/m²' }],
    loeschen: [{ ownerId: 'p3', handle: 'c', alt: '60 bis 80 €/m²' }],
  };
  assert.deepEqual(rueckwegFuer(plan), {
    setzen: [{ ownerId: 'p2', handle: 'b', neu: '40 bis 60 €/m²' }, { ownerId: 'p3', handle: 'c', neu: '60 bis 80 €/m²' }],
    loeschen: [{ ownerId: 'p1', handle: 'a' }],
  });
});

test('Pakete: hoechstens 25 Metafelder je metafieldsSet, Werte mit Sonderzeichen korrekt zitiert', () => {
  const setzen = Array.from({ length: 60 }, (_, i) => ({ ownerId: `gid://shopify/Product/${i}`, handle: `h${i}`, neu: '30 bis 40 €/m²' }));
  const loeschen = [{ ownerId: 'gid://shopify/Product/x', handle: 'x' }];
  const pakete = bauePakete({ setzen, loeschen });
  assert.equal(pakete.length, 1, '3 setzen-Aufrufe + 1 loeschen passen in ein Paket zu 4');
  const aufrufe = pakete[0].match(/a\d:metafieldsSet/g);
  assert.equal(aufrufe.length, 3);
  assert.equal((pakete[0].match(/ownerId:"gid:\/\/shopify\/Product\/\d+"/g) || []).length, 60);
  assert.match(pakete[0], /a3:metafieldsDelete\(metafields:\[\{ownerId:"gid:\/\/shopify\/Product\/x",namespace:"custom",key:"meterpreis_bereich"\}\]\)/);
  assert.match(pakete[0], /value:"30 bis 40 €\/m²"/);
  assert.match(pakete[0], /type:"single_line_text_field"/);
  assert.throws(() => setzenAufruf(setzen.slice(0, JE_AUFRUF + 1)), /hoechstens 25/);
  // 101 Aufrufe -> 2 Pakete
  const viele = Array.from({ length: 101 }, (_, i) => ({ ownerId: `gid://shopify/Product/${i}`, handle: `h${i}`, neu: 'ab 150 €/m²' }));
  assert.equal(bauePakete({ setzen: viele }).length, 2);
  assert.equal(bauePakete({}).length, 0);
});

test('userErrors aus aliasierten Antworten werden gesammelt, leer ist leer', () => {
  assert.deepEqual(fehlerAus({ data: { a0: { metafields: [], userErrors: [] }, a1: { userErrors: [{ field: ['metafields', '0', 'value'], message: 'ungueltig' }] } } }), ['a1: ungueltig (metafields.0.value)']);
  assert.deepEqual(fehlerAus({ a0: { userErrors: [] } }), []);
  assert.deepEqual(fehlerAus(null), []);
});

test('Argumente: Flags, Werte und Fehler', () => {
  assert.deepEqual(argumente([]), { schreiben: false, still: false, export: null, ziel: null, zurueck: null, definition: false, zugang: null, hoechstens: Infinity });
  assert.equal(argumente(['--schreiben', '--still']).schreiben, true);
  assert.equal(argumente(['--export', 'e.json', '--ziel', '/tmp/x', '--hoechstens', '3']).hoechstens, 3);
  assert.equal(argumente(['--zugang', 'cli']).zugang, 'cli');
  assert.throws(() => argumente(['--zugang', 'mcp']), /cli oder token/);
  assert.throws(() => argumente(['--export']), /braucht einen Wert/);
  assert.throws(() => argumente(['--hoechstens', '0']), /> 0/);
  assert.throws(() => argumente(['--foo']), /Unbekanntes Argument/);
  // Review PR #1801: ohne Live-Abruf keine Gegenprobe - nie schreiben
  assert.throws(() => argumente(['--export', 'e.json', '--schreiben']), /schliessen sich aus/);
  assert.throws(() => argumente(['--export', 'e.json', '--zurueck', 'r.json']), /schliessen sich aus/);
});

test('Export-Datei: Array oder { produkte }', () => {
  assert.equal(ladeExport('[{"id":"a"}]').length, 1);
  assert.equal(ladeExport('{"produkte":[{"id":"a"},{"id":"b"}]}').length, 2);
  assert.throws(() => ladeExport('{"x":1}'), /erwartet/);
});

test('Definition: Produkt-Metafeld, Text, Storefront lesbar', () => {
  const m = definitionMutation();
  assert.match(m, /metafieldDefinitionCreate/);
  assert.match(m, new RegExp(`namespace:"${NAMESPACE}", key:"${KEY}", type:"single_line_text_field", ownerType:PRODUCT`));
  assert.match(m, /storefront:PUBLIC_READ/);
});

test('Ablage: jeder Lauf bekommt einen eigenen Ordner, auch zweimal in derselben Sekunde', () => {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-pf-'));
  const t = new Date('2026-10-29T09:56:46Z');
  const a = laufOrdner(basis, t);
  assert.equal(a, path.join(basis, '2026-10-29', '105646'));
  fs.mkdirSync(a, { recursive: true });
  const b = laufOrdner(basis, t);
  assert.notEqual(a, b);
  assert.equal(b, path.join(basis, '2026-10-29', '105646-2'));
  fs.rmSync(basis, { recursive: true, force: true });
});

test('Gegenprobe je Feld: Erwartung und Vergleich', () => {
  const soll = erwartung({ setzen: [{ ownerId: 'a', neu: 'x' }], loeschen: [{ ownerId: 'b' }] });
  assert.deepEqual([...soll], [['a', 'x'], ['b', null]]);
  assert.deepEqual(vergleiche(soll, new Map([['a', 'x'], ['b', null]])), { gleich: 2, abweichend: [] });
  assert.deepEqual(vergleiche(soll, new Map([['a', 'y']])).abweichend.map((e) => e.ownerId), ['a']);
});

/** Speicherbasierter Shopify-Zugang: liest aus produkte, Mutationen setzen Werte nur, wenn wirksam. */
function mockZugang(produkte, { wirksam = true } = {}) {
  const frage = async (q, v) => {
    if (q.includes('nodes(ids')) return { nodes: v.ids.map((id) => { const p = produkte.find((x) => x.id === id); return p ? { id, mpb: p.mpb } : null; }) };
    return { products: { nodes: produkte, pageInfo: { hasNextPage: false, endCursor: null } } };
  };
  const schreibe = async (m) => {
    if (wirksam) {
      for (const [, id, wert] of m.matchAll(/ownerId:"([^"]+)",namespace:"custom",key:"meterpreis_bereich",type:"single_line_text_field",value:"([^"]+)"/g)) {
        const p = produkte.find((x) => x.id === id); if (p) p.mpb = { value: wert };
      }
    }
    return { a0: { metafields: [], userErrors: [] } };
  };
  return { art: 'mock', frage, schreibe };
}

test('Schreiblauf: wirksame Mutation -> Exit 0, wirkungslose Mutation -> Exit 1 trotz leerer userErrors', async () => {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-pf-'));
  const env = { TP_PRIVAT_DIR: basis };
  const still = () => {};
  const ok = await main(['--schreiben'], { zugang: mockZugang([P()]), env, aus: still });
  assert.equal(ok, 0);
  const wirkungslos = await main(['--schreiben'], { zugang: mockZugang([P({ id: 'gid://shopify/Product/9' })], { wirksam: false }), env, aus: still });
  assert.equal(wirkungslos, 1);
  // zwei Laeufe -> zwei Rueckwege, keiner ueberschrieben
  const tag = fs.readdirSync(path.join(basis, 'preisfilter')).find((d) => /^\d{4}-/.test(d));
  assert.equal(fs.readdirSync(path.join(basis, 'preisfilter', tag)).length, 2);
  fs.rmSync(basis, { recursive: true, force: true });
});

test('Rueckweg: Gegenprobe je Feld, wirkungslos -> Exit 1', async () => {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-pf-'));
  const datei = path.join(basis, 'rueckweg.json');
  fs.writeFileSync(datei, JSON.stringify({ setzen: [{ ownerId: 'gid://shopify/Product/1', handle: 'a', neu: '40 bis 60 €/m²' }], loeschen: [] }));
  const env = { TP_PRIVAT_DIR: basis };
  const still = () => {};
  assert.equal(await main(['--zurueck', datei], { zugang: mockZugang([P({ mpb: { value: '30 bis 40 €/m²' } })]), env, aus: still }), 0);
  assert.equal(await main(['--zurueck', datei], { zugang: mockZugang([P({ mpb: { value: '30 bis 40 €/m²' } })], { wirksam: false }), env, aus: still }), 1);
  fs.rmSync(basis, { recursive: true, force: true });
});
