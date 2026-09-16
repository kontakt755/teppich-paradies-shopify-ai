/**
 * PR-Doctor: Entscheidungslogik fuer offene Pull Requests.
 *
 * Reine Funktionen ohne git und gh - der Runner (qa/run-pr-doctor.mjs)
 * sammelt die Fakten, diese Datei bewertet sie. So bleibt die Regel
 * testbar, ohne dass ein Test das Netz braucht.
 *
 * Die Regeln stammen aus einer Woche Handarbeit (2026-09-09 bis -15), in der
 * dieselben vier Faelle immer wieder von Hand geloest wurden:
 *
 *   basis-nicht-main   PR zielt auf einen anderen Branch. Solange dessen PR
 *                      offen ist, ist das ein Stapel und bleibt so. Ist die
 *                      Basis aber schon in main oder geloescht, laeuft fuer
 *                      den PR nie eine Validierung ("MERGEABLE/CLEAN" ohne
 *                      einen einzigen Check) - und ein Loeschen des
 *                      Basis-Branches SCHLIESST ihn (#280 am 2026-09-15).
 *                      Fix: auf main umzielen.
 *   mehrere-basen      Mehr als eine Merge-Basis gegen main. Git merged das
 *                      sauber, GitHub meldet "dirty" ohne merge_commit_sha,
 *                      und ohne Merge-Ref startet kein pull_request-Workflow
 *                      (#328). Fix: ein inhaltlich leerer Merge von main.
 *   konflikt           Echte Inhaltskonflikte. Kein automatischer Fix -
 *                      aufloesen im Wegwerf-Worktree, nie im geteilten
 *                      Checkout, Loeschungen von main uebernehmen, wenn der
 *                      Branch die Datei nur kosmetisch anfasste.
 *   branch-fehlt       Head-Branch existiert auf dem Remote nicht mehr.
 *
 * Reihenfolge der Fixes ist Absicht: erst umzielen, dann begradigen. Ein
 * Begradigen gegen die falsche Basis waere Arbeit am falschen Ziel.
 */

export const REGELN = Object.freeze({
  BRANCH_FEHLT: 'branch-fehlt',
  BASIS_NICHT_MAIN: 'basis-nicht-main',
  MEHRERE_BASEN: 'mehrere-basen',
  KONFLIKT: 'konflikt',
  KEINE_CHECKS: 'keine-checks',
});

export const FIXES = Object.freeze({
  UMZIELEN: 'umzielen',
  BEGRADIGEN: 'begradigen',
});

/**
 * @param {object} pr
 * @param {number} pr.nummer
 * @param {string} pr.head            Head-Branch
 * @param {string} pr.basis           Basis-Branch laut GitHub
 * @param {boolean} pr.draft
 * @param {boolean} pr.headExistiert  origin/<head> vorhanden
 * @param {boolean|null} pr.basisExistiert   origin/<basis> vorhanden (null bei main)
 * @param {boolean|null} pr.basisGemergt     origin/<basis> ist Vorfahr von origin/main (null bei main)
 * @param {number} pr.mergeBasen      Anzahl Merge-Basen gegen origin/main
 * @param {string[]} pr.konflikte     Dateien mit Konflikt gegen origin/main
 * @param {number} pr.checks          Anzahl gemeldeter Checks
 * @param {string} [hauptBranch='main']
 */
export function bewerte(pr, hauptBranch = 'main') {
  const findings = [];
  const add = (regel, schwere, text, fix = null) =>
    findings.push({ nummer: pr.nummer, head: pr.head, regel, schwere, text, fix });

  if (!pr.headExistiert) {
    add(REGELN.BRANCH_FEHLT, 'error',
      `#${pr.nummer}: Head-Branch ${pr.head} existiert auf dem Remote nicht mehr - PR ist nicht mergebar und nicht reparierbar.`);
    return findings;
  }

  if (pr.basis !== hauptBranch) {
    if (pr.basisExistiert === false || pr.basisGemergt === true) {
      const grund = pr.basisExistiert === false
        ? `Basis-Branch ${pr.basis} ist geloescht`
        : `Basis-Branch ${pr.basis} ist bereits in ${hauptBranch}`;
      add(REGELN.BASIS_NICHT_MAIN, 'warn',
        `#${pr.nummer}: ${grund}; ohne Basis ${hauptBranch} laeuft keine PR-Validierung.`,
        { art: FIXES.UMZIELEN, neueBasis: hauptBranch });
    } else {
      add(REGELN.BASIS_NICHT_MAIN, 'info',
        `#${pr.nummer}: gestapelt auf ${pr.basis} (offen). Vor dem Merge der Basis auf ${hauptBranch} umzielen - Branch-Loeschung schliesst ihn sonst.`);
    }
  }

  if (pr.konflikte.length > 0) {
    add(REGELN.KONFLIKT, 'error',
      `#${pr.nummer}: ${pr.konflikte.length} Konflikt(e) gegen ${hauptBranch}: ${pr.konflikte.join(', ')}`);
  } else if (pr.mergeBasen > 1) {
    // Nur begradigen, wenn der Merge auch sauber durchlaeuft - sonst waere
    // der Fix selbst ein Konflikt.
    add(REGELN.MEHRERE_BASEN, 'warn',
      `#${pr.nummer}: ${pr.mergeBasen} Merge-Basen gegen ${hauptBranch}; GitHub meldet so einen PR als dirty und startet keine Validierung.`,
      { art: FIXES.BEGRADIGEN });
  }

  if (pr.basis === hauptBranch && pr.checks === 0 && pr.konflikte.length === 0 && pr.mergeBasen <= 1) {
    add(REGELN.KEINE_CHECKS, 'info',
      `#${pr.nummer}: keine Checks gemeldet - Validierung laeuft vermutlich noch oder wurde nie ausgeloest.`);
  }

  return findings;
}

export function bewerteAlle(prs, hauptBranch = 'main') {
  return prs.flatMap(pr => bewerte(pr, hauptBranch));
}

export function zusammenfassung(findings) {
  const zaehle = (pred) => findings.filter(pred).length;
  return {
    fehler: zaehle(f => f.schwere === 'error'),
    warnungen: zaehle(f => f.schwere === 'warn'),
    konflikte: zaehle(f => f.regel === REGELN.KONFLIKT),
    umzielen: zaehle(f => f.fix?.art === FIXES.UMZIELEN),
    begradigen: zaehle(f => f.fix?.art === FIXES.BEGRADIGEN),
  };
}
