import fs from 'node:fs';
import path from 'node:path';

export class RunLockedError extends Error {
  constructor(lockPath) {
    super(`Another runner owns the lock: ${lockPath}`);
    this.name = 'RunLockedError';
  }
}

export class RunLock {
  constructor({ lockPath, io = fs, now = () => new Date() }) {
    this.lockPath = lockPath;
    this.io = io;
    this.now = now;
    this.owned = false;
  }

  acquire(runId) {
    this.io.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    try {
      this.io.writeFileSync(this.lockPath, `${JSON.stringify({ runId, pid: process.pid, acquiredAt: this.now().toISOString() })}\n`, { flag: 'wx' });
      this.owned = true;
    } catch (error) {
      if (error.code === 'EEXIST') throw new RunLockedError(this.lockPath);
      throw error;
    }
  }

  release() {
    if (!this.owned) return;
    this.io.rmSync(this.lockPath, { force: true });
    this.owned = false;
  }
}
