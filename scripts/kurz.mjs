#!/usr/bin/env node
// Gefilterte Ausgaben statt Rohdumps (#361).
//
// Befund 2026-09-26: der Verlauf einer langen Sitzung wuchs nicht durch Prosa,
// sondern durch ungefilterte Werkzeugausgaben — Theme-Liste fuenfmal mit vollen
// GIDs, ein Push-JSON mit tausenden Tokens Offenses, 60 Worktree-Zeilen.
// Jede Ausgabe bleibt bis zum Sitzungsende im Kontext und wird in jeder Runde
// erneut bezahlt. Diese Helfer liefern nur, was eine Entscheidung braucht.
//
//   npm run -s kurz -- themes-query          GraphQL fuer den Shopify-MCP: nur MAIN + die drei bekannten Themes
//   <json> | npm run -s kurz -- themes       Theme-Antwort (MCP oder `shopify theme list --json`) als Rollenzeilen
//   <json> | npm run -s kurz -- push         `shopify theme push --json`: nur Fehler, Offenses gezaehlt
//   npm run -s kurz -- worktrees             Anzahl + nur Worktrees mit ungesicherter Arbeit
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function ladeLiveTheme(pfad = join(ROOT, 'domains/shopify/live-theme.json')) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

export function themesQuery(lt) {
  const ids = ['preview', 'fallback', 'arbeit']
    .map((k) => lt[k]?.themeId).filter(Boolean)
    .map((id) => `"gid://shopify/OnlineStoreTheme/${id}"`);
  return `query { live: themes(first: 2, roles: [MAIN]) { nodes { id name role } } bekannt: nodes(ids: [${ids.join(', ')}]) { ... on OnlineStoreTheme { id name role } } }`;
}

const kurzId = (id) => String(id ?? '').replace(/^gid:\/\/shopify\/OnlineStoreTheme\//, '');

// Nimmt jede uebliche Form: MCP-Antwort {data:{...}}, {themes:{nodes}}, CLI-Array.
export function themesZeilen(roh, lt) {
  const liste = [];
  const sammle = (x) => {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(sammle); return; }
    if (typeof x !== 'object') return;
    if ((x.id || x.themeId) && x.role) { liste.push({ id: kurzId(x.id ?? x.themeId), name: x.name, role: String(x.role).toUpperCase() }); return; }
    Object.values(x).forEach(sammle);
  };
  sammle(roh);
  const rolleImRepo = {};
  for (const k of ['live', 'preview', 'fallback', 'arbeit']) if (lt?.[k]?.themeId) rolleImRepo[lt[k].themeId] = k;
  const gesehen = new Set();
  const zeilen = [];
  for (const t of liste) {
    if (gesehen.has(t.id)) continue;
    gesehen.add(t.id);
    const soll = rolleImRepo[t.id];
    if (t.role !== 'MAIN' && !soll) continue; // Altthemes interessieren hier nicht
    let hinweis = '';
    if (t.role === 'MAIN' && soll !== 'live') hinweis = '  <- live-theme.json veraltet (MAIN, dort nicht live)';
    if (soll === 'live' && t.role !== 'MAIN') hinweis = '  <- live-theme.json veraltet (dort live, hier nicht MAIN)';
    zeilen.push(`${t.role.padEnd(11)} ${t.id}  ${soll ?? '-'}  ${t.name}${hinweis}`);
  }
  const rest = liste.length - zeilen.length;
  if (rest > 0) zeilen.push(`(+${rest} weitere unpublished ausgeblendet)`);
  return zeilen;
}

// `shopify theme push --json`: Fehler je Datei behalten, Offenses nur zaehlen.
export function pushZusammenfassung(roh) {
  const d = typeof roh === 'string' ? JSON.parse(roh) : roh;
  const t = d.theme ?? d;
  const zeilen = [];
  if (t.id || t.name) zeilen.push(`Theme ${kurzId(t.id)} ${t.name ?? ''} ${t.role ?? ''}`.trim());
  const fehler = t.errors ?? d.errors ?? {};
  const eintraege = Array.isArray(fehler) ? fehler.map((f, i) => [String(i), f]) : Object.entries(fehler);
  zeilen.push(`Fehler: ${eintraege.length}`);
  for (const [datei, f] of eintraege) zeilen.push(`  ${datei}: ${[].concat(f).join(' | ').slice(0, 300)}`);
  let offenses = 0;
  const zaehle = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x.offenses)) offenses += x.offenses.length;
    Object.values(x).forEach(zaehle);
  };
  zaehle(d);
  if (offenses) zeilen.push(`Theme-Check-Offenses: ${offenses} (nicht aufgelistet; einzeln: shopify theme check --path <datei>)`);
  return zeilen;
}

// `git worktree list --porcelain` + je Worktree `git status --porcelain`.
export function worktreeZeilen(porcelain, statusVon) {
  const baeume = porcelain.split('\n\n').map((b) => {
    const pfad = /^worktree (.+)$/m.exec(b)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(b)?.[1] ?? (/^detached$/m.test(b) ? '(detached)' : '?');
    return pfad ? { pfad, branch } : null;
  }).filter(Boolean);
  const offen = [];
  for (const w of baeume) {
    const n = statusVon(w.pfad);
    if (n > 0) offen.push(`  ${w.branch}  ${w.pfad}  (${n} geaenderte Dateien)`);
  }
  return [`Worktrees: ${baeume.length}, davon mit ungesicherter Arbeit: ${offen.length}`, ...offen];
}

function stdin() { return readFileSync(0, 'utf8'); }

function main(art) {
  if (art === 'themes-query') return [themesQuery(ladeLiveTheme())];
  if (art === 'themes') return themesZeilen(JSON.parse(stdin()), ladeLiveTheme());
  if (art === 'push') return pushZusammenfassung(stdin());
  if (art === 'worktrees') {
    const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return worktreeZeilen(git(['worktree', 'list', '--porcelain']), (p) => {
      try { return git(['status', '--porcelain'], p).split('\n').filter(Boolean).length; } catch { return 0; }
    });
  }
  console.error('Arten: themes-query | themes | push | worktrees');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(main(process.argv[2]).join('\n'));
}
