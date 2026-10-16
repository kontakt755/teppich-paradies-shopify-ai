/**
 * Claude-Verbrauch aus den lokalen Sitzungsprotokollen von Claude Code (#671).
 *
 * Der Inhaber (Max-Plan) will sehen, wohin das Wochenbudget geht. Belegt ist
 * lokal nur, was Claude Code selbst in ~/.claude/projects/<projekt>/*.jsonl
 * schreibt: je Modellantwort die usage-Felder (Eingabe, Cache schreiben,
 * Cache lesen, Ausgabe), das Modell, die Denkstufe (effort), Zeitstempel und
 * die Werkzeugaufrufe. Daraus - und nur daraus - entstehen die Zahlen.
 *
 * Nicht belegt und deshalb nicht gezeigt: wie viel Prozent des Wochenlimits
 * verbraucht sind (steht in keiner lokalen Datei) und wie Anthropic die
 * Tokenarten auf das Limit anrechnet (nicht veroeffentlicht).
 *
 * Datenschutz: Aus den Protokollen werden nur Zahlen, Modellnamen,
 * Sitzungstitel, Namen geplanter Aufgaben und Aufgabennummern uebernommen -
 * nie Text aus Anfragen, Antworten oder Werkzeugergebnissen.
 *
 * Dieses Modul liest keine Dateien; es bekommt geparste Protokollzeilen
 * (siehe operations/scripts/claude-verbrauch.mjs) und ist so ohne echte
 * Protokolle testbar.
 */

export const REGELN = Object.freeze({
  /** Langsitzung: mehr aktive Zeit als das ... */
  langsitzungMinuten: 120,
  /** ... oder mehr Werkzeugaufrufe als das (Hauptsitzung, ohne Subagenten). */
  langsitzungAufrufe: 500,
  /** Eine Pause laenger als das zaehlt nicht als aktive Zeit. */
  pauseMinuten: 15,
});

export const ZEITZONE = 'Europe/Berlin';

const TAG_FORMAT = new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Kalendertag in Berlin als 'YYYY-MM-DD'. */
export function berlinTag(zeit) {
  return TAG_FORMAT.format(new Date(zeit));
}

/** Die letzten `tage` Kalendertage bis einschliesslich heute, aelteste zuerst. */
export function tageFenster(jetzt, tage = 7) {
  const liste = [];
  // Mittag statt Mitternacht: Sommerzeitwechsel verschieben keinen Tag.
  const basis = new Date(`${berlinTag(jetzt)}T12:00:00Z`).getTime();
  for (let i = tage - 1; i >= 0; i--) liste.push(berlinTag(basis - i * 864e5));
  return liste;
}

/**
 * Aufgabennummern aus einem Shell-Befehl: nur `npm run task -- <aktion> <n>`.
 * Das ist der belegte Weg, auf dem eine Sitzung ihre Aufgabe fuehrt (AGENTS.md).
 * Branchnamen taugen nicht - "live-theme-nach-1279" nennt einen PR, keine Aufgabe.
 */
export function aufgabenAusBefehl(befehl) {
  const nummern = [];
  if (typeof befehl !== 'string' || !befehl.includes('task')) return nummern;
  const re = /\bnpm run (?:-s )?task -- (?:start|review|done|block|comment|approve|ready|update|cancel)\s+#?(\d{1,6})\b/g;
  for (const m of befehl.matchAll(re)) nummern.push(Number(m[1]));
  return nummern;
}

/** Ausnahme: ein Branch, der ausdruecklich `task/<n>-…` heisst. */
export function aufgabeAusBranch(branch) {
  const m = typeof branch === 'string' ? branch.match(/^task\/(\d{1,6})-/) : null;
  return m ? Number(m[1]) : null;
}

/** Name der geplanten Aufgabe aus dem ersten Auftrag einer geplanten Sitzung. */
export function geplanteAufgabe(text) {
  const m = typeof text === 'string' ? text.match(/^\s*<scheduled-task name="([A-Za-z0-9._-]{1,80})"/) : null;
  return m ? m[1] : null;
}

const leer = () => ({ eingabe: 0, cacheSchreiben: 0, cacheLesen: 0, ausgabe: 0, gesamt: 0 });

function addiere(ziel, t) {
  ziel.eingabe += t.eingabe; ziel.cacheSchreiben += t.cacheSchreiben; ziel.cacheLesen += t.cacheLesen;
  ziel.ausgabe += t.ausgabe; ziel.gesamt += t.gesamt;
  return ziel;
}

function ausUsage(u) {
  const zahl = v => (Number.isFinite(v) && v > 0 ? v : 0);
  const t = {
    eingabe: zahl(u?.input_tokens),
    cacheSchreiben: zahl(u?.cache_creation_input_tokens),
    cacheLesen: zahl(u?.cache_read_input_tokens),
    ausgabe: zahl(u?.output_tokens),
  };
  t.gesamt = t.eingabe + t.cacheSchreiben + t.cacheLesen + t.ausgabe;
  return t;
}

function textAus(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const t = content.find(c => c?.type === 'text' && typeof c.text === 'string');
    return t ? t.text : '';
  }
  return '';
}

/**
 * Sammelt Protokollzeilen mehrerer Dateien und fasst sie zusammen.
 *
 *   const s = neuerSammler({ jetzt, tage: 7 });
 *   s.datei({ sitzungId, art: 'haupt', titel }, zeilen);              // Hauptsitzung
 *   s.datei({ sitzungId, art: 'subagent', agentTyp: 'Explore' }, zeilen); // Subagent dieser Sitzung
 *   s.ergebnis();
 */
export function neuerSammler({ jetzt = new Date(), tage = 7 } = {}) {
  const fenster = tageFenster(jetzt, tage);
  const imFenster = new Set(fenster);
  const sitzungen = new Map();
  // Claude Code schreibt eine Antwort in mehreren Zeilen (je Inhaltsblock) mit
  // derselben message.id und derselben usage. Gezaehlt wird sie einmal; eine
  // fortgesetzte Sitzung, die alte Nachrichten mitkopiert, zaehlt sie nicht neu.
  const nachrichten = new Map();
  let dateien = 0;

  const sitzung = (id) => {
    if (!sitzungen.has(id)) {
      sitzungen.set(id, {
        id, titel: null, klasse: null, geplant: null, zeiten: [], aufrufe: new Set(),
        subagenten: new Set(), aufgaben: new Set(), tage: new Set(),
      });
    }
    return sitzungen.get(id);
  };

  /**
   * Meldet eine Protokolldatei an. Mit `zeilen` (Iterable) werden sie gleich
   * gelesen; ohne liefert der Aufruf `{ zeile }` zum zeilenweisen Einspeisen -
   * so muss das Skript eine 200-MB-Datei nie ganz im Speicher halten.
   */
  function datei({ sitzungId, art = 'haupt', agentTyp = null, titel = null }, zeilen = null) {
    dateien += 1;
    const s = sitzung(sitzungId);
    const dateiKey = `${sitzungId}:${art}:${dateien}`;
    const haupt = art === 'haupt';
    if (haupt && titel && !s.titel) s.titel = String(titel).slice(0, 120);
    let ersterAuftrag = true;
    function zeile(z) {
      if (!z || typeof z !== 'object') return;
      if (haupt && z.type === 'custom-title' && typeof z.customTitle === 'string') { s.titel = z.customTitle.slice(0, 120); return; }
      if (haupt && z.type === 'agent-name' && typeof z.agentName === 'string' && !s.agentName) { s.agentName = z.agentName.slice(0, 120); return; }
      const ms = z.timestamp ? Date.parse(z.timestamp) : NaN;
      if (!Number.isFinite(ms)) return;
      const tag = berlinTag(ms);
      const drin = imFenster.has(tag);
      if (haupt && z.type === 'user' && !z.isMeta && ersterAuftrag) {
        // Die Art der Sitzung entscheidet ihr erster Auftrag: kam er vom Zeitplan,
        // ist es eine geplante Aufgabe.
        const name = geplanteAufgabe(textAus(z.message?.content));
        if (z.turnOrigin || name) {
          ersterAuftrag = false;
          if (s.klasse === null) s.klasse = (z.turnOrigin === 'scheduled' || name) ? 'geplant' : 'interaktiv';
          if (name && !s.geplant) s.geplant = name;
        }
      }
      if (haupt && (z.type === 'user' || z.type === 'assistant') && drin) s.zeiten.push(ms);
      if (haupt && drin) {
        const nr = aufgabeAusBranch(z.gitBranch);
        if (nr) s.aufgaben.add(nr);
      }
      if (z.type !== 'assistant' || !z.message) return;
      const m = z.message;
      if (haupt && drin && Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c?.type !== 'tool_use') continue;
          if (c.id) s.aufrufe.add(c.id);
          for (const nr of aufgabenAusBefehl(c.input?.command)) s.aufgaben.add(nr);
        }
      }
      if (!drin || !m.id || !m.usage || !m.model || m.model === '<synthetic>') return;
      const alt = nachrichten.get(m.id);
      if (alt && alt.dateiKey !== dateiKey) return;
      nachrichten.set(m.id, {
        dateiKey, sitzungId, klasse: haupt ? null : 'subagent', agentTyp, modell: m.model,
        effort: typeof z.effort === 'string' ? z.effort : null, tag, tokens: ausUsage(m.usage),
      });
      if (!haupt) s.subagenten.add(dateiKey);
    }
    if (zeilen) for (const z of zeilen) zeile(z);
    return { zeile };
  }

  function ergebnis() {
    const proTag = new Map(fenster.map(t => [t, { datum: t, sitzungen: new Set(), langsitzungen: 0, tokens: 0 }]));
    const modelle = new Map();
    const klassen = new Map();
    const tokensJeSitzung = new Map();
    const modelleJeSitzung = new Map();
    const summe = leer();

    for (const n of nachrichten.values()) {
      const s = sitzungen.get(n.sitzungId);
      const klasse = n.klasse || s.klasse || 'interaktiv';
      addiere(summe, n.tokens);
      s.tage.add(n.tag);
      proTag.get(n.tag).sitzungen.add(n.sitzungId);
      proTag.get(n.tag).tokens += n.tokens.gesamt;
      const mo = modelle.get(n.modell) || { modell: n.modell, antworten: 0, tokens: leer() };
      mo.antworten += 1; addiere(mo.tokens, n.tokens); modelle.set(n.modell, mo);
      const kl = klassen.get(klasse) || { klasse, sitzungen: new Set(), tokens: 0, modelle: new Map(), effort: new Map() };
      kl.sitzungen.add(n.sitzungId); kl.tokens += n.tokens.gesamt;
      kl.modelle.set(n.modell, (kl.modelle.get(n.modell) || 0) + n.tokens.gesamt);
      if (n.effort) kl.effort.set(n.effort, (kl.effort.get(n.effort) || 0) + 1);
      klassen.set(klasse, kl);
      addiere(tokensJeSitzung.get(n.sitzungId) || tokensJeSitzung.set(n.sitzungId, leer()).get(n.sitzungId), n.tokens);
      const mj = modelleJeSitzung.get(n.sitzungId) || new Map();
      mj.set(n.modell, (mj.get(n.modell) || 0) + n.tokens.gesamt); modelleJeSitzung.set(n.sitzungId, mj);
    }

    const pauseMs = REGELN.pauseMinuten * 60_000;
    const liste = [];
    for (const s of sitzungen.values()) {
      const tokens = tokensJeSitzung.get(s.id);
      if (!tokens) continue; // ohne Modellantwort im Zeitraum keine Sitzung dieser Woche
      const zeiten = s.zeiten.sort((a, b) => a - b);
      let aktivMs = 0;
      for (let i = 1; i < zeiten.length; i++) {
        const luecke = zeiten[i] - zeiten[i - 1];
        if (luecke <= pauseMs) aktivMs += luecke;
      }
      const aktivMinuten = Math.round(aktivMs / 60_000);
      const aufrufe = s.aufrufe.size;
      const lang = aktivMinuten > REGELN.langsitzungMinuten || aufrufe > REGELN.langsitzungAufrufe;
      const modellAnteile = [...(modelleJeSitzung.get(s.id) || new Map())]
        .sort((a, b) => b[1] - a[1])
        .map(([modell, gesamt]) => ({ modell, anteil: tokens.gesamt ? Math.round(gesamt / tokens.gesamt * 100) : 0 }));
      liste.push({
        id: s.id.slice(0, 8),
        titel: s.titel || s.agentName || s.geplant || null,
        klasse: s.klasse || 'interaktiv',
        geplanteAufgabe: s.geplant,
        beginn: zeiten.length ? new Date(zeiten[0]).toISOString() : null,
        ende: zeiten.length ? new Date(zeiten[zeiten.length - 1]).toISOString() : null,
        aktivMinuten,
        werkzeugaufrufe: aufrufe,
        subagenten: s.subagenten.size,
        aufgaben: [...s.aufgaben].sort((a, b) => a - b),
        lang,
        tokens,
        modelle: modellAnteile,
      });
      if (lang) for (const t of s.tage) if (proTag.has(t)) proTag.get(t).langsitzungen += 1;
    }
    liste.sort((a, b) => b.tokens.gesamt - a.tokens.gesamt);

    // Tokens je Aufgabe: eine Sitzung mit zwei Aufgaben zaehlt bei beiden -
    // aufteilen hiesse raten. Die Kachel sagt das dazu.
    const aufgaben = new Map();
    for (const s of liste) {
      for (const nr of s.aufgaben) {
        const a = aufgaben.get(nr) || { nummer: nr, sitzungen: 0, tokens: 0 };
        a.sitzungen += 1; a.tokens += s.tokens.gesamt; aufgaben.set(nr, a);
      }
    }

    const reihenfolge = { interaktiv: 0, geplant: 1, subagent: 2 };
    return {
      schema: 1,
      erzeugtAm: new Date(jetzt).toISOString(),
      zeitraum: { von: fenster[0], bis: fenster[fenster.length - 1], tage: fenster.length, zeitzone: ZEITZONE },
      regeln: { ...REGELN },
      quelle: { dateien, antworten: nachrichten.size },
      summe: {
        sitzungen: liste.length,
        langsitzungen: liste.filter(s => s.lang).length,
        werkzeugaufrufe: liste.reduce((n, s) => n + s.werkzeugaufrufe, 0),
        tokens: summe,
      },
      tage: [...proTag.values()].map(t => ({ datum: t.datum, sitzungen: t.sitzungen.size, langsitzungen: t.langsitzungen, tokens: t.tokens })),
      modelle: [...modelle.values()].sort((a, b) => b.tokens.gesamt - a.tokens.gesamt),
      klassen: [...klassen.values()]
        .sort((a, b) => (reihenfolge[a.klasse] ?? 9) - (reihenfolge[b.klasse] ?? 9))
        .map(k => ({
          klasse: k.klasse,
          sitzungen: k.sitzungen.size,
          tokens: k.tokens,
          modelle: [...k.modelle].sort((a, b) => b[1] - a[1]).map(([modell, gesamt]) => ({ modell, anteil: k.tokens ? Math.round(gesamt / k.tokens * 100) : 0 })),
          effort: [...k.effort].sort((a, b) => b[1] - a[1]).map(([stufe, antworten]) => ({ stufe, antworten })),
        })),
      sitzungen: liste.slice(0, 5),
      langsitzungen: liste.filter(s => s.lang).slice(0, 20),
      aufgaben: [...aufgaben.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 5),
      zuordnung: { mitAufgabe: liste.filter(s => s.aufgaben.length).length, ohneAufgabe: liste.filter(s => !s.aufgaben.length).length },
    };
  }

  return { datei, ergebnis };
}
