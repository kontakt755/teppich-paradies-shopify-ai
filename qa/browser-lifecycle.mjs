export class OperationTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} überschritt ${timeoutMs} ms`);
    this.name = 'OperationTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function withTimeout(operation, timeoutMs, label = 'Operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(label, timeoutMs)), timeoutMs);
  });
  try {
    const promise = typeof operation === 'function' ? Promise.resolve().then(operation) : Promise.resolve(operation);
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function installHardProcessTimeout({ timeoutMs, label = 'QA-Lauf', setTimer = setTimeout, clearTimer = clearTimeout, exit = process.exit, report = console.error }) {
  let expired = false;
  const timer = setTimer(() => {
    expired = true;
    report(`${label} überschritt die harte Obergrenze von ${timeoutMs} ms und wird beendet.`);
    exit(1);
  }, timeoutMs);
  return {
    clear() { clearTimer(timer); },
    get expired() { return expired; },
  };
}

export async function closeContextSafely(context, timeoutMs = 10_000) {
  if (!context) return { closed: true, skipped: true };
  try {
    await withTimeout(() => context.close(), timeoutMs, 'Browser-Context-Cleanup');
    return { closed: true };
  } catch (error) {
    return { closed: false, errorClass: error.name, error: error.message };
  }
}

export async function closeBrowserSafely(browser, timeoutMs = 10_000) {
  if (!browser) return { closed: true, skipped: true };
  try {
    await withTimeout(() => browser.close(), timeoutMs, 'Browser-Cleanup');
    return { closed: true };
  } catch (error) {
    // chromium.launch() returns Playwright's Browser API, which has no supported
    // process()/kill() escape hatch. Reporting a kill here would be untruthful.
    return {
      closed: false,
      timedOut: error instanceof OperationTimeoutError,
      hardKillAttempted: false,
      errorClass: error.name,
      error: error.message,
    };
  }
}

/**
 * Blendet Shopifys Theme-Vorschauleiste aus.
 *
 * Auf unpublished Preview-Themes blendet Shopify eine Leiste als eigenen
 * iframe (#PBarNextFrame in #PBarNextFrameWrapper) ueber die Seite. Der
 * Wrapper liegt als popover ueber dem Inhalt und faengt Klicks ab - der
 * Compare-Lauf scheiterte dadurch auf Desktop reproduzierbar daran, den
 * Cookie-Banner wegzuklicken ("subtree intercepts pointer events").
 *
 * Die Leiste wird per CSS versteckt, nicht aus dem DOM entfernt: Shopifys
 * Leisten-Skript ruft spaeter noch showPopover() auf dem Wrapper auf. War er
 * entfernt, warf das "Invalid on disconnected popover elements" als
 * pageerror, und COMPARE scheiterte nur auf Preview-Themes (2026-10-07,
 * 3 von 4 Laeufen; gegen Live 0 von 4).
 *
 * Im Livebetrieb existiert die Leiste nicht. Sie auszublenden stellt fuer den
 * Test also den Zustand her, den echte Besucher sehen.
 */
export async function dismissPreviewBar(page) {
  await page.evaluate(() => {
    if (document.getElementById('tp-qa-vorschauleiste-aus')) return;
    const css = document.createElement('style');
    css.id = 'tp-qa-vorschauleiste-aus';
    css.textContent = '#PBarNextFrameWrapper, #PBarNextFrame { display: none !important; pointer-events: none !important; }';
    document.head.append(css);
  }).catch(() => {});
}
