import assert from 'node:assert/strict';
import test from 'node:test';
import { bereichVon, highlightBericht, highlightZeilen, leseZaehlung, liesHighlightStand, schreibeHighlightStand, zustand } from '../lib/highlights.mjs';
import { zeigeStatus } from '../scripts/social.mjs';
import { testDb, tmpDir } from './_hilfe.mjs';

/** Eine veroeffentlichte Instagram-Story aus einem Inhalt der angegebenen Quelle. */
function story(db, { quelle, typ = 'kundenprojekt', am, daten = {}, plattformen = ['instagram', 'facebook'], format = 'story' }) {
  const { id } = db.inhaltAnlegen({ quelle, typ, titel: `${quelle} ${am}`, einwilligung: true, daten });
  const b = db.beitragAnlegen({ inhalt_id: id, format, plattformen, text: 'x'.repeat(50), medien: [] });
  db.beitragAendern(b, { status: 'GEPLANT', geplant_am: am });
  db.beitragAendern(b, { status: 'IN_ARBEIT' });
  db.beitragAendern(b, { status: 'VEROEFFENTLICHT', veroeffentlicht_am: am, ergebnis: { instagram: { id: `ig${b}` } } });
  return b;
}

test('Bereich einer Story: Referenz, Baustelle, Laden; ausdruecklich gesetzter Bereich geht vor', () => {
  assert.equal(bereichVon({ quelle: 'referenz' }), 'Referenzen');
  assert.equal(bereichVon({ quelle: 'baustelle' }), 'Verlegung');
  assert.equal(bereichVon({ quelle: 'laden', typ: 'laden' }), 'Im Laden');
  assert.equal(bereichVon({ quelle: 'wissen', daten: { bereich: 'Muster' } }), 'Muster');
  assert.equal(bereichVon({ quelle: 'baustelle', daten: { bereich: 'Referenzen' } }), 'Referenzen');
  assert.equal(bereichVon({ quelle: 'shopify', typ: 'produkt_neu' }), null);
  assert.equal(bereichVon({ quelle: 'wissen', daten: { bereich: 'Quatsch' } }), null);
});

test('Zaehlung: das Titelbild zaehlt mit, eine 1 ist leer; Eingaben werden streng gelesen', () => {
  assert.equal(zustand(1), 'leer'); assert.equal(zustand(0), 'leer'); assert.equal(zustand(3), 'dünn'); assert.equal(zustand(4), 'ok'); assert.equal(zustand(undefined), 'unbekannt');
  assert.deepEqual(leseZaehlung(['Verlegung=3', 'im laden=1']), { Verlegung: 3, 'Im Laden': 1 });
  assert.throws(() => leseZaehlung(['Angebote=2']), /Unbekannter Bereich/);
  assert.throws(() => leseZaehlung(['Referenzen']), /Bereich=Zahl/);
});

test('Stand: Zaehlung und einsortierte Storys werden fortgeschrieben, nicht ueberschrieben', (t) => {
  const dir = tmpDir(t);
  assert.equal(liesHighlightStand(dir), null);
  schreibeHighlightStand({ Verlegung: 3, Referenzen: 1 }, { dir, jetzt: new Date('2026-10-16T10:00:00Z') });
  const s = schreibeHighlightStand({}, { dir, einsortiert: ['12', '9', 'x'], jetzt: new Date('2026-10-17T10:00:00Z') });
  assert.equal(s.geprueft, '2026-10-16T10:00:00.000Z', 'nur einsortiert: der Zaehlstand bleibt');
  assert.deepEqual(s.bereiche, { Verlegung: 3, Referenzen: 1 }); assert.deepEqual(s.einsortiert, [9, 12]);
  assert.deepEqual(liesHighlightStand(dir), s);
});

test('Bericht: leere Bereiche bekommen alle passenden Storys, volle nur neue; ohne Story eine Aufgabe fuer die Redaktion', (t) => {
  const db = testDb(t);
  const alteRef = story(db, { quelle: 'referenz', typ: 'referenz', am: '2026-10-07T10:00:00.000Z' });
  const neueRef = story(db, { quelle: 'referenz', typ: 'referenz', am: '2026-10-15T10:00:00.000Z' });
  story(db, { quelle: 'baustelle', am: '2026-10-05T10:00:00.000Z' });
  const neueBaustelle = story(db, { quelle: 'baustelle', am: '2026-10-16T10:00:00.000Z' });
  const sortiert = story(db, { quelle: 'baustelle', am: '2026-10-16T11:00:00.000Z' });
  story(db, { quelle: 'shopify', typ: 'produkt_neu', am: '2026-10-14T10:00:00.000Z' });
  story(db, { quelle: 'referenz', typ: 'referenz', am: '2026-10-14T10:00:00.000Z', format: 'feed' });
  story(db, { quelle: 'referenz', typ: 'referenz', am: '2026-10-14T10:00:00.000Z', plattformen: ['facebook'] });

  const stand = { geprueft: '2026-10-10T10:00:00.000Z', bereiche: { Verlegung: 5, Referenzen: 1, 'Im Laden': 1, Muster: 1, Bewertungen: 1 }, einsortiert: [sortiert] };
  const b = highlightBericht(db, { stand, jetzt: new Date('2026-10-16T12:00:00Z') });
  const je = Object.fromEntries(b.bereiche.map(x => [x.name, x]));
  assert.deepEqual(b.leer, ['Referenzen', 'Im Laden', 'Muster', 'Bewertungen']);
  assert.deepEqual(je.Referenzen.einsortieren.map(s => s.beitrag), [neueRef, alteRef], 'leer: auch die alte Story, neueste zuerst');
  assert.deepEqual(je.Verlegung.einsortieren.map(s => s.beitrag), [neueBaustelle], 'voll: nur seit der Zaehlung, einsortierte nicht');
  assert.equal(je.Referenzen.redaktion, null, 'es gibt Storys - erst einsortieren');
  assert.match(je.Muster.redaktion, /wissen-anlegen --bereich Muster/);
  assert.match(je['Im Laden'].redaktion, /Inhaber schickt/);
  assert.equal(b.veraltet, false); assert.equal(b.alterTage, 6);
  assert.match(b.inhaber.join('\n'), /„Referenzen“.*Storys vom 15\.10\., 07\.10\./);

  const z = highlightZeilen(b);
  assert.equal(z[0], 'Highlights (Stand 10.10.)');
  assert.ok(z.includes('  Referenzen: leer – 2 Story/s zum Einsortieren'));
  assert.ok(z.includes('  Verlegung: 4 Storys – 1 Story/s zum Einsortieren'));
  assert.ok(z.includes('  Bewertungen: leer – Story fehlt'));
});

test('Bericht ohne Zaehlung oder mit altem Stand verlangt eine neue Zaehlung; Status zeigt die Highlights', (t) => {
  const db = testDb(t);
  const ohne = highlightBericht(db, { stand: null, jetzt: new Date('2026-10-16T12:00:00Z') });
  assert.equal(ohne.veraltet, true); assert.match(highlightZeilen(ohne)[0], /noch nie gezählt/);
  const alt = highlightBericht(db, { stand: { geprueft: '2026-10-01T10:00:00.000Z', bereiche: {} }, jetzt: new Date('2026-10-16T12:00:00Z') });
  assert.equal(alt.veraltet, true); assert.match(highlightZeilen(alt)[0], /neu zählen/);
  const zeilen = [];
  zeigeStatus(db, { schreibe: z => zeilen.push(z), highlights: alt, jetzt: new Date('2026-10-16T12:00:00Z') });
  assert.match(zeilen[0], /^Highlights/); assert.ok(zeilen.includes('Neue Inhalte'));
});
