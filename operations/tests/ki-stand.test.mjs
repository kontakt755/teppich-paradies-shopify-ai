import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { letzteCodexLimits, bewerteCodex, bewerteMuster, bewerteClaude, versionNeuer, claudeAbgleichFaellig, changelogSeit } from '../lib/ki-stand.mjs';
import { main } from '../scripts/ki-stand.mjs';
import { liesStatus } from '../lib/routinen.mjs';

const JETZT = new Date('2026-11-03T12:00:00Z');
const vorMin = min => new Date(JETZT.getTime() - min * 60_000).toISOString();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ki-stand-'));
const limits = (woche, extra = {}) => ({ zeit: vorMin(10), woche, fuenfStunden: 40, resetWoche: '2026-11-09T12:58:00Z', plan: 'plus', erreicht: null, ...extra });

function rollout(codex, zeilen, tag = ['2026', '11', '03']) {
  const ordner = path.join(codex, 'sessions', ...tag);
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'rollout-a.jsonl'), `${zeilen.map(z => (typeof z === 'string' ? z : JSON.stringify(z))).join('\n')}\n`);
}
const tokenZeile = (woche, geheim = 'text') => ({ timestamp: vorMin(5), type: 'event_msg', payload: { type: 'token_count', inhalt: geheim, rate_limits: { primary: { used_percent: 41 }, secondary: { used_percent: woche, resets_at: 1794229122 }, plan_type: 'plus', rate_limit_reached_type: null } } });

test('Codex: letzter Stand aus dem Protokoll, kaputte und andere Zeilen zaehlen nicht', () => {
  const codex = tmp();
  rollout(codex, [tokenZeile(50), '{kaputt "rate_limits"', { timestamp: vorMin(1), payload: { type: 'message', text: 'x' } }, tokenZeile(63)]);
  const l = letzteCodexLimits(codex, JETZT);
  assert.equal(l.woche, 63);
  assert.equal(l.plan, 'plus');
  assert.equal(Object.keys(l).includes('inhalt'), false, 'keine Chatinhalte im Ergebnis');
});

test('Codex ohne Protokoll, mit fremdem Format oder altem Stand: nicht lesbar, nie ok', () => {
  assert.equal(letzteCodexLimits(tmp(), JETZT), null);
  assert.equal(bewerteCodex(null, JETZT).art, 'nicht-lesbar');
  const codex = tmp();
  rollout(codex, [{ timestamp: vorMin(5), payload: { rate_limits: { anders: 1 } } }]);
  assert.equal(letzteCodexLimits(codex, JETZT), null);
  assert.equal(bewerteCodex(limits(10, { zeit: vorMin(60 * 40) }), JETZT).art, 'nicht-lesbar');
  assert.equal(bewerteCodex(limits(10, { zeit: 'kaputt' }), JETZT).art, 'nicht-lesbar');
});

test('Codex: Grenzen bei 80 und 100 %, gemeldetes Limit zaehlt auch darunter', () => {
  assert.equal(bewerteCodex(limits(79), JETZT).ok, true);
  assert.equal(bewerteCodex(limits(80), JETZT).art, 'woche-80');
  assert.equal(bewerteCodex(limits(100), JETZT).art, 'limit');
  assert.equal(bewerteCodex(limits(50, { erreicht: 'primary' }), JETZT).art, 'limit');
});

test('Musterautomatik: aus, unklare Sendung, stehender Lauf, Hinweis, gut', () => {
  const gut = { konfig: { aktiv: true }, journal: { sendungen: [{ status: 'vermerkt' }, { status: 'gesendet' }], letzterLauf: { am: vorMin(5), hinweis: null } } };
  assert.equal(bewerteMuster(gut, JETZT).ok, true);
  assert.equal(bewerteMuster({ ...gut, konfig: { aktiv: false } }, JETZT).art, 'aus');
  assert.equal(bewerteMuster({ ...gut, journal: { ...gut.journal, sendungen: [{ status: 'unklar' }] } }, JETZT).art, 'unklar');
  assert.equal(bewerteMuster({ ...gut, journal: { ...gut.journal, sendungen: [{ status: 'sendet' }] } }, JETZT).art, 'unklar');
  assert.equal(bewerteMuster({ ...gut, journal: { sendungen: [], letzterLauf: { am: vorMin(31) } } }, JETZT).art, 'steht');
  assert.equal(bewerteMuster({ ...gut, journal: { sendungen: [] } }, JETZT).art, 'steht');
  assert.equal(bewerteMuster({ ...gut, journal: { sendungen: [], letzterLauf: { am: vorMin(1), hinweis: 'SMTP' } } }, JETZT).art, 'hinweis');
});

test('Claude: Versionsvergleich numerisch, neue Version ist Hinweis statt Fehler, Probefehler ist Fehler', () => {
  assert.equal(versionNeuer('2.1.317', '2.1.306'), true);
  assert.equal(versionNeuer('2.1.99', '2.1.306'), false);
  assert.equal(versionNeuer('2.1.306', '2.1.306'), false);
  const neu = bewerteClaude({ installiert: '2.1.306', tags: { latest: '2.1.317', stable: '2.1.311' }, probe: { ok: true } });
  assert.equal(neu.ok, true);
  assert.match(neu.hinweis, /2\.1\.317/);
  assert.equal(bewerteClaude({ installiert: '2.1.317', tags: { latest: '2.1.317' }, probe: { ok: true } }).hinweis, null);
  assert.equal(bewerteClaude({ installiert: '2.1.306', tags: null, probe: { ok: true } }).ok, true);
  assert.equal(bewerteClaude({ installiert: '2.1.306', tags: { latest: '2.1.317' }, probe: { ok: false, fehler: 'Exit 1' } }).art, 'probe');
  assert.equal(bewerteClaude({ installiert: null, tags: null, probe: { ok: true } }).art, 'nicht-lesbar');
});

test('Claude-Abgleich: montags einmal, sonst spaetestens nach 8 Tagen', () => {
  const montag = new Date('2026-11-09T08:00:00Z');
  assert.equal(claudeAbgleichFaellig(undefined, montag), true);
  assert.equal(claudeAbgleichFaellig('2026-11-02T08:00:00Z', montag), true);
  assert.equal(claudeAbgleichFaellig('2026-11-09T07:00:00Z', montag), false);
  assert.equal(claudeAbgleichFaellig('2026-11-02T08:00:00Z', new Date('2026-11-05T08:00:00Z')), false);
  assert.equal(claudeAbgleichFaellig('2026-11-02T08:00:00Z', new Date('2026-11-10T09:00:00Z')), true);
});

test('Changelog: nur neuere Versionen, nur Added/Changed, leere Abschnitte fallen weg', () => {
  const text = '# Changelog\n\n## 2.1.317\n\n- Added A\n- Fixed B\n\n## 2.1.316\n\n- Fixed C\n\n## 2.1.306\n\n- Added alt\n';
  assert.equal(changelogSeit(text, '2.1.306'), '## 2.1.317\n- Added A');
  assert.equal(changelogSeit(text, '2.1.317'), '');
});

function umgebung(wocheProzent = 40) {
  const privat = tmp();
  const codex = tmp();
  rollout(codex, [tokenZeile(wocheProzent)]);
  const ordner = path.join(privat, 'muster-bestellung');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'konfiguration.json'), JSON.stringify({ aktiv: true, ab: '2026-10-23T00:00:00Z', lieferanten: {} }));
  fs.writeFileSync(path.join(ordner, 'versand.json'), JSON.stringify({ version: 1, sendungen: [], letzterLauf: { am: vorMin(1), hinweis: null } }));
  const home = tmp();
  fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(home, '.local', 'share', 'claude', 'versions'), { recursive: true });
  fs.writeFileSync(path.join(home, '.local', 'share', 'claude', 'versions', '2.1.306'), '');
  fs.symlinkSync(path.join(home, '.local', 'share', 'claude', 'versions', '2.1.306'), path.join(home, '.local', 'bin', 'claude'));
  return { privat, env: { TP_PRIVAT_DIR: privat, TP_CODEX_DIR: codex, HOME: home } };
}

test('Lauf: schreibt alle drei Stände, meldet Monatsvorschlag einmal, --trocken schreibt nichts', async () => {
  const { privat, env } = umgebung();
  const meldungen = [];
  let vorschlaege = 0;
  const deps = {
    env, jetzt: JETZT, aus: () => {}, melde: (t, m) => meldungen.push([t, m]), probe: () => ({ ok: true }),
    holeText: async url => (url.includes('dist-tags') ? '{"latest":"2.1.317","stable":"2.1.311"}' : '## 2.1.317\n- Added A\n'),
    vorschlag: () => { vorschlaege += 1; return 'Vorschlag'; },
  };
  assert.equal(await main(['--trocken'], deps), 0);
  assert.equal(fs.existsSync(path.join(privat, 'routinen')), false);
  assert.equal(await main([], deps), 0);
  assert.equal(liesStatus(privat, 'codex-stand').ok, true);
  assert.equal(liesStatus(privat, 'muster-versand').ok, true);
  const claude = liesStatus(privat, 'claude-stand');
  assert.equal(claude.ok, true);
  assert.match(claude.hinweis, /2\.1\.317/);
  assert.equal(vorschlaege, 1);
  assert.ok(fs.existsSync(path.join(privat, 'routinen', 'ki-stand', 'vorschlaege-2026-11.md')));
  assert.equal(meldungen.filter(([t]) => t === 'Claude-Code-Stand').length, 1);
  assert.equal(await main([], deps), 0, 'zweiter Lauf: Abgleich nicht faellig');
  assert.equal(await main([], { ...deps, jetzt: new Date('2026-11-09T12:00:00Z') }), 1, 'Woche spaeter: Codex-Stand ist zu alt und meldet das');
  assert.equal(vorschlaege, 1, 'im selben Monat kein zweiter Modelllauf');
  assert.equal(await main(['--falsch'], { ...deps, fehler: () => {} }), 2);
});

test('Lauf am Limit: Exit 1, Mitteilung nur beim ersten Mal', async () => {
  const { privat, env } = umgebung(100);
  const meldungen = [];
  const deps = { env, jetzt: JETZT, aus: () => {}, melde: (t, m) => meldungen.push([t, m]), probe: () => ({ ok: true }), holeText: async () => '{}' };
  assert.equal(await main([], deps), 1);
  assert.equal(await main([], deps), 1);
  assert.equal(meldungen.filter(([t]) => t === 'Codex-Kontingent').length, 1);
  assert.equal(liesStatus(privat, 'codex-stand').art, 'limit');
});
