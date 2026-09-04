#!/usr/bin/env node
/**
 * Erstellt GitHub Issues für bekannte Remote-Session Fehler
 * Wird vom SessionStart-Hook aufgerufen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  checkRemoteSessionErrors,
  getErrorTemplate,
  isRemoteSession
} from '../core/remote-session-error-handler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

async function createOrUpdateIssue(errorTemplate, recentError) {
  try {
    // Prüfe, ob Issue bereits existiert (anhand des Titels)
    const searchResult = execSync(
      `gh issue list --search "${errorTemplate.title}" --limit 5 --json number,title,state`,
      { encoding: 'utf8' }
    );

    const issues = JSON.parse(searchResult || '[]');
    const existingOpen = issues.find(i => i.state === 'OPEN' && i.title === errorTemplate.title);

    if (existingOpen) {
      console.log(`ℹ️  Issue #${existingOpen.number} existiert bereits (offen)`);
      return existingOpen.number;
    }

    // Erstelle neues Issue
    const body = `${errorTemplate.description}

## Details
- **Error ID:** \`${errorTemplate.id}\`
- **Severity:** ${errorTemplate.severity}
- **Session:** \`${process.env.CLAUDE_SESSION_ID || 'unknown'}\`
- **Timestamp:** ${recentError.timestamp}
- **Message:** \`${recentError.message}\`

## Empfohlene Aktion
Die Lösung ist dokumentiert — siehe oben. Dieser Issue kann geschlossen werden, wenn ein Arbeiter dieses Limit umgangen hat oder lokal arbeitet.

---
_Automatisch erstellt von remote-session-error-handler_`;

    const createCmd = `gh issue create --title "${errorTemplate.title}" --body "${body.replace(/"/g, '\\"')}" ${
      errorTemplate.labels.map(l => `--label "${l}"`).join(' ')
    }`;

    const result = execSync(createCmd, { encoding: 'utf8' });
    const issueNumber = result.match(/#(\d+)/)?.[1];

    console.log(`✅ Issue #${issueNumber} erstellt für: ${errorTemplate.id}`);
    return issueNumber;
  } catch (error) {
    console.error(`⚠️  Konnte Issue nicht erstellen:`, error.message);
    return null;
  }
}

async function main() {
  if (!isRemoteSession()) {
    // Keine Remote-Session, skip
    return;
  }

  const errors = checkRemoteSessionErrors();
  if (!errors || errors.length === 0) {
    return;
  }

  console.log('🔍 Remote-Session Fehler gefunden, erstelle Issues...\n');

  for (const error of errors) {
    const template = getErrorTemplate(error.id);
    if (template) {
      await createOrUpdateIssue(template, error);
    }
  }
}

main().catch(err => {
  console.error('Fehler beim Issue-Erstellen:', err.message);
  process.exitCode = 1;
});
