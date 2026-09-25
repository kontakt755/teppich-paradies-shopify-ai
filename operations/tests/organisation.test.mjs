import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sortiere, rang, passtZuAnsicht, darfSehen, darfAendern, istUeberfaellig,
  aehnlichkeit, findeDoppelgaenger, alsTag, STATUS_LABEL,
} from '../lib/organisation.mjs';
import { analysiere, erkenneFaelligkeit, erkennePerson, teileAuf } from '../lib/organisation-analyse.mjs';
import { baueEintrag, aendere, kommentiere, haltePruefungFest, lies, schreib, dateiPfad } from '../lib/organisation-speicher.mjs';

const JETZT = new Date('2026-09-25T09:00:00');
const tag = (v) => alsTag(new Date(JETZT.getTime() + v * 86400000));

const aufgabe = (over = {}) => ({
  id: over.id || 'x', typ: 'TASK', titel: over.titel || 'Etwas tun', beschreibung: null,
  status: 'PLANNED', prioritaet: 'NORMAL', bereich: null, besitzer: 'ahmet',
  verantwortlich: 'ahmet', sichtbarkeit: 'TEAM', fuer: [], faellig: null,
  erstelltAm: '2026-09-20T08:00:00.000Z', erledigtAm: null, ...over,
});

// -- Sortierung -------------------------------------------------------------

test('Reihenfolge: überfällig, dringend, heute, hoch, diese Woche, normal, später', () => {
  const liste = [
    aufgabe({ id: 'normal', titel: 'normal' }),
    aufgabe({ id: 'spaeter', titel: 'später', prioritaet: 'LOW' }),
    aufgabe({ id: 'heute', titel: 'heute', faellig: tag(0) }),
    aufgabe({ id: 'ueberfaellig', titel: 'überfällig', faellig: tag(-2) }),
    aufgabe({ id: 'woche', titel: 'diese Woche', faellig: tag(4) }),
    aufgabe({ id: 'dringend', titel: 'dringend', prioritaet: 'URGENT' }),
    aufgabe({ id: 'hoch', titel: 'hoch', prioritaet: 'HIGH' }),
  ];
  assert.deepEqual(sortiere(liste, JETZT).map(t => t.id),
    ['ueberfaellig', 'dringend', 'heute', 'hoch', 'woche', 'normal', 'spaeter']);
});

test('Warten-auf mischt sich nicht in den Fokus', () => {
  const warten = aufgabe({ id: 'w', status: 'WAITING', prioritaet: 'URGENT' });
  assert.equal(passtZuAnsicht(warten, 'fokus', JETZT), false);
  assert.equal(passtZuAnsicht(warten, 'warten', JETZT), true);
  assert.ok(rang(warten, JETZT) > rang(aufgabe({ prioritaet: 'LOW' }), JETZT));
});

test('Fokus zeigt Fälliges und Wichtiges, nicht Erledigtes oder Zurückgestelltes', () => {
  assert.equal(passtZuAnsicht(aufgabe({ faellig: tag(-1) }), 'fokus', JETZT), true);
  assert.equal(passtZuAnsicht(aufgabe({ prioritaet: 'HIGH' }), 'fokus', JETZT), true);
  assert.equal(passtZuAnsicht(aufgabe({ faellig: tag(30) }), 'fokus', JETZT), false);
  assert.equal(passtZuAnsicht(aufgabe({ status: 'DONE' }), 'fokus', JETZT), false);
  assert.equal(passtZuAnsicht(aufgabe({ status: 'DEFERRED' }), 'fokus', JETZT), false);
});

test('Erledigtes ist nie überfällig', () => {
  assert.equal(istUeberfaellig(aufgabe({ faellig: tag(-9), status: 'DONE' }), JETZT), false);
});

// -- Sichtbarkeit (Datenschutz) --------------------------------------------

test('persönliche Notizen sieht nur der Besitzer - auch der Inhaber nicht', () => {
  const notiz = { typ: 'NOTE', besitzer: 'ahmet', sichtbarkeit: 'PRIVAT', fuer: [] };
  assert.equal(darfSehen(notiz, { kuerzel: 'ahmet', rolle: 'mitarbeiter' }), true);
  assert.equal(darfSehen(notiz, { kuerzel: 'ben', rolle: 'mitarbeiter' }), false);
  assert.equal(darfSehen(notiz, { kuerzel: 'chef', rolle: 'inhaber' }), false);
});

test('Notiz für bestimmte Personen sehen nur diese', () => {
  const notiz = { typ: 'NOTE', besitzer: 'ahmet', sichtbarkeit: 'PERSONEN', fuer: ['ben'] };
  assert.equal(darfSehen(notiz, { kuerzel: 'ben' }), true);
  assert.equal(darfSehen(notiz, { kuerzel: 'rufat' }), false);
});

test('Rolle "lesen" darf nichts ändern, Mitarbeiter nur Eigenes', () => {
  const fremd = { besitzer: 'ahmet', verantwortlich: 'ahmet', sichtbarkeit: 'TEAM' };
  assert.equal(darfAendern(fremd, { kuerzel: 'ben', rolle: 'lesen' }), false);
  assert.equal(darfAendern(fremd, { kuerzel: 'ben', rolle: 'mitarbeiter' }), false);
  assert.equal(darfAendern({ ...fremd, verantwortlich: 'ben' }, { kuerzel: 'ben', rolle: 'mitarbeiter' }), true);
  assert.equal(darfAendern(fremd, { kuerzel: 'chef', rolle: 'inhaber' }), true);
});

// -- Duplikaterkennung ------------------------------------------------------

test('Testfall 4: "Shop Logo austauschen" findet "Neues Logo in Shopify einbauen"', () => {
  const vorhanden = [aufgabe({ id: 'alt', titel: 'Neues Logo in Shopify einbauen' })];
  const treffer = findeDoppelgaenger('Shop Logo austauschen', vorhanden, { jetzt: JETZT });
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].eintrag.id, 'alt');
});

test('unähnliche Aufgaben werden nicht als Duplikat gemeldet', () => {
  const vorhanden = [aufgabe({ titel: 'Transporter zum TÜV bringen' })];
  assert.equal(findeDoppelgaenger('Newsletter für Oktober vorbereiten', vorhanden, { jetzt: JETZT }).length, 0);
});

test('lange erledigte Aufgaben tauchen nicht mehr als Duplikat auf', () => {
  const alt = aufgabe({ titel: 'Logo in Shopify einbauen', status: 'DONE', erledigtAm: '2026-01-01T00:00:00.000Z' });
  assert.equal(findeDoppelgaenger('Shop Logo austauschen', [alt], { jetzt: JETZT }).length, 0);
});

test('Ähnlichkeit ist symmetrisch und begrenzt', () => {
  const a = 'Preis von Nevada prüfen';
  const b = 'Nevada Preis kontrollieren';
  assert.equal(aehnlichkeit(a, b), aehnlichkeit(b, a));
  assert.ok(aehnlichkeit(a, b) > 0.3, 'erkennt dieselbe Sache');
  assert.equal(aehnlichkeit('', 'irgendwas'), 0);
});

// -- Analyse ---------------------------------------------------------------

const TEAM = [{ name: 'Ben', kuerzel: 'ben' }, { name: 'Ahmet', kuerzel: 'ahmet' }, { name: 'Thomas', kuerzel: 'thomas' }];

test('Testfall 1: "Logo im Shop austauschen" wird eine Aufgabe im Bereich Marketing/Online-Shop', () => {
  const v = analysiere('Logo im Shop austauschen', { mitarbeiter: TEAM, jetzt: JETZT, benutzer: { kuerzel: 'ahmet' } });
  assert.equal(v.typ, 'TASK');
  assert.ok(['Marketing', 'Online-Shop'].includes(v.bereich), `Bereich war ${v.bereich}`);
  assert.equal(v.verantwortlich, 'ahmet', 'ohne genannte Person: für mich selbst');
});

test('Testfall 2: "Ben soll morgen prüfen, ob die Muster angekommen sind" geht an Ben mit Fälligkeit morgen', () => {
  const v = analysiere('Ben soll morgen prüfen, ob die neuen Teppichmuster angekommen sind.', { mitarbeiter: TEAM, jetzt: JETZT });
  assert.equal(v.typ, 'TASK');
  assert.equal(v.verantwortlich, 'ben');
  assert.equal(v.faellig, tag(1));
  assert.ok(['Lager', 'Einkauf'].includes(v.bereich), `Bereich war ${v.bereich}`);
});

test('Testfall 3: "Neue Musterrollen stehen hinten links" wird eine Notiz im Lager', () => {
  const v = analysiere('Neue Musterrollen stehen hinten links.', { mitarbeiter: TEAM, jetzt: JETZT });
  assert.equal(v.typ, 'NOTE');
  assert.equal(v.bereich, 'Lager');
  assert.equal(v.sichtbarkeit, 'TEAM', 'Lagerinfo geht das Team an');
});

test('dringende Formulierung hebt die Priorität', () => {
  assert.equal(analysiere('Dringend beim Lieferanten anrufen', { mitarbeiter: TEAM, jetzt: JETZT }).prioritaet, 'URGENT');
});

test('Fälligkeiten: heute, morgen, Wochentag, Datum', () => {
  assert.equal(erkenneFaelligkeit('heute erledigen', JETZT).faellig, tag(0));
  assert.equal(erkenneFaelligkeit('morgen anrufen', JETZT).faellig, tag(1));
  assert.equal(erkenneFaelligkeit('am 30.09.2026 liefern', JETZT).faellig, '2026-09-30');
  assert.equal(erkenneFaelligkeit('kein Datum hier', JETZT), null);
});

test('Person wird nur erkannt, wenn sie im Team steht', () => {
  assert.equal(erkennePerson('Ben soll anrufen', TEAM).kuerzel, 'ben');
  assert.equal(erkennePerson('Herr Meier soll anrufen', TEAM), null);
});

test('mehrere Aufgaben in einem Satz werden vorgeschlagen, nicht automatisch geteilt', () => {
  const teile = teileAuf('Logo ändern, Vinylpreise kontrollieren und Newsletter einbauen');
  assert.equal(teile.length, 3);
  const v = analysiere('Logo ändern, Vinylpreise kontrollieren und Newsletter einbauen', { mitarbeiter: TEAM, jetzt: JETZT });
  assert.equal(v.mehrereAufgaben.length, 3);
  assert.equal(v.typ, 'TASK', 'bleibt zunächst eine Aufgabe - der Benutzer entscheidet');
});

// -- Speicher und Prüfregeln -----------------------------------------------

test('neuer Eintrag braucht nur einen Titel', () => {
  const e = baueEintrag({ titel: 'Kurz notiert' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  assert.equal(e.typ, 'TASK');
  assert.equal(e.status, 'INBOX');
  assert.equal(e.besitzer, 'ahmet');
  assert.equal(e.verlauf[0].was, 'erstellt');
  assert.throws(() => baueEintrag({ titel: '  ' }), /Titel/);
});

test('Statuswechsel landet im Verlauf, Erledigung setzt das Datum', () => {
  const e = baueEintrag({ titel: 'Preis ändern' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  aendere(e, { status: 'DONE' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  assert.equal(e.status, 'DONE');
  assert.ok(e.erledigtAm);
  aendere(e, { status: 'IN_PROGRESS' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  assert.equal(e.erledigtAm, null);
  assert.ok(e.verlauf.some(v => v.was === 'wieder geöffnet'));
});

test('Testfall 5: erst die geprüfte Wirklichkeit erledigt eine Aufgabe', () => {
  const e = baueEintrag({ titel: 'Nevada auf 23,95 € ändern', pruefTyp: 'AUTO', erfolgskriterium: 'Produktpreis = 23,95 €' }, { jetzt: JETZT });
  haltePruefungFest(e, { methode: 'Shopify-Preis gelesen', soll: '23.95', ist: '19.95', erfuellt: false, begruendung: 'Preis weicht ab' }, { jetzt: JETZT });
  assert.notEqual(e.status, 'DONE', 'falscher Wert darf nicht erledigen');

  haltePruefungFest(e, { methode: 'Shopify-Preis gelesen', soll: '23.95', ist: '23.95', erfuellt: true, begruendung: 'Preis stimmt' }, { jetzt: JETZT });
  assert.equal(e.status, 'DONE');
  assert.equal(e.pruefungen.length, 2);
  assert.ok(e.verlauf.some(v => v.was.includes('automatisch erledigt')));
});

test('Testfall 6: unklares Prüfergebnis führt in die Prüfung, nicht auf erledigt', () => {
  const e = baueEintrag({ titel: 'Logo sichtbar?', pruefTyp: 'AUTO' }, { jetzt: JETZT });
  haltePruefungFest(e, { methode: 'Seite gelesen', erfuellt: null, begruendung: 'Kein eindeutiger Treffer' }, { jetzt: JETZT });
  assert.equal(e.status, 'REVIEW');
  assert.equal(e.pruefungen[0].erfuellt, null);
});

test('SEMI_AUTO wird nie automatisch erledigt, sondern vorgelegt', () => {
  const e = baueEintrag({ titel: 'Text im Shop geändert?', pruefTyp: 'SEMI_AUTO' }, { jetzt: JETZT });
  haltePruefungFest(e, { methode: 'Seite gelesen', erfuellt: true, begruendung: 'Text gefunden' }, { jetzt: JETZT });
  assert.equal(e.status, 'REVIEW');
});

test('erledigte Aufgabe öffnet sich wieder, wenn der Sollzustand kippt', () => {
  const e = baueEintrag({ titel: 'Preis 23,95', pruefTyp: 'AUTO' }, { jetzt: JETZT });
  haltePruefungFest(e, { erfuellt: true, methode: 'gelesen' }, { jetzt: JETZT });
  assert.equal(e.status, 'DONE');
  haltePruefungFest(e, { erfuellt: false, methode: 'gelesen', ist: '25.00' }, { jetzt: JETZT });
  assert.equal(e.status, 'IN_PROGRESS');
  assert.ok(e.verlauf.some(v => v.was.includes('wieder geöffnet')));
});

test('Kommentare landen im Eintrag und im Verlauf', () => {
  const e = baueEintrag({ titel: 'Lieferant fragen' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  kommentiere(e, 'Lieferant angeschrieben', { benutzer: { kuerzel: 'ben' }, jetzt: JETZT });
  assert.equal(e.kommentare[0].wer, 'ben');
  assert.ok(e.verlauf.some(v => v.was === 'Kommentar hinzugefügt'));
  assert.throws(() => kommentiere(e, '   '), /Leerer/);
});

test('Datei wird atomar geschrieben und wieder gelesen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-org-'));
  const datei = dateiPfad(dir);
  const e = baueEintrag({ titel: 'Testeintrag' }, { jetzt: JETZT });
  schreib({ version: 1, bereiche: ['Lager'], eintraege: [e] }, datei);
  const zurueck = lies(datei);
  assert.equal(zurueck.eintraege.length, 1);
  assert.equal(zurueck.eintraege[0].titel, 'Testeintrag');
  // Fehlende Datei ergibt eine leere, aber gültige Struktur
  assert.deepEqual(lies(path.join(dir, 'gibtsnicht.json')).eintraege, []);
});

test('Statusnamen sind auf Deutsch hinterlegt', () => {
  assert.equal(STATUS_LABEL.WAITING, 'Warten auf');
  assert.equal(STATUS_LABEL.REVIEW, 'Prüfung');
});

test('Nebensätze sind keine zweite Aufgabe', () => {
  // "Ben soll morgen prüfen, ob die Muster angekommen sind" ist EIN Vorhaben.
  assert.deepEqual(teileAuf('Ben soll morgen prüfen, ob die neuen Teppichmuster angekommen sind.'), []);
  assert.deepEqual(teileAuf('Kunden anrufen, weil der Termin verschoben wurde'), []);
  // Drei echte Vorhaben bleiben drei.
  assert.equal(teileAuf('Logo ändern, Vinylpreise kontrollieren und Newsletter einbauen').length, 3);
});

test('aus einer Notiz wird eine Aufgabe - Text, Kommentare und Verlauf bleiben', () => {
  const e = baueEintrag({ typ: 'NOTE', titel: 'Vinylpreise wirken hoch', beschreibung: 'Gedanke vom Gespräch' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  kommentiere(e, 'Beim Lieferanten nachfragen', { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  aendere(e, { typ: 'TASK', status: 'INBOX' }, { benutzer: { kuerzel: 'ahmet' }, jetzt: JETZT });
  assert.equal(e.typ, 'TASK');
  assert.equal(e.beschreibung, 'Gedanke vom Gespräch');
  assert.equal(e.kommentare.length, 1);
  assert.ok(e.verlauf.some(v => v.was === 'Art geändert'));
  // Unsinnige Werte werden abgewiesen
  assert.throws(() => aendere(e, { typ: 'IRGENDWAS' }, {}), /typ/);
});
