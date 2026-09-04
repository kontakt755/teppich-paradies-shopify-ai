#!/usr/bin/env node
/**
 * SessionStart-Router: Klassifiziert alle offenen GitHub-Issues
 * und speichert die Ergebnisse in der Fehler-Datenbank.
 *
 * Wird vom SessionStart-Hook aufgerufen (nur in Remote-Sessions).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { routeTask } from '../../workflow/router.mjs';
import { listOpenIssues } from '../../automation/dashboard/github-issues.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dbDir = join(projectDir, 'automation', 'database');
const dbPath = join(dbDir, 'error-db.json');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function classifyIssues() {
  try {
    let issues;
    try {
      issues = listOpenIssues();
    } catch (ghError) {
      if (ghError.message.includes('ENOENT') || ghError.message.includes('gh')) {
        console.warn('GitHub CLI (gh) nicht verfügbar — Router-Klassifizierung übersprungen.');
        return;
      }
      throw ghError;
    }
    const classified = issues.map(issue => {
      const routing = routeTask({
        text: `${issue.title}\n\n${issue.url}`,
        branch: null,
        head: null,
      });
      return {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        labels: issue.labels,
        routing: {
          taskClass: routing.taskClass,
          executionMode: routing.executionMode,
          implementer: routing.implementer,
          reviewRequired: routing.reviewRequired,
          humanGateRequired: routing.humanGateRequired,
          protectedActions: routing.protectedActions,
        },
        classifiedAt: new Date().toISOString(),
      };
    });

    ensureDir(dbDir);
    writeFileSync(dbPath, JSON.stringify({
      version: 1,
      repository: 'kontakt755/teppich-paradies-shopify-ai',
      generatedAt: new Date().toISOString(),
      summary: {
        total: classified.length,
        classA: classified.filter(i => i.routing.taskClass === 'A').length,
        classB: classified.filter(i => i.routing.taskClass === 'B').length,
        classC: classified.filter(i => i.routing.taskClass === 'C').length,
        classD: classified.filter(i => i.routing.taskClass === 'D').length,
        needsHumanGate: classified.filter(i => i.routing.humanGateRequired).length,
      },
      issues: classified,
    }, null, 2));

    // Summary ausgeben
    console.log(`Router-Klassifizierung: ${classified.length} Issue(s)`);
    console.log(`  A: ${classified.filter(i => i.routing.taskClass === 'A').length}`);
    console.log(`  B: ${classified.filter(i => i.routing.taskClass === 'B').length}`);
    console.log(`  C: ${classified.filter(i => i.routing.taskClass === 'C').length}`);
    console.log(`  D: ${classified.filter(i => i.routing.taskClass === 'D').length}`);
    if (classified.filter(i => i.routing.humanGateRequired).length > 0) {
      console.log(`  ⚠️  ${classified.filter(i => i.routing.humanGateRequired).length} braucht Human-Gate`);
    }

  } catch (error) {
    if (error.code === 'ENOENT' && error.message.includes('gh')) {
      console.warn('gh CLI nicht verfügbar, Router-Klassifizierung übersprungen.');
      return;
    }
    console.error(`Router-Fehler: ${error.message}`);
    process.exitCode = 1;
  }
}

classifyIssues();
