import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { shopNacharbeitBlock } from '../ansichten/heute/shop-nacharbeit.mjs';

const daten = zeilen => ({ verfuegbar: true, zeilen });
test('Versandvorbereitung und gebuchte Sendung sind keine Zustellung; unbekannte Quellen bleiben sichtbar', () => {
  const html = shopNacharbeitBlock({ bestellungen: daten([
    { orderName: '#TEST1', shopifyVersandVermerk: 'nachholen' },
    { orderName: '#TEST2', fulfillmentstatus: 'FULFILLED', fertig: true, auftrag: { sendungen: [{ status: 'IN_TRANSIT' }] } },
    { orderName: '#TEST3', fulfillmentstatus: 'FULFILLED', auftrag: { sendungen: [{ status: 'DELIVERED' }] } },
    { orderName: '#TEST4', testbestellung: true, shopifyVersandVermerk: 'nachholen' },
  ]), pack: { verfuegbar: true, zahlen: { gepackt: 2 } }, nachfassen: { offen: [] }, texte: { verfuegbar: true } });
  assert.match(html, /1 Versandbuchung braucht/);
  assert.match(html, /1 Bestellung ist versandt, Empfang noch nicht belegt/);
  assert.match(html, /#TEST2/);
  assert.doesNotMatch(html, /#TEST3|#TEST4/);
  assert.match(html, /noch kein Versandnachweis/);
  assert.doesNotMatch(html, /mpbereich=gepackt/, 'Packzahlen und Vorbereitung stehen einmal im Musterblock');
  assert.match(html, /aktueller Live- und Versandstatus wird hier nicht geprüft/);
  const fehler = shopNacharbeitBlock({ bestellungen: { verfuegbar: false, fehler: true } });
  assert.match(fehler, /Bestellungen sind nicht verfügbar/);
  assert.doesNotMatch(fehler, /0 Versandbuchung/);
});

test('Nachfassfehler und faellige Nachfragen verweisen nur auf vorhandenen pruefbaren Ablauf', () => {
  const html = shopNacharbeitBlock({ bestellungen: daten([]), pack: { verfuegbar: true, zahlen: {} },
    nachfassen: { offen: [{ orderId: 'test' }] }, texte: { verfuegbar: true, versand: { letzterLauf: { fehler: 1 } } } });
  assert.match(html, /1 Nachfrage ist/);
  assert.match(html, /letzte Nachfasslauf meldet Fehler/);
  assert.match(html, /#\/heute\?mn=1/);
  assert.doesNotMatch(html, /data-zl-schritt|data-mp-aktion|data-lf-mail|mailto:/);
});

test('Nachfass-Hauptknopf akzeptiert ausschliesslich den bekannten internen Nachfassweg', () => {
  const quelle = fs.readFileSync(new URL('../ansichten/kunden/zeitleiste.mjs', import.meta.url), 'utf8')
    .replace(/^import[^;]*;\n/gm, '').replace(/^export\s/gm, '');
  const api = vm.runInNewContext(quelle + '\n({ naechsterKarte })', { esc: String });
  const auftrag = { id: 'test', naechsterSchritt: { wer: 'wir', text: 'Prüfen', detail: 'Vorhandener Ablauf', stufe: 'faellig', href: '#/heute?mn=1', knopf: 'Nachfragen prüfen', aktion: null }, details: {} };
  const html = api.naechsterKarte(auftrag, {}, false);
  assert.match(html, /href="#\/heute\?mn=1"/);
  auftrag.naechsterSchritt.href = 'javascript:alert(1)';
  assert.doesNotMatch(api.naechsterKarte(auftrag, {}, false), /javascript:/);
});
