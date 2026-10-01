import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leiteTodosAb, zaehleTodos, werWartet, sichtFuer, sortiereTodos, tonNachAlter, alterText, tageSeit,
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
  assert.match(muster.kontext, /Kunde Zwei · 12 m² Muster: Testvelours/);
  for (const t of todos) assert.equal(Object.keys(t.knopf).filter(k => k !== 'text').length, 1, 'genau ein Ziel je To-do');
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

test('Lieferantenbestellung: ab 7 Tagen gelb nachhaken, ab 14 Tagen rot - Schwellen vom Server uebernehmbar', () => {
  const a = zeile({ name: 'Kunde Acht', tage: 10 });
  const b = zeile({ name: 'Kunde Fuenfzehn', tage: 20, positionen: [{ lieferant: 'C' }] });
  const c = zeile({ name: 'Kunde Frisch', tage: 5 });
  const statusAlle = {
    ...stand(a, 0, { status: 'bestellt', bestelltAm: vorTagen(8) }),
    ...stand(b, 0, { status: 'bestellt', bestelltAm: vorTagen(15) }),
    ...stand(c, 0, { status: 'bestellt', bestelltAm: vorTagen(3) }),
  };
  const todos = leiteTodosAb({ bestellzeilen: [a, b, c], statusAlle }, { sicht: 'laden', jetzt: JETZT });
  assert.deepEqual(todos.map(t => [t.art, t.ton, t.alterTage]), [['nachhaken', 'crit', 15], ['nachhaken', 'warn', 8]]);
  assert.equal(todos[0].titel, 'Ware seit 15 Tagen bestellt – noch nicht da');
  assert.match(todos[0].kontext, /^Lieferant C · Kunde Fuenfzehn/);
  assert.equal(todos[0].knopf.href, '#/einkauf?lf=C', 'direkt zur Karte des Lieferanten');
  const streng = leiteTodosAb({ bestellzeilen: [a, b, c], statusAlle, schwellen: { nachhakenTage: 3, problemTage: 8 } }, { sicht: 'laden', jetzt: JETZT });
  assert.equal(streng.filter(t => t.art === 'nachhaken').length, 2, 'Lieferant A (zwei Kunden) und Lieferant C');
  assert.ok(streng.every(t => t.ton === 'crit'));
});

test('blockierte Bestellung ("Zuerst klären") ist rot und erscheint nicht zusaetzlich als Bestell-To-do', () => {
  const rot = zeile({ name: 'Kunde Rot', tage: 2, ampel: 'rot', hinweise: ['1 Position(en) ohne Großhändler-ID', 'Verlegung gebucht', 'drittes'] });
  const todos = leiteTodosAb({ bestellzeilen: [rot] }, { sicht: 'laden', jetzt: JETZT, klartext: h => h.replace('Position(en)', 'Position') });
  assert.deepEqual(arten(todos), ['blockiert']);
  assert.equal(todos[0].ton, 'crit');
  assert.equal(todos[0].kontext, 'Kunde Rot · 1 Position ohne Großhändler-ID · Verlegung gebucht');
  assert.equal(todos[0].knopf.href, '#/einkauf');
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
  assert.equal(todos[0].knopf.href, '#/kunden?tab=rueckrufe');
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
  assert.deepEqual(zaehleTodos(quellen, { ich: 'chef', jetzt: JETZT }), { laden: 5, website: 2 });
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
  assert.equal(w.wir[0].href, `#/kunden?kunde=${encodeURIComponent(rot.kundenSchluessel)}`);
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
  assert.match(todos.find(t => t.art === 'bestellen').kontext, /Kunde Drei/, 'nur das Muster ohne Wahl "haben wir da" ist zu bestellen');
  // Wer wartet auf was: wir - vorbeibringen, nicht bestellen
  const ww = werWartet({ bestellzeilen: [vorbei] }, { jetzt: JETZT });
  assert.equal(ww.wir[0].schritt, 'Muster vorbeibringen');
});
