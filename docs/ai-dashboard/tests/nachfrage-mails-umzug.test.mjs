// w-284 und w-276 (Inhaberentscheidungen 07.11.2026). Nur erfundene Daten.
//  - Die automatischen Nachfrage-Mails stehen unter Kunden › Kunden nach Produkt fragen; alte Links
//    #/heute?mn=1 landen dort. Die Zeile ist ruhig, gelb nur bei echten Warnungen.
//  - "Erledigt" bietet die Kundenmail nur fuer Ware an, die "raus" uebersprungen hat.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { hash: '' };
globalThis.history = { state: null, replaceState(s, t, u) { globalThis.location.hash = u; } };
const { parseRoute } = await import('../kern/router.mjs');
const { state } = await import('../kern/zustand.mjs');
const { heuteDaten } = await import('../ansichten/heute/daten.mjs');
const { kunden } = await import('../ansichten/kunden/gemeinsam.mjs');
const { nachfrageMailsZeile, musterNachfassenBlock } = await import('../ansichten/heute/muster-nachfassen.mjs');
const { NACHFRAGE_MAILS_HREF } = await import('../lib/nachfrage-mails.mjs');
const { erledigtMitMailMoeglich, kundenmailKandidaten } = await import('../lib/versand.mjs');
const { kundenmailFeld } = await import('../bausteine/kundenmail.mjs');

test('w-284: alter Link #/heute?mn=1 landet unter Kunden nach Produkt fragen, Karte offen', () => {
  location.hash = '#/heute?mn=1';
  parseRoute();
  assert.equal(state.route.view, 'kunden');
  assert.equal(state.route.params.get('tab'), 'anrufe');
  assert.equal(state.route.params.get('mn'), '1');
  assert.equal(location.hash, NACHFRAGE_MAILS_HREF);
  location.hash = '#/heute?sicht=laden';
  parseRoute();
  assert.equal(state.route.view, 'heute', 'ohne mn bleibt Heute Heute');
});

test('w-284: Zeile ruhig im Normalstand, gelb bei Fehler, Postfach-Suche, Hinweisen und faelligen Mails ohne Versand', () => {
  kunden.bestellungen = { verfuegbar: true, zeilen: [] };
  const stand = (offen = []) => ({ offen, erledigt: [{ orderId: 'x' }], abgemeldet: [] });
  const mail = { orderId: 'o1', kontakt: { weg: 'email' } };
  heuteDaten.musterTexte = { verfuegbar: true, versand: { eingerichtet: true, letzterLauf: { am: '2026-11-07T08:00:00Z', verschickt: 3, fehler: 0 } } };
  const ruhig = nachfrageMailsZeile(stand([mail]), false);
  assert.doesNotMatch(ruhig, /heute-hg-zeile[^"]* warn/);
  assert.match(ruhig, /Automatische Nachfrage-Mails<\/span>/);
  assert.match(ruhig, /1 Mail geht beim nächsten Lauf von selbst raus · letzter Lauf .* \(3 verschickt\) · 1 in den letzten Tagen erledigt/);
  assert.match(ruhig, /data-param="mn" data-value="1" aria-expanded="false">Ansehen/);
  assert.match(nachfrageMailsZeile(stand(), true), /data-value="" aria-expanded="true">Zuklappen/);

  heuteDaten.musterTexte = { verfuegbar: true, versand: { eingerichtet: true, letzterLauf: { am: '2026-11-07T08:00:00Z', verschickt: 1, fehler: 2 } } };
  assert.match(nachfrageMailsZeile(stand(), false), /warn[\s\S]*2 Fehler im letzten Lauf/);
  heuteDaten.musterTexte = { verfuegbar: true, versand: { eingerichtet: true }, abgleichFehler: 'Zeitüberschreitung' };
  assert.match(nachfrageMailsZeile(stand(), false), /warn[\s\S]*Postfach-Suche fehlgeschlagen, es geht nichts raus/);
  heuteDaten.musterTexte = { verfuegbar: true, versand: { eingerichtet: true }, antwortHinweise: [{ email: 'a@example.invalid' }] };
  assert.match(nachfrageMailsZeile(stand(), false), /warn[\s\S]*1 Hinweis aus dem Postfach/);
  heuteDaten.musterTexte = { verfuegbar: true, versand: { eingerichtet: false, hinweis: 'nicht eingerichtet' } };
  assert.match(nachfrageMailsZeile(stand([mail]), false), /warn[\s\S]*1 fällig, automatischer Versand läuft nicht/);
  assert.doesNotMatch(nachfrageMailsZeile(stand(), false), /warn"/, 'nichts fällig: ruhig');
  heuteDaten.musterTexte = null;
  assert.match(nachfrageMailsZeile(stand(), false), /Lade …/);
});

test('w-284: eingebettete Karte steht auch leer da und ohne eigenen Kopf; auf Heute blieb sie leer weg', () => {
  heuteDaten.musterTexte = { verfuegbar: true, versand: { eingerichtet: true } };
  const leer = { offen: [], erledigt: [], abgemeldet: [] };
  assert.equal(musterNachfassenBlock(leer), '');
  const html = musterNachfassenBlock(leer, { eingebettet: true });
  assert.match(html, /aria-label="Automatische Nachfrage-Mails"/);
  assert.doesNotMatch(html, /<h2/);
  assert.match(html, /Gerade ist keine Nachfrage fällig/);
});

const ware = (n, extra = {}) => ({ lineItemId: `l${n}`, titel: `Testboden ${n}`, farbe: 'grau', ...extra });
const auftrag = (positionen, extra = {}) => ({ id: 'gid://test/Order/1', positionen, ...extra });
const stand = eintraege => Object.fromEntries(Object.entries(eintraege).map(([n, e]) => [`gid://test/Order/1::l${n}`, e]));

test('w-276: Kundenmail nur fuer Ware vor "raus", nie fuer Muster, Eigenleistung, Gebuchtes oder Testbestellung', () => {
  assert.equal(erledigtMitMailMoeglich(ware(1), null), true);
  assert.equal(erledigtMitMailMoeglich(ware(1), { status: 'geliefert' }), true);
  assert.equal(erledigtMitMailMoeglich(ware(1), { status: 'raus' }), false);
  assert.equal(erledigtMitMailMoeglich(ware(1), { status: 'erledigt' }), false);
  assert.equal(erledigtMitMailMoeglich(ware(1), { status: 'bestellt', shopifyVersand: { status: 'gebucht' } }), false);
  assert.equal(erledigtMitMailMoeglich(ware(1, { istMuster: true }), null), false);
  assert.equal(erledigtMitMailMoeglich(ware(1, { eigenleistung: true }), null), false);
  assert.equal(erledigtMitMailMoeglich(ware(1, { menge: 0 }), null), false);
  const a = auftrag([ware(1), ware(2, { istMuster: true }), ware(3, { eigenleistung: true }), ware(4)]);
  assert.deepEqual(kundenmailKandidaten(a, stand({ 4: { status: 'raus' } })).map(p => p.lineItemId), ['l1']);
  assert.deepEqual(kundenmailKandidaten(a, {}, ['l4']).map(p => p.lineItemId), ['l4'], 'nur die angefragten Positionen');
  assert.deepEqual(kundenmailKandidaten({ ...a, testbestellung: true }, {}), []);
  assert.deepEqual(kundenmailKandidaten(null, {}), []);
});

test('w-276: Kaestchen vorab angehakt, nennt die Ware, versteckt nur auf Wunsch, leer ohne Kandidaten', () => {
  const html = kundenmailFeld([ware(1), ware(2, { farbe: '–' })]);
  assert.match(html, /<input type="checkbox" name="kundenmail" checked> Kunde per Mail informieren \(Versandmail von Shopify\)/);
  assert.match(html, /Testboden 1 · grau, Testboden 2\./);
  assert.match(html, /Ohne Haken wird in Shopify ohne Mail gebucht, wie bisher/);
  assert.doesNotMatch(html, /hidden/);
  assert.match(kundenmailFeld([ware(1)], { versteckt: true }), /data-kundenmail hidden/);
  assert.equal(kundenmailFeld([]), '');
});
