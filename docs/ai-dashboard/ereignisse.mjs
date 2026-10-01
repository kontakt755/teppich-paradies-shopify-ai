/**
 * Zentrale Ereignisverteilung am document (Klick, Aenderung, Eingabe, Tastatur, Drag & Drop,
 * Hash-Wechsel). Es gibt je Ereignisart genau einen Listener; die Reihenfolge der Pruefungen
 * darin ist Verhalten (der erste Treffer gewinnt) und entspricht der des frueheren Monolithen.
 *
 * Was nur eine Ansicht betrifft, steht in deren Modul als Funktion "<ansicht>Klick(e)" bzw.
 * "…Aenderung(e)" und gibt true zurueck, wenn das Ereignis damit erledigt ist. Ein neuer
 * Knopf einer bestehenden Ansicht gehoert in deren Funktion - nicht hierher.
 */
import { darfUebernehmen } from './lib/eingabe.mjs';
import { STATUS_BY_KEY, TRANSITIONS } from './lib/model.mjs';
import { state } from './kern/zustand.mjs';
import { $, toast } from './kern/helfer.mjs';
import { logout } from './kern/sitzung.mjs';
import { darfAnsicht, parseRoute, navigate, openTask, closeTask, setParam } from './kern/router.mjs';
import { toggleTheme, folgeGeraet } from './kern/thema.mjs';
import { bindeNavigation, mehrOffen, schliesseMehr } from './kern/navigation.mjs';
import { refresh } from './kern/daten.mjs';
import { render } from './kern/render.mjs';
import { openActionDialog } from './bausteine/aktions-dialog.mjs';
import { syncNow, aktualisierenNow } from './bausteine/aktualisierung.mjs';
import { openPalette, closePalette } from './bausteine/palette.mjs';
import { einkaufKlickStatus, einkaufKlickDialoge } from './ansichten/einkauf/auftragsfluss.mjs';
import { einkaufKlickLieferanten } from './ansichten/einkauf/lieferanten.mjs';
import { lexikonKlick } from './ansichten/lexikon.mjs';
import { kundenKlickBestellungen } from './ansichten/kunden/bestellungen.mjs';
import { kundenKlickAkte } from './ansichten/kunden.mjs';
import { openOrgSchnell } from './ansichten/organisation/dialoge.mjs';
import {
  orgKlickZuruecksetzen, orgKlickSchnell, orgKlick, orgAenderungAnhang, orgAenderungFeld, orgTaste,
} from './ansichten/organisation.mjs';
import { openMeinPasswort, teamKlick, teamAenderung } from './ansichten/team.mjs';
import { fotosEreignisseBinden, fotosAenderung } from './ansichten/fotos.mjs';
import { arbeitKlick } from './ansichten/arbeit.mjs';
import { ladeAktivitaetsdaten } from './ansichten/aktivitaet.mjs';

export function bindEvents() {
  // Aufklappbare Startseiten-Abschnitte merken sich Auf/Zu je Abschnitt (nicht je Aufgabe).
  document.addEventListener('toggle', e => {
    const d = e.target.closest?.('details[data-collapsible]');
    if (!d) return;
    try { localStorage.setItem(`tp-heute-${d.dataset.collapsible}`, d.open ? '1' : '0'); } catch {}
  }, true);
  fotosEreignisseBinden();
  document.addEventListener('click', e => {
    if (e.target.closest('[data-abmelden]')) { logout(); return; }
    const open = e.target.closest('[data-open]');
    if (open && !e.target.closest('[data-decide]')) { e.preventDefault(); openTask(Number(open.dataset.open)); if (open.dataset.primary) { setTimeout(() => $('#sheetRoot [data-act]')?.focus(), 50); } return; }
    if (e.target.closest('[data-close-sheet]')) { closeTask(); return; }
    // Dialog schliessen: nur bei Klick auf den Schliessen-Button selbst (z.B. "Abbrechen")
    // oder bei Klick auf die Flaeche ausserhalb des Formulars (Hintergrund). closest() findet
    // sonst auch den umschliessenden Hintergrund-Container bei JEDEM Klick im Dialog (auch auf
    // "Uebernehmen"/Absenden) und schliesst den Dialog, bevor das Formular abschicken kann -
    // dadurch ging jeder per Maus-Klick bestaetigte Dialog verloren, ohne zu speichern.
    const closeTarget = e.target.closest('[data-close-dialog]');
    if (closeTarget) {
      // Geschlossen wird nur, wenn das Schliessen-Element selbst getroffen
      // wurde (Abbrechen) oder direkt der Hintergrund. Die frühere Regel
      // "ausserhalb eines <form>" schloss jeden Klick in Dialogen ohne
      // Formular - dort war kein Knopf bedienbar.
      const imDialog = e.target.closest('.dialog');
      if (closeTarget === e.target || !imDialog) { $('#dialogRoot').innerHTML = ''; return; }
    }
    if (e.target.closest('[data-close-palette]') && !e.target.closest('.palette')) { closePalette(); return; }
    const act = e.target.closest('[data-act]');
    if (act) { const t = state.tasks.find(x => x.number === Number(act.dataset.task)); if (t) openActionDialog(t, act.dataset.act); return; }
    const dec = e.target.closest('[data-decide]');
    if (dec) { const t = state.tasks.find(x => x.number === Number(dec.dataset.task)); if (t) openActionDialog(t, dec.dataset.decide); return; }
    if (einkaufKlickStatus(e)) return;
    if (einkaufKlickLieferanten(e)) return;
    if (arbeitKlick(e)) return;
    if (einkaufKlickDialoge(e)) return;
    if (orgKlickZuruecksetzen(e)) return;
    const p = e.target.closest('button[data-param]');
    if (p) { setParam(p.dataset.param, p.dataset.value); return; }
    const kop = e.target.closest('[data-kopieren]');
    if (kop) {
      const ta = document.getElementById(kop.dataset.kopieren);
      if (ta) {
        const doCopy = async () => { try { await navigator.clipboard.writeText(ta.value); return true; } catch { try { ta.select(); return document.execCommand('copy'); } catch { return false; } } };
        doCopy().then(ok => { const alt = kop.textContent; kop.textContent = ok ? 'Kopiert' : 'Kopieren fehlgeschlagen'; setTimeout(() => { kop.textContent = alt; }, 1800); });
      }
      return;
    }
    if (lexikonKlick(e)) return;
    if (kundenKlickAkte(e)) return;
    const druckBtn = e.target.closest('[data-drucken]');
    if (druckBtn) { e.preventDefault(); window.print(); return; }
    if (orgKlickSchnell(e)) return;
    if (teamKlick(e)) return;
    if (orgKlick(e)) return;
    if (kundenKlickBestellungen(e)) return;
    const kt = e.target.closest('[data-kopiertext]');
    if (kt) {
      const text = kt.dataset.kopiertext;
      const doCopy = async () => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
      doCopy().then(ok => { const alt = kt.textContent; kt.textContent = ok ? 'Kopiert' : 'Kopieren fehlgeschlagen'; setTimeout(() => { kt.textContent = alt; }, 1800); });
      return;
    }
    const a = e.target.closest('[data-action]');
    if (a) { if (a.dataset.action === 'sync') syncNow(); if (a.dataset.action === 'refresh') refresh(); if (a.dataset.action === 'aktualisieren') aktualisierenNow(); if (a.dataset.action === 'reload') location.reload(); if (a.dataset.action === 'clear-filters') navigate('arbeit', { mode: state.route.params.get('mode') || '' }); }
  });
  document.addEventListener('change', e => {
    if (fotosAenderung(e)) return;
    if (orgAenderungAnhang(e)) return;
    if (teamAenderung(e)) return;
    const el = e.target.closest('select[data-param]'); if (el) { setParam(el.dataset.param, el.value); return; }
    orgAenderungFeld(e);
  });
  let qTimer;
  document.addEventListener('input', e => {
    const el = e.target.closest('input[type=search][data-param]');
    if (!el) return;
    const key = el.dataset.param;
    // Ansicht und Feld festhalten: wer waehrend der Entprellzeit die Ansicht
    // wechselt, soll seinen Suchtext nicht in der neuen wiederfinden.
    const ansicht = state.route.view;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      if (!darfUebernehmen({ gemerkteAnsicht: ansicht, aktuelleAnsicht: state.route.view, feldNochDa: document.contains(el) })) return;
      const p = new URLSearchParams(state.route.params);
      if (el.value) p.set(key, el.value); else p.delete(key);
      if (key === 'psq') p.delete('seite');
      if (key === 'lq') p.delete('lseite');
      history.replaceState(null, '', `#/${state.route.view}?${p}`);
      parseRoute();
      render();
    }, 150);
  });
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#paletteRoot').children.length ? closePalette() : openPalette(); return; }
    if (e.key === 'Escape') { if (mehrOffen()) schliesseMehr(); else if ($('#paletteRoot').children.length) closePalette(); else if ($('#dialogRoot').children.length) $('#dialogRoot').innerHTML = ''; else if (state.route.params.get('task')) closeTask(); return; }
    if (inField || $('#dialogRoot').children.length || $('#paletteRoot').children.length) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    // "n" wie neu: Schnellerfassung von jeder Seite aus.
    if (e.key === 'n' && state.capabilities.mode === 'local') { e.preventDefault(); openOrgSchnell(); return; }
    if (orgTaste(e)) return;
    const rows = [...document.querySelectorAll('#main [data-open][tabindex]')];
    if (!rows.length) return;
    // Solange eine Aufgabe offen ist, gehoert die Tastatur dem Panel. Vorher
    // band && staerker als ||, deshalb sprang j/k trotzdem in die Liste
    // dahinter - und Enter oeffnete eine andere Aufgabe.
    if (state.route.params.get('task')) return;
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); state.selectedRow = Math.min(rows.length - 1, Math.max(0, state.selectedRow + 1)); rows[state.selectedRow].focus(); rows.forEach((r, i) => r.classList.toggle('selected', i === state.selectedRow)); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); state.selectedRow = Math.max(0, state.selectedRow - 1); rows[state.selectedRow].focus(); rows.forEach((r, i) => r.classList.toggle('selected', i === state.selectedRow)); }
    else if (e.key === 'Enter' && document.activeElement?.dataset?.open) { e.preventDefault(); openTask(Number(document.activeElement.dataset.open)); }
  });
  // Kanban Drag & Drop (nur lokal)
  document.addEventListener('dragstart', e => { const c = e.target.closest('[data-drag]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.drag); e.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', e => { const col = e.target.closest('.kcol'); if (col && state.capabilities.actions) { e.preventDefault(); col.classList.add('drop'); } });
  document.addEventListener('dragleave', e => { e.target.closest?.('.kcol')?.classList.remove('drop'); });
  document.addEventListener('drop', e => {
    const col = e.target.closest('.kcol'); if (!col) return; e.preventDefault(); col.classList.remove('drop');
    const n = Number(e.dataTransfer.getData('text/plain')); const t = state.tasks.find(x => x.number === n); if (!t) return;
    const targetCol = col.dataset.col;
    const target = targetCol === 'fertig' ? 'fertig' : targetCol === t.column ? null : targetCol;
    if (!target) return;
    const allowed = (TRANSITIONS[t.status] || []).includes(target);
    if (!allowed) { toast(`Übergang ${t.statusLabel} → ${STATUS_BY_KEY[target].label} ist nicht vorgesehen`, 'crit'); return; }
    openActionDialog(t, 'move', { target });
  });
  $('#searchBtn').addEventListener('click', openPalette);
  $('#themeBtn')?.addEventListener('click', toggleTheme);
  $('#sessionBtn').addEventListener('click', logout);
  $('#meinPasswortBtn')?.addEventListener('click', openMeinPasswort);
  // Der Chip fuehrt in den Systemzustand - fuer Mitarbeiter gibt es dort nichts,
  // also fuehrt er sie auf die Startseite statt in eine leere Umleitung.
  $('#syncChip').addEventListener('click', () => navigate(darfAnsicht('insights') ? 'insights' : 'heute'));
  bindeNavigation();
  folgeGeraet();
  window.addEventListener('hashchange', async () => { clearTimeout(qTimer); const prev = state.route.view; parseRoute(); state.selectedRow = -1; if (state.route.view === 'aktivitaet' && prev !== 'aktivitaet') { await ladeAktivitaetsdaten(); } render(); if (state.route.view === 'lexikon' && prev !== 'lexikon' && !state.route.params.get('handle')) $('#main input[data-param="lq"]')?.focus(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ silent: true }); });
}
