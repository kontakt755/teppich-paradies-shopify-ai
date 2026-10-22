/**
 * Ansicht "Heute" (#/heute): die Startseite. Seit 2026-10-19 genau EINE Arbeitsliste
 * (Inhaber: "zu unuebersichtlich"; Codex-Audit: dieselbe Sache stand bis zu dreimal da):
 *
 *   1. "Heute zu erledigen" - N ist genau die Zahl der Zeilen darunter. Jede Zeile: was, fuer
 *      wen, eine Zeile Kontext, genau ein Knopf. To-dos (lib/todos.mjs), Nachfragen, bei denen
 *      ein Mensch ran muss (lib/muster-nachfassen.mjs), neue Service-Anfragen, Lieferantenbelege
 *      (Storno, Lieferschein ohne Haken) und "In Shopify noch offen" (einkauf/shopify-abgleich.mjs).
 *   2. "Im Hintergrund" - was ohne uns laeuft, je eine ruhige Zeile zum Aufklappen:
 *      automatische Muster-Nachfragen (die volle Karte aus heute/muster-nachfassen.mjs),
 *      "wartet auf Lieferant/Kunde" (die Spalte "Wir sind dran" ist die Liste oben selbst)
 *      und der Datenstand.
 *   3. Laden und Montage (heute/laden.mjs) - nur, wenn verbunden. Kennzahlen nur beim Inhaber.
 *
 * Entfallen am 2026-10-19: das zweite Suchfeld (die Suche oben findet auch Produkte), die
 * Sprungfelder (die Zahlen stehen jetzt an den Sicht-Chips), die Spalte "Wir sind dran" und
 * die leeren Bloecke "Laden nicht eingerichtet"/"Montage noch nicht verbunden".
 *
 * To-dos werden nicht erfasst, sondern abgeleitet - diese Datei laedt und zeichnet nur.
 */
import {
  leiteTodosAb, zaehleTodos, werWartet, sichtFuer, sortiereTodos, alterText, SICHT_LABEL,
} from '../lib/todos.mjs';
import { versandLaeuft, teileNachfassen, nachfassTodo } from '../lib/muster-nachfassen.mjs';
import { belegTodos } from '../lib/lieferbelege.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, plural } from '../kern/helfer.mjs';
import { darfAnsicht } from '../kern/router.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { schnittJeBezahlter } from '../lib/kennzahlen.mjs';
import { stoerungState } from '../bausteine/karten.mjs';
import { ensureAktualisierung, aktualisierenButton, aktualisierungHealth } from '../bausteine/aktualisierung.mjs';
import { einkauf, ensureEinkaufAuftragsstatus, ensureEinkaufKennzahlen, ensureEinkaufBestellungen, anzeigeWert, kundeUndOrt } from './einkauf/auftragsfluss.mjs';
import { belege, ensureBelege, laufStand } from './einkauf/belege.mjs';
import { hinweisText } from './einkauf/bestellungen.mjs';
import { kunden } from './kunden/gemeinsam.mjs';
import { ensureMusterPacken } from './kunden/muster-packen.mjs';
import { bestellungenOffen } from './kunden/bestellungen.mjs';
import { ensureKundenBestellungen } from './kunden/bestellungen.mjs';
import { ensureKundenRueckrufe } from './kunden/rueckrufe.mjs';
import { ensureKundenFaelle } from './kunden/faelle.mjs';
import { ensureServiceanfragen } from './kunden/serviceanfragen.mjs';
import { heuteLaden, heuteMontage, ladenKachel, ensureLadenZahlen } from './heute/laden.mjs';
import { shopwache, ensureShopwache } from './shopwache.mjs';
import { ensureAkquise, akquiseFaellig } from './akquise.mjs';
import { heuteDaten, ensureHeuteLieferanten, ensureHeuteAufgaben, ensureHeuteMusterTexte } from './heute/daten.mjs';
import { musterNachfassenStand, musterNachfassenBlock } from './heute/muster-nachfassen.mjs';
import { shopifyAbgleich, ensureShopifyAbgleich, shopifyAbgleichTodos } from './einkauf/shopify-abgleich.mjs';
import { veralteteQuellen, datenstandTodo } from '../lib/datenstand.mjs';
import { startBestellarbeit } from '../lib/start-bestellarbeit.mjs';
import { bestellarbeitBlock } from './heute/bestellarbeit.mjs';

const TODOS_SICHTBAR = 3;      // Bestellarbeit zuerst, weitere Aufgaben bleiben kurz und vollstaendig erreichbar.
const SPALTE_SICHTBAR = 8;

/** Sichten mit Chip beim Inhaber; "inhaber" (fruehere Fokus-Sicht) aus alten Links wird "alles". */
const INHABER_SICHTEN = ['laden', 'website', 'alles'];

const WARTE_SPALTEN = [
  ['lieferant', 'Beim Lieferanten', 'Muster oder Ware bestellt'],
  ['kunde', 'Beim Kunden', 'prüft Muster, zahlt oder entscheidet'],
];

function benutzer() { return state.session?.benutzer || null; }
function istInhaber() { const r = benutzer()?.rolle; return !r || r === 'inhaber'; }
/** Mitarbeiter (2026-10-21): eine einzige Liste, nur Ladenarbeit, kein Hintergrund und keine Technik. */
function istMitarbeiter() { return benutzer()?.rolle === 'mitarbeiter'; }

/** Alles, was die To-do-Ableitung braucht - in der Form, wie es die Endpunkte liefern. */
function quellen() {
  return {
    bestellzeilen: kunden.bestellungen?.verfuegbar ? kunden.bestellungen.zeilen : [],
    statusAlle: einkauf.auftragsstatus?.positionen || {},
    schwellen: heuteDaten.lieferanten?.schwellen,
    rueckrufe: kunden.rueckrufe?.verfuegbar ? kunden.rueckrufe.zeilen : [],
    faelle: kunden.faelle?.verfuegbar ? kunden.faelle.faelle : [],
    serviceanfragen: kunden.serviceanfragen?.eintraege || [],
    aufgaben: heuteDaten.aufgaben?.verfuegbar ? heuteDaten.aufgaben.eintraege : [],
    // Entwicklungsaufgaben und Shop-Wache sind Ansichten des Inhabers - nur er bekommt daraus To-dos.
    freigaben: istInhaber() ? state.tasks : [],
    shopwache: darfAnsicht('shopwache') ? shopwache.daten : null,
    akquise: darfAnsicht('akquise') ? akquiseFaellig() : [],
    kundentermine: darfAnsicht('einkauf') ? kundentermine() : [],
  };
}

/** Termine beim Kunden (Einkauf "Je Auftrag") mit Auftragsnummer und Kundenname. */
function kundentermine() {
  const d = einkauf.bestellungen;
  if (!d?.verfuegbar) return [];
  return Object.entries(d.kundentermine || {}).map(([orderId, t]) => {
    const a = (d.auftraege || []).find(x => String(x.id) === orderId);
    return a ? { orderId, termin: t.termin, auftragName: a.name, kundeName: kundeUndOrt(orderId).name || '' } : null;
  }).filter(Boolean);
}

/** Anzeigename je Lieferant aus den Stammdaten; ohne Stammdaten der neutrale Ersatz. */
function lieferantName(id) {
  const treffer = (heuteDaten.lieferanten?.lieferanten || []).find(l => l.id === id);
  if (treffer?.name) return treffer.name;
  return !id || id === 'UNGEKLAERT' ? 'Lieferant nicht zugeordnet' : anzeigeWert(id);
}

/** Link auf Heute mit geaendertem Parameter - die gewaehlte Sicht bleibt erhalten. */
function heuteHref(key, value) {
  const p = new URLSearchParams(state.route.params);
  if (value) p.set(key, value); else p.delete(key);
  const q = p.toString();
  return `#/heute${q ? `?${q}` : ''}`;
}

/** Welche Sicht? Inhaber waehlt per Chip (Standard Laden, Inhaberentscheidung 2026-10-01), alle anderen bekommen ihre. */
function gewaehlteSicht(aufgaben) {
  // Website-/Technik-Eintraege gehoeren nicht auf die Liste eines Mitarbeiters (Wunsch 2026-10-21).
  if (istMitarbeiter()) return 'laden';
  if (!istInhaber()) return sichtFuer(benutzer(), aufgaben);
  const roh = state.route.params.get('sicht');
  const sicht = roh === 'inhaber' ? 'alles' : roh;
  return INHABER_SICHTEN.includes(sicht) ? sicht : 'laden';
}

/**
 * Nachfragen bei Musterkunden: wer muss selbst ran, was laeuft automatisch? Muster nachfassen
 * macht der Laden (Inhaberentscheidung 2026-10-10) - in der Website-Sicht nicht.
 */
function nachfassStand(sicht) {
  const alle = musterNachfassenStand();
  const t = heuteDaten.musterTexte;
  const laeuft = versandLaeuft(t);
  // Solange die Antwort fehlt, ist offen, ob der Lauf verschickt - dann lieber nichts als To-do zeigen,
  // was gleich von selbst rausgeht (die Zeile "Im Hintergrund" sagt "Lade …").
  const teile = laeuft === null ? { mensch: [], automatisch: alle.offen, ohneWeg: [] } : teileNachfassen(alle.offen, { automatisch: laeuft });
  const sichtbar = sicht !== 'website';
  const lauf = t?.versand?.letzterLauf;
  return {
    alle: sichtbar ? alle : { offen: [], erledigt: [], abgemeldet: [] },
    laeuft,
    mensch: sichtbar ? teile.mensch.filter(e => !(laeuft === null && e.kontakt?.weg === 'email')) : [],
    automatisch: sichtbar ? teile.automatisch : [],
    ohneWeg: sichtbar ? teile.ohneWeg : [],
    versandFehler: sichtbar && laeuft && lauf?.fehler > 0 ? lauf : null,
    alleOffen: alle.offen,
  };
}

/** Der Versandlauf hatte Fehler: das muss jemand ansehen - eine Zeile, nicht je Kunde. */
function versandFehlerTodo(lauf) {
  return {
    id: 'nachfassen-versand', art: 'nachfassen_versand', bereich: 'laden', ton: 'warn', alterTage: null,
    titel: `Muster-Nachfragen: ${plural(lauf.fehler, 'E-Mail', 'E-Mails')} nicht verschickt`,
    kontext: `letzter Lauf ${fmtDateTime(lauf.am)} · ${lauf.verschickt || 0} verschickt`,
    knopf: { text: 'Ansehen', href: heuteHref('mn', '1') },
  };
}

export function viewHeute() {
  ensureMusterPacken();
  ensureKundenBestellungen(); ensureEinkaufAuftragsstatus(); ensureKundenRueckrufe(); ensureKundenFaelle();
  ensureServiceanfragen(); ensureHeuteLieferanten(); ensureHeuteAufgaben(); ensureAktualisierung();
  ensureLadenZahlen(); ensureShopifyAbgleich();
  if (istInhaber()) ensureEinkaufKennzahlen();
  if (darfAnsicht('shopwache')) ensureShopwache();
  if (darfAnsicht('akquise')) ensureAkquise();
  if (darfAnsicht('einkauf')) { ensureBelege(); ensureEinkaufBestellungen(); }

  const q = quellen();
  const b = benutzer();
  const sicht = gewaehlteSicht(q.aufgaben);
  // Der Inhaber sieht in jeder Sicht alles darin - nicht nur, was ihm zugewiesen ist.
  const opt = { sicht, ich: heuteDaten.aufgaben?.ich || b?.kuerzel || b?.name || null, alle: istInhaber(), lieferantName, klartext: hinweisText };
  const nf = nachfassStand(sicht);
  if (nf.alleOffen.length || nf.alle.erledigt.length) ensureHeuteMusterTexte();

  // Nachfragen und Lieferantenbelege gehoeren zum Laden; die Laden-Zahl am Chip zaehlt sie
  // auch, wenn gerade die Website-Sicht offen ist.
  const nfLaden = sicht === 'website' ? nachfassStand('laden') : nf;
  const eigeneLaden = [
    ...nfLaden.mensch.map(e => nachfassTodo(e, { ansehenHref: heuteHref('mn', '1') })),
    ...(nfLaden.versandFehler ? [versandFehlerTodo(nfLaden.versandFehler)] : []),
    ...(darfAnsicht('einkauf') ? belegTodos(belege.daten) : []),
    // Im Dashboard abgehakt, in Shopify offen (#1424) - je Bestellung eine Zeile mit "In Shopify nachbuchen".
    ...shopifyAbgleichTodos(),
    // Veraltete Daten: ein To-do fuer den Inhaber, bis der Sync-Dienst wieder liefert (lib/datenstand.mjs).
    ...(istInhaber() ? datenstandTodo(veralteteQuellen(einkauf.aktualisierung)) : []),
  ];
  const eigene = sicht === 'website' ? [] : eigeneLaden;
  const liste = sortiereTodos([...leiteTodosAb(q, opt), ...eigene]);
  // Chip-Zahlen zaehlen dasselbe wie die Liste: To-dos der Sicht plus Nachfragen und Belege (Laden).
  const chips = istInhaber() ? chipZahlen(q, opt, eigeneLaden.length) : null;
  const wartet = werWartet(q, { ...opt, nachfassen: new Set(nf.alleOffen.map(e => e.orderId)) });

  if (istMitarbeiter()) {
    return `<div class="heute heute-einfach">
    ${kopf(liste.length, sicht, null)}
    ${bestellEinstieg()}
    ${todoListe(liste)}
    ${state.route.params.get('mn') ? musterNachfassenBlock(nf.alle) : ''}
  </div>`;
  }

  return `<div class="heute">
    ${kopf(liste.length, sicht, chips)}
    ${bestellEinstieg()}
    ${todoListe(liste)}
    ${hintergrund(nf, wartet, sicht)}
    ${state.route.params.get('mn') ? musterNachfassenBlock(nf.alle) : ''}
    ${state.route.params.get('ww') ? werWartetBlock(wartet) : ''}
    ${sicht === 'website' ? '' : ladenUndMontage()}
    ${istInhaber() ? kennzahlenBlock() : ''}
  </div>`;
}

function chipZahlen(q, opt, laden) {
  const z = zaehleTodos(q, opt);
  return { laden: z.laden + laden, website: z.website, alles: z.alles + laden };
}

function kopf(anzahl, sicht, chips) {
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const umschalter = chips
    ? `<span class="heute-sicht" role="group" aria-label="Bereich wählen">${INHABER_SICHTEN.map(k => `<a href="#/heute${k === 'laden' ? '' : `?sicht=${k}`}" ${k === sicht ? 'aria-current="true"' : ''}>${esc(SICHT_LABEL[k])} <b>${chips[k]}</b></a>`).join('')}</span>`
    : istMitarbeiter() ? '' : `<span>Bereich ${esc(SICHT_LABEL[sicht] || sicht)}</span>`;
  return `<header class="heute-kopf">
    <div class="heute-titel">
      <h1 class="visually-hidden">Heute</h1>
      <p><span>${esc(datum)}</span>${umschalter}</p>
    </div>
  </header>`;
}

function todoZeile(t, erste) {
  const k = t.knopf;
  const klasse = `btn btn-sm${erste ? ' btn-primary' : ''}`;
  // k.schritt: Zeitleisten-Schritt direkt ausloesen (z. B. "Erledigt – Kunde hat Muster");
  // der Klick laeuft ueber zeitleisteKlick (ansichten/kunden/zeitleiste.mjs). Rolle "lesen" bekommt den Link.
  // k.nachbuchen: "In Shopify nachbuchen" direkt in der Zeile (shopifyAbgleichKlick, einkauf/shopify-abgleich.mjs).
  const knopf = k.kopiertext
    ? `<button type="button" class="${klasse}" data-kopiertext="${esc(k.kopiertext)}">${esc(k.text)}</button>`
    : k.nachbuchen && !istNurLesend()
    ? `<button type="button" class="${klasse}" data-shopify-nachbuchen="${esc(k.nachbuchen)}" title="Bucht diese Artikel in Shopify als versendet – ohne Mail an den Kunden">${esc(k.text)}</button>`
    : k.aufgabe
    ? `<button type="button" class="${klasse}" data-open="${esc(k.aufgabe)}" data-primary="1">${esc(k.text)}</button>`
    : k.schritt && !istNurLesend()
      ? `<button type="button" class="${klasse}" data-zl-schritt="${esc(k.schritt.aktion)}" data-zl-order="${esc(k.schritt.orderId)}">${esc(k.text)}</button>`
      : `<a class="${klasse}" href="${esc(k.href)}">${esc(k.schritt || k.nachbuchen ? 'Ansehen' : k.text)}</a>`;
  const alter = t.alterTage === null || t.alterTage === undefined ? '' : `<span class="heute-alter ${esc(t.ton)}">${esc(alterText(t.alterTage))}</span>`;
  return `<div class="heute-todo ${esc(t.ton)}" data-todo="${esc(t.art)}">
    <div class="heute-todo-text"><div class="t">${esc(t.titel)}</div><div class="s">${esc(t.kontext)}</div></div>
    ${alter}${knopf}
  </div>`;
}

/**
 * Welche Quellen fehlen? Dann ist die Liste unvollstaendig - "Alles erledigt" waere eine
 * Behauptung ohne Grundlage (Codex-Audit Punkt 4).
 */
function fehlendeQuellen() {
  const teile = [
    [kunden.bestellungen, 'Bestellungen', d => d.verfuegbar === false],
    [einkauf.auftragsstatus, 'Einkaufsstand', () => false],
    [kunden.rueckrufe, 'Rückrufe', () => false],
    [kunden.faelle, 'Kundenfälle', () => false],
    [kunden.serviceanfragen, 'Service-Anfragen', () => false],
    [heuteDaten.aufgaben, 'Aufgaben', () => false],
    // Neue To-do-Quellen (#1427): Lieferantenbelege und Abgleich mit Shopify (Codex-Review #1432).
    [darfAnsicht('einkauf') ? belege.daten : null, 'Lieferantenbelege', d => d.verfuegbar === false],
    // Ein Fehlertext des Servers steht als eigene Zeile in der Liste; hier nur Abruf-Fehler und fehlende Daten.
    [typeof shopifyAbgleich.daten?.fehler === 'string' ? null : shopifyAbgleich.daten, 'Abgleich mit Shopify', d => d.verfuegbar === false],
  ];
  return teile.filter(([d, , fehlt]) => d && (d.fehler || fehlt(d))).map(([, name]) => name);
}

function todoListe(todos) {
  // Solange die Bestelldaten noch laden, waere "Alles erledigt" eine Behauptung ohne Grundlage.
  const laedt = !kunden.bestellungen || !einkauf.auftragsstatus || !heuteDaten.aufgaben
    || !shopifyAbgleich.daten || (darfAnsicht('einkauf') && !belege.daten);
  const fehlen = fehlendeQuellen();
  const stoerung = [kunden.bestellungen, kunden.rueckrufe, heuteDaten.aufgaben, kunden.serviceanfragen].find(d => d?.fehler);
  let inhalt;
  if (todos.length) {
    const oben = todos.slice(0, TODOS_SICHTBAR);
    const rest = todos.slice(TODOS_SICHTBAR);
    inhalt = oben.map((t, i) => todoZeile(t, i === 0)).join('')
      + (rest.length ? `<details class="heute-rest"><summary>${TODOS_SICHTBAR} von ${todos.length} – alle anzeigen</summary>${rest.map(t => todoZeile(t, false)).join('')}</details>` : '');
  } else if (laedt) inhalt = `<div class="heute-leer">Lade …</div>`;
  else if (fehlen.length) inhalt = `<div class="heute-leer">Gerade nichts zu sehen – aber die Liste ist unvollständig.</div>`;
  else inhalt = `<div class="heute-leer"><strong>Alles erledigt.</strong> Gerade wartet nichts auf dich – schönen Tag!</div>`;
  return `<h2 class="heute-weitere-titel">Weitere Aufgaben heute <span class="muted">(${todos.length})</span></h2><section class="heute-todos" aria-label="Heute zu erledigen">${inhalt}</section>
    ${fehlen.length ? `<p class="heute-unvollstaendig" role="status"><b>Liste unvollständig:</b> ${esc(fehlen.join(', '))} ${fehlen.length === 1 ? 'konnte' : 'konnten'} nicht geladen werden. ${kunden.bestellungen?.verfuegbar === false && kunden.bestellungen.hinweis ? esc(kunden.bestellungen.hinweis) : ''}</p>` : ''}
    ${stoerung ? stoerungState(stoerung, 'Ein Teil der Daten') : ''}`;
}

/**
 * "Im Hintergrund": was ohne uns laeuft - je eine ruhige Zeile, aufklappbar ueber einen
 * Routenparameter (mn = Nachfragen, ww = wartet auf andere), damit ein Neuzeichnen nichts zuklappt.
 */
function hintergrund(nf, wartet, sicht) {
  const zeilen = [];
  const auf = key => Boolean(state.route.params.get(key));
  const umschalten = (key, text) => `<button type="button" class="heute-hg-knopf" data-param="${key}" data-value="${auf(key) ? '' : '1'}" aria-expanded="${auf(key)}">${auf(key) ? 'Zuklappen' : text}</button>`;

  if (sicht !== 'website' && (nf.alleOffen.length || nf.alle.erledigt.length || nf.alle.abgemeldet?.length)) {
    const lauf = heuteDaten.musterTexte?.versand?.letzterLauf;
    const teile = [];
    if (nf.laeuft === null) teile.push('Lade …');
    else if (nf.laeuft) {
      teile.push(nf.automatisch.length ? `${plural(nf.automatisch.length, 'Nachfrage geht', 'Nachfragen gehen')} beim nächsten Lauf von selbst per E-Mail raus` : 'Nichts fällig');
      if (lauf?.am) teile.push(`letzter Lauf ${fmtDateTime(lauf.am)} (${lauf.verschickt || 0} verschickt)`);
    } else teile.push(nf.mensch.length ? 'Automatischer Versand läuft nicht – fällige Nachfragen stehen oben in der Liste' : 'Nichts fällig · automatischer Versand läuft nicht');
    if (nf.ohneWeg.length) teile.push(`${nf.ohneWeg.length} ohne E-Mail`);
    if (nf.alle.erledigt.length) teile.push(`${nf.alle.erledigt.length} in den letzten Tagen erledigt`);
    zeilen.push(`<div class="heute-hg-zeile"><span class="heute-hg-name">Muster-Nachfragen</span><span class="heute-hg-text">${esc(teile.join(' · '))}</span>${umschalten('mn', 'Ansehen')}</div>`);
  }

  const lieferant = wartet.lieferant.length;
  const kunde = wartet.kunde.length;
  if (lieferant || kunde) {
    zeilen.push(`<div class="heute-hg-zeile"><span class="heute-hg-name">Wartet auf andere</span><span class="heute-hg-text">${esc([lieferant ? `${lieferant} beim Lieferanten` : null, kunde ? `${kunde} beim Kunden` : null].filter(Boolean).join(' · '))}</span>${umschalten('ww', 'Ansehen')}</div>`);
  }

  if (sicht !== 'website' && darfAnsicht('einkauf') && belege.daten) {
    // Ablage nicht lesbar: die Zeile bleibt da und sagt es - sonst verschwaende die Pruefung still.
    const l = belege.daten.verfuegbar ? laufStand(belege.daten) : { text: `Lieferantenpost nicht lesbar: ${belege.daten.hinweis || 'unbekannter Fehler'}`, ton: 'warn' };
    zeilen.push(`<div class="heute-hg-zeile${l.ton ? ` ${l.ton}` : ''}"><span class="heute-hg-name">Lieferantenpostfach</span><span class="heute-hg-text">${esc(l.text)}</span><a class="heute-hg-knopf" href="#/einkauf?tab=belege">Lieferantenpost</a></div>`);
  }

  zeilen.push(datenstandZeile(sicht));
  return `<section class="heute-hintergrund" aria-labelledby="heuteHg">
    <h2 id="heuteHg">Im Hintergrund</h2>
    ${zeilen.join('')}
  </section>`;
}

/** Datenstand: ruhig, solange alles stimmt; auffaellig nur bei veralteten Daten oder Fehlern. */
function datenstandZeile(sicht) {
  const a = einkauf.aktualisierung;
  if (!a) return '';
  const health = aktualisierungHealth();
  const probleme = health.filter(h => h.level === 'warn' || h.level === 'crit');
  const unbelegt = health.filter(h => h.level === 'info');
  const auffaellig = [...probleme, ...unbelegt];
  const bestellungen = a.teile?.bestellungen;
  const stand = bestellungen?.erfolg && bestellungen.zeitpunkt ? `Bestellungen Stand ${fmtDateTime(bestellungen.zeitpunkt)}` : '';
  const text = probleme.length
    ? `${plural(probleme.length, 'Datenquelle', 'Datenquellen')} veraltet oder mit Fehler${stand ? ` · ${stand}` : ''}`
    : unbelegt.length ? `${plural(unbelegt.length, 'Stand', 'Stände')} noch nicht belegt${stand ? ` · ${stand}` : ''}`
    : `Daten aktuell${stand ? ` · ${stand}` : ''}`;
  return `<div class="heute-hg-zeile heute-datenstand${probleme.length ? ' warn' : ''}" role="status">
    <span class="heute-hg-name"><span class="punkt" aria-hidden="true"></span>Daten</span>
    <span class="heute-hg-text">${esc(text)}${auffaellig.length && darfAnsicht('insights') ? ' · <a href="#/insights">ansehen</a>' : ''}</span>
    ${/* Der erklaerende Satz nur, wenn es etwas zu tun gibt - bei aktuellen Daten waere er Rauschen. */ ''}
    ${aktualisierenButton({ mitHinweis: probleme.length > 0 && sicht !== 'laden' })}
  </div>`;
}

function wartZeile(z) {
  // Abschliessen direkt von hier (erledigt, Testbestellung, hat sich erledigt): derselbe
  // Sammelschritt mit Rueckfrage wie "Kunde fertig" in der Bestellliste (data-bq-fertig).
  const fertig = z.orderId && !istNurLesend()
    ? `<button type="button" class="heute-wart-fertig" data-bq-fertig="${esc(z.orderId)}" title="Abschließen – erledigt oder Testbestellung. Verschwindet danach aus den Listen." aria-label="${esc(z.name)} abschließen">✓</button>`
    : '';
  return `<div class="heute-wart-zeile"><a class="heute-wart" href="${esc(z.href)}">
    <span class="heute-wart-text"><span class="t">${esc(z.name)}</span><span class="s">${esc(z.schritt)} · ${esc(z.zusatz)}</span></span>
    ${z.alterTage === null || z.alterTage === undefined ? '' : `<span class="heute-alter ${esc(z.ton)}">${esc(alterText(z.alterTage))}</span>`}
  </a>${fertig}</div>`;
}

/** Aufgeklappt: wer wartet beim Lieferanten, wer beim Kunden. "Wir sind dran" ist die Liste oben. */
function werWartetBlock(w) {
  const spalte = ([k, titel, unter]) => {
    const liste = w[k];
    return `<div class="heute-spalte">
      <div class="heute-spalte-kopf"><b>${liste.length}</b><div><span>${esc(titel)}</span><small>${esc(unter)}</small></div></div>
      ${liste.length ? liste.slice(0, SPALTE_SICHTBAR).map(wartZeile).join('') : '<div class="heute-leer klein">Niemand.</div>'}
      ${liste.length > SPALTE_SICHTBAR ? `<a class="heute-spalte-mehr" href="#/kunden?tab=bestellungen">+${liste.length - SPALTE_SICHTBAR} weitere</a>` : ''}
    </div>`;
  };
  return `<section class="heute-block" aria-labelledby="heuteWartet">
    <div class="heute-block-kopf"><h2 id="heuteWartet">Wartet auf andere</h2><span>nichts für uns zu tun, bis sich etwas tut</span><a href="#/kunden?tab=bestellungen">Alle Bestellungen</a></div>
    <div class="heute-spalten zwei">${WARTE_SPALTEN.map(spalte).join('')}</div>
  </section>`;
}

/**
 * Laden und Montage zeigen Zahlen aus den Apps - aber nur, wenn sie verbunden sind. Ein Block
 * "Nicht eingerichtet" auf der Startseite war Rauschen; eine Stoerung bleibt sichtbar.
 */
function ladenUndMontage() {
  const d = ladenKachel.daten;
  if (!d) return '';
  const verbunden = d.eingerichtet || d.fehler;
  return [
    verbunden ? heuteLaden() : '',
    verbunden && (d.montage || d.fehler) ? heuteMontage() : '',
  ].join('');
}

/** Schnitt je bezahlter Bestellung fuer die Kachel; ohne Bestellung mit Betrag ein Strich. */
function schnittText(z, geld) {
  if (!z) return null;
  const n = schnittJeBezahlter(z);
  return n ? geld(n, z) : '–';
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
      ${kachel('Ø je bezahlter Bestellung', schnittText(z7, geld), schnittText(z30, geld))}
    </div>
  </section>`;
}

/** Direkte Arbeitswege, mit denselben Zahlen und Filtern wie auf der Zielseite. */
function bestellEinstieg() {
  return bestellarbeitBlock({
    arbeit: startBestellarbeit({ daten: einkauf.bestellungen, statusAlle: einkauf.auftragsstatus, lieferanten: heuteDaten.lieferanten }),
    offeneBestellungen: bestellungenOffen(), pack: kunden.musterPacken, lesend: istNurLesend(),
  });
}
