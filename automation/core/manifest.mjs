const ALLOWED_RISKS = new Set(['LOW', 'MEDIUM', 'HIGH']);

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
  }
  for (const task of manifest.tasks) for (const dependency of task.dependencies) {
    if (!ids.has(dependency)) throw new Error(`Task ${task.id} references missing dependency ${dependency}`);
    if (dependency === task.id) throw new Error(`Task ${task.id} depends on itself`);
  }
  return structuredClone(manifest);
}
