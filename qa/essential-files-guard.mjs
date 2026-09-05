/**
 * Prueft zwei Dinge, die Shopify erst beim Push bemerkt - und dann mit einer
 * Meldung, die nur den Block nennt, nie die Ursache:
 *
 *   1. Jede Datei aus domains/shopify/essential-files.json existiert.
 *   2. Jeder Section- und Block-Verweis eines Templates loest sich auf.
 *
 * Der zweite Punkt ist der wichtigere: Ein Verweis ins Leere laesst Shopify
 * den GESAMTEN Push ablehnen. Am 2026-09-05 kostete genau das eine Stunde,
 * weil product.rolle.json tp-vertrauen und tp-bewertungsbeleg referenzierte,
 * die nur auf einem ungemergten Branch lagen.
 *
 * Laeuft ohne Netz und ohne Theme-Zugriff: Er prueft das Repository, nicht
 * das Theme - deshalb greift er auch bei einem frisch angelegten Theme.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'domains/shopify/essential-files.json');

/**
 * Ein Template mischt zwei Ebenen mit demselben Schluessel "type": der
 * Eintrag unter "sections" meint sections/<type>.liquid, jeder Eintrag unter
 * "blocks" meint blocks/<type>.liquid. Ohne diese Unterscheidung meldet der
 * Guard jede Section als fehlenden Block - ein erster Entwurf kam so auf 130
 * Befunde statt 0.
 *
 * Kein Repo-Pendant haben App-Bloecke (shopify://) und Horizon-eigene
 * Bausteine mit fuehrendem _ - beide liefert Shopify selbst mit.
 */
function referencedFiles(templateJson) {
  const refs = new Map();
  const record = (type, dir) => {
    if (typeof type !== 'string') return;
    if (type.startsWith('shopify://') || type.startsWith('_')) return;
    refs.set(`${dir}/${type}.liquid`, dir === 'sections' ? 'Section' : 'Block');
  };

  const walkBlocks = (blocks) => {
    if (!blocks || typeof blocks !== 'object') return;
    for (const block of Object.values(blocks)) {
      if (!block || typeof block !== 'object') continue;
      record(block.type, 'blocks');
      walkBlocks(block.blocks);
    }
  };

  for (const section of Object.values(templateJson.sections ?? {})) {
    if (!section || typeof section !== 'object') continue;
    record(section.type, 'sections');
    walkBlocks(section.blocks);
  }
  return refs;
}

/** Templates duerfen Kommentarbloecke enthalten, die JSON.parse nicht kennt. */
function readTemplate(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, ''));
}

/**
 * Eine Section darf eigene Bloecke in ihrem {% schema %} deklarieren
 * (kundenbilder-grid definiert so "kundenbild"). Solche Typen haben keine
 * Datei unter blocks/ und sind trotzdem gueltig - ohne diese Menge meldet
 * der Guard sie faelschlich als verloren und wird als Rauschen abgetan,
 * statt echte Verluste zu zeigen.
 */
function schemaDeclaredBlockTypes() {
  const declared = new Set();
  for (const dir of ['sections', 'blocks']) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).filter((f) => f.endsWith('.liquid'))) {
      const raw = fs.readFileSync(path.join(abs, name), 'utf8');
      const schema = raw.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
      if (!schema) continue;
      for (const match of schema[1].matchAll(/"type"\s*:\s*"([^"]+)"/g)) declared.add(match[1]);
    }
  }
  return declared;
}

export function runEssentialFilesGuard() {
  const findings = [];

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const group of manifest.groups) {
    for (const file of group.files) {
      if (!fs.existsSync(path.join(root, file))) {
        findings.push({
          kind: 'MISSING_ESSENTIAL_FILE',
          file,
          detail: `Gruppe "${group.name}": ${group.reason}`,
        });
      }
    }
  }

  const declared = schemaDeclaredBlockTypes();
  const templateDir = path.join(root, 'templates');
  for (const name of fs.readdirSync(templateDir).filter((f) => f.endsWith('.json'))) {
    let parsed;
    try {
      parsed = readTemplate(path.join(templateDir, name));
    } catch (error) {
      findings.push({ kind: 'UNREADABLE_TEMPLATE', file: `templates/${name}`, detail: error.message });
      continue;
    }
    for (const [relative, kind] of referencedFiles(parsed)) {
      if (kind === 'Block' && declared.has(path.basename(relative, '.liquid'))) continue;
      if (!fs.existsSync(path.join(root, relative))) {
        findings.push({
          kind: 'DANGLING_REFERENCE',
          file: `templates/${name}`,
          detail: `referenziert ${kind} "${relative}", die Datei fehlt - Shopify lehnt damit den gesamten Push ab`,
        });
      }
    }
  }

  return findings;
}

const findings = runEssentialFilesGuard();

if (findings.length === 0) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const count = manifest.groups.reduce((sum, group) => sum + group.files.length, 0);
  console.log(`Essential-Files-Guard: ${count} Pflichtdateien und alle Template-Verweise vorhanden.`);
  process.exit(0);
}

console.error(`Essential-Files-Guard: ${findings.length} Befund(e).\n`);
for (const finding of findings) {
  console.error(`  ${finding.kind}  ${finding.file}`);
  console.error(`    ${finding.detail}`);
}
console.error(`
Fix: Die Datei liegt fast immer auf einem ungemergten Branch, nicht im Nirgendwo.
  git log --all --oneline --diff-filter=A -- <pfad>    zeigt, wo sie entstand
  git branch -a --contains <commit>                    zeigt den Branch dazu
Dann die ganze zusammengehoerige Gruppe holen, nicht die eine Datei - einzeln
gepickt fehlen ihre Abhaengigkeiten und der Push scheitert erneut.
`);
process.exit(1);
