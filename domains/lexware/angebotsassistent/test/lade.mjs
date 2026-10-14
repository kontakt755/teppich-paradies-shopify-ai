// Laedt die Apps-Script-Dateien (globaler Namensraum) in einen vm-Kontext.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(hier, '..', 'src');

export function lade() {
  const kontext = vm.createContext({ console });
  for (const datei of fs.readdirSync(src).filter((d) => d.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(src, datei), 'utf8'), kontext, { filename: datei });
  }
  return kontext;
}

export function stamm(tp) {
  const roh = JSON.parse(fs.readFileSync(path.join(hier, 'fixtures', 'artikel_auszug.json'), 'utf8'));
  return tp.tpArtikelstammAufbauen(roh);
}

/** Tiefe Kopie, damit Tests Vorgaenge aendern koennen. */
export function kopie(x) {
  return JSON.parse(JSON.stringify(x));
}
