/**
 * Ansicht "Heute" (#/heute): die Startseite. Kundengeschaeft vor interner Arbeit - oben,
 * was heute Geld oder Aerger bedeutet, darunter die Aufgaben, ganz unten der Systemzustand.
 *
 * Die Bloecke der einzelnen Bereiche (Rueckrufe, Faelle, Shop-Wache, Meine Arbeit) liefern
 * deren Module; hier wird zusammengesetzt.
 */
import { attentionList, summarize } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, since, plural, newIssueUrl } from '../kern/helfer.mjs';
import { emptyState, stoerungState, collapsibleCard, bandItem } from '../bausteine/karten.mjs';
import {
  prioBadge, statusBadge, ownerText, taskLink, echterSchritt, primaryAction,
} from '../bausteine/aufgaben.mjs';
import {
  ensureAktualisierung, aktualisierenButton, aktualisierungHealth,
} from '../bausteine/aktualisierung.mjs';
import { systemHealth, healthRow } from '../bausteine/systemzustand.mjs';
import {
  einkaufPositionenMitStand, aktiveAuftraege, einkauf, AF_WARTE_WARN, afWartetage,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufKennzahlen, anzeigeWert,
  afEintragFuer,
} from './einkauf/auftragsfluss.mjs';
import { hinweisText, einkaufAuftragZeile } from './einkauf/bestellungen.mjs';
import { ensureKundenRueckrufe, heuteRueckrufBlock } from './kunden/rueckrufe.mjs';
import { heuteFaelle } from './kunden/faelle.mjs';
import { heuteNichtLiegenLassen } from './kunden.mjs';
import { heuteOrganisation } from './organisation.mjs';
import { heuteShopwache } from './shopwache.mjs';

export function viewHeute() {
  const tasks = state.tasks; const s = summarize(tasks);
  // "Braucht jetzt Aufmerksamkeit" ist die dringendste Rangliste; jede Aufgabe darf auf
  // "Heute" nur an einer Stelle stehen, darum werden ihre Nummern aus den Listen darunter
  // (Wartet auf dich, Blockiert) herausgefiltert statt sie zusaetzlich dort zu wiederholen.
  const att = attentionList(tasks, { limit: 3 });
  const attNumbers = new Set(att.map(x => x.task.number));
  const waitingAll = tasks.filter(t => t.open && (t.status === 'freigabe' || (t.status === 'review' && (!t.reviewer || t.reviewer === 'mensch')) || (t.status === 'eingang' && t.triage.length && t.ageDays <= 14)) && !attNumbers.has(t.number)).sort((a, b) => a.priorityRank - b.priorityRank);
  const waiting = waitingAll.slice(0, 4);
  const waitingRest = waitingAll.slice(4);
  const blocked = tasks.filter(t => t.status === 'blockiert' && !attNumbers.has(t.number));
  const running = tasks.filter(t => ['in-arbeit', 'korrektur'].includes(t.status));
  const week = { done: tasks.filter(t => t.closedAt && (Date.now() - new Date(t.closedAt)) < 7 * 864e5), fresh: tasks.filter(t => t.open && t.ageDays !== null && t.ageDays < 7), overdue: tasks.filter(t => t.overdue) };
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const health = systemHealth();
  const worst = health.some(h => h.level === 'crit') ? 'crit' : health.some(h => h.level === 'warn') ? 'warn' : 'ok';
  const localMode = state.capabilities.mode === 'local';
  const datenWarnungen = localMode ? aktualisierungHealth().filter(h => h.level !== 'ok') : [];
  if (localMode) { ensureEinkaufBestellungen(); ensureEinkaufAuftragsstatus(); ensureEinkaufKennzahlen(); ensureAktualisierung(); ensureKundenRueckrufe(); }

  // Interne Arbeit: Kacheln mit 0 sind Rauschen und fallen weg; "erledigt" bleibt als
  // positives Signal immer stehen.
  const intern = [
    [s.critical, 'kritisch (P0)', 'crit', '#/arbeit?prio=p0'],
    [s.blocked, 'blockiert', 'crit', '#/arbeit?view=blockiert'],
    [s.approvals, 'warten auf Freigabe', 'warn', '#/freigaben'],
    [s.dueToday, 'heute fällig / überfällig', 'warn', '#/arbeit?view=heute'],
    [s.triage, 'noch zu bewerten', 'plain', '#/arbeit?view=triage'],
  ].filter(([n]) => n > 0);

  return `
    <div class="page-head"><div><h1>Heute</h1><p class="sub">${esc(today)}</p></div>
      <div class="head-actions">${aktualisierenButton()}${state.capabilities.sync ? '<button class="btn" data-action="sync" data-nur-inhaber title="Entwicklungsaufgaben frisch von GitHub holen">GitHub synchronisieren</button>' : ''}<a class="btn btn-ghost" data-nur-inhaber href="${newIssueUrl({ template: 'feature.yml' })}" target="_blank" rel="noopener">Neues GitHub-Issue ↗</a></div></div>
    ${datenWarnungen.length ? `<div class="notice warn" role="status" style="margin-bottom:12px"><strong>Datenaktualisierung prüfen:</strong> ${plural(datenWarnungen.length, 'Datenquelle meldet', 'Datenquellen melden')} einen Fehler oder einen veralteten Stand. <a href="#/insights">Datenstand ansehen →</a></div>` : ''}

    ${localMode ? heuteFaelle() : ''}
    <h2 class="section-title">Kundengeschäft</h2>
    ${heuteEinkaufBlock()}
    ${heuteRueckrufBlock()}
    ${localMode ? heuteNichtLiegenLassen() : ''}
    ${localMode ? heuteShopwache() : ''}
    ${localMode ? heuteOrganisation() : ''}

    <h2 class="section-title">Shop-Zahlen</h2>
    ${heuteKennzahlenBlock()}

    <div data-nur-inhaber>
    <h2 class="section-title">Interne Arbeit <span class="section-note">Aufgaben aus GitHub – wichtig, aber nach dem Kundengeschäft</span></h2>
    <div class="band">
      ${intern.map(([n, l, cls, href]) => bandItem(n, l, cls, href)).join('')}
      ${bandItem(s.doneThisWeek, 'diese Woche erledigt', 'plain', '#/arbeit?status=fertig')}
    </div>

    ${collapsibleCard('aufmerksamkeit', 'Braucht jetzt Aufmerksamkeit', att.length ? String(att.length) : 'nichts', att.length ? `<div class="att">${att.map((x, i) => attentionItem(x, i)).join('')}</div>` : emptyState('Nichts drängt.', 'Keine P0, keine Blocker, keine offenen Freigaben – gute Zeit, die nächste wichtige Arbeit zu planen.', { href: '#/arbeit?status=geplant', text: 'Geplante Aufgaben ansehen' }), { openByDefault: att.length > 0 })}

    ${collapsibleCard('wartet', 'Wartet auf dich', waitingAll.length ? String(waitingAll.length) : 'nichts', `${waiting.length ? `<div class="rows">${waiting.map(t => heuteCompactRow(t, primaryAction(t).label)).join('')}</div>` : emptyState('Keine Freigaben offen.', 'Plane die nächste wichtige Arbeit.', { href: '#/arbeit?status=geplant', text: 'Geplant' })}${waitingRest.length ? `<details class="inline-more"><summary>Alle anzeigen (+${waitingRest.length})</summary><div class="rows" style="margin-top:6px">${waitingRest.map(t => heuteCompactRow(t, primaryAction(t).label)).join('')}</div></details>` : ''}`, { openByDefault: waitingAll.length > 0 })}

    ${blocked.length ? collapsibleCard('blockiert', 'Blockiert', String(blocked.length), `<div class="rows">${blocked.slice(0, 5).map(t => heuteCompactRow(t, 'Lösen', { title: t.blocker || 'Grund fehlt – bitte im Issue nachtragen' })).join('')}</div>`, { openByDefault: true }) : ''}

    ${collapsibleCard('laeuft', 'Läuft gerade', running.length ? `${running.length} in Arbeit` : 'nichts', runningBlock(running), { openByDefault: false })}

    ${collapsibleCard('woche', 'Diese Woche', `${week.done.length} erledigt · ${week.fresh.length} neu`, `
        ${week.overdue.length ? `<p class="notice crit" style="margin-bottom:10px">${plural(week.overdue.length, 'Aufgabe ist', 'Aufgaben sind')} überfällig. <a href="#/arbeit?view=heute">Ansehen →</a></p>` : ''}
        ${week.done.length ? `<ul class="plain-list">${week.done.slice(0, 8).map(t => `<li><span class="muted mono small">${esc(t.id)}</span> ${taskLink(t)}</li>`).join('')}</ul>` : '<p class="small muted">Noch nichts erledigt in den letzten 7 Tagen.</p>'}`, { openByDefault: false })}

    ${worst === 'ok'
      ? `<p class="health-ok"><span class="dot" aria-hidden="true"></span>Alle Datenquellen in Ordnung · <a href="#/insights">Systemzustand ansehen</a></p>`
      : `<section class="card section health-card ${worst}"><div class="card-head"><h2>Systemgesundheit</h2><a class="more" href="#/insights">Alle Details →</a></div><div class="health">${health.filter(h => h.level === 'warn' || h.level === 'crit').map(healthRow).join('')}</div></section>`}
    </div>`;
}

/** Auftragsfluss-Zaehler je Gruppe (offen/bestellt/unterwegs/erledigt) ueber Ware und Muster. */
function heuteAuftragsflussZaehler(b) {
  const { ware, muster, gruppe } = einkaufPositionenMitStand(b);
  const afZaehler = { offen: 0, bestellt: 0, unterwegs: 0, erledigt: 0 };
  for (const p of [...ware, ...muster]) afZaehler[gruppe(p)] += 1;
  return afZaehler;
}

/** Kundengeschaeft auf der Startseite: vier Zahlen, darunter nur die Auftraege mit Problem. */
function heuteEinkaufBlock() {
  if (state.capabilities.mode !== 'local') {
    return emptyState('Nur lokal im Betrieb verfügbar.', 'Bestellübersicht und Auftragsfluss lesen private Daten, die nie öffentlich werden. Auf dem Mac starten: npm run dashboard');
  }
  const b = einkauf.bestellungen;
  if (!b && einkauf.loadingBestellungen) return `<div class="empty">Lade Einkaufsdaten …</div>`;
  if (b?.fehler) return stoerungState(b, 'Die Bestelldaten');
  if (!b || !b.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', b?.hinweis || 'Bestellübersicht noch nicht exportiert.', { href: '#/einkauf', text: 'Bereich Einkauf öffnen' });
  const { ware, muster, gruppe } = einkaufPositionenMitStand(b);
  const aktiv = aktiveAuftraege(b);
  const probleme = aktiv.filter(a => a.ampel === 'rot');
  const warePendent = ware.filter(p => gruppe(p) === 'offen').length;
  const musterPendent = muster.filter(p => gruppe(p) === 'offen').length;
  const af = heuteAuftragsflussZaehler(b);
  const unterwegs = af.bestellt + af.unterwegs;
  // Nur sichtbar, wenn es etwas zum Nachhaken gibt - eine 0 waere hier reines Rauschen.
  const langeBestellt = [...ware, ...muster].filter(p => { const e = afEintragFuer(p); return e?.status === 'bestellt' && afWartetage(e) >= AF_WARTE_WARN; }).length;
  const neu = heuteNeuSeitGestern(b);
  const stand = bestelldatenStand(b, einkauf.aktualisierung);
  return `
    <div class="band">
      ${bandItem(aktiv.length, 'offene Kundenaufträge', 'plain', '#/einkauf')}
      ${bandItem(warePendent, 'Artikel noch zu bestellen', 'warn', '#/einkauf')}
      ${bandItem(musterPendent, 'Muster noch zu bestellen', 'warn', '#/einkauf')}
      ${bandItem(probleme.length, probleme.length === 1 ? 'Auftrag mit Problem' : 'Aufträge mit Problem', 'crit', '#/einkauf')}
      ${langeBestellt ? bandItem(langeBestellt, 'seit 7 Tagen oder länger bestellt', 'warn', '#/einkauf?af=bestellt') : ''}
    </div>
    ${probleme.length
      ? `<section class="card problem-card"><div class="card-head"><h3>Zuerst klären</h3><a class="more" href="#/einkauf">Alle Aufträge im Einkauf →</a></div><div class="rows">${probleme.slice(0, 3).map(a => einkaufAuftragZeile(a)).join('')}</div>${probleme.length > 3 ? `<p class="small muted" style="margin-top:6px">+${probleme.length - 3} weitere – <a href="#/einkauf">alle ansehen →</a></p>` : ''}</section>`
      : `<p class="notice ok">Kein Auftrag mit Problem.</p>`}
    ${neu.karte}
    <p class="small muted flow-line">${neu.zeile}${unterwegs ? `${plural(unterwegs, 'Artikel ist', 'Artikel sind')} beim Lieferanten bestellt oder unterwegs · ` : ''}${stand.alt ? `<b>${esc(stand.text)}</b>` : esc(stand.text)} · <a href="#/einkauf">Einkauf öffnen →</a></p>
    ${stand.alt ? `<p class="notice warn" style="margin-top:6px">Die Zahlen oben können veraltet sein. „Jetzt aktualisieren" holt neue Daten – geht nur, wenn der Shopify-Zugang hinterlegt ist.</p>` : ''}`;
}

/**
 * Wie alt sind die Bestelldaten wirklich? `erstellt` ist nur der Zeitpunkt,
 * zu dem der Server die Datei gelesen hat - es als "Stand" anzuzeigen, sah
 * immer taufrisch aus, egal wie alt der Shopify-Abruf war. Wenn ein alter
 * Export `exportiertAm` noch nicht enthaelt, gilt nur der nachweislich
 * erfolgreiche Bestelllauf als belastbarer Ersatz.
 */
function bestelldatenStand(b, aktualisierung) {
  // Aeltere und extern erzeugte Admin-API-Exporte enthalten noch kein
  // `exportiertAm`. Der erfolgreiche Aktualisierungslauf kennt trotzdem den
  // Zeitpunkt, zu dem genau dieser Datenbestand geholt wurde. Ein fehlgeschlagener
  // Lauf darf dagegen keinen frischen Stand vortaeuschen.
  const bestellungen = aktualisierung?.teile?.bestellungen;
  const zeitpunkt = b?.exportiertAm || (bestellungen?.erfolg ? bestellungen.zeitpunkt : null);
  if (!zeitpunkt) return { text: 'Stand der Bestelldaten unbekannt', alt: true };
  const alter = Date.now() - new Date(zeitpunkt).getTime();
  const alt = !(alter < 24 * 60 * 60 * 1000);
  return { text: `Stand Bestellungen ${fmtDateTime(zeitpunkt)}${alt ? ' – älter als ein Tag' : ''}`, alt };
}

/**
 * "Seit gestern neu": Kundenauftraege der letzten 24 Stunden (Auftragsdatum), Probleme darin
 * markiert. Ist nichts neu, genuegt ein Halbsatz in der Stand-Zeile statt eines leeren Kastens.
 * Testbestellungen und stornierte Auftraege zaehlen nicht.
 */
function heuteNeuSeitGestern(b, jetzt = Date.now()) {
  const neu = (b.auftraege || []).filter(a => a.datum && !a.storniert && jetzt - new Date(a.datum) < 864e5 && jetzt - new Date(a.datum) >= -36e5)
    .sort((x, y) => String(y.datum).localeCompare(String(x.datum)));
  if (!neu.length) return { karte: '', zeile: 'Seit gestern keine neuen Aufträge · ' };
  const probleme = neu.filter(a => a.ampel === 'rot').length;
  const zeile = a => {
    // Mehrere Farben desselben Artikels (typisch bei Mustern) nur einmal nennen.
    const artikel = [...new Set((a.positionen || []).map(p => anzeigeWert(p.titel)).filter(Boolean))];
    const marke = a.ampel === 'rot' ? '<span class="badge status blockiert">Problem</span> ' : a.ampel === 'gelb' ? '<span class="badge status freigabe">Prüfen</span> ' : '';
    return `<div class="neu-row">${marke}<a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener" title="In Shopify öffnen">${esc(a.name)} ↗</a> <span class="muted small">${esc(fmtDateTime(a.datum))}</span>${artikel.length ? ` <span class="small muted">· ${esc(artikel.slice(0, 2).join(' · '))}${artikel.length > 2 ? ` · +${artikel.length - 2}` : ''}</span>` : ''}${a.ampel === 'rot' && a.hinweise?.length ? `<div class="small warnc">${esc(hinweisText(a.hinweise[0]))}</div>` : ''}</div>`;
  };
  return {
    zeile: '',
    karte: `<section class="card neu-card"><div class="card-head"><h3>Seit gestern neu</h3><span class="more muted">${plural(neu.length, 'Auftrag', 'Aufträge')}${probleme ? ` · davon ${probleme} mit Problem` : ''}</span></div>
      <div class="rows">${neu.slice(0, 5).map(zeile).join('')}</div>${neu.length > 5 ? `<p class="small muted" style="margin-top:6px">+${neu.length - 5} weitere – <a href="#/einkauf">im Einkauf ansehen →</a></p>` : ''}</section>`,
  };
}

/** Shop-Kennzahlen: eine kompakte Tabelle statt sechs Kacheln. Erfindet ohne Export nichts. */
function heuteKennzahlenBlock() {
  if (state.capabilities.mode !== 'local') {
    return emptyState('Nur lokal im Betrieb verfügbar.', 'Shop-Kennzahlen lesen einen lokalen Export, der nie öffentlich wird.');
  }
  const k = einkauf.kennzahlen;
  if (!k && einkauf.loadingKennzahlen) return `<div class="empty">Lade Shop-Kennzahlen …</div>`;
  if (!k || !k.verfuegbar) {
    return emptyState('Noch kein Export der Shop-Kennzahlen.', k?.hinweis || 'Es liegt noch keine kennzahlen/shop-snapshot.json vor.') +
      `<p class="small muted" style="margin-top:6px">Befehl zum Erzeugen: <code class="mono">${esc(k?.befehl || 'npm run daten:aktualisieren')}</code></p>`;
  }
  const geld = (n, w) => typeof n === 'number' ? n.toLocaleString('de-DE', { style: 'currency', currency: w || 'EUR' }) : '–';
  const spalten = [['7', 'Letzte 7 Tage'], ['30', 'Letzte 30 Tage']].map(([t, l]) => ({ l, z: k.zeitraeume?.[t] })).filter(x => x.z);
  if (!spalten.length) return emptyState('Keine Zeiträume im Export.', '');
  // Bezahlte Bestellungen ohne Betrag sind kostenlose Musterbestellungen. Umsatz 0 ist dann
  // richtig, soll aber nicht wie ein Datenfehler aussehen.
  const hinweis = spalten.some(({ z }) => z.bestellungen > 0 && !z.umsatz)
    ? `<p class="small muted" style="margin-top:8px">Umsatz 0 €: ${spalten.every(({ z }) => typeof z.kostenlos !== 'number' || z.kostenlos === z.bestellungen) ? 'die Bestellungen im Zeitraum waren kostenlose Musterbestellungen.' : 'bezahlte Bestellungen ohne Betrag (z. B. kostenlose Muster).'}</p>`
    : '';
  return `<section class="card kpi-card">
      <table class="kpi"><thead><tr><th></th>${spalten.map(({ l }) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
        <tr><th>Bestellungen</th>${spalten.map(({ z }) => `<td>${esc(z.bestellungen ?? '–')}${z.kostenlos ? ` <span class="small muted">(davon ${z.kostenlos} Muster)</span>` : ''}</td>`).join('')}</tr>
        <tr><th>Umsatz</th>${spalten.map(({ z }) => `<td>${geld(z.umsatz, z.waehrung)}</td>`).join('')}</tr>
        <tr><th>Ø Bestellwert</th>${spalten.map(({ z }) => `<td>${z.bestellungen ? geld(z.durchschnitt, z.waehrung) : '–'}</td>`).join('')}</tr>
      </tbody></table>
      ${hinweis}
      <p class="small muted" style="margin-top:6px">Stornierte und unbezahlte Bestellungen zählen nicht · Stand ${esc(fmtDateTime(k.erstellt))}</p>
    </section>`;
}

/** Einzeiler: Titel, ein Status-Chip, Knopf rechts. Der Grund (Prioritaet/Blocker/Frist) steht
 * als Tooltip auf der ganzen Zeile statt als eigene Zeile - bei fuenf Eintraegen wiederholte sich
 * sonst derselbe Erklaersatz mehrfach sichtbar. */
function attentionItem({ task: t, reasons }, i) {
  const primary = primaryAction(t);
  const why = reasons.join(' · ');
  return `<div class="row att-row" data-open="${t.number}" tabindex="0" role="button" title="${esc(why)}">
    <span class="rank">${i + 1}</span>
    <span class="t">${prioBadge(t)} ${taskLink(t)}</span>
    ${statusBadge(t)}
    <button class="btn btn-sm btn-primary" data-open="${t.number}" data-primary="1">${esc(primary.label)}</button>
  </div>`;
}

/** Gleicher Einzeiler wie attentionItem, aber ohne Rang und mit frei waehlbarem Knopftext -
 * fuer die Listen "Wartet auf dich", "Blockiert" und "Läuft gerade" auf der Startseite. Ersetzt
 * dort die mehrzeilige taskRow/blockedRow-Darstellung, damit vier bis sechs Eintraege nicht
 * gleich eine halbe Bildschirmhoehe brauchen. */
function heuteCompactRow(t, buttonLabel, { title } = {}) {
  return `<div class="row att-row" data-open="${t.number}" tabindex="0" role="button" title="${esc(title ?? (echterSchritt(t) || t.blocker || ''))}">
    <span class="t">${prioBadge(t)} ${taskLink(t)}</span>
    ${statusBadge(t)}
    <button class="btn btn-sm" data-open="${t.number}" data-primary="1">${esc(buttonLabel)}</button>
  </div>`;
}

function blockedRow(t) {
  return `<div class="row" data-open="${t.number}" tabindex="0" role="button">
    <div><div class="t">${prioBadge(t)} ${esc(t.title)}</div>
      <div class="m"><span style="color:var(--crit)">${esc(t.blocker || 'Grund fehlt – bitte im Issue nachtragen')}</span></div>
      <div class="m"><span>${since(t.updatedAt)}</span><span>${t.owner ? `Owner @${esc(t.owner)}` : ownerText(t)}</span>${t.dependencies.length ? `<span>hängt an ${esc(t.dependencies.join(', '))}</span>` : ''}</div></div>
    <div class="r"><button class="btn btn-sm" data-open="${t.number}" data-primary="1">Eskalieren / lösen</button></div>
  </div>`;
}

function runningBlock(running) {
  const runs = state.agentRuns?.runs || [];
  const active = runs.filter(r => ['QUEUED', 'WORKING', 'REVIEWING', 'RUNNING'].includes(r.state));
  let html = '';
  if (active.length) html += `<div class="rows">${active.map(r => `<div class="row"><div><div class="t"><span class="badge ki">KI</span> ${esc(r.task)}</div><div class="m"><span>${esc(r.state)}</span>${r.progress?.phase ? `<span>${esc(r.progress.phase)}</span>` : ''}${r.issue ? `<span><a href="#" data-open="${r.issue.number}">#${r.issue.number}</a></span>` : ''}<span>${since(r.startedAt)}</span></div></div></div>`).join('')}</div>`;
  if (running.length) html += `<div class="rows" style="margin-top:${active.length ? 8 : 0}px">${running.slice(0, 3).map(t => heuteCompactRow(t, 'Öffnen')).join('')}</div>${running.length > 3 ? `<p class="small muted" style="margin-top:6px">+${running.length - 3} weitere – <a href="#/arbeit?status=in-arbeit">alle ansehen →</a></p>` : ''}`;
  if (!html) html = emptyState('Nichts in Arbeit.', 'Nächste Aufgabe aus „Bereit" oder „Geplant" starten.', { href: '#/arbeit?status=geplant', text: 'Geplant' });
  if (!state.capabilities.agentRuns) html += `<p class="small muted" style="margin-top:8px">KI-Läufe der Steuerzentrale sind nur im lokalen Modus sichtbar.</p>`;
  return html;
}
