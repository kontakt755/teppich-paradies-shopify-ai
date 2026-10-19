/* Isoliertes Content-Script: nur die konfigurierten Dashboard-Urspruenge im Hauptfenster. */
(() => {
  'use strict';
  const L = globalThis.TPBrowserUebergabeLogik;
  const config = globalThis.TPBrowserUebergabeKonfiguration;
  if (window !== window.top || !config?.dashboardUrspruenge?.includes(location.origin)) return;
  const aktiv = new Set();
  let klickBis = 0;
  function antwort(id, status, code) {
    const m = { typ: 'tp-prozess-uebergabe-antwort', version: 1, id, status };
    if (code) m.code = code;
    window.postMessage(m, location.origin);
  }
  document.addEventListener('click', e => {
    if (e.isTrusted && e.target.closest?.('[data-prozess-direkt]')) klickBis = performance.now() + 1000;
  }, true);
  function anWorker(m) {
    return chrome.runtime.sendMessage({ ...m, kanal: 'dashboard' });
  }
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.typ !== 'tp-prozess-uebergabe') return;
    const m = e.data;
    if (!L.nachrichtGueltig(m)) {
      if (L.UUID.test(m?.id || '')) antwort(m.id, 'fehler', 'ungueltig');
      return;
    }
    if (m.aktion === 'einfuegen') {
      const geklickt = klickBis > 0 && performance.now() <= klickBis;
      klickBis = 0;
      if (!geklickt) { antwort(m.id, 'fehler', 'klick_fehlt'); return; }
      if (aktiv.has(m.id)) { antwort(m.id, 'fehler', 'doppelt'); return; }
      aktiv.add(m.id);
    }
    if (m.aktion === 'abbrechen') aktiv.delete(m.id);
    anWorker(m).then(r => {
      if (!r || !['bereit', 'oeffnet', 'fehler'].includes(r.status)) return;
      if (m.aktion === 'einfuegen' && !aktiv.has(m.id)) return;
      if (r.status === 'fehler') aktiv.delete(m.id);
      antwort(m.id, r.status, r.code);
    }).catch(() => {
      aktiv.delete(m.id);
      antwort(m.id, 'fehler', 'begleiter_fehler');
    });
  });
  chrome.runtime.onMessage.addListener((m, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab || m?.kanal !== 'dashboard-antwort' || !aktiv.has(m.id)) return;
    if (!['eingefuegt', 'fehler'].includes(m.status)) return;
    aktiv.delete(m.id);
    antwort(m.id, m.status, m.code);
  });
  function abbrechen() {
    klickBis = 0;
    for (const id of aktiv) anWorker({ typ: 'tp-prozess-uebergabe', version: 1, aktion: 'abbrechen', id }).catch(() => {});
    aktiv.clear();
  }
  window.addEventListener('pagehide', abbrechen);
  window.addEventListener('hashchange', abbrechen);
})();
