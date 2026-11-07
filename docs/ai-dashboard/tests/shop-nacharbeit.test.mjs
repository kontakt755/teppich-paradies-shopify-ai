import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { shopNacharbeitBlock } from '../ansichten/heute/shop-nacharbeit.mjs';

import { NACHFRAGE_MAILS_HREF } from '../lib/nachfrage-mails.mjs';

const daten = zeilen => ({ verfuegbar: true, zeilen });
test('Versandvorbereitung und gebuchte Sendung sind keine Zustellung; unbekannte Quellen bleiben sichtbar', () => {
  const html = shopNacharbeitBlock({ bestellungen: daten([
    { orderName: '#TEST1', shopifyVersandVermerk: 'nachholen' },
    { orderName: '#TEST2', fulfillmentstatus: 'FULFILLED', fertig: true, auftrag: { sendungen: [{ status: 'IN_TRANSIT' }] } },
    { orderName: '#TEST3', fulfillmentstatus: 'FULFILLED', auftrag: { sendungen: [{ status: 'DELIVERED' }] } },
    { orderName: '#TEST4', testbestellung: true, shopifyVersandVermerk: 'nachholen' },
  ]), nachfassen: { offen: [] }, texte: { verfuegbar: true } });
  assert.match(html, /1 Versandbuchung braucht/);
  assert.match(html, /1 Bestellung ist versandt, Empfang noch nicht belegt/);
  assert.match(html, /#TEST2/);
  assert.doesNotMatch(html, /#TEST3|#TEST4/);
  assert.doesNotMatch(html, /mpbereich=gepackt/, 'Packzahlen und Vorbereitung stehen einmal im Musterblock');
  const fehler = shopNacharbeitBlock({ bestellungen: { verfuegbar: false, fehler: true } });
  assert.match(fehler, /Bestellungen sind nicht verfügbar/);
  assert.doesNotMatch(fehler, /0 Versandbuchung/);
});

// w-284 (Inhaber 07.11.2026): der Normalstand der Nachfrage-Mails steht unter Kunden nach Produkt fragen,
// "Bewertungen: bestehenden Ablauf prüfen" ist ersatzlos weg. Ohne Inhalt faellt der Block ganz weg.
test('w-284: ruhiger Normalstand - kein Block, keine Nachfrage-Zeile, keine Bewertungen', () => {
  for (const texte of [{ verfuegbar: true, versand: { eingerichtet: true, hinweis: null } }, null]) {
    const html = shopNacharbeitBlock({ bestellungen: daten([]), nachfassen: { offen: [{ orderId: 'test', kontakt: { weg: 'email' } }] }, texte });
    assert.equal(html, '', JSON.stringify(texte));
  }
  const quelle = fs.readFileSync(new URL('../ansichten/heute/shop-nacharbeit.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(quelle, /<summary>Bewertungen|heute\?mn=1/);
});

test('w-284: echte Warnungen bleiben auf Heute und fuehren zu Kunden nach Produkt fragen', () => {
  const block = (texte, offen = []) => shopNacharbeitBlock({ bestellungen: daten([]), nachfassen: { offen }, texte });
  const fehler = block({ verfuegbar: true, versand: { eingerichtet: true, letzterLauf: { fehler: 1 } } });
  assert.match(fehler, /Versand &amp; Kunden nachfassen/);
  assert.match(fehler, /letzte Lauf der Nachfrage-Mails meldet Fehler/);
  const postfach = block({ verfuegbar: true, versand: { eingerichtet: true }, abgleichFehler: 'Zeitüberschreitung' });
  assert.match(postfach, /Postfach-Suche vor den Nachfrage-Mails ist fehlgeschlagen/);
  const hinweise = block({ verfuegbar: true, versand: { eingerichtet: true }, antwortHinweise: [{ email: 'test@example.invalid' }, { email: 'b@example.invalid' }] });
  assert.match(hinweise, /2 Hinweise aus dem Postfach zu Nachfrage-Mails/);
  const steht = block({ verfuegbar: true, versand: { eingerichtet: false, hinweis: 'Testdatei fehlt.' } }, [{ orderId: 'a' }, { orderId: 'b' }]);
  assert.match(steht, /2 Nachfrage-Mails sind fällig, der automatische Versand läuft aber nicht/);
  assert.doesNotMatch(steht, /Testdatei/, 'kein Dateipfad in der Ansicht');
  assert.equal(block({ verfuegbar: true, versand: { eingerichtet: false, hinweis: 'x' } }), '', 'nichts fällig, Versand aus: kein Alarm');
  for (const html of [fehler, postfach, hinweise, steht]) {
    assert.ok(html.includes(`href="${NACHFRAGE_MAILS_HREF.replace('&', '&amp;')}"`), 'Link zum neuen Ort');
    assert.doesNotMatch(html, /pausiert|data-zl-schritt|data-mp-aktion|data-lf-mail|mailto:/);
  }
});

test('Nachfass-Hauptknopf akzeptiert ausschliesslich den bekannten internen Nachfassweg (alter Link fuehrt zum neuen Ort)', () => {
  const quelle = fs.readFileSync(new URL('../ansichten/kunden/zeitleiste.mjs', import.meta.url), 'utf8')
    .replace(/^import[^;]*;\n/gm, '').replace(/^export\s/gm, '');
  const api = vm.runInNewContext(quelle + '\n({ naechsterKarte })', { esc: String, NACHFRAGE_MAILS_HREF, NACHFRAGE_MAILS_HREF_ALT: '#/heute?mn=1' });
  const auftrag = { id: 'test', naechsterSchritt: { wer: 'wir', text: 'Prüfen', detail: 'Vorhandener Ablauf', stufe: 'faellig', href: NACHFRAGE_MAILS_HREF, knopf: 'Nachfragen prüfen', aktion: null }, details: {} };
  assert.ok(api.naechsterKarte(auftrag, {}, false).includes(`href="${NACHFRAGE_MAILS_HREF}"`));
  // Server noch auf altem Stand (vor dem Neustart): der alte Link wird zum neuen Ziel.
  auftrag.naechsterSchritt.href = '#/heute?mn=1';
  assert.ok(api.naechsterKarte(auftrag, {}, false).includes(`href="${NACHFRAGE_MAILS_HREF}"`));
  auftrag.naechsterSchritt.href = 'javascript:alert(1)';
  assert.doesNotMatch(api.naechsterKarte(auftrag, {}, false), /javascript:/);
});
