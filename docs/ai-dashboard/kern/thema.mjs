/**
 * Helle/dunkle Ansicht umschalten. Die gespeicherte Wahl setzt index.html schon vor dem
 * Stylesheet, damit nichts aufblitzt.
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dunkel ? '#0d0c0b' : '#241a16');
}

export function toggleTheme() {
  const naechstes = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = naechstes;
  try { localStorage.setItem(THEME_KEY, naechstes); } catch {}
  renderThemeButton();
}
