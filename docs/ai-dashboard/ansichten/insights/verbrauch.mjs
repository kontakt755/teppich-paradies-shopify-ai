/**
 * Kachel "Claude-Verbrauch" auf Insights (#671, nur Inhaber).
 *
 * Wohin geht das Wochenbudget? Zeigt nur, was die lokalen Sitzungsprotokolle
 * von Claude Code belegen (operations/scripts/claude-verbrauch.mjs schreibt
 * $TP_PRIVAT_DIR/verbrauch/claude.json, der Server liefert sie unter
 * /api/verbrauch/claude). Den Stand des Wochenlimits in Prozent kennt keine
 * lokale Datei - deshalb steht er hier nicht, auch nicht geschaetzt.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDateTime, issueUrl, plural } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState } from '../../bausteine/karten.mjs';
import { modellName, tokenText } from '../../lib/verbrauch.mjs';

export const verbrauch = { daten: null, laedt: false, nachladen: null };

export function ensureVerbrauch() {
  if (verbrauch.daten || verbrauch.laedt) return;
  verbrauch.laedt = true;
  fetchEinkauf('/api/verbrauch/claude').then(d => {
    verbrauch.daten = d; verbrauch.laedt = false;
    if (state.route.view === 'insights') render();
    // Der Server rechnet einen veralteten Stand im Hintergrund neu (rund 10 s).
    // Einmal nachfragen, dann gilt der neue Stand - kein Dauerabfragen.
    if (d?.wirdErneuert && !verbrauch.nachladen) {
      verbrauch.nachladen = setTimeout(() => { verbrauch.daten = null; ensureVerbrauch(); }, 20_000);
    }
  });
}

const KLASSE = { interaktiv: 'Gespräche', geplant: 'Geplante Aufgaben', subagent: 'Subagenten' };
const STUFE = { low: 'niedrig', medium: 'mittel', high: 'hoch', xhigh: 'sehr hoch', max: 'maximal' };
const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function tagText(datum) {
  const d = new Date(`${datum}T12:00:00Z`);
  return `${WOCHENTAG[d.getUTCDay()]} ${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;
}

function dauerText(min) {
  if (!Number.isFinite(min)) return '–';
  return min < 60 ? `${min} Min.` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
}

function aufgabeLink(nr) {
  const t = state.tasks.find(x => x.number === nr);
  return t
    ? `<a href="#" data-open="${nr}" title="${esc(t.title)}">#${nr}</a>`
    : `<a href="${esc(issueUrl(nr))}" target="_blank" rel="noopener">#${nr}</a>`;
}

function sitzungZeile(s) {
  const titel = s.titel || (s.klasse === 'geplant' ? 'Geplante Aufgabe' : 'ohne Titel');
  const aufgaben = s.aufgaben?.length ? s.aufgaben.map(aufgabeLink).join(' ') : '<span class="muted">–</span>';
  return `<tr>
    <td data-l="Sitzung"><span class="verbrauch-titel">${esc(titel)}</span>${s.lang ? ' <span class="badge gap">lang</span>' : ''}<div class="small muted">${esc(KLASSE[s.klasse] || s.klasse)} · ${esc(fmtDateTime(s.beginn))}${s.subagenten ? ` · ${esc(plural(s.subagenten, 'Subagent', 'Subagenten'))}` : ''}</div></td>
    <td data-l="Aufgabe">${aufgaben}</td>
    <td data-l="Aktiv" class="num">${esc(dauerText(s.aktivMinuten))}</td>
    <td data-l="Aufrufe" class="num">${esc(s.werkzeugaufrufe.toLocaleString('de-DE'))}</td>
    <td data-l="Tokens" class="num">${esc(tokenText(s.tokens?.gesamt))}</td>
  </tr>`;
}

function sitzungTabelle(liste) {
  return `<div class="table-scroll"><table class="tasks compact verbrauch-tabelle">
    <thead><tr><th>Sitzung</th><th>Aufgabe</th><th class="num">Aktiv</th><th class="num">Aufrufe</th><th class="num">Tokens</th></tr></thead>
    <tbody>${liste.map(sitzungZeile).join('')}</tbody></table></div>`;
}

export function verbrauchKarte() {
  const kopf = (rechts) => `<div class="card-head"><h2>Claude-Verbrauch</h2><span class="more muted">${rechts}</span></div>`;
  const d = verbrauch.daten;
  if (!d) {
    return `<section class="card span-2">${kopf('')}<div class="empty">${verbrauch.laedt ? 'Lade …' : 'Nicht verfügbar.'}</div></section>`;
  }
  if (!d.verfuegbar) {
    const text = d.wirdErneuert
      ? 'Wird gerade aus den Sitzungsprotokollen berechnet – in etwa 20 Sekunden steht hier der Stand.'
      : `Auf dem Mac berechnen: ${d.befehl || 'npm run verbrauch:sammeln'}`;
    return `<section class="card span-2">${kopf('')}${emptyState(d.fehler || 'Noch kein Verbrauch berechnet.', text)}</section>`;
  }
  const s = d.summe;
  const t = s.tokens;
  const cacheAnteil = t.gesamt ? Math.round(t.cacheLesen / t.gesamt * 100) : 0;
  const geplant = d.klassen.find(k => k.klasse === 'geplant')?.sitzungen || 0;
  const kpi = (n, l, zusatz, klasse = '') => `<div class="heute-kpi"><div class="n${klasse}">${esc(n)}</div><div class="l">${esc(l)}</div><div class="d">${esc(zusatz)}</div></div>`;

  const maxTag = Math.max(1, ...d.tage.map(x => x.sitzungen));
  const tage = d.tage.map(x => `<div class="verbrauch-tag">
      <span>${esc(tagText(x.datum))}</span>
      <div class="track"><div class="fill" style="width:${Math.round(x.sitzungen / maxTag * 100)}%"></div></div>
      <span class="num${x.sitzungen ? '' : ' muted'}">${x.sitzungen}${x.langsitzungen ? ` <span class="muted">· ${x.langsitzungen} lang</span>` : ''}</span>
    </div>`).join('');

  const klassen = d.klassen.map(k => {
    const modelle = k.modelle.filter(m => m.anteil > 0 || k.modelle.length === 1)
      .map(m => `${esc(modellName(m.modell))} ${m.anteil} %`).join(', ') || esc(modellName(k.modelle[0]?.modell));
    const stufe = k.effort?.[0] ? STUFE[k.effort[0].stufe] || k.effort[0].stufe : null;
    return `<tr><th>${esc(KLASSE[k.klasse] || k.klasse)}<div class="small muted">${esc(k.klasse === 'subagent' ? `in ${plural(k.sitzungen, 'Sitzung', 'Sitzungen')}` : plural(k.sitzungen, 'Sitzung', 'Sitzungen'))}</div></th>
      <td>${modelle}${stufe ? `<div class="small muted">Denkstufe meist ${esc(stufe)}</div>` : ''}</td>
      <td class="num">${esc(tokenText(k.tokens))}</td></tr>`;
  }).join('');

  const modelle = d.modelle.map(m => `<tr><th>${esc(modellName(m.modell))}</th>
      <td class="num">${esc(m.antworten.toLocaleString('de-DE'))}</td>
      <td class="num">${esc(tokenText(m.tokens.ausgabe))}</td>
      <td class="num">${esc(tokenText(m.tokens.gesamt))}</td></tr>`).join('');

  const aufgaben = d.aufgaben.length
    ? `<div class="rows">${d.aufgaben.map(a => {
      const task = state.tasks.find(x => x.number === a.nummer);
      return `<div class="row verbrauch-aufgabe"><div><div class="t">${aufgabeLink(a.nummer)} ${task ? esc(task.title) : ''}</div><div class="m">${esc(plural(a.sitzungen, 'Sitzung', 'Sitzungen'))}</div></div><div class="num">${esc(tokenText(a.tokens))}</div></div>`;
    }).join('')}</div>`
    : '<p class="small muted">Keine Sitzung hat diese Woche eine Aufgabe geführt.</p>';
  const lang = d.langsitzungen.filter(x => !d.sitzungen.some(y => y.id === x.id));
  // Die Datei traegt hoechstens 20 Langsitzungen (die groessten) - die Zahl sagt, wenn es mehr sind.
  const weitereLang = s.langsitzungen - d.sitzungen.filter(x => x.lang).length;
  const langText = weitereLang > lang.length ? `die ${lang.length} größten von ${weitereLang}` : String(lang.length);

  return `<section class="card span-2 verbrauch">
    ${kopf(`letzte 7 Tage · Stand ${esc(fmtDateTime(d.erzeugtAm))}${d.wirdErneuert ? ' · wird aktualisiert' : ''}`)}
    <div class="heute-kpis">
      ${kpi(s.sitzungen.toLocaleString('de-DE'), 'Sitzungen', geplant ? `davon ${geplant} geplante Aufgaben` : 'alle im Gespräch gestartet', s.sitzungen ? '' : ' fehlt')}
      ${kpi(s.langsitzungen.toLocaleString('de-DE'), 'Langsitzungen', `über ${d.regeln.langsitzungMinuten / 60} h aktiv oder über ${d.regeln.langsitzungAufrufe} Aufrufe`, s.langsitzungen ? '' : ' fehlt')}
      ${kpi(tokenText(t.gesamt), 'Tokens', `${cacheAnteil} % davon aus dem Cache gelesen`)}
      ${kpi(tokenText(t.ausgabe), 'vom Modell geschrieben', `neu eingelesen: ${tokenText(t.eingabe + t.cacheSchreiben)}`)}
    </div>
    <div class="verbrauch-raster">
      <div><h3>Sitzungen je Tag</h3><div class="verbrauch-tage">${tage}</div></div>
      <div><h3>Modell je Klasse</h3><div class="table-scroll"><table class="kpi verbrauch-klein"><tbody>${klassen}</tbody></table></div></div>
    </div>
    <h3>Größte Sitzungen</h3>
    ${sitzungTabelle(d.sitzungen)}
    <div class="verbrauch-raster">
      <div><h3>Tokens je Aufgabe</h3>${aufgaben}
        <p class="small muted">${esc(`${d.zuordnung.mitAufgabe} von ${d.summe.sitzungen} Sitzungen haben ihre Aufgabe im Control Center geführt; nur diese lassen sich zuordnen. Eine Sitzung mit mehreren Aufgaben zählt bei jeder.`)}</p></div>
      <div><h3>Tokens je Modell</h3><div class="table-scroll"><table class="kpi verbrauch-klein verbrauch-modelle"><thead><tr><th>Modell</th><th class="num">Antworten</th><th class="num">geschrieben</th><th class="num">gesamt</th></tr></thead><tbody>${modelle}</tbody></table></div></div>
    </div>
    ${lang.length ? `<details class="verbrauch-lang"><summary>Weitere Langsitzungen (${esc(langText)})</summary>${sitzungTabelle(lang)}</details>` : ''}
    <p class="small muted verbrauch-fuss">Quelle: Sitzungsprotokolle von Claude Code auf diesem Mac (Hauptsitzung, Worktrees, Subagenten). Aktiv zählt ohne Pausen über ${d.regeln.pauseMinuten} Minuten. Wie viel vom Wochenlimit verbraucht ist, steht in keiner lokalen Datei – das zeigt nur die Claude-App; wie Anthropic die Tokenarten anrechnet, ist nicht veröffentlicht.</p>
  </section>`;
}
