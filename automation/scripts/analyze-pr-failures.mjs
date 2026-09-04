#!/usr/bin/env node
/**
 * PR Failure Analyzer: Analysiert fehlgeschlagene GitHub Actions Validierungen,
 * identifiziert Fehler, speichert Lösungen in der Fehlerdatenbank und wendet
 * automatische Fixes an.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dbDir = join(projectDir, 'automation', 'database');
const fixesDbPath = join(dbDir, 'error-fixes.json');

// Bekannte Fehler + Automatische Lösungen
const KNOWN_FAILURES = [
  {
    id: 'secret-scanner-shopify-token',
    pattern: /SHOPIFY_TOKEN.*\.env\.local\.example|\.env\.local\.example.*SHOPIFY_TOKEN/i,
    description: 'Secret Scanner: .env.local.example enthält Shopify-Token-Format',
    solution: 'Ersetze shpat_xxx mit <your-token-here>',
    autoFix: async () => {
      const envFile = join(projectDir, '.env.local.example');
      if (existsSync(envFile)) {
        let content = readFileSync(envFile, 'utf8');
        content = content.replace(/shpat_[x_]*/g, '<your-shopify-admin-token-here>');
        writeFileSync(envFile, content);
        return { fixed: true, file: '.env.local.example' };
      }
      return { fixed: false };
    },
  },
  {
    id: 'theme-id-in-docs',
    pattern: /theme.*id.*[0-9]{15,}|deprecated.*theme.*id/i,
    description: 'Theme-ID als Prosa in Dokumentation veraltet',
    solution: 'Theme-ID aus CLAUDE.md/AGENTS.md entfernen, nutze domains/shopify/live-theme.json',
    autoFix: null, // Keine automatische Lösung möglich
  },
  {
    id: 'invalid-liquid',
    pattern: /invalid.*liquid|liquid.*syntax.*error|Could not find asset/i,
    description: 'Ungültiges Liquid-Code — Shopify verwirft die Datei stillschweigend',
    solution: 'npm run liquid:guard ausführen und Fehler beheben',
    autoFix: null,
  },
];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadFixesDb() {
  if (!existsSync(fixesDbPath)) {
    return {
      version: 1,
      repository: 'kontakt755/teppich-paradies-shopify-ai',
      generatedAt: new Date().toISOString(),
      failures: [],
    };
  }
  return JSON.parse(readFileSync(fixesDbPath, 'utf8'));
}

function saveFixesDb(db) {
  ensureDir(dbDir);
  writeFileSync(fixesDbPath, JSON.stringify(db, null, 2));
}

async function analyzePRFailure(prNumber, runId) {
  try {
    // Lese Workflow-Logs
    const logs = execFileSync('gh', [
      'run',
      'view',
      String(runId),
      '--log',
      '--repo',
      process.env.GITHUB_REPOSITORY || 'kontakt755/teppich-paradies-shopify-ai',
    ], { encoding: 'utf8', timeout: 30_000 });

    const logText = logs.toString();
    const db = loadFixesDb();

    // Prüfe auf bekannte Fehler
    for (const knownFailure of KNOWN_FAILURES) {
      if (knownFailure.pattern.test(logText)) {
        const failure = {
          id: knownFailure.id,
          prNumber,
          runId,
          detectedAt: new Date().toISOString(),
          description: knownFailure.description,
          solution: knownFailure.solution,
          logExcerpt: logText.split('\n').filter(line => knownFailure.pattern.test(line)).slice(0, 3).join('\n'),
          autoFixed: false,
          fixDetails: null,
        };

        // Versuche Auto-Fix
        if (knownFailure.autoFix) {
          try {
            const fixResult = await knownFailure.autoFix();
            if (fixResult.fixed) {
              failure.autoFixed = true;
              failure.fixDetails = fixResult;
              console.log(`✅ Auto-Fix angewendet: ${knownFailure.id}`);
            }
          } catch (fixError) {
            console.error(`⚠️  Auto-Fix fehlgeschlagen: ${fixError.message}`);
          }
        }

        // Speichere in DB
        const existingIndex = db.failures.findIndex(f => f.id === knownFailure.id && f.prNumber === prNumber);
        if (existingIndex >= 0) {
          db.failures[existingIndex] = failure;
        } else {
          db.failures.push(failure);
        }

        console.log(`📝 Fehler dokumentiert: ${knownFailure.id} (PR #${prNumber})`);
      }
    }

    db.generatedAt = new Date().toISOString();
    saveFixesDb(db);

    return { analyzed: true, failures: db.failures.length };
  } catch (error) {
    if (error.message.includes('ENOENT') || error.message.includes('gh')) {
      console.warn('GitHub CLI nicht verfügbar — Fehleranalyse übersprungen.');
      return { analyzed: false };
    }
    console.error(`Fehleranalyse fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
    return { analyzed: false };
  }
}

// Main
async function main() {
  const prNumber = process.env.PR_NUMBER || process.argv[2];
  const runId = process.env.RUN_ID || process.argv[3];

  if (!prNumber || !runId) {
    console.error('Verwendung: PR_NUMBER=<nr> RUN_ID=<id> node analyze-pr-failures.mjs');
    process.exitCode = 1;
    return;
  }

  await analyzePRFailure(prNumber, runId);
}

main();
