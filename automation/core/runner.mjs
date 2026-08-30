import path from 'node:path';
import { validateManifest } from './manifest.mjs';
import { RunLock } from './run-lock.mjs';
import { StateStore, StateWriteError, TERMINAL_STATUSES } from './state-store.mjs';
import { routeRiskDecision } from './risk-guard.mjs';
import { DEFAULT_MAX_REVIEW_ROUNDS, DEFAULT_PROVIDER_TIMEOUT_MS, runReviewCorrectionCycle } from './review-cycle.mjs';
import { evaluateQualityGates } from './quality-gates.mjs';
import { routeTaskPolicy, usesAutonomyPolicy } from './task-router.mjs';

export class RunnerStoppedError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'RunnerStoppedError';
  }
}

export class MissingPostflightDataError extends Error {
  constructor(field) {
    super(`Missing required postflight data: ${field}`);
    this.name = 'MissingPostflightDataError';
  }
}

function requireArray(result, field) {
  if (!Array.isArray(result?.[field])) throw new MissingPostflightDataError(field);
  return result[field];
}

function requireActualOperations(result, task) {
  if (!Array.isArray(result?.actualOperations)) throw new MissingPostflightDataError('actualOperations');
  return result.actualOperations;
}

export class ManifestRunner {
  constructor({ manifest, stateDir, executeTask, reviewTask = null, correctTask = null, maxReviewRounds = DEFAULT_MAX_REVIEW_ROUNDS, providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS, riskGuard = null, diffBudgetGuard = null, specGuard = null, taskRouter = routeTaskPolicy, qualityGateEvaluator = evaluateQualityGates, needsAhmetPath = null, io, clock = () => new Date() }) {
    this.manifest = validateManifest(manifest);
    this.store = new StateStore({ stateDir, io, clock });
    this.lock = new RunLock({ lockPath: path.join(stateDir, 'run.lock'), io, now: clock });
    this.executeTask = executeTask ?? (async () => ({ status: 'PASS' }));
    this.reviewTask = reviewTask;
    this.correctTask = correctTask;
    this.maxReviewRounds = maxReviewRounds;
    this.providerTimeoutMs = providerTimeoutMs;
    this.riskGuard = riskGuard;
    this.diffBudgetGuard = diffBudgetGuard;
    this.specGuard = specGuard;
    this.taskRouter = taskRouter;
    this.qualityGateEvaluator = qualityGateEvaluator;
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
      if (['RUNNING', 'IMPLEMENT', 'REVIEW', 'CORRECT', 'REVIEW_FINDINGS'].includes(state.status)) state = { ...state, status: 'PENDING', interruptedAt: this.clock().toISOString(), updatedAt: this.clock().toISOString() };
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

  validateCandidate(task, candidate, { reviewRound }) {
    if (this.diffBudgetGuard) return this.diffBudgetGuard.evaluate({
      task,
      entries: requireArray(candidate, 'diffEntries'),
      actualOperations: reviewRound > 0 ? requireActualOperations(candidate, task) : (candidate?.actualOperations ?? task.allowedOperations),
      resources: requireArray(candidate, 'resources')
    });
    if (this.riskGuard) return this.riskGuard.postflight({
      task,
      changedFiles: requireArray(candidate, 'changedFiles'),
      actualOperations: reviewRound > 0 ? requireActualOperations(candidate, task) : (candidate?.actualOperations ?? task.allowedOperations),
      resources: requireArray(candidate, 'resources')
    });
    return null;
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
          const routingPolicy = this.taskRouter(task);
          if (riskEvaluation.effectiveRisk === 'HIGH') {
            routeRiskDecision({ task, evaluation: riskEvaluation, statePath: this.store.taskPath(task.id), needsAhmetPath: this.needsAhmetPath, io: this.store.io, now: this.clock });
            this.updateTask(states, task, 'NEEDS_AHMET', { reason: 'HIGH tasks never run autonomously' });
            progress = true;
            continue;
          }
          const dependencies = task.dependencies.map(id => states.get(id));
          if (dependencies.some(dep => ['FAIL', 'PARKED', 'NEEDS_AHMET', 'SKIPPED_DEPENDENCY', 'BLOCKED', 'CORRECTION_REQUIRED', 'REVIEW_LIMIT_REACHED', 'HARD_FAIL', 'SECURITY_STOP'].includes(dep.status))) {
            this.updateTask(states, task, 'SKIPPED_DEPENDENCY', { reason: 'Dependency did not pass' });
            progress = true;
            continue;
          }
          if (!dependencies.every(dep => dep.status === 'PASS')) continue;
          const specCheck = this.specGuard ? this.specGuard.evaluate({ task, policy: routingPolicy }) : null;
          if (specCheck && specCheck.status !== 'PASS') {
            this.updateTask(states, task, 'BLOCKED', { reason: `Spec check returned ${specCheck.status}`, routingPolicy, specCheck });
            progress = true;
            continue;
          }
          this.updateTask(states, task, 'RUNNING', { attempts: current.attempts + 1, startedAt: this.clock().toISOString(), routingPolicy, specCheck });
          const transitionHistory = [];
          let postflight = null;
          const review = usesAutonomyPolicy(task) && !routingPolicy.review.required ? null : this.reviewTask;
          const result = await runReviewCorrectionCycle({
            task,
            implement: this.executeTask,
            review,
            correct: this.correctTask,
            validateCandidate: (validatedTask, candidate, metadata) => {
              postflight = this.validateCandidate(validatedTask, candidate, metadata);
              return postflight;
            },
            maxReviewRounds: this.maxReviewRounds,
            providerTimeoutMs: this.providerTimeoutMs,
            onState: transition => {
              transitionHistory.push({ ...transition, at: this.clock().toISOString() });
              this.updateTask(states, task, transition.status, { reviewRound: transition.reviewRound, maxReviewRounds: transition.maxReviewRounds, findings: transition.findings ?? null, transitionHistory });
            },
          });
          let status = result?.status ?? 'FAIL';
          const qualityGates = usesAutonomyPolicy(task) && status === 'PASS'
            ? this.qualityGateEvaluator({ policy: routingPolicy, result, postflight, specCheck })
            : null;
          if (qualityGates && !qualityGates.releaseReady) status = 'BLOCKED';
          if (!['PASS', 'FAIL', 'PARKED', 'BLOCKED', 'CORRECTION_REQUIRED', 'REVIEW_LIMIT_REACHED', 'HARD_FAIL', 'SECURITY_STOP'].includes(status)) throw new Error(`Executor returned invalid status ${status}`);
          this.updateTask(states, task, status, { result: result?.result ?? null, postflight, routingPolicy, specCheck, qualityGates, reviewRound: result?.reviewRound ?? 0, maxReviewRounds: result?.maxReviewRounds ?? this.maxReviewRounds, findings: result?.findings ?? null, transitionHistory, finishedAt: this.clock().toISOString() });
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
