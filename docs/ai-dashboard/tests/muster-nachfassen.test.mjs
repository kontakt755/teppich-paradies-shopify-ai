// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  musterNachfassen, kontaktweg, texteAusMarkdown, fuelleText, mailtoLink,
  ERSTE_NACH_TAGEN, ERINNERUNG_NACH_TAGEN, HOECHSTENS_TAGE, ERLEDIGT_ZEIGEN_TAGE, SHOP_URL,
} from '../lib/muster-nachfassen.mjs';
import { createApi } from '../../../scripts/dashboard-api.mjs';

// Nur erfundene Daten: Testkunden mit example.invalid-Adressen, Produktnamen erfunden.
const JETZT = new Date('2026-10-12T08:00:00.000Z');   // ein Montag
const vorTagen = n => new Date(JETZT.getTime() - n * 86400000).toISOString();

let lfd = 0;
/**
 * Bestellzeile wie /api/kunden/bestellungen sie liefert (nur die Felder, die die Liste braucht).
 * verlauf: { raus: Tage | null, hat: Tage | null, nach: [{ tage, von }] , ergebnis: true }
 */
function zeile({ art = 'muster', raus = 5, hat = null, nach = [], ergebnis = false, abgeschlossen = false, test: istTest = false, storniert = false, email = 'kunde@example.invalid', telefon = null, beratung = false, name = 'Testkunde Eins' } = {}) {
  lfd += 1;
  const s = (schritt, tage, extra = {}) => (tage === null || tage === undefined
    ? { schritt, zustand: 'offen', am: null, von: null }
    : { schritt, zustand: 'erledigt', am: vorTagen(tage), von: 'Laden', ...extra });
  const letzt = nach.at(-1);
  return {
    orderId: `gid://shopify/Order/${lfd}`, orderName: `#T${lfd}`, datum: vorTagen(12), kundenname: name, kundenSchluessel: `email:${email}`,
    email, telefon, beratungOffen: beratung, testbestellung: istTest, storniert, auftragsart: art, zeitleisteAbgeschlossen: abgeschlossen,
    verlauf: [
      s('angefragt', 12), s('raus', raus), s('kunde_hat_muster', hat),
      letzt ? { schritt: 'nachgefasst', zustand: 'erledigt', am: vorTagen(letzt.tage), von: letzt.von || 'Anna', anzahl: nach.length } : s('nachgefasst', null),
      ergebnis ? { schritt: 'ergebnis', ergebnis: 'kein_interesse', zustand: 'erledigt', am: vorTagen(1), von: 'Anna' } : { schritt: 'ergebnis', ergebnis: null, zustand: 'offen', am: null, von: null },
    ],
    auftrag: { positionen: [
      { istMuster: true, titel: 'Muster Testvelours Teppich nach Maß', farbe: 'Sand (010)' },
      { istMuster: true, titel: 'Muster Testvelours Teppich nach Maß', farbe: 'Greige (020)' },
      { istMuster: true, titel: 'Muster: Testeiche – Vinylboden von der Rolle', farbe: 'Testeiche' },
    ] },
  };
}
const ids = liste => liste.map(e => e.orderName);

test('erste Nachfrage ab 4 Tagen nach Versand, bis hoechstens 30 Tage', () => {
  const zu_frueh = zeile({ raus: ERSTE_NACH_TAGEN - 1 });
  const faellig = zeile({ raus: ERSTE_NACH_TAGEN });
  const alt = zeile({ raus: 9 });
  const zu_alt = zeile({ raus: HOECHSTENS_TAGE + 1 });
  const nicht_verschickt = zeile({ raus: null });
  const r = musterNachfassen([zu_frueh, faellig, alt, zu_alt, nicht_verschickt], { jetzt: JETZT });
  assert.deepEqual(ids(r.offen), [alt.orderName, faellig.orderName], 'aeltester zuerst');
  assert.equal(r.offen[0].stufe, 'erste');
  assert.equal(r.offen[0].tage, 9);
  assert.deepEqual(r.erledigt, []);
});

test('ohne Versandschritt zaehlt "Kunde hat Muster" (z. B. persoenlich uebergeben)', () => {
  const z = zeile({ raus: null, hat: 6 });
  const r = musterNachfassen([z], { jetzt: JETZT });
  assert.deepEqual(ids(r.offen), [z.orderName]);
  assert.equal(r.offen[0].tage, 6);
});

test('Erinnerung genau einmal: 10 Tage nach der ersten Nachfrage, danach nicht mehr', () => {
  const noch_nicht = zeile({ raus: 15, nach: [{ tage: ERINNERUNG_NACH_TAGEN - 1 }] });
  const erinnerung = zeile({ raus: 16, nach: [{ tage: ERINNERUNG_NACH_TAGEN, von: 'Anna' }] });
  const schon_erinnert = zeile({ raus: 27, nach: [{ tage: 12 }, { tage: 2 }] });
  const r = musterNachfassen([noch_nicht, erinnerung, schon_erinnert], { jetzt: JETZT });
  assert.deepEqual(ids(r.offen), [erinnerung.orderName]);
  assert.equal(r.offen[0].stufe, 'erinnerung');
  assert.deepEqual(r.offen[0].zuletzt, { am: vorTagen(ERINNERUNG_NACH_TAGEN), von: 'Anna' });
  // Erledigt-Liste: nur, was in den letzten 7 Tagen nachgefasst wurde - mit wer und wann.
  assert.deepEqual(r.erledigt.map(e => [e.orderName, e.von, e.anzahl]), [[schon_erinnert.orderName, 'Anna', 2]]);
});

test('Erledigt bleibt eine Woche mit wer und wann sichtbar, auch wenn der Auftrag inzwischen abgeschlossen ist', () => {
  const heute = zeile({ raus: 6, nach: [{ tage: 0, von: 'Bernd' }] });
  const abgeschlossen = zeile({ raus: 8, nach: [{ tage: 2, von: 'Anna' }], ergebnis: true, abgeschlossen: true });
  const zu_lange_her = zeile({ raus: 14, nach: [{ tage: ERLEDIGT_ZEIGEN_TAGE }] });
  const r = musterNachfassen([heute, abgeschlossen, zu_lange_her], { jetzt: JETZT });
  assert.deepEqual(r.offen, []);
  assert.deepEqual(r.erledigt.map(e => [e.orderName, e.von, e.am]), [[heute.orderName, 'Bernd', vorTagen(0)], [abgeschlossen.orderName, 'Anna', vorTagen(2)]]);
});

test('nicht auf der Liste: Ware, Test, storniert, Ergebnis schon da, abgeschlossen', () => {
  const r = musterNachfassen([
    zeile({ art: 'ware' }), zeile({ test: true }), zeile({ storniert: true }),
    zeile({ ergebnis: true }), zeile({ abgeschlossen: true }),
  ], { jetzt: JETZT });
  assert.deepEqual(r, { offen: [], erledigt: [] });
});

test('Muster gekuerzt: ohne das Wort "Muster", je Produkt einmal mit seinen Farben', () => {
  const r = musterNachfassen([zeile({ raus: 5 })], { jetzt: JETZT });
  assert.deepEqual(r.offen[0].muster, ['Testvelours Teppich nach Maß: Sand (010), Greige (020)', 'Testeiche – Vinylboden von der Rolle']);
});

test('Kontaktweg: E-Mail; Telefon nur bei Rueckrufwunsch', () => {
  assert.deepEqual(kontaktweg({ email: 'a@example.invalid', telefon: '0301234', beratungOffen: false }), { weg: 'email', email: 'a@example.invalid', telefon: null });
  assert.deepEqual(kontaktweg({ email: 'a@example.invalid', telefon: '0301234', beratungOffen: true }), { weg: 'rueckruf', email: 'a@example.invalid', telefon: '0301234' });
  assert.deepEqual(kontaktweg({ email: null, telefon: '0301234', beratungOffen: false }), { weg: 'keiner', email: null, telefon: null });
  assert.deepEqual(kontaktweg({ email: '–', telefon: null, beratungOffen: true }), { weg: 'keiner', email: null, telefon: null });
});

// Aufbau wie die Vorlage des Inhabers, Text gekuerzt und erfunden.
const VORLAGE = `# Musterkunden nachfassen

## Ablauf

1. Wann: nach Versand.

## Rechtlicher Hinweis (bitte prüfen lassen)

- E-Mail: mit Abmelde-Satz.

---

## Text 1 – E-Mail nach 4–5 Tagen

**Betreff:** Ihre Muster – passt die Farbe?

Guten Tag {Anrede} {Nachname},

Ihre Muster sollten angekommen sein.

Wir verlegen auch: {Link Liefer- & Verlegeservice}

Ihr gewähltes Produkt finden Sie hier: {Link Produkt}
Weitere Muster: {Link Muster}

Freundliche Grüße
{Name}
Teppich Paradies Oranienburg

<small>Keine Nachfragen mehr? Antworten Sie mit „Abmelden“.</small>

---

## Text 2 – Kurze Erinnerung nach weiteren 10 Tagen (optional, nur ohne Antwort)

**Betreff:** Noch Fragen zu Ihrem neuen Boden?

Guten Tag {Anrede} {Nachname},

haben Sie sich schon entschieden?

Freundliche Grüße
{Name}

---

## Text 3 – Telefonleitfaden (nur bei gewünschtem Rückruf)

1. „Guten Tag …“
`;

test('Vorlage lesen: Betreff und Text der ersten Mail und der Erinnerung', () => {
  const t = texteAusMarkdown(VORLAGE);
  assert.equal(t.erste.betreff, 'Ihre Muster – passt die Farbe?');
  assert.match(t.erste.text, /^Guten Tag \{Anrede\} \{Nachname\},/);
  assert.match(t.erste.text, /Abmelden/);
  assert.doesNotMatch(t.erste.text, /Text 2|---/);
  assert.equal(t.erinnerung.betreff, 'Noch Fragen zu Ihrem neuen Boden?');
  assert.match(t.erinnerung.text, /entschieden\?\n\nFreundliche Grüße\n\{Name\}$/);
  assert.deepEqual(texteAusMarkdown('# nur eine Überschrift'), { erste: null, erinnerung: null });
});

test('Text fuellen: Name und Links, Unbekanntes faellt mit seiner Zeile weg', () => {
  const t = texteAusMarkdown(VORLAGE);
  const mail = fuelleText(t.erste, { kundenname: 'Testkunde Eins', absender: 'Anna' });
  assert.match(mail.text, /^Guten Tag Testkunde Eins,/);
  assert.match(mail.text, new RegExp(`Wir verlegen auch: ${SHOP_URL}/pages/liefer-verlegeservice`));
  assert.match(mail.text, new RegExp(`Weitere Muster: ${SHOP_URL}/pages/muster`));
  assert.match(mail.text, /Freundliche Grüße\nAnna\nTeppich Paradies Oranienburg/);
  assert.doesNotMatch(mail.text, /[{}<>]/, 'kein Platzhalter und kein HTML beim Kunden');
  assert.doesNotMatch(mail.text, /gewähltes Produkt/, 'Produktlink ist nicht sicher bekannt - Zeile faellt weg');
  assert.match(mail.text, /Keine Nachfragen mehr\? Antworten Sie mit „Abmelden“\.$/);

  const ohne = fuelleText(t.erinnerung, { kundenname: null, absender: null });
  assert.match(ohne.text, /^Guten Tag,/);
  assert.match(ohne.text, /Freundliche Grüße$/);
  assert.equal(fuelleText(null, {}), null);
});

test('mailto: Betreff und Text kodiert, Zeilenumbrueche als CRLF, ohne Adresse kein Link', () => {
  const link = mailtoLink('kunde@example.invalid', { betreff: 'Passt die Farbe?', text: 'Zeile 1\nZeile & 2' });
  assert.equal(link, 'mailto:kunde@example.invalid?subject=Passt%20die%20Farbe%3F&body=Zeile%201%0D%0AZeile%20%26%202');
  assert.equal(mailtoLink('kunde@example.invalid'), 'mailto:kunde@example.invalid');
  assert.equal(mailtoLink(null, { betreff: 'x' }), null);
});

test('API /api/kunden/muster-texte: liest die Vorlage aus dem Privatordner, fehlt sie, gibt es einen Hinweis', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-muster-texte-'));
  const api = createApi({ gh: async () => '', root: fs.mkdtempSync(path.join(os.tmpdir(), 'cc-muster-root-')), privatDirPath: dir, env: {} });
  const fehlt = api.kundenMusterTexte();
  assert.equal(fehlt.verfuegbar, false);
  assert.match(fehlt.hinweis, /muster-nachfassen-texte\.md/);

  fs.writeFileSync(path.join(dir, 'muster-nachfassen-texte.md'), '# Ohne Abschnitte\n');
  assert.equal(api.kundenMusterTexte().verfuegbar, false);

  fs.writeFileSync(path.join(dir, 'muster-nachfassen-texte.md'), VORLAGE);
  const r = api.kundenMusterTexte();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.texte.erste.betreff, 'Ihre Muster – passt die Farbe?');
  assert.equal(r.texte.erinnerung.betreff, 'Noch Fragen zu Ihrem neuen Boden?');
});
