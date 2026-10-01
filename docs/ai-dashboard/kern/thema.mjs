/**
 * Helle/dunkle Ansicht. Ohne eigene Wahl folgt sie dem Geraet (prefers-color-scheme) - auch
 * wenn das Geraet abends umschaltet. Wer am Knopf waehlt, behaelt seine Wahl in diesem Browser.
 * Den Anfangswert setzt index.html schon vor dem Stylesheet, damit nichts aufblitzt.
 */
import { $ } from './helfer.mjs';

const THEME_KEY = 'tp-theme';

export function renderThemeButton() {
  const btn = $('#themeBtn');
  if (!btn) return;
  const dunkel = document.documentElement.dataset.theme !== 'light';
  const ziel = dunkel ? 'Helle' : 'Dunkle';
  btn.title = `${ziel} Ansicht einschalten`;
  btn.setAttribute('aria-label', `${ziel} Ansicht einschalten`);
  const icon = $('#themeIcon');
  const text = $('#themeBtnText');
  if (icon) icon.textContent = dunkel ? '☀' : '☾';
  if (text) text.textContent = dunkel ? 'Hell' : 'Dunkel';
  // Statusleiste des Handys in der Farbe des Seitenhintergrunds (--bg).
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dunkel ? '#0d0c0b' : '#f3f0ea');
}

export function toggleTheme() {
  const naechstes = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = naechstes;
  try { localStorage.setItem(THEME_KEY, naechstes); } catch {}
  renderThemeButton();
}

function gespeicherteWahl() {
  try { const w = localStorage.getItem(THEME_KEY); return w === 'light' || w === 'dark' ? w : null; } catch { return null; }
}

/** Einmal beim Start: dem Geraet folgen, solange niemand selbst gewaehlt hat. */
export function folgeGeraet() {
  const hell = window.matchMedia?.('(prefers-color-scheme: light)');
  if (!hell?.addEventListener) return;
  hell.addEventListener('change', e => {
    if (gespeicherteWahl()) return;
    document.documentElement.dataset.theme = e.matches ? 'light' : 'dark';
    renderThemeButton();
  });
}
