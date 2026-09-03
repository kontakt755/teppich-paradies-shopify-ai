/**
 * Strukturpruefung fuer {% schema %} in Theme-Bloecken und Sections.
 *
 * Warum zusaetzlich zu `shopify theme check` und dem Liquid-Guard:
 * Ein Block mit kaputtem Schema wird klaglos deployed, taucht danach aber
 * nicht in der Block-Auswahl des Theme-Editors auf. Die Datei liegt im Shop,
 * ist ueber die API lesbar, und laesst sich trotzdem nicht einbauen. Weder
 * theme check noch der Liquid-Guard melden etwas, weil die Liquid-Syntax
 * gueltig ist.
 *
 * Konkret durchgerutscht:
 *   "target": "product_cards"  - Key existiert in Horizon nicht, wird ignoriert
 *   fehlendes "presets"        - ohne presets keine Aufnahme in die Auswahl
 */

export const SCHEMA_RX = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;

// Von Shopify dokumentierte Top-Level-Keys. Sections duerfen mehr als Bloecke.
export const BLOCK_KEYS = new Set(['name', 'tag', 'class', 'settings', 'blocks', 'max_blocks', 'presets', 'enabled_on', 'disabled_on']);
export const SECTION_KEYS = new Set([...BLOCK_KEYS, 'limit', 'default', 'locales', 'templates']);

// Settings ohne "id" sind nur als reine Darstellung erlaubt.
const ID_LESS_SETTING_TYPES = new Set(['header', 'paragraph']);

/**
 * Bloecke ohne presets sind normalerweise ein Fehler - ausser sie werden
 * ausschliesslich statisch aus einem Template gesetzt ("static": true) und
 * sollen gar nicht in der Auswahl auftauchen. Der Unterstrich-Praefix markiert
 * diese Faelle bereits; das sind die dokumentierten Ausnahmen ohne Praefix.
 */
export const STATIC_ONLY_BLOCKS = new Set([
  'accelerated-checkout.liquid',
  'add-to-cart.liquid',
  'filters.liquid',
  'page-content.liquid',
  'quantity.liquid',
]);

/**
 * Prueft eine einzelne Theme-Datei.
 *
 * @param {object} input
 * @param {string} input.source  Vollstaendiger Dateiinhalt.
 * @param {'blocks'|'sections'} input.dir  Verzeichnis - entscheidet ueber die erlaubten Keys.
 * @param {string} input.name  Dateiname inklusive .liquid.
 * @returns {{hasSchema: boolean, findings: Array<{rule: string, severity: 'error'|'warn', message: string}>}}
 */
export function analyzeSchemaSource({ source, dir, name }) {
  const match = source.match(SCHEMA_RX);
  if (!match) return { hasSchema: false, findings: [] };

  const findings = [];
  const add = (severity, rule, message) => findings.push({ rule, severity, message });

  let schema;
  try {
    schema = JSON.parse(match[1]);
  } catch (error) {
    add('error', 'SCHEMA_INVALID_JSON', `Schema ist kein gueltiges JSON: ${error.message}`);
    return { hasSchema: true, findings };
  }

  const allowed = dir === 'sections' ? SECTION_KEYS : BLOCK_KEYS;
  for (const key of Object.keys(schema)) {
    if (!allowed.has(key)) {
      add('error', 'SCHEMA_UNKNOWN_KEY', `Unbekannter Schema-Key "${key}" - Shopify ignoriert ihn stillschweigend.`);
    }
  }

  if (dir === 'blocks' && !schema.presets && !name.startsWith('_') && !STATIC_ONLY_BLOCKS.has(name)) {
    add('warn', 'SCHEMA_NO_PRESETS', 'Kein "presets" - der Block wird deployed, erscheint aber nicht in der Block-Auswahl des Editors.');
  }

  const seen = new Set();
  for (const setting of Array.isArray(schema.settings) ? schema.settings : []) {
    if (!setting || typeof setting !== 'object') continue;
    if (ID_LESS_SETTING_TYPES.has(setting.type)) continue;
    if (!setting.id) {
      add('error', 'SETTING_WITHOUT_ID', `Setting vom Typ "${setting.type ?? '?'}" hat keine id - der Wert laesst sich nicht auslesen.`);
      continue;
    }
    if (seen.has(setting.id)) {
      add('error', 'DUPLICATE_SETTING_ID', `Setting-id "${setting.id}" ist mehrfach vergeben - der spaetere Wert ueberschreibt den frueheren.`);
    }
    seen.add(setting.id);
  }

  return { hasSchema: true, findings };
}

/** Zeilennummer des {% schema %}-Tags, fuer klickbare Fehlerausgaben. */
export function schemaLine(source) {
  const at = source.search(SCHEMA_RX);
  return at === -1 ? 1 : source.slice(0, at).split('\n').length;
}
