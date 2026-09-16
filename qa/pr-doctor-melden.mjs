/**
 * PR-Doctor melden: aus den Befunden von qa/pr-doctor.mjs Kommentare fuer den
 * betroffenen PR bauen und entscheiden, ob einer gepostet werden muss.
 *
 * Reine Funktionen - kein gh, kein git. Der Runner (qa/run-pr-doctor-melden.mjs)
 * holt Befunde und vorhandene Kommentare, diese Datei entscheidet.
 *
 * Idempotenz ueber einen Fingerabdruck: Jeder Kommentar traegt den
 * Fingerabdruck der gemeldeten Befunde im Marker. Gleicher Fingerabdruck wie
 * beim letzten Doctor-Kommentar -> nichts posten. Aendert sich der Befund ->
 * neuer Kommentar. Ist der PR wieder sauber und der letzte Kommentar meldete
 * etwas -> eine kurze Entwarnung, damit keine veraltete Warnung stehen bleibt.
 *
 * Bewusst nur melden, nicht reparieren: Aenderungen mit dem Workflow-Token
 * loesen auf GitHub keine weiteren Workflows aus. Ein Begradigen oder Umzielen
 * aus der CI wuerde also genau die PR-Validierung nicht starten, die es
 * erreichen soll. Die Reparatur macht eine Sitzung mit echtem Token:
 * npm run pr:doctor -- --fix.
 */
import { createHash } from 'node:crypto';

export const MARKER = '<!-- tp-pr-doctor';
export const SAUBER = 'sauber';

const RELEVANT = new Set(['error', 'warn']);

/** Befunde eines PRs, auf die es fuer den Kommentar ankommt (info faellt weg). */
export function relevanteBefunde(findings) {
  return findings.filter(f => RELEVANT.has(f.schwere));
}

/** Stabil und reihenfolgeunabhaengig: gleiche Befunde -> gleicher Abdruck. */
export function fingerprint(findings) {
  const rel = relevanteBefunde(findings);
  if (rel.length === 0) return SAUBER;
  const teile = rel.map(f => `${f.regel}|${f.fix?.art ?? ''}|${f.text}`).sort();
  return createHash('sha256').update(teile.join('\n')).digest('hex').slice(0, 12);
}

/** Liest den Fingerabdruck aus einem vorhandenen Kommentar; null, wenn keiner. */
export function fingerprintAus(body) {
  const m = String(body ?? '').match(/<!-- tp-pr-doctor fingerprint:([0-9a-f]{12}|sauber) -->/);
  return m ? m[1] : null;
}

/**
 * @returns {'posten'|'entwarnen'|'nichts'}
 */
export function entscheide({ letzterFingerprint, aktuellerFingerprint }) {
  if (aktuellerFingerprint === SAUBER) {
    // Sauber: nur entwarnen, wenn zuletzt etwas gemeldet war.
    return letzterFingerprint && letzterFingerprint !== SAUBER ? 'entwarnen' : 'nichts';
  }
  return letzterFingerprint === aktuellerFingerprint ? 'nichts' : 'posten';
}

const ZEILE = {
  konflikt: f => `| Konflikt gegen \`main\` | ${f.text.replace(/^#\d+: /, '')} | im Wegwerf-Worktree aufloesen (CLAUDE.md Punkt 9) |`,
  'basis-nicht-main': f => `| Basis ist nicht \`main\` | ${f.text.replace(/^#\d+: /, '')} | \`npm run pr:doctor -- --fix\` zielt um |`,
  'mehrere-basen': f => `| ueberkreuzte Historie | ${f.text.replace(/^#\d+: /, '')} | \`npm run pr:doctor -- --fix\` begradigt |`,
  'branch-fehlt': f => `| Head-Branch fehlt | ${f.text.replace(/^#\d+: /, '')} | PR schliessen oder Branch wiederherstellen |`,
};

export function baueKommentar({ findings, mainSha = null, runUrl = null }) {
  const rel = relevanteBefunde(findings);
  const fp = fingerprint(findings);
  const zeilen = rel.map(f => (ZEILE[f.regel] ?? (x => `| ${x.regel} | ${x.text} | - |`))(f));
  const stand = mainSha ? ` (\`main\` bei \`${mainSha.slice(0, 7)}\`)` : '';
  const quelle = runUrl ? `\n\nLauf: ${runUrl}` : '';
  return [
    `**PR-Doctor**${stand}: dieser PR ist so nicht mergebar.`,
    '',
    '| Befund | Details | Naechster Schritt |',
    '|---|---|---|',
    ...zeilen,
    '',
    'Automatisch reparieren kann die CI das nicht: Aenderungen mit dem Workflow-Token loesen keine',
    'PR-Validierung aus. Eine Sitzung mit `npm run pr:doctor -- --fix` erledigt Umzielen und Begradigen;',
    'Inhaltskonflikte werden im Wegwerf-Worktree aufgeloest, nie im geteilten Checkout.',
    `${quelle}`,
    '',
    `${MARKER} fingerprint:${fp} -->`,
  ].join('\n');
}

export function baueEntwarnung({ mainSha = null } = {}) {
  const stand = mainSha ? ` (\`main\` bei \`${mainSha.slice(0, 7)}\`)` : '';
  return `**PR-Doctor**${stand}: Befund erledigt, der PR ist gegen \`main\` wieder sauber.\n\n${MARKER} fingerprint:${SAUBER} -->`;
}
