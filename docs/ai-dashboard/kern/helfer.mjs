/**
 * Kleine Helfer ohne eigenes Wissen ueber Ansichten: DOM-Zugriff, Escaping, Datum,
 * Preis, Geldbetrag, Mehrzahl, GitHub-Adressen, Toast.
 *
 * Jeder Wert, der in HTML landet, geht durch esc().
 */
import { REPO_URL } from './konfig.mjs';

export const $ = sel => document.querySelector(sel);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
export const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
export const ago = iso => { if (!iso) return '–'; const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 60) return `vor ${m} Min.`; const h = Math.round(m / 60); if (h < 48) return `vor ${h} Std.`; return `vor ${Math.round(h / 24)} Tagen`; };
export const since = iso => ago(iso).replace(/^vor /, 'seit ');
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const issueUrl = n => `${REPO_URL}/issues/${n}`;
export const newIssueUrl = (params = {}) => `${REPO_URL}/issues/new?${new URLSearchParams(params)}`;

// Zeitpunkt der letzten Stoerung (Server antwortet 5xx, keine Verbindung,
// JS-Fehler). Kommt gleich danach eine rote Rueckmeldung, traegt sie einen
// Knopf "Melden": wer gerade gescheitert ist, soll das mit einem Tipp melden
// koennen - Seite und Fehlermeldung haengt "Fehler melden" selbst an.
let letzteStoerung = 0;
export function merkeStoerung() { letzteStoerung = Date.now(); }

export function toast(text, kind = '', { dauer = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = text;
  // Nicht im offenen Melde-Dialog: der Knopf wuerde ihn samt Eingabe neu oeffnen.
  const melden = kind === 'crit' && Date.now() - letzteStoerung < 3000 && !document.querySelector('.fm-dialog');
  if (melden) {
    const knopf = document.createElement('button');
    knopf.type = 'button'; knopf.className = 'toast-knopf'; knopf.textContent = 'Melden';
    knopf.dataset.fehlerMelden = '';
    el.append(knopf);
  }
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), dauer || (melden ? 9000 : 4200));
}

/** Geldbetrag deutsch: "0,00 €", "1.234,50 €"; andere Waehrungen mit ihrem Kuerzel. */
export function geldText(g) {
  if (!g || g.betrag === null || g.betrag === undefined || !Number.isFinite(Number(g.betrag))) return '–';
  const w = g.waehrung || 'EUR';
  return `${fmtPreis(g.betrag)} ${w === 'EUR' ? '€' : esc(w)}`;
}

export const NICHT_HINTERLEGT = '<span class="small muted">nicht hinterlegt</span>';

export function fmtPreis(n) { return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
