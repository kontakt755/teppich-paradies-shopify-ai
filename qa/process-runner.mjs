import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outputText = value => typeof value === 'string' ? value : '';

export function classifyProcessResult(result) {
  const stdout = outputText(result.stdout);
  const stderr = outputText(result.stderr);
  if (result.error) return { ok: false, kind: 'spawn-error', message: result.error.message, stdout, stderr };
  if (result.timedOut) return { ok: false, kind: 'timeout', message: `Prozess-Timeout nach ${result.timeoutMs} ms`, stdout, stderr };
  if (result.signal) return { ok: false, kind: 'signal', message: `Prozess durch Signal ${result.signal} beendet`, stdout, stderr, signal: result.signal };
  if (result.exitCode !== 0) return { ok: false, kind: 'exit', message: `Prozess mit Exit-Code ${result.exitCode} beendet`, stdout, stderr, exitCode: result.exitCode };
  if (!stdout.trim()) return { ok: false, kind: 'empty-output', message: 'Prozess war erfolgreich, lieferte aber leeres stdout', stdout, stderr, exitCode: result.exitCode };
  return { ok: true, kind: 'success', stdout, stderr, exitCode: result.exitCode };
}

export function runProcess(command, args, { cwd, timeoutMs = 180_000, maxOutputBytes = 20 * 1024 * 1024, shell = false } = {}) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(command, args, { cwd, shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ error, stdout: '', stderr: '', timeoutMs });
      return;
    }

    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputError;
    let settled = false;
    let timedOut = false;

    const collect = (chunks, streamName) => chunk => {
      const nextBytes = (streamName === 'stdout' ? stdoutBytes : stderrBytes) + chunk.length;
      if (nextBytes > maxOutputBytes) {
        outputError ||= new Error(`${streamName} überschreitet ${maxOutputBytes} Bytes`);
        child.kill();
        return;
      }
      chunks.push(chunk);
      if (streamName === 'stdout') stdoutBytes = nextBytes;
      else stderrBytes = nextBytes;
    };
    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    timer.unref?.();

    const finish = ({ exitCode = null, signal = null, error } = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        error: error || outputError,
        timedOut,
        timeoutMs,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    };
    child.once('error', error => finish({ error }));
    child.once('close', (exitCode, signal) => finish({ exitCode, signal }));
  });
}

export function parseJsonProcessOutput(result, { label = 'Prozess', allowedExitCodes = [0] } = {}) {
  const classified = classifyProcessResult(result);
  const stdout = classified.stdout.trim();
  if (!stdout) return { failed: true, kind: classified.kind, error: `${label}: ${classified.message}`, process: classified };

  let value;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    return {
      failed: true,
      kind: 'invalid-output',
      error: `${label}: ungültige JSON-Ausgabe (${error.message})${classified.ok ? '' : `; ${classified.message}`}`,
      process: classified
    };
  }
  if (!classified.ok && (classified.kind !== 'exit' || !allowedExitCodes.includes(classified.exitCode))) {
    return { failed: true, kind: classified.kind, error: `${label}: ${classified.message}`, process: classified };
  }
  return { failed: false, value, process: classified };
}

export function shopifyInvocations({ platform = process.platform, env = process.env, nodeExecutable = process.execPath } = {}) {
  if (platform !== 'win32') return [{ command: 'shopify', args: [], shell: false, label: 'shopify' }];
  const pathEntries = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const cliEntry = pathEntries
    .map(directory => path.join(directory, 'node_modules', '@shopify', 'cli', 'bin', 'run.js'))
    .find(fs.existsSync);
  const invocations = [];
  if (cliEntry) invocations.push({ command: nodeExecutable, args: [cliEntry], shell: false, label: 'Shopify CLI Node-Entrypoint' });
  invocations.push({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'shopify.cmd'], shell: false, label: 'shopify.cmd Fallback' });
  return invocations;
}
