/**
 * Hash-Routen (#/ansicht?parameter): erlaubte Ansichten, Rollenpruefung, Navigation.
 *
 * Eine neue Ansicht braucht hier zwei Eintraege: den Namen in parseRoute() und - falls sie
 * dem Inhaber vorbehalten ist - eine Zeile in ANSICHT_ROLLEN.
 */
import { state } from './zustand.mjs';
import { verbergeSuchbegriffe } from '../lib/suchverweis.mjs';
import { NACHFRAGE_MAILS_HREF } from '../lib/nachfrage-mails.mjs';

/**
 * Welche Ansicht gehoert wem. Das Ausblenden lief bisher nur ueber CSS an den
 * Nav-Links - ueber die Befehlspalette, ein Lesezeichen oder den Datenstand-Chip
 * landete ein Mitarbeiter trotzdem in der Entwicklungsansicht. Entschieden wird
 * weiterhin serverseitig; hier geht es um eine ruhige, ehrliche Oberflaeche.
 */
const ANSICHT_ROLLEN = {
  arbeit: 'inhaber', freigaben: 'inhaber', bereiche: 'inhaber',
  insights: 'inhaber', aktivitaet: 'inhaber', team: 'inhaber',
  // Shop-Wache und Ratgeber sind Website-Arbeit: Erreichbarkeit von Seiten,
  // Ladezeiten, Texte fuer den Shop. Das Team hat damit nichts zu tun.
  shopwache: 'inhaber', ratgeber: 'inhaber',
  // Akquise (#1447) ist seit 2026-10-20 fuer Mitarbeiter offen; "lesen" schreibt nichts (Server).
};

export function darfAnsicht(view) {
  const noetig = ANSICHT_ROLLEN[view];
  if (!noetig) return true;
  const rolle = state.session?.benutzer?.rolle;
  return !rolle || rolle === 'inhaber';        // ohne Anmeldung gilt der Notzugang
}

export function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const bekannt = ['heute', 'prozesse', 'arbeit', 'freigaben', 'bereiche', 'insights', 'aktivitaet', 'einkauf', 'kunden', 'lexikon', 'ratgeber', 'hilfe', 'shopwache', 'organisation', 'fotos', 'sonderposten', 'akquise', 'hausverwaltungen', 'bildrechte', 'social', 'team'].includes(path) ? path : 'heute';
  const view = darfAnsicht(bekannt) ? bekannt : 'heute';
  const params = new URLSearchParams(query);
  // Nachfrage-Mails stehen seit 07.11.2026 unter Kunden › Kunden nach Produkt fragen (w-284) - alte
  // Links und Lesezeichen #/heute?mn=1 landen dort statt auf einer Heute-Seite ohne Karte.
  if (path === 'heute' && params.get('mn') && darfAnsicht('kunden')) {
    history.replaceState(history.state, '', NACHFRAGE_MAILS_HREF);
    state.route = { view: 'kunden', params: new URLSearchParams(NACHFRAGE_MAILS_HREF.split('?')[1]) };
    return;
  }
  // Alter Link mit Suchbegriff im Klartext: Wert uebernehmen und aus der Adresse nehmen (w-266).
  if (verbergeSuchbegriffe(params)) history.replaceState(history.state, '', `#/${path}${params.toString() ? `?${params}` : ''}`);
  state.route = { view, params };
}
export function navigate(view, params = {}, { keepTask = false } = {}) {
  const p = new URLSearchParams(params);
  verbergeSuchbegriffe(p);
  if (keepTask && state.route.params.get('task')) p.set('task', state.route.params.get('task'));
  const q = p.toString();
  location.hash = `#/${view}${q ? `?${q}` : ''}`;
}
export function openTask(number) {
  const p = new URLSearchParams(state.route.params); p.set('task', String(number));
  location.hash = `#/${state.route.view}?${p}`;
}
export function closeTask() {
  state.sheetOffenFuer = null;
  const p = new URLSearchParams(state.route.params); p.delete('task');
  const q = p.toString();
  location.hash = `#/${state.route.view}${q ? `?${q}` : ''}`;
}

export function setParam(key, value) {
  const p = new URLSearchParams(state.route.params);
  if (value === '' || value === null) p.delete(key); else p.set(key, value);
  // Ein neuer Filter beginnt wieder auf Seite 1 - sonst landet man auf einer leeren Seite.
  if (['psfilter', 'gruppe', 'psq'].includes(key)) p.delete('seite');
  if (key === 'lq' || key === 'lampel') p.delete('lseite');
  if (['bl', 'bg'].includes(key)) p.delete('bs');
  if (['bq', 'bfilter', 'bsort', 'bdir', 'bart'].includes(key)) p.delete('bseite');
  if (key === 'blf') p.delete('bls');
  if (key === 'blq') p.delete('blp');
  if (key !== 'view' && key !== 'task' && p.get('view') && ['status'].includes(key)) p.delete('view');
  verbergeSuchbegriffe(p);
  location.hash = `#/${state.route.view}?${p}`;
}
