import test from 'node:test';
import assert from 'node:assert/strict';
import { faelle, naechsterSchritt, DRINGEND } from '../lib/kundenfaelle.mjs';

const JETZT = new Date('2026-09-25T10:00:00Z');
const vorTagen = (n) => new Date(JETZT.getTime() - n * 86400000).toISOString();

const bestellzeile = (over = {}) => ({
  orderName: '#1001', orderId: 'gid://shopify/Order/1', datum: vorTagen(1),
  kundenname: 'Erika Musterfrau', kundenSchluessel: 'email:erika@example.test',
  email: 'erika@example.test', telefon: null,
  zahlungsstatus: 'PAID', fulfillmentstatus: 'UNFULFILLED',
  gesamtbetrag: 120, waehrung: 'EUR', testbestellung: false, storniert: false,
  beratungOffen: false, wasFehlt: [], fortschritt: { stufe: 'offen' },
  auftrag: { positionen: [{ lineItemId: 'li1', titel: 'Piumera Teppichboden', farbe: 'Sand Hell', handle: 'piumera', menge: 14, kundenmenge: '14 m²' }] },
  ...over,
});

test('Beratungswunsch steht ganz oben - mit und ohne Telefonnummer', () => {
  const mit = naechsterSchritt(bestellzeile({ beratungOffen: true, telefon: '+4930111' }), { jetzt: JETZT });
  assert.equal(mit.dringend, DRINGEND.SOFORT);
  assert.match(mit.text, /Zurückrufen/);

  const ohne = naechsterSchritt(bestellzeile({ beratungOffen: true }), { jetzt: JETZT });
  assert.equal(ohne.dringend, DRINGEND.SOFORT);
  assert.match(ohne.text, /keine Telefonnummer/);
});

test('bezahlt und nichts bestellt: erst bestellen, ab drei Tagen dringend', () => {
  const frisch = naechsterSchritt(bestellzeile({ datum: vorTagen(1) }), { jetzt: JETZT });
  assert.match(frisch.text, /Beim Lieferanten bestellen/);
  assert.equal(frisch.dringend, DRINGEND.BALD);

  const alt = naechsterSchritt(bestellzeile({ datum: vorTagen(5) }), { jetzt: JETZT });
  assert.equal(alt.dringend, DRINGEND.SOFORT);
});

test('alles bestellt, aber noch nicht raus: versenden', () => {
  const s = naechsterSchritt(bestellzeile({ fortschritt: { stufe: 'bestellt' } }), { jetzt: JETZT });
  assert.match(s.text, /Versenden/);
});

test('nichts offen faellt aus der Liste', () => {
  const z = bestellzeile({ zahlungsstatus: 'PAID', fulfillmentstatus: 'FULFILLED', fortschritt: { stufe: 'erledigt' }, wasFehlt: [] });
  assert.equal(naechsterSchritt(z, { jetzt: JETZT }).art, 'fertig');
  assert.equal(faelle({ bestellzeilen: [z] }, { jetzt: JETZT }).anzahl, 0);
});

test('Testbestellungen und Stornos zaehlen nie', () => {
  const r = faelle({ bestellzeilen: [bestellzeile({ testbestellung: true }), bestellzeile({ storniert: true })] }, { jetzt: JETZT });
  assert.equal(r.anzahl, 0);
});

test('alles zu einem Kunden landet in einem Eintrag', () => {
  const r = faelle({
    bestellzeilen: [bestellzeile()],
    angebote: [{ nummer: '#D3', status: 'OPEN', kunde: 'Erika Musterfrau', email: 'erika@example.test', betrag: 300, erstelltAm: vorTagen(20), positionen: [{ titel: 'Teppich nach Maß', menge: 1 }] }],
    warenkoerbe: [{ kunde: 'Erika Musterfrau', email: 'erika@example.test', wert: 90, zeitpunkt: vorTagen(2), positionen: [{ titel: 'Sockelleiste', menge: 4 }] }],
  }, { jetzt: JETZT });

  assert.equal(r.anzahl, 1, 'ein Kunde, drei Punkte');
  const k = r.faelle[0];
  assert.equal(k.punkte.length, 3);
  assert.equal(k.summe, 510);
  // Innerhalb des Kunden steht das Dringendste oben: das 20 Tage alte Angebot
  assert.equal(k.punkte[0].schritt.dringend, DRINGEND.SOFORT);
  assert.equal(k.punkte[0].quelle, 'angebot');
  assert.match(k.punkte.find(p => p.quelle === 'angebot').schritt.text, /nachfassen/);
});

test('Angebot aelter als zwei Wochen wird dringend', () => {
  const r = faelle({ angebote: [{ nummer: '#D1', status: 'INVOICE_SENT', kunde: 'Alt', email: 'alt@example.test', betrag: 150, erstelltAm: vorTagen(500), positionen: [] }] }, { jetzt: JETZT });
  assert.equal(r.faelle[0].punkte[0].schritt.dringend, DRINGEND.SOFORT);
  assert.equal(r.sofort, 1);
});

test('Warenkorb ohne Kontakt steht nicht in der Arbeitsliste', () => {
  // Niemand kann ihn ansprechen; er bleibt unter "Liegengeblieben" sichtbar.
  const r = faelle({ warenkoerbe: [{ kunde: null, email: null, telefon: null, wert: 1300, zeitpunkt: vorTagen(10), positionen: [{ titel: 'Klickvinyl', menge: 14 }] }] }, { jetzt: JETZT });
  assert.equal(r.anzahl, 0);
});

test('Vorgaenge ohne Namen werden nicht zu einem Sammelkunden verschmolzen', () => {
  const r = faelle({
    angebote: [
      { id: 'gid://shopify/DraftOrder/1', nummer: '#D1', status: 'OPEN', kunde: null, email: null, betrag: 150, erstelltAm: vorTagen(30), positionen: [] },
      { id: 'gid://shopify/DraftOrder/2', nummer: '#D2', status: 'OPEN', kunde: null, email: null, betrag: 90, erstelltAm: vorTagen(5), positionen: [] },
    ],
  }, { jetzt: JETZT });
  assert.equal(r.anzahl, 2, 'zwei verschiedene Vorgaenge, nicht ein Eintrag "ohne Namen"');
});

test('sortiert: dringende Stufe zuerst, innerhalb der Stufe das aelteste', () => {
  const r = faelle({
    bestellzeilen: [
      bestellzeile({ kundenSchluessel: 'email:a@example.test', email: 'a@example.test', kundenname: 'A', datum: vorTagen(1) }),
      bestellzeile({ kundenSchluessel: 'email:b@example.test', email: 'b@example.test', kundenname: 'B', datum: vorTagen(9) }),
      bestellzeile({ kundenSchluessel: 'email:c@example.test', email: 'c@example.test', kundenname: 'C', datum: vorTagen(4), beratungOffen: true, telefon: '+4930999' }),
    ],
  }, { jetzt: JETZT });
  // B (9 Tage bezahlt, nichts bestellt) und C (Beratung) sind beide "sofort";
  // dann entscheidet das Alter - so arbeitet man die Liste von oben ab, ohne
  // selbst abzuwaegen. A ist erst einen Tag alt und damit nur "bald".
  assert.deepEqual(r.faelle.map(k => k.name), ['B', 'C', 'A']);
});

test('was der Kunde moechte steht in Klartext, nicht als SKU', () => {
  const r = faelle({ bestellzeilen: [bestellzeile()] }, { jetzt: JETZT });
  assert.deepEqual(r.faelle[0].punkte[0].moechte, ['14 m² Piumera Teppichboden (Sand Hell)']);
  assert.equal(r.faelle[0].punkte[0].produkte[0].handle, 'piumera', 'Handle fuers Lexikon');
});

test('erledigter Rueckruf steht nicht mehr als Beratung oben', () => {
  const offen = bestellzeile({ beratungOffen: true, telefon: '+4930111', rueckrufStatus: 'offen' });
  assert.match(naechsterSchritt(offen, { jetzt: JETZT }).text, /Zurückrufen/);

  const erledigt = bestellzeile({ beratungOffen: true, telefon: '+4930111', rueckrufStatus: 'erledigt' });
  const s = naechsterSchritt(erledigt, { jetzt: JETZT });
  assert.doesNotMatch(s.text, /Zurückrufen/);
  // Die Bestellung selbst bleibt sichtbar, solange sie nicht versandt ist
  assert.match(s.text, /bestellen|Versenden/);
});

// ---------------------------------------------------------------------------
// Naechster Schritt aus der Zeitleiste (2026-10-12): Shopify-Versandstatus nur als Hinweis
// ---------------------------------------------------------------------------

const zl = (wer, stufe, text, extra = {}) => ({ wer, stufe, text, faelligSeitTagen: stufe === 'warten' ? null : 0, wartetSeitTagen: 0, ...extra });

test('Zeitleiste vor Shopify: Muster beim Kunden heisst nicht "Versenden"', () => {
  // Shopify: unversandt. Auftragsfluss: an Kunden raus, Nachfassen faellig seit 7 Tagen.
  const z = bestellzeile({ fortschritt: { stufe: 'raus', minStufe: 3 }, zeitleisteSchritt: zl('wir', 'faellig', 'Nachfassen: Muster liegen seit 12 Tagen beim Kunden', { faelligSeitTagen: 7 }) });
  const s = naechsterSchritt(z, { jetzt: JETZT });
  assert.doesNotMatch(s.text, /Versenden/);
  assert.match(s.text, /Nachfassen/);
  assert.equal(s.dringend, DRINGEND.SOFORT);
  assert.equal(s.hinweis, 'In Shopify noch nicht als versendet gebucht');
});

test('Zeitleiste: faellig frisch = bald, nachhaken = bald, Problem = sofort; Hinweis nur, wenn die Ware raus ist', () => {
  const frisch = naechsterSchritt(bestellzeile({ zeitleisteSchritt: zl('wir', 'faellig', 'Ware beim Lieferanten bestellen', { faelligSeitTagen: 1 }) }), { jetzt: JETZT });
  assert.equal(frisch.dringend, DRINGEND.BALD);
  assert.equal(frisch.hinweis, null, 'noch nicht raus: kein Shopify-Hinweis');
  const nachhaken = naechsterSchritt(bestellzeile({ fortschritt: { stufe: 'bestellt', minStufe: 1 }, zeitleisteSchritt: zl('lieferant', 'nachhaken', 'Beim Lieferanten nachhaken: Muster seit 10 Tagen bestellt', { faelligSeitTagen: 3 }) }), { jetzt: JETZT });
  assert.equal(nachhaken.dringend, DRINGEND.BALD);
  assert.equal(nachhaken.wer, 'lieferant');
  const problem = naechsterSchritt(bestellzeile({ zeitleisteSchritt: zl('lieferant', 'problem', 'Problem: Ware seit 15 Tagen bestellt und nicht da') }), { jetzt: JETZT });
  assert.equal(problem.dringend, DRINGEND.SOFORT);
});

test('Zeitleiste: warten (Lieferant oder Kunde ist dran) steht nicht in der Arbeitsliste, wird aber gezaehlt', () => {
  // Keine reservierte Testdomain: Testadressen zaehlen auch als Wartende nie mit.
  const kunde = { email: 'erika@musterkundin.local', kundenSchluessel: 'email:erika@musterkundin.local' };
  const wartet = bestellzeile({ ...kunde, fortschritt: { stufe: 'raus', minStufe: 3 }, zeitleisteSchritt: zl('kunde', 'warten', 'Muster sind unterwegs zum Kunden') });
  assert.equal(naechsterSchritt(wartet, { jetzt: JETZT }).art, 'wartet');
  const r = faelle({ bestellzeilen: [wartet] }, { jetzt: JETZT });
  assert.equal(r.anzahl, 0);
  assert.equal(r.wartend, 1);
  assert.deepEqual(r.wartendeSchluessel, ['email:erika@musterkundin.local']);
  const test = faelle({ bestellzeilen: [{ ...wartet, email: 'erika@example.test', kundenSchluessel: 'email:erika@example.test' }] }, { jetzt: JETZT });
  assert.equal(test.wartend, 0, 'Testadresse zaehlt nicht');
  // Hat derselbe Kunde etwas zu tun, bleibt der wartende Vorgang in seiner Karte (unten).
  const zuTun = bestellzeile({ ...kunde, orderName: '#1002', datum: vorTagen(5), zeitleisteSchritt: zl('wir', 'faellig', 'Ware beim Lieferanten bestellen', { faelligSeitTagen: 5 }) });
  const beide = faelle({ bestellzeilen: [wartet, zuTun] }, { jetzt: JETZT });
  assert.equal(beide.anzahl, 1);
  assert.equal(beide.wartend, 0);
  assert.deepEqual(beide.faelle[0].punkte.map(p => p.schritt.art), ['auftrag', 'wartet']);
});

test('Zeitleiste abgeschlossen (null): nur was sonst noch fehlt, sonst faellt die Bestellung raus', () => {
  const fertig = bestellzeile({ zeitleisteSchritt: null, fortschritt: { stufe: 'erledigt', minStufe: 4 }, wasFehlt: [] });
  assert.equal(naechsterSchritt(fertig, { jetzt: JETZT }).art, 'fertig');
  const mass = bestellzeile({ zeitleisteSchritt: null, wasFehlt: ['Maßprüfung offen (1)'] });
  assert.match(naechsterSchritt(mass, { jetzt: JETZT }).text, /Maßprüfung/);
  // Unbezahlt: die Zeitleiste kennt keine Zahlung - es bleibt bei "Noch nicht bezahlt".
  const offen = bestellzeile({ zahlungsstatus: 'PENDING', zeitleisteSchritt: zl('wir', 'faellig', 'Ware beim Lieferanten bestellen'), wasFehlt: ['Noch nicht bezahlt'] });
  assert.match(naechsterSchritt(offen, { jetzt: JETZT }).text, /Noch nicht bezahlt/);
});
