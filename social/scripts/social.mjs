#!/usr/bin/env node
/**
 * Kommandozeile des Social-Media-Moduls - fuer Dienste, geplante Aufgaben und
 * die Redaktion (Claude).
 *
 *   npm run social -- status
 *   npm run social -- shop-abgleich
 *   npm run social -- eingang-pruefen
 *   npm run social -- offen [--json]
 *   npm run social -- sichtung <mediumId> --datenschutz ok|bedenken [--rolle vorher|nachher|arbeit|detail] [--notiz "…"] [--aussortieren "Grund"]
 *   npm run social -- inhalt <id> [--typ …] [--bodenart …] [--raum …] [--ort …] [--notiz …] [--verwerfen] [--einwilligung]
 *   npm run social -- entwurf <inhaltId> [--format feed|karussell|story] [--text "…" | --text-datei pfad] [--bauplan pfad.json] [--plattformen instagram,facebook]
 *   npm run social -- planen
 *   npm run social -- freigeben <beitragId> [--am 2026-10-06T18:00]
 *   npm run social -- verwerfen <beitragId> [--grund "…"]
 *   npm run social -- veroeffentlichen [--trocken]
 *   npm run social -- kennzahlen
 *   npm run social -- referenzen --input export.json
 *   npm run social -- zugang anlegen "Name" | liste | sperren "Name"
 *   npm run social -- meta-pruefen
 *   npm run social -- whatsapp [--pruefen]   (Fotos aus der WhatsApp-Gruppe uebernehmen bzw. nur zeigen, was da ist)
 *   npm run social -- lauf            (taeglich: Eingang pruefen, Shop abgleichen, planen, Kennzahlen holen)
 *   npm run social -- takt            (alle 15 Minuten: Eingang pruefen, Faelliges veroeffentlichen)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientAus, holeKennzahlen, importiereReferenzen, planeOffene, shopAbgleich, sichereDatenbank, veroeffentlicheFaellige } from '../lib/ablauf.mjs';
import { oeffne } from '../lib/db.mjs';
import { findeZugang, liesZugaenge, zugangAnlegen, zugangSperren } from '../lib/eingang.mjs';
import { freigeben, holeGeplanteZurueck, verwerfen } from '../lib/freigabe.mjs';
import { medienPfad, socialDir } from '../lib/pfade.mjs';
import { verarbeiteEingang } from '../lib/pruefung.mjs';
import { reelMoeglich } from '../lib/reel.mjs';
import { rendere } from '../lib/rendern.mjs';
import { INHALT_STATUS, STATUS_LABEL, TYPEN } from '../lib/status.mjs';
import { STILREGELN } from '../lib/texte.mjs';
import { erstelleEntwurf } from '../lib/werkstatt.mjs';
import { leseGruppe, liesStand, standardQuelle, uebernimmWhatsApp } from '../lib/whatsapp.mjs';
import { ladeUmgebung } from '../lib/zugang.mjs';

export function argumente(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[a.slice(2)] = next; i += 1; } else flags[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const zeit = iso => (iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

function zeigeStatus(db) {
  const u = db.uebersicht();
  console.log('Neue Inhalte');
  console.log(`  ${u.neu.baustellenbilder} neue Baustellenbilder (${u.neu.baustellen} Baustellen)`);
  console.log(`  ${u.neu.produkte} neue Produktanlässe`);
  console.log(`  ${u.neu.videos} neue Videos`);
  console.log('Content vorbereitet');
  console.log(`  ${u.vorbereitet.posts} Posts · ${u.vorbereitet.storys} Storys · ${u.vorbereitet.reels} Reels`);
  console.log(`Freigabe erforderlich\n  ${u.freigabe} Inhalte${u.fehler ? `\nFehler\n  ${u.fehler} Beiträge` : ''}`);
  console.log('Geplant');
  if (!u.geplant.length) console.log('  –');
  for (const g of u.geplant) console.log(`  ${zeit(g.geplantAm)} – ${g.typLabel}${g.format === 'story' ? ' (Story)' : ''}: ${g.titel}`);
}

/** Was die Redaktion zu tun hat: Inhalte ohne Entwurf, mit allem, was sie zum Sichten braucht. */
function offeneInhalte(db, dir) {
  return db.inhalte({ status: [INHALT_STATUS.NEU, INHALT_STATUS.IN_PRUEFUNG] })
    .filter(i => !(i.quelle === 'baustelle' && i.status === INHALT_STATUS.NEU))   // erst technisch pruefen
    .map(i => ({
      id: i.id, quelle: i.quelle, typ: i.typ, typLabel: TYPEN[i.typ]?.label ?? i.typ, status: i.status, titel: i.titel,
      ort: i.ort, ortBekannt: i.daten?.ortBekannt ?? null, raum: i.raum, bodenart: i.bodenart, taetigkeit: i.taetigkeit,
      besonderheit: i.besonderheit, produkt: i.produkt_titel, produktUrl: i.daten?.url ?? null,
      vorherNachher: i.daten?.vorherNachher ?? null, grund: i.notiz, punkte: i.punkte,
      preisJeEinheit: i.daten?.preisJeEinheit ?? null, beschreibung: i.daten?.beschreibung ?? null,
      farbAnzahl: i.daten?.farbAnzahl ?? null, rabattProzent: i.daten?.rabattProzent ?? null,
      farbBilder: (i.daten?.farbBilder ?? i.daten?.serienBilder ?? []).map(b => ({ src: b.src, name: b.beschriftung })),
      reelMoeglich: reelMoeglich(db.medien(i.id)),
      medien: db.medien(i.id).filter(m => ['ok', 'unsicher'].includes(m.pruefung)).map(m => ({
        id: m.id, art: m.art, rolle: m.rolle, datei: m.pfad ? medienPfad(m.pfad, dir) : null, url: m.url,
        groesse: m.breite ? `${m.breite}x${m.hoehe}` : null, pruefung: m.pruefung, pruefGrund: m.pruef_grund,
        datenschutz: m.datenschutz, beschriftung: m.beschriftung,
      })),
    }));
}

async function main(argv) {
  const { pos, flags } = argumente(argv);
  const [befehl, ...rest] = pos;
  const dir = socialDir();
  const env = ladeUmgebung();
  const db = oeffne();
  try {
    switch (befehl) {
      case undefined:
      case 'status': zeigeStatus(db); break;

      case 'shop-abgleich': {
        const r = await shopAbgleich(db);
        console.log(`${r.produkte} Produkte gelesen, ${r.kandidaten} Anlässe gefunden, ${r.neu.length} neu in den Vorrat:`);
        for (const n of r.neu) console.log(`  #${n.id} ${TYPEN[n.art]?.label ?? n.art}: ${n.titel} (${Math.round(n.punkte)} P.) – ${n.grund}`);
        break;
      }

      case 'eingang-pruefen': {
        const r = verarbeiteEingang(db, { dir });
        if (!r.length) console.log('Keine neuen Uploads.');
        for (const b of r) console.log(`#${b.inhalt} ${b.titel}: ${b.brauchbar} von ${b.gesamt} brauchbar (${b.aussortiert} aussortiert, ${b.dubletten} doppelt)`);
        break;
      }

      case 'offen': {
        const liste = offeneInhalte(db, dir);
        if (flags.json) { console.log(JSON.stringify({ stilregeln: STILREGELN, inhalte: liste }, null, 2)); break; }
        if (!liste.length) console.log('Nichts offen.');
        for (const i of liste) console.log(`#${i.id} [${i.quelle}] ${i.titel} – ${i.medien.length} Medien${i.grund ? ` – ${i.grund}` : ''}`);
        break;
      }

      case 'sichtung': {
        const id = Number(rest[0]);
        const m = db.medium(id);
        if (!m) throw new Error(`Medium ${rest[0]} gibt es nicht`);
        const felder = {};
        if (flags.datenschutz) {
          if (!['ok', 'bedenken'].includes(flags.datenschutz)) throw new Error('--datenschutz ok|bedenken');
          felder.datenschutz = flags.datenschutz;
          felder.datenschutz_notiz = typeof flags.notiz === 'string' ? flags.notiz : null;
        }
        if (typeof flags.rolle === 'string') felder.rolle = flags.rolle;
        if (flags.aussortieren) { felder.pruefung = 'aussortiert'; felder.pruef_grund = typeof flags.aussortieren === 'string' ? flags.aussortieren : 'von der Redaktion aussortiert'; }
        db.mediumAendern(id, felder);
        db.ereignis('redaktion', 'sichtung', `medium:${id}`, felder);
        if (felder.datenschutz === 'bedenken') {
          const z = holeGeplanteZurueck(db, m.inhalt_id, 'Ein Bild hat nachträglich Datenschutz-Bedenken bekommen.', { von: 'redaktion' });
          if (z.length) console.log(`Geplante Beiträge zurück in die Freigabe: ${z.map(x => `#${x}`).join(', ')}`);
        }
        console.log(`Medium ${id}: ${Object.entries(felder).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        break;
      }

      case 'inhalt': {
        const id = Number(rest[0]);
        if (!db.inhalt(id)) throw new Error(`Inhalt ${rest[0]} gibt es nicht`);
        const felder = {};
        for (const k of ['typ', 'bodenart', 'raum', 'ort', 'notiz', 'taetigkeit', 'besonderheit']) if (typeof flags[k] === 'string') felder[k] = flags[k];
        if (felder.typ && !TYPEN[felder.typ]) throw new Error(`Unbekannter Typ (${Object.keys(TYPEN).join(', ')})`);
        if (flags.verwerfen) felder.status = INHALT_STATUS.VERWORFEN;
        // Einwilligung liegt schriftlich vor (Auftragszettel) - nur fuer Material ohne Haekchen, etwa aus WhatsApp.
        if (flags.einwilligung === true) felder.einwilligung = true;
        const i = db.inhaltAendern(id, felder);
        db.ereignis('redaktion', 'inhalt-geaendert', `inhalt:${id}`, felder);
        if (flags.verwerfen) holeGeplanteZurueck(db, id, 'Das Material wurde verworfen.', { von: 'redaktion' });
        console.log(`Inhalt ${id}: ${STATUS_LABEL[i.status]} – ${i.titel}`);
        break;
      }

      case 'entwurf': {
        const inhaltId = Number(rest[0]);
        const plan = typeof flags.bauplan === 'string' ? JSON.parse(fs.readFileSync(flags.bauplan, 'utf8')) : {};
        const text = typeof flags['text-datei'] === 'string' ? fs.readFileSync(flags['text-datei'], 'utf8') : (typeof flags.text === 'string' ? flags.text : plan.text ?? null);
        const b = await erstelleEntwurf(db, {
          inhaltId, format: typeof flags.format === 'string' ? flags.format : plan.format ?? null,
          folien: plan.folien ?? null, text, textFacebook: plan.textFacebook ?? null,
          plattformen: typeof flags.plattformen === 'string' ? flags.plattformen.split(',') : plan.plattformen ?? undefined,
          von: typeof flags.von === 'string' ? flags.von : 'redaktion',
        }, { rendere, dir, env });
        planeOffene(db, { dir });
        const fertig = db.beitrag(b.id);
        const umfang = fertig.format === 'reel' ? `Video aus ${fertig.medien.filter(m => m.art === 'rahmen').length} Bildern` : `${fertig.medien.length} Bild/er`;
        console.log(`Entwurf #${fertig.id} (${fertig.format}, ${umfang}) liegt in der Freigabe – Vorschlag: ${zeit(fertig.geplant_am)}`);
        for (const m of fertig.medien) console.log(`  ${medienPfad(m.pfad, dir)}`);
        for (const s of fertig.hinweise?.sperren ?? []) console.log(`  SPERRE: ${s}`);
        for (const h of fertig.hinweise?.hinweise ?? []) console.log(`  Hinweis: ${h}`);
        break;
      }

      case 'planen': {
        const r = planeOffene(db, { dir });
        console.log(r.length ? r.map(p => `#${p.id} → ${zeit(p.geplantAm)}`).join('\n') : 'Alle Entwürfe haben einen Terminvorschlag.');
        break;
      }

      case 'freigeben': {
        const b = freigeben(db, Number(rest[0]), { von: typeof flags.von === 'string' ? flags.von : 'Inhaber (Kommandozeile)', geplantAm: typeof flags.am === 'string' ? flags.am : null });
        console.log(`Beitrag #${b.id} freigegeben, erscheint ${zeit(b.geplant_am)}`);
        break;
      }

      case 'verwerfen': {
        verwerfen(db, Number(rest[0]), { von: 'Kommandozeile', grund: typeof flags.grund === 'string' ? flags.grund : '' });
        console.log(`Beitrag #${rest[0]} verworfen`);
        break;
      }

      case 'veroeffentlichen': {
        const r = await veroeffentlicheFaellige(db, { env, trocken: Boolean(flags.trocken), dir, melde: console.log });
        console.log(`${r.faellig} fällig · ${r.veroeffentlicht.length} ${r.trocken ? 'im Trockenlauf durchgespielt' : 'veröffentlicht'} · ${r.fehler.length} Fehler · ${r.zurueck.length} zurück in die Freigabe · ${r.uebersprungen.length} warten`);
        for (const f of r.fehler) console.log(`  #${f.id}: ${f.meldung}`);
        if (r.hinweis) console.log(r.hinweis);
        break;
      }

      case 'kennzahlen': {
        const r = await holeKennzahlen(db, { env, dir });
        console.log(`${r.gemessen} Messwerte geholt, ${r.archiviert} Beiträge archiviert.${r.hinweis ? ` ${r.hinweis}` : ''}`);
        for (const s of r.lernstand.erkenntnisse) console.log(`  ${s}`);
        break;
      }

      case 'referenzen': {
        if (typeof flags.input !== 'string') throw new Error('--input <export.json> fehlt');
        const roh = JSON.parse(fs.readFileSync(flags.input, 'utf8'));
        const knoten = roh?.data?.metaobjects?.nodes ?? roh?.metaobjects?.nodes ?? roh?.nodes ?? roh;
        const r = importiereReferenzen(db, knoten);
        console.log(`${r.length} Referenzprojekte übernommen.`);
        for (const n of r) console.log(`  #${n.id} ${n.titel} (${n.bilder} Bilder)`);
        break;
      }

      case 'zugang': {
        if (rest[0] === 'anlegen') {
          const z = zugangAnlegen(rest[1]);
          const basis = env.SOCIAL_UPLOAD_BASIS_URL || 'http://<adresse-des-mac-mini>:8021';
          // Der Link wird genau einmal gezeigt - gespeichert ist nur sein Hash.
          console.log(`Zugang für ${z.name} angelegt. Link (nur jetzt sichtbar, an das Handy schicken):\n${basis}/u/${z.token}`);
        } else if (rest[0] === 'sperren') {
          console.log(`${zugangSperren(rest[1])} Zugang/Zugänge gesperrt.`);
        } else if (rest[0] === 'pruefen') {
          console.log(findeZugang(rest[1]) ? 'gültig' : 'ungültig');
        } else {
          const liste = liesZugaenge();
          if (!liste.length) console.log('Noch keine Zugänge. Anlegen: npm run social -- zugang anlegen "Name"');
          for (const z of liste) console.log(`${z.aktiv ? 'aktiv   ' : 'gesperrt'} ${z.name} (seit ${new Date(z.angelegt).toLocaleDateString('de-DE')})`);
        }
        break;
      }

      case 'meta-pruefen': {
        const { bereit, client, konfig } = clientAus(env);
        if (!bereit) { console.log('Kein Meta-Zugang eingerichtet. Schritte: social/META-EINRICHTUNG.md'); break; }
        const r = await client.pruefe();
        console.log(`Facebook-Seite: ${r.seite.name} (${r.seite.follower ?? '?'} Follower)`);
        console.log(r.instagram ? `Instagram: @${r.instagram.username} (${r.instagram.followers_count} Follower, ${r.instagram.media_count} Beiträge)` : 'Instagram: kein Konto mit der Seite verknüpft');
        if (r.instagram && konfig.igUserId !== r.instagram.id) console.log(`Hinweis: META_IG_USER_ID sollte ${r.instagram.id} sein.`);
        break;
      }

      case 'whatsapp': {
        if (!env.SOCIAL_WHATSAPP_GRUPPE) { console.log('Keine Gruppe eingestellt: SOCIAL_WHATSAPP_GRUPPE in zugang.env (social/WHATSAPP.md).'); break; }
        if (flags.pruefen) {
          const stand = liesStand(dir);
          const n = leseGruppe({ quelle: env.SOCIAL_WHATSAPP_DIR || standardQuelle(), gruppe: env.SOCIAL_WHATSAPP_GRUPPE, abPk: stand.letzterPk ?? 0, seit: stand.letzterPk ? new Date(0) : new Date(Date.now() - 14 * 86400000) });
          const je = {};
          for (const x of n) { je[x.absender] ??= { bilder: 0, videos: 0, fehlt: 0 }; je[x.absender][x.art === 'video' ? 'videos' : 'bilder'] += 1; if (!x.datei) je[x.absender].fehlt += 1; }
          console.log(`Gruppe „${env.SOCIAL_WHATSAPP_GRUPPE}“ lesbar – ${n.length} neue Fotos/Videos${stand.letzterPk ? '' : ' (letzte 14 Tage)'}`);
          for (const [wer, z] of Object.entries(je)) console.log(`  ${wer}: ${z.bilder} Fotos, ${z.videos} Videos${z.fehlt ? `, ${z.fehlt} noch nicht heruntergeladen` : ''}`);
          break;
        }
        const r = uebernimmWhatsApp(db, { env, dir });
        if (r.fehler) throw new Error(r.fehler);
        for (const b of r.neu) console.log(`#${b.id} von ${b.absender}: ${b.dateien} Datei(en)`);
        console.log(`${r.neu.length} neue Baustelle(n), ${r.dateien} Dateien${r.wartet ? `, ${r.wartet} warten noch` : ''}${r.fehlend ? `, ${r.fehlend} übersprungen (nicht heruntergeladen oder kein Foto)` : ''}`);
        break;
      }

      case 'lauf': {
        for (const b of verarbeiteEingang(db, { dir })) console.log(`Eingang #${b.inhalt}: ${b.brauchbar}/${b.gesamt} brauchbar`);
        try {
          const r = await shopAbgleich(db);
          console.log(`Shop: ${r.produkte} Produkte, ${r.neu.length} neue Anlässe`);
        } catch (e) { console.log(`Shop-Abgleich ausgefallen: ${e.message}`); }
        console.log(`Planer: ${planeOffene(db, { dir }).length} Terminvorschläge`);
        try {
          const k = await holeKennzahlen(db, { env, dir });
          console.log(`Auswertung: ${k.gemessen} Messwerte, ${k.archiviert} archiviert${k.hinweis ? ` (${k.hinweis})` : ''}`);
        } catch (e) { console.log(`Auswertung ausgefallen: ${e.message}`); }
        sichereDatenbank(db, { dir });
        zeigeStatus(db);
        break;
      }

      // Alle 15 Minuten: neue Uploads pruefen und Faelliges veroeffentlichen.
      case 'takt': {
        // 20 Minuten Abstand: ein Upload, der gerade laeuft, wird nicht halb geprueft.
        const wa = uebernimmWhatsApp(db, { env, dir });
        if (wa?.neuerFehler) console.log(`${new Date().toISOString()} whatsapp: ${wa.fehler}`);
        const eingang = verarbeiteEingang(db, { dir, mindestAlterMs: 20 * 60 * 1000 });
        const r = await veroeffentlicheFaellige(db, { env, dir });
        const zeile = `${new Date().toISOString()} whatsapp=${wa?.neu.length ?? '-'} eingang=${eingang.length} faellig=${r.faellig} veroeffentlicht=${r.veroeffentlicht.length} fehler=${r.fehler.length}${r.hinweis ? ` hinweis="${r.hinweis}"` : ''}`;
        if (eingang.length || r.faellig || wa?.neu.length) console.log(zeile);
        break;
      }

      default:
        throw new Error(`Unbekannter Befehl "${befehl}". Übersicht: Kopf von social/scripts/social.mjs`);
    }
  } finally {
    db.schliessen();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(`Fehler: ${e.message}`); process.exit(1); });
}
