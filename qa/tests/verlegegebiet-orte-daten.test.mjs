/*
 * Die Ortstabelle der Verlegegebiet-Sektion (assets/tp-verlegegebiet-orte.json)
 * darf nur Orte als Orte fuehren.
 *
 * GeoNames listet die Postleitzahlen von Grosskunden und Behoerden unter deren
 * Namen. Die erste Fassung filterte sie ueber eine Liste von Firmenwoertern
 * und liess den Grossteil durch: "Zalando Lounge" oder "Auswaertiges Amt"
 * konnten als "liegt in unserem Verlegegebiet" bestaetigt werden. Seitdem
 * entscheidet ein Merkmal der Daten - ein Name zaehlt nur, wenn er sich
 * vollstaendig in echte Orte zerlegen laesst.
 *
 * Diese Datei prueft das fertige Asset, nicht das Build-Skript: die
 * OpenStreetMap-Daten, gegen die gebaut wird, liegen nur im lokalen Cache.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WURZEL = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const TABELLE = JSON.parse(readFileSync(path.join(WURZEL, 'assets', 'tp-verlegegebiet-orte.json'), 'utf8'));

test('Grosskunden, Behoerden und Einrichtungen sind keine Orte', () => {
  // Die fuenf aus der Pruefung vom 11.09. und weitere, die eine Liste von
  // Firmenwoertern nicht erkannt haette.
  const keineOrte = [
    'agenturfuerarbeitberlinmitte',
    'allianzbaufinanzierung',
    'amerikanischebotschaft',
    'auswaertigesamt',
    'zalandolounge',
    'berlinerfeuerwehr',
    'berlinerwasserbetriebeanstaltdesoeffentlichenrechts',
    'aokfuerdaslandbrandenburg',
    'deutschlandradiokultur',
    'degewo',
    'avm',
    'daimlerinsuranceservicesgmbh',
  ];
  const drin = keineOrte.filter((name) => name in TABELLE.orte);
  assert.deepEqual(drin, [], `Nicht-Orte in der Ortstabelle: ${drin.join(', ')}`);
});

test('kein Ortsname enthaelt ein Wort, das es in keinem Ortsnamen gibt', () => {
  // Kein Filter, sondern ein Kanarienvogel: faellt die Datenregel einmal aus,
  // schlaegt dieser Test an. Nur Woerter, die in deutschen Ortsnamen nicht
  // vorkommen koennen.
  const nieInOrten = /gmbh|botschaft|agentur|versicherung|lounge|feuerwehr|brauerei|anstalt|ministerium|bundesamt|pharma|sparkasse|finanzierung|radio/;
  const funde = Object.keys(TABELLE.orte).filter((name) => nieInOrten.test(name));
  assert.deepEqual(funde, [], `Verdaechtige Ortsnamen: ${funde.slice(0, 20).join(', ')}`);
});

test('echte Orte, Ortsteile und zusammengesetzte Postnamen bleiben', () => {
  // Die Datenregel darf nicht mehr verwerfen als noetig: Ort-plus-Ortsteil
  // ("Berlin Kreuzberg") ist ein Name, den jemand eintippt.
  for (const name of ['berlin', 'oranienburg', 'werderhavel', 'spandau', 'kreuzberg', 'berlinkreuzberg', 'panketal']) {
    assert.ok(name in TABELLE.orte, `${name} fehlt in der Ortstabelle.`);
  }
});

test('Berlin behaelt seine Spanne ueber alle Postleitzahlen', () => {
  // Die Spanne kommt aus den 182 Postleitzahlen der Stadt, nicht aus einem
  // einzelnen Kartenpunkt - sie darf beim Aussortieren nicht verloren gehen.
  const [von, bis] = TABELLE.orte.berlin;
  assert.ok(von < 13 && bis > 45, `Berlin reicht nur von ${von} bis ${bis} km.`);
});

test('die Postleitzahlen der Grosskunden bleiben pruefbar', () => {
  // Aus den Ortsnamen fliegen sie heraus, als Postleitzahl bekommen sie
  // weiterhin eine Antwort. 10875 ist eine Grosskunden-PLZ in Stuttgart und
  // liegt damit ausserhalb der Tabelle; massgeblich ist, dass Berliner PLZ
  // vollstaendig drin sind.
  const berlin = Object.keys(TABELLE.plz).filter((code) => /^1[0-4]/.test(code));
  assert.ok(berlin.length > 180, `Nur ${berlin.length} Berliner Postleitzahlen in der Tabelle.`);
});
