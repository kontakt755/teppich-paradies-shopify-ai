/*
  Tests fuer den Teppichboden-Bedarfsrechner (Bodenwissen, Rechner L5).

  Warum ohne scripts/boden-rechner.mjs: assets/tp-boden-rechner.js ist ein
  Browser-Skript ohne Build-Schritt und liegt in assets/, weil Shopify nur
  diesen Ordner als Theme-Asset ausliefert - ein Import aus scripts/ waere
  im Shop zur Laufzeit ein 404. Eine zweite Kopie der Rechenlogik unter
  scripts/ waere damit keine "gespiegelte" Quelle, sondern eine echte
  Dopplung, die stillschweigend auseinanderlaufen kann (genau das Risiko,
  das die Aufgabenstellung vermeiden will).

  Stattdessen gilt hier dasselbe, bereits im Repository etablierte Muster
  wie bei assets/tp-masstepich-rechnung.js / qa/tests/masstepich-rechnung.test.mjs:
  Das Asset ist eine reine UMD-Funktionssammlung, haengt sich unter Node an
  globalThis (kein DOM noetig fuer den Rechenteil) und wird hier per
  createRequire direkt geladen. EINE Quelle, im Browser wie im Test.

  Rechenregeln und ihre Herkunft: docs/bodenwissen/RECHNER.md. Die ersten
  beiden Testfaelle sind die Rechenbeispiele aus den freigegebenen Artikeln
  selbst (teppichboden-richtig-ausmessen.html und
  rollenbreite-und-bahnen-planen.html) - stimmen die Zahlen hier nicht mit
  dem Artikel ueberein, ist das ein echter Fehler, kein Testfehler.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../../assets/tp-boden-rechner.js');
const R = globalThis.TPBodenRechner;

test('Rechenbeispiel aus dem Ausmess-Artikel: 350 x 550 cm passt gerade in die 400er Rolle', () => {
  // Quelle: teppichboden-richtig-ausmessen.html, Abschnitt "Rechenbeispiel":
  // 400 cm Rollenbreite, 570 cm Länge (550 + 20 Zugabe), 22,8 m² Bestellfläche.
  const ergebnis = R.bedarf({ breite: 350, laenge: 550, zugabe: 20, rollenbreiten: [400, 500] });

  assert.equal(ergebnis.raumflaecheM2, 19.25);

  const zeile400 = ergebnis.ergebnisse.find((z) => z.rollenbreiteCm === 400);
  assert.equal(zeile400.passt, true);
  assert.equal(zeile400.gedreht, false);
  assert.equal(zeile400.benoetigteLaengeCm, 570);
  assert.equal(zeile400.bestellflaecheM2, 22.8);
  assert.equal(zeile400.verschnittM2, 3.55);

  // Die 500er Rolle bringt hier laut Artikel keinen Vorteil - beide
  // Ausrichtungen sind schlechter oder gleich der 400er (350 <= 500 passt
  // ungedreht, gedreht scheitert 550 > 500, also bleibt die 400er die
  // Empfehlung mit dem kleineren Verschnitt).
  assert.equal(ergebnis.empfehlungRollenbreiteCm, 400);
});

test('Rechenbeispiel aus dem Bahnen-Artikel: 350 x 480 cm lohnt gedreht auf der 500er Rolle', () => {
  // Quelle: rollenbreite-und-bahnen-planen.html, "Beispiel 2": gedreht liegt
  // die 480-cm-Seite quer zur 500er Rolle, die Bahn wird kuerzer (350 + 20 =
  // 370 cm) - weniger Verschnitt als die 400er Rolle ungedreht.
  const ergebnis = R.bedarf({ breite: 350, laenge: 480, zugabe: 20, rollenbreiten: [400, 500] });

  const zeile500 = ergebnis.ergebnisse.find((z) => z.rollenbreiteCm === 500);
  assert.equal(zeile500.passt, true);
  assert.equal(zeile500.gedreht, true);
  assert.equal(zeile500.benoetigteLaengeCm, 370);
  assert.equal(zeile500.bestellflaecheM2, 18.5);

  const zeile400 = ergebnis.ergebnisse.find((z) => z.rollenbreiteCm === 400);
  assert.equal(zeile400.passt, true);
  assert.equal(zeile400.gedreht, false);
  assert.equal(zeile400.bestellflaecheM2, 20);

  // Die 500er-Variante hat den kleineren Verschnitt und gewinnt die
  // Gesamtempfehlung ueber beide Rollenbreiten hinweg.
  assert.equal(ergebnis.empfehlungRollenbreiteCm, 500);
});

test('Raum passt nur quer (gedreht) in eine einzige Rollenbreite', () => {
  // 300 cm breit passt in keine 250er Rolle, aber 900 cm Laenge auch nicht -
  // gedreht (300 als "Laenge", 900 gegen die Rolle) scheitert ebenfalls.
  // Ein Fall, der NUR gedreht passt: der Raum ist 520 cm breit (zu breit
  // fuer 500 cm ungedreht) und 300 cm lang (passt gedreht in 500 cm).
  const ergebnis = R.bedarf({ breite: 520, laenge: 300, zugabe: 10, rollenbreiten: [500] });
  const zeile = ergebnis.ergebnisse[0];

  assert.equal(zeile.passt, true);
  assert.equal(zeile.gedreht, true, 'nur gedreht passt die 300-cm-Seite in die 500er Rolle');
  // Laenge der Bahn = ehemalige Breite (520) + Zugabe (10) = 530, bereits voll.
  assert.equal(zeile.benoetigteLaengeCm, 530);
  assert.equal(zeile.bestellflaecheM2, 26.5);
});

test('Raum braucht zwei Bahnen: keine Ausrichtung passt in eine Rollenbreite', () => {
  // 600 x 650 cm auf einer 400-cm-Rolle: 600 > 400 und 650 > 400 in beiden
  // Richtungen - es bleibt bei einer Naht, unabhaengig von der Ausrichtung.
  const ergebnis = R.bedarf({ breite: 600, laenge: 650, zugabe: 20, rollenbreiten: [400] });
  const zeile = ergebnis.ergebnisse[0];

  assert.equal(zeile.passt, false);
  assert.equal(zeile.bahnenAnzahl, 2);
  assert.equal(ergebnis.empfehlungRollenbreiteCm, null, 'keine Rollenbreite passt nahtlos - keine Empfehlung');
});

test('Zugabe wirkt sich auf Rollenlaenge und Bestellflaeche aus', () => {
  // Raumbreite 400 cm (= Rollenbreite, quer) ist absichtlich groesser als
  // die Raumlaenge 300 cm: die kuerzere Seite gewinnt ohnehin die
  // Ausrichtung (weniger Verschnitt), damit bleibt "gedreht" hier immer
  // false und einzig die Zugabe aendert sich zwischen den beiden Laeufen.
  const mitZehn = R.bedarf({ breite: 400, laenge: 300, zugabe: 10, rollenbreiten: [400] });
  const mitZwanzig = R.bedarf({ breite: 400, laenge: 300, zugabe: 20, rollenbreiten: [400] });

  const zeileZehn = mitZehn.ergebnisse[0];
  const zeileZwanzig = mitZwanzig.ergebnisse[0];

  assert.equal(zeileZehn.gedreht, false);
  assert.equal(zeileZwanzig.gedreht, false);
  assert.equal(zeileZehn.benoetigteLaengeCm, 310);
  assert.equal(zeileZwanzig.benoetigteLaengeCm, 320);
  assert.ok(
    zeileZwanzig.bestellflaecheM2 > zeileZehn.bestellflaecheM2,
    'mehr Zugabe muss eine groessere Bestellflaeche ergeben',
  );
  assert.equal(zeileZehn.bestellflaecheM2, 12.4);
  assert.equal(zeileZwanzig.bestellflaecheM2, 12.8);
});

test('Rollenlaenge wird ehrlich auf volle 10 cm aufgerundet, nicht abgeschnitten', () => {
  // 350 cm Breite (quer) ist groesser als 333 cm Laenge, die kuerzere Seite
  // gewinnt also erneut die Ausrichtung: 333 + 20 Zugabe = 353 cm muss auf
  // 360 cm aufrunden - niemals auf 350 abschneiden, sonst fehlt Material.
  const ergebnis = R.bedarf({ breite: 350, laenge: 333, zugabe: 20, rollenbreiten: [400] });
  const zeile = ergebnis.ergebnisse[0];
  assert.equal(zeile.gedreht, false);
  assert.equal(zeile.benoetigteLaengeCm, 360);
  assert.equal(R.rundeAufZehn(353), 360);
  assert.equal(R.rundeAufZehn(350), 350, 'ein bereits glatter Wert wird nicht weiter aufgerundet');
});

test('Verschnittprozent stimmt: Bestellflaeche minus Raumflaeche, relativ zur Raumflaeche', () => {
  // Raum 300 x 200 cm = 6 m². Die kuerzere Seite (200) gewinnt die
  // Ausrichtung: Rolle 400 cm, Laenge 200 + 20 Zugabe = 220 cm,
  // Bestellflaeche 4 x 2,2 = 8,8 m². Verschnitt 2,8 m² = 46,666...% -> 46,7 %.
  const ergebnis = R.bedarf({ breite: 300, laenge: 200, zugabe: 20, rollenbreiten: [400] });
  const zeile = ergebnis.ergebnisse[0];

  assert.equal(zeile.gedreht, false);
  assert.equal(zeile.bestellflaecheM2, 8.8);
  assert.equal(zeile.verschnittM2, 2.8);
  assert.equal(zeile.verschnittProzent, 46.7);

  // Gegenprobe von Hand, unabhaengig von der internen Rundung.
  const erwartetesProzent = Math.round(((8.8 - 6) / 6) * 1000) / 10;
  assert.equal(zeile.verschnittProzent, erwartetesProzent);
});

test('ungueltige Eingaben werfen statt eine erfundene Zahl zu liefern', () => {
  assert.throws(() => R.bedarf({ breite: 0, laenge: 400, zugabe: 20, rollenbreiten: [400] }), RangeError);
  assert.throws(() => R.bedarf({ breite: 300, laenge: 400, zugabe: 15, rollenbreiten: [400] }), RangeError);
  assert.throws(() => R.bedarf({ breite: 300, laenge: 400, zugabe: 20, rollenbreiten: [] }), RangeError);
  assert.throws(() => R.bedarf({ breite: 300, laenge: 400, zugabe: 20, rollenbreiten: [0, -5] }), RangeError);
});
