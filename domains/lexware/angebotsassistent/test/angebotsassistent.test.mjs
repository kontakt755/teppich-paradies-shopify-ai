import assert from 'node:assert/strict';
import test from 'node:test';
import { lade, stamm as ladeStamm, kopie } from './lade.mjs';

const tp = lade();
const stamm = ladeStamm(tp);
const rechne = (v) => tp.tpAngebotBerechnen(v, stamm);
const nr = (erg) => erg.positionen.map((p) => p.artikel.nr || p.artikel.titel);
const pos = (erg, ref) => erg.positionen.find((p) => p.artikel.nr === ref || p.artikel.id === ref);
const stufen = (erg, stufe) => erg.meldungen.filter((m) => m.stufe === stufe).map((m) => m.text);

function teppichVorgang(raeume, extra = {}) {
  return {
    vorgangId: 'T', datum: '2026-10-13',
    kunde: { kundentyp: 'privat', name: 'Test', strasse: 'Teststraße 1', plz: '16515', ort: 'Oranienburg' },
    baustelle: { entfernungKm: 9, fahrzone: 'nah' },
    fahrten: { anzahl: 1 },
    untergrundOhneArbeiten: true, keineSockelleisten: true,
    raeume: raeume.map((r) => ({ bodenart: 'teppichboden', belag: { ref: { nr: 'TB-LUMINA-85' } }, rollenbreiteM: 4, verlegeart: 'fixiert', ...r })),
    ...extra
  };
}

/* ---------- Artikelstamm ---------- */

test('Artikelstamm: archivierte und AUSORTIERT-Artikel sind ausgeschlossen', () => {
  const titel = stamm.artikel.map((a) => a.titel);
  assert.ok(!titel.some((t) => /^AUSORTIERT/.test(t)));
  assert.equal(stamm.ausgeschlossen.length, 3);
  assert.match(tp.tpArtikelFinden(stamm, { nr: 'SL-090' }).fehler, /AUSORTIERT/);
  assert.match(tp.tpArtikelFinden(stamm, { id: '5452af13-3caa-4123-8da3-f813e9c66561' }).fehler, /nicht im Export|nicht verwendbar|AUSORTIERT/);
});

test('Artikelstamm: Preis mit Netto, Brutto, Steuersatz, Einheit und Quelle', () => {
  const mg = tp.tpArtikelFinden(stamm, { nr: 'MG-010' }).artikel;
  assert.deepEqual(kopie({ netto: mg.netto, brutto: mg.brutto, st: mg.steuersatz, e: mg.einheit, status: mg.preisStatus }),
    { netto: 59, brutto: 70.21, st: 19, e: 'Pauschal', status: 'ok' });
  assert.match(mg.quelle, /2026-10-13/);
  assert.equal(tp.tpArtikelFinden(stamm, { id: '15cd6794-14c1-4adc-9e9b-1a50ea099951' }).artikel.preisStatus, 'null');
});

/* ---------- Netto-/Bestellflaeche ---------- */

test('Bestellmaß je Bahn getrennt von der Netto-Verlegefläche; Arbeit nach Netto', () => {
  const erg = rechne(teppichVorgang([
    { name: 'WZ', laengeM: 5.1, breiteM: 3.9, verlegeart: 'fixiert' },
    { name: 'SZ', laengeM: 4.06, breiteM: 3.8, verlegeart: 'fixiert' }
  ], { aktion649: 'aus' }));
  assert.equal(erg.raeume[0].bestellung.flaeche, 20.8);
  assert.equal(erg.raeume[1].bestellung.flaeche, 16.64);
  assert.equal(pos(erg, 'TB-LUMINA-85').menge, 37.44);
  assert.equal(pos(erg, 'TB-020').menge, 35.32); // 19,89 + 15,43 netto
  assert.match(pos(erg, 'TB-LUMINA-85').beschreibung, /SZ: Bestellmaß 4,00 m × 4,16 m = 16,64 m²/);
});

test('Bestelllänge kürzer als Länge + 10 cm Zugabe ist ein Regelkonflikt (4,15 statt 4,16)', () => {
  const erg = rechne(teppichVorgang([{ name: 'SZ', laengeM: 4.06, breiteM: 3.8, bestellLaengeM: 4.15 }]));
  assert.ok(stufen(erg, 'konflikt').some((t) => /4,15 m kleiner als Länge \+ Zugabe/.test(t)));
  assert.equal(erg.blockiert, true);
  const ok = rechne(teppichVorgang([{ name: 'SZ', laengeM: 4.06, breiteM: 3.8, bestellLaengeM: 4.16 }]));
  assert.ok(!stufen(ok, 'konflikt').length);
});

test('Raum breiter als Rolle verlangt Bahnen; angegebene Bahnen werden addiert', () => {
  const ohne = rechne(teppichVorgang([{ name: 'Saal', laengeM: 5.1, breiteM: 4.5 }]));
  assert.ok(stufen(ohne, 'fehler').some((t) => /breiter als Rolle/.test(t)));
  const mit = rechne(teppichVorgang([{ name: 'Saal', laengeM: 5.1, breiteM: 4.5, bahnen: [{ breiteM: 4, laengeM: 5.2 }, { breiteM: 4, laengeM: 0.7 }] }]));
  assert.equal(mit.raeume[0].bestellung.flaeche, 23.6);
});

/* ---------- 649-EUR-Aktion ---------- */

test('Aktion 649: knapp darüber gilt, knapp darunter nicht – nur Bodenbelag zählt', () => {
  const drueber = rechne(teppichVorgang([{ name: 'WZ', laengeM: 4.9, breiteM: 3.9, verlegeart: 'lose', fixierung: 'nein' }]));
  assert.equal(drueber.aktion.warenwertBrutto, 659.02);
  assert.equal(drueber.aktion.angewendet, true);
  const drunter = rechne(teppichVorgang([{ name: 'WZ', laengeM: 4.8, breiteM: 3.9, verlegeart: 'lose', fixierung: 'nein' }]));
  assert.equal(drunter.aktion.warenwertBrutto, 645.84);
  assert.equal(drunter.aktion.gilt, false);
  assert.ok(pos(drunter, 'TB-080'));
});

test('Aktion 649: Klebevinyl, Arbeit, Sockelleisten und Fahrten zählen nicht zum Warenwert', () => {
  const v = teppichVorgang([{ name: 'WZ', laengeM: 4.9, breiteM: 3.9, verlegeart: 'lose', fixierung: 'nein' }]);
  v.raeume.push({ name: 'Bad', laengeM: 3, breiteM: 2, bodenart: 'klebevinyl', belag: { ref: { id: '5ce6248b-f867-4e72-b88c-254bd53b698f' }, verschnittProzent: 10 }, verlegeart: 'verklebt', silikon: { zusatzLfm: 2 }, keineProfile: true });
  v.zusatzpositionen = [{ ref: { nr: 'AB-001' }, menge: 25 }];
  const erg = rechne(v);
  assert.equal(erg.aktion.warenwertBrutto, 659.02);
  assert.ok(pos(erg, 'KV-030'), 'Vinyl bleibt kostenpflichtig (Einzelraum-Pauschale)');
});

test('Aktion 649: nicht für Gewerbe, > 15 km, rabattierten Belag; Entfernung muss geprüft sein', () => {
  const basis = teppichVorgang([{ name: 'WZ', laengeM: 4.9, breiteM: 3.9, verlegeart: 'lose', fixierung: 'nein' }]);
  const gewerbe = kopie(basis); gewerbe.kunde.kundentyp = 'gewerbe';
  assert.equal(rechne(gewerbe).aktion.gilt, false);
  const weit = kopie(basis); weit.baustelle = { entfernungKm: 16, fahrzone: 'nah' };
  assert.equal(rechne(weit).aktion.gilt, false);
  const rabatt = kopie(basis); rabatt.raeume[0].belag.rabattiert = true;
  assert.match(rechne(rabatt).aktion.gruende.join(), /rabattiert/);
  const unbekannt = kopie(basis); unbekannt.baustelle = { fahrzone: 'nah' };
  const e = rechne(unbekannt);
  assert.equal(e.aktion.gilt, false);
  assert.ok(stufen(e, 'offen').some((t) => /Aktion 649 € möglich.*Entfernung prüfen/.test(t)));
});

test('Aktion 649: lose Verlegung + 1. Fahrt inklusive, Fixierung über Zusatzposition, nie TB-020', () => {
  const v = teppichVorgang([{ name: 'WZ', laengeM: 4.9, breiteM: 3.9, verlegeart: 'fixiert' }], { fahrten: { anzahl: 2 } });
  const erg = rechne(v);
  assert.equal(pos(erg, 'a8cdfc6b-e55b-4859-8098-1818210a7e67').preisNetto, 0);
  assert.equal(pos(erg, '92798372-417c-4c52-ae98-77faa7e8ae89').menge, 19.11);
  assert.ok(!pos(erg, 'TB-020'));
  assert.equal(pos(erg, 'FA-010').menge, 1, 'nur die zweite Fahrt wird berechnet');
  v.zusatzpositionen = [{ ref: { nr: 'TB-020' }, menge: 19.11 }];
  assert.ok(stufen(rechne(v), 'konflikt').some((t) => /TB-020 darf bei aktiver 649/.test(t)));
});

/* ---------- Pauschalen kleiner Flaechen ---------- */

test('Einzelraum bis 12 m² nutzt die Lexware-Pauschale, mehrere Räume den m²-Preis', () => {
  const einzeln = rechne(teppichVorgang([{ name: 'KiZ', laengeM: 3.5, breiteM: 3.4 }]));
  assert.equal(pos(einzeln, 'TB-060').menge, 1);
  assert.ok(!pos(einzeln, 'TB-020'));
  const zwei = rechne(teppichVorgang([{ name: 'A', laengeM: 3, breiteM: 3 }, { name: 'B', laengeM: 3, breiteM: 2 }], { aktion649: 'aus' }));
  assert.equal(pos(zwei, 'TB-020').menge, 15);
  assert.ok(!pos(zwei, 'TB-060'));
});

/* ---------- Daemmung, Pakete, Sockelleisten, Silikon, Profile ---------- */

test('Dämmunterlage: Netto ohne extra Verschnitt, auf halbe Rolle aufgerundet, Rollenanzahl in der Beschreibung', () => {
  const v = teppichVorgang([]);
  v.raeume = [{ name: 'WZ', nettoM2: 39.5, laengeM: 7.9, breiteM: 5, bodenart: 'klebevinyl', belag: { ref: { id: '5ce6248b-f867-4e72-b88c-254bd53b698f' }, verschnittProzent: 8 }, verlegeart: 'verklebt',
    daemmung: { ref: { id: '77794d96-76a3-4415-b1ba-b66f00511cd6' } }, silikon: { zusatzLfm: 1 }, keineProfile: true }];
  const erg = rechne(v);
  const d = pos(erg, '77794d96-76a3-4415-b1ba-b66f00511cd6');
  assert.equal(d.menge, 42.25); // 39,5 / 6,5 = 6,08 -> 6,5 Rollen (Entscheidung 14.10.: kein extra Verschnitt)
  assert.match(d.beschreibung, /entspricht ca\. 6,5 Rollen à 6,50 m² \(Netto-Verlegefläche 39,50 m²\)/);
  assert.ok(!stufen(erg, 'konflikt').length);
  v.raeume[0].nettoM2 = 39; // 6,0 Rollen genau -> keine Aufrundung
  assert.equal(pos(rechne(v), '77794d96-76a3-4415-b1ba-b66f00511cd6').menge, 39);
  v.raeume[0].nettoM2 = 39.5;
  v.raeume[0].daemmung.nurGanzeRollen = true;
  assert.equal(pos(rechne(v), '77794d96-76a3-4415-b1ba-b66f00511cd6').menge, 45.5);
});

test('Paketware: Verschnitt und Paketinhalt, auf ganze Pakete; ohne Verschnitt keine Schätzung', () => {
  const erg = rechne(kopie(tp.TP_BEISPIELE.umfangreich));
  const belag = pos(erg, '5ce6248b-f867-4e72-b88c-254bd53b698f');
  assert.equal(belag.menge, 33.7); // 30,88 × 1,08 = 33,35 -> 10 Pakete à 3,37
  assert.match(belag.beschreibung, /10 Pakete à 3,37 m²/);
  const v = kopie(tp.TP_BEISPIELE.umfangreich);
  v.raeume.forEach((r) => { delete r.belag.verschnittProzent; });
  assert.ok(stufen(rechne(v), 'fehler').some((t) => /Verschnitt % .* fehlt/.test(t)));
});

test('Umfangreiches Testangebot: Silikon nach Umfang, Sockelleisten Material/Montage getrennt, Berlin-Fahrten', () => {
  const erg = rechne(kopie(tp.TP_BEISPIELE.umfangreich));
  assert.equal(pos(erg, 'SL-102').menge, 29); // 19,7 + 8,5 = 28,2 -> volle lfm
  assert.match(pos(erg, 'SL-102').beschreibung, /Silikonfarbe wird passend/);
  assert.equal(pos(erg, 'TZ-020').menge, 3);
  assert.equal(pos(erg, 'SL-010').menge, 13); // 27,5 m + 10 % = 30,25 m -> 13 Leisten à 2,50
  assert.equal(pos(erg, 'SL-095').menge, 27.5);
  assert.match(pos(erg, 'SL-095').beschreibung, /Sockelleistenmenge wurde vorläufig geschätzt/);
  assert.ok(stufen(erg, 'hinweis').some((t) => /Sockelleisten-Verschnitt: Standard 10 %/.test(t)));
  assert.ok(!stufen(erg, 'offen').some((t) => /Verschnitt/.test(t)));
  assert.equal(pos(erg, 'KV-010').menge, 30.88);
  assert.equal(pos(erg, '62f3ffa4-fa7c-4e3d-a2b4-af024f6253bb').menge, 3);
  assert.equal(pos(erg, 'SL-094').optional, true);
  assert.match(erg.texte.schluss.join('\n'), /grobe Erstkalkulation[\s\S]*Offene Punkte:[\s\S]*Sockelleistenmenge vorläufig/);
  assert.match(erg.texte.schluss.join('\n'), /Malerarbeiten/);
});

test('Silikon ohne Türbreiten wird als vorläufig markiert, nicht pauschal 1 lfm', () => {
  const v = teppichVorgang([]);
  v.raeume = [{ name: 'Bad', laengeM: 2.5, breiteM: 2, bodenart: 'klebevinyl', belag: { ref: { id: '5ce6248b-f867-4e72-b88c-254bd53b698f' }, verschnittProzent: 10 }, verlegeart: 'verklebt', silikon: { umlaufend: true, zusatzLfm: 1.2 }, keineProfile: true }];
  const erg = rechne(v);
  assert.equal(pos(erg, 'SL-102').menge, 11); // 9 + 1,2 = 10,2 -> 11
  assert.ok(stufen(erg, 'offen').some((t) => /Türöffnungsbreiten fehlen/.test(t)));
});

/* ---------- Preise ---------- */

test('Auftragsspezifische Preisabweichung wird sichtbar markiert und braucht eine Begründung', () => {
  const v = teppichVorgang([{ name: 'KiZ', laengeM: 3.5, breiteM: 3.4 }], {
    materialReinigung: { preisNetto: 29, begruendung: 'Sonderpreis laut Ahmet' },
    fahrten: { anzahl: 1, preisNetto: 39 }
  });
  const erg = rechne(v);
  const mg = pos(erg, 'MG-010');
  assert.deepEqual(kopie(mg.abweichung), { lexware: 59, angebot: 29, begruendung: 'Sonderpreis laut Ahmet' });
  assert.ok(stufen(erg, 'fehler').some((t) => /An- und Abfahrt.*ohne Begründung/.test(t)), 'historische 39 € ohne Vorgabe blockieren');
  v.materialReinigung.preisNetto = 29.999;
  assert.ok(stufen(rechne(v), 'fehler').some((t) => /mehr als 2 Nachkommastellen/.test(t)));
});

test('Preis 0, Sprühkleber, AUSORTIERT und 0-%-Altartikel werden nicht übernommen', () => {
  const v = teppichVorgang([{ name: 'KiZ', laengeM: 3.5, breiteM: 3.4 }], {
    zusatzpositionen: [
      { ref: '15cd6794-14c1-4adc-9e9b-1a50ea099951', menge: 2 },
      { ref: '1c25f63b-e7f9-43be-a6b6-99e3c3376880', menge: 10 },
      { ref: 'SL-090', menge: 10 },
      { ref: '7cab9e2b-eb09-4896-92ca-4ccb2849fc05', menge: 10 }
    ]
  });
  const erg = rechne(v);
  const f = stufen(erg, 'fehler').join('\n');
  assert.match(f, /Preis 0,00 € ohne bestätigte kostenlose Leistung/);
  assert.match(f, /Sprühkleber/);
  assert.match(f, /SL-090 ist AUSORTIERT/);
  assert.ok(stufen(erg, 'konflikt').some((t) => /Steuersatz 0 %/.test(t)));
  assert.equal(erg.blockiert, true);
});

test('Rundung: kaufmännisch auf 2 Stellen, Steuer auf die Nettosumme', () => {
  assert.equal(tp.tpRunden2(1.005), 1.01);
  assert.equal(tp.tpRunden2(2.675), 2.68);
  assert.equal(tp.tpRunden2(14.5 * 4.99), 72.36);
  assert.equal(tp.tpAufrunden(6.38, 0.5), 6.5);
  assert.equal(tp.tpAufrunden(6.5, 0.5), 6.5);
  const s = tp.tpSummen([
    { menge: 3, preisNetto: 0.33, steuersatz: 19 },
    { menge: 1, preisNetto: 0.01, steuersatz: 19 },
    { menge: 1, preisNetto: 100, steuersatz: 19, optional: true }
  ]);
  assert.deepEqual(kopie({ n: s.netto, st: s.steuer, b: s.brutto, o: s.optionalNetto }), { n: 1, st: 0.19, b: 1.19, o: 100 });
});

/* ---------- Reihenfolge, Beispiele, Pflichtkontrolle ---------- */

test('Verlegeangebot: MG-010 vorletzte, An-/Abfahrt letzte Position – auch bei bunter Eingabe', () => {
  const v = kopie(tp.TP_BEISPIELE.verlegung);
  v.zusatzpositionen = [{ ref: { nr: 'FA-010' }, menge: 1 }, { ref: { nr: 'UG-030' }, menge: 5 }].concat(v.zusatzpositionen);
  const erg = rechne(v);
  const liste = erg.positionen.filter((p) => !p.optional);
  assert.equal(liste.at(-1).artikel.nr, 'FA-010');
  assert.equal(liste.at(-2).artikel.nr, 'MG-010');
  assert.ok(!stufen(erg, 'konflikt').length);
});

test('Testangebot „einfach“: MG-010 ergänzt, Anfahrt zum aktuellen Standard 59 €', () => {
  const erg = rechne(kopie(tp.TP_BEISPIELE.einfach));
  assert.deepEqual(kopie(nr(erg)), ['TB-LUMINA-85', 'TB-060', 'MG-010', 'FA-010']);
  assert.equal(pos(erg, 'FA-010').preisNetto, 59);
  assert.deepEqual(kopie({ n: erg.summen.netto, s: erg.summen.steuer, b: erg.summen.brutto }), { n: 644.66, s: 122.49, b: 767.15 });
  assert.equal(erg.blockiert, false);
});

test('Testangebot „Verlegung“: Aktion, optionale Fixierung, Einschubleisten bleiben bestehen', () => {
  const erg = rechne(kopie(tp.TP_BEISPIELE.verlegung));
  assert.equal(erg.aktion.angewendet, true);
  assert.ok(pos(erg, 'AB-012') && pos(erg, 'SL-101') && !pos(erg, 'SL-100'));
  const fix = erg.positionen.filter((p) => p.artikel.id === '92798372-417c-4c52-ae98-77faa7e8ae89');
  assert.deepEqual(kopie(fix.map((p) => [p.menge, p.optional])), [[15.43, false], [19.89, true]]);
  assert.deepEqual(kopie({ n: erg.summen.netto, s: erg.summen.steuer, b: erg.summen.brutto, o: erg.summen.optionalNetto }),
    { n: 1585.68, s: 301.28, b: 1886.96, o: 118.35 });
  assert.equal(erg.blockiert, false);
});

test('Pflichtkontrolle: manuelle Punkte brauchen Bestätigung, sonst kein Entwurf', () => {
  const v = kopie(tp.TP_BEISPIELE.verlegung);
  const ohne = tp.tpPflichtkontrolle(v, rechne(v));
  assert.equal(ohne.freigabe, false);
  assert.equal(ohne.gruende.filter((g) => /Bestätigung fehlt/.test(g)).length, 4);
  v.bestaetigungen = { kunde: true, adresseOeffentlich: true, untergrund: true, fahrten: true };
  const mit = tp.tpPflichtkontrolle(v, rechne(v));
  assert.deepEqual(kopie(mit.gruende), []);
  assert.equal(mit.freigabe, true);
});

/* ---------- Lexware ---------- */

test('Lexware-Payload: Entwurf mit Netto-Preisen, Datum Europe/Berlin, optionale Positionen markiert', () => {
  const v = kopie(tp.TP_BEISPIELE.verlegung);
  const erg = rechne(v);
  const p = tp.tpLexwarePayload(v, erg);
  assert.equal(p.voucherDate, '2026-10-13T00:00:00.000+02:00');
  assert.equal(p.expirationDate, '2026-11-12T00:00:00.000+01:00');
  assert.equal(p.taxConditions.taxType, 'net');
  assert.equal(p.lineItems.length, erg.positionen.length);
  assert.equal(p.lineItems.filter((l) => l.optional).length, 1);
  assert.ok(p.lineItems.every((l) => l.unitPrice.currency === 'EUR' && l.id));
  assert.equal(p.address.countryCode, 'DE');
  assert.deepEqual(kopie(tp.tpPayloadPruefen(p)), []);
  assert.equal(p.finalize, undefined);
});

test('Rücklesen: identischer Entwurf besteht, jede Abweichung wird gemeldet', () => {
  const v = kopie(tp.TP_BEISPIELE.verlegung);
  const erg = rechne(v);
  const p = tp.tpLexwarePayload(v, erg);
  const gelesen = kopie({ ...p, voucherStatus: 'draft', totalPrice: { totalNetAmount: 1585.68, totalTaxAmount: 301.28, totalGrossAmount: 1886.96 } });
  assert.deepEqual(kopie(tp.tpEntwurfVergleichen(p, gelesen, erg.summen)), []);
  gelesen.lineItems[0].quantity = 37;
  delete gelesen.lineItems.find((l) => l.optional).optional;
  gelesen.voucherStatus = 'open';
  const ab = tp.tpEntwurfVergleichen(p, gelesen, erg.summen);
  assert.ok(ab.some((t) => /Menge 37.44 ≠ 37/.test(t)));
  assert.ok(ab.some((t) => /optional-Kennzeichen/.test(t)));
  assert.ok(ab.some((t) => /Status ist „open“/.test(t)));
});

test('Mehrfachausführung: gleicher Inhalt gleicher Fingerabdruck, kein zweiter Entwurf', () => {
  const v = kopie(tp.TP_BEISPIELE.verlegung);
  const f1 = tp.tpPayloadFingerabdruck(tp.tpLexwarePayload(v, rechne(v)));
  const f2 = tp.tpPayloadFingerabdruck(tp.tpLexwarePayload(kopie(v), rechne(kopie(v))));
  assert.equal(f1, f2);
  assert.equal(tp.tpFingerabdruck({ a: 1, b: 2 }), tp.tpFingerabdruck({ b: 2, a: 1 }));
  const v2 = kopie(v); v2.zusatzpositionen[0].menge = 35;
  assert.notEqual(tp.tpPayloadFingerabdruck(tp.tpLexwarePayload(v2, rechne(v2))), f1);

  const erlaubt = (eintraege) => tp.tpErstellungErlaubt(eintraege, 'V1', f1);
  assert.equal(erlaubt([]).erlaubt, true);
  assert.equal(erlaubt([{ vorgangId: 'V1', status: 'FEHLER' }]).erlaubt, true);
  assert.match(erlaubt([{ vorgangId: 'V1', status: 'ERSTELLUNG_LAEUFT' }]).grund, /ohne eindeutiges Ergebnis/);
  assert.match(erlaubt([{ vorgangId: 'V1', status: 'UNKLAR' }]).grund, /GEKLAERT_KEIN_ENTWURF/);
  assert.equal(erlaubt([{ vorgangId: 'V1', status: 'UNKLAR' }, { vorgangId: 'V1', status: 'GEKLAERT_KEIN_ENTWURF' }]).erlaubt, true);
  assert.match(erlaubt([{ vorgangId: 'V1', status: 'KONTROLLE_OK', fingerabdruck: f1, lexwareId: 'abc' }]).grund, /identischem Inhalt.*abc/);
  assert.match(erlaubt([{ vorgangId: 'V1', status: 'ENTWURF', fingerabdruck: 'anders', lexwareId: 'abc' }]).grund, /V1-v2/);
  assert.equal(erlaubt([{ vorgangId: 'V0', status: 'ENTWURF', fingerabdruck: f1 }]).erlaubt, true);
});

test('Lexware-Datum: Sommer- und Winterzeit Europe/Berlin', () => {
  assert.equal(tp.tpLexDatum('2026-10-24'), '2026-10-24T00:00:00.000+02:00');
  assert.equal(tp.tpLexDatum('2026-10-25'), '2026-10-25T00:00:00.000+01:00');
  assert.equal(tp.tpLexDatum('2026-03-29'), '2026-03-29T00:00:00.000+02:00');
  assert.equal(tp.tpLexDatum('2026-01-05'), '2026-01-05T00:00:00.000+01:00');
});

test('Lexware-Fehlerantworten werden lesbar, 5xx/Netzfehler gelten als unklar', () => {
  assert.match(tp.tpLexFehlerText(400, JSON.stringify({ IssueList: [{ i18nKey: 'missing_entity', source: 'lineItems[0].unitPrice', type: 'validation_failure' }] })), /HTTP 400 .*lineItems\[0\]\.unitPrice: missing_entity/);
  assert.match(tp.tpLexFehlerText(406, JSON.stringify({ message: 'x', details: [{ field: 'expirationDate', message: 'must not be null' }] })), /expirationDate: must not be null/);
  assert.match(tp.tpLexFehlerText(429, ''), /max\. 2 pro Sekunde/);
  assert.equal(tp.tpLexErgebnisUnklar(0), true);
  assert.equal(tp.tpLexErgebnisUnklar(503), true);
  assert.equal(tp.tpLexErgebnisUnklar(400), false);
});

/* ---------- Eingabe aus Tabellen ---------- */

test('Tabelleneingabe: deutsche Zahlen, ja/nein, Artikelnummern und IDs', () => {
  const t = tp.tpVorgangZuTabellen(tp.TP_BEISPIELE.umfangreich);
  const zurueck = tp.tpVorgangAusTabellen(t.kopf, t.raeume, t.zusatz);
  assert.equal(zurueck.raeume.length, 2);
  assert.deepEqual(kopie(zurueck.raeume[0].silikon.tuerbreitenM), ['0.9']);
  const kopf = [['Vorgangs-ID', 'X-1'], ['Angebotsdatum', '13.10.2026'], ['Entfernung km', '12,5'], ['Bestätigt: Fahrten realistisch', 'ja']];
  const raeume = [['Raum', 'Länge m', 'Breite m', 'Bodenart', 'Belag Art.-Nr./ID', 'Verlegeart', 'Bahnen (Breite x Länge; …)'],
    ['WZ', '4,06', '3,80', 'Teppichboden', 'TB-LUMINA-85', 'Fixiert', '4 x 4,16; 4 x 0,5']];
  const v = tp.tpVorgangAusTabellen(kopf, raeume, []);
  assert.deepEqual(kopie(v), {
    raeume: [{ name: 'WZ', laengeM: 4.06, breiteM: 3.8, bodenart: 'teppichboden', belag: { ref: { nr: 'TB-LUMINA-85' } }, verlegeart: 'fixiert', bahnen: [{ breiteM: 4, laengeM: 4.16 }, { breiteM: 4, laengeM: 0.5 }] }],
    zusatzpositionen: [], vorgangId: 'X-1', datum: '2026-10-13', baustelle: { entfernungKm: 12.5 }, bestaetigungen: { fahrten: true }
  });
});

test('Alle drei Testvorgänge laufen über Tabellen hin und zurück zum gleichen Ergebnis', () => {
  for (const name of ['einfach', 'verlegung', 'umfangreich']) {
    const v = kopie(tp.TP_BEISPIELE[name]);
    const t = tp.tpVorgangZuTabellen(v);
    const zurueck = tp.tpVorgangAusTabellen(t.kopf, t.raeume, t.zusatz);
    assert.equal(rechne(zurueck).summen.netto, rechne(v).summen.netto, name);
  }
});

test('Feldprüfung überspringt Textzeilen und prüft die erste echte Artikelposition', () => {
  const nurText = { voucherNumber: 'AG1', lineItems: [{ type: 'text', name: 'Wohnzimmer', optional: false }] };
  const mitArtikel = { voucherNumber: 'AG2', lineItems: [
    { type: 'text', name: 'Überschrift' },
    { type: 'service', id: 'x', name: 'Verlegung', quantity: 12.5, unitName: 'm²', unitPrice: { currency: 'EUR', netAmount: 9.95, taxRatePercentage: 19 } }
  ] };
  const a = tp.tpFeldpruefungPositionen([nurText]);
  assert.equal(a.gefunden, false);
  assert.equal(a.optionalFeld, true);
  const b = tp.tpFeldpruefungPositionen([nurText, mitArtikel]);
  assert.equal(b.gefunden, true);
  assert.equal(b.angebotNr, 'AG2');
  assert.ok(Object.values(b.felder).every(Boolean));
  assert.deepEqual(kopie(b.typen), { text: 2, service: 1 });
});

test('Feldprüfung bevorzugt service/material mit Artikel-ID vor freien custom-Zeilen', () => {
  const q = { voucherNumber: 'AG237', lineItems: [
    { type: 'custom', name: 'Frei', quantity: 1, unitName: 'Stück', unitPrice: { netAmount: 5, taxRatePercentage: 19 } },
    { type: 'service', id: 'abc', name: 'MG-010', quantity: 1, unitName: 'Pauschal', unitPrice: { netAmount: 59, taxRatePercentage: 19 } }
  ] };
  const r = tp.tpFeldpruefungPositionen([q]);
  assert.equal(r.positionstyp, 'service');
  assert.equal(r.felder['lineItems[].id (Artikelbezug)'], true);
  assert.equal(tp.tpFeldpruefungPositionen([{ lineItems: [q.lineItems[0]] }]).positionstyp, 'custom');
});

test('Aktion 649: Warenwert wie die Angebotsposition (erst zusammenfassen, dann runden)', () => {
  // Probevorgang 14.10.2026: 19,60 + 14,80 m² × 27,69 € = 952,54 € netto -> 1.133,52 € brutto
  const erg = rechne(teppichVorgang([
    { name: 'Wohnzimmer', laengeM: 4.8, breiteM: 3.9, verlegeart: 'fixiert' },
    { name: 'Schlafzimmer', laengeM: 3.9, breiteM: 3.6, verlegeart: 'lose', fixierung: 'optional' }
  ], { baustelle: { entfernungKm: 6, fahrzone: 'nah' }, fahrten: { anzahl: 2 } }));
  assert.equal(pos(erg, 'TB-LUMINA-85').gesamtNetto, 952.54);
  assert.equal(erg.aktion.warenwertNetto, 952.54);
  assert.equal(erg.aktion.warenwertBrutto, 1133.52);
});
