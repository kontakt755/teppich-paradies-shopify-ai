/** Versionshinweis ausserhalb von #main: keine Ansicht neu zeichnen und nie selbst neu laden. */
import { state } from '../kern/zustand.mjs';
import { $, toast } from '../kern/helfer.mjs';
import { markiereSitzungAbgelaufen } from '../kern/sitzung.mjs';

export function offeneEingaben(doc = document) {
  if (doc.querySelector('#dialogRoot > *, #paletteRoot > *, dialog[open]')) return true;
  return [...doc.querySelectorAll('#main input, #main textarea, #main select, #main [contenteditable="true"]')].some(el => {
    if (el.matches('[contenteditable="true"]')) return true;
    if (el.matches('select')) {
      const optionen = [...el.options];
      const explizit = optionen.some(o => o.defaultSelected);
      return optionen.some((o, i) => o.selected !== (o.defaultSelected || (!explizit && !el.multiple && i === 0)));
    }
    if (el.matches('[type=checkbox], [type=radio]')) return el.checked !== el.defaultChecked;
    return el.value !== el.defaultValue;
  });
}

export function starteDienstversion() {
  const version = document.querySelector('meta[name="tp-dienstversion"]')?.content;
  const balken = $('#dienstversionLeiste');
  if (!/^[a-f0-9]{16}$/.test(version || '') || !balken) return;
  let laedt = false;
  const pruefe = async () => {
    if (laedt || document.hidden || state.capabilities.mode !== 'local') return;
    laedt = true;
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (r.status === 401) { markiereSitzungAbgelaufen(); balken.hidden = true; return; }
      if (!r.ok) return;
      const d = await r.json();
      if (state.capabilities.mode === 'local' && /^[a-f0-9]{16}$/.test(d.version || '')) balken.hidden = d.version === version;
    } catch { /* Ein kurzer Netzausfall ist kein Versionswechsel. */ }
    finally { laedt = false; }
  };
  $('#dienstversionLaden')?.addEventListener('click', () => {
    if (offeneEingaben()) { toast('Bitte zuerst offene Eingaben speichern oder schließen. Danach neu laden.', 'warn'); return; }
    window.location.reload();
  });
  window.addEventListener('tp-sitzung-beendet', () => { balken.hidden = true; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void pruefe(); });
  setInterval(() => void pruefe(), 60_000);
  void pruefe();
}
