import fs from 'node:fs';
import path from 'node:path';

export const DORMANT_COMPARE_FILES = new Set([
  'assets/tp-compare.js',
  'blocks/tp-compare-toggle.liquid',
  'snippets/tp-compare-bar.liquid',
]);

export const COMPARE_SIGNATURE = /data-tp-compare-|tp-card-actions__compare|tp-compare-(?:bar|toggle|dialog|table|count|open|close|remove|expand|collapse)|tp-compare\.js|tpCompareItems/i;

export function compareSourceFindings(files) {
  return [...files].flatMap(([file, source]) => {
    if (DORMANT_COMPARE_FILES.has(file)) return [];
    return source.split('\n').flatMap((line, index) => COMPARE_SIGNATURE.test(line)
      ? [{ file, line: index + 1 }]
      : []);
  });
}

export function auditCompareSources(root) {
  const files = new Map();
  function readDirectory(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) readDirectory(relative);
      else if (entry.isFile() && /\.(liquid|json|js|css)$/.test(entry.name)) {
        files.set(relative, fs.readFileSync(path.join(root, relative), 'utf8'));
      }
    }
  }
  for (const directory of ['layout', 'templates', 'sections', 'blocks', 'snippets', 'assets', 'config']) readDirectory(directory);
  const findings = compareSourceFindings(files);
  return { pass: findings.length === 0, findings, checkedFiles: [...files.keys()].filter(file => !DORMANT_COMPARE_FILES.has(file)).length };
}

export function inspectCompareDom() {
  const marker = /data-tp-compare-|tp-card-actions__compare|tp-compare-(?:bar|toggle|dialog|table|count|open|close|remove|expand|collapse)/i;
  const scriptMarker = /tp-compare\.js|tpCompareItems|data-tp-compare-/i;
  const controls = [...document.querySelectorAll('*')].filter(element =>
    [...element.attributes].some(attribute => marker.test(attribute.name) || marker.test(attribute.value)));
  const namedControls = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')].filter(element =>
    /Produktvergleich|Zum Vergleich hinzuf|Vergleichen anzeigen|Vergleichsleiste|Produkte vergleichen/i.test([
      element.textContent, element.getAttribute('aria-label'), element.getAttribute('title'), element.value,
    ].filter(Boolean).join(' ')));
  const scripts = [...document.scripts].filter(script => scriptMarker.test(script.src || script.textContent));
  const resources = performance.getEntriesByType('resource').filter(entry => /tp-compare\.js/i.test(entry.name));
  const main = document.querySelector('main');
  return {
    controls: controls.length,
    namedControls: namedControls.length,
    scripts: scripts.length,
    resources: resources.length,
    mainTextLength: (main?.innerText || '').trim().length,
    hasHeading: !!main?.querySelector('h1'),
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    renderedThemeId: window.Shopify?.theme?.id ?? null,
  };
}

export function compareDomIsAbsent(evidence) {
  return evidence.controls === 0 && evidence.namedControls === 0
    && evidence.scripts === 0 && evidence.resources === 0;
}

export function compareAbsencePass({ status, evidence, requestedScripts = [], pageErrors = [], previewStatus }) {
  return status >= 200 && status < 400
    && compareDomIsAbsent(evidence)
    && evidence.mainTextLength >= 20 && evidence.hasHeading
    && !evidence.overflow
    && requestedScripts.length === 0 && pageErrors.length === 0
    && previewStatus === 'PASS';
}
