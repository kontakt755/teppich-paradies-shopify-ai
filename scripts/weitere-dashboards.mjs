/**
 * "Weitere Dashboards": Adressen von Werkbank, Laden-Ansicht und Montage-App.
 *
 * Alle drei sind eigene Anwendungen mit eigener Anmeldung (Werkbank: privates claude.ai-Artefakt,
 * Laden und Montage: Auftrags-App in Google Apps Script). Ihre Adressen gehoeren nicht ins
 * Repository (es ist oeffentlich) - sie stehen wie der Shopify-Zugang in `.env.local` im Ordner
 * des Dienstes (gitignored) oder als Umgebungsvariable:
 *
 *   WERKBANK_URL=https://claude.ai/artifact/<id>
 *   AUFTRAGS_APP_URL=https://script.google.com/macros/s/<Deployment-ID>/exec
 *
 * Laden = AUFTRAGS_APP_URL mit `?ansicht=laden`, Montage = AUFTRAGS_APP_URL selbst. Fehlt
 * AUFTRAGS_APP_URL, gilt die Adresse aus LADEN_ZAHLEN_URL (dieselbe App, siehe laden-zahlen.mjs).
 * Angenommen wird nur https; fehlt eine Adresse oder ist sie keine, liefert die Funktion null und
 * die Oberflaeche zeigt den Link nicht. Die Datei wird bei jedem Aufruf neu gelesen - ein Eintrag
 * wirkt ohne Neustart.
 */
import path from 'node:path';
import { ladeEnvLocal } from '../operations/sync/zugang.mjs';

/** Werte aus Umgebung und `.env.local` (Umgebung gewinnt); TP_ENV_LOCAL nennt eine andere Datei. */
export function umgebungswerte({ root, env = process.env } = {}) {
  const datei = env.TP_ENV_LOCAL || path.join(root || process.cwd(), '.env.local');
  return { ...ladeEnvLocal(datei), ...env };
}

/** https-Adresse ohne Anfrage und Anker, sonst null. */
export function httpsBasis(roh) {
  const text = String(roh || '').trim();
  if (!text) return null;
  let u;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  u.search = '';
  u.hash = '';
  return u.toString();
}

/** Adresse der Auftrags-App (ohne Parameter) - AUFTRAGS_APP_URL, sonst LADEN_ZAHLEN_URL. */
export function auftragsAppBasis(werte) {
  return httpsBasis(werte.AUFTRAGS_APP_URL) || httpsBasis(werte.LADEN_ZAHLEN_URL);
}

/** Laden-Ansicht der Auftrags-App (ohne Schluessel). */
export function ladenAnsichtUrl(basis) {
  if (!basis) return null;
  const u = new URL(basis);
  u.searchParams.set('ansicht', 'laden');
  return u.toString();
}

/**
 * Die drei Links fuer die Navigation. Werkbank behaelt ihre Adresse samt Parametern (ein
 * Artefakt-Link kann welche tragen); nur das Protokoll wird geprueft.
 * @returns {{ werkbank: string|null, laden: string|null, montage: string|null }}
 */
export function dashboardLinks({ root, env = process.env } = {}) {
  const werte = umgebungswerte({ root, env });
  let werkbank = null;
  try {
    const u = new URL(String(werte.WERKBANK_URL || '').trim());
    if (u.protocol === 'https:') werkbank = u.toString();
  } catch { /* keine oder keine gueltige Adresse */ }
  const app = auftragsAppBasis(werte);
  return { werkbank, laden: ladenAnsichtUrl(app), montage: app };
}
