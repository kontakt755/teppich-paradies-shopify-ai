#!/usr/bin/env node
/**
 * Remote-Session Alert System
 * Sendet Alarme für bekannte Remote-Session Fehler
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotificationAdapter } from '../core/notification-adapter.mjs';
import {
  checkRemoteSessionErrors,
  getErrorTemplate,
  isRemoteSession
} from '../core/remote-session-error-handler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

function main() {
  if (!isRemoteSession()) {
    return;
  }

  const errors = checkRemoteSessionErrors();
  if (!errors || errors.length === 0) {
    return;
  }

  const notifier = new NotificationAdapter({
    notifierPath: path.join(projectDir, 'node_modules/.bin/notification-service'),
    logger: console,
  });

  for (const error of errors) {
    const template = getErrorTemplate(error.id);
    if (template) {
      const message = `${template.id}: ${error.message} — Wechsel zu lokal erforderlich`;
      notifier.notify({
        eventType: 'CRITICAL_BLOCKER',
        taskId: `remote-session-${template.id}`,
        message,
      });

      console.log(`🚨 Alarm gesendet für ${template.id}`);
    }
  }
}

main();
