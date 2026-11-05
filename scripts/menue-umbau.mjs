#!/usr/bin/env node
/**
 * Hauptmenue umbauen, ohne einen Zweig zu verlieren.
 *
 * menuUpdate ersetzt den GESAMTEN Item-Baum (docs/lessons/tote-menuelinks.md).
 * Dieses Skript baut den neuen Baum aus dem aktuellen Menue und einem Plan
 * (domains/shopify/menue-umbau-2026-10.json), setzt jede bestehende
 * MenuItem-ID wieder ein und bricht ab, wenn eine fehlt, doppelt vorkommt
 * oder der Baum tiefer als drei Ebenen wird. Es schreibt nur Dateien; die
 * Mutation laeuft ueber die Admin API (MCP), weil der CLI-Token keine Menues
 * lesen darf.
 *
 *   # 1. aktuelles Menue per MCP lesen: menu(id) { id handle title items { ... 3 Ebenen } }
 *   #    und als JSON speichern (rohe Antwort oder nur das menu-Objekt)
 *   node scripts/menue-umbau.mjs --alt vorher.json --update update.json     # menuUpdate-Variablen mit IDs
 *   node scripts/menue-umbau.mjs --alt vorher.json --entwurf entwurf.json   # menuCreate-Variablen ohne IDs (Entwurfsmenue)
 *   node scripts/menue-umbau.mjs --alt vorher.json --pruefen nachher.json   # Gegenprobe nach dem Schreiben
 *   node scripts/menue-umbau.mjs --alt vorher.json --zurueck zurueck.json   # menuUpdate-Variablen fuer den alten Stand
 *
 * Ein bestehender Punkt kann mit {"id", "ziel": {type, resourceId|url}} auf ein
 * neues Ziel zeigen; seine ID bleibt erhalten.
 *
 * Entfernen nur ausdruecklich: "entfernen": [{"id", "_titel"}] auf oberster
 * Ebene des Plans. Ein entfernter Punkt nimmt seine Unterpunkte mit; jeder davon
 * muss ebenfalls in der Liste stehen, damit nichts unbemerkt wegfaellt
 * (Teppichboden-Menue 2026-11-04). Die Gegenprobe erwartet genau diese IDs als
 * verloren; --zurueck legt sie ohne ID neu an (Shopify kennt sie nicht mehr).
 *
 * Gegenprobe (--pruefen): die ID-Menge von vorher steckt vollstaendig in
 * nachher, und nachher hat genau so viele Punkte mehr, wie der Plan neue
 * vorsieht - nicht "userErrors: []".
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MAX_TIEFE = 3;

/** Nimmt die rohe MCP-Antwort ({data: {menu}}) oder das menu-Objekt selbst. */
export function menueAus(json) {
  const menu = json?.data?.menu ?? json?.menu ?? json;
  if (!menu || !Array.isArray(menu.items)) throw new Error('Kein Menue gefunden (erwartet: {id, title, items: [...]})');
  return menu;
}

function alleItems(items, out = [], eltern = null) {
  for (const item of items ?? []) {
    out.push({ item, eltern });
    alleItems(item.items, out, item);
  }
  return out;
}

/** Menge aller MenuItem-IDs eines Menues. */
export function idMenge(menu) {
  return new Set(alleItems(menu.items).map(({ item }) => item.id).filter(Boolean));
}

function bereinigt(item) {
  const kopie = { id: item.id, title: item.title, type: item.type };
  if (item.url != null) kopie.url = item.url;
  if (item.resourceId != null) kopie.resourceId = item.resourceId;
  kopie.tags = item.tags ?? [];
  kopie.items = (item.items ?? []).map(bereinigt);
  return kopie;
}

/**
 * Wendet den Plan auf das alte Menue an. Ergebnis: Baum mit id fuer bestehende
 * Punkte und ohne id fuer neue. Wirft bei fehlenden, doppelten oder
 * unbekannten IDs und bei mehr als drei Ebenen.
 */
export function umbauen(alt, plan) {
  const altMenu = menueAus(alt);
  const index = new Map(alleItems(altMenu.items).map(({ item, eltern }) => [item.id, { item, eltern }]));

  // Alle ausdruecklich genannten IDs vorab sammeln, damit "*" sie auslaesst.
  const genannt = new Set();
  (function sammeln(eintraege) {
    for (const e of eintraege ?? []) {
      if (e && typeof e === 'object') {
        if (e.id) genannt.add(e.id);
        sammeln(e.kinder);
      }
    }
  })(plan.oben);

  const entfernt = new Set((plan.entfernen ?? []).map((e) => e.id));
  const unbekannt = [...genannt, ...entfernt].filter((id) => !index.has(id));
  if (unbekannt.length) throw new Error(`Plan nennt IDs, die das Menue nicht hat: ${unbekannt.join(', ')}`);

  const verwendet = [];
  const fehler = [];
  for (const id of entfernt) {
    if (genannt.has(id)) fehler.push(`Zugleich verwendet und entfernt: ${index.get(id).item.title} (${id})`);
    for (const { item } of alleItems(index.get(id).item.items)) {
      if (!entfernt.has(item.id)) fehler.push(`Unterpunkt eines entfernten Punkts steht nicht in "entfernen": ${item.title} (${item.id})`);
    }
  }
  const bleibt = (k) => !genannt.has(k.id) && !entfernt.has(k.id);

  function bauen(eintrag, altItem) {
    if (eintrag === '*') {
      if (!altItem) {
        fehler.push('"*" ohne bestehenden Oberpunkt');
        return [];
      }
      return (altItem.items ?? []).filter(bleibt).map((k) => uebernehmen(k));
    }
    if (eintrag.id) {
      const quelle = index.get(eintrag.id).item;
      const item = { ...bereinigt(quelle), items: [] };
      verwendet.push(quelle.id);
      if (eintrag.title) item.title = eintrag.title;
      // Neues Ziel fuer einen bestehenden Punkt (ID bleibt): {"ziel": {type, resourceId | url}}
      if (eintrag.ziel) {
        const { type, url, resourceId } = eintrag.ziel;
        if (!type || (resourceId == null && url == null)) fehler.push(`Ziel ohne type und resourceId/url: ${JSON.stringify(eintrag.ziel)}`);
        item.type = type;
        delete item.url;
        delete item.resourceId;
        if (resourceId != null) item.resourceId = resourceId;
        else item.url = url;
      }
      if (eintrag.kinder) {
        item.items = eintrag.kinder.flatMap((k) => bauen(k, quelle));
      } else {
        item.items = (quelle.items ?? []).filter(bleibt).map((k) => uebernehmen(k));
      }
      return [item];
    }
    if (eintrag.neu) {
      const { title, type, url, resourceId, tags } = eintrag.neu;
      if (!title || !type) fehler.push(`Neuer Punkt ohne title/type: ${JSON.stringify(eintrag.neu)}`);
      const item = { title, type, tags: tags ?? [], items: [] };
      if (url != null) item.url = url;
      if (resourceId != null) item.resourceId = resourceId;
      item.items = (eintrag.kinder ?? []).flatMap((k) => bauen(k, null));
      return [item];
    }
    fehler.push(`Unbekannter Planeintrag: ${JSON.stringify(eintrag)}`);
    return [];
  }

  function uebernehmen(altItem) {
    verwendet.push(altItem.id);
    const item = { ...bereinigt(altItem), items: [] };
    item.items = (altItem.items ?? []).filter(bleibt).map((k) => uebernehmen(k));
    return item;
  }

  const items = plan.oben.flatMap((e) => bauen(e, null));

  const doppelt = verwendet.filter((id, i) => verwendet.indexOf(id) !== i);
  if (doppelt.length) fehler.push(`Doppelt eingesetzt: ${[...new Set(doppelt)].join(', ')}`);
  const fehlend = [...index.keys()].filter((id) => !verwendet.includes(id) && !entfernt.has(id));
  if (fehlend.length) {
    fehler.push(`Im Plan fehlen ${fehlend.length} bestehende Punkte: ${fehlend.map((id) => `${index.get(id).item.title} (${id})`).join(', ')}`);
  }
  const tiefe = (liste, t = 1) => Math.max(0, ...liste.map((i) => (i.items?.length ? tiefe(i.items, t + 1) : t)));
  if (tiefe(items) > MAX_TIEFE) fehler.push(`Baum ist ${tiefe(items)} Ebenen tief, Shopify erlaubt ${MAX_TIEFE}`);

  if (fehler.length) throw new Error(`Umbauplan nicht anwendbar:\n  - ${fehler.join('\n  - ')}`);
  return { id: altMenu.id, handle: altMenu.handle, title: altMenu.title, items, entfernt: [...entfernt] };
}

/** Baum in Mutationseingabe umwandeln; ohne IDs fuer menuCreate. */
export function alsEingabe(items, { mitIds, ohneIds = new Set() }) {
  return items.map((item) => {
    const e = { title: item.title, type: item.type, tags: item.tags ?? [] };
    if (mitIds && item.id && !ohneIds.has(item.id)) e.id = item.id;
    if (item.resourceId) e.resourceId = item.resourceId;
    else if (item.url != null) e.url = item.url;
    e.items = alsEingabe(item.items ?? [], { mitIds, ohneIds });
    return e;
  });
}

function zaehlen(items) {
  return alleItems(items).length;
}

/**
 * Gegenprobe nach menuUpdate: alle alten IDs da (ausser den ausdruecklich
 * entfernten, die wirklich fehlen muessen), genau die neuen Punkte dazu.
 */
export function pruefen(alt, nachher, erwartetNeu, entfernt = []) {
  const vorherIds = idMenge(menueAus(alt));
  const nachherMenu = menueAus(nachher);
  const nachherIds = idMenge(nachherMenu);
  const weg = new Set(entfernt);
  const verloren = [...vorherIds].filter((id) => !nachherIds.has(id) && !weg.has(id));
  const nochDa = [...weg].filter((id) => nachherIds.has(id));
  const dazu = zaehlen(nachherMenu.items) - (vorherIds.size - weg.size);
  return {
    ok: verloren.length === 0 && nochDa.length === 0 && dazu === erwartetNeu,
    verloren, nochDa, dazu, erwartetNeu, entfernt: weg.size, vorher: vorherIds.size, nachher: zaehlen(nachherMenu.items),
  };
}

function lesen(datei) {
  return JSON.parse(fs.readFileSync(datei, 'utf8'));
}

function schreiben(datei, daten) {
  fs.writeFileSync(datei, `${JSON.stringify(daten, null, 2)}\n`);
  console.log(`geschrieben: ${datei}`);
}

const istDirektaufruf = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istDirektaufruf) {
  const args = process.argv.slice(2);
  const bekannt = new Set(['--alt', '--plan', '--update', '--entwurf', '--pruefen', '--zurueck', '--handle', '--titel']);
  const wert = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const unbekannt = args.filter((a, i) => a.startsWith('--') && !bekannt.has(a) && !bekannt.has(args[i - 1]));
  if (unbekannt.length || !wert('--alt')) {
    console.error('Aufruf: node scripts/menue-umbau.mjs --alt <menue.json> [--plan <plan.json>] (--update|--entwurf|--pruefen|--zurueck) <datei>');
    process.exit(2);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const alt = lesen(wert('--alt'));
  const plan = lesen(wert('--plan') ?? path.join(root, 'domains/shopify/menue-umbau-2026-10.json'));

  try {
    const neu = umbauen(alt, plan);
    const anzahlNeu = zaehlen(neu.items) - (idMenge(menueAus(alt)).size - neu.entfernt.length);
    console.log(`Plan anwendbar: ${idMenge(menueAus(alt)).size - neu.entfernt.length} bestehende Punkte bleiben (IDs), ${neu.entfernt.length} entfernt, ${anzahlNeu} neue, ${neu.items.length} Hauptpunkte.`);
    if (wert('--update')) schreiben(wert('--update'), { id: neu.id, title: neu.title, items: alsEingabe(neu.items, { mitIds: true }) });
    if (wert('--entwurf')) {
      schreiben(wert('--entwurf'), {
        handle: wert('--handle') ?? 'hauptmenue-entwurf',
        title: wert('--titel') ?? 'ENTWURF Hauptmenü (w-094, nicht live)',
        items: alsEingabe(neu.items, { mitIds: false }),
      });
    }
    if (wert('--zurueck')) {
      const m = menueAus(alt);
      schreiben(wert('--zurueck'), { id: m.id, title: m.title, items: alsEingabe(m.items, { mitIds: true, ohneIds: new Set(neu.entfernt) }) });
    }
    if (wert('--pruefen')) {
      const r = pruefen(alt, lesen(wert('--pruefen')), anzahlNeu, neu.entfernt);
      console.log(`Gegenprobe: vorher ${r.vorher}, entfernt ${r.entfernt}, nachher ${r.nachher}, neu ${r.dazu} (erwartet ${r.erwartetNeu}), verloren ${r.verloren.length}, entfernt aber noch da ${r.nochDa.length}`);
      if (r.verloren.length) console.error(`Verlorene IDs: ${r.verloren.join(', ')}`);
      if (r.nochDa.length) console.error(`Sollten entfernt sein: ${r.nochDa.join(', ')}`);
      process.exit(r.ok ? 0 : 1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
