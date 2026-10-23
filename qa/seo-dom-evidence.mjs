/** Sichtbare Touch-Ziele inklusive zugeordnetem Label und aktiver Trefferflaeche. */
export function collectSmallTouchTargets() {
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  };
  const size = element => {
    const rect = element.getBoundingClientRect();
    const areas = [{ width: rect.width, height: rect.height }];
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const reachableSquare = () => [[0, 0], [-19.5, -19.5], [19.5, -19.5], [-19.5, 19.5], [19.5, 19.5]].every(([dx, dy]) => {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= document.documentElement.clientWidth || y >= document.documentElement.clientHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (hit === element || element.contains(hit)));
    });
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (!style.content || ['none', 'normal'].includes(style.content) || style.position !== 'absolute' || style.pointerEvents === 'none') continue;
      const pseudoWidth = Number.parseFloat(style.width);
      const pseudoHeight = Number.parseFloat(style.height);
      if (pseudoWidth >= 40 && pseudoHeight >= 40 && reachableSquare()) {
        areas.push({ width: 40, height: 40 });
      }
    }
    // Ein abgeschnittener Pseudobereich vergroessert die reale Trefferflaeche nicht.
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      for (const area of areas) {
        if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX)) area.width = Math.min(area.width, rect.width);
        if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) area.height = Math.min(area.height, rect.height);
      }
    }
    return areas.find(area => area.width >= 40 && area.height >= 40) || areas.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  };
  return [...document.querySelectorAll('main button, main input, main select, main textarea, main a.button, main a[role="button"], main a[class*="button"], main summary')]
    .filter(visible)
    .map(element => {
      const candidates = [element];
      if (element.matches('input[type="checkbox"], input[type="radio"]')) candidates.push(...(element.labels || []));
      const areas = candidates.filter(visible).map(size);
      const adequate = areas.some(rect => rect.width >= 40 && rect.height >= 40);
      const largest = areas.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const name = [element.getAttribute('aria-label'), element.getAttribute('title'), ...Array.from(element.labels || [], label => label.textContent), element.innerText, element.textContent]
        .map(value => String(value || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
      return { adequate, name: name.slice(0, 80), tag: element.tagName, width: Math.round(largest.width), height: Math.round(largest.height) };
    })
    .filter(target => !target.adequate)
    .slice(0, 12)
    .map(({ adequate, ...target }) => target);
}

/** Dieselbe Modul-URL wird vom Browser einmal ausgefuehrt; klassische Tags je Einbindung. */
export function duplicateExecutableScripts(scripts, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const byUrl = new Map();
  for (const script of scripts) {
    if (!script.src) continue;
    const url = new URL(script.src, baseUrl);
    if (url.origin !== origin) continue;
    const type = String(script.type || '').trim().toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    const entries = byUrl.get(url.href) || { classic: 0, module: false };
    if (type === 'module') entries.module = true;
    else entries.classic += 1;
    byUrl.set(url.href, entries);
  }
  return [...byUrl].filter(([, entry]) => entry.classic + Number(entry.module) > 1).map(([url]) => url);
}
