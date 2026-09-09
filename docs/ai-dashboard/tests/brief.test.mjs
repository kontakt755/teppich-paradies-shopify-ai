import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBrief, readBrief } from '../../../scripts/dashboard-brief.mjs';

const NOW = new Date('2026-09-09T12:00:00Z');
const issue = (over = {}) => ({
  number: 1, title: 'Beispiel', state: 'open', html_url: 'https://github.com/x/y/issues/1',
  labels: ['status:geplant', 'priority:p2', 'area:google'], assignee: 'kontakt755', fields: {},
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-08T00:00:00Z', closed_at: null, ...over,
});

test('buildBrief nennt Datenstand, Zaehler und die dringendsten Aufgaben mit Grund', () => {
  const data = { generated_at: '2026-09-09T11:50:00Z', issues: [
    issue({ number: 42, title: 'Kanal', labels: ['status:freigabe', 'priority:p0', 'area:google'] }),
    issue({ number: 34, title: 'API', labels: ['status:blockiert', 'priority:p0', 'area:backend'], assignee: null }),
    issue({ number: 7, labels: ['status:geplant', 'priority:p3', 'area:seo'] }),
  ] };
  const lines = buildBrief(data, { now: NOW });
  assert.match(lines[0], /Stand vor 10 Min\./);
  assert.match(lines[0], /3 offen, 2 kritisch, 1 blockiert, 1 Freigabe offen/);
  assert.match(lines[1], /#42 Kanal - P0 kritisch, wartet auf Freigabe \(@kontakt755\)/);
  assert.match(lines[2], /#34 API - .*\(ohne Owner\)/);
  assert.ok(!lines.some(l => l.includes('#7')), 'P3 ohne Grund erscheint nicht');
  assert.match(lines.at(-1), /npm run task -- list/);
});

test('buildBrief markiert veraltete Daten und meldet Ruhe ohne dringende Aufgaben', () => {
  const lines = buildBrief({ generated_at: '2026-09-09T02:00:00Z', issues: [issue({ labels: ['status:geplant', 'priority:p3', 'area:seo'] })] }, { now: NOW });
  assert.match(lines[0], /VERALTET/);
  assert.match(lines[1], /Nichts draengt/);
});

test('readBrief bricht bei fehlender oder kaputter Datei nie ab', () => {
  assert.match(readBrief({ file: '/nirgends/issues.json' })[0], /nicht lesbar/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
  const bad = path.join(dir, 'issues.json');
  fs.writeFileSync(bad, '{ kaputt');
  assert.match(readBrief({ file: bad })[0], /nicht lesbar/);
  assert.match(buildBrief({ nope: true })[0], /fehlt oder ist ungueltig/);
});
