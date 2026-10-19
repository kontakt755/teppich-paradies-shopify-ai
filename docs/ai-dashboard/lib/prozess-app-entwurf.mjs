import { pruefeProzesslink } from './prozesslinks.mjs';

/** Konservative Grenze fuer den vollstaendig kodierten App-Link, ohne Kuerzung. */
export const APP_ENTWURF_LINK_MAX = 12000;
const UNERLAUBTE_TEXTZEICHEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const FEHLERTEXTE = Object.freeze({
  ziel_nicht_unterstuetzt: 'Dieses Ziel unterstützt keine direkte Übergabe in einen neuen App-Entwurf.',
  text_leer: 'Bitte zuerst Angaben für die Übergabe eintragen.',
  text_ungueltig: 'Die Angaben enthalten Zeichen, die nicht unverändert übergeben werden können.',
  text_zu_lang: 'Die Angaben sind für die direkte App-Übergabe zu lang. Bitte den manuellen Weg verwenden.',
});

export class AppEntwurfsFehler extends Error {
  constructor(code) {
    super(Object.hasOwn(FEHLERTEXTE, code) ? FEHLERTEXTE[code] : 'Die App-Übergabe ist nicht möglich.');
    this.name = 'AppEntwurfsFehler';
    this.code = code;
  }
}

function unterstuetztesZiel(anbieter, ziel) {
  let url;
  try {
    // Gespeicherte Ziele bleiben reine Navigation. Prompt-Parameter sind dort
    // weiterhin verboten; nur diese fluechtige Funktion fuegt einen Text hinzu.
    const geprueft = pruefeProzesslink(anbieter, ziel);
    if (!geprueft) return null;
    url = new URL(geprueft);
  } catch { return null; }

  if (anbieter === 'codex' && url.protocol === 'codex:'
    && ((url.hostname === 'new' && url.pathname === '')
      || (url.hostname === 'threads' && url.pathname === '/new'))) {
    return { url, beschreibung: { anbieter, art: 'codex', hatProjekt: url.searchParams.has('path') || url.searchParams.has('originUrl') } };
  }
  if (anbieter === 'claude' && url.protocol === 'claude:' && url.pathname === '/new') {
    if (url.hostname === 'code') return { url, beschreibung: { anbieter, art: 'claude-code', hatProjekt: true } };
    if (url.hostname === 'claude.ai') return { url, beschreibung: { anbieter, art: 'claude-chat', hatProjekt: false } };
  }
  return null;
}

/** Metadaten nur fuer dokumentierte neue App-Chats, nie vorhandene Chats/Cloud-Projekte. */
export function appEntwurfZiel(anbieter, ziel) {
  return unterstuetztesZiel(anbieter, ziel)?.beschreibung || null;
}

function vollstaendigerUnicode(text) {
  for (let i = 0; i < text.length; i++) {
    const zeichen = text.charCodeAt(i);
    if (zeichen >= 0xd800 && zeichen <= 0xdbff) {
      const folgendes = text.charCodeAt(++i);
      if (!(folgendes >= 0xdc00 && folgendes <= 0xdfff)) return false;
    } else if (zeichen >= 0xdc00 && zeichen <= 0xdfff) return false;
  }
  return true;
}

/** Reiner, fluechtiger Entwurfslink; kein Speichern, API-Aufruf oder Start der App. */
export function baueAppEntwurfslink(anbieter, ziel, text) {
  const treffer = unterstuetztesZiel(anbieter, ziel);
  if (!treffer) throw new AppEntwurfsFehler('ziel_nicht_unterstuetzt');
  if (typeof text !== 'string' || !text.trim()) throw new AppEntwurfsFehler('text_leer');
  // Schon die unkodierte Laenge ist eine sichere Untergrenze fuer den fertigen Link.
  if (text.length > APP_ENTWURF_LINK_MAX) throw new AppEntwurfsFehler('text_zu_lang');
  if (UNERLAUBTE_TEXTZEICHEN.test(text) || !vollstaendigerUnicode(text)) throw new AppEntwurfsFehler('text_ungueltig');
  treffer.url.searchParams.set(anbieter === 'codex' ? 'prompt' : 'q', text);
  // Native Handler bekommen die dokumentierte encodeURIComponent-Schreibweise.
  // Echte Pluszeichen sind durch URLSearchParams bereits als %2B kodiert.
  const link = treffer.url.href.replace(/\+/g, '%20');
  if (link.length > APP_ENTWURF_LINK_MAX) throw new AppEntwurfsFehler('text_zu_lang');
  return link;
}
