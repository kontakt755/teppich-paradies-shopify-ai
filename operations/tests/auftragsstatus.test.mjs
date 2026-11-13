import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auftragsstatusPfad, leseAlle, setzeStatus, oeffneWieder, statusVorErledigt, filterGruppe, positionKey, STATUS_ORDER, AuftragsstatusFehler, vermerkeShopifyVersand, setzeZurueckAufOffen, setzeSelbstversand, vermerkeDirektversand, UEBER_WERTE } from '../lib/auftragsstatus.mjs';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-auftragsstatus-')); }

test('leseAlle liefert leeres Objekt, wenn die Datei fehlt', () => {
  const dir = tmpDir();
  const positionen = leseAlle(auftragsstatusPfad(dir));
  assert.deepEqual(positionen, {});
});

test('setzeStatus schreibt atomar und ist danach lesbar', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  const jetzt = new Date('2026-09-23T09:00:00Z');
  const eintrag = setzeStatus(file, { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1', status: 'bestellt', actor: 'tobias', lieferantBestellnummer: 'LB-42', jetzt });
  assert.equal(eintrag.status, 'bestellt');
  assert.equal(eintrag.lieferantBestellnummer, 'LB-42');
  assert.equal(eintrag.bestelltVon, 'tobias');
  assert.ok(fs.existsSync(file));
  assert.ok(!fs.readdirSync(dir).some(f => f.endsWith('.tmp')), 'keine liegen gebliebene tmp-Datei');

  const key = positionKey('gid://shopify/Order/1', 'gid://shopify/LineItem/1');
  const alle = leseAlle(file);
  assert.equal(alle[key].status, 'bestellt');
});

test('vermerkeDirektversand: nur bestellte Position, Bestelldatum bleibt (#1049)', () => {
  const file = auftragsstatusPfad(tmpDir());
  const o = 'gid://shopify/Order/9', li = 'gid://shopify/LineItem/9';
  assert.throws(() => vermerkeDirektversand(file, { orderId: o, lineItemId: li, actor: 'tobias' }), e => e instanceof AuftragsstatusFehler && e.status === 409);
  setzeStatus(file, { orderId: o, lineItemId: li, status: 'bestellt', actor: 'tobias', jetzt: new Date('2026-10-20T05:00:00Z') });
  const e = vermerkeDirektversand(file, { orderId: o, lineItemId: li, actor: 'inhaber', jetzt: new Date('2026-11-09T10:00:00Z') });
  assert.deepEqual([e.status, e.ueber, e.bestelltAm, e.aktualisiertVon], ['bestellt', 'kunde', '2026-10-20T05:00:00.000Z', 'inhaber']);
  assert.equal(leseAlle(file)[positionKey(o, li)].ueber, 'kunde');
});

test('vermerkeDirektversand: "kommt zu uns" und offene Position als bestellt (Unterlagen, 13.11.2026)', () => {
  const file = auftragsstatusPfad(tmpDir());
  const o = 'gid://shopify/Order/10', li = 'gid://shopify/LineItem/10';
  assert.throws(() => vermerkeDirektversand(file, { orderId: o, lineItemId: li, actor: 'tobias', ueber: 'kettler' }), AuftragsstatusFehler);
  const neu = vermerkeDirektversand(file, { orderId: o, lineItemId: li, actor: 'tobias', ueber: 'laden', auchOffen: true, jetzt: new Date('2026-11-13T10:00:00Z') });
  assert.deepEqual([neu.status, neu.ueber, neu.bestelltAm, neu.bestelltVon], ['bestellt', 'laden', '2026-11-13T10:00:00.000Z', 'tobias']);
  const direkt = vermerkeDirektversand(file, { orderId: o, lineItemId: li, actor: 'inhaber', auchOffen: true, jetzt: new Date('2026-11-14T10:00:00Z') });
  assert.deepEqual([direkt.ueber, direkt.bestelltAm], ['kunde', '2026-11-13T10:00:00.000Z'], 'Bestelldatum bleibt');
  setzeStatus(file, { orderId: o, lineItemId: li, status: 'geliefert', actor: 'tobias' });
  assert.throws(() => vermerkeDirektversand(file, { orderId: o, lineItemId: li, actor: 'tobias', auchOffen: true }), e => e.status === 409, 'schon eingetroffen: erst zuruecknehmen');
});

test('setzeStatus behaelt frueher gesetzte Felder beim naechsten Schritt', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: 'tobias', lieferantBestellnummer: 'LB-1' });
  const zweite = setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'geliefert', actor: 'ahmet' });
  assert.equal(zweite.status, 'geliefert');
  assert.equal(zweite.lieferantBestellnummer, 'LB-1', 'alte Bestellnummer bleibt erhalten');
  assert.ok(zweite.bestelltAm, 'fruehere Stufe bleibt im Datensatz');
});

test('setzeStatus lehnt fehlende Pflichtangaben ab', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  assert.throws(() => setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: '' }), AuftragsstatusFehler);
  assert.throws(() => setzeStatus(file, { orderId: '', lineItemId: '1', status: 'bestellt', actor: 'x' }), AuftragsstatusFehler);
  assert.throws(() => setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'unsinn', actor: 'x' }), AuftragsstatusFehler);
});

test('STATUS_ORDER und filterGruppe bilden offen/bestellt/unterwegs/erledigt ab', () => {
  assert.deepEqual(STATUS_ORDER, ['bestellt', 'geliefert', 'raus', 'erledigt']);
  assert.equal(filterGruppe(undefined), 'offen');
  assert.equal(filterGruppe('bestellt'), 'bestellt');
  assert.equal(filterGruppe('geliefert'), 'unterwegs');
  assert.equal(filterGruppe('raus'), 'unterwegs');
  assert.equal(filterGruppe('erledigt'), 'erledigt');
});

test('oeffneWieder: ohne Einkauf abgeschlossen -> wieder "noch nicht bestellt", Abschluss im Verlauf', () => {
  const file = auftragsstatusPfad(tmpDir());
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'erledigt', actor: 'tobias', notiz: 'Testbestellung', jetzt: new Date('2026-09-23T09:00:00Z') });
  const e = oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'ahmet', notiz: 'war doch echt', jetzt: new Date('2026-09-24T08:00:00Z') });
  assert.equal(e.status, null);
  assert.equal(filterGruppe(e.status), 'offen');
  assert.equal(e.wiederGeoeffnetVon, 'ahmet');
  assert.equal(e.erledigtAm, undefined, 'Abschluss steht nicht mehr als aktueller Stand im Datensatz');
  assert.deepEqual(e.verlauf, [{ aktion: 'wieder geöffnet', am: '2026-09-24T08:00:00.000Z', von: 'ahmet', zurueckAuf: null, abgeschlossenAm: '2026-09-23T09:00:00.000Z', abgeschlossenVon: 'tobias', abschlussGrund: 'Testbestellung', notiz: 'war doch echt' }]);
  assert.equal(leseAlle(file)[positionKey('1', '1')].status, null);
});

test('oeffneWieder: normal durchgelaufene Position faellt auf den letzten Schritt zurueck', () => {
  const file = auftragsstatusPfad(tmpDir());
  const t = h => new Date(`2026-09-2${h}T09:00:00Z`);
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: 'x', lieferantBestellnummer: 'LB-1', jetzt: t(1) });
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'geliefert', actor: 'x', jetzt: t(2) });
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'erledigt', actor: 'x', jetzt: t(3) });
  const e = oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'y', jetzt: t(4) });
  assert.equal(e.status, 'geliefert');
  assert.equal(e.lieferantBestellnummer, 'LB-1');
  assert.equal(e.bestelltAm, '2026-09-21T09:00:00.000Z', 'Bestelldatum bleibt fuer die Wartezeit erhalten');
});

test('oeffneWieder lehnt nicht erledigte oder unbekannte Positionen ab', () => {
  const file = auftragsstatusPfad(tmpDir());
  assert.throws(() => oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'x' }), AuftragsstatusFehler);
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: 'x' });
  assert.throws(() => oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'x' }), AuftragsstatusFehler);
  assert.throws(() => oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: '' }), AuftragsstatusFehler);
});

test('statusVorErledigt ignoriert Schritte nach dem Abschluss', () => {
  assert.equal(statusVorErledigt(null), null);
  assert.equal(statusVorErledigt({ status: 'erledigt', erledigtAm: '2026-09-23T09:00:00Z' }), null);
  assert.equal(statusVorErledigt({ status: 'erledigt', bestelltAm: '2026-09-22T09:00:00Z', erledigtAm: '2026-09-23T09:00:00Z' }), 'bestellt');
  assert.equal(statusVorErledigt({ status: 'erledigt', rausAm: '2026-09-25T09:00:00Z', bestelltAm: '2026-09-22T09:00:00Z', erledigtAm: '2026-09-23T09:00:00Z' }), 'bestellt');
});

test('Versand: Sendungsnummer bei "raus", Shopify-Vermerk bleibt bei Wiederholung, neuer Versand faengt leer an', () => {
  const file = auftragsstatusPfad(tmpDir());
  const pos = { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1', actor: 'test' };
  setzeStatus(file, { ...pos, status: 'geliefert' });
  const e = setzeStatus(file, { ...pos, status: 'raus', sendungsnummer: 'N1', versanddienst: 'GLS' });
  assert.deepEqual([e.sendungsnummer, e.versanddienst], ['N1', 'GLS']);
  assert.equal(setzeStatus(file, { ...pos, status: 'bestellt', sendungsnummer: 'X' }).sendungsnummer, 'N1', 'nur bei "raus"');
  vermerkeShopifyVersand(file, { ...pos, vermerk: { status: 'gebucht', fulfillmentId: 'gid://shopify/Fulfillment/9', kundeBenachrichtigt: true, am: '2026-10-13T10:00:00Z' } });
  assert.equal(leseAlle(file)[positionKey(pos.orderId, pos.lineItemId)].shopifyVersand.status, 'gebucht');
  // Wechsel von "bestellt" auf "raus" ist ein neuer Versand: alter Vermerk weg.
  const neu = setzeStatus(file, { ...pos, status: 'raus' });
  assert.equal(neu.shopifyVersand, undefined);
  assert.equal(neu.sendungsnummer, null);
  // Zweites "raus" auf derselben Sendung: Vermerk bleibt.
  vermerkeShopifyVersand(file, { ...pos, vermerk: { status: 'gebucht' } });
  assert.equal(setzeStatus(file, { ...pos, status: 'raus' }).shopifyVersand.status, 'gebucht');
  // Erledigt und zurueck auf raus (Korrektur): Vermerk bleibt.
  setzeStatus(file, { ...pos, status: 'erledigt' });
  assert.equal(setzeStatus(file, { ...pos, status: 'raus' }).shopifyVersand.status, 'gebucht');
  // Zurueck auf offen: Vermerk wandert in den Verlauf.
  const offen = setzeZurueckAufOffen(file, { ...pos, notiz: 'Versehen' });
  assert.equal(offen.shopifyVersand, undefined);
  assert.equal(offen.verlauf.at(-1).vorher.shopifyVersand.status, 'gebucht');
  assert.equal(vermerkeShopifyVersand(file, { orderId: 'gid://shopify/Order/2', lineItemId: 'gid://shopify/LineItem/2', vermerk: { status: 'gebucht' } }), null, 'unbekannte Position: nichts angelegt');
});

test('Kettler-Vermerk: "bestellt" mit ueber=kettler bleibt bei den naechsten Schritten, null nimmt ihn zurueck', () => {
  const file = auftragsstatusPfad(tmpDir());
  const basis = { orderId: 'o1', lineItemId: 'l1', actor: 'test' };
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: 'kettler' }).ueber, 'kettler');
  assert.equal(setzeStatus(file, { ...basis, status: 'geliefert' }).ueber, 'kettler', 'naechster Schritt behaelt den Weg');
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt' }).ueber, 'kettler', 'ohne Angabe bleibt der Vermerk');
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: null }).ueber, null);
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: 'irgendwas' }).ueber, null, 'nur "kettler" und "kunde" sind Wege');
  assert.equal(leseAlle(file)[positionKey('o1', 'l1')].ueber, null);
});

test('Direktversand-Vermerk: Muster mit ueber=kunde behalten den Weg bis "raus"', () => {
  const file = auftragsstatusPfad(tmpDir());
  const basis = { orderId: 'o2', lineItemId: 'l2', actor: 'test' };
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: 'kunde' }).ueber, 'kunde');
  assert.equal(setzeStatus(file, { ...basis, status: 'raus' }).ueber, 'kunde', '"raus" ohne Angabe behaelt den Weg');
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: null }).ueber, null, 'Mail an den Laden nimmt ihn zurueck');
});

// "Von uns abschicken" (#1995): Zugeschnitten/Gepackt je Position - erfundene Kennungen.
const SV = { orderId: 'gid://test/Order/LAGER-1', lineItemId: 'gid://test/LineItem/LAGER-1' };

test('selbstversand: zugeschnitten setzt "bei uns" mit Vermerk "aus Lager", gepackt danach; idempotent', () => {
  const file = auftragsstatusPfad(tmpDir());
  const jetzt = new Date('2026-11-06T09:00:00Z');
  const z = setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test', jetzt });
  assert.equal(z.status, 'geliefert');
  assert.equal(z.ueber, 'lager');
  assert.equal(z.geliefertNotiz, 'Aus eigenem Lager zugeschnitten');
  assert.deepEqual(z.selbstversand.zugeschnitten, { am: jetzt.toISOString(), von: 'test', vorher: null, ueberVorher: null });
  assert.equal(setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test2' }).selbstversand.zugeschnitten.von, 'test', 'Doppelklick aendert nichts');
  const g = setzeSelbstversand(file, { ...SV, schritt: 'gepackt', an: true, actor: 'test', jetzt: new Date('2026-11-06T10:00:00Z') });
  assert.equal(g.selbstversand.gepackt.am, '2026-11-06T10:00:00.000Z');
  assert.ok(UEBER_WERTE.includes('lager') && UEBER_WERTE.includes('laden'));
  // Lesbar bleibt die Datei auch mit dem neuen Feld.
  assert.equal(leseAlle(file)[positionKey(SV.orderId, SV.lineItemId)].selbstversand.gepackt.von, 'test');
});

test('selbstversand: zuruecknehmen in umgekehrter Reihenfolge, Altfall "bestellt" kehrt dorthin zurueck', () => {
  const file = auftragsstatusPfad(tmpDir());
  setzeStatus(file, { ...SV, status: 'bestellt', actor: 'test', jetzt: new Date('2026-11-01T09:00:00Z') });
  setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test' });
  setzeSelbstversand(file, { ...SV, schritt: 'gepackt', an: true, actor: 'test' });
  assert.throws(() => setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: false, actor: 'test' }), e => e instanceof AuftragsstatusFehler && e.status === 409, 'erst "Gepackt" zuruecknehmen');
  const ohneGepackt = setzeSelbstversand(file, { ...SV, schritt: 'gepackt', an: false, actor: 'test' });
  assert.equal(ohneGepackt.selbstversand.gepackt, undefined);
  assert.equal(ohneGepackt.verlauf.at(-1).aktion, 'gepackt zurückgenommen');
  const zurueck = setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: false, actor: 'test' });
  assert.equal(zurueck.status, 'bestellt', 'zurueck auf den Stand vor dem Zuschnitt');
  assert.equal(zurueck.geliefertAm, undefined);
  assert.equal(zurueck.selbstversand, undefined, 'leeres Feld verschwindet');
  assert.equal(zurueck.verlauf.at(-1).aktion, 'zugeschnitten zurückgenommen');
  assert.equal(zurueck.ueber, undefined, 'B1: ohne Vermerk davor kein "aus Lager" mehr');
});

test('G4/B1: "Zugeschnitten" zuruecknehmen stellt den Vermerk davor wieder her, "Zurück auf offen" nimmt "aus Lager" mit', () => {
  // Vermerk davor: wiederhergestellt.
  const mitVermerk = auftragsstatusPfad(tmpDir());
  setzeStatus(mitVermerk, { ...SV, status: 'bestellt', ueber: 'laden', actor: 'test' });
  const z = setzeSelbstversand(mitVermerk, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test' });
  assert.deepEqual([z.ueber, z.selbstversand.zugeschnitten.ueberVorher], ['lager', 'laden']);
  const zurueck = setzeSelbstversand(mitVermerk, { ...SV, schritt: 'zugeschnitten', an: false, actor: 'test' });
  assert.deepEqual([zurueck.status, zurueck.ueber], ['bestellt', 'laden']);
  // Zugeschnitten -> Zurueck auf offen: der Vermerk "aus Lager" wandert in den Verlauf.
  const offenFile = auftragsstatusPfad(tmpDir());
  setzeSelbstversand(offenFile, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test' });
  setzeSelbstversand(offenFile, { ...SV, schritt: 'gepackt', an: true, actor: 'test' });
  const offen = setzeZurueckAufOffen(offenFile, { ...SV, actor: 'test' });
  assert.equal(offen.ueber, undefined);
  assert.equal(offen.verlauf.at(-1).vorher.ueber, 'lager');
  assert.equal(leseAlle(offenFile)[positionKey(SV.orderId, SV.lineItemId)].ueber, undefined);
  // Andere Vermerke bleiben wie bisher (sie zaehlen ohne Schritt ohnehin nicht).
  const kunde = auftragsstatusPfad(tmpDir());
  setzeStatus(kunde, { ...SV, status: 'bestellt', ueber: 'kunde', actor: 'test' });
  assert.equal(setzeZurueckAufOffen(kunde, { ...SV, actor: 'test' }).ueber, 'kunde');
  // Danach Zuschneiden trotz altem Vermerk "kunde": ohne Schritt ist er Vergangenheit.
  const neu = setzeSelbstversand(kunde, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test' });
  assert.deepEqual([neu.status, neu.ueber, neu.selbstversand.zugeschnitten.ueberVorher], ['geliefert', 'lager', 'kunde']);
  // "bestellt" setzt nie "aus Lager".
  const bestellt = auftragsstatusPfad(tmpDir());
  assert.equal(setzeStatus(bestellt, { ...SV, status: 'bestellt', ueber: 'lager', actor: 'test' }).ueber, null);
  // Ein ungueltiger Vermerk davor macht die Ablage unlesbar (nie still).
  const roh = JSON.parse(fs.readFileSync(mitVermerk, 'utf8'));
  roh.positionen[positionKey(SV.orderId, SV.lineItemId)].selbstversand = { zugeschnitten: { am: 'x', von: 'y', vorher: null, ueberVorher: 'irgendwo' } };
  fs.writeFileSync(mitVermerk, JSON.stringify(roh));
  assert.throws(() => leseAlle(mitVermerk), /beschädigt/);
});

test('selbstversand: Grenzen - Direktware, schon raus, Gepackt vor Eingang, unbekannter Schritt', () => {
  const file = auftragsstatusPfad(tmpDir());
  const fehler409 = e => e instanceof AuftragsstatusFehler && e.status === 409;
  assert.throws(() => setzeSelbstversand(file, { ...SV, schritt: 'gepackt', an: true, actor: 'test' }), fehler409, 'nichts bei uns: nicht packen');
  assert.throws(() => setzeSelbstversand(file, { ...SV, schritt: 'gepackt', an: false, actor: 'test' }), fehler409);
  assert.throws(() => setzeSelbstversand(file, { ...SV, schritt: 'gefaltet', an: true, actor: 'test' }), AuftragsstatusFehler);
  assert.throws(() => setzeSelbstversand(file, { ...SV, schritt: 'gepackt', an: 'ja', actor: 'test' }), AuftragsstatusFehler);
  setzeStatus(file, { ...SV, status: 'bestellt', ueber: 'kunde', actor: 'test' });
  assert.throws(() => setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test' }), fehler409, 'Hersteller schickt direkt');
  const andere = { ...SV, lineItemId: 'gid://test/LineItem/LAGER-2' };
  setzeStatus(file, { ...andere, status: 'raus', actor: 'test' });
  assert.throws(() => setzeSelbstversand(file, { ...andere, schritt: 'zugeschnitten', an: true, actor: 'test' }), fehler409, 'schon raus');
});

test('selbstversand: kaputtes Feld macht die Ablage unlesbar; "Zurück auf offen" nimmt es mit in den Verlauf', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  setzeSelbstversand(file, { ...SV, schritt: 'zugeschnitten', an: true, actor: 'test' });
  const offen = setzeZurueckAufOffen(file, { ...SV, actor: 'test' });
  assert.equal(offen.status, null);
  assert.equal(offen.selbstversand, undefined);
  assert.ok(offen.verlauf.at(-1).vorher.selbstversand.zugeschnitten, 'alter Durchlauf im Verlauf');
  const roh = JSON.parse(fs.readFileSync(file, 'utf8'));
  roh.positionen[positionKey(SV.orderId, SV.lineItemId)].selbstversand = { gepackt: 'gestern' };
  fs.writeFileSync(file, JSON.stringify(roh));
  assert.throws(() => leseAlle(file), /beschädigt/);
  roh.positionen[positionKey(SV.orderId, SV.lineItemId)].selbstversand = { gefaltet: { am: 'x', von: 'y' } };
  fs.writeFileSync(file, JSON.stringify(roh));
  assert.throws(() => leseAlle(file), /beschädigt/);
});
