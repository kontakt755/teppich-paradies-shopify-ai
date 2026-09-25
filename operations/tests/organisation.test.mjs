import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sortiere, rang, passtZuAnsicht, darfSehen, darfAendern, istUeberfaellig,
  aehnlichkeit, findeDoppelgaenger, alsTag, STATUS_LABEL, istPerson, istTechnisch, istTeamarbeit,
} from '../lib/organisation.mjs';
import { analysiere, erkenneFaelligkeit, erkennePerson, teileAuf, ausListe } from '../lib/organisation-analyse.mjs';
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

test('Groß- und Kleinschreibung trennt keine Person von ihren Aufgaben', () => {
  const notiz = { typ: 'NOTE', besitzer: 'Inhaber', sichtbarkeit: 'PRIVAT', fuer: [] };
  assert.equal(darfSehen(notiz, { kuerzel: 'inhaber' }), true, '"inhaber" ist derselbe wie "Inhaber"');
  assert.equal(darfSehen(notiz, { kuerzel: ' INHABER ' }), true, 'Leerzeichen und Großschreibung egal');
  assert.equal(darfSehen(notiz, { kuerzel: 'ben' }), false, 'andere Person bleibt außen vor');

  const aufgabe = { besitzer: 'Ahmet', verantwortlich: 'BEN', sichtbarkeit: 'TEAM' };
  assert.equal(darfAendern(aufgabe, { kuerzel: 'ben', rolle: 'mitarbeiter' }), true);
});

test('Liste aus ChatGPT oder von einem Zettel wird zu mehreren Vorschlägen', async () => {
  const { ausListe } = await import('../lib/organisation-analyse.mjs');
  const text = `## Offene Aufgaben
- Logo im Shop austauschen
- [ ] Vinylpreise beim Lieferanten prüfen
3) Newsletter für Oktober vorbereiten

Ben soll die Tarkett-Muster bestellen`;
  const v = ausListe(text, { mitarbeiter: [{ name: 'Ben', kuerzel: 'ben' }], jetzt: JETZT });
  assert.equal(v.length, 4, 'Überschrift und Leerzeile fallen weg');
  assert.deepEqual(v.map(x => x.titel), [
    'Logo im Shop austauschen',
    'Vinylpreise beim Lieferanten prüfen',
    'Newsletter für Oktober vorbereiten',
    'Ben soll die Tarkett-Muster bestellen',
  ]);
  assert.equal(v[3].verantwortlich, 'ben', 'Person wird je Zeile erkannt');
  assert.equal(ausListe('', {}).length, 0);
});

test('Zeilen, die auf eine Tätigkeit enden, sind Aufgaben - nicht Notizen', async () => {
  const { erkenneTyp } = await import('../lib/organisation-analyse.mjs');
  for (const zeile of ['Shopify-Zugang einrichten', 'Google-Bewertungen beantworten', 'Transporter zum TÜV anmelden', 'Preise kontrollieren']) {
    assert.equal(erkenneTyp(zeile).typ, 'TASK', zeile);
  }
  // Feststellungen bleiben Notizen
  assert.equal(erkenneTyp('Neue Musterrollen stehen hinten links').typ, 'NOTE');
  assert.equal(erkenneTyp('Artikelnummer beim Lieferanten wurde geändert').typ, 'NOTE');
});

test('lange Beschreibungen verhindern die Duplikatwarnung nicht mehr', () => {
  const vorhanden = [{
    typ: 'TASK', status: 'PLANNED', titel: 'Shopify-Zugang einrichten (Token)',
    beschreibung: 'Ohne Zugang aktualisiert sich im Dashboard nichts von selbst - Bestellungen, Kunden, Lexikon und Kennzahlen altern. Auf dem Schreibtisch die Einrichtung starten, Token einfügen, fertig.',
  }];
  const treffer = findeDoppelgaenger('Shopify-Zugang einrichten', vorhanden, { jetzt: JETZT });
  assert.equal(treffer.length, 1, 'fast gleicher Titel muss gefunden werden');
  assert.ok(treffer[0].wert > 0.6);
});

test('wiederkehrende Aufgabe: nach dem Abhaken steht der nächste Termin fest', async () => {
  const { naechsterTermin, faelligeWiederholungen } = await import('../lib/organisation.mjs');
  assert.equal(naechsterTermin('monatlich', new Date('2026-09-25T10:00:00')), '2026-10-25');
  assert.equal(naechsterTermin('vierwoechentlich', new Date('2026-09-25T10:00:00')), '2026-10-23');
  assert.equal(naechsterTermin('gibtsnicht', new Date()), null);

  const e = baueEintrag({ titel: 'Google-Bewertungen prüfen', wiederholung: { regel: 'monatlich', naechsteFaelligkeit: null, zuletztErzeugt: null } }, { jetzt: JETZT });
  aendere(e, { status: 'DONE' }, { jetzt: JETZT });
  assert.equal(e.wiederholung.naechsteFaelligkeit, '2026-10-25');
  // Noch nicht fällig
  assert.equal(faelligeWiederholungen([e], { jetzt: JETZT }).length, 0);
  assert.equal(faelligeWiederholungen([e], { jetzt: new Date('2026-10-25T08:00:00') }).length, 1);
});

test('Wiederholung erzeugt eine neue Aufgabe und läuft nicht doppelt', async () => {
  const { erzeugeWiederholungen } = await import('../lib/organisation-speicher.mjs');
  const e = baueEintrag({ titel: 'Shoppreise kontrollieren', wiederholung: { regel: 'vierwoechentlich', naechsteFaelligkeit: null, zuletztErzeugt: null } }, { jetzt: JETZT });
  aendere(e, { status: 'DONE' }, { jetzt: JETZT });
  const daten = { version: 1, bereiche: [], eintraege: [e] };

  const spaeter = new Date('2026-10-23T08:00:00');
  const neu = erzeugeWiederholungen(daten, { jetzt: spaeter });
  assert.equal(neu.length, 1);
  assert.equal(neu[0].status, 'PLANNED');
  assert.equal(neu[0].faellig, '2026-10-23');
  assert.ok(neu[0].verlauf.some(v => v.wer === 'Wiederholung'));
  // Zweiter Lauf am selben Tag erzeugt nichts Neues
  assert.equal(erzeugeWiederholungen(daten, { jetzt: spaeter }).length, 0);
  assert.equal(daten.eintraege.length, 2);
});

test('Anhänge: erlaubte Typen, Größengrenze, sichere Dateinamen', async () => {
  const { speichereAnhang, sichererName, anhangPfad, ANHANG_MAX_BYTES } = await import('../lib/organisation-speicher.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-anhang-'));
  const e = baueEintrag({ titel: 'Mit Foto' }, { jetzt: JETZT });

  const a = speichereAnhang(e, { name: 'Muster foto.JPG', typ: 'image/jpeg', daten: Buffer.from('bild').toString('base64') }, { dir, jetzt: JETZT });
  assert.equal(a.datei, 'Muster foto.jpg');
  assert.equal(e.anhaenge.length, 1);
  assert.ok(e.verlauf.some(v => v.was.includes('Anhang')));
  assert.ok(fs.existsSync(path.join(dir, 'organisation', 'anhaenge', e.id, a.datei)));

  // Zweite Datei mit gleichem Namen überschreibt nichts
  const b = speichereAnhang(e, { name: 'Muster foto.JPG', typ: 'image/jpeg', daten: Buffer.from('zweites').toString('base64') }, { dir, jetzt: JETZT });
  assert.notEqual(b.datei, a.datei);

  // Pfadausbruch im Dateinamen wird entschärft
  assert.equal(sichererName('../../etc/passwd', 'application/pdf'), 'passwd.pdf');
  assert.throws(() => anhangPfad(e.id, '../../../etc/passwd', dir), /Ungültig/);

  // Nicht erlaubte Typen und zu große Dateien
  assert.throws(() => speichereAnhang(e, { name: 'x.exe', typ: 'application/x-msdownload', daten: 'AA==' }, { dir }), /nicht erlaubt/);
  const zuGross = Buffer.alloc(ANHANG_MAX_BYTES + 10).toString('base64');
  assert.throws(() => speichereAnhang(e, { name: 'gross.pdf', typ: 'application/pdf', daten: zuGross }, { dir }), /zu groß/);
  assert.throws(() => speichereAnhang(e, { name: 'leer.pdf', typ: 'application/pdf', daten: '' }, { dir }), /leer/);
});

test('Geschäftliches geht ins Team, Technik zu mir', async () => {
  const { analysiere } = await import('../lib/organisation-analyse.mjs');
  const opt = { mitarbeiter: TEAM, jetzt: JETZT, benutzer: { kuerzel: 'tristan' } };

  // Bestellungen, Kunden, Lieferanten: niemand persönlich, sondern Team
  for (const satz of ['Muster beim Lieferanten bestellen', 'Kunden zurückrufen wegen Reklamation', 'Lagerbestand nachzählen']) {
    const v = analysiere(satz, opt);
    assert.equal(v.verantwortlich, null, satz);
  }
  // Technik bleibt bei mir
  for (const satz of ['Dashboard-Skript anpassen', 'Produktseite im Shop korrigieren']) {
    const v = analysiere(satz, opt);
    assert.equal(v.verantwortlich, 'tristan', satz);
  }
  // Eine genannte Person schlägt die Regel immer
  assert.equal(analysiere('Ben soll den Lagerbestand nachzählen', opt).verantwortlich, 'ben');
});

test('Liste aus ChatGPT: Titel, Erklaerung und Bereich kommen getrennt an', () => {
  const text = [
    '## Offene Punkte',
    '- [Online-Shop] Produktbilder ergänzen :: 45 Produkte ohne Bild. Fertig, wenn die Liste leer ist.',
    '- [Kunden] Frau Meier zurückrufen :: will Muster in Beige',
    '- Preisformel prüfen',
    '    Der Faktor 100 war falsch, danach alle Kollektionen gegenprüfen.',
  ].join('\n');

  const v = ausListe(text, { benutzer: { kuerzel: 'chef' } });
  assert.equal(v.length, 3, 'Überschrift und eingerückte Zeile werden nicht zu eigenen Aufgaben');

  assert.equal(v[0].titel, 'Produktbilder ergänzen');
  assert.equal(v[0].bereich, 'Online-Shop');
  assert.match(v[0].beschreibung, /45 Produkte ohne Bild/);
  assert.equal(v[0].verantwortlich, 'chef', 'Shop-Arbeit gehört dem, der die Technik macht');

  assert.equal(v[1].bereich, 'Kunden');
  assert.equal(v[1].verantwortlich, null, 'Kundenarbeit geht ins Team');

  // Eingerückte Folgezeile erklärt die Aufgabe darüber
  assert.equal(v[2].titel, 'Preisformel prüfen');
  assert.match(v[2].beschreibung, /Faktor 100/);
});

test('Ansicht "offen" zeigt alles Unerledigte, auch ohne Termin und Priorität', () => {
  const jetzt = new Date('2026-09-25T10:00:00Z');
  const schlicht = { typ: 'TASK', status: 'PLANNED', prioritaet: 'NORMAL', faellig: null };
  assert.equal(passtZuAnsicht(schlicht, 'fokus', jetzt), false, 'Fokus blendet sie aus …');
  assert.equal(passtZuAnsicht(schlicht, 'offen', jetzt), true, '… "Alles Offene" nicht');
  assert.equal(passtZuAnsicht({ ...schlicht, status: 'DONE' }, 'offen', jetzt), false);
});

test('Team-Bereiche sind Kunden, Bestellungen und kleine Aufträge - nichts aus Shop oder Website', () => {
  for (const b of ['Kunden', 'Bestellungen', 'Angebote / Lexware', 'Baustelle', 'Laden']) {
    assert.equal(istTeamarbeit(b), true, `${b} gehört ins Team`);
    assert.equal(istTechnisch(b), false);
  }
  for (const b of ['Website & KI', 'Online-Shop']) {
    assert.equal(istTeamarbeit(b), false, `${b} hat im Team nichts zu suchen`);
    assert.equal(istTechnisch(b), true);
  }
  // Einkauf, Lager & Co. sind weder Technik noch Tagesgeschäft des Teams
  assert.equal(istTeamarbeit('Lager'), false);
  assert.equal(istTechnisch('Lager'), false);
});
