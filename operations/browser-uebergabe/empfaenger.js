/* Nur ein leerer Composer im exakt angeforderten ChatGPT-Projekt wird befuellt. Niemals senden. */
(() => {
  'use strict';
  const L = globalThis.TPBrowserUebergabeLogik;
  if (window !== window.top || !L.projektZiel(location.href)) return;
  let auftrag = null;
  let abgebrochen = false;
  const pause = ms => new Promise(r => setTimeout(r, ms));
  function sichtbar(el) { return Boolean(el?.isConnected && el.getClientRects().length); }
  function umgebung() {
    if (!navigator.onLine) return { code: 'offline' };
    if (!auftrag || location.href !== auftrag.ziel || Date.now() >= auftrag.bis || abgebrochen) return { code: 'abgebrochen' };
    const titel = [...document.querySelectorAll('main h1')].filter(sichtbar);
    if (titel.length !== 1 || !titel[0].textContent.trim()) return { code: 'eingabefeld_fehlt' };
    const name = titel[0].textContent.trim();
    const labels = [`Neuer Chat in ${name}`, `New chat in ${name}`];
    const kandidaten = [...document.querySelectorAll('main [contenteditable="true"][role="textbox"], main #prompt-textarea.ProseMirror[contenteditable="true"]')]
      .filter(el => sichtbar(el) && labels.includes(el.getAttribute('aria-label')));
    if (kandidaten.length !== 1) return { code: 'eingabefeld_fehlt' };
    const editor = kandidaten[0];
    const form = editor.closest('form') || editor.closest('[data-type="unified-composer"]') || document.querySelector('main');
    const anhaenge = Boolean(form.querySelector('img, video, audio, canvas') || [...form.querySelectorAll('input[type="file"]')].some(e => e.files?.length));
    return { editor, form, anhaenge };
  }
  function textVon(editor) {
    // Absatzaussenabstaende duerfen im Readback keine zusaetzlichen Leerzeilen erfinden.
    if (editor.classList.contains('ProseMirror') && editor.children.length && [...editor.children].every(el => el.tagName === 'P')) {
      function inhalt(node) {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeName === 'BR') return node.classList?.contains('ProseMirror-trailingBreak') ? '' : '\n';
        return [...node.childNodes].map(inhalt).join('');
      }
      return [...editor.children].map(p => p.childNodes.length === 1 && p.firstChild.nodeName === 'BR' ? '' : inhalt(p)).join('\n');
    }
    return String(editor.innerText ?? editor.textContent ?? '').replace(/\r\n?/g, '\n');
  }
  function sendenBereit(form) {
    const labels = ['Prompt senden', 'Nachricht senden', 'Senden', 'Send prompt', 'Send message', 'Send'];
    const buttons = [...form.querySelectorAll('button')].filter(b => sichtbar(b)
      && (b.getAttribute('data-testid') === 'send-button' || labels.includes(b.getAttribute('aria-label'))));
    return buttons.length === 1 && !buttons[0].disabled && buttons[0].getAttribute('aria-disabled') !== 'true';
  }
  async function melde(ok, code) {
    if (!auftrag) return null;
    return chrome.runtime.sendMessage({ kanal: 'empfaenger', aktion: 'ergebnis', id: auftrag.id, token: auftrag.token, ok, ...(code ? { code } : {}) });
  }
  chrome.runtime.onMessage.addListener((m, sender) => {
    if (sender.id === chrome.runtime.id && !sender.tab && m?.kanal === 'empfaenger' && m.aktion === 'abbrechen'
      && m.id === auftrag?.id && m.token === auftrag?.token) abgebrochen = true;
  });
  window.addEventListener('pagehide', () => { abgebrochen = true; });
  async function lauf() {
    const meta = await chrome.runtime.sendMessage({ kanal: 'empfaenger', aktion: 'bereit' });
    if (meta?.status !== 'wartet' || !L.UUID.test(meta.id || '') || !L.UUID.test(meta.token || '') || meta.ziel !== location.href) return;
    auftrag = meta;
    const ende = Math.min(meta.bis, Date.now() + 25000);
    let u;
    while (Date.now() < ende && !abgebrochen) {
      u = umgebung();
      if (u.editor || ['offline', 'abgebrochen'].includes(u.code)) break;
      await pause(150);
    }
    if (!u?.editor) { await melde(false, u?.code || 'eingabefeld_fehlt'); return; }
    if (!L.feldLeer(textVon(u.editor), u.anhaenge)) { await melde(false, 'entwurf_vorhanden'); return; }
    // Noch einmal beim Worker pruefen: Cancel/TTL waehrend des Ladens muss vor jeder DOM-Aenderung greifen.
    const inhalt = await chrome.runtime.sendMessage({ kanal: 'empfaenger', aktion: 'holen', id: meta.id, token: meta.token });
    const frisch = umgebung();
    if (inhalt?.status !== 'einsetzen' || inhalt.id !== meta.id || inhalt.token !== meta.token || inhalt.ziel !== meta.ziel || typeof inhalt.text !== 'string'
      || !frisch.editor || frisch.editor !== u.editor || Date.now() >= inhalt.bis || abgebrochen) {
      await melde(false, abgebrochen ? 'abgebrochen' : (frisch.code || 'nicht_eingefuegt'));
      return;
    }
    if (!L.feldLeer(textVon(frisch.editor), frisch.anhaenge)) { await melde(false, 'entwurf_vorhanden'); return; }
    const editor = frisch.editor;
    const text = inhalt.text;
    editor.focus();
    // insertText verwendet den nativen Bearbeitungspfad, damit auch Lexical/React den Text uebernimmt.
    // Der Text bleibt ein Literal; keine HTML-Auswertung und keine Zwischenablage.
    const auswahl = window.getSelection();
    const bereich = document.createRange();
    bereich.selectNodeContents(editor);
    auswahl.removeAllRanges(); auswahl.addRange(bereich);
    let eingefuegt = false;
    try { eingefuegt = document.execCommand('insertText', false, text); } catch { /* Nur ProseMirror hat unten einen beobachteten DOM-Weg. */ }
    if (!eingefuegt && L.feldLeer(textVon(editor)) && editor.classList.contains('ProseMirror')) {
      const fragment = document.createDocumentFragment();
      for (const zeile of text.split('\n')) {
        const p = document.createElement('p');
        p.appendChild(zeile ? document.createTextNode(zeile) : document.createElement('br'));
        fragment.appendChild(p);
      }
      editor.replaceChildren(fragment);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    // Hintergrundtabs pausieren rAF; trotzdem zeitnah den wirklich vorhandenen Text pruefen.
    await Promise.race([
      new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))),
      pause(350),
    ]);
    await pause(150);
    const nachher = umgebung();
    if (abgebrochen || !nachher.editor || nachher.editor !== editor) { await melde(false, 'abgebrochen'); return; }
    if (!L.gleicherText(textVon(editor), text) || !sendenBereit(nachher.form)) { await melde(false, 'nicht_eingefuegt'); return; }
    await melde(true);
  }
  lauf().catch(() => { melde(false, 'nicht_eingefuegt').catch(() => {}); });
})();
