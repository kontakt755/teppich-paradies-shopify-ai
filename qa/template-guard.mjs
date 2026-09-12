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
export function analyzeTemplates(templates, { required = [], optional = [], bewusstAbwesend = {}, nurIn = {} } = {}) {
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
  //
  // bewusstAbwesend nennt Block und Template gemeinsam: "dieser Block fehlt in
  // genau diesen Templates mit Absicht". Bewusst nicht ueber `optional`, denn
  // das wuerde den Block ueberall stummschalten - faellt er spaeter aus einem
  // Kategorie-Template heraus, in dem er hingehoert, bliebe das unbemerkt.
  const ignore = new Set([...required, ...optional]);
  for (const [type, owners] of present) {
    if (ignore.has(type)) continue;

    // nurIn: der Block gehoert ausschliesslich in diese Templates. Das Fehlen
    // ueberall sonst ist dann kein Drift - wohl aber, wenn er aus seinem
    // eigenen Template verschwindet oder in einem fremden auftaucht. Fuer
    // solche Bloecke waere bewusstAbwesend die falsche Form: man muesste alle
    // uebrigen Templates aufzaehlen, und jedes neue Template braechte die
    // Warnung zurueck, obwohl sich an der Absicht nichts geaendert hat.
    if (nurIn[type]) {
      const zuhause = new Set(nurIn[type]);
      const fehltZuhause = [...zuhause].filter(t => !owners.has(t));
      const fremd = [...owners].filter(t => !zuhause.has(t));
      if (fehltZuhause.length === 0 && fremd.length === 0) continue;
      findings.push({
        severity: 'warn',
        rule: 'BLOCK_DRIFT',
        type,
        templates: [...fehltZuhause, ...fremd],
        message: fehltZuhause.length
          ? `"${type}" gehoert laut nurIn in ${[...zuhause].join(', ')}, fehlt aber in: ${fehltZuhause.join(', ')}`
          : `"${type}" gehoert laut nurIn nur in ${[...zuhause].join(', ')}, steckt aber auch in: ${fremd.join(', ')}`,
      });
      continue;
    }

    if (owners.size === templates.length) continue;
    const erlaubt = new Set(bewusstAbwesend[type] ?? []);
    const missing = templates
      .filter(t => !owners.has(t.name) && !erlaubt.has(t.name))
      .map(t => t.name);
    if (missing.length === 0) continue;
    findings.push({
      severity: 'warn',
      rule: 'BLOCK_DRIFT',
      type,
      templates: missing,
      message: `"${type}" steckt in ${owners.size} von ${templates.length} Templates, fehlt in: ${missing.join(', ')}`,
    });
  }

  // Ein nurIn-Block, der aus JEDEM Template verschwunden ist, taucht in
  // `present` gar nicht mehr auf - die Schleife oben sieht ihn nie. Genau der
  // Fall ist der wichtigste: der Block ist aus seinem eigenen Template
  // herausgefallen und niemand merkt es.
  for (const [type, zuhause] of Object.entries(nurIn)) {
    if (present.has(type)) continue;
    findings.push({
      severity: 'warn',
      rule: 'BLOCK_DRIFT',
      type,
      templates: [...zuhause],
      message: `"${type}" gehoert laut nurIn in ${zuhause.join(', ')}, steckt aber in keinem Template mehr`,
    });
  }

  return findings;
}

/** Alle Bloecke eines Typs, in beliebiger Tiefe (Templates und Section-Gruppen). */
export function findAllBlocks(node, type, out = []) {
  if (!node || typeof node !== 'object') return out;
  for (const key of ['sections', 'blocks']) {
    const group = node[key];
    if (!group) continue;
    for (const id of Object.keys(group)) {
      const child = group[id];
      if (child?.type === type) out.push(child);
      findAllBlocks(child, type, out);
    }
  }
  return out;
}

/**
 * Blocktypen, die in keiner Produktkarte stecken duerfen, weil der Code
 * sich darauf verlaesst, dass es sie dort nicht gibt. Anders als die Drift-
 * Pruefung geht das ueber jedes Template und jede Section-Gruppe - Karten
 * stehen auch auf Suche, Startseite und in Empfehlungen.
 *
 * @param {string} raw  Inhalt einer Template- oder Section-Gruppen-Datei
 * @param {string} parentType  z. B. "_product-card"
 * @param {Record<string, string>} verboten  Typ -> Begruendung
 * @returns {string[]} gefundene verbotene Typen (ohne Doppelte)
 */
export function forbiddenCardBlocks(raw, parentType, verboten) {
  const found = new Set();
  for (const card of findAllBlocks(JSON.parse(stripHeader(raw)), parentType)) {
    for (const type of Object.keys(verboten)) {
      if (findAllBlocks(card, type).length > 0) found.add(type);
    }
  }
  return [...found];
}
