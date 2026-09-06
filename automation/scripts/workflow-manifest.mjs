#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductiveManifestRunner } from '../core/runner.mjs';
import { DEFAULT_PROVIDERS } from '../core/provider-router.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../');

const args = process.argv.slice(2);
const options = {
  manifestFile: args[0] || 'automation/fixtures/manifest-basic.json',
  stateDir: path.join(projectRoot, '.router/manifest-run'),
  cwd: projectRoot,
};

try {
  if (!fs.existsSync(options.manifestFile)) {
    console.error(`Error: Manifest file not found: ${options.manifestFile}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(options.manifestFile, 'utf8'));
  fs.mkdirSync(options.stateDir, { recursive: true });
  const runner = createProductiveManifestRunner({
    manifest,
    stateDir: options.stateDir,
    cwd: options.cwd,
    providers: DEFAULT_PROVIDERS,
    io: fs,
  });
  console.log(`Starting ManifestRunner with ${manifest.tasks.length} task(s)...`);
  const result = await runner.run();
  console.log(`\nRun completed: ${result.runState.status}`);
  console.log(`Road map block complete: ${result.runState.roadMapBlockComplete}`);
  for (const [taskId, state] of Object.entries(result.tasks)) {
    console.log(`  ${taskId}: ${state.status}`);
  }
  const failed = Object.values(result.tasks).filter(state => !['PASS', 'SKIPPED_DEPENDENCY'].includes(state.status));
  if (failed.length) {
    console.error(`\nFailed tasks: ${failed.length}`);
    process.exit(1);
  }
  console.log('\n✓ All tasks passed');
} catch (error) {
  console.error(`Error: ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exit(1);
}
