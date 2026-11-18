#!/usr/bin/env node
/**
 * Legt offene Lexware-Angebote fuer die Nachfass-Liste im Control Center ab (w-351).
 *
 * Eingabe auf stdin: die JSON-Antwort(en) von search_lexware_quotations
 * (Lexware-Konnektor, voucherStatus "open", size 250) - eine Seite oder ein Array von Seiten.
 * Aufruf (Claude-Routine): node operations/scripts/lexware-angebote-ablegen.mjs < antwort.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { angeboteAusLexware, lexwareAngebotePfad, schreibeAngebote } from '../lib/lexware-angebote.mjs';

const dir = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
const daten = angeboteAusLexware(JSON.parse(fs.readFileSync(0, 'utf8')));
schreibeAngebote(lexwareAngebotePfad(dir), daten);
console.log(`${daten.angebote.length} offene Angebote abgelegt (Stand ${daten.stand}).`);
