#!/usr/bin/env node
/**
 * Farbseiten (Metaobjekt tp_teppichfarbe) fuer einen Teppich nach Mass planen und anlegen.
 *
 *   npm run -s farbseiten:anlegen                              # Trockenlauf, schreibt nur Dateien (Freigabeliste)
 *   npm run -s farbseiten:anlegen -- --handle <produkt>        # anderes Produkt (Standard: esmera-teppich-nach-mass)
 *   npm run -s farbseiten:anlegen -- --ausgabe <ordner>        # Standard: ~/teppich-paradies-analyse/.../umsetzung/farbseiten
 *   npm run -s farbseiten:anlegen -- --schreiben               # fehlende Eintraege als ENTWURF anlegen
 *   npm run -s farbseiten:anlegen -- --schreiben --nur "Sand (070)"   # nur diese Farbe(n), Komma getrennt
 *
 * Warum: Die Farbe eines Teppichs nach Mass hat kein eigenes Suchsignal (Title, H1 und
 * Canonical sind mit und ohne ?variant= gleich). Jede Farbe bekommt deshalb eine eigene
 * Seite /pages/teppich-farbe/<handle> mit eigenem Titel und eigener H1. Die Texte entstehen
 * hier aus belegten Produktdaten (Metafelder, Varianten, Bildern) - nichts wird erfunden.
 *
 * Quelle: Shopify CLI (`shopify store execute`), lesend; --schreiben nutzt dieselbe CLI
 * mit --allow-mutations. Eintraege werden NUR als DRAFT angelegt und nie veroeffentlicht,
 * vorhandene Eintraege nie ueberschrieben (nur verglichen). Veroeffentlichen ist ein
 * eigener Schritt nach Freigabe des Inhabers.
 *
 * Ausgabe (nicht ins Repository): freigabeliste.md, plan.json; nach --schreiben
 * write-log.json und rollback.json (metaobjectDelete fuer genau die angelegten Eintraege).
 * Rueckweg: Eintraege stehen auf Entwurf (404); 301 je URL auf die Produktseite.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const STORE = 'sjjyq1-6w.myshopify.com';
export const TYP = 'tp_teppichfarbe';
export const URL_HANDLE = 'teppich-farbe';
export const SHOP = 'https://www.teppich-paradies.net';
export const STANDARD_PRODUKT = 'esmera-teppich-nach-mass';
export const STANDARD_AUS = path.join(os.homedir(), 'teppich-paradies-analyse/seo-strategie-2026-11/final-2026-11-26/umsetzung/farbseiten');
const TITEL_MAX = 60;
const META_MAX = 155;

export function argumente(argv) {
  const o = { handle: STANDARD_PRODUKT, ausgabe: STANDARD_AUS, schreiben: false, nur: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--schreiben') { o.schreiben = true; continue; }
    if (!['--handle', '--ausgabe', '--nur'].includes(k)) throw new Error(`unbekannte Option: ${k}`);
    const w = argv[i + 1];
    if (w == null || w.startsWith('--')) throw new Error(`${k} ohne Wert`);
    if (k === '--handle') o.handle = w;
    else if (k === '--ausgabe') o.ausgabe = w;
    else o.nur = w.split(',').map((x) => x.trim()).filter(Boolean);
    i += 1;
  }
  return o;
}

/** "Sand (070)" -> { name: "Sand", code: "070" } */
export function farbeTeile(farbe) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(farbe);
  return m ? { name: m[1].trim(), code: m[2].trim() } : { name: farbe.trim(), code: '' };
}

/** URL-Handle: ASCII, klein, Bindestriche ("Olivgrün (046)" -> "olivgruen-046"). */
export function slug(text) {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const KANTE = { ketteln: { wort: 'gekettelt', rundum: 'rundum gekettelt' } };

/** Metafelder als { "namespace.key": value } */
export function metafelder(knoten) {
  const m = {};
  for (const n of knoten) m[`${n.namespace}.${n.key}`] = n.value;
  return m;
}

/**
 * Baut den Plan: je Farbe ein Eintrag oder ein Auslassungsgrund.
 * Wirft, wenn die Grunddaten fehlen (dann kein Raten).
 */
export function plan(produkt) {
  const mf = metafelder(produkt.metafields.nodes);
  if ((mf['service.einfassung'] ?? '').trim().toLowerCase() !== 'ketteln') {
    throw new Error('Nur fuer Teppiche mit Kettelung (service.einfassung = Ketteln) geplant.');
  }
  const kante = KANTE.ketteln;
  const basis = JSON.parse(mf['custom.teppich_basis_daten'] ?? 'null');
  if (!basis?.qualitaet) throw new Error('custom.teppich_basis_daten.qualitaet fehlt.');
  const formen = JSON.parse(mf['service.formen'] ?? '[]');
  if (!formen.length) throw new Error('service.formen fehlt.');
  const maxL = Number(mf['service.max_laenge_cm']);
  if (!(maxL > 0)) throw new Error('service.max_laenge_cm fehlt.');
  // "Polyester · Velours · 9,5 mm Flor" -> Flor-Art ist der mittlere Teil
  const teile = basis.qualitaet.split('·').map((s) => s.trim()).filter(Boolean);
  const florart = teile.length >= 3 ? teile[1] : '';
  const kurz = produkt.title.replace(/\s+Teppich nach Ma(ß|ss)\s*$/i, '').trim();
  const handleBasis = produkt.handle.replace(/-teppich-nach-mass$/, '');
  const form = formen[0];

  const eintraege = [];
  const ausgelassen = [];
  for (const v of produkt.variants.nodes) {
    const farbe = v.selectedOptions.find((o) => o.name === 'Farbe')?.value ?? v.title;
    const { name, code } = farbeTeile(farbe);
    const marker = ` | Farbe: ${farbe} |`;
    const variantenbild = v.media.nodes.find((m) => m.image)?.image.url ?? null;
    const raum = produkt.media.nodes.find((m) => m.alt?.includes(marker) && m.alt.includes('Raumansicht'));
    const muster = produkt.media.nodes.find((m) => m.alt?.includes(marker) && m.alt.includes('Musterfoto'));
    if (!variantenbild && !raum) {
      ausgelassen.push({ farbe, grund: 'kein eigenes Bild (weder Variantenbild noch Raumbild)' });
      continue;
    }
    const breite = basis.breite?.[farbe] ?? Number(mf['service.max_breite_cm']);
    const titel = `${produkt.title} in ${name}${florart ? ` – ${florart}` : ''}, ${kante.wort}`;
    const ueberschrift = `${produkt.title} in ${code ? `${name} (${code})` : name}`;
    const maxText = breite > 0 ? `${form} bis ${breite} × ${maxL} cm` : form;
    const meta = `${florart ? `${florart}-Teppich` : 'Teppich'} ${kurz} in ${name}, ${kante.rundum}, ${maxText}. Endpreis sofort im Rechner.`;
    eintraege.push({
      farbe,
      handle: `${handleBasis}-${slug(farbe)}`,
      variantId: v.id,
      produktId: produkt.id,
      titel,
      ueberschrift,
      meta,
      titelLaenge: [...titel].length,
      metaLaenge: [...meta].length,
      bilder: { variante: variantenbild, raumbild: raum?.image.url ?? null, musterfoto: muster ? true : false },
      warnungen: [
        ...([...titel].length > TITEL_MAX ? [`Titel ${[...titel].length} Zeichen (> ${TITEL_MAX})`] : []),
        ...([...meta].length > META_MAX ? [`Meta ${[...meta].length} Zeichen (> ${META_MAX})`] : []),
      ],
    });
  }
  return { eintraege, ausgelassen };
}

export function freigabeliste(produkt, p) {
  const z = [];
  z.push(`# Freigabeliste Farbseiten ${produkt.title}`);
  z.push('');
  z.push(`Stand: Trockenlauf, ${p.eintraege.length} Farben mit Seite, ${p.ausgelassen.length} ausgelassen. Seiten-URL: ${SHOP}/pages/${URL_HANDLE}/<Handle>. Alle Eintraege bleiben ENTWURF, bis der Inhaber Wortlaut und Bildwahl freigibt.`);
  z.push('');
  z.push('Der Text im Seitenkoerper entsteht im Theme (snippets/tp-farbseite-inhalt) aus Produktdaten: Einleitungssatz (Qualitaet, Kante, Form, groesstes Mass), Eckdaten, Preisbeispiel 80 x 150 cm (gerechnet wie Konfigurator und Warenkorb), Knopf "Maß eingeben und Preis berechnen", Musterhinweis ohne Preisaussage, Links zu den anderen Farben. Nur Titel, H1 und Meta stehen im Eintrag und sind unten freizugeben.');
  z.push('');
  z.push('| # | Farbe | Handle (URL-Ende) | Title (Zeichen) | H1 | Meta (Zeichen) | Bildwahl |');
  z.push('|---|---|---|---|---|---|---|');
  p.eintraege.forEach((e, i) => {
    const bild = [e.bilder.variante ? 'Variantenbild (Kante)' : null, e.bilder.raumbild ? 'Raumbild' : null].filter(Boolean).join(' + ');
    z.push(`| ${i + 1} | ${e.farbe} | ${e.handle} | ${e.titel} (${e.titelLaenge}) | ${e.ueberschrift} | ${e.meta} (${e.metaLaenge}) | ${bild} |`);
  });
  if (p.ausgelassen.length) {
    z.push('');
    z.push('## Ausgelassen');
    for (const a of p.ausgelassen) z.push(`- ${a.farbe}: ${a.grund}`);
  }
  const warn = p.eintraege.filter((e) => e.warnungen.length);
  if (warn.length) {
    z.push('');
    z.push('## Warnungen');
    for (const e of warn) z.push(`- ${e.farbe}: ${e.warnungen.join('; ')}`);
  }
  z.push('');
  z.push('## Bildbestand');
  const ohneMuster = p.eintraege.filter((e) => !e.bilder.musterfoto).map((e) => e.farbe);
  z.push(`- Variantenbild (gekettelte Kante) und Raumansicht liegen fuer ${p.eintraege.filter((e) => e.bilder.variante && e.bilder.raumbild).length} von ${p.eintraege.length} Farben vor; die Seite zeigt das Variantenbild (Kante) zuerst, dann das Raumbild.`);
  z.push(`- Musterfoto (nicht auf der Farbseite verwendet) fehlt bei: ${ohneMuster.length ? ohneMuster.join(', ') : 'keiner Farbe'}.`);
  z.push('');
  return z.join('\n');
}

export const PRODUKT_ABFRAGE = `query($handle:String!){ productByIdentifier(identifier:{handle:$handle}){
  id title handle
  media(first:100){ nodes{ id alt ... on MediaImage{ image{ url } } } }
  variants(first:100){ nodes{ id title selectedOptions{ name value } media(first:3){ nodes{ id ... on MediaImage{ image{ url } } } } } }
  metafields(first:60){ nodes{ namespace key value } }
} }`;

export const VORHANDEN_ABFRAGE = `query{ metaobjects(type:"${TYP}", first:250){ nodes{ id handle capabilities{ publishable{ status } } fields{ key value } } } }`;

export function anlegenMutation(eintraege) {
  const g = (s) => JSON.stringify(s);
  return `mutation{ ${eintraege.map((e, i) => `m${i}: metaobjectCreate(metaobject:{ type:${g(TYP)}, handle:${g(e.handle)}, capabilities:{ publishable:{ status:DRAFT } }, fields:[
    {key:"ueberschrift",value:${g(e.ueberschrift)}},
    {key:"variante",value:${g(e.variantId)}},
    {key:"produkt",value:${g(e.produktId)}},
    {key:"seo_titel",value:${g(e.titel)}},
    {key:"seo_beschreibung",value:${g(e.meta)}} ]}){ metaobject{ id handle capabilities{ publishable{ status } } } userErrors{ field message code } }`).join('\n')} }`;
}

export function loeschenMutation(ids) {
  return `mutation{ ${ids.map((id, i) => `d${i}: metaobjectDelete(id:${JSON.stringify(id)}){ deletedId userErrors{ field message code } }`).join('\n')} }`;
}

function cli(query, { schreiben = false, dir, variablen = {} } = {}) {
  const qf = path.join(dir, schreiben ? 'm.graphql' : 'q.graphql');
  const vf = path.join(dir, 'v.json');
  fs.writeFileSync(qf, query);
  fs.writeFileSync(vf, JSON.stringify(variablen));
  const args = ['store', 'execute', '-s', STORE, '-j', '--no-input', '--query-file', qf, '--variable-file', vf];
  if (schreiben) args.push('--allow-mutations');
  const out = execFileSync('shopify', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

async function main() {
  const o = argumente(process.argv.slice(2));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-farbseiten-'));
  const produkt = cli(PRODUKT_ABFRAGE, { dir, variablen: { handle: o.handle } }).productByIdentifier;
  if (!produkt) throw new Error(`Produkt ${o.handle} nicht gefunden.`);
  const p = plan(produkt);
  // Freigabeliste und Plan immer vollstaendig; --nur wirkt nur auf Schreibdatei und --schreiben
  let auswahl = p.eintraege;
  if (o.nur) {
    auswahl = p.eintraege.filter((e) => o.nur.includes(e.farbe));
    if (auswahl.length !== o.nur.length) throw new Error(`--nur: Farbe nicht im Plan: ${o.nur.filter((n) => !auswahl.find((e) => e.farbe === n)).join(', ')}`);
  }
  fs.mkdirSync(o.ausgabe, { recursive: true });
  fs.writeFileSync(path.join(o.ausgabe, 'plan.json'), JSON.stringify(p, null, 2));
  fs.writeFileSync(path.join(o.ausgabe, 'freigabeliste.md'), freigabeliste(produkt, p));
  fs.writeFileSync(path.join(o.ausgabe, 'anlegen.graphql'), anlegenMutation(auswahl));
  console.log(`Plan: ${p.eintraege.length} Eintraege, ${p.ausgelassen.length} ausgelassen -> ${o.ausgabe}/freigabeliste.md`);
  for (const a of p.ausgelassen) console.log(`  ausgelassen: ${a.farbe} (${a.grund})`);
  if (!o.schreiben) {
    console.log(`Trockenlauf: nichts geschrieben. ${auswahl.length} Eintraege als ENTWURF: --schreiben (Shopify CLI) oder ${o.ausgabe}/anlegen.graphql per Admin-MCP senden.`);
    return;
  }

  const vorhanden = cli(VORHANDEN_ABFRAGE, { dir }).metaobjects.nodes;
  const bekannt = new Set(vorhanden.map((n) => n.handle));
  const neu = auswahl.filter((e) => !bekannt.has(e.handle));
  console.log(`Vorhanden: ${vorhanden.length}; neu anzulegen: ${neu.length}`);
  if (!neu.length) return;
  let erg;
  try {
    erg = cli(anlegenMutation(neu), { schreiben: true, dir });
  } catch (e) {
    throw new Error(`${e.message.split('\n')[0]} - die CLI-App sieht diese Definition evtl. nicht (Scope read/write_metaobject_definitions); dann ${o.ausgabe}/anlegen.graphql per Admin-MCP senden.`);
  }
  if (Object.values(erg).some((r) => r.userErrors?.some((u) => u.code === 'UNDEFINED_OBJECT_TYPE'))) {
    throw new Error(`Die CLI-App sieht die Definition ${TYP} nicht (fehlender Scope); ${o.ausgabe}/anlegen.graphql per Admin-MCP senden.`);
  }
  const fehler = Object.values(erg).flatMap((r) => r.userErrors ?? []);
  const angelegt = Object.values(erg).map((r) => r.metaobject).filter(Boolean);
  fs.writeFileSync(path.join(o.ausgabe, 'write-log.json'), JSON.stringify({ zeit: new Date().toISOString(), angelegt, fehler }, null, 2));
  fs.writeFileSync(path.join(o.ausgabe, 'rollback.json'), JSON.stringify({ mutation: loeschenMutation(angelegt.map((a) => a.id)), ids: angelegt.map((a) => a.id) }, null, 2));
  if (fehler.length) throw new Error(`userErrors: ${JSON.stringify(fehler)}`);
  // Gegenprobe: frisch lesen, Status muss DRAFT sein, Felder wie geplant
  const danach = cli(VORHANDEN_ABFRAGE, { dir }).metaobjects.nodes;
  let abweichend = 0;
  for (const e of neu) {
    const n = danach.find((x) => x.handle === e.handle);
    const f = Object.fromEntries((n?.fields ?? []).map((x) => [x.key, x.value]));
    const ok = n && n.capabilities.publishable.status === 'DRAFT' && f.seo_titel === e.titel && f.ueberschrift === e.ueberschrift && f.seo_beschreibung === e.meta && f.variante === e.variantId && f.produkt === e.produktId;
    if (!ok) { abweichend += 1; console.log(`  Abweichung: ${e.handle}`); }
  }
  console.log(`Gegenprobe: ${neu.length - abweichend} gleich, ${abweichend} abweichend (alle ENTWURF erwartet).`);
  if (abweichend) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`Fehler: ${e.message}`); process.exit(1); });
}
