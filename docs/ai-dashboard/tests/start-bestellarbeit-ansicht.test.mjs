import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellarbeitBlock } from '../ansichten/heute/bestellarbeit.mjs';
import { startBestellarbeit } from '../lib/start-bestellarbeit.mjs';

// Synthetische Bestellungen und Lieferanten-Pseudonyme; der echte Renderer braucht kein DOM.
const position = (id, extra = {}) => ({ orderId: `o-${id}`, lineItemId: `li-${id}`, istMuster: true,
  orderDatum: '2026-10-18T09:00:00Z', grosshaendlerId: 'TEST-ARTIKEL', bestellmenge: { menge: 1, einheit: 'muster' }, ...extra });
function arbeitFuer(gruppen, extra = {}) {
  return startBestellarbeit({ daten: { verfuegbar: true, gruppen: [], musterGruppen: gruppen },
    statusAlle: {}, jetzt: new Date('2026-10-22T09:00:00Z'), ...extra });
}
const gruppe = (lieferant, positionen) => ({ lieferant, positionen });
const links = html => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(([, href, text]) => ({ href: href.replaceAll('&amp;', '&'), text: text.replace(/<[^>]*>/g, '') }));
const link = (html, text) => links(html).find(a => a.text.includes(text));
const parameter = href => new URLSearchParams(href.split('?')[1] || '');
const vorbereiten = html => [...html.matchAll(/<button\b[^>]*\bdata-lf-mail="[^"]*"[^>]*>/g)].map(m => m[0]);

test('fehlende Quellen zeigen Ladezustaende und keine erfundene Null-Erledigtmeldung', () => {
  for (const arbeit of [undefined, startBestellarbeit(), startBestellarbeit({ daten: { verfuegbar: true } })]) {
    const html = bestellarbeitBlock({ arbeit });
    assert.match(html, /(?:wird|werden) geladen/);
    assert.match(html, /Bestellungen werden geladen/);
    assert.match(html, /Packstand wird geladen/);
    assert.doesNotMatch(html, /Gerade keine Muster|0 Bestellungen sind noch offen|0 packbereit|<span>0<\/span>/);
    assert.equal(vorbereiten(html).length, 0);
  }
});

test('unverfuegbare Einkaufsdaten bleiben mit Ursache sichtbar, ohne Bestellknopf oder Nullzahl', () => {
  const arbeit = startBestellarbeit({ daten: { verfuegbar: false, hinweis: 'Testexport <fehlt>' }, statusAlle: {} });
  const html = bestellarbeitBlock({ arbeit });
  assert.match(html, /notice warn/);
  assert.match(html, /Testexport &lt;fehlt&gt;/);
  assert.doesNotMatch(html, /Gerade keine Muster|<span>0<\/span>|Testexport <fehlt>/);
  assert.equal(vorbereiten(html).length, 0);
  assert.equal(parameter(link(html, 'Alle ansehen').href).get('art'), 'muster');
});

test('bekannte offene Muster nutzen den vorhandenen globalen Bestellmail-Weg mit Art Muster', () => {
  const arbeit = arbeitFuer([gruppe('A', [position(1), position(2, { orderId: 'o-1' })])]);
  const html = bestellarbeitBlock({ arbeit });
  const [knopf] = vorbereiten(html);
  assert.equal(vorbereiten(html).length, 1);
  assert.match(knopf, /data-lf-mail="A"/);
  assert.match(knopf, /data-lf-art="muster"/);
  assert.match(html, /1 Kundenbestellung · 2 Musterartikel/);
  assert.match(html, /wartet seit 4 Tagen/);
  assert.match(html, /Im nächsten Schritt prüfst du Lieferziel und fehlende Angaben/);
  assert.match(html, /Erst die bewusste Bestätigung setzt den Bestellstand/);
  assert.doesNotMatch(knopf, /data-af-set|data-lf-bestellt|data-lf-markieren/);
});

test('vier Lieferanten bleiben alle erreichbar: drei direkt und der vierte im aufklappbaren Rest', () => {
  const arbeit = arbeitFuer(['A', 'B', 'C', 'D'].map((id, i) => gruppe(id, [position(i)])));
  const html = bestellarbeitBlock({ arbeit });
  assert.equal(vorbereiten(html).length, 4);
  for (const id of ['A', 'B', 'C', 'D']) assert.match(html, new RegExp(`data-lf-mail="${id}"`));
  const rest = html.match(/<details>([\s\S]*?)<\/details>/)?.[1];
  assert.ok(rest, 'weitere Lieferanten muessen sichtbar erreichbar bleiben');
  assert.match(rest, /<summary>1 weitere Lieferanten<\/summary>/);
  assert.equal(vorbereiten(rest).length, 1);
  assert.match(rest, /data-lf-mail="D"/);
  assert.equal(vorbereiten(html.slice(0, html.indexOf('<details>'))).length, 3);
});

test('unbekannte und blockierte Muster verlieren ihren Prueflink nicht und erzeugen keinen irrefuehrenden Bestellknopf', () => {
  const arbeit = arbeitFuer([gruppe('UNGEKLAERT', [position(1)]), gruppe('A', [position(2, { lineItemId: null })])]);
  const html = bestellarbeitBlock({ arbeit });
  assert.match(html, /<h3>Muster bestellen <span>2<\/span><\/h3>/);
  assert.match(html, /Vor dem Bestellen müssen noch Angaben geklärt werden/);
  assert.match(html, /2 Musterartikel brauchen Klärung/);
  const ziel = parameter(link(html, 'Fehlende Angaben prüfen').href);
  assert.equal(ziel.get('tab'), 'lieferant');
  assert.equal(ziel.get('art'), 'muster');
  assert.equal(ziel.get('af'), 'offen');
  assert.equal(vorbereiten(html).length, 0);
});

test('Muster mit fehlenden Bestellangaben bleiben neben vorbereitbaren Mustern sichtbar', () => {
  const arbeit = arbeitFuer([gruppe('A', [position(1), position(2, { grosshaendlerId: 'UNGEKLAERT' }),
    position(3, { bestellmenge: { menge: 0 } })])]);
  const html = bestellarbeitBlock({ arbeit });
  assert.match(html, /<h3>Muster bestellen <span>3<\/span><\/h3>/);
  assert.match(html, /1 Kundenbestellung · 1 Musterartikel/);
  assert.match(html, /2 Musterartikel brauchen Klärung/);
  assert.equal(vorbereiten(html).length, 1);
  assert.ok(link(html, 'Fehlende Angaben prüfen'));
  assert.doesNotMatch(html, /Gerade keine Muster/);
});

test('lesender Zugang bekommt Lieferantenlinks statt eines schreibenden Bestellmail-Knopfes', () => {
  const arbeit = arbeitFuer([gruppe('A & B', [position(1)])]);
  const html = bestellarbeitBlock({ arbeit, lesend: true });
  assert.equal(vorbereiten(html).length, 0);
  const ansehen = link(html, 'Ansehen');
  assert.ok(ansehen);
  const ziel = parameter(ansehen.href);
  assert.equal(ziel.get('lf'), 'A & B');
  assert.equal(ziel.get('art'), 'muster');
  assert.equal(ziel.get('af'), 'offen');
  assert.doesNotMatch(html, /<button\b/);
});

test('offene, fertige, Ware- und Packwege tragen die passenden vorhandenen Routen und Filter', () => {
  const arbeit = arbeitFuer([gruppe('A', [position(1)])]);
  const html = bestellarbeitBlock({ arbeit, offeneBestellungen: 3,
    pack: { verfuegbar: true, zahlen: { packen: 2, klaeren: 1, gepackt: 4 } } });
  assert.match(html, /3 Bestellungen sind noch offen/);
  assert.match(html, /2 packbereit · 1 zu klären/);
  assert.equal(parameter(link(html, 'Dringendes bearbeiten').href).get('bsort'), 'wichtigkeit');
  assert.equal(parameter(link(html, 'Fertige ansehen').href).get('bfilter'), 'fertig');
  assert.equal(parameter(link(html, 'Ware beim Lieferanten bestellen').href).get('art'), 'ware');
  assert.equal(link(html, 'Muster packen').href, '#/kunden?tab=muster');
  assert.equal(parameter(link(html, 'Ware annehmen').href).get('af'), 'bestellt');
  assert.equal(parameter(link(html, 'Versand vorbereiten').href).get('mpbereich'), 'gepackt');
  assert.match(link(html, 'Versand vorbereiten').text, /4 gepackte Umschläge/);
});

test('ohne packbereite Muster fuehrt der naechste Packweg direkt zu den Klaerfaellen', () => {
  const html = bestellarbeitBlock({ arbeit: arbeitFuer([]), offeneBestellungen: 0,
    pack: { verfuegbar: true, zahlen: { packen: 0, klaeren: 2, gepackt: 1 } } });
  assert.equal(parameter(link(html, 'Klärfälle ansehen').href).get('mpbereich'), 'klaeren');
  assert.equal(parameter(link(html, 'Versand vorbereiten').href).get('mpbereich'), 'gepackt');
  assert.match(html, /0 Bestellungen sind noch offen/);
});

test('eigener Bestand bleibt in der Packstation auffindbar und erscheint nicht als Lieferantenbestellung', () => {
  const arbeit = arbeitFuer([gruppe('A', [position(1, { route: 'SAMPLE_STOCK' })])]);
  const html = bestellarbeitBlock({ arbeit });
  assert.equal(vorbereiten(html).length, 0);
  assert.match(html, /1 Musterartikel kommt aus eigenem Bestand/);
  assert.equal(link(html, 'In der Packstation prüfen').href, '#/kunden?tab=muster');
});

test('private Anzeigenamen und Lieferantenkennungen werden als Text und Attribute maskiert', () => {
  const id = 'A" onclick="unerlaubt';
  const name = 'Lieferant <img src=x onerror=unerlaubt> & "Test"';
  const arbeit = arbeitFuer([gruppe(id, [position(1)])], { lieferanten: [{ id, stammdaten: { name } }] });
  const html = bestellarbeitBlock({ arbeit });
  assert.match(html, /Lieferant &lt;img src=x onerror=unerlaubt&gt; &amp; &quot;Test&quot;/);
  assert.match(html, /data-lf-mail="A&quot; onclick=&quot;unerlaubt"/);
  assert.doesNotMatch(html, /<img\b|<button\b[^>]*\sonclick="/);
  const lesend = bestellarbeitBlock({ arbeit, lesend: true });
  assert.equal(parameter(link(lesend, 'Ansehen').href).get('lf'), id);
  assert.doesNotMatch(lesend, /<img\b|\sonclick="/);
});

test('wartende Umschlaege und Kontrollen bleiben auf Heute direkt erreichbar', () => {
  const html = bestellarbeitBlock({ arbeit: arbeitFuer([]), offeneBestellungen: 4, kontrolle: 2,
    pack: { verfuegbar: true, zahlen: { packen: 0, klaeren: 0, warten: 13, gepackt: 1 } } });
  assert.match(html, /13 Umschläge warten/);
  assert.equal(parameter(link(html, 'Umschläge warten').href).get('mpbereich'), 'warten');
  assert.equal(parameter(link(html, 'Wartende Umschläge ansehen').href).get('mpbereich'), 'warten');
  assert.equal(parameter(link(html, 'Kontrolle').href).get('bfilter'), 'pruefen');
  assert.match(html, /2 Bestellungen brauchen Kontrolle/);
});

test('fehlgeschlagene Bestell- und Packabrufe sind kein endloser Lade- oder Nullzustand', () => {
  const html = bestellarbeitBlock({ arbeit: arbeitFuer([]), bestellQuelle: { verfuegbar: false }, pack: { verfuegbar: false } });
  assert.match(html, /Bestellungen können gerade nicht geladen werden/);
  assert.match(html, /Packstand kann gerade nicht geladen werden/);
  assert.doesNotMatch(html, /Bestellungen werden geladen|Packstand wird geladen|0 packbereit/);
});

test('Shop-Einstieg zeigt Musterstand einmal kompakt statt einer zweiten allgemeinen Bestellkarte', () => {
  const arbeit = arbeitFuer([]);
  const html = bestellarbeitBlock({ arbeit, nurMuster: true,
    pack: { verfuegbar: true, zahlen: { packen: 1, klaeren: 2, warten: 3, gepackt: 4 } } });
  assert.match(html, /Muster &amp; Packstation/);
  assert.match(html, /3 warten auf Ware/);
  assert.match(html, /4 gepackt · Versand vorbereiten/);
  assert.equal((html.match(/Aufkleber-Druckliste/g) || []).length, 1);
  assert.doesNotMatch(html, /Kundenbestellungen|Dringendes bearbeiten|Bestellungen werden geladen/);
  // Rundgang 29.10. (T6): ein Weg fuer eingetroffene Muster - der Packstation-Reiter "Muster kommt an".
  assert.match(html, /href="#\/kunden\?tab=muster&amp;mp=laden">Muster kommt an</);
  assert.doesNotMatch(html, /Muster-Wareneingang|Etiketten-Druckliste/);
});
