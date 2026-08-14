import fs from 'node:fs';
import path from 'node:path';

export const TASK_STATUSES = Object.freeze([
  'PENDING', 'RUNNING', 'PASS', 'FAIL', 'PARKED', 'NEEDS_AHMET',
  'SKIPPED_DEPENDENCY', 'BLOCKED', 'IMPLEMENT', 'REVIEW', 'CORRECT',
  'REVIEW_FINDINGS', 'CORRECTION_REQUIRED', 'REVIEW_LIMIT_REACHED',
  'HARD_FAIL', 'SECURITY_STOP'
]);

export const TERMINAL_STATUSES = new Set([
  'PASS', 'FAIL', 'PARKED', 'NEEDS_AHMET', 'SKIPPED_DEPENDENCY', 'BLOCKED',
  'CORRECTION_REQUIRED', 'REVIEW_LIMIT_REACHED', 'HARD_FAIL', 'SECURITY_STOP'
]);

export class StateWriteError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'StateWriteError';
  }
}

export function atomicWriteJson(filePath, value, io = fs) {
  const directory = path.dirname(filePath);
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    io.mkdirSync(directory, { recursive: true });
    io.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    io.renameSync(temporary, filePath);
  } catch (error) {
    try { io.rmSync(temporary, { force: true }); } catch {}
    throw new StateWriteError(`Atomic state write failed for ${filePath}`, { cause: error });
  }
}

export function readJson(filePath, io = fs) {
  return JSON.parse(io.readFileSync(filePath, 'utf8'));
}

export class StateStore {
  constructor({ stateDir, io = fs, clock = () => new Date() }) {
    this.stateDir = stateDir;
    this.io = io;
    this.clock = clock;
    this.runPath = path.join(stateDir, 'run-state.json');
  }

  taskPath(taskId) {
    return path.join(this.stateDir, 'tasks', `${taskId}.json`);
  }

  writeRun(state) {
    atomicWriteJson(this.runPath, state, this.io);
  }

  writeTask(taskId, state) {
    if (!TASK_STATUSES.includes(state.status)) throw new Error(`Unknown task status: ${state.status}`);
    atomicWriteJson(this.taskPath(taskId), state, this.io);
  }

  readRun() {
    return this.io.existsSync(this.runPath) ? readJson(this.runPath, this.io) : null;
  }

  readTask(taskId) {
    const filePath = this.taskPath(taskId);
    return this.io.existsSync(filePath) ? readJson(filePath, this.io) : null;
  }

  heartbeat(runState) {
    const next = { ...runState, heartbeatAt: this.clock().toISOString() };
    this.writeRun(next);
    return next;
  }
}
