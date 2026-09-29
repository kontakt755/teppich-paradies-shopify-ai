#!/usr/bin/env node
/**
 * Lighthouse-Messung gegen das LIVE-Theme, mit festem Profil und Streuungskontrolle.
 *
 *   npm run lighthouse:messen -- --pruefen          # nur Vorpruefung, kein Lighthouse-Lauf
 *   npm run lighthouse:messen -- --probe            # ein Lauf je Variante auf der Startseite
 *   npm run lighthouse:messen                       # 3 Seiten x 2 Varianten x 5 Runden (rund 25 Minuten)
 *   npm run lighthouse:messen -- --runden 3 --seiten start,pdp --banner ohne
 *
 * ─── Mit und ohne Cookie-Banner ────────────────────────────────────────
 * Bei Erstbesuchern mobil ist der Text des Shopify-Cookie-Banners oft das
 * LCP-Element (Probelauf 2026-09-26: Startseite, LCP 6,4 s, davon 6,3 s
 * "Element render delay" bei 95 ms TTFB). Ein solcher Lauf misst den Banner,
 * nicht die Seite. Deshalb laeuft jede Seite in zwei Varianten: "mit" (wie der
 * Kunde sie sieht) und "ohne" (Banner blockiert). Eine Verbesserung der Seite
 * zeigt sich nur in "ohne"; ob der Kunde sie spuert, in "mit".
 *
 * ─── Warum ein Werkzeug und kein einzelner Lauf ────────────────────────
 * Derselbe Stand lieferte auf der Klickvinyl-Kategorie LCP 4,4 / 4,8 / 11,6 s
 * (docs/analyse/qualitaet-erstbefund-2026-09-11.md). Ein Lauf oder auch drei
 * Laeufe hintereinander belegen deshalb weder eine Verbesserung noch eine
 * Verschlechterung. Dieses Skript misst reihum (Start, Kollektion, PDP, Start …)
 * statt Seite fuer Seite, damit Tageszeit und Shopify-Cache alle Seiten gleich
 * treffen, und berichtet Minimum, Median und Maximum, nie nur einen Wert.
 *
 * ─── Was hier bewusst NICHT geht ───────────────────────────────────────
 * Keine Vorschau-URLs (?preview_theme_id): Das Vorschau-Cookie kostet eine
 * 302-Umleitung von rund 860 ms und macht die Werte zweigipflig. Fuer Live
 * ist das nicht noetig, Live wird ohne Umleitung ausgeliefert. Wer ein
 * Entwurfstheme messen will, braucht das Cookie-Verfahren aus
 * docs/analyse/qualitaet-erstbefund-2026-09-11.md, nicht dieses Skript.
 *
 * ─── Vorpruefung (bricht bei Verstoss ab) ──────────────────────────────
 *   - jede Seite antwortet direkt mit 200, ohne Umleitung
 *   - alle Seiten laden Theme-Dateien aus demselben /cdn/shop/t/<n>/-Pfad
 *   - der Pfad wird ins Protokoll geschrieben, damit spaeter belegbar ist,
 *     welcher Stand gemessen wurde (Live tauscht die Themes bei jedem Livegang)
 *
 * Ergebnisse liegen lokal unter ~/teppich-paradies-analyse/lighthouse/<datum>/
 * (roh: laeufe.json, lesbar: zusammenfassung.md), nicht im Repository.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Dieselbe Version wie beim Ausgangswert vom 2026-09-22. */
export const LIGHTHOUSE_VERSION = '13.5.0';
export const BASIS = 'https://www.teppich-paradies.net';

/**
 * Dieselben drei Seiten wie beim Ausgangswert. Annahme: "PDP Piumera" war das
 * Teppichboden-Produkt, nicht "Piumera Teppich nach Mass" — im Bericht nicht
 * belegt, bei Abweichung hier den Pfad tauschen.
 */
export const SEITEN = [
  { id: 'start', name: 'Startseite', pfad: '/' },
  { id: 'kollektion', name: 'Kollektion Teppichboden', pfad: '/collections/teppichboden' },
  { id: 'pdp', name: 'PDP Piumera', pfad: '/products/piumera-teppichboden-400cm-500cm' },
];

/** Ausgangswerte vom 2026-09-22 (audit/shop-2-0-prelaunch/06-TESTS.md), je ein Lauf. */
export const AUSGANGSWERT = {
  start: { score: 54, lcp: 8.9 },
  kollektion: { score: 68, lcp: 10.1 },
  pdp: { score: 64, lcp: 7.7 },
};

const CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ─── reine Funktionen (getestet in qa/tests/lighthouse-messung.test.mjs) ────

export function median(zahlen) {
  const s = zahlen.filter((z) => Number.isFinite(z)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Reihum statt seitenweise: je Runde jede Seite in jeder Variante ([a-mit a-ohne b-mit …]). */
export function reihenfolge(seiten, runden, varianten = ['mit']) {
  const plan = [];
  for (let r = 1; r <= runden; r++) {
    for (const s of seiten) for (const v of varianten) plan.push({ runde: r, seite: s, variante: v });
  }
  return plan;
}

/** Zieht die Theme-Nummer aus /cdn/shop/t/<n>/; null, wenn keine vorkommt. */
export function themePfad(html) {
  const treffer = [...html.matchAll(/\/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1]);
  if (!treffer.length) return null;
  const haeufigkeit = new Map();
  for (const t of treffer) haeufigkeit.set(t, (haeufigkeit.get(t) ?? 0) + 1);
  return [...haeufigkeit.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Liest die Kennzahlen aus einem Lighthouse-Ergebnis (lhr). */
export function kennzahlen(lhr, angefragteUrl) {
  const a = lhr.audits ?? {};
  const wert = (id) => a[id]?.numericValue ?? null;
  // Lighthouse 13 fuehrt das LCP-Element nicht mehr als eigenen Audit, es steht
  // im lcp-breakdown-insight: eine Tabelle (Teilzeiten) und ein Knoten.
  const teile = a['lcp-breakdown-insight']?.details?.items ?? [];
  const lcpKnoten = teile.find((i) => i.type === 'node');
  const renderDelay = teile.find((i) => i.type === 'table')?.items?.find((t) => t.subpart === 'elementRenderDelay')?.duration ?? null;
  const umleitungsMs = a.redirects?.numericValue ?? 0;
  const endUrl = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? '';
  const gleich = (x, y) => x.replace(/\/$/, '') === y.replace(/\/$/, '');
  const warnungen = lhr.runWarnings ?? [];
  return {
    score: lhr.categories?.performance?.score == null ? null : Math.round(lhr.categories.performance.score * 100),
    fcp: wert('first-contentful-paint'),
    lcp: wert('largest-contentful-paint'),
    tbt: wert('total-blocking-time'),
    cls: wert('cumulative-layout-shift'),
    si: wert('speed-index'),
    bytes: wert('total-byte-weight'),
    dom: wert('dom-size'),
    lcpElement: lcpKnoten?.selector ?? null,
    lcpText: lcpKnoten?.nodeLabel?.slice(0, 60) ?? null,
    lcpRenderDelay: renderDelay,
    // Der Text des Shopify-Cookie-Banners ist bei Erstbesuchern mobil oft das LCP-Element.
    lcpIstBanner: /shopify-pc__banner/.test(lcpKnoten?.selector ?? ''),
    umleitungsMs,
    warnungen,
    // Ein Lauf gilt nur als sauber, wenn Lighthouse nichts gemeldet hat,
    // keine Umleitung mitgemessen wurde und die Ziel-URL erreicht wurde.
    sauber: warnungen.length === 0 && umleitungsMs === 0 && gleich(endUrl, angefragteUrl),
  };
}

const METRIKEN = ['score', 'fcp', 'lcp', 'tbt', 'cls', 'si', 'bytes', 'dom'];

/** Schluessel der Zusammenfassung: Seite und Variante (mit/ohne Cookie-Banner). */
export const schluessel = (seiteId, variante) => `${seiteId}|${variante}`;

/** Fasst Laeufe je Seite und Variante zusammen: Minimum, Median, Maximum, Anzahl sauberer Laeufe. */
export function zusammenfassen(laeufe) {
  const je = new Map();
  for (const l of laeufe) {
    const k = schluessel(l.seiteId, l.variante ?? 'mit');
    if (!je.has(k)) je.set(k, []);
    je.get(k).push(l);
  }
  const ergebnis = {};
  for (const [id, liste] of je) {
    const sauber = liste.filter((l) => l.sauber);
    const zeile = { laeufe: liste.length, sauber: sauber.length, bannerLcp: sauber.filter((l) => l.lcpIstBanner).length };
    for (const m of METRIKEN) {
      const werte = sauber.map((l) => l[m]).filter((w) => w != null);
      zeile[m] = werte.length
        ? { min: Math.min(...werte), median: median(werte), max: Math.max(...werte) }
        : null;
    }
    const elemente = new Map();
    for (const l of sauber) elemente.set(l.lcpElement, (elemente.get(l.lcpElement) ?? 0) + 1);
    zeile.lcpElemente = [...elemente.entries()].sort((a, b) => b[1] - a[1]);
    ergebnis[id] = zeile;
  }
  return ergebnis;
}

// ─── Vorpruefung und Lauf ────────────────────────────────────────────────

async function vorpruefung(seiten) {
  const pfade = new Set();
  for (const s of seiten) {
    const antwort = await fetch(BASIS + s.pfad, { redirect: 'manual' });
    if (antwort.status !== 200) {
      const ziel = antwort.headers.get('location') ?? '-';
      throw new Error(`${s.pfad}: HTTP ${antwort.status} statt 200 (Ziel: ${ziel}). Umleitung wuerde mitgemessen.`);
    }
    const t = themePfad(await antwort.text());
    if (!t) throw new Error(`${s.pfad}: kein /cdn/shop/t/<n>/ im HTML, Theme nicht bestimmbar.`);
    console.log(`  OK  ${s.pfad.padEnd(46)} 200 ohne Umleitung, Theme-Pfad t/${t}`);
    pfade.add(t);
  }
  if (pfade.size > 1) throw new Error(`Seiten laden verschiedene Theme-Pfade: ${[...pfade].join(', ')}`);
  return [...pfade][0];
}

function lighthouseLauf(url, ausgabe, ohneBanner) {
  const chrome = process.env.CHROME_PATH ?? (existsSync(CHROME_MAC) ? CHROME_MAC : undefined);
  const args = [
    '--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, url,
    '--preset=perf', '--output=json', `--output-path=${ausgabe}`,
    '--quiet', '--chrome-flags=--headless=new --no-sandbox',
    // Variante "ohne": Shopify-Cookie-Banner nicht laden, damit sein Text nicht das LCP-Element wird.
    ...(ohneBanner ? ['--blocked-url-patterns=*privacy-banner*'] : []),
  ];
  const r = spawnSync('npx', args, { encoding: 'utf8', env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) } });
  if (r.status !== 0) throw new Error(`Lighthouse-Lauf fehlgeschlagen (${r.status}): ${(r.stderr || r.stdout).slice(0, 400)}`);
  return JSON.parse(readFileSync(ausgabe, 'utf8'));
}

const sek = (ms) => (ms == null ? '-' : (ms / 1000).toFixed(1));
const spanne = (z, f) => (z ? `${f(z.min)} / **${f(z.median)}** / ${f(z.max)}` : '-');

export function bericht(zus, meta) {
  const z = [];
  z.push(`# Lighthouse Live, ${meta.datum}`, '');
  z.push(`Lighthouse ${LIGHTHOUSE_VERSION}, \`--preset=perf\`, mobil simuliert. Theme-Pfad live: \`t/${meta.theme}\`.`);
  z.push(`Runden: ${meta.runden}, reihum gemessen. Werte: Minimum / **Median** / Maximum, nur saubere Laeufe.`);
  z.push('"mit Banner" ist der Erstbesucher, wie ihn der Kunde sieht; "ohne Banner" blockiert den Shopify-Cookie-Banner und zeigt die Seite selbst.', '');
  z.push('| Seite | Laeufe (sauber) | Banner ist LCP | Score | LCP (s) | FCP (s) | TBT (ms) | CLS | Daten (MB) |', '|---|---|---|---|---|---|---|---|---|');
  for (const s of meta.seiten) {
    for (const v of meta.varianten) {
      const r = zus[schluessel(s.id, v)];
      if (!r) continue;
      z.push(`| ${s.name}, ${v} Banner | ${r.laeufe} (${r.sauber}) | ${r.bannerLcp}x | ${spanne(r.score, (x) => x)} | ${spanne(r.lcp, sek)} | ${spanne(r.fcp, sek)} | ${spanne(r.tbt, (x) => Math.round(x))} | ${spanne(r.cls, (x) => x.toFixed(3))} | ${spanne(r.bytes, (x) => (x / 1e6).toFixed(1))} |`);
    }
  }
  z.push('', '## Ausgangswert 2026-09-22 (je ein Lauf, mit Banner, Zeitpunkt relativ zu den vier Perf-Merges nicht belegt)', '');
  for (const s of meta.seiten) {
    const a = AUSGANGSWERT[s.id];
    if (a) z.push(`- ${s.name}: Score ${a.score}, LCP ${a.lcp} s`);
  }
  z.push('', '## LCP-Element (haeufigstes je Seite und Variante)', '');
  for (const s of meta.seiten) {
    for (const v of meta.varianten) {
      const top = zus[schluessel(s.id, v)]?.lcpElemente?.[0];
      if (top) z.push(`- ${s.name}, ${v} Banner: \`${top[0]}\` (${top[1]}x)`);
    }
  }
  z.push('', 'Vergleichbar sind nur gleiche Seiten in gleicher Variante. Der Ausgangswert gilt fuer "mit Banner".');
  return z.join('\n') + '\n';
}

async function main() {
  const arg = process.argv.slice(2);
  const wert = (name) => { const i = arg.indexOf(name); return i >= 0 ? arg[i + 1] : undefined; };
  if (arg.some((a) => a.includes('preview_theme_id'))) throw new Error('Keine Vorschau-URLs, siehe Kopfkommentar.');

  const ids = wert('--seiten')?.split(',');
  const seiten = ids ? SEITEN.filter((s) => ids.includes(s.id)) : SEITEN;
  if (!seiten.length) throw new Error(`Unbekannte Seiten. Moeglich: ${SEITEN.map((s) => s.id).join(', ')}`);
  const runden = arg.includes('--probe') ? 1 : Number(wert('--runden') ?? 5);
  const nurPruefen = arg.includes('--pruefen');
  const planSeiten = arg.includes('--probe') ? seiten.slice(0, 1) : seiten;
  const banner = wert('--banner') ?? 'beides';
  if (!['mit', 'ohne', 'beides'].includes(banner)) throw new Error('--banner: mit, ohne oder beides');
  const varianten = banner === 'beides' ? ['mit', 'ohne'] : [banner];

  console.log('Vorpruefung:');
  const theme = await vorpruefung(planSeiten);
  if (nurPruefen) return console.log('\nVorpruefung bestanden, kein Lauf gestartet.');

  const datum = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const ordner = join(homedir(), 'teppich-paradies-analyse', 'lighthouse', datum);
  mkdirSync(ordner, { recursive: true });

  const plan = reihenfolge(planSeiten, runden, varianten);
  console.log(`\n${plan.length} Laeufe, Ausgabe: ${ordner}`);
  const laeufe = [];
  for (const [i, { runde, seite, variante }] of plan.entries()) {
    const url = BASIS + seite.pfad;
    const lhr = lighthouseLauf(url, join(ordner, `roh-${seite.id}-${variante}-${runde}.json`), variante === 'ohne');
    const k = { seiteId: seite.id, variante, runde, ...kennzahlen(lhr, url) };
    laeufe.push(k);
    console.log(`  ${String(i + 1).padStart(2)}/${plan.length} ${seite.id.padEnd(10)} ${variante.padEnd(4)} Runde ${runde}  Score ${k.score}  LCP ${sek(k.lcp)} s  ${k.lcpIstBanner ? '[Banner ist LCP] ' : ''}${k.sauber ? '' : 'UNSAUBER ' + k.warnungen.join(' | ')}`);
    writeFileSync(join(ordner, 'laeufe.json'), JSON.stringify({ theme, laeufe }, null, 1));
  }
  const zus = zusammenfassen(laeufe);
  const md = bericht(zus, { datum, theme, runden, seiten: planSeiten, varianten });
  writeFileSync(join(ordner, 'zusammenfassung.md'), md);
  console.log('\n' + md);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
}
