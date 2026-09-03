#!/usr/bin/env node
/**
 * Blockverwaltung in Theme-Templates ohne Theme-Editor.
 *
 * Der Theme-Editor ist nur eine Oberflaeche ueber templates/*.json - jeder
 * Block dort ist ein Eintrag in "blocks" plus ein Eintrag in "block_order".
 * Das Klicken im Editor ist damit ein JSON-Edit, den dieses Skript
 * deterministisch und ueber alle Templates hinweg gleich ausfuehrt.
 *
 * Nutzung:
 *   node automation/scripts/theme-block.mjs list
 *   node automation/scripts/theme-block.mjs add tp-card-color-thumbs --after price
 *   node automation/scripts/theme-block.mjs remove tp-card-color-thumbs
 *
 * Flags:
 *   --after <type>   Position: hinter dem ersten Block dieses Typs (sonst ans Ende)
 *   --parent <type>  Elternblock (Default: _product-card)
 *   --templates <g>  Dateimuster relativ zu templates/ (Default: collection*.json)
 *   --dry-run        Nur anzeigen, nichts schreiben
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATE_DIR = 'templates';
const DEFAULT_PARENT = '_product-card';

/**
 * Shopify schreibt einen /* ... *\/ Kommentarkopf in generierte Templates.
 * JSON.parse kennt keine Kommentare, der Kopf muss also vor dem Parsen weg -
 * und beim Schreiben unveraendert zurueck, sonst erzeugt der naechste
 * Editor-Speichervorgang einen sinnlosen Riesendiff.
 */
function splitHeader(raw) {
  const match = raw.match(/^\s*\/\*[\s\S]*?\*\/\s*/);
  return match ? { header: match[0], json: raw.slice(match[0].length) } : { header: '', json: raw };
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'dry-run') flags.dryRun = true;
      else flags[key] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function templateFiles(pattern) {
  const rx = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
  return readdirSync(TEMPLATE_DIR)
    .filter((name) => rx.test(name))
    .map((name) => join(TEMPLATE_DIR, name));
}

/** Findet den Elternblock rekursiv - er haengt je nach Template unterschiedlich tief. */
function findBlock(node, type) {
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

/**
 * Block-IDs muessen innerhalb eines Templates eindeutig sein. Der Editor
 * haengt an den Typ einen Zufallssuffix; das ahmen wir nach, damit ein
 * spaeteres Speichern im Editor die ID nicht als fremd behandelt.
 */
function makeId(type, existing) {
  const base = type.replace(/-/g, '_');
  let id = base;
  let n = 2;
  while (existing.includes(id)) id = `${base}_${n++}`;
  return id;
}

function addBlock(parent, type, afterType) {
  parent.blocks ??= {};
  parent.block_order ??= [];

  const already = Object.entries(parent.blocks).find(([, b]) => b.type === type);
  if (already) return { changed: false, reason: `bereits vorhanden (${already[0]})` };

  const id = makeId(type, Object.keys(parent.blocks));
  parent.blocks[id] = { type, settings: {} };

  let position = parent.block_order.length;
  if (afterType) {
    const anchor = parent.block_order.findIndex((bid) => parent.blocks[bid]?.type === afterType);
    if (anchor !== -1) position = anchor + 1;
  }
  parent.block_order.splice(position, 0, id);
  return { changed: true, reason: `eingefuegt als ${id} an Position ${position}` };
}

function removeBlock(parent, type) {
  const entry = Object.entries(parent.blocks ?? {}).find(([, b]) => b.type === type);
  if (!entry) return { changed: false, reason: 'nicht vorhanden' };
  const [id] = entry;
  delete parent.blocks[id];
  parent.block_order = (parent.block_order ?? []).filter((bid) => bid !== id);
  return { changed: true, reason: `entfernt (${id})` };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, type] = positional;
  const parentType = flags.parent ?? DEFAULT_PARENT;
  const files = templateFiles(flags.templates ?? 'collection*.json');

  if (!command || (command !== 'list' && !type)) {
    console.error('Nutzung: theme-block.mjs <list|add|remove> [block-type] [--after <type>]');
    process.exit(2);
  }

  let changedFiles = 0;

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const { header, json } = splitHeader(raw);
    const doc = JSON.parse(json);
    const parent = findBlock(doc, parentType);

    if (!parent) {
      console.log(`${file}: kein ${parentType} - uebersprungen`);
      continue;
    }

    if (command === 'list') {
      const order = (parent.block_order ?? []).map((id) => parent.blocks?.[id]?.type ?? `?${id}`);
      console.log(`${file}: ${order.join(' -> ')}`);
      continue;
    }

    const result =
      command === 'add' ? addBlock(parent, type, flags.after) : removeBlock(parent, type);

    console.log(`${file}: ${result.reason}`);
    if (!result.changed) continue;

    changedFiles += 1;
    if (!flags.dryRun) {
      writeFileSync(file, `${header}${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    }
  }

  if (command !== 'list') {
    console.log(`\n${changedFiles} Datei(en) ${flags.dryRun ? 'wuerden geaendert' : 'geaendert'}.`);
  }
}

main();
