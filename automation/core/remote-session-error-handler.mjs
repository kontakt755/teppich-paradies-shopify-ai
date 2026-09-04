/**
 * Remote-Session Error Handler
 * Erkennt und loggt Fehler bei jordanshop.de Importen in Remote-Sessions
 * (z.B. Egress-Policy blockiert externe Domains)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

const KNOWN_REMOTE_SESSION_ERRORS = [
  {
    id: 'JORDANSHOP_EGRESS_POLICY_BLOCKED',
    pattern: /403.*Egress-Policy|jordanshop\.de.*blocked|external.*domain.*blocked/i,
    title: 'Remote-Session: jordanshop.de Zugriff blockiert',
    description: `Die Remote-Session (claude.ai/code) blockiert externe Domains wie jordanshop.de per Egress-Policy.

**Fehler:** Egress-Policy blocked jordanshop.de
**Betroffen:** jordanshop.de Produktimport
**Lösung:** Auf lokal wechseln — der Import braucht Browser-Zugriff auf jordanshop.de

Betroffene Skill: \`teppichparadies-jordanshop-import\`
`,
    labels: ['type: external-limitation', 'area: jordanshop-import', 'priority: p2'],
    severity: 'warning',
  },
];

export function isRemoteSession() {
  return process.env.CLAUDE_CODE_REMOTE === 'true';
}

export function logError({ errorId, errorMessage, errorContext = {} }) {
  const dbDir = path.join(projectDir, 'automation', 'database');
  const errorLogPath = path.join(dbDir, 'remote-session-errors.json');

  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  let log = { errors: [] };
  if (fs.existsSync(errorLogPath)) {
    try {
      log = JSON.parse(fs.readFileSync(errorLogPath, 'utf8'));
    } catch (e) {
      // Datei beschädigt, überschreiben
    }
  }

  log.errors.push({
    id: errorId,
    message: errorMessage,
    context: errorContext,
    timestamp: new Date().toISOString(),
    sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
  });

  // Keep only last 100 errors
  log.errors = log.errors.slice(-100);

  fs.writeFileSync(errorLogPath, JSON.stringify(log, null, 2));
  return errorLogPath;
}

export function checkRemoteSessionErrors() {
  if (!isRemoteSession()) return null;

  const errorLogPath = path.join(projectDir, 'automation', 'database', 'remote-session-errors.json');
  if (!fs.existsSync(errorLogPath)) return null;

  const log = JSON.parse(fs.readFileSync(errorLogPath, 'utf8'));
  const recentErrors = log.errors
    .filter(e => {
      const timestamp = new Date(e.timestamp);
      const now = new Date();
      return (now - timestamp) < 1000 * 60 * 60; // Letzte 1 Stunde
    });

  return recentErrors.length > 0 ? recentErrors : null;
}

export function getErrorTemplate(errorId) {
  return KNOWN_REMOTE_SESSION_ERRORS.find(e => e.id === errorId);
}

export function getAllErrorTemplates() {
  return KNOWN_REMOTE_SESSION_ERRORS;
}
