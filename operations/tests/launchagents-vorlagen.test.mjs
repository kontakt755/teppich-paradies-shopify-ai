import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORDNER = fileURLToPath(new URL('../launchagents/', import.meta.url));
const vorlagen = fs.readdirSync(ORDNER).filter(n => n.endsWith('.plist.vorlage')).sort();

/**
 * Ein XML-Kommentar darf nach dem Standard kein "--" enthalten und nicht auf "-" enden.
 * launchd und plutil lesen so eine Datei trotzdem, strenge Parser (Python plistlib,
 * expat) lehnen sie ab - belegt am 29.10.2026 an der Vorlage preisfilter ("--still").
 * Optionen in Kommentaren deshalb ausschreiben oder mit "-\-" entschaerfen.
 */
test('LaunchAgent-Vorlagen: XML-Kommentare ohne Doppelstrich, Dateien wohlgeformt genug fuer strenge Parser', () => {
  assert.ok(vorlagen.length >= 10, `zu wenige Vorlagen gefunden: ${vorlagen.join(', ')}`);
  for (const name of vorlagen) {
    const text = fs.readFileSync(path.join(ORDNER, name), 'utf8');
    assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/, `${name}: XML-Kopf fehlt`);
    assert.match(text, /<\/plist>\s*$/, `${name}: schliessendes </plist> fehlt`);
    const kommentare = [...text.matchAll(/<!--([\s\S]*?)-->/g)];
    assert.ok(!/<!--/.test(text.replace(/<!--[\s\S]*?-->/g, '')), `${name}: ein Kommentar wird nicht geschlossen`);
    for (const [, inhalt] of kommentare) {
      const zeile = text.slice(0, text.indexOf(inhalt)).split('\n').length;
      assert.ok(!inhalt.includes('--'), `${name}:${zeile}: "--" im XML-Kommentar (${inhalt.match(/.{0,20}--.{0,20}/)?.[0].trim()})`);
      assert.ok(!inhalt.endsWith('-'), `${name}:${zeile}: Kommentar endet auf "-" (ergibt "--->")`);
    }
  }
});
