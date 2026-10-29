// Kundenakte, Schritt "Ware beim Lieferanten bestellen" (Rundgang 26.10.): erst der Bestellweg je
// Lieferant, dann "Ware ist bestellt…" mit Rueckfrage; Lieferantennamen aus den Stammdaten,
// nie "UNGEKLAERT" oder "Default Title". Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zeitleisteBlock } from '../ansichten/kunden/zeitleiste.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { state } from '../kern/zustand.mjs';
import { lieferantName, NICHT_ZUGEORDNET } from '../lib/einkauf-lieferanten.mjs';

globalThis.document ||= { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };

const ware = (positionen, naechster = { wer: 'wir', text: 'Ware beim Lieferanten bestellen', aktion: 'bestellt', knopf: 'Ware ist bestellt', stufe: 'faellig' }) => ({
  id: 'gid://shopify/Order/9001', name: '#T9001', auftragsart: 'ware', datum: '2026-10-23T10:00:00Z', details: {},
  verlauf: [{ schritt: 'kunde_hat_bestellt', label: 'Kunde hat bestellt', zustand: 'erledigt' }, { schritt: 'bestellt', label: 'Ware beim Lieferanten bestellt', zustand: 'aktuell' }],
  naechsterSchritt: naechster, positionen,
});
const POSITIONEN = [
  { lineItemId: 'L1', titel: 'Testkleber', lieferant: 'C', farbe: 'Default Title', grosshaendlerId: 'T-1' },
  { lineItemId: 'L2', titel: 'Testleiste', lieferant: 'A', farbe: 'Weiß', grosshaendlerId: 'T-2' },
  { lineItemId: 'L3', titel: 'Testvinyl', lieferant: 'A', farbe: 'Default Title', grosshaendlerId: 'T-3' },
  { lineItemId: 'L4', titel: 'Testmuster', lieferant: 'B', istMuster: true },
  { lineItemId: 'L5', titel: 'Kettelservice', eigenleistung: true },
  { lineItemId: 'L6', titel: 'Ohne Zuordnung', lieferant: 'UNGEKLAERT' },
];

// Ohne Angabe: Positionsstand geladen, aber leer (sonst laedt zeitleisteBlock ihn nach).
function vorbereiten({ rolle = 'mitarbeiter', stand = { verfuegbar: true, positionen: {} } } = {}) {
  state.session = { benutzer: { name: 'Test', rolle } };
  einkauf.lieferanten = { verfuegbar: true, lieferanten: [{ id: 'A', name: 'Testlieferant Nord' }, { id: 'C', stammdaten: { name: 'Testlieferant Sued' } }] };
  einkauf.auftragsstatus = stand;
}

test('Direkt geoeffnete Kundenakte laedt den Positionsstand nach; ein schon bestellter Lieferant verliert seinen Knopf', async () => {
  vorbereiten({ stand: null });
  einkauf.loadingAuftragsstatus = false;
  const route = state.route;
  const echtesFetch = globalThis.fetch;
  state.route = { view: 'test-ohne-zeichnen', params: new URLSearchParams() };
  const abrufe = [];
  globalThis.fetch = async pfad => {
    abrufe.push(pfad);
    return { ok: true, json: async () => ({ verfuegbar: true, positionen: { 'gid://shopify/Order/9001::L1': { status: 'bestellt' } } }) };
  };
  try {
    assert.match(zeitleisteBlock(ware(POSITIONEN)), /data-lf-mail="C"/, 'vor dem Laden: noch alle offenen Lieferanten');
    assert.deepEqual(abrufe, ['/api/einkauf/auftragsstatus']);
    await new Promise(r => setTimeout(r, 0));
    const html = zeitleisteBlock(ware(POSITIONEN));
    assert.doesNotMatch(html, /data-lf-mail="C"/);
    assert.match(html, /data-lf-mail="A"/);
  } finally {
    globalThis.fetch = echtesFetch;
    state.route = route;
  }
});

test('Schritt "bestellen": je Lieferant "Bestellmail öffnen" mit Namen, "Ware ist bestellt…" erst danach und ohne Sofort-Schritt', () => {
  vorbereiten();
  const html = zeitleisteBlock(ware(POSITIONEN));
  const knoepfe = [...html.matchAll(/data-lf-mail="([^"]+)" data-lf-art="ware" data-lf-auftrag="gid:\/\/shopify\/Order\/9001">Bestellmail öffnen \(([^)]+)\)/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(knoepfe, [['C', 'Testlieferant Sued'], ['A', 'Testlieferant Nord']], 'Muster, Eigenleistung und ungeklaerte Zuordnung bekommen keinen Bestellknopf');
  assert.match(html, /class="btn btn-primary" data-lf-mail="C"/, 'der erste Bestellweg ist die Hauptaktion');
  assert.match(html, /<button type="button" class="btn" data-zl-bestellt="gid:\/\/shopify\/Order\/9001">Ware ist bestellt…<\/button>/);
  assert.doesNotMatch(html, /data-zl-schritt="bestellt"/, 'kein Ein-Klick-Schritt mehr fuer alle Lieferanten');
  // Worum es geht: echte Namen, keine Platzhalter.
  assert.match(html, /<dt>Lieferant<\/dt><dd>Testlieferant Nord<\/dd>/);
  assert.doesNotMatch(html, /Lieferant A<|Lieferant C<|UNGEKLAERT|Default Title/);
  assert.match(html, /Testleiste<\/a>|Testleiste · Weiß|Weiß/);
});

test('Schon bestellte Artikel bekommen keinen Bestellknopf; ohne offenen Lieferanten ist "Ware ist bestellt…" die Hauptaktion', () => {
  vorbereiten({ stand: { verfuegbar: true, positionen: { 'gid://shopify/Order/9001::L1': { status: 'bestellt' } } } });
  const html = zeitleisteBlock(ware(POSITIONEN));
  assert.doesNotMatch(html, /data-lf-mail="C"/);
  assert.match(html, /data-lf-mail="A"/);
  vorbereiten();
  const ohne = zeitleisteBlock(ware([{ lineItemId: 'L6', titel: 'Ohne Zuordnung', lieferant: 'UNGEKLAERT' }]));
  assert.doesNotMatch(ohne, /data-lf-mail/);
  assert.match(ohne, /class="btn btn-primary" data-zl-bestellt=/);
  assert.match(ohne, /<span class="zl-fehlt">nicht zugeordnet<\/span>/);
});

test('Andere Schritte und Musterbestellungen bleiben wie bisher; Rolle "lesen" sieht keine Knoepfe', () => {
  vorbereiten();
  const geliefert = zeitleisteBlock(ware(POSITIONEN, { wer: 'lieferant', text: 'Lieferant liefert', aktion: 'geliefert', knopf: 'Ware ist angekommen', stufe: 'warten' }));
  assert.match(geliefert, /data-zl-schritt="geliefert"/);
  assert.doesNotMatch(geliefert, /data-lf-mail/);
  const muster = { ...ware(POSITIONEN, { wer: 'wir', text: 'Muster beim Lieferanten bestellen', aktion: 'bestellt', knopf: 'Muster sind bestellt', stufe: 'faellig' }), auftragsart: 'muster' };
  assert.match(zeitleisteBlock(muster), /data-zl-schritt="bestellt"/);
  vorbereiten({ rolle: 'lesen' });
  const lesen = zeitleisteBlock(ware(POSITIONEN));
  assert.doesNotMatch(lesen, /data-lf-mail|data-zl-bestellt|data-zl-schritt/);
  assert.match(lesen, /Testlieferant Nord/);
});

test('lieferantName: Stammdaten-Name aus Liste oder Zuordnung, sonst "Lieferant X", nie UNGEKLAERT', () => {
  assert.equal(lieferantName('A', [{ id: 'A', name: 'Testlieferant Nord' }]), 'Testlieferant Nord');
  assert.equal(lieferantName('C', [{ id: 'C', stammdaten: { name: 'Testlieferant Sued' } }]), 'Testlieferant Sued');
  assert.equal(lieferantName('B', { B: 'Testlieferant West' }), 'Testlieferant West');
  assert.equal(lieferantName('D', []), 'Lieferant D');
  assert.equal(lieferantName('UNGEKLAERT', { UNGEKLAERT: 'egal' }), NICHT_ZUGEORDNET);
  assert.equal(lieferantName('', []), NICHT_ZUGEORDNET);
  assert.equal(lieferantName(null), NICHT_ZUGEORDNET);
});
