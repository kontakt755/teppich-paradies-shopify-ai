// Anreicherung aus den Lieferant-A-Produktseiten (Attributtabelle) in
// Shopify-Metafelder uebersetzen. Ersetzt die bisherigen, nur lokal
// liegenden Python-Skripte `plan_aus_cache.py` (Kollektion/Marke, Varianten-
// Metafelder `einkauf.*`) und `build_technik_plan.py` (technische Daten,
// Produkt-Metafelder `custom.*`) - gleiches Verhalten, jetzt versioniert,
// getestet und ohne Python-Abhaengigkeit.
//
// Reiner Datenteil: liest den Seiten-Cache, den Katalog-Abgleich und das
// Lexikon (operations/lib/lexikon.mjs) und liefert Schreibpakete. Kein
// Netzwerk, kein Schreibzugriff hier - das macht operations/scripts/anreicherung.mjs.
//
// Quelle ist ausschliesslich die Attributtabelle der Lieferantenseite. Was
// dort nicht steht, bleibt offen (CLAUDE.md "Produkteigenschaften nicht
// erfinden"). Vorhandene Werte werden nie ueberschrieben.

function leer(wert) {
  return wert === null || wert === undefined || String(wert).trim() === '';
}

function norm(wert) {
  return String(wert ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Metaobjekt-Eintraege je Referenztyp, wie am 2026-09-24 per Shopify-MCP
 * (`metaobjects(type: ...)`) gelesen - gegengeprueft gegen den Stand vom
 * 2026-09-23, den `build_technik_plan.py` bereits nutzte (unveraendert).
 * Nur diese Werte duerfen referenziert werden; alles andere ist ein neuer
 * Metaobjekt-Eintrag und damit eine Inhaberentscheidung, keine automatische
 * Anlage (CLAUDE.md "Farbcodes werden abgeschrieben, nie fortgesetzt" gilt
 * sinngemaess auch hier: Metaobjekt-Zuordnung nur bei exakter Entsprechung).
 */
export const METAOBJEKTE = Object.freeze({
  brandverhalten: {
    'gid://shopify/Metaobject/1723461796174': 'Cfl-S 1',
    'gid://shopify/Metaobject/1723464450382': 'Test',
    'gid://shopify/Metaobject/1781884682574': 'Bfl-s1',
    'gid://shopify/Metaobject/1829830951246': 'Bfl-s1 G CS',
    'gid://shopify/Metaobject/1829830984014': 'Bfl-s1 G NCS',
    'gid://shopify/Metaobject/1829831016782': 'Cfl-s1 G CS',
    'gid://shopify/Metaobject/1829831049550': 'Cfl-s1 L CS',
  },
  nutzungsklasse: {
    'gid://shopify/Metaobject/1720952127822': 'Klasse 21 (Wohnen, gering)',
    'gid://shopify/Metaobject/1720952160590': 'Klasse 22 (Wohnen, normal)',
    'gid://shopify/Metaobject/1720952193358': 'Klasse 23 (Wohnen, stark)',
    'gid://shopify/Metaobject/1720952357198': 'Klasse 31 (Gewerbe, gering)',
    'gid://shopify/Metaobject/1720952389966': 'Klasse 32 (Gewerbe, normal)',
    'gid://shopify/Metaobject/1720952422734': 'Klasse 33 (Gewerbe, stark)',
    'gid://shopify/Metaobject/1781884649806': 'Klasse 42 (Gewerbe, sehr stark)',
    'gid://shopify/Metaobject/1829831082318': 'Klasse 34 (Gewerbe, sehr stark)',
    'gid://shopify/Metaobject/1829831115086': 'Klasse 41 (Industrie, gering)',
    'gid://shopify/Metaobject/1829831147854': 'Klasse 43 (Industrie, stark)',
  },
  fusbodenheizung: {
    'gid://shopify/Metaobject/1723461632334': 'Ja',
    'gid://shopify/Metaobject/1723461665102': 'Nein',
  },
  fasermaterial: {
    'gid://shopify/Metaobject/1724735652174': 'Pl',
    'gid://shopify/Metaobject/1724735717710': 'Polyamid',
    'gid://shopify/Metaobject/1727080857934': 'Polyester',
    'gid://shopify/Metaobject/1727081709902': 'Polyester SD - durchgefärbtes Garn',
    'gid://shopify/Metaobject/1749143650638': 'SD - durchgefärbtes Garn',
    'gid://shopify/Metaobject/1781612544334': 'Polypropylen',
    'gid://shopify/Metaobject/1781821276494': 'Schurwolle',
    'gid://shopify/Metaobject/1781868527950': 'Sisal',
  },
});

// Feld -> (Metafeld-Key, Shopify-Typ, Attributname(n) auf der Lieferantenseite,
// Metaobjekt-Typ oder null fuer Freitext). Typen 2026-09-24 gegen die Live-
// Metafelddefinitionen geprueft (metafieldDefinitions(namespace:"custom",
// ownerType:PRODUCT)): alle single_line_text_field ausser den drei
// Referenztypen unten - keine geraten.
export const TECHNIK_FELDER = Object.freeze({
  brandverhalten: { key: 'brandverhalten', type: 'list.metaobject_reference', attrNamen: ['Brandverhalten'], moaTyp: 'brandverhalten' },
  nutzungsklasse: { key: 'nutzungsklassen', type: 'list.metaobject_reference', attrNamen: ['Nutzungsklasse'], moaTyp: 'nutzungsklasse' },
  fussbodenheizung: { key: 'fusbodenheizung', type: 'metaobject_reference', attrNamen: ['Fußbodenheizung'], moaTyp: 'fusbodenheizung' },
  gesamtstaerke: { key: 'gesamtstarke', type: 'single_line_text_field', attrNamen: ['Stärke (mm)'], moaTyp: null },
  ruecken: { key: 'ruckenausstattung', type: 'single_line_text_field', attrNamen: ['Rücken'], moaTyp: null },
  trittschallverbesserung: { key: 'trittschallverbesserung', type: 'single_line_text_field', attrNamen: ['Trittschallverbesserung'], moaTyp: null },
  fasermaterial: { key: 'fasermaterial', type: 'list.metaobject_reference', attrNamen: ['Fasermaterial'], moaTyp: 'fasermaterial' },
  florhoehe: { key: 'florhohe', type: 'single_line_text_field', attrNamen: ['Florhöhe', 'Florhöhe (mm)'], moaTyp: null },
  material: { key: 'material', type: 'single_line_text_field', attrNamen: ['Material'], moaTyp: null },
  komfortklasse: { key: 'komfortklasse', type: 'single_line_text_field', attrNamen: ['Komfortklasse'], moaTyp: null },
});

// einkauf.* Varianten-Felder, die die Lieferantenseite direkt liefert.
export const EINKAUF_FELDER = Object.freeze({
  kollektion: { key: 'lieferant_kollektion', type: 'single_line_text_field', attrNamen: ['Kollektionsname', 'Kollektion'], seitenFeld: 'kollektion' },
  marke: { key: 'marke', type: 'single_line_text_field', attrNamen: ['Marke'], seitenFeld: 'marke' },
});

// Der Lieferant nennt bei der Fussbodenheizung die Heizungsart
// ("Warmwasser"), unser Feld kennt nur Ja/Nein. Jede genannte Heizungsart
// heisst fuer den Kunden: geeignet.
const GLEICHBEDEUTEND = Object.freeze({
  fusbodenheizung: {
    warmwasser: 'Ja',
    'warmwasser, warmwasser': 'Ja',
    ja: 'Ja',
    nein: 'Nein',
  },
});

// Lieferant fuehrt die Einheit in der Spaltenueberschrift und liefert nackte
// Zahlen mit Punkt; im Shop steht Einheit + deutsches Komma ("7,5 mm",
// "14 dB"). Nur reine Zahlen werden ergaenzt - ein Wert mit Text/Einheit
// bleibt unveraendert.
export const EINHEIT = Object.freeze({ gesamtstaerke: 'mm', florhoehe: 'mm', trittschallverbesserung: 'dB' });

export function mitEinheit(feld, roh) {
  const wert = String(roh).trim();
  const einheit = EINHEIT[feld];
  if (!einheit) return wert;
  if (!/^\d+(?:[.,]\d+)?$/.test(wert)) return wert;
  return `${wert.replace('.', ',')} ${einheit}`;
}

const KLASSE_NUM = /Klasse\s+(\d+)/;

/** '32, 23' -> [gid Klasse32, gid Klasse23] - nur bei exakter Zifferentsprechung. */
export function nutzungsklasseGids(roh) {
  const zahlZuGid = {};
  for (const [gid, name] of Object.entries(METAOBJEKTE.nutzungsklasse)) {
    const m = KLASSE_NUM.exec(name);
    if (m) zahlZuGid[m[1]] = gid;
  }
  const gids = [];
  const unbekannt = [];
  for (let teil of String(roh).split(/[,/]/)) {
    teil = teil.trim();
    if (!teil) continue;
    if (zahlZuGid[teil]) {
      if (!gids.includes(zahlZuGid[teil])) gids.push(zahlZuGid[teil]);
    } else {
      unbekannt.push(teil);
    }
  }
  return { gids, unbekannt };
}

/** Exakte Entsprechung (whitespace-/case-insensitiv, inkl. Gleichbedeutend-Tabelle), sonst null. */
export function metaobjektGid(typ, roh) {
  let ziel = norm(roh);
  ziel = norm(GLEICHBEDEUTEND[typ]?.[ziel] ?? ziel);
  for (const [gid, name] of Object.entries(METAOBJEKTE[typ] ?? {})) {
    if (norm(name) === ziel) return gid;
  }
  return null;
}

/** Attributwert einer Cache-Seite fuer die erste passende Spaltenueberschrift. */
function attrWert(seite, attrNamen) {
  const attrs = seite?.attrs ?? {};
  for (const name of attrNamen) {
    if (!leer(attrs[name])) return attrs[name];
  }
  return null;
}

function produktGidAusAdminUrl(adminUrl) {
  const m = /\/products\/(\d+)/.exec(adminUrl || '');
  return m ? `gid://shopify/Product/${m[1]}` : null;
}

/**
 * Baut fuer eine SKU die passende Lieferantenseiten-ID aus dem Katalog -
 * nur bei einem exaktem 1:1-Treffer (gleiche Regel wie die
 * lieferant-a-recherche-Skill: `total === 1` und `material_number` entspricht
 * exakt der SKU).
 */
export function seitenIdFuerSku(katalog, sku) {
  const eintrag = katalog?.[sku];
  if (!eintrag || !eintrag.found || eintrag.total !== 1) return null;
  const match = eintrag.match ?? {};
  if (norm(match.material_number) !== norm(sku)) return null;
  const url = match.url || '';
  const pid = url.split('/').filter(Boolean).pop();
  return pid || null;
}

/**
 * Plant die technischen Produkt-Metafelder (custom.*) aus dem Seiten-Cache.
 * Spiegelt build_technik_plan.py.
 *
 * @param {object} opt
 * @param {object} opt.cache        pid -> {attrs, kollektion, marke, url, ...}
 * @param {object} opt.katalog      sku -> {found, total, match:{material_number,url}}
 * @param {Array}  opt.produkte     Lexikon-Produkte (operations/lib/lexikon.mjs aufbereiten().produkte)
 * @returns {{werte: Array, offen: Array, konflikte: Array, neueMetaobjekte: object}}
 */
export function planeTechnikFelder({ cache, katalog, produkte }) {
  const werte = [];
  const offen = [];
  const konflikte = [];
  const neueMetaobjekte = {};

  for (const p of produkte) {
    const gid = produktGidAusAdminUrl(p.adminUrl);
    if (!gid) continue;
    const eigenschaften = p.eigenschaften ?? {};
    const skus = (p.varianten ?? []).map((v) => v.sku).filter(Boolean);
    if (!skus.length) continue; // Fixpreis-/Rollenware ohne eigene SKU je Variante -> keine Quelle

    for (const [feld, def] of Object.entries(TECHNIK_FELDER)) {
      if (!leer(eigenschaften[feld])) continue; // steht schon, nie ueberschreiben

      const gefunden = [];
      let hatSkuMatch = false;
      let hatSeite = false;
      for (const sku of skus) {
        const pid = seitenIdFuerSku(katalog, sku);
        if (!pid) continue;
        hatSkuMatch = true;
        const seite = cache[pid];
        if (!seite) continue;
        hatSeite = true;
        const roh = attrWert(seite, def.attrNamen);
        if (!leer(roh)) gefunden.push({ roh, quelle: seite.url ?? null });
      }

      if (!gefunden.length) {
        if (hatSeite) continue; // Seite da, Attribut fehlt dort (z. B. Vinyl ohne Fasermaterial) -> keine Meldung
        if (hatSkuMatch) offen.push({ produkt: p.handle, feld, grund: 'Lieferantenseite noch nicht im Crawler-Cache' });
        else offen.push({ produkt: p.handle, feld, grund: 'keine SKU mit exaktem Katalog-Treffer bei Lieferant A' });
        continue;
      }

      const eindeutige = new Set(gefunden.map((g) => norm(g.roh)));
      if (eindeutige.size > 1) {
        const alleWerte = [...new Set(gefunden.map((g) => g.roh))].sort();
        konflikte.push({ produkt: p.handle, feld, werte: alleWerte });
        offen.push({ produkt: p.handle, feld, grund: `widerspruechliche Lieferantenwerte je Variante: ${JSON.stringify(alleWerte)}` });
        continue;
      }

      const { roh, quelle } = gefunden[0];

      if (!def.moaTyp) {
        werte.push({ ownerId: gid, namespace: 'custom', key: def.key, type: def.type, value: mitEinheit(feld, roh), produkt: p.handle, quelle });
        continue;
      }
      if (def.moaTyp === 'nutzungsklasse') {
        const { gids, unbekannt } = nutzungsklasseGids(roh);
        if (unbekannt.length) {
          const set = (neueMetaobjekte[def.moaTyp] ??= new Set());
          unbekannt.forEach((u) => set.add(u));
          offen.push({ produkt: p.handle, feld, grund: `Nutzungsklasse(n) ohne Metaobjekt-Eintrag: ${JSON.stringify(unbekannt)} (Rohwert "${roh}")` });
          continue;
        }
        if (!gids.length) {
          offen.push({ produkt: p.handle, feld, grund: `kein Zahlenwert in "${roh}" erkannt` });
          continue;
        }
        werte.push({ ownerId: gid, namespace: 'custom', key: def.key, type: def.type, value: JSON.stringify(gids), produkt: p.handle, quelle, roh });
        continue;
      }
      const gidZiel = metaobjektGid(def.moaTyp, roh);
      if (!gidZiel) {
        (neueMetaobjekte[def.moaTyp] ??= new Set()).add(roh.trim());
        offen.push({ produkt: p.handle, feld, grund: `kein Metaobjekt-Eintrag fuer "${roh}" (neuer Eintrag noetig)` });
        continue;
      }
      const value = def.type.startsWith('list.') ? JSON.stringify([gidZiel]) : gidZiel;
      werte.push({ ownerId: gid, namespace: 'custom', key: def.key, type: def.type, value, produkt: p.handle, quelle, roh });
    }
  }

  const neueMetaobjekteObj = {};
  for (const [typ, set] of Object.entries(neueMetaobjekte)) neueMetaobjekteObj[typ] = [...set].sort();

  return { werte, offen, konflikte, neueMetaobjekte: neueMetaobjekteObj };
}

/**
 * Plant die einkauf.*-Variantenfelder Kollektion/Marke aus dem Seiten-Cache.
 * Spiegelt plan_aus_cache.py. `produkte` ist das Lexikon-Modell, dessen
 * Varianten bereits `einkauf.kollektion`/`einkauf.marke` (falls vorhanden)
 * und `sku` tragen.
 *
 * @param {object} opt
 * @param {object} opt.cache    pid -> {kollektion, marke, attrs, url}
 * @param {object} opt.katalog  sku -> {found, total, match:{material_number,url}}
 * @param {Array}  opt.produkte Lexikon-Produkte
 * @returns {{werte: Array, offen: Array}}
 */
export function planeEinkaufFelder({ cache, katalog, produkte }) {
  const werte = [];
  const offen = [];

  for (const p of produkte) {
    for (const v of p.varianten ?? []) {
      if (!v.sku || !v.id) continue;
      const pid = seitenIdFuerSku(katalog, v.sku);
      if (!pid) continue;
      const seite = cache[pid];
      if (!seite) {
        offen.push({ produkt: p.handle, sku: v.sku, grund: 'Lieferantenseite noch nicht im Crawler-Cache' });
        continue;
      }
      for (const [feld, def] of Object.entries(EINKAUF_FELDER)) {
        const roh = !leer(seite[def.seitenFeld]) ? seite[def.seitenFeld] : attrWert(seite, def.attrNamen);
        if (leer(roh)) continue;
        const vorhanden = v.einkauf?.[feld === 'kollektion' ? 'kollektion' : 'marke'];
        if (!leer(vorhanden) && norm(vorhanden) === norm(roh)) continue; // steht schon so drin
        if (!leer(vorhanden)) continue; // etwas anderes steht schon drin -> nie ueberschreiben
        werte.push({ ownerId: v.id, namespace: 'einkauf', key: def.key, type: def.type, value: String(roh).trim(), produkt: p.handle, sku: v.sku, quelle: seite.url ?? null });
      }
    }
  }

  return { werte, offen };
}

/** Fasst Technik- und Einkaufsplan zusammen (fuer die Zaehlausgabe im Skript). */
export function planeAlles({ cache, katalog, produkte }) {
  const technik = planeTechnikFelder({ cache, katalog, produkte });
  const einkauf = planeEinkaufFelder({ cache, katalog, produkte });
  return {
    werte: [...technik.werte, ...einkauf.werte],
    offen: [...technik.offen, ...einkauf.offen],
    konflikte: technik.konflikte,
    neueMetaobjekte: technik.neueMetaobjekte,
    technikAnzahl: technik.werte.length,
    einkaufAnzahl: einkauf.werte.length,
  };
}

/**
 * Teilt Schreibpakete in Batchdateien: hoechstens 25 Metafelder je
 * `metafieldsSet`-Aufruf, 8 aliasierte Aufrufe je Datei (Format aus
 * `.claude/skills/shopify-massendaten/SKILL.md`).
 *
 * @param {Array} werte  [{ownerId, namespace, key, type, value}]
 * @param {{jeAufruf?: number, aufrufeJeDatei?: number, alias?: string}} [opt]
 * @returns {string[]} fertige GraphQL-Mutationstexte, eine je Datei
 */
export function baueBatches(werte, opt = {}) {
  const jeAufruf = opt.jeAufruf ?? 25;
  const aufrufeJeDatei = opt.aufrufeJeDatei ?? 8;
  const alias = opt.alias ?? 'a';

  const aufrufe = [];
  for (let i = 0; i < werte.length; i += jeAufruf) aufrufe.push(werte.slice(i, i + jeAufruf));

  const dateien = [];
  for (let d = 0; d < aufrufe.length; d += aufrufeJeDatei) {
    const teil = aufrufe.slice(d, d + aufrufeJeDatei);
    const body = teil.map((aufruf, j) => {
      const felder = aufruf.map((m) => {
        const value = m.type.startsWith('list.') ? JSON.stringify(m.value) : JSON.stringify(String(m.value));
        return `{ownerId:${JSON.stringify(m.ownerId)},namespace:${JSON.stringify(m.namespace)},key:${JSON.stringify(m.key)},type:${JSON.stringify(m.type)},value:${value}}`;
      }).join(',');
      return `${alias}${d + j}:metafieldsSet(metafields:[${felder}]){userErrors{field message}}`;
    }).join(' ');
    dateien.push(`mutation{${body}}`);
  }
  return dateien;
}

/** Rollback-Eintraege: alter Wert (meist null, da nur leere Felder geschrieben werden). */
export function baueRollback(werte, vorherWerte = {}) {
  return werte.map((m) => ({
    ownerId: m.ownerId,
    namespace: m.namespace,
    key: m.key,
    type: m.type,
    vorher: vorherWerte[`${m.ownerId}.${m.namespace}.${m.key}`] ?? null,
  }));
}
