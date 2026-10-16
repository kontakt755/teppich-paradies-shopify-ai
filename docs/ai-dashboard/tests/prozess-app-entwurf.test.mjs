import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ENTWURF_LINK_MAX, AppEntwurfsFehler, appEntwurfZiel, baueAppEntwurfslink } from '../lib/prozess-app-entwurf.mjs';
import { pruefeProzesslink } from '../lib/prozesslinks.mjs';

const CODEX = 'codex://new?path=%2Ftmp%2Ftest-projekt';
const CLAUDE_CODE = 'claude://code/new?folder=%2Ftmp%2Ftest-projekt';
const CLOUD = 'https://chatgpt.com/g/g-p-00000000000000000000000000000000/project';
const fehler = code => error => error instanceof AppEntwurfsFehler && error.code === code;

test('Metadaten unterscheiden neue lokale Projekte, Repository-Ziele und generische App-Chats', () => {
  for (const ziel of [CODEX, 'codex://threads/new?path=%2Ftmp%2Ftest-projekt', 'codex://threads/new?originUrl=https%3A%2F%2Frepository.example%2Fteam%2Frepo.git', 'codex://new?originUrl=https%3A%2F%2Frepository.example%2Frepo.git']) {
    assert.deepEqual(appEntwurfZiel('codex', ziel), { anbieter: 'codex', art: 'codex', hatProjekt: true });
  }
  assert.deepEqual(appEntwurfZiel('codex', 'codex://threads/new'), { anbieter: 'codex', art: 'codex', hatProjekt: false });
  assert.deepEqual(appEntwurfZiel('claude', CLAUDE_CODE), { anbieter: 'claude', art: 'claude-code', hatProjekt: true });
  assert.deepEqual(appEntwurfZiel('claude', 'claude://claude.ai/new'), { anbieter: 'claude', art: 'claude-chat', hatProjekt: false });
});

test('Bestehende Chats, Cloud-Projekte und nicht dokumentierte Routen sind kein App-Prefill', () => {
  for (const [anbieter, ziel] of [
    ['codex', 'codex://threads/abc-123'], ['codex', 'codex://new'],
    ['codex', 'codex://threads/new/'], ['codex', 'codex://new/'],
    ['claude', 'claude://claude.ai/project/00000000-0000-0000-0000-000000000000'],
    ['claude', 'https://claude.ai/project/00000000-0000-0000-0000-000000000000'],
    ['chatgpt', CLOUD], ['claude', CODEX], ['codex', CLAUDE_CODE],
    ['claude', 'claude://code/new'], ['fremd', CODEX], ['codex', null], ['codex', ''],
  ]) {
    assert.equal(appEntwurfZiel(anbieter, ziel), null, `${anbieter}: ${ziel}`);
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, 'Erfundene Testangaben'), fehler('ziel_nicht_unterstuetzt'));
  }
});

test('Zentrale gespeicherte Zielvalidierung bleibt verbindlich und promptfrei', () => {
  for (const [anbieter, ziel] of [
    ['codex', `${CODEX}&prompt=verboten`], ['codex', `${CODEX}&q=verboten`],
    ['codex', `${CODEX}&path=%2Ftmp%2Fanderes-projekt`],
    ['codex', 'codex://threads/new?path=relativ'],
    ['codex', 'codex://threads/new?originUrl=https%3A%2F%2Fuser%3Ageheim%40repository.example%2Frepo'],
    ['codex', 'codex://threads/new?originUrl=https%3A%2F%2Frepository.example%2Frepo%3Ftoken%3Dwert'],
    ['claude', `${CLAUDE_CODE}&q=verboten`], ['claude', 'claude://claude.ai/new?q=verboten'],
    ['claude', `${CLAUDE_CODE}&folder=%2Ftmp%2Fanderes-projekt`],
    ['codex', `${CODEX}#prompt=verboten`], ['codex', `${CODEX}&%70rompt=verboten`],
    ['codex', `${CODEX}&` + 'x'.repeat(2048)],
  ]) {
    assert.throws(() => pruefeProzesslink(anbieter, ziel));
    assert.equal(appEntwurfZiel(anbieter, ziel), null);
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, 'Erfundene Testangaben'), fehler('ziel_nicht_unterstuetzt'));
  }
  const uebergabe = baueAppEntwurfslink('codex', CODEX, 'Erfundene Testangaben');
  assert.throws(() => pruefeProzesslink('codex', uebergabe), 'ein fluechtiger Uebergabelink darf nicht als Ziel gespeichert werden');
});

test('Projektparameter und mehrzeiliger Text bleiben einschliesslich Unicode und URL-Sonderzeichen unveraendert', () => {
  const pfad = '/tmp/Test Ordner/Ä & + % # ? /📦';
  const originUrl = 'https://repository.example/team/repo.git';
  const text = '  Erfundener Auftrag: äöü 😀\r\n\t<script>window.test = "A&B";</script>\n?prompt=anders&q=anders + 100% # Ende  ';
  for (const route of ['codex://new', 'codex://threads/new']) {
    const ziel = new URL(route);
    ziel.searchParams.set('path', pfad);
    ziel.searchParams.set('originUrl', originUrl);
    const vorher = ziel.href;
    const link = new URL(baueAppEntwurfslink('codex', vorher, text));
    assert.equal(link.searchParams.get('path'), pfad);
    assert.equal(link.searchParams.get('originUrl'), originUrl);
    assert.equal(link.searchParams.get('prompt'), text);
    assert.deepEqual([...link.searchParams.keys()], ['path', 'originUrl', 'prompt']);
    assert.equal(ziel.href, vorher, 'der Eingabewert bleibt unveraendert');
  }
  for (const [ziel, art] of [[`claude://code/new?folder=${encodeURIComponent(pfad)}`, 'claude-code'], ['claude://claude.ai/new', 'claude-chat']]) {
    const link = new URL(baueAppEntwurfslink('claude', ziel, text));
    assert.equal(link.searchParams.get('q'), text);
    assert.equal(link.searchParams.has('prompt'), false);
    if (art === 'claude-code') assert.equal(link.searchParams.get('folder'), pfad);
  }
});

test('Windows-Pfade werden aus der gemeinsamen Validierung uebernommen und nicht neu interpretiert', () => {
  const pfad = 'C:\\Projekte\\Test Ordner\\Ä & +';
  for (const [anbieter, ziel, feld] of [
    ['codex', `codex://new?path=${encodeURIComponent(pfad)}`, 'path'],
    ['claude', `claude://code/new?folder=${encodeURIComponent(pfad)}`, 'folder'],
  ]) {
    assert.equal(new URL(baueAppEntwurfslink(anbieter, ziel, 'Test')).searchParams.get(feld), pfad);
    assert.equal(appEntwurfZiel(anbieter, ziel).hatProjekt, true);
  }
});

test('Native Links unterscheiden Leerzeichen und echte Pluszeichen ohne Formulardekodierung', () => {
  for (const [anbieter, ziel, feld] of [['codex', CODEX, 'prompt'], ['claude', CLAUDE_CODE, 'q'], ['claude', 'claude://claude.ai/new', 'q']]) {
    const link = baueAppEntwurfslink(anbieter, ziel, 'A B + C');
    assert.equal(link.includes('+'), false);
    assert.ok(link.endsWith(`${feld}=A%20B%20%2B%20C`));
    assert.equal(decodeURIComponent(link.split(`${feld}=`)[1]), 'A B + C');
  }
});

test('Steuerzeichen und unvollstaendiger Unicode werden im Ziel und im Text abgelehnt', () => {
  for (const zeichen of ['\u0000', '\u0008', '\u000b', '\u000c', '\u001f', '\u007f', '\u0085', '\u009f']) {
    assert.throws(() => baueAppEntwurfslink('codex', CODEX, `Test${zeichen}Ende`), fehler('text_ungueltig'));
    const ziel = `codex://new?path=${encodeURIComponent(`/tmp/test${zeichen}`)}`;
    assert.equal(appEntwurfZiel('codex', ziel), null);
    assert.throws(() => baueAppEntwurfslink('codex', ziel, 'Test'), fehler('ziel_nicht_unterstuetzt'));
  }
  for (const text of ['Test\ud800', 'Test\udc00', '\ud800x\udc00']) {
    assert.throws(() => baueAppEntwurfslink('claude', CLAUDE_CODE, text), fehler('text_ungueltig'));
  }
  assert.equal(new URL(baueAppEntwurfslink('claude', CLAUDE_CODE, 'Zeile 1\r\n\tZeile 2 😀')).searchParams.get('q'), 'Zeile 1\r\n\tZeile 2 😀');
});

test('Leerer Text wird abgelehnt; Fehler enthalten weder Eingabetext noch Ziel', () => {
  for (const text of ['', ' \r\n\t ', null, undefined, 42, {}]) {
    assert.throws(() => baueAppEntwurfslink('codex', CODEX, text), fehler('text_leer'));
  }
  try { baueAppEntwurfslink('codex', CODEX, 'Vertraulicher-Test-Text\u0000'); }
  catch (error) {
    assert.equal(error.name, 'AppEntwurfsFehler');
    assert.ok(!error.message.includes('Vertraulicher-Test-Text'));
    assert.ok(!error.message.includes(CODEX));
  }
});

test('Die harte Grenze gilt fuer den fertig kodierten Link und kuerzt niemals Text', () => {
  for (const [anbieter, ziel, feld] of [['codex', CODEX, 'prompt'], ['claude', CLAUDE_CODE, 'q'], ['claude', 'claude://claude.ai/new', 'q']]) {
    const leererLink = new URL(ziel);
    leererLink.searchParams.set(feld, '');
    const anzahl = APP_ENTWURF_LINK_MAX - leererLink.href.length;
    const text = 'a'.repeat(anzahl);
    const link = baueAppEntwurfslink(anbieter, ziel, text);
    assert.equal(link.length, APP_ENTWURF_LINK_MAX);
    assert.equal(new URL(link).searchParams.get(feld), text);
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, `${text}a`), fehler('text_zu_lang'));
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, '😀'.repeat(1000)), fehler('text_zu_lang'));
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, 'ä'.repeat(2000)), fehler('text_zu_lang'));
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, '<&>'.repeat(1400)), fehler('text_zu_lang'));
    assert.throws(() => baueAppEntwurfslink(anbieter, ziel, 'a'.repeat(APP_ENTWURF_LINK_MAX + 1)), fehler('text_zu_lang'));
  }
});
