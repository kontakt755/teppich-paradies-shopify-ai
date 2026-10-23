/** Aggregierte, rein lesende Muster-/Kaufbeobachtung. Keine Kundenlisten und keine Versandaktion. */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDateTime } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { stoerungState } from '../../bausteine/karten.mjs';

export const musterwirkungCache = { daten: null, fehler: null, loading: false, am: null, abruf: 0 };
const ENDPUNKT = '/api/kunden/musterwirkung';

export function ensureMusterwirkung({ erzwingen = false } = {}) {
  const c = musterwirkungCache;
  if (c.loading || (!erzwingen && c.am !== null && Date.now() - c.am < 60_000)) return;
  c.loading = true;
  const abruf = ++c.abruf;
  return fetchEinkauf(ENDPUNKT).catch(e => ({ verfuegbar: false, fehler: true, hinweis: e.message })).then(d => {
    if (abruf !== c.abruf) return;
    c.loading = false; c.am = Date.now();
    if (d?.verfuegbar && d.zahlen && d.qualitaet && d.abdeckung) { c.daten = d; c.fehler = null; }
    else c.fehler = d || { hinweis: 'Die Musterbeobachtung konnte nicht gelesen werden.' };
    if (state.route.view === 'kunden' && state.route.params.get('tab') === 'musterwirkung') render();
  });
}

export function verwirfMusterwirkung() {
  Object.assign(musterwirkungCache, { daten: null, fehler: null, loading: false, am: null, abruf: musterwirkungCache.abruf + 1 });
}

export function musterwirkungKlick(e) {
  if (!e.target.closest('[data-mw-neuladen]')) return false;
  e.preventDefault(); ensureMusterwirkung({ erzwingen: true }); render(); return true;
}

export function viewMusterwirkung() {
  ensureMusterwirkung();
  const c = musterwirkungCache, d = c.daten;
  const fehler = c.fehler ? stoerungState(c.fehler, 'Die Musterbeobachtung').replace('data-action="reload"', 'data-mw-neuladen') : '';
  const kopf = '<p class="sub">Hier siehst du, welche Warenkäufe nach Musterbestellungen im verfügbaren Bestand beobachtet wurden. Die zeitliche Folge beweist keine Kaufursache.</p>';
  if (!d) return kopf + (fehler || '<p role="status">Muster und Warenkäufe werden ausgewertet …</p>');
  const z = d.zahlen, q = d.qualitaet, a = d.abdeckung;
  const zeile = (titel, wert, hinweis = '') => `<tr><th scope="row">${esc(titel)}</th><td>${wert == null ? 'nicht bestimmbar' : esc(wert)}</td><td>${esc(hinweis)}</td></tr>`;
  return `${kopf}${fehler}
    <p class="small muted">${a.exportiertAm ? `Bestelldaten ${fmtDateTime(a.exportiertAm)}` : 'Exportzeitpunkt unbekannt'} · ${esc(a.bestellungenImExport)} Bestellungen im Betriebsbestand. <button type="button" class="btn btn-sm btn-ghost" data-mw-neuladen${c.loading ? ' disabled' : ''}>${c.loading ? 'Wird aktualisiert …' : 'Neu prüfen'}</button></p>
    <p class="notice warn">Kein vollständiges Bestellarchiv: letzte 90 Tage sowie ältere offene Versand- und Zahlungsfälle. „Ohne beobachtetes Muster“ bedeutet nicht „hat nie Muster bestellt“.</p>
    ${q.unklareRabattwerte || q.unklareErstattungswerte || q.ohneSichereIdentitaet ? `<p class="notice warn">Unvollständige Belege: ${esc(q.unklareRabattwerte)} Warenbestellungen ohne vollständige Rabattwerte, ${esc(q.unklareErstattungswerte)} mit unklarer Erstattungszuordnung und ${esc(q.ohneSichereIdentitaet)} Bestellungen ohne sichere Kundenkennung. Unklare Fälle werden nicht als bestätigter Kauf gezählt.</p>` : ''}
    <div class="table-scroll"><table><thead><tr><th>Beobachtung</th><th>Anzahl</th><th>Einordnung</th></tr></thead><tbody>
      ${zeile('Musterkunden', z.musterkunden, 'Eindeutige Kennung; mindestens eine bezahlte Musterbestellung')}
      ${zeile('Musterkunden mit Versandbuchung', z.musterkundenMitVersandbuchung, 'Mindestens eine vollständige Musterbestellung als erfüllt gebucht; kein physischer Empfang belegt')}
      ${zeile('Musterkunden ohne belegte Versandbuchung', z.musterkundenOhneVersandbuchung, 'Im Export kein vollständiger Versandbeleg; kann auch eine fehlende digitale Buchung sein')}
      ${zeile('Musterkunden mit Zustellnachweis', z.musterkundenMitZustellnachweis, 'Vollständiger erfüllter Auftrag und sämtliche belegten aktiven Sendungen zugestellt; keine Ableitung aus Teillieferungen')}
      ${zeile('Davon späterer Warenkauf belegt', z.musterkundenMitWarenkauf, 'Je Kunde einmal, nur bezahlte Ware mit positivem Betrag nach allen Rabatten')}
      ${zeile('Davon späterer Warenkauf unklar', z.musterkundenMitUnklaremWarenkauf, 'Werte oder Erstattungszuordnung reichen nicht für einen Kaufbeleg')}
      ${zeile('Noch junge Musterkunden', z.nochJungeMusterkunden, `Erste beobachtete Musterbestellung liegt weniger als ${a.beobachtungTage} Tage zurück; kein Misserfolg`)}
      ${zeile('Ältere Musterbestellung, bislang kein Warenkauf belegt', z.ausgereifteMusterkundenOhneBeobachtetenKauf, `Erste beobachtete Musterbestellung liegt mindestens ${a.beobachtungTage} Tage zurück und im 90-Tage-Fenster; kein vollständiger Lebenszeitnachweis`)}
      ${z.musterkundenMitLueckenhafterHistorie ? zeile('Lückenhafte Historie nach älteren Mustern', z.musterkundenMitLueckenhafterHistorie, 'Musterbestellung vor dem 90-Tage-Fenster; abgeschlossene Zwischenkäufe können fehlen') : ''}
      ${z.beobachtungsdauerUnklar ? zeile('Beobachtungsdauer unbekannt', z.beobachtungsdauerUnklar, 'Exportzeitpunkt fehlt') : ''}
      ${zeile('Warenkäufer ohne vorher beobachtetes Muster', z.warenkaeuferOhneBeobachtetesMuster, 'Frühere Muster außerhalb des Betriebsbestands bleiben möglich')}
      ${zeile('Wiederholte Musterkunden', z.wiederholungsmusterkunden, `${z.weitereMusterbestellungen} weitere Musterbestellungen`)}
      ${zeile('Musterbestellungen / verbleibende Musteranzahl', `${z.musterbestellungen} / ${z.musterstuecke}`, 'Bestellte Mengen; kein Nachweis über tatsächliches Packen oder Versand')}
      ${zeile('Mittlerer Kaufabstand (Median), Tage', z.kaufabstandMedianTage, 'Erste beobachtete Musterbestellung bis erster belegter späterer Warenkauf')}
    </tbody></table></div>
    <details><summary>Datenabdeckung und Grenzen</summary>
      <ul>${[...a.hinweise, ...d.hinweise].map(h => `<li>${esc(h)}</li>`).join('')}</ul>
      <p>${esc(q.gemischteBestellungen)} gemischte Muster-/Warenbestellungen; ${esc(z.musterkundenMitVorherigemWarenkauf)} Musterkunden hatten bereits vorher einen beobachteten Warenkauf.</p>
      <p>${esc(q.mehrdeutigeEmails)} mehrdeutige E-Mail-Zuordnungen; ${esc(q.mehrdeutigeGastbestellungen)} dadurch nicht zugeordnete Gastbestellungen. ${esc(q.testbestellungen)} Test- und ${esc(q.stornierteBestellungen)} stornierte Bestellungen bleiben außerhalb der Beobachtung.</p>
      <p>Fehlende Bestellkennungen: ${esc(q.fehlendeBestellkennung)} · widersprüchliche Bestellungen: ${esc(q.widerspruechlicheBestellungen)} · fehlende Positionsdaten: ${esc(q.fehlendePositionsdaten)} · unklare Warenzuordnung: ${esc(q.unklareWarenzuordnung)}.</p>
      <p>Kosten, Arbeitsminuten und Margen fehlen. Daraus wird keine Rentabilität und keine scheinbar genaue Konversionsrate berechnet.</p>
    </details>
    <p><a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Musterbestellungen ansehen</a> · <a href="#/kunden?tab=bestellungen&amp;bfilter=alle">Alle Bestellungen</a></p>`;
}
