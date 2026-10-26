import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sichern, alteSicherungenAufraeumen, vorhandeneQuellen, SICHERUNGSPFADE, NICHT_GESICHERT, kopieAblegen, kopieVermerken, parseArgs } from '../scripts/sicherung.mjs';
import { betriebszustand } from '../lib/betriebszustand.mjs';
import { oeffne } from '../../social/lib/db.mjs';
import { sichereDatenbank } from '../../social/lib/ablauf.mjs';
import { liesHighlightStand, schreibeHighlightStand } from '../../social/lib/highlights.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sicherung-'));
}

function beispielPrivatDir() {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: { '1::1': { status: 'bestellt' } } }));
  fs.writeFileSync(path.join(dir, 'muster-druckliste.json'), JSON.stringify({ schema: 1, eintraege: [{ id: 'test-druckauftrag', status: 'in_druck' }] }));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'lexikon', 'lexikon.json'), '[]');
  fs.mkdirSync(path.join(dir, 'kennzahlen'));
  fs.writeFileSync(path.join(dir, 'kennzahlen', 'shop-snapshot.json'), '{}');
  return dir;
}

test('vorhandeneQuellen: nur tatsaechlich existierende Pfade', () => {
  const dir = beispielPrivatDir();
  const gefunden = vorhandeneQuellen(dir);
  assert.ok(gefunden.includes('auftragsstatus.json'));
  assert.ok(gefunden.includes('lexikon'));
  assert.ok(!gefunden.includes('einkauf-klaerung'));
});

test('sichern: schreibt <datum>.tar.gz mit dem Auftragsstatus darin', () => {
  const dir = beispielPrivatDir();
  const ziel = path.join(dir, 'sicherungen');
  const jetzt = new Date('2026-09-23T06:00:00.000Z');

  const ergebnis = sichern({ privatDir: dir, ziel, jetzt });

  assert.equal(ergebnis.archiv, path.join(ziel, '2026-09-23.tar.gz'));
  assert.ok(fs.existsSync(ergebnis.archiv));
  assert.ok(ergebnis.quellen.includes('auftragsstatus.json'));
  assert.ok(ergebnis.uebersprungen.includes('bestelluebersicht'));
  assert.equal(fs.statSync(ergebnis.archiv).mode & 0o777, 0o600);

  // Inhalt tatsaechlich lesbar und der Auftragsstatus tatsaechlich drin -
  // das ist die eine Datei, die bei einem Festplattenschaden sonst weg waere.
  const liste = execFileSync('tar', ['-tzf', ergebnis.archiv], { encoding: 'utf8' });
  assert.match(liste, /auftragsstatus\.json/);
  assert.match(liste, /lexikon\/lexikon\.json/);

  const entpackt = tmpDir();
  execFileSync('tar', ['-xzf', ergebnis.archiv, '-C', entpackt]);
  const inhalt = JSON.parse(fs.readFileSync(path.join(entpackt, 'auftragsstatus.json'), 'utf8'));
  assert.equal(inhalt.positionen['1::1'].status, 'bestellt');
  const druckliste = JSON.parse(fs.readFileSync(path.join(entpackt, 'muster-druckliste.json'), 'utf8'));
  assert.equal(druckliste.eintraege[0].status, 'in_druck', 'auch noch ungepruefte Druckauftraege sind wiederherstellbar');
});

test('unlesbares Archiv laesst vorhandene Sicherung und Erfolgsbeleg unveraendert', () => {
  const dir = beispielPrivatDir();
  const jetzt = new Date('2026-10-23T08:00:00Z');
  const { archiv } = sichern({ privatDir: dir, jetzt });
  const alt = fs.readFileSync(archiv);
  const beleg = fs.readFileSync(path.join(dir, 'sicherungsstand.json'));
  const tar = (_befehl, args) => {
    if (args[0] === '-czf') fs.writeFileSync(args[1], 'beschaedigtes Archiv');
    else throw new Error('Archiv kann nicht gelesen werden');
  };
  assert.throws(() => sichern({ privatDir: dir, jetzt, tar }), /nicht gelesen/);
  assert.deepEqual(fs.readFileSync(archiv), alt);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'sicherungsstand.json')), beleg);
  assert.ok(!fs.readdirSync(path.dirname(archiv)).some(n => n.endsWith('.tmp')));
});

test('lesbares, aber unvollstaendiges Archiv gilt nicht als Erfolg', () => {
  const dir = beispielPrivatDir();
  const tar = (_befehl, args) => {
    if (args[0] === '-czf') fs.writeFileSync(args[1], 'falsches Archiv');
    else return 'kennzahlen/\n';
  };
  assert.throws(() => sichern({ privatDir: dir, jetzt: new Date('2026-10-23T08:00:00Z'), tar }), /unvollstaendig/);
  assert.ok(!fs.existsSync(path.join(dir, 'sicherungsstand.json')));
});

test('taeglicher Solltermin wird schon vor 48 Stunden als verpasst erkannt', () => {
  const dir = beispielPrivatDir();
  const f = path.join(dir, 'sicherungsstand.json');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-21T20:36:00Z' }));
  const r = betriebszustand(dir, { jetzt: new Date('2026-10-23T08:00:00Z') }).sicherung;
  assert.equal(r.status, 'alt');
  assert.equal(r.grund, 'taeglicher-solltermin-verpasst');
  assert.equal(r.erwartetFuer, '2026-10-22');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-22T20:36:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-23T08:00:00Z') }).sicherung.status, 'ok');
});

test('Solltermin hat eine halbe Stunde Laufzeit und folgt Berlin auch beim Winterzeitwechsel', () => {
  const dir = beispielPrivatDir();
  const f = path.join(dir, 'sicherungsstand.json');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-24T20:36:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-25T21:59:59Z') }).sicherung.status, 'ok');
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-25T22:00:00Z') }).sicherung.status, 'alt');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-25T21:36:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-26T08:00:00Z') }).sicherung.status, 'ok');
});

test('ein morgendlicher Anmeldelauf verdeckt keinen ausgefallenen Abendlauf', () => {
  const dir = beispielPrivatDir();
  const f = path.join(dir, 'sicherungsstand.json');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-22T06:00:00Z' }));
  for (const zeit of ['2026-10-22T21:10:00Z', '2026-10-23T08:00:00Z']) {
    assert.equal(betriebszustand(dir, { jetzt: new Date(zeit) }).sicherung.status, 'alt');
  }
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-23T06:00:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-23T08:00:00Z') }).sicherung.status, 'ok');
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-23T21:10:00Z') }).sicherung.status, 'alt');
});

test('sichern: wirft eine klare Meldung, wenn gar keine Quelle existiert', () => {
  const dir = tmpDir(); // leer
  assert.throws(() => sichern({ privatDir: dir, ziel: path.join(dir, 'sicherungen') }), /Keine Betriebsdaten/);
});

test('sichern: SICHERUNGSPFADE enthaelt auftragsstatus.json (der einzige unwiederbringliche Teil)', () => {
  assert.ok(SICHERUNGSPFADE.includes('auftragsstatus.json'));
  assert.ok(SICHERUNGSPFADE.includes('muster-packen.json'));
  assert.ok(SICHERUNGSPFADE.includes('bestellmarken.json'));
});

test('alteSicherungenAufraeumen: loescht nur Archive aelter als die Frist, laesst fremde Dateien in Ruhe', () => {
  const ziel = tmpDir();
  fs.writeFileSync(path.join(ziel, '2026-08-01.tar.gz'), 'alt');
  fs.writeFileSync(path.join(ziel, '2026-09-20.tar.gz'), 'neu');
  fs.writeFileSync(path.join(ziel, 'notizen.txt'), 'nicht anfassen');

  const { geloescht } = alteSicherungenAufraeumen({ ziel, aufbewahrenTage: 30, jetzt: new Date('2026-09-23T00:00:00.000Z') });

  assert.deepEqual(geloescht, ['2026-08-01.tar.gz']);
  assert.ok(!fs.existsSync(path.join(ziel, '2026-08-01.tar.gz')));
  assert.ok(fs.existsSync(path.join(ziel, '2026-09-20.tar.gz')));
  assert.ok(fs.existsSync(path.join(ziel, 'notizen.txt')));
});

test('alteSicherungenAufraeumen: leeres/fehlendes Zielverzeichnis ist kein Fehler', () => {
  const ziel = path.join(tmpDir(), 'existiert-nicht');
  const { geloescht } = alteSicherungenAufraeumen({ ziel, jetzt: new Date() });
  assert.deepEqual(geloescht, []);
});

// -- Vollstaendigkeit: jede lokale Ablage ist entschieden ---------------------

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Sucht im Code nach path.join(<privater Ordner>, '<teil>', ...) und liefert die relativen Pfade.
 * Grob, aber genug fuer den haeufigsten Fall: wer eine neue Ablage anlegt, schreibt sie so.
 * Basis "dir": massgeblich ist die letzte Zuweisung `const dir = ...` davor im selben File -
 * mit socialDir ist es der Ordner social/, mit privatDir die Wurzel, sonst unbekannt (uebersprungen).
 */
function ablagenImCode() {
  const mjs = (ordner, prefix) => fs.readdirSync(path.join(REPO, ordner)).filter(n => n.endsWith('.mjs')).map(n => [`${ordner}/${n}`, prefix]);
  const quellen = [
    ...mjs('operations/lib', ''),
    ...mjs('social/lib', 'social/'),
    // Auch die Skripte legen Ablagen an (Bestandsabgleich, Anreicherung, Feed ...). Dort ist ein
    // `dir` ohne Zuweisung meist ein Parameter mit unbekanntem Ziel: null = ueberspringen.
    ...mjs('operations/scripts', null),
    ...mjs('social/scripts', null),
    ...mjs('scripts', null),
  ];
  const aufruf = /path\.join\(\s*([^,()]+(?:\(\))?)\s*,\s*((?:'[^'\n]+'\s*,\s*)*'[^'\n]+')\s*\)/g;
  const gefunden = new Map();
  for (const [datei, standardPrefix] of quellen) {
    const text = fs.readFileSync(path.join(REPO, datei), 'utf8');
    for (const m of text.matchAll(aufruf)) {
      const basis = m[1].trim();
      const teile = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
      let prefix;
      if (/homedir/.test(basis)) {
        // path.join(os.homedir(), 'teppich-paradies-analyse', '<ablage>', ...)
        if (teile[0] !== 'teppich-paradies-analyse' || teile.length < 2) continue;
        teile.shift();
        prefix = '';
      } else if (/privat/i.test(basis)) prefix = '';
      else if (/socialDir/.test(basis)) prefix = 'social/';
      else if (basis === 'dir') {
        const zuweisungen = [...text.slice(0, m.index).matchAll(/(?:const|let)\s+dir\s*=\s*([^;\n]+)/g)];
        const zuletzt = zuweisungen.at(-1)?.[1] ?? null;
        if (zuletzt === null) prefix = standardPrefix;
        else if (/socialDir/.test(zuletzt)) prefix = 'social/';
        else if (/privat/i.test(zuletzt)) prefix = '';
        else continue;
        if (prefix === null) continue;
      } else continue;
      const rel = prefix + teile.join('/');
      if (rel === 'teppich-paradies-analyse' || rel === 'social/') continue; // der Standardordner selbst
      if (!gefunden.has(rel)) gefunden.set(rel, datei);
    }
  }
  return gefunden;
}

/** Gehoert `rel` zu einem Eintrag der Liste - gleich, darin, oder ein Ordner, der einen Eintrag enthaelt? */
function entschieden(rel, liste) {
  return liste.some(p => rel === p || rel.startsWith(`${p}/`) || p.startsWith(`${rel}/`));
}

test('jede lokale Ablage im Code ist gesichert oder bewusst ausgelassen (mit Grund)', () => {
  const ablagen = ablagenImCode();
  assert.ok(ablagen.size >= 20, `Suche findet zu wenig (${ablagen.size}) - Muster im Test pruefen`);
  const liste = [...SICHERUNGSPFADE, ...Object.keys(NICHT_GESICHERT)];
  const offen = [...ablagen].filter(([rel]) => !entschieden(rel, liste)).map(([rel, datei]) => `${rel} (${datei})`);
  assert.deepEqual(offen, [], 'Neue lokale Ablage: in SICHERUNGSPFADE oder NICHT_GESICHERT (operations/scripts/sicherung.mjs) eintragen');
});

test('die Listen widersprechen sich nicht, jede Ausnahme hat einen Grund, Zugaenge bleiben draussen', () => {
  for (const [rel, grund] of Object.entries(NICHT_GESICHERT)) {
    assert.ok(grund && grund.length > 5, `${rel}: Grund fehlt`);
    assert.ok(!SICHERUNGSPFADE.includes(rel), `${rel} steht in beiden Listen`);
  }
  for (const zugang of ['nachfassen/postfach.json', 'benutzer.json', 'dashboard-passwort.txt', 'social/zugang.env', 'social/upload-links.json']) {
    assert.ok(!SICHERUNGSPFADE.some(p => zugang === p || zugang.startsWith(`${p}/`)), `${zugang} darf nicht ins Archiv`);
  }
  // Die Dateien, die steuern, wer automatisch angeschrieben wird (Befund 26.10.2026).
  for (const rel of ['nachfassen/versand.json', 'nachfassen/stoppliste.json', 'muster-bestellung', 'protokoll.jsonl', 'auslauf/status.json']) {
    assert.ok(SICHERUNGSPFADE.includes(rel), `${rel} fehlt in der Sicherung`);
  }
});

test('Stoppliste und Versandprotokoll kommen ins Archiv, der Postfach-Zugang daneben nicht', () => {
  const dir = beispielPrivatDir();
  fs.mkdirSync(path.join(dir, 'nachfassen'));
  fs.writeFileSync(path.join(dir, 'nachfassen', 'versand.json'), JSON.stringify({ gesendet: [{ order: '#T1' }] }));
  fs.writeFileSync(path.join(dir, 'nachfassen', 'stoppliste.json'), JSON.stringify({ kunden: ['kunde@example.invalid'] }));
  fs.writeFileSync(path.join(dir, 'nachfassen', 'postfach.json'), JSON.stringify({ passwort: 'test-platzhalter' }));
  fs.mkdirSync(path.join(dir, 'muster-bestellung'));
  fs.writeFileSync(path.join(dir, 'muster-bestellung', 'versand.json'), '{"version":1,"sendungen":[]}');
  const { archiv } = sichern({ privatDir: dir, jetzt: new Date('2026-10-26T21:30:00Z') });
  const liste = execFileSync('tar', ['-tzf', archiv], { encoding: 'utf8' }).split('\n');
  assert.ok(liste.includes('nachfassen/versand.json'));
  assert.ok(liste.includes('nachfassen/stoppliste.json'));
  assert.ok(liste.some(e => e.startsWith('muster-bestellung/')));
  assert.ok(!liste.some(e => e.includes('postfach')), 'Zugangsdaten bleiben draussen');
});

test('--kopie legt das fertige Archiv zusaetzlich ab; fehlendes Ziel wird nie angelegt', () => {
  const dir = beispielPrivatDir();
  const { archiv } = sichern({ privatDir: dir, jetzt: new Date('2026-10-26T21:30:00Z') });
  const extern = tmpDir();
  const k = kopieAblegen(archiv, extern);
  assert.equal(k.ziel, path.join(extern, '2026-10-26.tar.gz'));
  assert.deepEqual(fs.readFileSync(k.ziel), fs.readFileSync(archiv));
  assert.equal(fs.statSync(k.ziel).mode & 0o777, 0o600);
  assert.ok(!fs.readdirSync(extern).some(n => n.endsWith('.tmp')));

  const nichtAngesteckt = path.join(tmpDir(), 'Volumes', 'TP-Sicherung');
  assert.throws(() => kopieAblegen(archiv, nichtAngesteckt), /nicht erreichbar/);
  assert.ok(!fs.existsSync(nichtAngesteckt), 'ein fehlendes Ziel wird nicht angelegt');
  assert.throws(() => kopieAblegen(archiv, path.dirname(archiv)), /derselbe Ordner/);

  kopieVermerken(dir, { ziel: extern, ok: false, am: '2026-10-26T21:30:00.000Z', fehler: 'Platte fehlt' });
  const beleg = JSON.parse(fs.readFileSync(path.join(dir, 'sicherungsstand.json'), 'utf8'));
  assert.equal(beleg.letzterErfolg, '2026-10-26T21:30:00.000Z', 'der Beleg der Sicherung bleibt');
  assert.equal(beleg.kopie.fehler, 'Platte fehlt');
});

test('Kopie-Ziel kommt aus --kopie oder TP_SICHERUNG_KOPIE', () => {
  assert.equal(parseArgs([], {}).kopie, null);
  assert.equal(parseArgs([], { TP_SICHERUNG_KOPIE: '/Volumes/X/tp' }).kopie, '/Volumes/X/tp');
  assert.equal(parseArgs(['--kopie', '/Volumes/Y/tp'], { TP_SICHERUNG_KOPIE: '/Volumes/X/tp' }).kopie, '/Volumes/Y/tp');
});

test('Plists der Mac-Dienste kommen mit ins Archiv, solche mit Zugangsdaten nicht', () => {
  const dir = beispielPrivatDir();
  const agents = tmpDir();
  const plist = (env = '') => `<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>x</string>${env}</dict></plist>`;
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.shopwache.plist'), plist());
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.dashboard.plist'), plist('<key>EnvironmentVariables</key><dict><key>TP_DASHBOARD_HOST</key><string>0.0.0.0</string></dict>'));
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.geheim.plist'), plist('<key>EnvironmentVariables</key><dict><key>SHOPIFY_ADMIN_TOKEN</key><string>test-platzhalter</string></dict>'));
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.dashboard.plist.sicherung-20260925'), 'alt');
  fs.writeFileSync(path.join(agents, 'com.fremd.dienst.plist'), plist());
  const r = sichern({ privatDir: dir, jetzt: new Date('2026-10-26T21:30:00Z'), launchAgentsDir: agents });
  assert.deepEqual(r.dienste, { kopiert: ['net.teppich-paradies.dashboard.plist', 'net.teppich-paradies.shopwache.plist'], ausgelassen: ['net.teppich-paradies.geheim.plist'] });
  const liste = execFileSync('tar', ['-tzf', r.archiv], { encoding: 'utf8' }).split('\n');
  assert.ok(liste.includes('dienste/net.teppich-paradies.shopwache.plist'));
  assert.ok(!liste.some(e => e.includes('geheim') || e.includes('fremd')));
  assert.equal(fs.statSync(path.join(dir, 'dienste', 'net.teppich-paradies.dashboard.plist')).mode & 0o777, 0o600);
  // Ohne Ordner (Tests, anderer Rechner) passiert nichts.
  assert.deepEqual(sichern({ privatDir: beispielPrivatDir(), jetzt: new Date('2026-10-26T21:30:00Z') }).dienste, { kopiert: [], ausgelassen: [] });
});

test('ein falscher Datenordner wird auch mit Dienst-Plists nicht zur Sicherung', () => {
  const leer = tmpDir();
  const agents = tmpDir();
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.shopwache.plist'), '<plist/>');
  assert.throws(() => sichern({ privatDir: leer, launchAgentsDir: agents }), /Keine Betriebsdaten/);
  assert.ok(!fs.existsSync(path.join(leer, 'dienste')));
});

// -- Wiederherstellen: die Befehle im README tun, was sie sagen ---------------

/** Der Befehlsblock unter Schritt 3 "Daten zurueckspielen" in operations/README.md, so wie er dasteht. */
function zurueckspielBlock() {
  const readme = fs.readFileSync(path.join(REPO, 'operations', 'README.md'), 'utf8');
  const abschnitt = readme.slice(readme.indexOf('### Wiederherstellen nach einem Ausfall'));
  const schritt = abschnitt.slice(abschnitt.indexOf('3. **Daten zurueckspielen.**'));
  const block = /```\n([\s\S]*?)\n\s*```/.exec(schritt);
  assert.ok(block, 'Befehlsblock unter Schritt 3 nicht gefunden');
  return block[1].split('\n').map(z => z.trim()).join('\n');
}

test('Wiederherstellen nach README: Social-Datenbank und Highlight-Stand kommen zurueck', () => {
  // Alter Mac: eine Baustelle in der Datenbank, ihr taeglicher Abzug, die von Hand gezaehlten Highlights.
  const alt = beispielPrivatDir();
  const social = path.join(alt, 'social');
  const db = oeffne(path.join(social, 'social.db'));
  db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'Testbaustelle', einwilligung: true });
  sichereDatenbank(db, { dir: social });
  db.schliessen();
  schreibeHighlightStand({ Verlegung: 3 }, { dir: social, einsortiert: [7], jetzt: new Date('2026-10-20T10:00:00Z') });
  const { archiv } = sichern({ privatDir: alt, jetzt: new Date('2026-10-26T21:30:00Z') });

  // Neuer Mac: leeres Home, die Befehle aus dem README unveraendert - nur der Archivname ist eingesetzt.
  const home = tmpDir();
  const block = zurueckspielBlock().replaceAll('<datum>.tar.gz', archiv);
  const ausgabe = execFileSync('bash', ['-e', '-c', block], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const neu = path.join(home, 'teppich-paradies-analyse', 'social');
  // Der Social-Dienst oeffnet social.db (social/lib/pfade.mjs, dbPfad) - dort muss der Abzug stehen.
  const wieder = oeffne(path.join(neu, 'social.db'));
  try {
    assert.deepEqual(wieder.inhalte().map(i => i.titel), ['Testbaustelle'], 'der Dienst findet die alten Inhalte');
  } finally { wieder.schliessen(); }
  assert.equal(fs.statSync(path.join(neu, 'social.db')).mode & 0o777, 0o600);
  assert.match(ausgabe, /^inhalt 1$/m, 'die Pruefzeile im README zeigt die Inhalte');
  // Die Bereichszahlen traegt die Redaktion von Hand ein, die einsortierten Storys auch (social/lib/highlights.mjs).
  const stand = liesHighlightStand(neu);
  assert.equal(stand?.bereiche?.Verlegung, 3, 'die Highlight-Zaehlung kommt zurueck');
  assert.deepEqual(stand.einsortiert, [7]);
});
