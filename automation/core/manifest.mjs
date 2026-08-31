const ALLOWED_RISKS = new Set(['LOW', 'MEDIUM', 'HIGH']);
const ALLOWED_TASK_TYPES = new Set(['ANALYSIS', 'PLAN', 'IMPLEMENTATION', 'REVIEW', 'CORRECTION', 'TEST']);
const ALLOWED_MODEL_CLASSES = new Set(['LIGHT', 'STANDARD', 'PREMIUM']);
const ALLOWED_EFFORT_LEVELS = new Set(['low', 'medium', 'high']);

function optionalStringArray(task, field) {
  if (task[field] !== undefined && (!Array.isArray(task[field]) || task[field].some(value => typeof value !== 'string' || !value.trim()))) {
    throw new Error(`Task ${task.id} ${field} must be an array of non-empty strings`);
  }
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest must be an object');
  if (!manifest.runId || typeof manifest.runId !== 'string') throw new Error('Manifest runId is required');
  if (!Array.isArray(manifest.tasks) || !manifest.tasks.length) throw new Error('Manifest tasks must be a non-empty array');
  const ids = new Set();
  for (const task of manifest.tasks) {
    if (!task.id || typeof task.id !== 'string') throw new Error('Every task requires an id');
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
    if (!task.domain || typeof task.domain !== 'string') throw new Error(`Task ${task.id} requires a domain`);
    if (!ALLOWED_RISKS.has(task.risk)) throw new Error(`Task ${task.id} has invalid risk`);
    if (!Array.isArray(task.dependencies)) throw new Error(`Task ${task.id} requires dependencies array`);
    if (!Array.isArray(task.allowedFiles) || !task.allowedFiles.length) throw new Error(`Task ${task.id} requires allowedFiles`);
    if (!Array.isArray(task.allowedOperations) || !task.allowedOperations.length) throw new Error(`Task ${task.id} requires allowedOperations`);
    if (task.taskType !== undefined && !ALLOWED_TASK_TYPES.has(String(task.taskType).toUpperCase())) throw new Error(`Task ${task.id} has invalid taskType`);
    if (task.routing !== undefined && (!task.routing || typeof task.routing !== 'object' || Array.isArray(task.routing))) throw new Error(`Task ${task.id} routing must be an object`);
    if (task.routing?.policyVersion !== undefined && (!Number.isInteger(task.routing.policyVersion) || task.routing.policyVersion < 1)) throw new Error(`Task ${task.id} has invalid routing policyVersion`);
    if (task.routing?.modelClass !== undefined && !ALLOWED_MODEL_CLASSES.has(task.routing.modelClass)) throw new Error(`Task ${task.id} has invalid routing modelClass`);
    if (task.routing?.effortLevel !== undefined && !ALLOWED_EFFORT_LEVELS.has(task.routing.effortLevel)) throw new Error(`Task ${task.id} has invalid routing effortLevel`);
    if (task.routing?.preferredProviders !== undefined && (!Array.isArray(task.routing.preferredProviders) || task.routing.preferredProviders.some(value => typeof value !== 'string' || !value.trim()))) throw new Error(`Task ${task.id} routing preferredProviders must be an array of non-empty strings`);
    optionalStringArray(task, 'effects');
    optionalStringArray(task, 'requirementIds');
    optionalStringArray(task, 'acceptanceCriteria');
    optionalStringArray(task, 'qaCommands');
    if (task.proposedFacts !== undefined && (!task.proposedFacts || typeof task.proposedFacts !== 'object' || Array.isArray(task.proposedFacts))) throw new Error(`Task ${task.id} proposedFacts must be an object`);
  }
  for (const task of manifest.tasks) for (const dependency of task.dependencies) {
    if (!ids.has(dependency)) throw new Error(`Task ${task.id} references missing dependency ${dependency}`);
    if (dependency === task.id) throw new Error(`Task ${task.id} depends on itself`);
  }
  return structuredClone(manifest);
}
