// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  musterNachfassen, kontaktweg, texteAusMarkdown, fuelleText, mailtoLink, platzhalterFrei,
  ERSTE_NACH_TAGEN, ERINNERUNG_NACH_TAGEN, HOECHSTENS_TAGE, ERLEDIGT_ZEIGEN_TAGE, SHOP_URL,
  versandLaeuft, teileNachfassen, nachfassTodo,
  musterArt, vorlageFuer, nameSchreibweise, TEPPICH_VORLAGEN,
} from '../lib/muster-nachfassen.mjs';
import { musterKaufLinks } from '../lib/muster-kauf-links.mjs';
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
  assert.deepEqual(r, { offen: [], erledigt: [], abgemeldet: [] });
});

test('Stoppliste: wer "Abmelden" geantwortet hat, steht unter abgemeldet statt offen - Adresse ohne Gross/Klein', () => {
  const dran = zeile({ raus: 6, email: 'Dran@example.invalid' });
  const raus = zeile({ raus: 7, email: 'Weg@example.invalid' });
  const erinnerung = zeile({ raus: 16, nach: [{ tage: 10 }], email: 'weg@example.invalid' });
  const r = musterNachfassen([dran, raus, erinnerung], { jetzt: JETZT, abgemeldet: new Map([['weg@example.invalid', { am: vorTagen(3) }]]) });
  assert.deepEqual(ids(r.offen), [dran.orderName]);
  assert.deepEqual(r.abgemeldet.map(e => [e.orderName, e.stufe, e.abgemeldetAm]), [[erinnerung.orderName, 'erinnerung', vorTagen(3)], [raus.orderName, 'erste', vorTagen(3)]]);
  // Auch als Set oder Liste nutzbar (ohne Datum).
  assert.equal(musterNachfassen([raus], { jetzt: JETZT, abgemeldet: new Set(['weg@example.invalid']) }).abgemeldet[0].abgemeldetAm, null);
  assert.equal(musterNachfassen([raus], { jetzt: JETZT, abgemeldet: ['weg@example.invalid'] }).offen.length, 0);
});

test('platzhalterFrei: erst ohne {…} in Betreff und Text darf eine Mail raus', () => {
  assert.equal(platzhalterFrei({ betreff: 'Passt die Farbe?', text: 'Guten Tag,\n\nalles gut.' }), true);
  assert.equal(platzhalterFrei({ betreff: 'Hallo {Nachname}', text: 'x' }), false);
  assert.equal(platzhalterFrei({ betreff: 'x', text: 'Hier: {Link Produkt}' }), false);
  assert.equal(platzhalterFrei({ betreff: 'x', text: '' }), false);
  assert.equal(platzhalterFrei(null), false);
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
  assert.deepEqual(texteAusMarkdown('# nur eine Überschrift'), { erste: null, erinnerung: null, nichtVerfuegbar: null, teppich: { erste: null, erinnerung: null } });
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
  // Seit w-119 haengen Versandstand und Stoppliste dran - ohne Postfach: nicht eingerichtet, Hinweis nennt die Datei.
  assert.equal(r.versand.eingerichtet, false);
  assert.match(r.versand.hinweis, /nachfassen\/postfach\.json/);
  assert.deepEqual(r.abgemeldet, []);
  assert.equal(fehlt.versand.eingerichtet, false, 'auch ohne Vorlage steht der Versandstand in der Antwort');
});

// --- Wer muss selbst ran? (Startseite "Heute" seit 2026-10-19) ------------------------------

test('versandLaeuft: nur mit eingerichtetem Postfach, ohne Stoerung und mit Vorlage', () => {
  assert.equal(versandLaeuft(null), null, 'noch nicht geladen');
  assert.equal(versandLaeuft({ verfuegbar: true, versand: { eingerichtet: true, hinweis: null } }), true);
  assert.equal(versandLaeuft({ verfuegbar: true, versand: { eingerichtet: false, hinweis: 'fehlt' } }), false);
  assert.equal(versandLaeuft({ verfuegbar: true, versand: { eingerichtet: true, hinweis: 'versand.json beschädigt' } }), false);
  assert.equal(versandLaeuft({ verfuegbar: false, versand: { eingerichtet: true } }), false, 'ohne Vorlage schickt auch der Lauf nichts');
});

test('teileNachfassen: E-Mail geht bei laufendem Versand von selbst, Rueckruf immer Mensch, ohne Weg kein To-do', () => {
  const mail = { orderId: 'o1', kontakt: { weg: 'email', email: 'a@example.invalid' } };
  const ruf = { orderId: 'o2', kontakt: { weg: 'rueckruf', telefon: '0000 123' } };
  const ohne = { orderId: 'o3', kontakt: { weg: 'keiner' } };
  const an = teileNachfassen([mail, ruf, ohne], { automatisch: true });
  assert.deepEqual([an.mensch, an.automatisch, an.ohneWeg].map(l => l.map(e => e.orderId)), [['o2'], ['o1'], ['o3']]);
  const aus = teileNachfassen([mail, ruf, ohne], { automatisch: false });
  assert.deepEqual([aus.mensch, aus.automatisch, aus.ohneWeg].map(l => l.map(e => e.orderId)), [['o1', 'o2'], [], ['o3']]);
});

test('nachfassTodo: Anrufen bei Rueckrufwunsch, sonst Sprung zur Nachfass-Karte - eine Zeile, ein Knopf', () => {
  const ruf = nachfassTodo({ orderId: 'o2', orderName: '#T2', kundenname: 'Testkundin', stufe: 'erste', tage: 5, muster: ['Testvelours: Sand'], kontakt: { weg: 'rueckruf', telefon: '0000 / 123' } }, { ansehenHref: '#/heute?mn=1' });
  assert.equal(ruf.titel, 'Muster nachfassen: Testkundin');
  assert.deepEqual(ruf.knopf, { text: 'Anrufen', href: 'tel:0000123' });
  assert.match(ruf.kontext, /#T2 · Muster verschickt vor 5 Tagen · Testvelours: Sand · Rückruf gewünscht/);
  const mail = nachfassTodo({ orderId: 'o1', orderName: '#T1', stufe: 'erinnerung', tage: 11, kontakt: { weg: 'email' } }, { ansehenHref: '#/heute?mn=1' });
  assert.equal(mail.titel, 'Erinnerung schicken: #T1');
  assert.deepEqual(mail.knopf, { text: 'Nachfassen', href: '#/heute?mn=1' });
  assert.equal(mail.bereich, 'laden');
});

// --- Teppich-Fassung, Anrede, Linkliste (Rundgang 2026-10-26, #7) -------------------------------

const link = (n, titel, farbe, lieferzeit) => ({ titel, farbe, url: `${SHOP_URL}/products/test-teppich-${n}?variant=${100 + n}`, ...(lieferzeit ? { lieferzeit } : {}) });
const LZ = 'ca. 5–8 Werktage inkl. Ketteln';

test('musterArt: nur Teppich (oder Laeufer) nach Mass ergibt die Teppich-Fassung, Teppichboden nicht', () => {
  const m = titel => ({ istMuster: true, titel });
  assert.equal(musterArt([m('Muster Testvelours Teppich nach Maß'), m('Muster: Testsoft Teppich mit Einfassband nach Maß'), { istMuster: false, titel: 'Ware' }]), 'teppich');
  assert.equal(musterArt([m('Muster Testläufer Läufer nach Maß')]), 'teppich');
  assert.equal(musterArt([m('Muster Testvelours Teppich nach Maß'), m('Muster: Testeiche – Vinylboden von der Rolle')]), 'boden', 'gemischt: allgemeine Vorlage mit Verlege-Absatz');
  assert.equal(musterArt([m('Muster Testvelours Teppichboden nach Maß')]), 'boden');
  assert.equal(musterArt([m('Muster Testvelours Teppichboden')]), 'boden');
  assert.equal(musterArt([]), 'boden');
  assert.equal(musterArt(null), 'boden');
});

test('musterNachfassen: Eintraege tragen die Art; vorlageFuer waehlt die passende Fassung', () => {
  const teppich = zeile({ raus: 5 });
  teppich.auftrag.positionen = teppich.auftrag.positionen.slice(0, 2);
  const boden = zeile({ raus: 5 });
  const r = musterNachfassen([teppich, boden], { jetzt: JETZT });
  const art = Object.fromEntries(r.offen.map(e => [e.orderName, e.art]));
  assert.equal(art[teppich.orderName], 'teppich');
  assert.equal(art[boden.orderName], 'boden');

  const texte = texteAusMarkdown(VORLAGE);
  assert.equal(vorlageFuer(texte, { stufe: 'erste', art: 'teppich' }), TEPPICH_VORLAGEN.erste, 'ohne eigenen Abschnitt: eingebaute Teppich-Fassung');
  assert.equal(vorlageFuer(texte, { stufe: 'erinnerung', art: 'teppich' }), TEPPICH_VORLAGEN.erinnerung);
  assert.equal(vorlageFuer(texte, { stufe: 'erste', art: 'boden' }), texte.erste);
  assert.equal(vorlageFuer(texte, { stufe: 'erinnerung' }), texte.erinnerung);
  assert.equal(vorlageFuer(texte, { stufe: 'unbekannt', art: 'teppich' }), null);
  assert.equal(vorlageFuer(null, { stufe: 'erste', art: 'teppich' }), null);

  const eigen = texteAusMarkdown(`## Erinnerung Teppich\n**Betreff:** Eigene Teppich-Erinnerung\nHallo\n---\n## Text 1 Teppich\n**Betreff:** Eigener Teppich-Text\nHallo\n---\n${VORLAGE}`);
  assert.equal(eigen.erste.betreff, 'Ihre Muster – passt die Farbe?', 'Teppich-Abschnitte verdraengen die allgemeinen nicht');
  assert.equal(eigen.erinnerung.betreff, 'Noch Fragen zu Ihrem neuen Boden?');
  assert.equal(vorlageFuer(eigen, { stufe: 'erste', art: 'teppich' }).betreff, 'Eigener Teppich-Text', 'Vorlage des Inhabers geht vor');
  assert.equal(vorlageFuer(eigen, { stufe: 'erinnerung', art: 'teppich' }).betreff, 'Eigene Teppich-Erinnerung');
  const paradies = texteAusMarkdown('## Text 1 – E-Mail von Teppich Paradies\n**Betreff:** Allgemein\nHallo\n---\n');
  assert.equal(paradies.erste.betreff, 'Allgemein', '"Teppich Paradies" im Kopf macht keinen Teppich-Abschnitt');
  assert.equal(paradies.teppich.erste, null);
});

test('Teppich-Fassung: Wunschmass, Form, Einfassung, Lieferzeit - keine Rollenbreite, keine Verlegung, saubere Absaetze', () => {
  const produkte = [link(1, 'Testvelours Teppich nach Maß', 'Sand', LZ), link(2, 'Testvelours Teppich nach Maß', 'Greige', LZ), link(3, 'Testsoft Teppich nach Maß', 'Grau', LZ)];
  const mail = fuelleText(TEPPICH_VORLAGEN.erste, { kundenname: 'testkunde eins', absender: 'Ihr Team von Teppich Paradies', produkte });
  assert.match(mail.text, /^Guten Tag Testkunde Eins,/);
  assert.match(mail.text, /Wunschmaß/);
  assert.match(mail.text, /Maß und Form/);
  assert.match(mail.text, /Einfassung, zum Beispiel gekettelt/);
  assert.match(mail.text, /\nLieferzeit laut Produktseite: ca\. 5–8 Werktage inkl\. Ketteln\n/);
  assert.doesNotMatch(mail.text, /Rollenbreite|verlege|Verlegeteam|von der Rolle|Boden/i);
  assert.match(mail.text, new RegExp(`Ihre gewählten Produkte finden Sie hier:\\nTestvelours Teppich nach Maß · Sand\\n${SHOP_URL}/products/test-teppich-1\\?variant=101\\n\\nTestvelours`));
  assert.match(mail.text, /variant=103\n\nWeitere Muster können Sie jederzeit kostenlos nachbestellen: /, 'Leerzeile nach der Linkliste');
  assert.doesNotMatch(mail.text, /[{}<>]/);
  assert.doesNotMatch(mail.text, /[ \t]\n/, 'keine Leerzeichen am Zeilenende');
  assert.ok(platzhalterFrei(mail));
  assert.equal(mail.betreff, 'Ihre Muster von Teppich Paradies – passt die Farbe?');

  const ein = fuelleText(TEPPICH_VORLAGEN.erste, { kundenname: 'Testkunde', absender: 'Team', produkte: [link(1, 'Testvelours Teppich nach Maß', 'Sand', LZ)] });
  assert.match(ein.text, /Ihr gewähltes Produkt finden Sie hier:\nTestvelours/);

  const ohneLz = fuelleText(TEPPICH_VORLAGEN.erste, { kundenname: 'Testkunde', absender: 'Team', produkte: [link(1, 'A Teppich nach Maß', 'Sand', LZ), link(2, 'B Teppich nach Maß', 'Grau')] });
  assert.doesNotMatch(ohneLz.text, /Lieferzeit/, 'nicht fuer alle bekannt: Zeile faellt weg');
  const verschieden = fuelleText(TEPPICH_VORLAGEN.erste, { kundenname: 'Testkunde', absender: 'Team', produkte: [link(1, 'A Teppich nach Maß', 'Sand', LZ), link(2, 'B Teppich nach Maß', 'Grau', 'ca. 14 Tage')] });
  assert.doesNotMatch(verschieden.text, /Lieferzeit/, 'verschiedene Lieferzeiten: nichts raten');
  const ohneLinks = fuelleText(TEPPICH_VORLAGEN.erste, { kundenname: 'Testkunde', absender: 'Team', produkte: [] });
  assert.doesNotMatch(ohneLinks.text, /Lieferzeit|gewählte/);
  assert.ok(platzhalterFrei(ohneLinks));

  const erinnerung = fuelleText(TEPPICH_VORLAGEN.erinnerung, { kundenname: 'TESTKUNDE ZWEI', absender: 'Team', produkte: [link(1, 'Testvelours Teppich nach Maß', 'Sand')] });
  assert.equal(erinnerung.betreff, 'Noch Fragen zu Ihrem Teppich?');
  assert.match(erinnerung.text, /^Guten Tag Testkunde Zwei,/);
  assert.match(erinnerung.text, /Ihr gewähltes Produkt finden Sie hier:\nTestvelours Teppich nach Maß · Sand\n.+variant=101\n\nFreundliche Grüße/);
  assert.doesNotMatch(erinnerung.text, /Boden|Menge/);
  assert.ok(platzhalterFrei(erinnerung));
});

test('Allgemeine Vorlage: Linkliste auf eigenen Zeilen mit Leerzeile, Mehrzahl bei mehreren Produkten', () => {
  const t = texteAusMarkdown(VORLAGE);
  const zwei = fuelleText(t.erste, { kundenname: 'Testkunde', absender: 'Anna', produkte: [link(1, 'Testboden', 'Grau'), link(2, 'Testboden', 'Sand')] });
  assert.match(zwei.text, /Ihre gewählten Produkte finden Sie hier:\nTestboden · Grau\n.+variant=101\n\nTestboden · Sand\n.+variant=102\n\nWeitere Muster: /);
  const anhang = fuelleText(t.erinnerung, { kundenname: 'Testkunde', absender: 'Anna', produkte: [link(1, 'Testboden', 'Grau'), link(2, 'Testboden', 'Sand')] });
  assert.match(anhang.text, /Ihre gewählten Produkte:\nTestboden · Grau/, 'Vorlage ohne {Link Produkt}: Block mit Mehrzahl');
  assert.doesNotMatch(anhang.text, /Böden/);
});

test('nameSchreibweise: nur ganz klein oder ganz gross Eingetipptes wird je Wortanfang gross', () => {
  assert.equal(nameSchreibweise('anna-lena testkunde'), 'Anna-Lena Testkunde');
  assert.equal(nameSchreibweise('ÖZLEM TESTKUNDIN'), 'Özlem Testkundin');
  assert.equal(nameSchreibweise('  erika   beispiel '), 'Erika Beispiel');
  assert.equal(nameSchreibweise('Anna von Testkunde'), 'Anna von Testkunde', 'gemischt bleibt, wie eingegeben');
  assert.equal(nameSchreibweise('McTest'), 'McTest');
  assert.equal(nameSchreibweise(''), '');
  assert.equal(nameSchreibweise(null), '');
});

test('Musterlinks tragen die Lieferzeit laut Produktseite mit, ohne sie fehlt das Feld', () => {
  const quelle = { istMuster: true, handle: 'muster-test-teppich', titel: 'Muster Testvelours Teppich nach Maß', sku: 'M-T1', musterQuelle: { produktHandle: 'test-teppich', quellvariante: 'gid://shopify/ProductVariant/123' } };
  const produkt = { handle: 'test-teppich', status: 'ACTIVE', titel: 'Testvelours Teppich nach Maß', onlineStoreUrl: `${SHOP_URL}/products/test-teppich`,
    varianten: [{ id: 'gid://shopify/ProductVariant/123', sku: 'T1', farbe: 'Sand', verfuegbar: true }] };
  assert.equal(musterKaufLinks([quelle], [{ ...produkt, lieferzeit: LZ }])[0].lieferzeit, LZ);
  assert.equal(Object.hasOwn(musterKaufLinks([quelle], [produkt])[0], 'lieferzeit'), false);
  assert.equal(musterKaufLinks([quelle], [{ ...produkt, lieferzeit: '{Name}' }])[0].lieferzeit, 'Name', 'keine Platzhalter-Klammern aus Produktdaten');
});
