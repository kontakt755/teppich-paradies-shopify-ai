/**
 * Hash-Routen (#/ansicht?parameter): erlaubte Ansichten, Rollenpruefung, Navigation.
 *
 * Eine neue Ansicht braucht hier zwei Eintraege: den Namen in parseRoute() und - falls sie
 * dem Inhaber vorbehalten ist - eine Zeile in ANSICHT_ROLLEN.
 */
import { state } from './zustand.mjs';

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
  const bekannt = ['heute', 'arbeit', 'freigaben', 'bereiche', 'insights', 'aktivitaet', 'einkauf', 'kunden', 'lexikon', 'ratgeber', 'hilfe', 'shopwache', 'organisation', 'fotos', 'sonderposten', 'team'].includes(path) ? path : 'heute';
  const view = darfAnsicht(bekannt) ? bekannt : 'heute';
  state.route = { view, params: new URLSearchParams(query) };
}
export function navigate(view, params = {}, { keepTask = false } = {}) {
  const p = new URLSearchParams(params);
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
  if (key === 'lq') p.delete('lseite');
  if (key !== 'view' && key !== 'task' && p.get('view') && ['status'].includes(key)) p.delete('view');
  location.hash = `#/${state.route.view}?${p}`;
}
