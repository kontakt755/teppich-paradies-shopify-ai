/*
 * Die Schwelle, ab der der Versand nichts kostet, stand an acht Stellen als
 * blosse Zahl - in Texten und einmal als Rechnung im Warenkorb
 * (cart.total_price >= 5000). Wer sie geaendert haette, haette alle acht
 * finden muessen; die uebersehene Stelle verspricht dem Kunden dann etwas
 * anderes als der Checkout.
 *
 * Jetzt ist settings.tp_versand_frei_ab die Quelle. Liquid liest sie direkt,
 * Texte aus JSON (Topbar, Template-Bloecke) ueber den Platzhalter
 * [versandfrei]. Wo beides nicht geht, faellt es hier auf: dieser Test
 * vergleicht jede ausgeschriebene Zahl in einer Versandzusage mit der
 * Einstellung.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WURZEL = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function einstellung(id) {
  const gruppen = JSON.parse(readFileSync(path.join(WURZEL, 'config', 'settings_schema.json'), 'utf8'));
  for (const gruppe of gruppen) {
    for (const s of gruppe.settings || []) if (s.id === id) return s;
  }
  return null;
}

/** Alle Theme-Dateien, in denen Kundentexte stehen koennen. */
function themeDateien() {
  const ordner = ['sections', 'snippets', 'blocks', 'templates', 'assets', 'layout', 'config'];
  const dateien = [];
  for (const o of ordner) {
    const voll = path.join(WURZEL, o);
    let eintraege = [];
    try { eintraege = readdirSync(voll); } catch { continue; }
    for (const name of eintraege) {
      const p = path.join(voll, name);
      if (!statSync(p).isFile()) continue;
      if (/\.(liquid|json|js)$/.test(name)) dateien.push([path.join(o, name), p]);
    }
  }
  return dateien;
}

const SCHWELLE = einstellung('tp_versand_frei_ab');

test('die Versandschwelle ist eine Theme-Einstellung', () => {
  assert.ok(SCHWELLE, 'settings.tp_versand_frei_ab fehlt im Schema.');
  assert.equal(SCHWELLE.type, 'number');
  assert.equal(typeof SCHWELLE.default, 'number');
  const preis = einstellung('tp_versand_preis');
  assert.ok(preis, 'settings.tp_versand_preis fehlt - der Preis unter der Schwelle stand ebenfalls doppelt.');
});

test('keine Versandzusage nennt eine andere Zahl als die Einstellung', () => {
  // Nur Saetze, die vom kostenlosen Versand handeln und einen Eurobetrag
  // nennen. "Verlegeservice bis 50 km" ist etwas anderes und bleibt aussen vor.
  const zusage = /versandkostenfrei|kostenloser versand|versand[^.]{0,40}kostenlos/i;
  const betrag = /(\d{1,4})\s*€/g;
  const funde = [];
  for (const [name, p] of themeDateien()) {
    const inhalt = readFileSync(p, 'utf8');
    for (const satz of inhalt.split(/[.;!?](?=\s|$)|\n/)) {
      if (!zusage.test(satz)) continue;
      betrag.lastIndex = 0;
      let treffer;
      while ((treffer = betrag.exec(satz))) {
        if (Number(treffer[1]) !== SCHWELLE.default) {
          funde.push(`${name}: ${satz.trim().slice(0, 110)}`);
        }
      }
    }
  }
  assert.deepEqual(funde, [], `Diese Stellen nennen eine andere Schwelle als die Einstellung (${SCHWELLE.default} €):\n  ${funde.join('\n  ')}`);
});

test('der Warenkorb rechnet mit der Einstellung, nicht mit einer festen Zahl', () => {
  // Der Text allein reicht nicht: die Grenze steckte hier als Centbetrag in
  // der Bedingung. Wer nur die Texte anpasst, haette den Warenkorb weiter
  // nach der alten Schwelle rechnen lassen.
  const warenkorb = readFileSync(path.join(WURZEL, 'snippets', 'cart-summary.liquid'), 'utf8');
  assert.match(warenkorb, /settings\.tp_versand_frei_ab \| times: 100/,
    'Der Warenkorb rechnet die Schwelle nicht aus der Einstellung.');
  assert.doesNotMatch(warenkorb, /cart\.total_price >= \d+/,
    'Im Warenkorb steht die Schwelle noch als feste Zahl.');
});

test('Texte aus JSON kommen ueber den Platzhalter an die Einstellung', () => {
  // Topbar und Template-Bloecke liegen als JSON-Werte vor, dort greift kein
  // Liquid. Wer [versandfrei] einsetzt, braucht die Aufloesung in der Sektion.
  const paare = [
    ['sections/header-group.json', 'sections/tp-topbar.liquid'],
    ['templates/page.vinylboden-verlegen.json', 'sections/tp-verlegegebiet.liquid'],
    ['templates/page.treppenverlegung.json', 'sections/tp-verlegegebiet.liquid'],
  ];
  for (const [quelle, sektion] of paare) {
    const text = readFileSync(path.join(WURZEL, quelle), 'utf8');
    if (!text.includes('[versandfrei]')) continue;
    const code = readFileSync(path.join(WURZEL, sektion), 'utf8');
    assert.match(code, /replace: '\[versandfrei\]', settings\.tp_versand_frei_ab/,
      `${quelle} nutzt den Platzhalter, aber ${sektion} loest ihn nicht auf - der Kunde liest "[versandfrei]".`);
  }
});
