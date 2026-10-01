/**
 * Ansicht "Heute" (#/heute): die Startseite. Das Wichtigste zuerst:
 *
 *   1. "N offene To-dos fuer dich" - je Zeile Titel, eine Zeile Kontext, genau ein Knopf
 *   2. Datenstand (klein) und, beim Inhaber, was im Laden und bei der Website offen ist
 *   3. "Wer wartet auf was" - wir / Lieferant / Kunde
 *   4. Kennzahlen (nur Inhaber, nur was der Export hergibt)
 *   5. die bisherigen Bloecke, eingeklappt (ansichten/heute/bisher.mjs)
 *
 * To-dos und Spalten werden nicht erfasst, sondern abgeleitet: lib/todos.mjs rechnet sie
 * aus den Antworten der vorhandenen Endpunkte. Diese Datei laedt und zeichnet nur.
 */
import {
  leiteTodosAb, zaehleTodos, werWartet, sichtFuer, alterText, SICHTEN, SICHT_LABEL,
} from '../lib/todos.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, plural } from '../kern/helfer.mjs';
import { darfAnsicht } from '../kern/router.mjs';
import { stoerungState } from '../bausteine/karten.mjs';
import { ensureAktualisierung, aktualisierenButton, aktualisierungHealth } from '../bausteine/aktualisierung.mjs';
import { einkauf, ensureEinkaufAuftragsstatus, ensureEinkaufKennzahlen, anzeigeWert } from './einkauf/auftragsfluss.mjs';
import { hinweisText } from './einkauf/bestellungen.mjs';
import { kunden } from './kunden/gemeinsam.mjs';
import { ensureKundenBestellungen } from './kunden/bestellungen.mjs';
import { ensureKundenRueckrufe } from './kunden/rueckrufe.mjs';
import { ensureKundenFaelle } from './kunden/faelle.mjs';
import { shopwache } from './shopwache.mjs';
import { heuteDaten, ensureHeuteLieferanten, ensureHeuteAufgaben } from './heute/daten.mjs';
import { heuteBisher } from './heute/bisher.mjs';

const TODOS_SICHTBAR = 7;      // "eine kurze Liste" - der Rest steht einen Klick weiter
const SPALTE_SICHTBAR = 6;

const SPALTEN = [
  ['wir', 'Wir sind dran', 'bestellen, nachhaken, zurückrufen', 'Wir'],
  ['lieferant', 'Lieferant ist dran', 'Muster oder Ware bestellt', 'Lieferant'],
  ['kunde', 'Kunde ist dran', 'prüft Muster, zahlt oder entscheidet', 'Kunde'],
];

function benutzer() { return state.session?.benutzer || null; }
function istInhaber() { const r = benutzer()?.rolle; return !r || r === 'inhaber'; }

/** Alles, was die To-do-Ableitung braucht - in der Form, wie es die Endpunkte liefern. */
function quellen() {
  return {
    bestellzeilen: kunden.bestellungen?.verfuegbar ? kunden.bestellungen.zeilen : [],
    statusAlle: einkauf.auftragsstatus?.positionen || {},
    schwellen: heuteDaten.lieferanten?.schwellen,
    rueckrufe: kunden.rueckrufe?.verfuegbar ? kunden.rueckrufe.zeilen : [],
    faelle: kunden.faelle?.verfuegbar ? kunden.faelle.faelle : [],
    aufgaben: heuteDaten.aufgaben?.verfuegbar ? heuteDaten.aufgaben.eintraege : [],
    // Entwicklungsaufgaben und Shop-Wache sind Ansichten des Inhabers - nur er bekommt daraus To-dos.
    freigaben: istInhaber() ? state.tasks : [],
    shopwache: darfAnsicht('shopwache') ? shopwache.daten : null,
  };
}

/** Anzeigename je Lieferant aus den Stammdaten; ohne Stammdaten der neutrale Ersatz. */
function lieferantName(id) {
  const treffer = (heuteDaten.lieferanten?.lieferanten || []).find(l => l.id === id);
  if (treffer?.name) return treffer.name;
  return !id || id === 'UNGEKLAERT' ? 'Lieferant nicht zugeordnet' : anzeigeWert(id);
}

export function viewHeute() {
  ensureKundenBestellungen(); ensureEinkaufAuftragsstatus(); ensureKundenRueckrufe(); ensureKundenFaelle();
  ensureHeuteLieferanten(); ensureHeuteAufgaben(); ensureAktualisierung();
  if (istInhaber()) ensureEinkaufKennzahlen();

  const q = quellen();
  const b = benutzer();
  const eigeneSicht = sichtFuer(b, q.aufgaben);
  // Umschalten darf nur der Inhaber - und er sieht dann alles in diesem Bereich, nicht nur Eigenes.
  // Seine Startseite ist der Laden (Inhaberentscheidung 2026-10-01): Technisches (Freigaben,
  // Website-Aufgaben, Shop-Wache) erscheint erst nach einem Klick auf "Website" oder "Alles".
  const gewuenscht = state.route.params.get('sicht');
  const sicht = istInhaber() ? (SICHTEN.includes(gewuenscht) ? gewuenscht : 'laden') : eigeneSicht;
  const opt = { sicht, ich: heuteDaten.aufgaben?.ich || b?.kuerzel || b?.name || null, alle: istInhaber() && sicht !== 'inhaber', lieferantName, klartext: hinweisText };
  const todos = leiteTodosAb(q, opt);
  const wartet = werWartet(q, opt);

  return `<div class="heute">
    ${kopf(todos.length, sicht)}
    ${todoListe(todos)}
    ${istInhaber() && sicht !== 'laden' ? sprungfelder(zaehleTodos(q, opt), sicht) : ''}
    ${datenstandZeile(sicht)}
    ${werWartetBlock(wartet)}
    ${istInhaber() ? kennzahlenBlock() : ''}
    ${heuteBisher()}
  </div>`;
}

function kopf(anzahl, sicht) {
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const umschalter = istInhaber()
    ? `<span class="heute-sicht" role="group" aria-label="Ansicht wechseln">${['laden', 'website', 'inhaber'].map(k => `<a href="#/heute${k === 'laden' ? '' : `?sicht=${k}`}" ${k === sicht ? 'aria-current="true"' : ''}>${esc(k === 'inhaber' ? 'Alles' : SICHT_LABEL[k])}</a>`).join('')}</span>`
    : `<span>Ansicht ${esc(SICHT_LABEL[sicht])}</span>`;
  return `<header class="heute-kopf">
    <div class="heute-zahl${anzahl ? '' : ' null'}" aria-hidden="true">${anzahl}</div>
    <div class="heute-titel">
      <h1><span class="visually-hidden">${anzahl} </span>${anzahl === 1 ? 'offenes To-do' : 'offene To-dos'} für dich</h1>
      <p><span>${esc(datum)}</span>${umschalter}</p>
    </div>
    ${/* data-param am Feld: render() rettet damit Text und Cursor ueber ein Neuzeichnen (lib/eingabe.mjs). */ ''}
    <form class="heute-suche" role="search" onsubmit="event.preventDefault();var q=this.elements.q.value.trim();location.hash='#/lexikon'+(q?'?lq='+encodeURIComponent(q):'')">
      <label class="visually-hidden" for="heuteSuche">Produkt nachschlagen</label>
      <span class="lupe" aria-hidden="true">⌕</span>
      <input id="heuteSuche" name="q" data-param="hq" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="Produkt nachschlagen …">
    </form>
  </header>`;
}

function todoZeile(t, erste) {
  const k = t.knopf;
  const klasse = `btn btn-sm${erste ? ' btn-primary' : ''}`;
  const knopf = k.aufgabe
    ? `<button type="button" class="${klasse}" data-open="${esc(k.aufgabe)}" data-primary="1">${esc(k.text)}</button>`
    : `<a class="${klasse}" href="${esc(k.href)}">${esc(k.text)}</a>`;
  return `<div class="heute-todo ${esc(t.ton)}" data-todo="${esc(t.art)}">
    <div class="heute-todo-text"><div class="t">${esc(t.titel)}</div><div class="s">${esc(t.kontext)}</div></div>
    ${knopf}
  </div>`;
}

function todoListe(todos) {
  // Solange die Bestelldaten noch laden, waere "Alles erledigt" eine Behauptung ohne Grundlage.
  const laedt = !kunden.bestellungen || !einkauf.auftragsstatus || !heuteDaten.aufgaben;
  const stoerung = [kunden.bestellungen, kunden.rueckrufe, heuteDaten.aufgaben].find(d => d?.fehler);
  const ohneBestelldaten = kunden.bestellungen && !kunden.bestellungen.verfuegbar && !kunden.bestellungen.fehler;
  let inhalt;
  if (todos.length) {
    const oben = todos.slice(0, TODOS_SICHTBAR);
    const rest = todos.slice(TODOS_SICHTBAR);
    inhalt = oben.map((t, i) => todoZeile(t, i === 0)).join('')
      + (rest.length ? `<details class="heute-rest"><summary>Alle anzeigen (+${rest.length})</summary>${rest.map(t => todoZeile(t, false)).join('')}</details>` : '');
  } else if (laedt) inhalt = `<div class="heute-leer">Lade To-dos …</div>`;
  else inhalt = `<div class="heute-leer"><strong>Alles erledigt.</strong> Nichts wartet auf dich.</div>`;
  return `<section class="heute-todos" aria-label="Offene To-dos">${inhalt}</section>
    ${stoerung ? stoerungState(stoerung, 'Ein Teil der Daten') : ''}
    ${ohneBestelldaten ? `<p class="heute-hinweis">Bestelldaten fehlen noch – To-dos aus Bestellungen können deshalb nicht erscheinen. ${esc(kunden.bestellungen.hinweis || '')}</p>` : ''}`;
}

/** Inhaber: wie viel liegt im Laden, wie viel bei der Website - ein Klick wechselt die Ansicht. */
function sprungfelder(zahlen, sicht) {
  const feld = (k, n, text) => `<a href="#/heute${k === 'laden' ? '' : `?sicht=${k}`}" class="${n ? '' : 'null'}" ${sicht === k ? 'aria-current="true"' : ''}><b>${n}</b> ${esc(text)} <span aria-hidden="true">›</span></a>`;
  return `<nav class="heute-sprung" aria-label="Offen im Team">${feld('laden', zahlen.laden, 'offen im Laden')}${feld('website', zahlen.website, 'offen bei Website')}</nav>`;
}

/** Datenstand: eine kleine Zeile unter den To-dos statt einer Warnleiste ueber allem. */
function datenstandZeile(sicht) {
  const a = einkauf.aktualisierung;
  if (!a) return '';
  const auffaellig = aktualisierungHealth().filter(h => h.level !== 'ok');
  const bestellungen = a.teile?.bestellungen;
  const stand = bestellungen?.erfolg && bestellungen.zeitpunkt ? `Bestellungen Stand ${fmtDateTime(bestellungen.zeitpunkt)}` : '';
  const text = auffaellig.length
    ? `${plural(auffaellig.length, 'Datenquelle', 'Datenquellen')} veraltet oder mit Fehler${stand ? ` · ${stand}` : ''}`
    : `Daten aktuell${stand ? ` · ${stand}` : ''}`;
  return `<div class="heute-datenstand${auffaellig.length ? ' warn' : ''}" role="status">
    <span class="punkt" aria-hidden="true"></span><span>${esc(text)}${auffaellig.length && darfAnsicht('insights') ? ' · <a href="#/insights">ansehen</a>' : ''}</span>
    ${/* Der erklaerende Satz nur, wenn es etwas zu tun gibt - bei aktuellen Daten waere er Rauschen. */ ''}
    ${aktualisierenButton({ mitHinweis: auffaellig.length > 0 && sicht !== 'laden' })}
  </div>`;
}

function wartZeile(z) {
  return `<a class="heute-wart" href="${esc(z.href)}">
    <span class="heute-wart-text"><span class="t">${esc(z.name)}</span><span class="s">${esc(z.schritt)} · ${esc(z.zusatz)}</span></span>
    ${z.alterTage === null || z.alterTage === undefined ? '' : `<span class="heute-alter ${esc(z.ton)}">${esc(alterText(z.alterTage))}</span>`}
  </a>`;
}

function werWartetBlock(w) {
  const gewaehlt = SPALTEN.some(([k]) => k === state.route.params.get('spalte')) ? state.route.params.get('spalte') : 'wir';
  const laedt = !kunden.bestellungen || !einkauf.auftragsstatus;
  const spalte = ([k, titel, unter]) => {
    const liste = w[k];
    return `<div class="heute-spalte${k === gewaehlt ? ' gewaehlt' : ''}">
      <div class="heute-spalte-kopf"><b>${liste.length}</b><div><span>${esc(titel)}</span><small>${esc(unter)}</small></div></div>
      ${liste.length ? liste.slice(0, SPALTE_SICHTBAR).map(wartZeile).join('') : `<div class="heute-leer klein">${laedt ? 'Lade …' : 'Niemand.'}</div>`}
      ${liste.length > SPALTE_SICHTBAR ? `<a class="heute-spalte-mehr" href="#/kunden?tab=bestellungen">+${liste.length - SPALTE_SICHTBAR} weitere</a>` : ''}
    </div>`;
  };
  return `<section class="heute-block" aria-labelledby="heuteWartet">
    <div class="heute-block-kopf"><h2 id="heuteWartet">Wer wartet auf was</h2><span>${plural(w.gesamt, 'laufender Vorgang', 'laufende Vorgänge')}</span><a href="#/kunden?tab=bestellungen">Alle</a></div>
    ${w.gesamt ? `<div class="heute-balken" aria-hidden="true">${SPALTEN.map(([k]) => `<i style="flex:${w[k].length || 0.2}"></i>`).join('')}</div>` : ''}
    <div class="heute-spalten-wahl" role="tablist">${SPALTEN.map(([k, , , kurz]) => `<button type="button" role="tab" data-param="spalte" data-value="${k === 'wir' ? '' : k}" aria-selected="${k === gewaehlt}">${esc(kurz)} <b>${w[k].length}</b></button>`).join('')}</div>
    <div class="heute-spalten">${SPALTEN.map(spalte).join('')}</div>
  </section>`;
}

/**
 * Kennzahlen: nur, was der Shop-Export (/api/einkauf/kennzahlen) wirklich enthaelt -
 * Bestellungen, Muster, Umsatz und Bestellwert fuer 7 und 30 Tage. Einen Wochenverlauf
 * gibt der Export nicht her; deshalb keine Verlaufslinie und keine erfundene Vorwoche.
 */
function kennzahlenBlock() {
  const k = einkauf.kennzahlen;
  const z7 = k?.verfuegbar ? k.zeitraeume?.['7'] : null;
  const z30 = k?.verfuegbar ? k.zeitraeume?.['30'] : null;
  const zahl = v => (typeof v === 'number' ? v.toLocaleString('de-DE') : null);
  const geld = (v, z) => (typeof v === 'number' ? v.toLocaleString('de-DE', { style: 'currency', currency: z?.waehrung || 'EUR', maximumFractionDigits: 0 }) : null);
  const kachel = (titel, w7, w30) => `<div class="heute-kpi">
      <div class="n${w7 === null ? ' fehlt' : ''}">${esc(w7 ?? 'nicht verfügbar')}</div>
      <div class="l">${esc(titel)}</div>
      <div class="d">${w30 === null ? '30 Tage: nicht verfügbar' : `30 Tage: ${esc(w30)}`}</div>
    </div>`;
  const hinweis = !k ? 'Lade …'
    : k.verfuegbar ? `letzte 7 Tage · Stand ${fmtDateTime(k.erstellt)}`
      : 'Shop-Kennzahlen sind noch nicht exportiert';
  return `<section class="heute-block" aria-labelledby="heuteKpi">
    <div class="heute-block-kopf"><h2 id="heuteKpi">Kennzahlen</h2><span>${esc(hinweis)}</span></div>
    <div class="heute-kpis">
      ${kachel('Bestellungen', zahl(z7?.bestellungen), zahl(z30?.bestellungen))}
      ${kachel('davon kostenlose Muster', zahl(z7?.kostenlos), zahl(z30?.kostenlos))}
      ${kachel('Umsatz', geld(z7?.umsatz, z7), geld(z30?.umsatz, z30))}
      ${kachel('Ø Bestellwert', z7?.bestellungen ? geld(z7?.durchschnitt, z7) : null, z30?.bestellungen ? geld(z30?.durchschnitt, z30) : null)}
    </div>
  </section>`;
}
