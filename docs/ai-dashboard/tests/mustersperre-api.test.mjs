// "Muster nicht verfuegbar" (Inhaber 2026-10-16): Ergebnis-Schritt mit Pflichtnotiz, Sperre der
// Mustervarianten im Shop (Attrappe, nie echtes Shopify), Liste in Einkauf > Musterlager,
// "Wieder verfuegbar" - und der Server mit Rollen.
import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { attrappe, variante } from '../../../operations/tests/mustersperre-attrappe.mjs';
import { leiteTodosAb } from '../lib/todos.mjs';
import { musterNachfassen, fuelleText, texteAusMarkdown, NICHT_VERFUEGBAR_VORLAGE } from '../lib/muster-nachfassen.mjs';

// Nur synthetische Daten: erfundene Kunden, Pseudonym-Lieferant A.
const muster = (id, farbe) => ({
  id: `gid://shopify/LineItem/${id}`, sku: `M-TEST-${id}`, title: 'Muster Testteppich', variantTitle: farbe, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: 'Produkt', value: 'Testteppich' }], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: `M-TEST-${id}`, title: farbe, metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster-testteppich', title: 'Muster Testteppich', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, zeilen, { kunde = 1, test = false } = {}) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: '2026-10-10T10:00:00Z', cancelledAt: null, test,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${kunde}`, displayName: `Testkunde ${kunde}`, email: `testkunde${kunde}@example.invalid` },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const AUFTRAG = 'gid://shopify/Order/1';
const ANDERER = 'gid://shopify/Order/2';
const ICH = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };

function privat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-mustersperre-api-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(1, [muster(1, 'Sand'), muster(2, 'Greige')], { kunde: 1 }),
    bestellung(2, [muster(3, 'Grau')], { kunde: 2 }),
  ] }));
  return dir;
}

function umgebung({ rechte, zugang = true } = {}) {
  const dir = privat();
  const shop = attrappe({ varianten: [variante('M-TEST-1'), variante('M-TEST-2'), variante('M-TEST-3')], ...(rechte ? { rechte } : {}) });
  const z = { zugang, proxy: shop.proxy };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: {}, now: () => new Date('2026-10-16T10:00:00Z'),
    shopifyZugang: async () => (z.zugang ? { proxy: z.proxy, art: 'client-credentials' } : { proxy: { execute: async () => null }, art: 'sammeln' }) });
  const schritt = (orderId, extra = {}) => api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId, schritt: 'muster_nicht_verfuegbar', ...extra }, ICH);
  return { dir, shop, api, schritt, z };
}

const sperrDatei = dir => JSON.parse(fs.readFileSync(path.join(dir, 'mustersperre.json'), 'utf8')).ereignisse;
const todosFuer = (api, orderName) => leiteTodosAb({ bestellzeilen: api.kundenBestellungen().zeilen, statusAlle: api.einkaufAuftragsstatus().positionen }, { sicht: 'laden', alle: true, jetzt: new Date('2026-10-16T10:00:00Z') })
  .filter(t => JSON.stringify(t).includes(orderName));

test('Schritt mit Sperre: Notiz nennt die Farben, Auftrag abgeschlossen, Positionen erledigt, 2 Farben im Shop gesperrt', async () => {
  const { dir, shop, api, schritt } = umgebung();
  assert.ok(todosFuer(api, '#T1').length > 0, 'vorher: To-do "Muster beim Lieferanten bestellen"');
  // Kunden > Zu tun (Testadressen stehen unter "ausgeblendet" - der Schritt ist derselbe).
  const schrittT1 = () => { const f = api.kundenFaelle(); return [...f.faelle, ...f.ausgeblendet].flatMap(x => x.punkte).find(p => p.bezug === '#T1')?.schritt?.text ?? null; };
  assert.equal(schrittT1(), 'Muster beim Lieferanten bestellen');
  const r = await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1', 'gid://shopify/LineItem/2'], notiz: 'Kunde per Mail informiert' });
  assert.equal(r.zeitleisteAbgeschlossen, true);
  assert.equal(r.naechsterSchritt, null);
  assert.equal(r.positionen, 2);
  assert.deepEqual([r.mustersperre.status, r.mustersperre.gesperrt, r.mustersperre.meldung], ['gesperrt', 2, '2 Farben im Shop gesperrt']);
  assert.deepEqual(shop.varianten.map(v => [v.sku, v.tracked]), [['M-TEST-1', true], ['M-TEST-2', true], ['M-TEST-3', false]], 'nur die angekreuzten, nie die anderer Auftraege');

  const ergebnis = r.verlauf.at(-1);
  assert.deepEqual([ergebnis.ergebnis, ergebnis.von, ergebnis.notiz], ['muster_nicht_verfuegbar', 'Mitarbeiter 1', 'Nicht verfügbar: Testteppich: Sand, Greige – Kunde per Mail informiert']);
  assert.deepEqual(Object.values(api.einkaufAuftragsstatus().positionen).map(p => p.status), ['erledigt', 'erledigt']);
  // Faellt aus "Muster bestellen"/"nachhaken" (To-dos) und aus der Musterkunden-Liste.
  assert.deepEqual(todosFuer(api, '#T1'), []);
  assert.ok(!musterNachfassen(api.kundenBestellungen().zeilen, { jetzt: new Date('2026-10-30T10:00:00Z') }).offen.some(e => e.orderName === '#T1'));
  assert.notEqual(schrittT1(), 'Muster beim Lieferanten bestellen', 'kein "bestellen" mehr unter Kunden > Zu tun');

  const ev = sperrDatei(dir);
  assert.deepEqual(ev.map(e => [e.sku, e.farbe, e.produkt, e.orderId, e.von, e.grund, e.shopify.geschrieben]), [
    ['M-TEST-1', 'Sand', 'Testteppich', AUFTRAG, 'Mitarbeiter 1', 'nicht verfuegbar', true],
    ['M-TEST-2', 'Greige', 'Testteppich', AUFTRAG, 'Mitarbeiter 1', 'nicht verfuegbar', true],
  ]);
  assert.deepEqual(ev[0].shopify.vorher, { tracked: false, policy: 'DENY', menge: 0 });
  const liste = api.einkaufMusterlager().sperren;
  assert.deepEqual([liste.gesperrt.length, liste.offen.length, liste.fehler], [2, 0, null]);
  assert.match(liste.gesperrt[0].adminLink, /admin\.shopify\.com\/store\/.+\/products\/500\/variants\/\d+$/);

  // Zweiter Klick: kein zweiter Schreibvorgang in Shopify, kein doppeltes Ereignis.
  const vorher = shop.mutationen().length;
  const nochmal = await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'], notiz: 'doppelt' });
  assert.equal(nochmal.mustersperre.bereits, 1);
  assert.equal(shop.mutationen().length, vorher);
  assert.equal(sperrDatei(dir).length, 2);
});

test('Pflichtangaben: ohne Farbe und ohne Notiz 400, fremde Position 400, Warenbestellung 400 - nichts geschrieben', async () => {
  const { dir, shop, schritt } = umgebung();
  await assert.rejects(schritt(AUFTRAG, {}), e => e.status === 400 && /Farben/.test(e.message));
  await assert.rejects(schritt(AUFTRAG, { notiz: '   ', muster: [] }), e => e.status === 400);
  await assert.rejects(schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/3'] }), e => e.status === 400 && /dieser Bestellung/.test(e.message));
  assert.equal(fs.existsSync(path.join(dir, 'auftragsverlauf.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'mustersperre.json')), false);
  assert.equal(shop.mutationen().length, 0);
  // Nur Freitext, keine Farbe angekreuzt: Schritt gilt, im Shop wird nichts gesperrt.
  const nurText = await schritt(AUFTRAG, { notiz: 'Farbe Sand fehlt beim Lieferanten' });
  assert.equal(nurText.zeitleisteAbgeschlossen, true);
  assert.equal(nurText.mustersperre, undefined);
});

test('Rechte fehlen: nichts nach Shopify, Sperre steht als "im Shop noch zu sperren" mit Admin-Link; danach nachholen', async () => {
  const { dir, shop, api, schritt } = umgebung({ rechte: ['read_products', 'write_products'] });
  const r = await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'], notiz: 'per Mail' });
  assert.equal(r.zeitleisteAbgeschlossen, true, 'der Schritt gilt trotzdem');
  assert.deepEqual([r.mustersperre.status, r.mustersperre.offen, r.mustersperre.fehlendeRechte], ['offen', 1, ['write_inventory']]);
  assert.match(r.mustersperre.meldung, /noch zu sperren.*write_inventory/);
  assert.equal(shop.mutationen().length, 0, 'ohne Recht wird nichts geschrieben');
  const offen = api.einkaufMusterlager().sperren.offen;
  assert.deepEqual(offen.map(s => [s.sku, s.fehlerGrund]), [['M-TEST-1', 'recht-fehlt']]);
  assert.match(offen[0].adminLink, /products\?query=M-TEST-1$/);
  assert.equal(sperrDatei(dir)[0].shopify.geschrieben, false);

  // Recht freigeschaltet (Testattrappe), dann "Erneut sperren".
  const z2 = umgebung();
  fs.copyFileSync(path.join(dir, 'mustersperre.json'), path.join(z2.dir, 'mustersperre.json'));
  const n = await z2.api.einkaufMustersperreSetzen({ aktion: 'nachholen', sku: 'M-TEST-1' }, ICH);
  assert.match(n.meldung, /im Shop gesperrt/);
  assert.deepEqual([z2.api.einkaufMusterlager().sperren.gesperrt.length, z2.api.einkaufMusterlager().sperren.offen.length], [1, 0]);
});

test('Kein Zugang: Sperre offen mit Grund; Wieder verfuegbar nimmt sie ohne Shopify heraus', async () => {
  const { shop, api, schritt } = umgebung({ zugang: false });
  const r = await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/2'], notiz: 'x' });
  assert.equal(r.mustersperre.offen, 1);
  assert.match(r.mustersperre.meldung, /kein Zugang/);
  const f = await api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-2' }, ICH);
  assert.match(f.meldung, /aus der Liste genommen/);
  assert.deepEqual(api.einkaufMusterlager().sperren.offen, []);
  assert.equal(shop.aufrufe.length, 0);
});

test('Wieder verfuegbar: Stand vor der Sperre zurueck (ohne Bestandsverfolgung), protokolliert, zweimal = 409', async () => {
  const { dir, shop, api, schritt } = umgebung();
  await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'], notiz: 'x' });
  const v = shop.varianten[0];
  assert.equal(v.tracked, true);
  const f = await api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'm-test-1' }, ICH);
  assert.match(f.meldung, /wieder bestellbar/);
  assert.deepEqual([v.tracked, v.policy, v.menge], [false, 'DENY', 0]);
  assert.deepEqual(api.einkaufMusterlager().sperren.gesperrt, []);
  assert.deepEqual(sperrDatei(dir).map(e => e.grund), ['nicht verfuegbar', 'wieder verfuegbar']);
  await assert.rejects(api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH), e => e.status === 409);
  await assert.rejects(api.einkaufMustersperreSetzen({ aktion: 'quatsch', sku: 'M-TEST-1' }, ICH), e => e.status === 400);
});

test('Testbestellung sperrt nie echte Varianten', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-mustersperre-test-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [bestellung(5, [muster(5, 'Sand')], { test: true })] }));
  const shop = attrappe({ varianten: [variante('M-TEST-5')] });
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: {}, shopifyZugang: async () => ({ proxy: shop.proxy, art: 'client-credentials' }) });
  const r = await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: 'gid://shopify/Order/5', schritt: 'muster_nicht_verfuegbar', muster: ['gid://shopify/LineItem/5'] }, ICH);
  assert.equal(r.mustersperre.status, 'uebersprungen');
  assert.equal(shop.aufrufe.length, 0);
});

test('Beschaedigte Ablage: Schritt wird abgelehnt, nichts geschrieben; Musterlager zeigt nur diesen Block als Fehler', async () => {
  const { dir, shop, api, schritt } = umgebung();
  const kaputt = '{"version":1,"ereignisse":[{"sku"';
  fs.writeFileSync(path.join(dir, 'mustersperre.json'), kaputt);
  await assert.rejects(schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'], notiz: 'x' }), e => e.status === 500 && /beschädigt/.test(e.message));
  assert.equal(fs.existsSync(path.join(dir, 'auftragsverlauf.json')), false, 'auch kein Schritt');
  assert.equal(shop.aufrufe.length, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'mustersperre.json'), 'utf8'), kaputt);
  const lager = api.einkaufMusterlager();
  assert.equal(lager.verfuegbar, true);
  assert.match(lager.sperren.fehler, /beschädigt/);
});

test('Mailtext "Muster nicht verfuegbar": Farben eingesetzt, ohne Termin, Vorlage des Inhabers geht vor', () => {
  const mail = fuelleText(NICHT_VERFUEGBAR_VORLAGE, { kundenname: 'Erika Beispiel', absender: 'Anna', farben: ['Testteppich: Sand, Greige'] });
  assert.match(mail.text, /^Guten Tag Erika Beispiel,/);
  assert.match(mail.text, /– Testteppich: Sand, Greige/);
  assert.match(mail.text, /\/pages\/muster/);
  assert.doesNotMatch(mail.text, /\{|\}/, 'kein Platzhalter bleibt stehen');
  assert.doesNotMatch(mail.text, /\b(bis|ab) (zum|dem)? ?\d|Wochen|in Kürze|bald wieder/i, 'kein Versprechen auf einen Termin');
  const eigen = texteAusMarkdown('## Text 1 – E-Mail\n**Betreff:** A\nHallo\n---\n## Text 5 – Muster nicht verfügbar\n**Betreff:** Leider nicht da\nDiese Muster fehlen:\n{Farben}\n---\n');
  assert.equal(eigen.nichtVerfuegbar.betreff, 'Leider nicht da');
  assert.equal(eigen.erste.betreff, 'A');
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Rolle "lesen" bekommt 403 (Sperre und Schritt), Mitarbeiter ohne Notiz 400, mit Farben 200', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const dir = privat();
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = dir;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=mustersperre');
  delete process.env.TP_DASHBOARD_PASSWORT;
  const shop = attrappe({ varianten: [variante('M-TEST-1'), variante('M-TEST-2')] });
  mod.ersetzeShopifyZugang(async () => ({ proxy: shop.proxy, art: 'client-credentials' }));
  try {
    await mitServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const post = (keks, pfad, rumpf) => fetch(`${base}${pfad}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(rumpf) });
      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      const schritt = { aktion: 'schritt', orderId: AUFTRAG, schritt: 'muster_nicht_verfuegbar' };

      assert.equal((await post(lena, '/api/einkauf/auftragsstatus', { ...schritt, muster: ['gid://shopify/LineItem/1'] })).status, 403);
      assert.equal((await post(lena, '/api/einkauf/mustersperre', { aktion: 'freigeben', sku: 'M-TEST-1' })).status, 403);
      const ohne = await post(mona, '/api/einkauf/auftragsstatus', schritt);
      assert.equal(ohne.status, 400);
      assert.match((await ohne.json()).error, /Farben/);
      assert.equal(shop.aufrufe.length, 0);

      const ok = await post(mona, '/api/einkauf/auftragsstatus', { ...schritt, muster: ['gid://shopify/LineItem/1'] });
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).mustersperre.gesperrt, 1);
      const lesen = await (await fetch(`${base}/api/einkauf/mustersperre`, { headers: { cookie: lena } })).json();
      assert.deepEqual(lesen.gesperrt.map(s => [s.sku, s.von]), [['M-TEST-1', 'Mona Mitarbeiter']], 'lesen darf die Liste sehen');
      const frei = await post(mona, '/api/einkauf/mustersperre', { aktion: 'freigeben', sku: 'M-TEST-1' });
      assert.equal(frei.status, 200);
      assert.equal(shop.varianten[0].tracked, false);
    });
  } finally {
    mod.ersetzeShopifyZugang(null);
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});

test('Unlesbare Sperr-Gegenprobe: persistierter offener Fall wird im Shop wiederhergestellt, auch aus alter Ablage', async () => {
  const { dir, shop, api, schritt, z } = umgebung();
  let lesen = 0;
  z.proxy = { live: true, async execute(q, v) {
    if (q.includes('query MustersperreVariante') && ++lesen === 2) throw new Error('Gegenprobe nicht erreichbar');
    return shop.proxy.execute(q, v);
  } };
  const r = await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'] });
  assert.equal(r.mustersperre.status, 'offen');
  assert.equal(shop.varianten[0].tracked, true, 'Sperrmutation war trotz unlesbarer Gegenprobe erfolgreich');
  assert.equal(sperrDatei(dir)[0].shopify.aenderungMoeglich, true);
  assert.equal(api.einkaufMustersperre().offen[0].shopPruefen, true);
  z.zugang = false;
  await assert.rejects(api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH), e => e.status === 503);
  assert.equal(api.einkaufMustersperre().offen.length, 1, 'kein Zugang darf unklaren Fall nicht entfernen');

  // Der alte Dateistand kennt den neuen Marker nicht; der Vorstand beweist die Pruefpflicht.
  const alt = JSON.parse(fs.readFileSync(path.join(dir, 'mustersperre.json'), 'utf8'));
  delete alt.ereignisse[0].shopify.aenderungMoeglich;
  fs.writeFileSync(path.join(dir, 'mustersperre.json'), JSON.stringify(alt));
  const neu = createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: {}, shopifyZugang: async () => ({ proxy: shop.proxy, art: 'client-credentials' }) });
  const vorher = shop.aufrufe.length;
  const f = await neu.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH);
  assert.match(f.meldung, /wieder bestellbar/);
  assert.equal(shop.varianten[0].tracked, false, 'urspruenglicher untracked-Stand wiederhergestellt');
  assert.ok(shop.aufrufe.length > vorher, 'frische Shopify-Pruefung statt lokalem Entfernen');
  assert.deepEqual(neu.einkaufMustersperre().offen, []);
});

test('Freigabe nur teilweise ausgefuehrt: Fehler bleibt offen sichtbar, Wiederholung stellt exakten Vorstand her', async () => {
  const { dir, shop, api, schritt, z } = umgebung();
  shop.varianten[0].menge = 3;
  await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'] });
  z.proxy = { live: true, async execute(q, v) {
    if (q.includes('mutation MustersperreVerfolgung')) throw new Error('timeout before write');
    return shop.proxy.execute(q, v);
  } };
  await assert.rejects(api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH), e => e.status === 502 && /wiederhergestellt/.test(e.message));
  const offen = api.einkaufMustersperre().offen;
  assert.equal(offen.length, 1);
  assert.match(offen[0].freigabeFehler, /wiederhergestellt/);
  assert.equal(api.einkaufMustersperre().gesperrt.length, 0, 'Teilfeigabe ist keine bestaetigte Sperre mehr');
  assert.deepEqual(sperrDatei(dir)[0].shopify.vorher, { tracked: false, policy: 'DENY', menge: 3 });
  z.proxy = shop.proxy;
  const f = await api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH);
  assert.match(f.meldung, /wieder bestellbar/);
  assert.deepEqual([shop.varianten[0].tracked, shop.varianten[0].menge], [false, 3]);
  assert.equal(api.einkaufMustersperre().offen.length, 0);
});

test('Sicher nicht geschrieben: fehlende Rechte, initialer Lesefehler und erste Mutationsablehnung lokal entfernbar', async () => {
  for (const fall of ['rechte', 'lesen', 'mutation']) {
    const { shop, api, schritt, z } = umgebung(fall === 'rechte' ? { rechte: ['read_products'] } : {});
    if (fall !== 'rechte') z.proxy = { live: true, async execute(q, v) {
      if (fall === 'lesen' && q.includes('query MustersperreVariante')) throw new Error('Lesetimeout vor Mutation');
      if (fall === 'mutation' && q.includes('mutation MustersperreVerfolgung')) throw new Error('ACCESS_DENIED write_inventory');
      return shop.proxy.execute(q, v);
    } };
    await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'] });
    assert.equal(shop.varianten[0].tracked, false);
    assert.equal(api.einkaufMustersperre().offen[0].shopPruefen, false, fall);
    const vorher = shop.aufrufe.length;
    const f = await api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH);
    assert.match(f.meldung, /aus der Liste genommen/);
    assert.equal(shop.aufrufe.length, vorher, 'lokales Entfernen ohne Shopify-Aufruf');
    assert.equal(api.einkaufMustersperre().offen.length, 0);
  }
});

test('Globale Bestellbarkeit trotz Bestand 0: Erst- und Nachholversuch bleiben offen', async () => {
  const { shop, api, schritt, z } = umgebung();
  shop.varianten[0].tracked = true;
  z.proxy = { live: true, async execute(q, v) {
    const d = await shop.proxy.execute(q, v);
    for (const n of d.productVariants?.nodes || []) n.availableForSale = true;
    return d;
  } };
  const r = await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'] });
  assert.equal(r.mustersperre.offen, 1);
  await assert.rejects(api.einkaufMustersperreSetzen({ aktion: 'nachholen', sku: 'M-TEST-1' }, ICH), e => e.status === 502 && /Standorte/.test(e.message));
  assert.equal(api.einkaufMustersperre().offen.length, 1);
  assert.equal(api.einkaufMustersperre().gesperrt.length, 0);
  assert.equal(shop.mutationen().length, 0);
});

test('Sicher abgelehnte Sperre, neuer Bestand, Nachholen: Freigabe stellt frischen statt verworfenen Vorstand her', async () => {
  const { dir, shop, api, schritt, z } = umgebung();
  Object.assign(shop.varianten[0], { tracked: true, menge: 3 });
  z.proxy = { live: true, async execute(q, v) {
    if (q.includes('mutation MustersperreBestand')) throw new Error('ACCESS_DENIED write_inventory');
    return shop.proxy.execute(q, v);
  } };
  await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'] });
  assert.equal(shop.varianten[0].menge, 3, 'erste Mutation sicher nicht ausgefuehrt');
  assert.equal(sperrDatei(dir)[0].shopify.aenderungMoeglich, false);
  assert.equal(api.einkaufMustersperre().offen[0].shopPruefen, false);
  // Synthetischer Wareneingang vor dem ersten tatsaechlichen Sperren.
  shop.varianten[0].menge = 7;
  z.proxy = shop.proxy;
  await api.einkaufMustersperreSetzen({ aktion: 'nachholen', sku: 'M-TEST-1' }, ICH);
  assert.equal(shop.varianten[0].menge, 0);
  assert.equal(sperrDatei(dir)[1].shopify.vorher.menge, 7, 'frisch gelesene Ausgangslage vor echter Sperre');
  await api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH);
  assert.deepEqual([shop.varianten[0].tracked, shop.varianten[0].policy, shop.varianten[0].menge], [true, 'DENY', 7]);
  assert.equal(api.einkaufMustersperre().offen.length + api.einkaufMustersperre().gesperrt.length, 0);
});

test('Teilweise ausgefuehrte Sperre behaelt ersten Vorstand trotz neuer Menge vor dem Nachholen', async () => {
  const { dir, shop, api, schritt, z } = umgebung();
  Object.assign(shop.varianten[0], { tracked: true, policy: 'CONTINUE', menge: 3 });
  z.proxy = { live: true, async execute(q, v) {
    if (q.includes('mutation MustersperreRichtlinie')) throw new Error('ACCESS_DENIED write_products');
    return shop.proxy.execute(q, v);
  } };
  await schritt(AUFTRAG, { muster: ['gid://shopify/LineItem/1'] });
  assert.equal(shop.varianten[0].menge, 0, 'Bestandsmutation vor Richtlinienfehler erfolgreich');
  assert.equal(sperrDatei(dir)[0].shopify.aenderungMoeglich, true);
  assert.equal(api.einkaufMustersperre().offen[0].shopPruefen, true);
  shop.varianten[0].menge = 7;
  z.proxy = shop.proxy;
  await api.einkaufMustersperreSetzen({ aktion: 'nachholen', sku: 'M-TEST-1' }, ICH);
  await api.einkaufMustersperreSetzen({ aktion: 'freigeben', sku: 'M-TEST-1' }, ICH);
  assert.deepEqual([shop.varianten[0].tracked, shop.varianten[0].policy, shop.varianten[0].menge], [true, 'CONTINUE', 3], 'Teilmutation muss auf echten ersten Vorstand zurueck');
});
