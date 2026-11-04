import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kundenLinkWert, istKundenLinkWert, kundenSchluesselZu } from '../lib/kunden-linkwert.mjs';
import { vorgangsLink } from '../lib/vorgangslink.mjs';

const SCHLUESSEL = 'email:test.kunde+1@example.invalid';

test('Kurzwert ist fest, enthaelt nichts vom Schluessel und bleibt bei zweiter Anwendung gleich', () => {
  const wert = kundenLinkWert(SCHLUESSEL);
  assert.ok(istKundenLinkWert(wert));
  assert.equal(kundenLinkWert(SCHLUESSEL), wert);
  assert.equal(kundenLinkWert(wert), wert);
  assert.doesNotMatch(wert, /test|kunde|example|@/);
  assert.notEqual(kundenLinkWert('email:andere@example.invalid'), wert);
  assert.equal(kundenLinkWert(null), '');
  assert.equal(kundenLinkWert('email:müller@example.invalid').length, wert.length);
});

test('Vorgangslink traegt weder Adresse noch Telefonnummer, Auftrags-IDs bleiben', () => {
  for (const kunde of [SCHLUESSEL, 'tel:+4930111222', 'name:test kunde']) {
    const href = decodeURIComponent(vorgangsLink('kunden', { kunde, auftrag: 'gid://shopify/Order/1' }));
    assert.ok(!href.includes(kunde), href);
    assert.match(href, /kunde=k-[0-9a-f]{16}/);
    assert.match(href, /auftrag=gid:\/\/shopify\/Order\/1/);
  }
  assert.doesNotMatch(decodeURIComponent(vorgangsLink('kunden', { fall: SCHLUESSEL })), /example/);
  assert.doesNotMatch(vorgangsLink('kunden', { tab: 'rueckrufe' }), /kunde=|fall=/);
});

test('Aufloesen: Kurzwert findet den Schluessel, alter Klartext bleibt, Unbekanntes wird null', () => {
  const liste = ['email:andere@example.invalid', SCHLUESSEL];
  assert.equal(kundenSchluesselZu(kundenLinkWert(SCHLUESSEL), liste), SCHLUESSEL);
  assert.equal(kundenSchluesselZu(SCHLUESSEL, []), SCHLUESSEL);
  assert.equal(kundenSchluesselZu(kundenLinkWert('email:weg@example.invalid'), liste), null);
});

test('Keine Ansicht baut noch einen Kundenlink mit dem Klartext-Schluessel', () => {
  for (const datei of ['heute/muster-nachfassen.mjs', 'lexikon.mjs', 'organisation/gemeinsam.mjs']) {
    const quelle = fs.readFileSync(new URL(`../ansichten/${datei}`, import.meta.url), 'utf8');
    assert.match(quelle, /kunde=\$\{kundenLinkWert\(/, datei);
    assert.doesNotMatch(quelle, /kunde=\$\{encodeURIComponent/, datei);
  }
});
