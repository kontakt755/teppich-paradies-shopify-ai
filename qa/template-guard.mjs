/**
 * Prueft, ob die Produktkarten ueber alle Kollektions-Templates hinweg
 * dieselben Bloecke tragen.
 *
 * Warum: Bloecke wurden bisher im Theme-Editor pro Template von Hand
 * eingeklickt. Dabei laufen die Templates auseinander, ohne dass es jemand
 * bemerkt - tp-card-specs und tp-card-actions steckten so in 6 von 14
 * Templates. Auf den uebrigen Kategorieseiten fehlten die Merkmale
 * kommentarlos, und aufgefallen ist das erst beim Draufschauen.
 */

/** Entfernt den von Shopify erzeugten Kommentarkopf, den JSON.parse nicht kennt. */
export function stripHeader(raw) {
  const match = raw.match(/^\s*\/\*[\s\S]*?\*\/\s*/);
  return match ? raw.slice(match[0].length) : raw;
}

/** Findet einen Block anhand seines Typs, unabhaengig von der Schachtelungstiefe. */
export function findBlock(node, type) {
  if (!node || typeof node !== 'object') return null;
  for (const key of ['sections', 'blocks']) {
    const group = node[key];
    if (!group) continue;
    for (const id of Object.keys(group)) {
      const child = group[id];
      if (child?.type === type) return child;
      const found = findBlock(child, type);
      if (found) return found;
    }
  }
  return null;
}

/** Blocktypen eines Templates in ihrer tatsaechlichen Reihenfolge. */
export function blockTypesOf(raw, parentType) {
  const parent = findBlock(JSON.parse(stripHeader(raw)), parentType);
  if (!parent) return null;
  return (parent.block_order ?? []).map(id => parent.blocks?.[id]?.type).filter(Boolean);
}

/**
 * @param {Array<{name: string, types: string[]}>} templates
 * @param {object} [options]
 * @param {string[]} [options.required]  Diese Typen muessen ueberall vorkommen (Fehler).
 * @param {string[]} [options.optional]  Duerfen fehlen, ohne als Drift zu gelten.
 */
export function analyzeTemplates(templates, { required = [], optional = [] } = {}) {
  const findings = [];
  const present = new Map();

  for (const template of templates) {
    for (const type of new Set(template.types)) {
      if (!present.has(type)) present.set(type, new Set());
      present.get(type).add(template.name);
    }
  }

  for (const type of required) {
    const missing = templates.filter(t => !t.types.includes(type)).map(t => t.name);
    if (missing.length > 0) {
      findings.push({
        severity: 'error',
        rule: 'REQUIRED_BLOCK_MISSING',
        type,
        templates: missing,
        message: `Pflichtblock "${type}" fehlt in ${missing.length} Template(s): ${missing.join(', ')}`,
      });
    }
  }

  // Ein Typ, der in manchen, aber nicht allen Templates steckt, ist Drift -
  // ausser er ist ausdruecklich als optional erklaert.
  const ignore = new Set([...required, ...optional]);
  for (const [type, owners] of present) {
    if (ignore.has(type) || owners.size === templates.length) continue;
    const missing = templates.filter(t => !owners.has(t.name)).map(t => t.name);
    findings.push({
      severity: 'warn',
      rule: 'BLOCK_DRIFT',
      type,
      templates: missing,
      message: `"${type}" steckt in ${owners.size} von ${templates.length} Templates, fehlt in: ${missing.join(', ')}`,
    });
  }

  return findings;
}
