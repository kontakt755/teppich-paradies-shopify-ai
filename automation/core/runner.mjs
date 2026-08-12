import path from 'node:path';
import { validateManifest } from './manifest.mjs';
import { RunLock } from './run-lock.mjs';
import { StateStore, StateWriteError, TERMINAL_STATUSES } from './state-store.mjs';
import { routeRiskDecision } from './risk-guard.mjs';

export class RunnerStoppedError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'RunnerStoppedError';
  }
}

export class ManifestRunner {
  constructor({ manifest, stateDir, executeTask, riskGuard = null, diffBudgetGuard = null, needsAhmetPath = null, io, clock = () => new Date() }) {
    this.manifest = validateManifest(manifest);
    this.store = new StateStore({ stateDir, io, clock });
    this.lock = new RunLock({ lockPath: path.join(stateDir, 'run.lock'), io, now: clock });
    this.executeTask = executeTask ?? (async () => ({ status: 'PASS' }));
    this.riskGuard = riskGuard;
    this.diffBudgetGuard = diffBudgetGuard;
    this.needsAhmetPath = needsAhmetPath ?? path.join(stateDir, 'needs-ahmet.md');
    this.clock = clock;
  }

  initialTaskState(task) {
    return { taskId: task.id, status: task.risk === 'HIGH' ? 'NEEDS_AHMET' : 'PENDING', attempts: 0, updatedAt: this.clock().toISOString() };
  }

  loadStates() {
    const states = new Map();
    for (const task of this.manifest.tasks) {
      let state = this.store.readTask(task.id) ?? this.initialTaskState(task);
      if (state.status === 'RUNNING') state = { ...state, status: 'PENDING', interruptedAt: this.clock().toISOString(), updatedAt: this.clock().toISOString() };
      this.store.writeTask(task.id, state);
      states.set(task.id, state);
    }
    return states;
  }

  updateTask(states, task, status, extra = {}) {
    const state = { ...states.get(task.id), ...extra, taskId: task.id, status, updatedAt: this.clock().toISOString() };
    this.store.writeTask(task.id, state);
    states.set(task.id, state);
    return state;
  }

  allTerminal(states) {
    return this.manifest.tasks.every(task => TERMINAL_STATUSES.has(states.get(task.id).status));
  }

  roadMapBlockComplete(states) {
    return this.manifest.tasks.filter(task => task.risk !== 'HIGH').every(task =>
      ['PASS', 'PARKED', 'SKIPPED_DEPENDENCY', 'NEEDS_AHMET'].includes(states.get(task.id).status)
    );
  }

  async run() {
    this.lock.acquire(this.manifest.runId);
    let runState = { runId: this.manifest.runId, status: 'RUNNING', startedAt: this.clock().toISOString(), heartbeatAt: this.clock().toISOString() };
    try {
      const states = this.loadStates();
      this.store.writeRun(runState);
      let progress = true;
      while (!this.allTerminal(states) && progress) {
        progress = false;
        runState = this.store.heartbeat(runState);
        for (const task of this.manifest.tasks) {
          const current = states.get(task.id);
          if (TERMINAL_STATUSES.has(current.status) || current.status === 'RUNNING') continue;
          const riskEvaluation = this.riskGuard ? this.riskGuard.evaluate({ task }) : { effectiveRisk: task.risk };
          if (riskEvaluation.effectiveRisk === 'HIGH') {
            routeRiskDecision({ task, evaluation: riskEvaluation, statePath: this.store.taskPath(task.id), needsAhmetPath: this.needsAhmetPath, io: this.store.io, now: this.clock });
            this.updateTask(states, task, 'NEEDS_AHMET', { reason: 'HIGH tasks never run autonomously' });
            progress = true;
            continue;
          }
          const dependencies = task.dependencies.map(id => states.get(id));
          if (dependencies.some(dep => ['FAIL', 'PARKED', 'NEEDS_AHMET', 'SKIPPED_DEPENDENCY', 'BLOCKED'].includes(dep.status))) {
            this.updateTask(states, task, 'SKIPPED_DEPENDENCY', { reason: 'Dependency did not pass' });
            progress = true;
            continue;
          }
          if (!dependencies.every(dep => dep.status === 'PASS')) continue;
          this.updateTask(states, task, 'RUNNING', { attempts: current.attempts + 1, startedAt: this.clock().toISOString() });
          const result = await this.executeTask(task);
          if (this.diffBudgetGuard) this.diffBudgetGuard.evaluate({
            task,
            entries: result?.diffEntries ?? [],
            actualOperations: result?.actualOperations ?? task.allowedOperations,
            resources: result?.resources ?? []
          });
          else if (this.riskGuard) this.riskGuard.postflight({
            task,
            changedFiles: result?.changedFiles ?? [],
            actualOperations: result?.actualOperations ?? task.allowedOperations,
            resources: result?.resources ?? []
          });
          const status = result?.status ?? 'FAIL';
          if (!['PASS', 'FAIL', 'PARKED', 'BLOCKED'].includes(status)) throw new Error(`Executor returned invalid status ${status}`);
          this.updateTask(states, task, status, { result: result?.result ?? null, finishedAt: this.clock().toISOString() });
          progress = true;
        }
      }
      if (!this.allTerminal(states)) {
        for (const task of this.manifest.tasks) if (!TERMINAL_STATUSES.has(states.get(task.id).status)) {
          this.updateTask(states, task, 'BLOCKED', { reason: 'No runnable task; dependency cycle or unresolved state' });
        }
      }
      runState = { ...runState, status: 'COMPLETE', completedAt: this.clock().toISOString(), roadMapBlockComplete: this.roadMapBlockComplete(states) };
      this.store.writeRun(runState);
      return { runState, tasks: Object.fromEntries(states) };
    } catch (error) {
      try { this.store.writeRun({ ...runState, status: 'STOPPED', stoppedAt: this.clock().toISOString(), errorClass: error.name }); } catch {}
      if (error instanceof StateWriteError) throw new RunnerStoppedError('Runner stopped because state or heartbeat could not be written', { cause: error });
      throw error;
    } finally {
      this.lock.release();
    }
  }
}
