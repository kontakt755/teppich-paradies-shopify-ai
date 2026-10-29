import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leiteTodosAb, zaehleTodos, werWartet, sichtFuer, sortiereTodos, tonNachAlter, alterText, tageSeit,
  tailscaleHinweis, speicherHinweis,
} from '../lib/todos.mjs';

// Nur erfundene Daten: Testkunden und Lieferanten-Pseudonyme.
const JETZT = new Date('2026-10-01T10:00:00');
const vorTagen = n => new Date(JETZT.getTime() - n * 86400000).toISOString();

let lfd = 0;
function zeile({ name = 'Testkunde', tage = 0, bezahlt = 'PAID', ampel = 'gruen', hinweise = [], positionen = [{}], test: istTest = false, storniert = false, offen = true } = {}) {
  lfd += 1;
  const id = `gid://shopify/Order/${lfd}`;
  return {
    orderId: id, orderName: `#T${lfd}`, datum: vorTagen(tage), kundenname: name, kundenSchluessel: `email:kunde${lfd}@example.invalid`,
    zahlungsstatus: bezahlt, testbestellung: istTest, storniert, offen,
    auftrag: {
      id, name: `#T${lfd}`, ampel, hinweise,
      positionen: positionen.map((p, i) => ({ lineItemId: `li-${lfd}-${i}`, menge: 1, titel: 'Testboden Eiche', kundenmenge: '12 m²', lieferant: 'A', istMuster: false, ...p })),
    },
  };
}
const stand = (z, i, eintrag) => ({ [`${z.orderId}::${z.auftrag.positionen[i].lineItemId}`]: eintrag });
const arten = todos => todos.map(t => t.art);

test('Alter, Ton und Text', () => {
  assert.equal(tageSeit(vorTagen(3), JETZT), 3);
  assert.equal(tageSeit(null, JETZT), null);
  assert.equal(tageSeit('kein Datum', JETZT), null);
  assert.deepEqual([0, 6, 7, 13, 14, 30].map(t => tonNachAlter(t)), ['', '', 'warn', 'warn', 'crit', 'crit']);
  assert.equal(tonNachAlter(null), '');
  assert.deepEqual([0, 1, 5].map(alterText), ['heute', '1 Tag', '5 Tage']);
});

test('Sortierung: rot vor gelb vor normal, darin das Aelteste zuerst, sonst Eingangsreihenfolge', () => {
  const liste = [
    { id: 'n-jung', ton: '', alterTage: 1 }, { id: 'w', ton: 'warn', alterTage: 2 }, { id: 'c-jung', ton: 'crit', alterTage: 1 },
    { id: 'n-alt', ton: '', alterTage: 9 }, { id: 'c-alt', ton: 'crit', alterTage: 20 }, { id: 'n-ohne', ton: '', alterTage: null },
    { id: 'n-alt-2', ton: '', alterTage: 9 },
  ];
  assert.deepEqual(sortiereTodos(liste).map(t => t.id), ['c-alt', 'c-jung', 'w', 'n-alt', 'n-alt-2', 'n-jung', 'n-ohne']);
});

test('bezahlt und noch nicht bestellt: ein To-do je Lieferant und Art, mit einem Knopf zum Bestellen', () => {
  const a = zeile({ name: 'Kunde Eins', tage: 1 });
  const b = zeile({ name: 'Kunde Zwei', tage: 4, positionen: [{}, { lieferant: 'B', istMuster: true, titel: 'Muster: Testvelours' }] });
  const todos = leiteTodosAb({ bestellzeilen: [a, b] }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(arten(todos), ['bestellen', 'bestellen']);
  const ware = todos.find(t => /Ware bei Lieferant A/.test(t.titel));
  assert.ok(ware, 'Ware fuer Lieferant A zusammengefasst');
  assert.match(ware.kontext, /Kunde Eins, Kunde Zwei · 2 Positionen · bezahlt, Bestellung vor 4 Tagen/);
  assert.equal(ware.ton, 'warn', 'ab 3 Tagen gelb');
  assert.deepEqual(ware.knopf, { text: 'Bestellen', href: '#/einkauf?lf=A' });
  const muster = todos.find(t => /Muster bei Lieferant B/.test(t.titel));
  // Muster: Produkt (und Farben) statt Menge und "Muster:"-Vorsatz.
  assert.match(muster.kontext, /Kunde Zwei · Testvelours · bezahlt/);
  for (const t of todos) assert.equal(Object.keys(t.knopf).filter(k => k !== 'text').length, 1, 'genau ein Ziel je To-do');
});

test('Muster-To-dos nennen Produkt, Farben und den Lagerplatz - ohne Klick in die Bestellung', () => {
  const bestellen = zeile({ name: 'Kunde Drei', tage: 1, positionen: [
    { istMuster: true, titel: 'Muster Testvelours Teppichboden 400cm', farbe: 'Sand' },
    { istMuster: true, titel: 'Muster Testvelours Teppichboden 400cm', farbe: 'Greige' },
  ] });
  const lager = zeile({ name: 'Kunde Vier', tage: 1, positionen: [
    { istMuster: true, titel: 'Muster Testlino Linoleumboden 200cm', farbe: 'Grau', musterHerkunft: 'eigen_versand', musterHerkunftQuelle: 'lager', musterLager: { id: 'ml-1', ort: 'Regal B, Fach 3', artLabel: 'Probestück 2 × 1 m' } },
  ] });
  const todos = leiteTodosAb({ bestellzeilen: [bestellen, lager] }, { sicht: 'laden', jetzt: JETZT });
  const b = todos.find(t => t.art === 'bestellen');
  assert.match(b.kontext, /Kunde Drei · Testvelours Teppichboden: Sand, Greige · bezahlt/);
  const v = todos.find(t => t.art === 'muster_eigen');
  assert.equal(v.titel, 'Muster verschicken an Kunde Vier');
  assert.match(v.kontext, /Testlino Linoleumboden: Grau · aus dem Musterlager \(Regal B, Fach 3\)/);
  assert.equal(todos.filter(t => t.art === 'bestellen').length, 1, 'Lagerware wird nicht beim Lieferanten bestellt');
});

test('unbezahlt, storniert, Test oder schon bestellt: kein Bestell-To-do', () => {
  const unbezahlt = zeile({ bezahlt: 'PENDING' });
  const storniert = zeile({ storniert: true });
  const testkauf = zeile({ test: true });
  const zu = zeile({ offen: false });
  const bestellt = zeile({});
  const todos = leiteTodosAb({
    bestellzeilen: [unbezahlt, storniert, testkauf, zu, bestellt],
    statusAlle: stand(bestellt, 0, { status: 'bestellt', bestelltAm: vorTagen(2) }),
  }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(todos, []);
});

test('Verzug: nach mehr als 10 Werktagen ohne Wareneingang nachfragen, ab 16 Werktagen rot', () => {
  // JETZT ist Donnerstag, 01.10.: vor 8 Tagen = 6 Werktage, vor 15 Tagen = 11, vor 23 Tagen = 16.
  const a = zeile({ name: 'Kunde Acht', tage: 10 });
  const b = zeile({ name: 'Kunde Fuenfzehn', tage: 20, positionen: [{ lieferant: 'C' }] });
  const c = zeile({ name: 'Kunde Lang', tage: 30, positionen: [{ lieferant: 'D' }] });
  const statusAlle = {
    ...stand(a, 0, { status: 'bestellt', bestelltAm: vorTagen(8) }),
    ...stand(b, 0, { status: 'bestellt', bestelltAm: vorTagen(15) }),
    ...stand(c, 0, { status: 'bestellt', bestelltAm: vorTagen(23) }),
  };
  const todos = leiteTodosAb({ bestellzeilen: [a, b, c], statusAlle }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(todos.map(t => [t.art, t.ton, t.alterTage]), [['nachhaken', 'crit', 23], ['nachhaken', 'warn', 15]]);
  assert.equal(todos[1].titel, 'Beim Lieferanten nachfragen: Ware seit 15 Tagen bestellt, noch nicht da');
  assert.match(todos[1].kontext, /^Lieferant C · Kunde Fuenfzehn/);
  assert.equal(todos[1].knopf.href, '#/einkauf?ab=verzug', 'direkt in die Verzugsliste mit fertiger Nachfrage');
});

test('blockierte Bestellung ("Zuerst klären") ist rot und erscheint nicht zusaetzlich als Bestell-To-do', () => {
  const rot = zeile({ name: 'Kunde Rot', tage: 2, ampel: 'rot', hinweise: ['1 Position(en) ohne Großhändler-ID', 'Verlegung gebucht', 'drittes'] });
  const todos = leiteTodosAb({ bestellzeilen: [rot] }, { sicht: 'laden', jetzt: JETZT, klartext: h => h.replace('Position(en)', 'Position') });
  assert.deepEqual(arten(todos), ['blockiert']);
  assert.equal(todos[0].ton, 'crit');
  assert.equal(todos[0].kontext, 'Kunde Rot · 1 Position ohne Großhändler-ID · Verlegung gebucht');
  assert.match(todos[0].knopf.href, /^#\/einkauf\?/);
  assert.equal(new URLSearchParams(todos[0].knopf.href.split('?')[1]).get('auftrag'), rot.orderId);
});

test('Rueckrufe: nur faellige - Wiedervorlage in der Zukunft und Erledigtes ruhen', () => {
  const offen = zeile({ name: 'Kunde Ruf', tage: 3 });   // bezahlt: trotzdem erst anrufen, dann bestellen
  const spaeter = zeile({ bezahlt: 'PENDING' });
  const erledigt = zeile({ bezahlt: 'PENDING' });
  const angerufen = zeile({ bezahlt: 'PENDING' });
  const rueckrufe = [
    { orderId: offen.orderId, status: 'nicht_erreicht', wiedervorlage: '2026-10-01', kundenname: 'Kunde Ruf', thema: 'Beratung gewünscht', telefon: '030 000000', wunschzeit: 'vormittags' },
    { orderId: spaeter.orderId, status: 'offen', wiedervorlage: '2026-10-05', thema: 'Maßprüfung' },
    { orderId: erledigt.orderId, status: 'erledigt', thema: 'Beratung' },
    { orderId: angerufen.orderId, status: 'angerufen', wiedervorlage: null, thema: 'Beratung' },
  ];
  const todos = leiteTodosAb({ bestellzeilen: [offen, spaeter, erledigt, angerufen], rueckrufe }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(arten(todos), ['rueckruf']);
  assert.equal(todos[0].titel, 'Zurückrufen: Kunde Ruf');
  assert.match(todos[0].kontext, /Beratung gewünscht · #T\d+ · Wunschzeit vormittags · zuletzt nicht erreicht/);
  assert.equal(todos[0].ton, 'warn', 'ab 2 Tagen gelb');
  const ziel = new URLSearchParams(todos[0].knopf.href.split('?')[1]);
  assert.equal(ziel.get('tab'), 'rueckrufe'); assert.equal(ziel.get('auftrag'), offen.orderId);
});

test('Ware liegt bei uns: ein To-do je Bestellung, Alter seit Wareneingang', () => {
  const z = zeile({ name: 'Kunde Lager', tage: 20, positionen: [{}, {}] });
  const statusAlle = { ...stand(z, 0, { status: 'geliefert', geliefertAm: vorTagen(2) }), ...stand(z, 1, { status: 'geliefert', geliefertAm: vorTagen(9) }) };
  const todos = leiteTodosAb({ bestellzeilen: [z], statusAlle }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(todos.map(t => [t.art, t.alterTage, t.ton]), [['rausgeben', 9, 'warn']]);
  assert.match(todos[0].titel, /Ware ist da – an Kunde Lager rausgeben/);
});

test('offene Faelle: Angebote erst nach einer Woche ohne Antwort, Warenkoerbe nie', () => {
  const faelle = [
    { schluessel: 'vorgang:1', name: 'Kunde Angebot', telefon: null, email: 'a@example.invalid', punkte: [{ quelle: 'angebot', bezug: 'A-7', tage: 15 }] },
    { schluessel: 'vorgang:2', name: 'Kunde Frisch', punkte: [{ quelle: 'angebot', bezug: 'A-8', tage: 2 }] },
    { schluessel: 'vorgang:3', name: 'Kunde Korb', punkte: [{ quelle: 'warenkorb', tage: 30 }] },
  ];
  const todos = leiteTodosAb({ faelle }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(todos.map(t => [t.art, t.ton, t.titel]), [['angebot', 'crit', 'Angebot nachfassen: Kunde Angebot']]);
  assert.equal(todos[0].kontext, 'A-7 · seit 15 Tagen ohne Antwort · nur E-Mail hinterlegt');
});

const AUFGABEN = [
  { id: 'a1', typ: 'TASK', status: 'PLANNED', titel: 'Angebot Musterstrasse nachtragen', bereich: 'Kunden', verantwortlich: null, dringlichkeit: 'ueberfaellig', faellig: '2026-09-28', technisch: false, darfAendern: true },
  { id: 'a2', typ: 'TASK', status: 'PLANNED', titel: 'Kasse abrechnen', bereich: 'Laden', verantwortlich: 'vk', dringlichkeit: 'jetzt', faellig: '2026-10-01', technisch: false, darfAendern: true },
  { id: 'a3', typ: 'TASK', status: 'PLANNED', titel: 'Filter im Shop reparieren', bereich: 'Online-Shop', verantwortlich: 'web', dringlichkeit: 'ueberfaellig', faellig: '2026-09-30', technisch: true, darfAendern: false },
  { id: 'a4', typ: 'TASK', status: 'INBOX', titel: 'Produkttexte pruefen', bereich: 'Website & KI', verantwortlich: null, dringlichkeit: 'jetzt', prioritaet: 'URGENT', technisch: true, darfAendern: false },
  { id: 'a5', typ: 'TASK', status: 'PLANNED', titel: 'Hat Zeit', bereich: 'Laden', verantwortlich: 'vk', dringlichkeit: 'weitere', technisch: false },
  { id: 'a6', typ: 'TASK', status: 'WAITING', titel: 'Wartet auf Antwort', bereich: 'Laden', verantwortlich: 'vk', dringlichkeit: 'ueberfaellig', faellig: '2026-09-01', technisch: false },
  { id: 'a7', typ: 'NOTE', status: 'INBOX', titel: 'Notiz', bereich: 'Laden', dringlichkeit: null, technisch: false },
  { id: 'a8', typ: 'TASK', status: 'PLANNED', titel: 'Steuerberater anrufen', bereich: 'Buchhaltung', verantwortlich: 'chef', dringlichkeit: 'jetzt', faellig: '2026-10-01', technisch: false, darfAendern: true },
  { id: 'a9', typ: 'TASK', status: 'PLANNED', titel: 'Lager aufraeumen', bereich: 'Lager', verantwortlich: 'lager', dringlichkeit: 'jetzt', faellig: '2026-10-01', technisch: false, darfAendern: false },
];
const FREIGABEN = [
  { number: 11, title: 'Ratgeber Testthema', status: 'freigabe', open: true, updatedAt: vorTagen(1) },
  { number: 12, title: 'Preisliste Test', status: 'review', reviewer: 'mensch', open: true, updatedAt: vorTagen(2) },
  { number: 13, title: 'KI prueft selbst', status: 'review', reviewer: 'ki', open: true, updatedAt: vorTagen(2) },
  { number: 14, title: 'In Arbeit', status: 'in-arbeit', open: true, updatedAt: vorTagen(2) },
];

test('Verkaeufer (Laden): Kunden- und Einkaufsschritte, eigene und freie Team-Aufgaben - nichts Technisches, keine Freigaben', () => {
  const kunde = zeile({ name: 'Kunde Eins', tage: 0 });
  const todos = leiteTodosAb({ bestellzeilen: [kunde], aufgaben: AUFGABEN, freigaben: FREIGABEN, shopwache: { verfuegbar: true, ampel: 'rot', befunde: [{ titel: 'Startseite' }] } },
    { sicht: 'laden', ich: 'vk', jetzt: JETZT });
  assert.deepEqual(todos.map(t => t.id), ['aufgabe:a1', 'aufgabe:a2', 'bestellen:A|ware']);
  assert.equal(todos[0].kontext, 'Kunden · überfällig seit 3 Tagen · noch niemandem zugewiesen');
  assert.equal(todos[0].ton, 'crit');
  assert.equal(todos[1].kontext, 'Laden · heute fällig');
  assert.equal(todos[1].knopf.href, '#/organisation?oid=a2');
});

test('technischer Mitarbeiter (Website): eigene und herrenlose Technik-Aufgaben', () => {
  const todos = leiteTodosAb({ bestellzeilen: [zeile({})], aufgaben: AUFGABEN, freigaben: FREIGABEN }, { sicht: 'website', ich: 'web', jetzt: JETZT });
  assert.deepEqual(todos.map(t => t.id), ['aufgabe:a3', 'aufgabe:a4']);
  assert.equal(todos[1].kontext, 'Website & KI · dringend · noch niemandem zugewiesen');
  const fremd = leiteTodosAb({ aufgaben: AUFGABEN }, { sicht: 'website', ich: 'anderer', jetzt: JETZT });
  assert.deepEqual(fremd.map(t => t.id), ['aufgabe:a4'], 'fremde zugewiesene Technik-Aufgabe gehoert nicht dazu');
});

test('Inhaber: Freigaben, alles Rote aus Laden und Website, eigene faellige Aufgaben - Gelbes der anderen nicht', () => {
  const rot = zeile({ name: 'Kunde Rot', tage: 1, ampel: 'rot', hinweise: ['Maßprüfung: abweichung'] });
  const normal = zeile({ name: 'Kunde Normal', tage: 0 });
  const todos = leiteTodosAb({ bestellzeilen: [rot, normal], aufgaben: AUFGABEN, freigaben: FREIGABEN, shopwache: { verfuegbar: true, ampel: 'rot', geprueftAm: vorTagen(0), befunde: [{ titel: 'Startseite nicht erreichbar' }, { titel: 'x' }] } },
    { sicht: 'inhaber', ich: 'chef', jetzt: JETZT });
  assert.deepEqual(todos.map(t => t.id), ['aufgabe:a1', 'blockiert:' + rot.orderId, 'aufgabe:a3', 'shopwache', 'aufgabe:a8', 'freigabe:12', 'freigabe:11']);
  const freigabe = todos.find(t => t.id === 'freigabe:11');
  assert.deepEqual(freigabe.knopf, { text: 'Ansehen & freigeben', aufgabe: 11 });
  assert.equal(freigabe.titel, 'Freigabe: Ratgeber Testthema');
  assert.equal(todos.find(t => t.id === 'shopwache').kontext, 'Startseite nicht erreichbar · +1 weitere');
  assert.match(todos.find(t => t.id === 'aufgabe:a3').kontext, /bei web$/);
});

test('Sprungfelder: Inhaber sieht in Laden und Website alles, nicht nur Eigenes', () => {
  const quellen = { bestellzeilen: [zeile({})], aufgaben: AUFGABEN };
  assert.deepEqual(zaehleTodos(quellen, { ich: 'chef', jetzt: JETZT }), { laden: 5, website: 2, alles: 7 });
  const laden = leiteTodosAb(quellen, { sicht: 'laden', ich: 'chef', alle: true, jetzt: JETZT });
  assert.equal(laden.length, 5);
  assert.ok(laden.some(t => t.id === 'aufgabe:a9'), 'auch Aufgaben anderer');
  const eigene = leiteTodosAb(quellen, { sicht: 'laden', ich: 'chef', jetzt: JETZT });
  assert.ok(!eigene.some(t => t.id === 'aufgabe:a9' || t.id === 'aufgabe:a2'));
});

test('Shop-Wache gruen oder nicht verfuegbar: kein To-do', () => {
  assert.deepEqual(leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', befunde: [] } }, { sicht: 'website' }), []);
  assert.deepEqual(leiteTodosAb({ shopwache: { verfuegbar: false } }, { sicht: 'website' }), []);
  assert.equal(leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gelb', befunde: [] } }, { sicht: 'website' })[0].ton, 'warn');
});

test('ohne Daten: leere Liste statt Fehler', () => {
  assert.deepEqual(leiteTodosAb(), []);
  assert.deepEqual(leiteTodosAb({ bestellzeilen: null, aufgaben: null }, { sicht: 'gibt-es-nicht' }), []);
  assert.deepEqual(werWartet(), { wir: [], lieferant: [], kunde: [], gesamt: 0 });
});

test('Startseite je Zustaendigkeit: keine neue Rolle, sondern Rolle + zugewiesene Bereiche', () => {
  assert.equal(sichtFuer(null, AUFGABEN), 'inhaber', 'Notzugang gilt als Inhaber');
  assert.equal(sichtFuer({ rolle: 'inhaber', kuerzel: 'chef' }, AUFGABEN), 'inhaber');
  assert.equal(sichtFuer({ rolle: 'mitarbeiter', kuerzel: 'vk' }, AUFGABEN), 'laden');
  assert.equal(sichtFuer({ rolle: 'mitarbeiter', kuerzel: 'WEB' }, AUFGABEN), 'website', 'Kuerzel ohne Ruecksicht auf Gross/Klein');
  assert.equal(sichtFuer({ rolle: 'mitarbeiter', kuerzel: 'neu' }, AUFGABEN), 'laden', 'ohne eigene Aufgaben: Laden');
  assert.equal(sichtFuer({ rolle: 'lesen', name: 'Gast' }, []), 'laden');
  const halb = [{ typ: 'TASK', status: 'PLANNED', verantwortlich: 'x', technisch: true }, { typ: 'TASK', status: 'PLANNED', verantwortlich: 'x', technisch: false }];
  assert.equal(sichtFuer({ rolle: 'mitarbeiter', kuerzel: 'x' }, halb), 'laden', 'Gleichstand: Laden');
});

test('Wer wartet auf was: jede laufende Bestellung genau einmal, in der Spalte dessen, der dran ist', () => {
  const bestellen = zeile({ name: 'K Bestellen', tage: 1, positionen: [{ istMuster: true }] });
  const beimLieferanten = zeile({ name: 'K Lieferant', tage: 6, positionen: [{ lieferant: 'B' }] });
  const nachhaken = zeile({ name: 'K Nachhaken', tage: 20 });
  const da = zeile({ name: 'K Ware da', tage: 12 });
  const raus = zeile({ name: 'K Muster raus', tage: 9, positionen: [{ istMuster: true }] });
  const unbezahlt = zeile({ name: 'K Zahlung', tage: 2, bezahlt: 'PENDING' });
  const rot = zeile({ name: 'K Rot', tage: 16, ampel: 'rot' });
  const ruf = zeile({ name: 'K Ruf', tage: 1 });
  const fertig = zeile({ name: 'K Fertig', tage: 30 });
  const teils = zeile({ name: 'K Teils', tage: 3, positionen: [{}, {}] });
  const statusAlle = {
    ...stand(beimLieferanten, 0, { status: 'bestellt', bestelltAm: vorTagen(4) }),
    ...stand(nachhaken, 0, { status: 'bestellt', bestelltAm: vorTagen(15) }),
    ...stand(da, 0, { status: 'geliefert', geliefertAm: vorTagen(1) }),
    ...stand(raus, 0, { status: 'raus', rausAm: vorTagen(8) }),
    ...stand(fertig, 0, { status: 'erledigt' }),
    ...stand(teils, 0, { status: 'raus', rausAm: vorTagen(1) }),   // zweite Position noch unbestellt: schwaechster Schritt zaehlt
  };
  const w = werWartet({
    bestellzeilen: [bestellen, beimLieferanten, nachhaken, da, raus, unbezahlt, rot, ruf, fertig, teils, zeile({ test: true })],
    statusAlle,
    rueckrufe: [{ orderId: ruf.orderId, status: 'offen' }],
    faelle: [{ schluessel: 's', name: 'K Angebot', punkte: [{ quelle: 'angebot', bezug: 'A-1', tage: 3 }, { quelle: 'warenkorb', tage: 1 }] }],
  }, { jetzt: JETZT, lieferantName: id => `Lieferant ${id}` });

  assert.deepEqual(w.wir.map(x => [x.name, x.schritt, x.alterTage, x.ton]), [
    ['K Rot', 'Zuerst klären', 16, 'crit'],
    ['K Nachhaken', 'Nachhaken', 15, 'crit'],
    ['K Teils', 'Ware bestellen', 3, ''],
    ['K Bestellen', 'Muster bestellen', 1, ''],
    ['K Ware da', 'An Kunden rausgeben', 1, ''],   // gleiches Alter: Eingangsreihenfolge
    ['K Ruf', 'Zurückrufen', 1, ''],
  ]);
  assert.deepEqual(w.lieferant.map(x => [x.name, x.schritt, x.zusatz, x.alterTage]), [['K Lieferant', 'Ware bestellt', 'Lieferant B', 4]]);
  assert.deepEqual(w.kunde.map(x => [x.name, x.schritt, x.alterTage, x.ton]), [
    ['K Muster raus', 'Muster beim Kunden', 8, 'warn'],
    ['K Angebot', 'Angebot offen', 3, ''],
    ['K Zahlung', 'Zahlung offen', 2, ''],
  ]);
  assert.equal(w.gesamt, 10);
  const ziel = new URLSearchParams(w.wir[0].href.split('?')[1]);
  assert.equal(ziel.get('kunde'), rot.kundenSchluessel); assert.equal(ziel.get('auftrag'), rot.orderId);
  assert.equal(w.kunde[1].href, '#/kunden?tab=angebote');
});

test('Muster "haben wir da": kein "bei Lieferant bestellen", sondern "vorbeibringen"/"verschicken" mit Ort und Ein-Klick-Knopf', () => {
  const vorbei = zeile({ name: 'Kunde Nah', tage: 1, positionen: [{ istMuster: true, titel: 'Muster: Testvelours', musterHerkunft: 'eigen_vorbei' }] });
  vorbei.auftrag.details = { lieferadresse: { ort: 'Musterstadt' } };
  const versand = zeile({ name: 'Kunde Fern', tage: 2, positionen: [{ istMuster: true, route: 'SAMPLE_STOCK' }] });
  const lieferant = zeile({ name: 'Kunde Drei', tage: 1, positionen: [{ istMuster: true, musterHerkunft: 'lieferant' }] });
  const todos = leiteTodosAb({ bestellzeilen: [vorbei, versand, lieferant] }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(arten(todos).sort(), ['bestellen', 'muster_eigen', 'muster_eigen']);
  const v = todos.find(t => t.id === `muster-eigen:${vorbei.orderId}`);
  assert.equal(v.titel, 'Muster vorbeibringen bei Kunde Nah');
  assert.match(v.kontext, /^Musterstadt · #T\d+ · /);
  assert.deepEqual(v.knopf.schritt, { orderId: vorbei.orderId, aktion: 'kunde_hat_muster' });
  assert.equal(v.knopf.text, 'Erledigt – Kunde hat Muster');
  assert.equal(todos.find(t => t.id === `muster-eigen:${versand.orderId}`).titel, 'Muster verschicken an Kunde Fern');
  assert.equal(todos.find(t => t.id === `muster-eigen:${versand.orderId}`).knopf.schritt.aktion, 'raus');
  assert.match(todos.find(t => t.art === 'bestellen').kontext, /Kunde Drei/, 'nur das Muster ohne Wahl "haben wir da" ist zu bestellen');
  // Wer wartet auf was: wir - vorbeibringen, nicht bestellen
  const ww = werWartet({ bestellzeilen: [vorbei] }, { jetzt: JETZT });
  assert.equal(ww.wir[0].schritt, 'Muster vorbeibringen');
});

test('Wer wartet: faellige Nachfrage bei Musterkunden steht unter "Wir sind dran", nicht unter "Kunde ist dran"', () => {
  const muster = zeile({ name: 'Musterkunde', tage: 12, positionen: [{ istMuster: true }] });
  const statusAlle = stand(muster, 0, { status: 'raus', rausAm: vorTagen(11) });
  const ohne = werWartet({ bestellzeilen: [muster], statusAlle }, { jetzt: JETZT });
  assert.equal(ohne.kunde.length, 1, 'ohne faellige Nachfrage: Kunde ist dran');
  const mit = werWartet({ bestellzeilen: [muster], statusAlle }, { jetzt: JETZT, nachfassen: new Set([muster.orderId]) });
  assert.equal(mit.kunde.length, 0, 'nicht zugleich bei "Kunde ist dran"');
  assert.equal(mit.wir.length, 1);
  assert.equal(mit.wir[0].schritt, 'Muster nachfassen');
  assert.equal(mit.gesamt, 1, 'jeder Vorgang genau einmal');
  // Auch als Liste von IDs; ein bestellter Auftrag bleibt beim Lieferanten.
  const bestellt = zeile({ name: 'Noch beim Lieferanten', tage: 3, positionen: [{ istMuster: true }] });
  const w = werWartet({ bestellzeilen: [bestellt], statusAlle: stand(bestellt, 0, { status: 'bestellt', bestelltAm: vorTagen(2) }) }, { jetzt: JETZT, nachfassen: [bestellt.orderId] });
  assert.equal(w.lieferant.length, 1);
});

test('Shop-Wache: stumm seit mehr als drei Stunden wird ein To-do (gruen, aber veraltet); frisch gruen nicht', () => {
  const stunden = h => new Date(JETZT.getTime() - h * 3_600_000).toISOString();
  const stumm = leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: stunden(5), befunde: [] } }, { sicht: 'website', jetzt: JETZT });
  assert.equal(stumm.length, 1);
  assert.equal(stumm[0].titel, 'Shop-Kontrolle meldet sich nicht');
  assert.equal(stumm[0].ton, 'warn');
  assert.match(stumm[0].kontext, /vor 5 Stunden/);
  assert.deepEqual(leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: stunden(1), befunde: [] } }, { sicht: 'website', jetzt: JETZT }), []);
});

test('Tailscale gestoppt oder abgemeldet: ein To-do in der Website-Sicht, sonst nichts', () => {
  const gestoppt = leiteTodosAb({ shopwache: { verfuegbar: false, tailscale: { status: 'gestoppt' } } }, { sicht: 'website', jetzt: JETZT });
  assert.equal(gestoppt.length, 1);
  assert.equal(gestoppt[0].id, 'tailscale');
  assert.equal(gestoppt[0].ton, 'warn');
  assert.match(gestoppt[0].titel, /Tailscale ist aus/);
  assert.match(gestoppt[0].kontext, /Menüleiste/);
  assert.equal(leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: JETZT.toISOString(), befunde: [], tailscale: { status: 'abgemeldet' } } }, { sicht: 'website', jetzt: JETZT })[0].id, 'tailscale');
  for (const status of ['laeuft', 'startet', 'nicht-installiert', 'nicht-geprueft', 'unbekannt']) {
    assert.deepEqual(leiteTodosAb({ shopwache: { verfuegbar: false, tailscale: { status } } }, { sicht: 'website', jetzt: JETZT }), [], status);
    assert.equal(tailscaleHinweis({ status }), null, status);
  }
  // Im Laden zaehlt es nicht - die Website-Zahl des Inhabers schon.
  assert.deepEqual(leiteTodosAb({ shopwache: { tailscale: { status: 'gestoppt' } } }, { sicht: 'laden', jetzt: JETZT }), []);
  assert.equal(zaehleTodos({ shopwache: { tailscale: { status: 'gestoppt' } } }, { jetzt: JETZT }).website, 1);
});

test('Speicher am Mac mini: gelb und rot werden ein Website-To-do, gruen und unbekannt nichts', () => {
  const stand = (ampel, freiGiB, belegtProzent) => ({ ampel, freiGiB, belegtProzent, gemessenAm: JETZT.toISOString() });
  const gelb = leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: JETZT.toISOString(), befunde: [], speicher: stand('gelb', 23, 95) } }, { sicht: 'website', jetzt: JETZT });
  assert.equal(gelb.length, 1);
  assert.equal(gelb[0].id, 'speicher');
  assert.equal(gelb[0].ton, 'warn');
  assert.match(gelb[0].titel, /Speicher wird knapp/);
  assert.match(gelb[0].kontext, /nur noch 23 GiB frei \(95 % belegt\)/);
  const rot = leiteTodosAb({ shopwache: { verfuegbar: false, speicher: stand('rot', 12, 97) } }, { sicht: 'website', jetzt: JETZT });
  assert.equal(rot[0].ton, 'crit');
  assert.match(rot[0].titel, /fast voll/);
  for (const s of [stand('gruen', 120, 74), { ampel: 'unbekannt', freiGiB: null }, null]) {
    assert.deepEqual(leiteTodosAb({ shopwache: { verfuegbar: false, speicher: s } }, { sicht: 'website', jetzt: JETZT }), []);
    assert.equal(speicherHinweis(s), null);
  }
  // Im Laden zaehlt es nicht.
  assert.deepEqual(leiteTodosAb({ shopwache: { speicher: stand('rot', 12, 97) } }, { sicht: 'laden', jetzt: JETZT }), []);
});

test('Auslauf-Pruefung: Befunde, gestoerter Lieferant und stumme Pruefung werden ein Website-To-do', () => {
  const mit = auslauf => leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: vorTagen(0), befunde: [], auslauf } }, { sicht: 'website', jetzt: JETZT });
  const weg = mit({ geprueftAm: vorTagen(1), befunde: [
    { lieferant: 'A', ergebnis: 'fehlt', handles: ['testboden-eiche'] },
    { lieferant: 'C', ergebnis: 'hinweis', handles: ['testteppich', 'muster-testteppich'] },
  ] });
  assert.equal(weg.length, 1);
  assert.equal(weg[0].id, 'auslauf');
  assert.equal(weg[0].ton, 'crit');
  assert.match(weg[0].titel, /1 Artikel beim Lieferanten nicht mehr gefunden/);
  assert.match(weg[0].kontext, /^testboden-eiche, testteppich, muster-testteppich · gegenprüfen/);
  assert.equal(weg[0].knopf.href, '#/lexikon?lq=testboden-eiche');

  const nurHinweis = mit({ geprueftAm: vorTagen(1), befunde: [{ lieferant: 'E', ergebnis: 'verdacht', handles: ['x'] }] });
  assert.equal(nurHinweis[0].ton, 'warn');

  const gestoert = mit({ geprueftAm: vorTagen(1), befunde: [], ausfaelle: [{ lieferant: 'D', grund: '90 von 100 Abrufen gescheitert' }] });
  assert.match(gestoert[0].titel, /Lieferant D nicht prüfbar/);

  assert.match(mit({ geprueftAm: vorTagen(9), befunde: [] })[0].titel, /meldet sich nicht/);
  assert.deepEqual(mit({ geprueftAm: vorTagen(2), befunde: [] }), []);
  assert.deepEqual(mit(null), []);
});

test('Auslauf-Pruefung: Farben ohne Handmuster ("nur in Format") werden ein eigenes To-do, kein Auslauf', () => {
  const mit = auslauf => leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: vorTagen(0), befunde: [], auslauf } }, { sicht: 'website', jetzt: JETZT });
  const ohne = { lieferant: 'A', ergebnis: 'ohne-muster', kennung: 'TEPTEST04_043', handles: ['testa-teppichboden'], grund: 'Farbe 43(nur in Format) - kein Handmuster, Muster sperren' };
  const nur = mit({ geprueftAm: vorTagen(1), befunde: [ohne] });
  assert.equal(nur.length, 1);
  assert.equal(nur[0].id, 'auslauf-muster');
  assert.equal(nur[0].ton, 'warn');
  assert.equal(nur[0].titel, 'Muster nicht lieferbar: 1 Farbe hat beim Lieferanten kein Handmuster');
  assert.equal(nur[0].kontext, 'TEPTEST04_043 · testa-teppichboden · Muster im Shop sperren, offene Musterbestellungen prüfen');
  assert.equal(nur[0].knopf.href, '#/lexikon?lq=testa-teppichboden');
  assert.doesNotMatch(nur[0].kontext, /archivieren/);

  // Zusammen mit echtem Auslauf: zwei To-dos (das rote zuerst), der Auslauf zaehlt nur seine eigenen Befunde.
  const beide = mit({ geprueftAm: vorTagen(1), befunde: [ohne, { lieferant: 'A', ergebnis: 'fehlt', handles: ['testboden-eiche'] }] });
  assert.deepEqual(beide.map(t => t.id), ['auslauf', 'auslauf-muster']);
  assert.match(beide[0].titel, /1 Artikel beim Lieferanten nicht mehr gefunden/);
  assert.doesNotMatch(beide[0].kontext, /testa-teppichboden/);

  // Stumme Pruefung verdeckt den Musterbefund nicht.
  assert.deepEqual(mit({ geprueftAm: vorTagen(9), befunde: [ohne] }).map(t => t.id).sort(), ['auslauf', 'auslauf-muster']);
});

test('Sicherung: verpasst wird gelb, ueber 48 Std., gescheitert oder unlesbar rot, sonst nichts', () => {
  const mit = sicherung => leiteTodosAb({ shopwache: { verfuegbar: true, sicherung } }, { sicht: 'website', jetzt: JETZT });
  for (const s of [null, { status: 'ok', letzterErfolg: vorTagen(0) }, { status: 'unbekannt', letzterErfolg: null }]) assert.deepEqual(mit(s), []);
  // Gar kein Stand: die Sicherung lief hier nie - gelb, nicht still.
  const fehlt = mit({ status: 'unbekannt', letzterErfolg: null, fehlt: true });
  assert.deepEqual([fehlt.length, fehlt[0].ton, fehlt[0].titel], [1, 'warn', 'Sicherungsstand fehlt']);
  assert.match(fehlt[0].kontext, /noch keinen Stand geschrieben/);

  const verpasst = mit({ status: 'alt', letzterErfolg: vorTagen(1), grund: 'taeglicher-solltermin-verpasst' });
  assert.equal(verpasst.length, 1);
  assert.deepEqual([verpasst[0].id, verpasst[0].ton, verpasst[0].bereich], ['sicherung', 'warn', 'website']);
  assert.equal(verpasst[0].titel, 'Sicherung der Betriebsdaten überfällig');
  assert.match(verpasst[0].kontext, /^letzte Sicherung .*\d{2}\.\d{2}\..* · sie läuft täglich um 22:30 Uhr/);
  assert.equal(mit({ status: 'alt', letzterErfolg: vorTagen(3) })[0].ton, 'crit');

  const gescheitert = mit({ status: 'ok', letzterErfolg: vorTagen(1), letzterFehler: { am: vorTagen(0), meldung: 'ENOSPC: no space left on device' } });
  assert.equal(gescheitert[0].ton, 'crit');
  assert.equal(gescheitert[0].titel, 'Sicherung der Betriebsdaten fehlgeschlagen');
  assert.match(gescheitert[0].kontext, /^ENOSPC: no space left on device · letzte Sicherung /);
  assert.match(mit({ status: 'unbekannt', letzterErfolg: null, letzterFehler: { am: vorTagen(0), meldung: 'x' } })[0].kontext, /noch keine erfolgreiche Sicherung/);

  assert.equal(mit({ status: 'fehler', letzterErfolg: null })[0].titel, 'Stand der Sicherung nicht lesbar');
  // Im Laden zaehlt es nicht; der Inhaber sieht nur das Rote.
  assert.deepEqual(leiteTodosAb({ shopwache: { sicherung: { status: 'alt', letzterErfolg: vorTagen(3) } } }, { sicht: 'laden', jetzt: JETZT }), []);
  assert.equal(leiteTodosAb({ shopwache: { sicherung: { status: 'alt', letzterErfolg: vorTagen(3) } } }, { sicht: 'inhaber', jetzt: JETZT }).length, 1);
  assert.equal(leiteTodosAb({ shopwache: { sicherung: { status: 'alt', letzterErfolg: vorTagen(1) } } }, { sicht: 'inhaber', jetzt: JETZT }).length, 0);
});

test('Neuheiten: neue Artikel unserer Linien werden ein Website-To-do, ohne Neues keins', () => {
  const mit = neuheiten => leiteTodosAb({ shopwache: { verfuegbar: true, ampel: 'gruen', geprueftAm: vorTagen(0), befunde: [], auslauf: { geprueftAm: vorTagen(1), befunde: [], neuheiten } } }, { sicht: 'website', jetzt: JETZT });
  const t = mit({ neu: [
    { nr: 'CVTEST2_0653', name: 'CV-Boden Testa 200cm CV Testlinie' },
    { nr: 'CVTEST4_0653', name: 'CV-Boden Testa 400cm CV Testlinie' },
  ] });
  assert.equal(t.length, 1);
  assert.equal(t[0].id, 'neuheiten');
  assert.equal(t[0].titel, 'Lieferant A: 2 neue Artikel in unseren Linien');
  assert.match(t[0].kontext, /^CV-Boden Testa · prüfen und anlegen/);
  assert.deepEqual(mit({ neu: [] }), []);
  assert.deepEqual(mit(null), []);
});

test('Gemischte Musterbestellung (Inhaber 2026-10-15): Lagermuster warten, bis die Lieferanten-Muster da sind, dann geht alles zusammen raus', () => {
  const lagerMuster = { istMuster: true, titel: 'Muster Testlino Linoleumboden 200cm', farbe: 'Grau', musterHerkunft: 'eigen_versand', musterHerkunftQuelle: 'lager', musterLager: { id: 'ml-1', ort: 'Regal B', artLabel: 'Probestück 2 × 1 m' } };
  const lieferantMuster = { istMuster: true, titel: 'Muster Testvelours Teppichboden 400cm', farbe: 'Sand', lieferant: 'B' };
  const z = zeile({ name: 'Kunde Gemischt', tage: 2, positionen: [lagerMuster, lieferantMuster] });
  // 1. Lieferanten-Muster noch nicht bestellt: nur "bestellen", kein "verschicken".
  let todos = leiteTodosAb({ bestellzeilen: [z] }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(arten(todos), ['bestellen']);
  // 2. Bestellt: weiter kein "verschicken"; Wer wartet: der Lieferant.
  const bestellt = stand(z, 1, { status: 'bestellt', bestelltAm: vorTagen(1) });
  todos = leiteTodosAb({ bestellzeilen: [z], statusAlle: bestellt }, { sicht: 'laden', jetzt: JETZT });
  assert.equal(todos.filter(t => t.art === 'muster_eigen').length, 0);
  assert.equal(werWartet({ bestellzeilen: [z], statusAlle: bestellt }, { jetzt: JETZT }).lieferant.length, 1);
  // 3. Eingetroffen: ein To-do "rausgeben", das die Lagermuster mitnennt.
  const da = stand(z, 1, { status: 'geliefert', geliefertAm: vorTagen(0) });
  todos = leiteTodosAb({ bestellzeilen: [z], statusAlle: da }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(arten(todos), ['rausgeben']);
  assert.match(todos[0].kontext, /zusammen mit aus dem Musterlager \(Regal B\): Testlino Linoleumboden: Grau/);
  assert.equal(werWartet({ bestellzeilen: [z], statusAlle: da }, { jetzt: JETZT }).wir[0].schritt, 'An Kunden rausgeben', 'Wer wartet sagt dasselbe wie das To-do');
});

test('Sicht "Alles": wirklich alles - auch normale Laden-Arbeit, die die fruehere Inhaber-Sicht verschwieg', () => {
  const neu = zeile({ name: 'Kunde Neu', tage: 0 });
  const quellen = { bestellzeilen: [neu], aufgaben: AUFGABEN, freigaben: FREIGABEN };
  const alles = leiteTodosAb(quellen, { sicht: 'alles', ich: 'chef', alle: true, jetzt: JETZT });
  const laden = leiteTodosAb(quellen, { sicht: 'laden', ich: 'chef', alle: true, jetzt: JETZT });
  const website = leiteTodosAb(quellen, { sicht: 'website', ich: 'chef', alle: true, jetzt: JETZT });
  assert.ok(alles.some(t => t.id === 'bestellen:A|ware'), 'neue bezahlte Bestellung steht in Alles');
  for (const t of [...laden, ...website]) assert.ok(alles.some(x => x.id === t.id), `${t.id} fehlt in Alles`);
  assert.ok(alles.some(t => t.art === 'freigabe'), 'Freigaben gehoeren zu Alles');
  assert.equal(zaehleTodos(quellen, { ich: 'chef', jetzt: JETZT }).alles, alles.length, 'Chip-Zahl = Listenlaenge');
});

test('Service-Anfrage bleibt nach Erstkontakt sichtbar, nur neue werden nach 1/3 Tagen gelb/rot', () => {
  const tag = n => vorTagen(n).slice(0, 10);
  const serviceanfragen = [
    { id: 'S-001', status: 'neu', leistung: 'treppe', quelle: 'formular', name: 'Testkundin', plz: '16515', telefon: '0000', erstelltAm: vorTagen(0) },
    { id: 'S-002', status: 'neu', leistung: 'verlegeservice', quelle: 'werbung', email: 'x@example.invalid', datum: tag(4) },
    { id: 'S-003', status: 'kontaktiert', leistung: 'aufmass', quelle: 'telefon', name: 'Schon dran', erstelltAm: vorTagen(9), naechsterSchritt: 'Aufmaß vereinbaren' },
    { id: 'S-004', status: 'termin', leistung: 'aufmass', quelle: 'telefon', name: 'Termin', erstelltAm: vorTagen(8) },
    { id: 'S-005', status: 'angebot', leistung: 'treppe', quelle: 'telefon', name: 'Angebot', erstelltAm: vorTagen(7) },
    { id: 'S-006', status: 'gewonnen' }, { id: 'S-007', status: 'verloren' },
  ];
  const todos = leiteTodosAb({ serviceanfragen }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(todos.map(t => t.id), ['service:S-002', 'service:S-003', 'service:S-004', 'service:S-005', 'service:S-001']);
  assert.equal(todos[0].ton, 'crit');
  assert.equal(todos[0].titel, 'Bei x@example.invalid melden: neue Anfrage Verlegeservice');
  assert.match(todos[0].kontext, /Werbung · eingegangen vor 4 Tagen · nur E-Mail/);
  const neu = todos.find(t => t.id === 'service:S-001');
  assert.equal(neu.ton, '');
  assert.equal(neu.titel, 'Bei Testkundin, 16515 melden: neue Anfrage Treppe');
  assert.deepEqual(neu.knopf, { text: 'Anfrage öffnen', href: '#/kunden?tab=service&anfrage=S-001' });
  assert.equal(todos[1].titel, 'Schon dran: Aufmaß vereinbaren');
  assert.equal(todos[2].titel, 'Termin: Nächsten Schritt klären');
  assert.match(todos[3].kontext, /Treppe · Angebot/);
  assert.ok(todos.slice(1).every(t => t.ton === ''), 'keine erfundene Ueberfaelligkeit aus dem Anfragedatum');
  assert.equal(zaehleTodos({ serviceanfragen }, { jetzt: JETZT }).laden, 5);
});

test('Liefertermin bestaetigt: vorher Lieferant dran (kein Nachhaken), danach wir - in To-do und Wartespalte gleich', () => {
  const zukunft = zeile({ name: 'Termin Zukunft', tage: 20 });
  const vorbei = zeile({ name: 'Termin vorbei', tage: 20 });
  const statusAlle = {
    ...stand(zukunft, 0, { status: 'bestellt', bestelltAm: vorTagen(19), beschaffung: { liefertermin: '2026-10-25' } }),
    ...stand(vorbei, 0, { status: 'bestellt', bestelltAm: vorTagen(19), beschaffung: { liefertermin: '2026-09-30' } }),
  };
  const todos = leiteTodosAb({ bestellzeilen: [zukunft, vorbei], statusAlle }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(arten(todos), ['liefertermin'], 'nur der ueberschrittene Termin, kein Nachhaken trotz 19 Tagen');
  const w = werWartet({ bestellzeilen: [zukunft, vorbei], statusAlle }, { jetzt: JETZT });
  assert.deepEqual(w.wir.map(z => z.name), ['Termin vorbei']);
  assert.equal(w.wir[0].schritt, 'Liefertermin überschritten');
  assert.deepEqual(w.lieferant.map(z => [z.name, z.schritt]), [['Termin Zukunft', 'Ware kommt bis 25.10.2026']]);
});

test('Routinen als Mac-Dienst: gestoerte oder stumme Routinen werden ein rotes Website-To-do, sonst nichts', () => {
  const stunden = h => new Date(JETZT.getTime() - h * 3_600_000).toISOString();
  const mit = routinen => leiteTodosAb({ shopwache: { verfuegbar: false, routinen } }, { sicht: 'website', jetzt: JETZT });
  const gut = [{ id: 'fehlermeldungen', titel: 'Fehlermeldungen → Werkbank', ok: true, stumm: false, zeit: stunden(1), seit: stunden(30) },
    { id: 'daten-gesundheit', titel: 'Datenstand des Sync-Dienstes', ok: true, stumm: false, zeit: stunden(2), seit: stunden(48) }];
  assert.deepEqual(mit(gut), []);
  assert.deepEqual(mit([]), []);
  assert.deepEqual(mit(undefined), []);

  const rot = mit([...gut, { id: 'lieferbelege', titel: 'Lieferbelege aus dem Postfach', ok: false, meldung: 'Werkzeug abgelehnt: Write', zeit: stunden(1), seit: vorTagen(2) }]);
  assert.equal(rot.length, 1);
  assert.equal(rot[0].id, 'routinen');
  assert.equal(rot[0].ton, 'crit');
  assert.equal(rot[0].titel, 'Mac-Dienst gestört: Lieferbelege aus dem Postfach');
  assert.equal(rot[0].kontext, 'Werkzeug abgelehnt: Write · Claude Bescheid geben: „Mac-Dienst gestört“');
  // Rundgang 29.10. (A5): kein rotes To-do ohne Weg - der Knopf fuehrt zur Liste in der Shop-Kontrolle.
  assert.deepEqual(rot[0].knopf, { text: 'Ansehen', href: '#/shopwache' });
  assert.equal(rot[0].alterTage, 2);

  // Stumm (der Server rechnet mit Zeitfenster, operations/lib/routinen.mjs routinenStand): Text und Alter vom Server.
  const stumm = mit([{ ...gut[0], stumm: true, stummSeit: vorTagen(3), stummText: 'seit 72 Stunden kein erfolgreicher Lauf (zuletzt: wartet auf Nachziehen)' },
    { ...gut[1], ok: false, meldung: 'Sync-Dienst meldet seit 90 Min. keinen neuen Stand', seit: stunden(2) }]);
  assert.equal(stumm[0].titel, 'Mac-Dienst: 2 Routinen gestört');
  assert.equal(stumm[0].kontext, 'seit 72 Stunden kein erfolgreicher Lauf (zuletzt: wartet auf Nachziehen) · außerdem Datenstand des Sync-Dienstes · Claude Bescheid geben: „Mac-Dienst gestört“');
  assert.equal(stumm[0].alterTage, 3, 'Alter ab dem letzten Erfolg bzw. der Einrichtung');
  assert.equal(mit([{ ...gut[0], stumm: true }])[0].kontext, 'zu lange kein erfolgreicher Lauf · Claude Bescheid geben: „Mac-Dienst gestört“');
  // Rot: der Inhaber sieht es auf seiner Startseite, im Laden zaehlt es nicht.
  assert.equal(leiteTodosAb({ shopwache: { routinen: [{ ...gut[0], ok: false, meldung: 'x' }] } }, { sicht: 'inhaber', jetzt: JETZT }).length, 1);
  assert.deepEqual(leiteTodosAb({ shopwache: { routinen: [{ ...gut[0], ok: false, meldung: 'x' }] } }, { sicht: 'laden', jetzt: JETZT }), []);
});

test('Rundgang 29.10.: gestoerteRoutinen nennt alle; Speicher-Handlung ohne ueberholte Rueckfrage (w-170)', async () => {
  const { gestoerteRoutinen } = await import('../lib/todos.mjs');
  const liste = [{ titel: 'A', ok: false, meldung: 'kaputt', seit: 'x' }, { titel: 'B', ok: true }, { titel: 'C', stumm: true, stummText: 'still', stummSeit: 'y' }];
  assert.deepEqual(gestoerteRoutinen(liste).map(r => [r.titel, r.text, r.seit]), [['A', 'kaputt', 'x'], ['C', 'still', 'y']]);
  assert.deepEqual(gestoerteRoutinen(undefined), []);
  const h = speicherHinweis({ ampel: 'gelb', freiGiB: 29, belegtProzent: 94 });
  assert.doesNotMatch(h.handlung, /Rückfrage/);
  assert.match(h.handlung, /Claude Bescheid geben: „Speicher aufräumen“/);
});
