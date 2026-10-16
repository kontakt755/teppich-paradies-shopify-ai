// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { postfachPfad, stopplistePfad, versandPfad, leseVersand, schreibeVersand, leseStoppliste } from '../../../operations/lib/nachfass-versand.mjs';
import { starteSmtpAttrappe, kopfzeile, rumpfText, betreffText } from '../../../operations/tests/smtp-attrappe.mjs';
import { bericht } from '../../../scripts/muster-nachfassen-senden.mjs';

// Nur erfundene Daten: Testkunden unter example.invalid, Produktnamen erfunden, Platzhalter statt Passwort.
const muster = (id, farbe) => ({
  id: `gid://shopify/LineItem/${id}`, sku: `M-TEST-${id}`, title: 'Muster Testvelours Teppich nach Maß', variantTitle: farbe, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: 'Produkt', value: 'Testvelours' }], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: `M-TEST-${id}`, title: farbe, metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster-testvelours', title: 'Muster Testvelours', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, zeilen, { kunde, datum = '2026-01-01T10:00:00Z' }) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: datum, cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${kunde}`, displayName: `Testkunde ${kunde}`, email: `testkunde${kunde}@example.invalid`, phone: null },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const ORDER = n => `gid://shopify/Order/${n}`;

const VORLAGE = `# Musterkunden nachfassen

## Text 1 – E-Mail nach 4–5 Tagen

**Betreff:** Ihre Muster – passt die Farbe?

Guten Tag {Anrede} {Nachname},

Ihre Muster sollten angekommen sein. Weitere Muster: {Link Muster}

Ihr gewähltes Produkt: {Link Produkt}

Freundliche Grüße
{Name}
Teppich Paradies Oranienburg

<small>Keine Nachfragen mehr? Antworten Sie mit „Abmelden“.</small>

---

## Text 2 – Kurze Erinnerung nach weiteren 10 Tagen

**Betreff:** Noch Fragen zu Ihrem neuen Boden?

Guten Tag {Anrede} {Nachname},

haben Sie sich schon entschieden?

Freundliche Grüße
{Name}
`;

function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-nachfassen-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(1, [muster(1, 'Sand'), muster(2, 'Greige')], { kunde: 1 }),
    bestellung(2, [muster(3, 'Sand')], { kunde: 2 }),
    bestellung(4, [muster(4, 'Kiesel')], { kunde: 4 }),
  ] }));
  fs.writeFileSync(path.join(dir, 'muster-nachfassen-texte.md'), VORLAGE);
  const uhr = { jetzt: new Date('2026-01-02T10:00:00Z') };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => uhr.jetzt });
  const schritt = (orderId, s) => api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId, schritt: s }, { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' });
  const zeile = orderId => api.kundenBestellungen().zeilen.find(z => z.orderId === orderId);
  const nachgefasst = orderId => zeile(orderId).verlauf.find(s => s.schritt === 'nachgefasst');
  const postfach = (port, extra = {}) => {
    fs.mkdirSync(path.dirname(postfachPfad(dir)), { recursive: true });
    fs.writeFileSync(postfachPfad(dir), JSON.stringify({ host: '127.0.0.1', port, sicherheit: 'keine', benutzer: 'kontakt@example.invalid', passwort: 'platzhalter-1', absender: 'kontakt@example.invalid', unterschrift: 'Ihr Team von Teppich Paradies', ...extra }), { mode: 0o600 });
  };
  return { dir, uhr, api, schritt, zeile, nachgefasst, postfach };
}

/** Alle drei Musterbestellungen bis "raus" bringen, dann fuenf Tage weiterdrehen. */
async function musterUnterwegs(u) {
  for (const n of [1, 2, 4]) { await u.schritt(ORDER(n), 'bestellt'); await u.schritt(ORDER(n), 'geliefert'); }
  u.uhr.jetzt = new Date('2026-01-06T10:00:00Z');
  for (const n of [1, 2, 4]) await u.schritt(ORDER(n), 'raus');
  u.uhr.jetzt = new Date('2026-01-11T09:30:00Z');
}

test('Trockenlauf (--probe): listet, schreibt nichts, braucht kein Postfach; ohne Postfach verschickt der echte Lauf nichts', async () => {
  const u = umgebung();
  await musterUnterwegs(u);
  u.api.kundenNachfassenAbmelden({ email: 'testkunde2@example.invalid', orderId: ORDER(2) }, { name: 'Anna', rolle: 'mitarbeiter' });

  const probe = await u.api.kundenNachfassenSenden({ probe: true, senden: async () => { throw new Error('darf in der Probe nicht senden'); } });
  assert.equal(probe.status, 'ok');
  assert.equal(probe.probe, true);
  assert.deepEqual(probe.geplant.map(e => [e.orderName, e.stufe, e.an]), [[ '#T1', 'erste', 'testkunde1@example.invalid' ], [ '#T4', 'erste', 'testkunde4@example.invalid' ]]);
  assert.match(probe.geplant[0].text, /^Guten Tag Testkunde 1,/);
  assert.doesNotMatch(probe.geplant[0].text, /[{}<>]/, 'kein Platzhalter, kein HTML');
  assert.doesNotMatch(probe.geplant[0].text, /gewähltes Produkt/, 'Zeile mit unsicherem Platzhalter faellt weg');
  assert.match(probe.geplant[0].text, /Freundliche Grüße\nIhr Team von Teppich Paradies/);
  assert.deepEqual(probe.uebersprungen, [{ orderId: ORDER(2), orderName: '#T2', stufe: 'erste', grund: 'abgemeldet' }]);
  assert.deepEqual(probe.verschickt, []);
  assert.equal(fs.existsSync(versandPfad(u.dir)), false, 'die Probe schreibt kein Protokoll');
  assert.equal(u.nachgefasst(ORDER(1)).zustand, 'offen');
  // Bericht fuer das Terminal: nennt Bestellnummer, Stufe und Adresse, nie den Text.
  const zeilen = bericht(probe);
  assert.match(zeilen[0], /^Trockenlauf/);
  assert.ok(zeilen.some(z => /würde senden\s+#T1\s+Erste Nachfrage\s+an testkunde1@example\.invalid/.test(z)));
  assert.ok(zeilen.some(z => /übersprungen\s+#T2\s+abgemeldet/.test(z)));
  assert.match(zeilen.at(-1), /^Anstehend: 2 · übersprungen: 1 · Fehler: 0$/);

  const echt = await u.api.kundenNachfassenSenden({ senden: async () => { throw new Error('darf ohne Postfach nicht senden'); } });
  assert.equal(echt.status, 'kein-zugang');
  assert.match(echt.hinweis, /nachfassen\/postfach\.json/);
  assert.deepEqual([echt.verschickt, echt.geplant], [[], []]);
  assert.equal(u.nachgefasst(ORDER(1)).zustand, 'offen');
  assert.match(bericht(echt).at(-1), /^Nichts verschickt: .*postfach\.json/);
});

test('Echter Lauf: Mail ueber das Postfach, Kopie ans Buero in der ersten Woche, Zeitleiste "nachgefasst" von automatisch, kein zweites Mal', async () => {
  const u = umgebung();
  await musterUnterwegs(u);
  u.api.kundenNachfassenAbmelden({ email: 'testkunde2@example.invalid' }, { name: 'Anna', rolle: 'mitarbeiter' });
  // #T4: Mail ging im letzten Lauf raus, dann brach er vor der Zeitleiste ab -> nur nachtragen.
  schreibeVersand(versandPfad(u.dir), { ersterVersandAm: null, letzterLauf: null, sendungen: [{ am: '2026-01-10T09:30:00.000Z', orderId: ORDER(4), orderName: '#T4', stufe: 'erste', an: 'testkunde4@example.invalid', betreff: 'Ihre Muster – passt die Farbe?', status: 'gesendet' }] });
  const s = await starteSmtpAttrappe();
  try {
    u.postfach(s.port);
    const r = await u.api.kundenNachfassenSenden();
    assert.equal(r.status, 'ok');
    assert.equal(r.kopie, 'kontakt@example.invalid', 'erste Woche: Blindkopie ans Buero');
    assert.deepEqual(r.verschickt.map(e => [e.orderName, e.stufe, e.an, e.kopie]), [['#T1', 'erste', 'testkunde1@example.invalid', 'kontakt@example.invalid']]);
    assert.deepEqual(r.nachgetragen.map(e => e.orderName), ['#T4']);
    assert.deepEqual(r.uebersprungen.map(e => [e.orderName, e.grund]), [['#T2', 'abgemeldet']]);
    assert.deepEqual(r.fehler, []);

    // Genau eine Mail, an den Kunden plus Blindkopie, Betreff und Text aus der Vorlage, Kundenname eingesetzt.
    assert.equal(s.nachrichten.length, 1);
    const n = s.nachrichten[0];
    assert.equal(n.von, 'kontakt@example.invalid');
    assert.deepEqual(n.an, ['testkunde1@example.invalid', 'kontakt@example.invalid']);
    assert.equal(kopfzeile(n.daten, 'From'), 'Teppich Paradies <kontakt@example.invalid>');
    assert.equal(kopfzeile(n.daten, 'To'), 'testkunde1@example.invalid');
    assert.equal(betreffText(n.daten), 'Ihre Muster – passt die Farbe?');
    const text = rumpfText(n.daten).replace(/\r\n/g, '\n');
    assert.match(text, /^Guten Tag Testkunde 1,/);
    assert.match(text, /Antworten Sie mit „Abmelden“\.$/);
    assert.doesNotMatch(text, /[{}<>]/);
    assert.deepEqual(s.anmeldungen.map(a => a.benutzer), ['kontakt@example.invalid']);

    // Zeitleiste: nachgefasst, von "automatisch", Notiz nennt die Stufe und den Betreff.
    const z1 = u.nachgefasst(ORDER(1));
    assert.deepEqual([z1.zustand, z1.von, z1.am], ['erledigt', 'automatisch', '2026-01-11T09:30:00.000Z']);
    assert.match(z1.notiz, /^Erste Nachfrage automatisch per E-Mail: „Ihre Muster – passt die Farbe\?“$/);
    assert.deepEqual([u.nachgefasst(ORDER(4)).zustand, u.nachgefasst(ORDER(4)).von], ['erledigt', 'automatisch'], 'nachgetragen ohne neue Mail');
    assert.equal(u.nachgefasst(ORDER(2)).zustand, 'offen', 'Abgemeldete bleiben unberuehrt');

    // Protokoll: Sendung vermerkt, erster Versand gesetzt, letzter Lauf gezaehlt.
    const v = leseVersand(versandPfad(u.dir));
    assert.equal(v.ersterVersandAm, '2026-01-11T09:30:00.000Z');
    assert.deepEqual(v.sendungen.map(x => [x.orderName, x.stufe, x.status, x.kopie]), [['#T4', 'erste', 'vermerkt', undefined], ['#T1', 'erste', 'vermerkt', 'kontakt@example.invalid']]);
    assert.match(v.sendungen[1].messageId, /@example\.invalid>$/);
    assert.deepEqual(v.letzterLauf, { am: '2026-01-11T09:30:00.000Z', verschickt: 1, nachgetragen: 1, uebersprungen: 1, fehler: 0, kopie: 'kontakt@example.invalid' });

    // Die Karte sieht denselben Stand: Erledigt mit "automatisch", #T2 abgemeldet, Versand eingerichtet mit Kopie bis.
    const { musterNachfassen } = await import('../lib/muster-nachfassen.mjs');
    const t = u.api.kundenMusterTexte();
    assert.deepEqual([t.versand.eingerichtet, t.versand.hinweis, t.versand.letzterLauf.verschickt, t.versand.mitlesenBis], [true, null, 1, '2026-01-18T09:30:00.000Z']);
    assert.deepEqual(t.abgemeldet.map(e => e.email), ['testkunde2@example.invalid']);
    const stand = musterNachfassen(u.api.kundenBestellungen().zeilen, { jetzt: u.uhr.jetzt, abgemeldet: new Map(t.abgemeldet.map(e => [e.email, e])) });
    assert.deepEqual(stand.offen, []);
    assert.deepEqual(stand.abgemeldet.map(e => e.orderName), ['#T2']);
    assert.deepEqual(stand.erledigt.map(e => [e.orderName, e.von]).sort(), [['#T1', 'automatisch'], ['#T4', 'automatisch']]);

    // Gleich noch einmal: nichts mehr offen, keine zweite Mail.
    const r2 = await u.api.kundenNachfassenSenden();
    assert.deepEqual([r2.verschickt, r2.nachgetragen, s.nachrichten.length], [[], [], 1]);

    // Zehn Tage spaeter: Erinnerung - die Woche mit Kopie ist vorbei, also ohne Blindkopie.
    u.uhr.jetzt = new Date('2026-01-21T09:30:00Z');
    const r3 = await u.api.kundenNachfassenSenden();
    assert.equal(r3.kopie, null);
    assert.deepEqual(r3.verschickt.map(e => [e.orderName, e.stufe, e.kopie]).sort(), [['#T1', 'erinnerung', null], ['#T4', 'erinnerung', null]]);
    assert.equal(s.nachrichten.length, 3);
    const e1 = s.nachrichten.find(m => m.an.includes('testkunde1@example.invalid') && betreffText(m.daten).startsWith('Noch Fragen'));
    assert.deepEqual(e1.an, ['testkunde1@example.invalid'], 'keine Blindkopie mehr');
    assert.match(rumpfText(e1.daten), /schon entschieden\?/);
    assert.equal(u.nachgefasst(ORDER(1)).anzahl, 2);
    assert.match(u.nachgefasst(ORDER(1)).notiz, /^Erinnerung automatisch per E-Mail/);

    // Danach nie wieder (hoechstens eine Erinnerung).
    u.uhr.jetzt = new Date('2026-01-31T09:30:00Z');
    const r4 = await u.api.kundenNachfassenSenden();
    assert.deepEqual([r4.verschickt, s.nachrichten.length], [[], 3]);
  } finally { await s.schliessen(); }
});

test('Schutz: Platzhalter in der Vorlage, abgelehnte Anmeldung, kaputte Stoppliste - nichts geht raus, Zeitleiste bleibt offen', async () => {
  const u = umgebung();
  await musterUnterwegs(u);
  // Vorlage mit einem Platzhalter, den niemand fuellen kann: Betreff bleibt stehen -> Fehler je Kunde, nichts verschickt.
  fs.writeFileSync(path.join(u.dir, 'muster-nachfassen-texte.md'), VORLAGE.replace('**Betreff:** Ihre Muster – passt die Farbe?', '**Betreff:** Ihre Muster, {Vorname}'));
  const p = await u.api.kundenNachfassenSenden({ probe: true });
  assert.deepEqual(p.geplant, []);
  assert.deepEqual(p.fehler.map(e => [e.orderName, e.fehler]), [['#T1', 'In der Vorlage bliebe ein Platzhalter stehen – nicht verschickt.'], ['#T2', 'In der Vorlage bliebe ein Platzhalter stehen – nicht verschickt.'], ['#T4', 'In der Vorlage bliebe ein Platzhalter stehen – nicht verschickt.']]);
  fs.writeFileSync(path.join(u.dir, 'muster-nachfassen-texte.md'), VORLAGE);

  // Postfach lehnt die Anmeldung ab: Fehler je Kunde, Protokoll "fehler", Zeitleiste offen - der naechste Lauf versucht es wieder.
  const kaputt = await starteSmtpAttrappe({ authFehlschlag: true });
  try {
    u.postfach(kaputt.port);
    const r = await u.api.kundenNachfassenSenden();
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.verschickt, []);
    assert.equal(r.fehler.length, 3);
    assert.match(r.fehler[0].fehler, /Anmeldung ab \(535\)/);
    assert.doesNotMatch(JSON.stringify(r), /platzhalter-1/, 'das Passwort steht nirgends im Ergebnis');
    assert.equal(kaputt.nachrichten.length, 0);
    assert.equal(u.nachgefasst(ORDER(1)).zustand, 'offen');
    const v = leseVersand(versandPfad(u.dir));
    assert.deepEqual(v.sendungen.map(x => x.status), ['fehler', 'fehler', 'fehler']);
    assert.equal(v.ersterVersandAm, null, 'ein Fehlversuch zaehlt nicht als erster Versand');
    assert.equal(v.letzterLauf.fehler, 3);
    assert.doesNotMatch(fs.readFileSync(versandPfad(u.dir), 'utf8'), /platzhalter-1/);
  } finally { await kaputt.schliessen(); }

  const heil = await starteSmtpAttrappe();
  try {
    u.postfach(heil.port);
    // Kaputte Stoppliste: lieber niemanden anschreiben als einen Abgemeldeten.
    fs.mkdirSync(path.dirname(stopplistePfad(u.dir)), { recursive: true });
    fs.writeFileSync(stopplistePfad(u.dir), '{kaputt');
    const st = await u.api.kundenNachfassenSenden();
    assert.equal(st.status, 'stoerung');
    assert.match(st.hinweis, /stoppliste\.json ist beschädigt/);
    assert.equal(heil.nachrichten.length, 0);
    fs.rmSync(stopplistePfad(u.dir));

    // Jetzt geht es: die drei Fehlversuche sperren nicht.
    const r = await u.api.kundenNachfassenSenden();
    assert.deepEqual(r.verschickt.map(e => e.orderName), ['#T1', '#T2', '#T4']);
    assert.equal(heil.nachrichten.length, 3);
  } finally { await heil.schliessen(); }
});

test('Abmelden: Rolle lesen darf nicht, Adresse Pflicht, Antwort traegt den frischen Kartenstand', () => {
  const u = umgebung();
  assert.throws(() => u.api.kundenNachfassenAbmelden({ email: 'a@example.invalid' }, { name: 'Lena', rolle: 'lesen' }), /Rolle „lesen“/);
  assert.throws(() => u.api.kundenNachfassenAbmelden({ email: 'a@example.invalid' }, null), /anmelden/);
  assert.throws(() => u.api.kundenNachfassenAbmelden({ email: 'ohne-at' }, { name: 'Anna', rolle: 'mitarbeiter' }), /gültige E-Mail/);
  const r = u.api.kundenNachfassenAbmelden({ email: 'Testkunde1@example.invalid', orderId: ORDER(1), orderName: '#T1' }, { name: 'Anna', rolle: 'mitarbeiter' });
  assert.deepEqual([r.ok, r.neu, r.eintrag.von, r.eintrag.orderId], [true, true, 'Anna', ORDER(1)]);
  assert.deepEqual(r.stand.abgemeldet.map(e => [e.email, e.von]), [['testkunde1@example.invalid', 'Anna']]);
  assert.equal(r.stand.versand.eingerichtet, false);
  assert.equal(u.api.kundenNachfassenAbmelden({ email: 'testkunde1@example.invalid' }, { name: 'Bernd', rolle: 'mitarbeiter' }).neu, false);
  assert.equal(Object.keys(leseStoppliste(stopplistePfad(u.dir))).length, 1);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: POST /api/kunden/nachfassen-abmelden steht in der write-Liste (lesen 403, mitarbeiter 200), GET muster-texte zeigt die Stoppliste', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-nachfassen-server-'));
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=nachfassen');
  delete process.env.TP_DASHBOARD_PASSWORT;

  await mitServer(mod.requestHandler, async base => {
    const anmelden = async (name, passwort) => {
      const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
      assert.equal(r.status, 200);
      return r.headers.get('set-cookie').split(';')[0];
    };
    const abmelden = (keks, rumpf) => fetch(`${base}/api/kunden/nachfassen-abmelden`, { method: 'POST', headers: { 'content-type': 'application/json', ...(keks ? { cookie: keks } : {}) }, body: JSON.stringify(rumpf) });
    assert.equal((await abmelden(null, { email: 'a@example.invalid' })).status, 401);
    const lena = await anmelden('lena', 'platzhalter-lesen-1');
    assert.equal((await abmelden(lena, { email: 'a@example.invalid' })).status, 403);
    const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
    assert.equal((await abmelden(mona, { email: 'ohne-at' })).status, 400);
    const ok = await abmelden(mona, { email: 'kunde@example.invalid', orderId: 'gid://shopify/Order/7', orderName: '#T7' });
    assert.equal(ok.status, 200);
    const j = await ok.json();
    assert.deepEqual([j.ok, j.neu, j.eintrag.von], [true, true, 'Mona Mitarbeiter'], 'wer eintraegt, kommt aus der Sitzung');
    const texte = await (await fetch(`${base}/api/kunden/muster-texte`, { headers: { cookie: lena } })).json();
    assert.deepEqual(texte.abgemeldet.map(e => e.email), ['kunde@example.invalid']);
    assert.equal(texte.versand.eingerichtet, false);
  });
});
