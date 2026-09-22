#!/usr/bin/env node
// Erzeugt ein Konsolen-Script, das den internen Bestellblock in der
// Mitarbeiterbenachrichtigung "Neue Bestellung" auf Repo-Stand bringt.
// Grund: Fuer Benachrichtigungsvorlagen gibt es keine Admin-API-Mutation.
// Aufruf: node operations/scripts/build-bestellmail-console.mjs
// Ergebnis: operations/scripts/bestellmail-admin-einsetzen.console.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quelle = path.join(root, 'domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid');
const ziel = path.join(root, 'operations/scripts/bestellmail-admin-einsetzen.console.js');

const roh = fs.readFileSync(quelle, 'utf8');
const marker = '{%- endcomment -%}';
const start = roh.indexOf(marker);
if (start < 0) throw new Error('Kopfkommentar nicht gefunden');
const block = roh.slice(start + marker.length).replace(/^\s+/, '').trimEnd();
if (!block.startsWith('<div style="margin-top:32px')) throw new Error('Block beginnt nicht wie erwartet');

let hash = 5381;
for (const c of block) hash = ((hash * 33) ^ c.codePointAt(0)) >>> 0;

const script = `/*
 Interne Bestellmail auf Repo-Stand bringen (erzeugt ${new Date().toISOString().slice(0, 10)}, Blocklaenge ${block.length}, Hash ${hash}).
 Anwendung:
  1. Shopify Admin -> Einstellungen -> Benachrichtigungen -> Mitarbeiterbenachrichtigungen
     -> Neue Bestellung -> "Code bearbeiten" (warten, bis der Editor da ist, ca. 10 s).
  2. Browser-Konsole oeffnen (Cmd+Alt+J), dieses Script komplett einfuegen, Enter.
  3. Das Script ersetzt NUR den Block von '<div style="margin-top:32px' bis vor </body>,
     prueft Vorher/Nachher zeichengenau und klickt danach "Speichern".
  4. Danach im Admin "Testbenachrichtigung senden" und die Tabelle pruefen.
*/
(async () => {
  const NEU = ${JSON.stringify(block)};
  const el = document.querySelector('.cm-content');
  if (!el || !el.cmView) { console.error('Kein Code-Editor gefunden. Erst "Code bearbeiten" oeffnen.'); return; }
  const view = el.cmView.view;
  const doc = view.state.doc.toString();
  const j = doc.indexOf('<div style="margin-top:32px');
  const i = doc.lastIndexOf('</body>');
  if (j < 0 || i < 0 || j > i) { console.error('Alter Block oder </body> nicht gefunden. Nichts geaendert.'); return; }
  if ((doc.match(/margin-top:32px/g) || []).length !== 1) { console.error('Block-Marker kommt mehrfach vor. Nichts geaendert.'); return; }
  const altTrim = doc.slice(j, i).trimEnd();
  const bis = j + altTrim.length;
  if (altTrim === NEU) { console.log('Bereits auf Repo-Stand. Nichts zu tun.'); return; }
  view.dispatch({ changes: { from: j, to: bis, insert: NEU } });
  const d2 = view.state.doc.toString();
  const ok = d2.slice(0, j) === doc.slice(0, j) && d2.slice(j, j + NEU.length) === NEU && d2.slice(j + NEU.length) === doc.slice(bis);
  console.log({ vorher: doc.length, nachher: d2.length, erwartet: doc.length - altTrim.length + NEU.length, zeichengenau: ok });
  if (!ok) { console.error('Gegenpruefung fehlgeschlagen. NICHT speichern, Seite neu laden.'); return; }
  // Dirty-State sicherstellen (manche Vorlagen brauchen einen echten Tastendruck)
  el.focus();
  const save = [...document.querySelectorAll('button')].find(b => /^(Speichern|Save)$/.test(b.textContent.trim()));
  if (!save) { console.warn('Speichern-Button nicht gefunden - bitte oben rechts "Speichern" klicken.'); return; }
  await new Promise(r => setTimeout(r, 500));
  save.click();
  console.log('Speichern geklickt. Jetzt "Testbenachrichtigung senden" und die Tabelle pruefen.');
})();
`;
fs.writeFileSync(ziel, script);
console.log(`geschrieben: ${path.relative(root, ziel)} (${script.length} Zeichen, Block ${block.length}, Hash ${hash})`);
