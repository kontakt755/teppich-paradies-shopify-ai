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
 * Shopify-Grenzen fuer Bloecke und Sections, laut
 * https://shopify.dev/docs/storefronts/themes/architecture/limits (abgerufen
 * 2026-10-10). Statische Bloecke ({% content_for 'block' %}, "static": true)
 * zaehlen nicht mit. Eine Datei darueber lehnt Shopify beim Speichern bzw.
 * Push ab: workflow:preview bricht dann ab, das Theme behaelt die alte Datei,
 * und das Live-Gate blockiert jeden folgenden Deploy.
 *
 * Warum der Guard: sections/header-group.json traegt eine Bildkachel je
 * Menuepunkt als Block. main musste den Header in ff713442 von 51 auf 50
 * kuerzen; ein Feature-Branch (#977) stand trotzdem wieder bei 52, und der
 * Merge lief ohne Konflikt durch - gezaehlt hat das niemand.
 */
export const SHOPIFY_GRENZEN = Object.freeze({
  bloeckeProSection: 50,
  bloeckeProDatei: 1250,
  sectionsProDatei: 25,
});

/**
 * Hinzufuegbare (nicht statische) Bloecke unter einem Knoten, in jeder Tiefe.
 * Bewusst konservativ: Shopify sagt nicht eindeutig, ob verschachtelte
 * Theme-Bloecke auf die 50 der Section angerechnet werden. Wer alle zaehlt,
 * meldet im Zweifel zu frueh statt zu spaet.
 */
export function countDynamicBlocks(node) {
  let count = 0;
  for (const block of Object.values(node?.blocks ?? {})) {
    if (!block || typeof block !== 'object') continue;
    if (block.static !== true) count += 1;
    count += countDynamicBlocks(block);
  }
  return count;
}

/** "max_blocks" aus dem Schema einer Section-Datei (Liquid), sonst null. */
export function maxBlocksOf(liquid) {
  const match = String(liquid).match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]).max_blocks;
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Prueft eine Template- oder Section-Gruppen-Datei gegen die Shopify-Grenzen.
 *
 * @param {string} raw  Dateiinhalt (JSON, Kommentarkopf erlaubt)
 * @param {string} file  Anzeigename, z. B. "sections/header-group.json"
 * @param {object} [options]
 * @param {Record<string, number>} [options.maxBlocks]  Section-Typ -> max_blocks aus dem Schema
 */
export function blockLimitFindings(raw, file, { maxBlocks = {} } = {}) {
  const findings = [];
  const sections = JSON.parse(stripHeader(raw))?.sections;
  if (!sections || typeof sections !== 'object') return findings;

  const sectionIds = Object.keys(sections);
  if (sectionIds.length > SHOPIFY_GRENZEN.sectionsProDatei) {
    findings.push({
      severity: 'error',
      rule: 'SECTION_LIMIT',
      templates: [file],
      message: `${file} hat ${sectionIds.length} Sections, Shopify erlaubt ${SHOPIFY_GRENZEN.sectionsProDatei} je Template bzw. Section-Gruppe.`,
    });
  }

  let total = 0;
  for (const [id, section] of Object.entries(sections)) {
    const count = countDynamicBlocks(section);
    total += count;
    const schemaMax = maxBlocks[section?.type];
    const limit = Number.isInteger(schemaMax)
      ? Math.min(SHOPIFY_GRENZEN.bloeckeProSection, schemaMax)
      : SHOPIFY_GRENZEN.bloeckeProSection;
    const quelle = limit === SHOPIFY_GRENZEN.bloeckeProSection ? 'Shopify-Grenze' : `max_blocks in sections/${section.type}.liquid`;
    if (count > limit) {
      findings.push({
        severity: 'error',
        rule: 'BLOCK_LIMIT',
        templates: [file],
        message: `${file}: Section "${id}" (${section?.type}) hat ${count} hinzufuegbare Bloecke, erlaubt sind ${limit} (${quelle}). Shopify lehnt die Datei beim Push ab - erst ${count - limit} Block/Bloecke entfernen.`,
      });
    } else if (count === SHOPIFY_GRENZEN.bloeckeProSection) {
      findings.push({
        severity: 'warn',
        rule: 'BLOCK_LIMIT_VOLL',
        templates: [file],
        message: `${file}: Section "${id}" (${section?.type}) steht bei ${count} von ${limit} Bloecken - ein weiterer Block braucht erst einen freien Platz.`,
      });
    }
  }

  if (total > SHOPIFY_GRENZEN.bloeckeProDatei) {
    findings.push({
      severity: 'error',
      rule: 'BLOCK_LIMIT_DATEI',
      templates: [file],
      message: `${file} hat ${total} hinzufuegbare Bloecke, Shopify erlaubt ${SHOPIFY_GRENZEN.bloeckeProDatei} je Template bzw. Section-Gruppe.`,
    });
  }

  return findings;
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
