import { installHardProcessTimeout } from '../../browser-lifecycle.mjs';

installHardProcessTimeout({ timeoutMs: 30, label: 'Watchdog fixture' });
setInterval(() => {}, 1_000);
