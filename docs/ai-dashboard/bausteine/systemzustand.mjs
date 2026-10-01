/**
 * Systemgesundheit: eine Zeile je Datenquelle, gezeigt auf "Heute" und "Insights".
 */
import { freshness } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, plural } from '../kern/helfer.mjs';
import { aktualisierungHealth } from './aktualisierung.mjs';

export function systemHealth() {
  const items = [];
  const fr = freshness(state.raw?.generated_at);
  if (state.loadError) items.push({ level: 'crit', title: 'Aufgabendaten nicht ladbar', detail: state.loadError });
  else items.push({ level: fr.level === 'frisch' ? 'ok' : fr.level === 'alt' ? 'warn' : 'crit', title: `Aufgabendaten aus GitHub Issues · Stand ${fmtDateTime(state.raw?.generated_at)} (${fr.text})`, detail: state.capabilities.mode === 'local' ? 'Lokaler Modus: „Jetzt synchronisieren" holt frische Daten über gh.' : 'Die Daten entstehen seit 2026-09-30 nur noch lokal. Für aktuelle Aufgaben `npm run dashboard` starten.' });
  const cap = state.capabilities;
  items.push(cap.mode === 'local'
    ? { level: 'ok', title: `Lokaler Aktionsmodus aktiv${cap.user ? ` · angemeldet als @${cap.user}` : ''}`, detail: 'Statuswechsel, Zuweisung und Kommentare laufen über gh unter diesem Konto und sind auf GitHub auditierbar.' }
    : { level: 'warn', title: 'Read-only (statischer Modus)', detail: 'Aktionen führen zu GitHub. Für Aktionen im Control Center lokal `npm run dashboard` starten.' });
  const missing = ['status:triage', 'status:bereit', 'status:freigabe', 'status:beobachten', 'status:abgebrochen'].filter(l => !(state.raw?.sync?.labelsAvailable || []).includes(l));
  if (state.raw?.sync?.labelsAvailable) items.push(missing.length
    ? { level: 'warn', title: `${missing.length} Status-Labels fehlen im Repository`, detail: `${missing.join(', ')} – bis zur Anlage gilt die Übergangsregel (Freigabe = blockiert + reviewer:mensch). Anlage: setup-dashboard.sh (Freigabe nötig).` }
    : { level: 'ok', title: 'Alle Status-Labels vorhanden', detail: '' });
  if (cap.agentRuns) {
    const ar = state.agentRuns;
    if (!ar || ar.error) items.push({ level: 'warn', title: 'KI-Läufe: Steuerzentrale nicht lesbar', detail: ar?.error || '' });
    else {
      const failed = (ar.runs || []).filter(r => r.state === 'ERROR').length;
      items.push({ level: failed ? 'warn' : 'ok', title: `KI-Läufe: ${plural((ar.runs || []).length, 'Lauf', 'Läufe')} bekannt${failed ? `, ${failed} mit Fehler` : ''}`, detail: ar.usage ? `Ledger: ${ar.usage.requests} Provider-Aufrufe, ${ar.usage.costUsd.toFixed(2)} USD` : '' });
    }
  } else items.push({ level: 'info', title: 'KI-Läufe nur lokal sichtbar', detail: 'Die Steuerzentrale speichert Läufe außerhalb des Repos; statisch ist nur der Issue-Status sichtbar.' });
  // Level "info" = dauerhafter, bewusster Zustand (kein Handlungsbedarf). Zaehlt nie als
  // Warnung - sonst stuende die Systemgesundheit auf "Hinweise", obwohl alles laeuft.
  items.push({ level: 'info', title: 'Google Ads und GA4 nicht angebunden', detail: 'Bewusst: Shop-Kennzahlen kommen aus dem lokalen Export (Startseite „Heute"); Ads und Analytics erst nach Sichtbarkeitsentscheidung (docs/control-center/BESTANDSAUFNAHME.md, Punkt 4).' });
  if (state.capabilities.mode === 'local') items.push(...aktualisierungHealth());
  return items;
}

export function healthRow(h) {
  return `<div class="health-row ${h.level}"><span class="dot" aria-hidden="true"></span><div><div>${esc(h.title)}</div>${h.detail ? `<div class="d">${esc(h.detail)}</div>` : ''}</div>${h.link ? `<a class="small" href="${esc(h.link)}" target="_blank" rel="noopener">Lauf ↗</a>` : ''}</div>`;
}
