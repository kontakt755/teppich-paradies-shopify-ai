import test from 'node:test';
import assert from 'node:assert/strict';
import { musterAutomatikHtml, musterAutomatikBlock, musterAutomatikZeile, musterAutomatikWoche } from '../bausteine/muster-bestellanzeige.mjs';
const bestellung = { am: '2026-10-23T10:00:00Z', an: 'muster@lieferant-a.example', lieferziel: 'laden', positionen: [{ titel: '<img src=x onerror=alert(1)>', farbe: 'Grau', menge: 1 }] };
test('Bestellanzeige trennt echten Versandnachweis von Klaerung und maskiert Quelldaten', () => {
  const html = musterAutomatikHtml({ bestellt: [bestellung], klaeren: [{ grund: 'Zweite Farbe fehlt' }] });
  assert.match(html, /Muster bestellt/); assert.match(html, /Grau/); assert.match(html, /Klärung nötig/);
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img')); assert.match(html, /zu uns ins Geschäft/);
  assert.ok(!html.includes('geliefert'));
});
test('Ohne Automatik keine unbelegte Aktivmeldung, Stoerung bleibt sichtbar', () => {
  assert.equal(musterAutomatikBlock({}), '');
  assert.equal(musterAutomatikZeile({}), '');
  assert.match(musterAutomatikBlock({ musterAutomatik: { aktiv: false, hinweis: 'Ablage beschädigt' } }), /Ablage beschädigt/);
  assert.equal(musterAutomatikZeile({ musterAutomatik: { aktiv: false, hinweis: 'Ablage beschädigt' } }), '', 'pausiert: keine Erfolgszeile');
});

// Rundgang 06.11.2026 (#1996): das Erfolgsprotokoll schrumpft auf Heute zu einer Zeile, der Block bleibt fuer Stoerungen.
const jetzt = Date.parse('2026-11-06T18:00:00Z');
const mail = (am, mengen) => ({ am, an: 'muster@lieferant-a.example', lieferziel: 'laden', positionen: mengen.map((menge, i) => ({ titel: `Testmuster ${i}`, farbe: 'Grau', menge })) });
const zeile = (nr, bestellt = [], extra = {}) => ({ orderId: `gid://test/Order/${nr}`, orderName: `#T${nr}`, kundenname: `Testkunde ${nr}`, musterAutomatik: { bestellt, klaeren: [], geplant: 0, ...extra } });
const woche = Array.from({ length: 7 }, (_, i) => zeile(i + 1, [mail(`2026-11-0${i + 1}T09:00:00Z`, [1, 1])]));

test('Hintergrundzeile zaehlt alle Bestellungen der 7 Tage, nicht nur die ersten fuenf', () => {
  const daten = { musterAutomatik: { aktiv: true }, zeilen: [...woche,
    zeile(20, [mail('2026-10-20T09:00:00Z', [1])]), // aelter als 7 Tage
    zeile(21, [mail('2026-11-05T08:00:00Z', [1]), mail('2026-11-06T16:41:00Z', [2])]), // zwei Mails, eine Bestellung
  ] };
  const w = musterAutomatikWoche(daten, jetzt);
  // 01.–06.11. je 2 Muster (der 07.11. liegt nach "jetzt"), dazu #T21 mit zwei Mails = eine Bestellung, 3 Muster.
  assert.deepEqual({ bestellungen: w.bestellungen, muster: w.muster }, { bestellungen: 7, muster: 15 });
  const html = musterAutomatikZeile(daten, jetzt);
  assert.match(html, /class="heute-hg-zeile"/);
  assert.match(html, /Musterautomatik/);
  assert.match(html, /7 Musterbestellungen \(15 Muster\) in 7 Tagen automatisch bestellt, zuletzt 06\.11\., \d\d:41/);
  assert.match(html, /href="#\/kunden\?tab=bestellungen&amp;bart=muster">Ansehen</);
  assert.doesNotMatch(html, /Testkunde|lieferant-a\.example/, 'keine Kundenkarten, keine Mailadressen');
  assert.match(musterAutomatikZeile({ musterAutomatik: { aktiv: true }, zeilen: [] }, jetzt), /In den letzten 7 Tagen nichts automatisch bestellt/);
});

test('Block nur bei Stoerung, geplant oder Klaerung - der Normalfall steht nur in der Zeile', () => {
  const normal = { musterAutomatik: { aktiv: true, hinweis: null }, zeilen: woche };
  assert.equal(musterAutomatikBlock(normal, jetzt), '', 'nur Erfolge: kein Block mit Kundenkarten');
  // Sperrliste unlesbar: der volle Block erscheint, mit dem Hinweis - auch ohne Klaerfall.
  const gestoert = musterAutomatikBlock({ ...normal, musterAutomatik: { aktiv: true, hinweis: 'Sperrliste nicht lesbar' } }, jetzt);
  assert.match(gestoert, /<section/); assert.match(gestoert, /notice warn">Sperrliste nicht lesbar/);
  assert.doesNotMatch(gestoert, /Testkunde/, 'Erfolge stehen nicht im Stoerungsblock');
  const geplant = musterAutomatikBlock({ ...normal, zeilen: [zeile(30, [], { geplant: 2 })] }, jetzt);
  assert.match(geplant, /Wird gleich automatisch bestellt/); assert.match(geplant, /#T30 \(2 Muster\)/);
});

test('Klaerfaelle je Grund in einer Zeile; was oben schon rot steht, fehlt hier', () => {
  const umfang = 'Bestellumfang nach dem Mailversand geändert. Bereits bestellte Muster vor Nachbestellung prüfen.';
  const daten = { musterAutomatik: { aktiv: true }, zeilen: [
    zeile(1, [], { klaeren: [{ grund: umfang }, { grund: umfang }] }),
    zeile(2, [], { klaeren: [{ grund: umfang }] }),
    // frisch: noch kein rotes To-do, also hier
    zeile(3, [], { klaeren: [{ lineItemIds: ['m3'], grund: 'Farbnummer fehlt', seit: '2026-11-06T09:00:00Z' }] }),
    // gesperrt: steht oben als "Muster nicht lieferbar"
    { ...zeile(4, [], { klaeren: [{ lineItemIds: ['m4'], grund: 'Im Shop gesperrt: wird beim Lieferanten nicht angefragt', seit: '2026-11-06T09:00:00Z' }] }), gesperrteMuster: ['m4'] },
    // haengt laenger als einen Werktag: steht oben als "1 Muster hängt"
    zeile(5, [], { klaeren: [{ lineItemIds: ['m5'], grund: 'Mustermenge prüfen', seit: '2026-11-02T09:00:00Z' }] }),
  ] };
  const html = musterAutomatikBlock(daten, jetzt);
  assert.match(html, /Musterautomatik: Klärung nötig/);
  assert.equal((html.match(/Bestellumfang nach dem Mailversand/g) || []).length, 1, 'ein Grund, eine Zeile');
  assert.match(html, />#T1<\/a>, <a [^>]*>#T2<\/a>/);
  assert.match(html, /href="#\/kunden\?tab=bestellungen&amp;bfilter=alle&amp;bq=%23T1">#T1</, 'ohne Kundenschluessel ueber die Suche');
  assert.match(html, /Farbnummer fehlt<\/strong><p><a [^>]*>#T3<\/a>/);
  assert.doesNotMatch(html, /#T4|Im Shop gesperrt/);
  assert.doesNotMatch(html, /#T5|Mustermenge/);
  assert.match(html, /href="#\/kunden\?tab=bestellungen&amp;bart=muster">Alle Musterbestellungen ansehen/);
});
