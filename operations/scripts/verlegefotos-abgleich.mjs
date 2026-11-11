#!/usr/bin/env node
/**
 * Verlegefotos mit dem Shop abgleichen (Werkbank w-340):
 *
 *   npm run verlegefotos:abgleich                          # nur zeigen, nichts schreiben
 *   npm run verlegefotos:abgleich -- --schreiben           # To-dos im Control Center anlegen
 *   npm run verlegefotos:abgleich -- --boden 108 "Selene 620"   # verlegten Boden nachtragen
 *
 * Quelle sind die Baustellen des Social-Moduls ($TP_PRIVAT_DIR/social/social.db,
 * nur lesend) mit Bildern, die dessen Bildpruefung und Datenschutzsichtung
 * bestanden haben. Der Bodenname wird im Lexikon-Export gesucht (der kommt aus
 * der Admin-API; hier wird nichts im Shop gelesen oder geschrieben). Ergebnis
 * sind To-dos unter "Organisation" bzw. "Fotos" im Control Center.
 *
 * Kein Bild wird an ein Produkt gehaengt - das braucht die Sichtfreigabe.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { lies, schreib, dateiPfad, baueEintrag, speichereAnhang, privatDir, ANHANG_MAX_BYTES } from '../lib/organisation-speicher.mjs';
import { planeAbgleich, sammelEintrag, SCHLUESSEL_OHNE_PRODUKT } from '../lib/verlegefotos.mjs';

export function argumente(argv) {
  const a = { schreiben: false, boden: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--schreiben') a.schreiben = true;
    else if (k === '--boden') a.boden = { id: String(argv[++i] || ''), name: String(argv[++i] || '').trim() };
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (a.boden && (!/^\d+$/.test(a.boden.id) || !a.boden.name)) throw new Error('--boden <Nummer> "Name Farbe"');
  return a;
}

// shortcut: nachgetragene Bodennamen liegen in einer eigenen Datei statt in social.db,
// damit dieser Lauf die Datenbank des Social-Moduls nie schreibt. Bekommt die Zentrale
// ein Eingabefeld fuer produkt_titel, entfaellt die Datei.
const boedenDatei = dir => path.join(dir, 'verlegefotos', 'boeden.json');
function liesBoeden(dir) {
  try { return JSON.parse(fs.readFileSync(boedenDatei(dir), 'utf8')); } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${boedenDatei(dir)} ist nicht lesbar: ${e.message}`);
  }
}

/** Baustellen mit geprueften Bildern - Verworfenes und Ungeprueftes bleibt draussen. */
export function liesBaustellen(dir) {
  const datei = path.join(dir, 'social', 'social.db');
  if (!fs.existsSync(datei)) throw new Error(`${datei} fehlt - das Social-Modul ist hier nicht eingerichtet`);
  const db = new DatabaseSync(datei, { readOnly: true });
  try {
    const zeilen = db.prepare(`
      SELECT i.id, i.titel, i.erstellt, i.bodenart, i.produkt_titel AS produkt, m.pfad
      FROM inhalt i JOIN medium m ON m.inhalt_id = i.id
      WHERE i.quelle = 'baustelle' AND i.status <> 'VERWORFEN' AND i.einwilligung = 1
        AND m.art = 'bild' AND m.pruefung = 'ok' AND m.datenschutz = 'ok' AND m.pfad IS NOT NULL
      ORDER BY i.id, m.reihenfolge, m.id`).all();
    const nachId = new Map();
    for (const z of zeilen) {
      if (!nachId.has(z.id)) nachId.set(z.id, { id: z.id, titel: z.titel, erstellt: z.erstellt, bodenart: z.bodenart, produkt: z.produkt, bilder: [] });
      nachId.get(z.id).bilder.push({ pfad: path.join(dir, 'social', z.pfad) });
    }
    return [...nachId.values()];
  } finally { db.close(); }
}

const TYP = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };

export async function main(argv = process.argv.slice(2), { dir = privatDir(), log = console.log } = {}) {
  const a = argumente(argv);
  if (a.hilfe) { log('npm run verlegefotos:abgleich [-- --schreiben | --boden <Nummer> "Name Farbe"]'); return null; }

  if (a.boden) {
    const boeden = { ...liesBoeden(dir), [a.boden.id]: a.boden.name };
    fs.mkdirSync(path.dirname(boedenDatei(dir)), { recursive: true });
    fs.writeFileSync(boedenDatei(dir), `${JSON.stringify(boeden, null, 2)}\n`, { mode: 0o600 });
    log(`Baustelle #${a.boden.id}: „${a.boden.name}“ vermerkt. Jetzt: npm run verlegefotos:abgleich`);
    return null;
  }

  const lexikon = path.join(dir, 'lexikon', 'produkte.json');
  if (!fs.existsSync(lexikon)) throw new Error(`${lexikon} fehlt - erst npm run lexikon:export`);
  // Nur was Kunden kaufen koennen: ein Entwurf oder ein verstecktes Raummass-Produkt ist kein Ziel fuer ein Bild.
  const produkte = (JSON.parse(fs.readFileSync(lexikon, 'utf8')).produkte ?? []).filter(p => p.status === 'ACTIVE');

  const datei = dateiPfad(dir);
  const daten = lies(datei);
  const vorhanden = daten.eintraege.filter(e => e.verknuepft?.schluessel);
  const erledigt = new Set(vorhanden.filter(e => e.verknuepft.schluessel !== SCHLUESSEL_OHNE_PRODUKT).map(e => e.verknuepft.schluessel));
  const sammelOffen = vorhanden.some(e => e.verknuepft.schluessel === SCHLUESSEL_OHNE_PRODUKT && e.status !== 'DONE');

  const baustellen = liesBaustellen(dir);
  const plan = planeAbgleich(baustellen, produkte, { boeden: liesBoeden(dir), erledigt });
  const neu = [...plan.eintraege];
  if (plan.ohneProdukt.length && !sammelOffen) neu.push(sammelEintrag(plan.ohneProdukt));

  log(`${baustellen.length} Baustellen mit geprüften Bildern, ${erledigt.size} schon als To-do, ${plan.ohneProdukt.length} ohne Bodennamen.`);
  for (const e of plan.eintraege) log(`  ${e.verknuepft.fall}: ${e.titel} (${e.bilder.length} Bilder)`);
  for (const b of plan.ohneProdukt) log(`  ohne Boden: #${b.id} · ${String(b.erstellt).slice(0, 10)} · ${b.titel} · ${b.bilder.length} Bilder`);

  if (!a.schreiben) { log(`${neu.length} To-dos würden angelegt (mit --schreiben).`); return { plan, angelegt: 0 }; }

  for (const e of neu) {
    const eintrag = baueEintrag({ typ: 'TASK', titel: e.titel, beschreibung: e.beschreibung, bereich: 'Online-Shop',
      status: 'INBOX', erfolgskriterium: e.erfolgskriterium, verknuepft: e.verknuepft }, { benutzer: { name: 'Verlegefotos-Abgleich' } });
    for (const b of e.bilder) {
      const typ = TYP[path.extname(b.pfad).toLowerCase()];
      // Ein fehlendes oder zu grosses Bild darf das To-do nicht verhindern - es steht dann im Verlauf, was fehlt.
      if (!typ || !fs.existsSync(b.pfad) || fs.statSync(b.pfad).size > ANHANG_MAX_BYTES) {
        eintrag.verlauf.push({ zeit: new Date().toISOString(), wer: 'Verlegefotos-Abgleich', was: `Bild ${path.basename(b.pfad)} nicht übernommen` });
        continue;
      }
      speichereAnhang(eintrag, { name: path.basename(b.pfad), typ, daten: fs.readFileSync(b.pfad).toString('base64') }, { dir, benutzer: { name: 'Verlegefotos-Abgleich' } });
    }
    daten.eintraege.push(eintrag);
  }
  if (neu.length) schreib(daten, datei);
  log(`${neu.length} To-dos angelegt.`);
  return { plan, angelegt: neu.length };
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
