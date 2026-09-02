/**
 * Liquid-Syntax-Guard.
 *
 * Warum dieser Check zusaetzlich zu `shopify theme check` existiert:
 * `theme check` erkennt bestimmte ungueltige Liquid-Konstrukte NICHT. Konkret
 * ist uns `{% render 'snippet', ... as variable %}` mehrfach durchgerutscht -
 * eine Syntax, die es in Liquid gar nicht gibt. Shopify lehnt die betroffene
 * Datei beim Theme-Push still ab; im Shop erscheint dann zur Laufzeit
 * "Could not find asset snippets/<datei>.liquid", waehrend Push und
 * theme check als erfolgreich gemeldet werden. Der Fehler ist dadurch
 * mehrfach unbemerkt bis in den Live-Shop gelangt.
 *
 * Dieser Guard prueft deshalb gezielt auf bekannte, sicher ungueltige Muster.
 * Er ersetzt theme check nicht, er schliesst dessen Luecke.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');

// Nur Verzeichnisse, die Shopify tatsaechlich als Theme hochlaedt.
const THEME_DIRS = ['blocks', 'sections', 'snippets', 'layout', 'templates'];

const RULES = [
  {
    id: 'RENDER_AS_VARIABLE',
    // {% render 'x' ... as foo %} - existiert in Liquid nicht. Korrekt ist
    // {% capture foo %}{% render 'x' ... %}{% endcapture %}.
    pattern: /\{%-?\s*render\s+[^%]*?\sas\s+[a-z_][a-z0-9_]*\s*-?%\}/gi,
    message: "Ungueltige Syntax: 'render ... as variable'. Stattdessen {% capture var %}{% render ... %}{% endcapture %} verwenden.",
  },
  {
    id: 'INCLUDE_AS_VARIABLE',
    pattern: /\{%-?\s*include\s+[^%]*?\sas\s+[a-z_][a-z0-9_]*\s*-?%\}/gi,
    message: "Ungueltige Syntax: 'include ... as variable'.",
  },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('.liquid')) files.push(full);
  }
  return files;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const files = THEME_DIRS.flatMap(dir => walk(path.join(root, dir)));
const errors = [];
const warnings = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(text)) !== null) {
      if (rule.submatch) {
        const block = match[0];
        const blockStart = match.index;
        rule.submatch.lastIndex = 0;
        let inner;
        while ((inner = rule.submatch.exec(block)) !== null) {
          const finding = { file: relative, line: lineOf(text, blockStart + inner.index), rule: rule.id, message: rule.message };
          (rule.severity === 'warn' ? warnings : errors).push(finding);
        }
      } else {
        const finding = { file: relative, line: lineOf(text, match.index), rule: rule.id, message: rule.message, snippet: match[0].slice(0, 120) };
        (rule.severity === 'warn' ? warnings : errors).push(finding);
      }
    }
  }
}

for (const w of warnings) console.log(`WARN  ${w.file}:${w.line} [${w.rule}] ${w.message}`);
for (const e of errors) {
  console.error(`ERROR ${e.file}:${e.line} [${e.rule}] ${e.message}`);
  if (e.snippet) console.error(`      ${e.snippet}`);
}

console.log(`Liquid-Guard: ${files.length} Dateien geprueft, ${errors.length} Fehler, ${warnings.length} Warnungen.`);
process.exitCode = errors.length ? 1 : 0;
