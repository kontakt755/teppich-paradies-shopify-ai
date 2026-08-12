import { spawnSync } from 'node:child_process';

export const NOTIFICATION_EVENTS = Object.freeze(new Set([
  'RUN_COMPLETE', 'HARD_STOP', 'ALLOWLIST_VIOLATION', 'PROVIDER_SWITCH', 'NEEDS_AHMET', 'CRITICAL_BLOCKER'
]));
export const SOUND_EVENTS = Object.freeze(new Set(NOTIFICATION_EVENTS));
const MAX_MESSAGE = 240;
const REDACTIONS = [
  /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g,
  /\bshp(?:at|ca|cs|pa|ss)_[A-Za-z0-9]{20,}\b/gi,
  /-----BEGIN[\s\S]*?PRIVATE KEY-----/g,
  /\b(?:password|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi
];

export function safeNotificationMessage(message) {
  let safe = String(message ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const pattern of REDACTIONS) safe = safe.replace(pattern, '[REDACTED]');
  return (safe || 'Orchestrator event').slice(0, MAX_MESSAGE);
}

export class NotificationAdapter {
  constructor({ notifierPath, dryRun = false, run = spawnSync, logger = console } = {}) {
    this.notifierPath = notifierPath;
    this.dryRun = dryRun;
    this.run = run;
    this.logger = logger;
  }

  notify({ eventType, taskId = null, message = '' }) {
    if (!NOTIFICATION_EVENTS.has(eventType)) return { status: 'SKIPPED', eventType, reason: 'EVENT_NOT_NOTIFIABLE' };
    const safeTaskId = String(taskId ?? 'RUN').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64) || 'RUN';
    const safeMessage = safeNotificationMessage(message);
    const payload = { type: SOUND_EVENTS.has(eventType) ? 'agent-turn-complete' : 'orchestrator-event', 'last-assistant-message': `[${eventType}] ${safeTaskId}: ${safeMessage}` };
    if (this.dryRun) return { status: 'DRY_RUN', eventType, taskId: safeTaskId, sound: SOUND_EVENTS.has(eventType), message: safeMessage };
    try {
      if (!this.notifierPath) throw new Error('Notifier path is not configured');
      const result = this.run(process.execPath, [this.notifierPath, JSON.stringify(payload)], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
      if (result?.error || (Number.isInteger(result?.status) && result.status !== 0)) throw result.error ?? new Error(`Notifier exit ${result.status}`);
      return { status: 'SENT', eventType, taskId: safeTaskId };
    } catch (error) {
      this.logger.error?.('NOTIFICATION_FAILED', { eventType, taskId: safeTaskId, errorClass: error.name });
      return { status: 'FAILED', eventType, taskId: safeTaskId, errorClass: error.name };
    }
  }
}
