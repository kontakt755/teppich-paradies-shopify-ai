/**
 * Shop-Übersicht, nur Inhaber (Rundgang 26.10., Massnahme 44): die Morgenfragen in einer Zeile
 * unter den Warenbestellungen - laeuft der Shop, was ist zu entscheiden, welche Frist kommt als
 * naechstes. Die Umsatzzahl steht seit 05.11. ganz oben als Warenumsatz (warenkennzahl.mjs); hier
 * bleibt der Knopf zu den weiteren Kennzahlen, damit dieselbe Frage nicht zwei Zahlen bekommt.
 *
 * Reine Funktionen ohne DOM: heute.mjs sammelt die Daten und haengt die Kennzahlen-Kacheln
 * (kennzahlenBlock) an, wenn sie aufgeklappt sind.
 */
import { esc, plural } from '../../kern/helfer.mjs';
import { offeneEntscheidungen } from '../../lib/model.mjs';
import { serviceOffen } from '../../lib/serviceanfragen.mjs';

/** Shop-Kontrolle stuendlich; aelter als 3 Stunden sagt nichts ueber den Shop von jetzt (lib/todos.mjs). */
const STUMM_STUNDEN = 3;

const tagMonat = iso => {
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return d && m ? `${d}.${m}.` : String(iso);
};

function shopTeil(shop, jetzt) {
  if (shop === undefined) return null;                       // Rolle sieht die Shop-Kontrolle nicht
  if (!shop) return { text: 'Shop-Kontrolle lädt …', ton: '', href: '#/shopwache' };
  if (!shop.verfuegbar) return { text: 'Shop-Kontrolle noch nie gelaufen', ton: 'warn', href: '#/shopwache' };
  const stunden = shop.geprueftAm ? (jetzt.getTime() - Date.parse(shop.geprueftAm)) / 3_600_000 : null;
  if (shop.ampel === 'rot') return { text: 'Shop hat ein Problem', ton: 'crit', href: '#/shopwache' };
  if (shop.ampel === 'gelb') return { text: 'Shop: Auffälligkeiten', ton: 'warn', href: '#/shopwache' };
  if (stunden === null || stunden > STUMM_STUNDEN) return { text: 'Shop-Kontrolle meldet sich nicht', ton: 'warn', href: '#/shopwache' };
  return { text: 'Shop in Ordnung', ton: '', href: '#/shopwache' };
}

function kennzahlenTeil(kzOffen) {
  return kzOffen ? { text: 'Kennzahlen zuklappen', ton: '', param: '' } : { text: 'Weitere Kennzahlen', ton: '', param: '1' };
}

/**
 * Hat diese Frist noch Sinn? Die Frist einer Entscheidung gilt nur, bis entschieden ist. Danach
 * bleibt das Issue oft offen, weil noch Nacharbeit aussteht, und die Frist stand bis 05.11. rot
 * auf der Startseite (#1693: am 26.10. entschieden, "Frist überschritten 30.10."). Vor der Frage
 * (eingang, triage, geplant), waehrend sie laeuft (freigabe) und blockiert zaehlt sie weiter.
 */
function fristGilt(t) {
  return !(t.isDecision && ['bereit', 'in-arbeit', 'korrektur', 'review', 'beobachten'].includes(t.status));
}

function entscheidungTeil(tasks, geladen) {
  if (!geladen) return null;
  const n = offeneEntscheidungen(tasks).length;
  return { text: n ? `${plural(n, 'Entscheidung', 'Entscheidungen')} offen` : 'keine Entscheidung offen', ton: n ? 'warn' : 'leise', href: '#/freigaben' };
}

function fristTeil(tasks, jetzt) {
  const naechste = tasks.filter(t => t.open && t.due && fristGilt(t)).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  if (!naechste) return null;
  // Fristen sind Kalendertage im Laden: um 00:30 Uhr ist der Vortag vorbei, in UTC noch nicht
  // (gleiche Rechnung wie lib/einkauf-lieferanten.mjs, wartetage).
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);
  const ueber = naechste.due < heute;
  const tage = Math.round((Date.parse(naechste.due) - Date.parse(heute)) / 86_400_000);
  return {
    text: `${ueber ? 'Frist überschritten' : 'nächste Frist'} ${tagMonat(naechste.due)}`,
    ton: ueber ? 'crit' : tage <= 3 ? 'warn' : '',
    href: `#/heute?task=${naechste.number}`, titel: naechste.title,
  };
}

/**
 * @param {object} p
 * @param {object|null|undefined} p.shop   /api/shopwache/status; undefined = Rolle sieht sie nicht
 * @param {object[]} p.tasks               normalisierte Aufgaben (state.tasks)
 * @param {boolean} p.aufgabenGeladen      issues.json da? Sonst keine "0 Entscheidungen" behaupten
 * @param {boolean} [p.kzOffen]            Kennzahlen-Kacheln aufgeklappt (Parameter kz)
 */
export function inhaberZeile({ shop, tasks = [], aufgabenGeladen = false, kzOffen = false, jetzt = new Date() }) {
  const teile = [shopTeil(shop, jetzt), kennzahlenTeil(kzOffen), entscheidungTeil(tasks, aufgabenGeladen), fristTeil(tasks, jetzt)].filter(Boolean);
  const html = teile.map(t => {
    const klasse = `inhaber-teil${t.ton ? ` ${t.ton}` : ''}`;
    return t.param !== undefined
      ? `<button type="button" class="${klasse}" data-param="kz" data-value="${t.param}" aria-expanded="${kzOffen}">${esc(t.text)}</button>`
      : `<a class="${klasse}" href="${esc(t.href)}"${t.titel ? ` title="${esc(t.titel)}"` : ''}>${esc(t.text)}</a>`;
  });
  return `<nav class="inhaber-zeile" aria-label="Überblick für den Inhaber">${html.join('<span class="inhaber-trenner" aria-hidden="true">·</span>')}</nav>`;
}

/**
 * Zusammenfassung "Weitere Bereiche": die Laden- und Treppenanfragen bleiben im Nebenbereich
 * (Inhaber 22.10.), aber Zahl und Alter der aeltesten offenen Anfrage stehen schon zugeklappt da.
 * Gibt fertiges HTML zurueck (escapt).
 */
export function nebenbereichZusatz(serviceanfragen, jetzt = new Date()) {
  const offen = (serviceanfragen?.eintraege || []).filter(serviceOffen);
  if (!offen.length) return '';
  const alter = offen.map(e => Date.parse(e.erstelltAm || (e.datum ? `${e.datum}T00:00:00` : '')))
    .filter(Number.isFinite).map(t => Math.floor((jetzt.getTime() - t) / 86_400_000));
  const aeltest = alter.length ? Math.max(...alter) : null;
  return esc(` · ${plural(offen.length, 'offene Anfrage', 'offene Anfragen')}${aeltest >= 1 ? `, älteste seit ${plural(aeltest, 'Tag', 'Tagen')}` : ''}`);
}
