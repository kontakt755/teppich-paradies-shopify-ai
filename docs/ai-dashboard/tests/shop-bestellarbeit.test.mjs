import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellzeile } from '../../../operations/lib/bestellliste.mjs';
import { bestellArtPasst, warenArbeitsstand, shopBestellarbeit } from '../lib/shop-bestellarbeit.mjs';
import { warenbestellungenBlock } from '../ansichten/heute/warenbestellungen.mjs';

const jetzt = Date.parse('2026-10-22T12:00:00Z');
const p = (lineItemId, istMuster = false, extra = {}) => ({ lineItemId, istMuster, menge: 1,
  grosshaendlerId: 'TEST-ARTIKEL', bestellmenge: { menge: 1, einheit: istMuster ? 'muster' : 'paket' }, ...extra });
function zeile(id, positionen = [p('w')], status = {}, extra = {}) {
  const auftrag = { id, name: `#TEST-${id}`, datum: '2026-10-20T12:00:00Z', offen: true,
    bezahlt: 'PAID', erfuellt: 'UNFULFILLED', positionen, checks: {}, ampel: 'gruen',
    details: { kunde: { name: 'Testkunde', email: `${id}@example.invalid` }, tags: [],
      summen: { gesamt: { betrag: 123.45, waehrung: 'EUR' } } } };
  const statusAlle = Object.fromEntries(Object.entries(status).map(([k, v]) => [`${id}::${k}`, v]));
  return { ...bestellzeile(auftrag, { statusAlle }), ...extra };
}
const daten = zeilen => ({ verfuegbar: true, zeilen });
const ids = arbeit => arbeit.zeilen.map(z => z.zeile.orderId);

test('Artwahl verwendet vorhandene Positionskennung: gemischt in beiden, kostenlose Ware bleibt Ware', () => {
  const ware = zeile('ware', [p('w', false, { titel: 'Muster im Produktnamen', preis: { betrag: 0 } })]);
  const muster = zeile('muster', [p('m', true)]);
  const gemischt = zeile('gemischt', [p('w'), p('m', true)]);
  assert.equal(bestellArtPasst(ware, 'ware'), true);
  assert.equal(bestellArtPasst(ware, 'muster'), false);
  assert.equal(bestellArtPasst(muster, 'ware'), false);
  assert.equal(bestellArtPasst(muster, 'muster'), true);
  assert.equal(bestellArtPasst(gemischt, 'ware'), true);
  assert.equal(bestellArtPasst(gemischt, 'muster'), true);
  assert.equal(bestellArtPasst(muster), true, 'alte Links ohne Art behalten Muster');
});

test('fehlende und fehlerhafte Quellen zeigen unbekannt statt erfundenem Nullbestand', () => {
  for (const quelle of [undefined, { verfuegbar: false }, { verfuegbar: true }, { verfuegbar: true, zeilen: [], fehler: ['Lesefehler'] }]) {
    assert.equal(shopBestellarbeit(quelle).verfuegbar, false);
    assert.equal(shopBestellarbeit(quelle).offen, null);
    assert.doesNotMatch(warenbestellungenBlock({ daten: quelle }), /Keine offene Warenarbeit|Warenbestellungen · 0/);
  }
  assert.equal(shopBestellarbeit(daten([])).offen, 0, 'echter leerer Bestand bleibt echte Null');
  assert.equal(shopBestellarbeit({ ...daten([]), fehler: [] }).offen, 0);
});

test('gemischter Auftrag verwendet Warenfortschritt und frische Warenposition statt Muster-Zeitleiste', () => {
  const z = zeile('mix', [p('w'), p('m', true)], { w: { status: 'geliefert' } },
    { naechsterSchritt: { text: 'Muster bestellen' }, wasFehlt: ['Muster fehlen'] });
  assert.equal(z.fortschritt.stufe, 'offen');
  const a = warenArbeitsstand(z, { jetzt });
  assert.equal(a.fortschritt.stufe, 'geliefert');
  assert.equal(a.fortschritt.gesamt, 1);
  assert.equal(a.stand, 'Ware eingetroffen');
  assert.equal(a.naechstes, 'An Kunden rausgeben');
  assert.equal(a.gemischt, true);
});

test('Musterfehler schliesst erledigte Waren weder ein noch offene Waren aus', () => {
  const wareFertig = zeile('fertig', [p('w'), p('m', true)], { w: { status: 'erledigt', shopifyVersand: { status: 'gebucht' } } });
  const musterFertig = zeile('offen', [p('w'), p('m', true)], { m: { status: 'erledigt' } });
  assert.deepEqual(ids(shopBestellarbeit(daten([wareFertig, musterFertig]), { jetzt })), ['offen']);
});

test('Waren-Masspruefung und Zuordnung bleiben Klaerung; ein reines Musterproblem blockiert Ware nicht', () => {
  const musterProblem = zeile('muster-problem', [p('w'), p('m', true, { grosshaendlerId: 'UNGEKLAERT' })]);
  const massProblem = zeile('mass-problem', [p('w', false, { masspruefung: { status: 'abweichung' } }), p('m', true)]);
  const mengenProblem = zeile('menge-problem', [p('w', false, { bestellmenge: { menge: 'UNGEKLAERT' } }), p('m', true)]);
  assert.equal(warenArbeitsstand(musterProblem, { jetzt }).naechstes, 'Ware bestellen');
  assert.equal(warenArbeitsstand(musterProblem, { jetzt }).kontrollieren, false);
  assert.equal(warenArbeitsstand(massProblem, { jetzt }).naechstes, 'Maßprüfung offen (1)');
  assert.equal(warenArbeitsstand(massProblem, { jetzt }).kontrollieren, true);
  assert.equal(warenArbeitsstand(mengenProblem, { jetzt }).naechstes, 'Einkaufsmenge klären');
});

test('fehlender Warenfortschritt, Kennungen und unvollstaendige Statuskarte bleiben kontrollierbar', () => {
  const z = zeile('mix', [p('w'), p('m', true)]);
  for (const unklar of [{ ...z, warenFortschritt: null }, { ...z, positionsstatus: {} },
    zeile('ohne-id', [p(null)]), zeile('ohne-position', [])]) {
    const a = warenArbeitsstand(unklar, { jetzt });
    assert.equal(a.unklar, true);
    assert.equal(a.abgeschlossen, false);
    assert.equal(a.stand, 'Warenstand prüfen');
  }
  assert.equal(warenArbeitsstand(z, { jetzt }).unklar, false, 'explizites null ist belegt unbegonnen');
});

test('Teilwareneingang und abweichende Einheit bleiben trotz altem Abschluss sichtbar', () => {
  for (const einheit of ['paket', 'muster']) {
    const z = zeile('teil', [p('w', false, { bestellmenge: { menge: 3, einheit: 'paket' } })], {
      w: { status: 'erledigt', beschaffung: { wareneingang: { soll: 3, angekommen: 1, verwendbar: 1, einheit } } },
    });
    const a = shopBestellarbeit(daten([z]), { jetzt });
    assert.equal(a.offen, 1);
    assert.equal(a.kontrolle, 1);
    assert.equal(a.zeilen[0].naechstes, 'Fehlmenge / Wareneingang klären');
  }
});

test('manueller Haken und fehlgeschlagene Versandbuchung sind kein stiller Warenabschluss', () => {
  const manuell = zeile('manuell', undefined, {}, { abgehakt: { zeit: '2026-10-21' } });
  const versand = zeile('versand', undefined, { w: { status: 'erledigt', shopifyVersand: { status: 'fehler' } } });
  const a = shopBestellarbeit(daten([manuell, versand]), { jetzt });
  assert.equal(a.offen, 2);
  assert.equal(a.kontrolle, 2);
  assert.match(a.zeilen.find(z => z.zeile.orderId === 'manuell').naechstes, /Manueller Haken/);
  assert.match(a.zeilen.find(z => z.zeile.orderId === 'versand').naechstes, /Versandbuchung prüfen/);
});

test('vollstaendiger Shopify-Versand ist belegt abgeschlossen, offene Zahlung bleibt sichtbar', () => {
  const versandt = zeile('versandt', undefined, {}, { fulfillmentstatus: 'FULFILLED', offen: false });
  const unbezahlt = { ...versandt, orderId: 'unbezahlt', zahlungsstatus: 'PENDING' };
  const a = shopBestellarbeit(daten([versandt, unbezahlt]), { jetzt });
  assert.deepEqual(ids(a), ['unbezahlt']);
  assert.equal(a.zeilen[0].naechstes, 'Zahlungseingang prüfen');
});

test('zahlende Warenkunden zuerst, darunter klaeren und aelteste zuerst; Test und Storno bleiben getrennt', () => {
  const alt = zeile('alt', undefined, {}, { datum: '2026-10-01' });
  const neu = zeile('neu');
  const pruefen = zeile('pruefen', undefined, {}, { abgehakt: {}, datum: '2026-10-21' });
  const pending = zeile('pending', undefined, {}, { zahlungsstatus: 'PENDING', datum: '2020-01-01' });
  const a = shopBestellarbeit(daten([pending, neu, alt, pruefen,
    zeile('test', undefined, {}, { testbestellung: true }), zeile('storno', undefined, {}, { storniert: true }),
    zeile('sample', [p('m', true)])]), { jetzt });
  assert.deepEqual(ids(a), ['pruefen', 'alt', 'neu', 'pending']);
  assert.equal(a.bezahlt, 3);
  assert.equal(a.zeilen.find(z => z.zeile.orderId === 'alt').tage, 21);
});

test('reine Ableitung veraendert weder Auftraege, Bestand noch Geldwerte', () => {
  const d = daten([zeile('mix', [p('w'), p('m', true)])]);
  const vorher = JSON.stringify(d);
  shopBestellarbeit(d, { jetzt });
  warenbestellungenBlock({ daten: d });
  assert.equal(JSON.stringify(d), vorher);
});

test('Renderer zeigt hoechstens fuenf konkrete Bestellungen, den vollen Bestellwert und den vollen Listenweg', () => {
  const zeilen = Array.from({ length: 7 }, (_, i) => zeile(`reihe-${i}`, i === 0 ? [p('w'), p('m', true)] : undefined));
  const html = warenbestellungenBlock({ daten: daten(zeilen) });
  assert.equal((html.match(/class="heute-bestellzeile"/g) || []).length, 5);
  assert.match(html, /Bestellwert 123,45 €/);
  assert.match(html, /auch Muster/);
  assert.match(html, /2 weitere in Arbeit/);
  assert.match(html, /href="#\/kunden\?tab=bestellungen&amp;bart=ware&amp;bsort=wichtigkeit"/);
  assert.doesNotMatch(html, /Warenwert|Warenumsatz|<button|data-af-set/);
});

test('Renderer fuehrt lesend direkt zur vorhandenen Kundenakte und maskiert Texte und Fehlhinweise', () => {
  const z = zeile('sicher', undefined, {}, { kundenname: '<script>Test</script>', orderName: 'Test & Auftrag',
    kundenSchluessel: 'email:test+synthetic@example.invalid' });
  const html = warenbestellungenBlock({ daten: daten([z]), lesend: true });
  assert.match(html, /&lt;script&gt;Test&lt;\/script&gt;/);
  assert.match(html, /Test &amp; Auftrag/);
  assert.doesNotMatch(html, /<script>|<button|Bestellung bearbeiten/);
  assert.match(html, /Bestellung ansehen/);
  const ziel = html.match(/href="([^"]*)">Bestellung ansehen/)[1].replaceAll('&amp;', '&');
  const params = new URLSearchParams(ziel.split('?')[1]);
  assert.equal(params.get('kunde'), z.kundenSchluessel);
  assert.equal(params.get('auftrag'), 'sicher');
  const fehlt = warenbestellungenBlock({ daten: { verfuegbar: false, hinweis: 'Test <fehlt>' } });
  assert.match(fehlt, /Test &lt;fehlt&gt;/);
});

test('fehlender Bestellwert und Datum werden nicht als Null oder sofortiger Eingang ausgegeben', () => {
  const html = warenbestellungenBlock({ daten: daten([zeile('ohne-wert', undefined, {}, { gesamtbetrag: null, datum: null })]) });
  assert.match(html, /Bestellwert nicht hinterlegt/);
  assert.match(html, /Bestelldatum fehlt/);
  assert.doesNotMatch(html, /Bestellwert 0,00|heute eingegangen/);
});


test('Legacyabschluss und persoenliche Uebergabe ohne Versandbuchung bleiben kontrollierbare Warenarbeit', () => {
  for (const status of ['raus', 'erledigt']) for (const vermerk of [undefined, { status: 'uebersprungen' }]) {
    const z = zeile('legacy', [p('w')], { w: { status, shopifyVersand: vermerk, versanddienst: 'Persönliche Übergabe' } },
      { versandHinweis: 'In Shopify noch nicht als versendet gebucht' });
    const a = shopBestellarbeit(daten([z]), { jetzt });
    assert.equal(a.offen, 1);
    assert.equal(a.kontrolle, 1);
    assert.match(a.zeilen[0].naechstes, /Versandbuchung prüfen/);
    assert.equal(a.zeilen[0].abgeschlossen, false);
  }
});

test('bestaetigte Warenbuchung und vollstaendiger Shopifyversand loesen Versandkontrolle auf', () => {
  for (const status of ['gebucht', 'bereits']) {
    const z = zeile('belegt', [p('w')], { w: { status: 'erledigt', shopifyVersand: { status } } });
    assert.equal(shopBestellarbeit(daten([z]), { jetzt }).offen, 0);
  }
  for (const vermerk of [undefined, { status: 'fehler' }]) {
    const z = zeile('shopify-belegt', [p('w')], { w: { status: 'erledigt', shopifyVersand: vermerk } }, { fulfillmentstatus: 'FULFILLED' });
    assert.equal(shopBestellarbeit(daten([z]), { jetzt }).offen, 0, 'aktueller Gesamtversand ueberholt alten fehlenden/fehlerhaften Vermerk');
  }
});

test('fehlender Musterversandbeleg oeffnet bestaetigte Warenbuchung nicht wieder', () => {
  const z = zeile('gemischt-versand', [p('w'), p('m', true)], {
    w: { status: 'erledigt', shopifyVersand: { status: 'gebucht' } }, m: { status: 'erledigt' },
  }, { versandHinweis: 'In Shopify noch nicht als versendet gebucht', shopifyVersandVermerk: 'nachholen' });
  const a = warenArbeitsstand(z, { jetzt });
  assert.equal(a.kontrollieren, false);
  assert.equal(a.abgeschlossen, true);
  assert.equal(shopBestellarbeit(daten([z]), { jetzt }).offen, 0);
});


test('Eigenleistung braucht keinen gesonderten Versandbeleg; echte Ware daneben schon', () => {
  const leistung = p('service', false, { eigenleistung: true, grosshaendlerId: 'UNGEKLAERT' });
  const nur = zeile('service', [leistung], { service: { status: 'erledigt' } });
  assert.equal(warenArbeitsstand(nur, { jetzt }).kontrollieren, false);
  assert.equal(shopBestellarbeit(daten([nur]), { jetzt }).offen, 0);
  const mitWare = zeile('service-ware', [leistung, p('w')], { service: { status: 'erledigt' }, w: { status: 'erledigt' } });
  assert.equal(shopBestellarbeit(daten([mitWare]), { jetzt }).offen, 1);
  mitWare.positionsstatus.w.shopifyVersand = { status: 'bereits' };
  assert.equal(shopBestellarbeit(daten([mitWare]), { jetzt }).offen, 0);
});
