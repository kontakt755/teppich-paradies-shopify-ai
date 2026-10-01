/**
 * Aufgabendaten (issues.json) und KI-Laeufe laden, stille Aktualisierung, Datenstand-Chip.
 */
import { normalizeTask, attentionScore, freshness } from '../lib/model.mjs';
import { CONFIG } from './konfig.mjs';
import { state } from './zustand.mjs';
import { $, fmtDateTime, toast } from './helfer.mjs';
import { render } from './render.mjs';

export async function loadData() {
  if (state.capabilities.mode !== 'local') { state.raw = null; state.tasks = []; state.scores = new Map(); state.loadError = null; return; }
  try {
    const r = await fetch(`${CONFIG.dataUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`issues.json konnte nicht geladen werden (HTTP ${r.status})`);
    const data = await r.json();
    if (!Array.isArray(data.issues)) throw new Error('issues.json hat kein issues-Array');
    state.raw = data;
    const now = new Date();
    state.tasks = data.issues.map(i => normalizeTask(i, { now }));
    state.scores = new Map(state.tasks.map(t => [t.number, attentionScore(t, state.tasks, { now }).score]));
    state.loadError = null;
  } catch (e) {
    state.loadError = e.message;
  }
}

export async function loadAgentRuns() {
  if (!state.capabilities.agentRuns) { state.agentRuns = null; return; }
  try {
    const r = await fetch('/api/agent-runs', { cache: 'no-store' });
    state.agentRuns = r.ok ? await r.json() : { error: `HTTP ${r.status}` };
  } catch (e) { state.agentRuns = { error: e.message }; }
}

export async function refresh({ silent = false } = {}) {
  const vorher = silent ? datenKennung() : null;
  await loadData();
  await loadAgentRuns();
  renderSyncChip();
  // Der stille 2-Minuten-Lauf zeichnet nur neu, wenn sich wirklich etwas
  // geaendert hat. Sonst klappten aufgeklappte Listen zu, Tabellen sprangen
  // an den Anfang und gerade Getipptes ging verloren.
  if (!silent || vorher !== datenKennung()) render();
  if (!silent && !state.loadError) toast('Daten aktualisiert');
}

/** Kurzer Fingerabdruck der geladenen Daten - reicht, um "hat sich was geaendert?" zu beantworten. */
function datenKennung() {
  const t = state.tasks || [];
  const agenten = state.agentRuns ? JSON.stringify(state.agentRuns).length : 0;
  return `${t.length}|${state.raw?.generatedAt || state.raw?.generated_at || ''}|${t.map(x => `${x.number}:${x.status}:${x.updatedAt || ''}`).join(',')}|${agenten}|${state.loadError || ''}`;
}

export function renderSyncChip() {
  const chip = $('#syncChip'); const txt = $('#syncChipText');
  const fr = freshness(state.raw?.generated_at);
  chip.className = `sync-chip ${state.loadError ? 'fehler' : fr.level}`;
  // Kurz halten: der Chip darf in der Kopfzeile nicht umbrechen. Details stehen im Tooltip.
  const uhrzeit = state.raw?.generated_at ? new Date(state.raw.generated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
  // "Stand 14:30" liest sich wie der Stand aller Zahlen im Dashboard. Der Wert
  // kommt aber allein aus issues.json, also von den Entwicklungsaufgaben; die
  // Betriebsdaten (Bestellungen, Kunden, Lexikon) haben eigene, meist aeltere
  // Zeitpunkte in aktualisierung.json. Deshalb steht dran, wovon er gilt.
  txt.textContent = state.loadError ? 'Daten fehlen' : `Aufgaben ${uhrzeit}`;
  chip.title = state.loadError ? state.loadError : `Aufgabendaten ${fr.text} · ${fmtDateTime(state.raw?.generated_at)} · ${state.raw?.count ?? 0} Aufgaben · Klick: Systemzustand`;
}
