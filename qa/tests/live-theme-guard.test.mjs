import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analyze, themeIdsIn } from '../live-theme-guard.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const registry = {
  live: { themeId: '202917118286', name: 'Aktuell' },
  fallback: { themeId: '196301750606', name: 'Horizon' },
  retired: [{ themeId: '201829679438', name: 'theme-productpage-v2-night' }]
};
const protectedResources = { 'theme:202917118286': 'HIGH', 'theme:196301750606': 'HIGH' };

test('stillgelegte Theme-ID in einer Anweisungsdatei ist ein Fehler', () => {
  const findings = analyze({
    sources: [{ name: 'CLAUDE.md', text: 'Live Theme: 201829679438' }],
    registry,
    protectedResources
  });
  const stale = findings.filter(f => f.rule === 'stale-theme-id');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].severity, 'error');
  assert.match(stale[0].message, /theme-productpage-v2-night/);
});

test('aktuelle Live- und Fallback-ID sind erlaubt', () => {
  const findings = analyze({
    sources: [{ name: 'CLAUDE.md', text: 'live 202917118286, fallback 196301750606' }],
    registry,
    protectedResources
  });
  assert.deepEqual(findings, []);
});

test('unbekannte Theme-ID wird gemeldet', () => {
  const findings = analyze({
    sources: [{ name: 'AGENTS.md', text: 'Theme 123456789012' }],
    registry,
    protectedResources
  });
  assert.equal(findings.filter(f => f.rule === 'stale-theme-id').length, 1);
});

test('Live-Theme ohne Eintrag in protectedResources ist ein Fehler', () => {
  const findings = analyze({ sources: [], registry, protectedResources: {} });
  const unprotected = findings.filter(f => f.rule === 'unprotected-theme');
  assert.equal(unprotected.length, 2);
  assert.match(unprotected[0].message, /nur als MEDIUM/);
});

test('themeIdsIn findet nur zwoelfstellige Zahlen', () => {
  assert.deepEqual(themeIdsIn('id 202917118286 und Jahr 2026 und 12345'), ['202917118286']);
});

test('das echte Repository ist konsistent', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const config = JSON.parse(read('qa/live-theme-guard.config.json'));
  const findings = analyze({
    sources: config.sources
      .filter(name => fs.existsSync(path.join(root, name)))
      .map(name => ({ name, text: read(name) })),
    registry: JSON.parse(read(config.registry)),
    protectedResources: JSON.parse(read(config.riskMap)).protectedResources
  });
  assert.deepEqual(findings.map(f => f.message), []);
});
