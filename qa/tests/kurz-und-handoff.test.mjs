// Tests fuer scripts/kurz.mjs und scripts/handoff.mjs (#361).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themesQuery, themesZeilen, pushZusammenfassung, worktreeZeilen } from '../../scripts/kurz.mjs';
import { handoffText, issueAusBranch } from '../../scripts/handoff.mjs';

const LT = { live: { themeId: '1' }, preview: { themeId: '2' }, fallback: { themeId: '3' }, arbeit: { themeId: '4' } };
const gid = (n) => `gid://shopify/OnlineStoreTheme/${n}`;

test('themes-query fragt nur MAIN und die drei bekannten IDs', () => {
  const q = themesQuery(LT);
  assert.match(q, /roles: \[MAIN\]/);
  for (const n of ['2', '3', '4']) assert.ok(q.includes(gid(n)));
  assert.ok(!q.includes('first: 20'));
});

test('themes: 20 Themes werden zu den bekannten Rollenzeilen', () => {
  const nodes = [{ id: gid(1), name: 'L', role: 'MAIN' }, { id: gid(2), name: 'P', role: 'UNPUBLISHED' },
    { id: gid(3), name: 'F', role: 'UNPUBLISHED' }, { id: gid(4), name: 'A', role: 'UNPUBLISHED' }];
  for (let i = 10; i < 26; i++) nodes.push({ id: gid(i), name: `alt${i}`, role: 'UNPUBLISHED' });
  const z = themesZeilen({ data: { themes: { nodes } } }, LT);
  assert.equal(z.length, 5);
  assert.match(z[0], /^MAIN\s+1\s+live/);
  assert.match(z[4], /\+16 weitere/);
  assert.ok(!z.join('\n').includes('gid://'));
});

test('themes: Rollentausch ohne Nachtrag in live-theme.json wird markiert', () => {
  const z = themesZeilen([{ id: 2, name: 'P', role: 'main' }, { id: 1, name: 'L', role: 'unpublished' }], LT);
  assert.ok(z.every((l) => /veraltet/.test(l)));
});

test('push: Fehler bleiben, Offenses nur gezaehlt', () => {
  const roh = { theme: { id: gid(4), name: 'A', role: 'unpublished', errors: { 'blocks/x.liquid': ['Liquid syntax error'] } },
    offenses: Array.from({ length: 500 }, () => ({ check: 'X', message: 'lang'.repeat(50) })) };
  const z = pushZusammenfassung(JSON.stringify(roh));
  assert.ok(z.includes('Fehler: 1'));
  assert.ok(z.some((l) => l.includes('blocks/x.liquid: Liquid syntax error')));
  assert.ok(z.some((l) => l.includes('Offenses: 500')));
  assert.ok(z.join('\n').length < 400);
});

test('worktrees: nur die mit ungesicherter Arbeit', () => {
  const p = 'worktree /a\nHEAD 1\nbranch refs/heads/main\n\nworktree /b\nHEAD 2\nbranch refs/heads/x\n\nworktree /c\nHEAD 3\ndetached\n';
  const z = worktreeZeilen(p, (pfad) => (pfad === '/b' ? 3 : 0));
  assert.deepEqual(z, ['Worktrees: 3, davon mit ungesicherter Arbeit: 1', '  x  /b  (3 geaenderte Dateien)']);
});

test('handoff: Issue aus Branchnamen, Platzhalter fuer den naechsten Schritt', () => {
  assert.equal(issueAusBranch('chore/361-verbrauch'), '361');
  assert.equal(issueAusBranch('main'), null);
  const t = handoffText({ branch: 'chore/361-verbrauch', pfad: '/wt', basis: 'origin/main', commits: ['abc eins'], status: [], issue: '361' });
  assert.match(t, /#361/);
  assert.match(t, /Was als Naechstes: <ein Satz>/);
  assert.match(t, /Working Tree sauber/);
});
