/**
 * Ansicht "Team · Zugaenge" (#/team, nur Inhaber): Zugaenge anlegen, Rolle aendern, sperren,
 * Passwort setzen - und der Dialog "Mein Passwort" aus der Kopfzeile.
 */
import { $, esc, toast } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';

// -- Team: Zugaenge fuer Mitarbeiter ----------------------------------------

/**
 * Bisher gab es Zugaenge nur ueber ein Terminal-Skript - entsprechend gab es
 * bis heute keinen einzigen. Ohne Zugaenge laeuft alles als "Inhaber": jede
 * Rechteregelung ist wirkungslos und im Protokoll steht nie, wer etwas getan hat.
 */
const team = { daten: null, loading: false };

const ROLLEN_TEXT = {
  inhaber: 'Inhaber – sieht und darf alles, verwaltet Zugänge',
  mitarbeiter: 'Mitarbeiter – Kunden, Bestellungen, Aufgaben, Fotos',
  lesen: 'Nur lesen – darf nichts ändern',
};

function ensureTeam() {
  if (team.daten || team.loading) return;
  team.loading = true;
  fetchEinkauf('/api/team/liste').then(d => { team.daten = d; })
    .catch(err => { team.daten = { verfuegbar: false, hinweis: err.message, benutzer: [] }; })
    .finally(() => { team.loading = false; render(); });
}

export function viewTeam() {
  ensureTeam();
  const d = team.daten;
  if (!d) return `<div class="page-head"><h1>Team</h1></div><div class="empty">Lade …</div>`;
  if (d.fehler) return `<div class="page-head"><h1>Team</h1></div>${stoerungState(d, 'Die Zugangsliste')}`;
  if (!d.verfuegbar) return `<div class="page-head"><h1>Team</h1></div>${emptyState('Nicht verfügbar.', d.hinweis || 'Nur der Inhaber darf Zugänge verwalten.')}`;

  const hinweis = !d.eingerichtet
    ? `<div class="notice warn" style="margin-bottom:16px"><strong>Noch keine Zugänge.</strong>
        Solange niemand angelegt ist, arbeitet jeder am Dashboard als „Inhaber“ – im Protokoll steht
        dann nicht, wer etwas gemacht hat, und niemand kann eingeschränkt werden.
        Lege dich selbst als Inhaber an und deine Mitarbeiter als „Mitarbeiter“.</div>`
    : '';

  const liste = d.benutzer.length
    ? `<div class="rows">${d.benutzer.map(b => `<div class="row${b.aktiv ? '' : ' fertig'}">
        <div>
          <div class="t">${esc(b.name)} ${b.aktiv ? '' : '<span class="badge plain">gesperrt</span>'}</div>
          <div class="m">Anmeldename: <span class="mono">${esc(b.kuerzel)}</span> · ${esc(ROLLEN_TEXT[b.rolle] || b.rolle)}</div>
        </div>
        <div class="r">
          <select data-team-rolle="${esc(b.kuerzel)}" aria-label="Rolle von ${esc(b.name)}">
            ${d.rollen.map(r => `<option value="${esc(r)}"${r === b.rolle ? ' selected' : ''}>${esc(r === 'inhaber' ? 'Inhaber' : r === 'mitarbeiter' ? 'Mitarbeiter' : 'Nur lesen')}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm" data-team-passwort="${esc(b.kuerzel)}">Neues Passwort</button>
          <button type="button" class="btn btn-sm" data-team-sperren="${esc(b.kuerzel)}" data-aktiv="${b.aktiv}">${b.aktiv ? 'Sperren' : 'Entsperren'}</button>
        </div>
      </div>`).join('')}</div>`
    : emptyState('Noch niemand angelegt.', 'Mit „+ Zugang anlegen“ anfangen.');

  return `<div class="page-head">
      <div><h1>Team</h1><p class="sub">Wer darf womit arbeiten. Passwörter sieht niemand – auch du nicht.</p></div>
      <div class="head-actions"><button type="button" class="btn btn-primary" data-team-neu>+ Zugang anlegen</button></div>
    </div>
    ${hinweis}
    ${liste}
    <h2 style="margin:24px 0 8px">Was die Rollen dürfen</h2>
    <div class="rows">
      <div class="row"><div><div class="t">Inhaber</div><div class="m">Alles – dazu Entwicklung, Freigaben, Auswertungen und diese Seite.</div></div></div>
      <div class="row"><div><div class="t">Mitarbeiter</div><div class="m">Kunden, Bestellungen, Aufgaben, Notizen, Baustellenfotos, Lexikon und Einkauf. Nicht: Zugänge, Entwicklung, Freigaben.</div></div></div>
      <div class="row"><div><div class="t">Nur lesen</div><div class="m">Sieht dieselben Seiten wie ein Mitarbeiter, kann aber nichts ändern – für Aushilfen oder zum Zuschauen.</div></div></div>
    </div>`;
}

async function teamSchreiben(nutzlast, meldung) {
  try {
    const d = await orgSchreiben('/api/team/aendern', nutzlast);
    team.daten = d;
    toast(meldung);
    render();
  } catch (err) { toast(`Fehler: ${err.message}`, 'crit'); }
}

function openTeamNeu() {
  const root = $('#dialogRoot');
  // Der erste Zugang muss der eigene sein: sobald ein Zugang existiert,
  // verlangt jede Seite eine Anmeldung. Wer hier mit einem Mitarbeiter
  // anfaengt, steht selbst vor der Tuer.
  const erster = team.daten?.eingerichtet === false;
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Zugang anlegen" style="max-width:520px">
    <h2>${erster ? 'Dein eigener Zugang' : 'Zugang anlegen'}</h2>
    ${erster ? `<div class="notice warn" style="margin-bottom:12px">Der erste Zugang ist deiner, als <strong>Inhaber</strong>.
      Ab dann verlangt das Dashboard eine Anmeldung – du musst dich einmal mit diesem Namen und Passwort neu anmelden.
      Danach legst du hier deine Mitarbeiter an.</div>` : ''}
    <p class="small muted">Das Passwort vergibst du und gibst es der Person weiter. Danach ist es nicht mehr einsehbar – nur neu setzbar.</p>
    <label class="small" for="tmName">Name</label>
    <input type="text" id="tmName" placeholder="z. B. Ben Beispiel" style="width:100%;box-sizing:border-box;margin:4px 0 10px">
    <label class="small" for="tmKuerzel">Anmeldename <span class="muted">(kurz, ohne Leerzeichen)</span></label>
    <input type="text" id="tmKuerzel" placeholder="z. B. ben" autocapitalize="off" style="width:100%;box-sizing:border-box;margin:4px 0 10px">
    <label class="small" for="tmRolle">Rolle</label>
    <select id="tmRolle"${erster ? ' disabled' : ''} style="width:100%;box-sizing:border-box;margin:4px 0 10px">
      ${erster ? '<option value="inhaber">Inhaber – alles, auch Zugänge</option>' : `
      <option value="mitarbeiter">Mitarbeiter – Kunden, Bestellungen, Aufgaben</option>
      <option value="lesen">Nur lesen – darf nichts ändern</option>
      <option value="inhaber">Inhaber – alles, auch Zugänge</option>`}
    </select>
    <label class="small" for="tmPasswort">Passwort <span class="muted">(mindestens 8 Zeichen)</span></label>
    <input type="password" id="tmPasswort" style="width:100%;box-sizing:border-box;margin:4px 0 12px">
    <div class="dialog-actions">
      <button type="button" class="btn" data-close-dialog>Abbrechen</button>
      <button type="button" class="btn btn-primary" id="tmAnlegen">Anlegen</button>
    </div>
  </div></div>`;
  $('#tmName')?.focus();
  root.addEventListener('click', async (e) => {
    if (!e.target.closest('#tmAnlegen')) return;
    const nutzlast = {
      was: 'anlegen',
      name: $('#tmName').value.trim(),
      kuerzel: $('#tmKuerzel').value.trim(),
      rolle: erster ? 'inhaber' : $('#tmRolle').value,
      passwort: $('#tmPasswort').value,
    };
    if (!nutzlast.name || !nutzlast.kuerzel) { toast('Name und Anmeldename sind nötig', 'crit'); return; }
    if (nutzlast.passwort.length < 8) { toast('Das Passwort braucht mindestens 8 Zeichen', 'crit'); return; }
    root.innerHTML = '';
    await teamSchreiben(nutzlast, erster
      ? 'Angelegt – bitte einmal neu anmelden'
      : `${nutzlast.name} kann sich jetzt anmelden`);
    if (erster) {
      // Ab jetzt ist die Anmeldung Pflicht; ohne diesen Schritt sieht der
      // Inhaber ab dem naechsten Klick nur noch Fehler.
      setTimeout(() => { location.href = '/login'; }, 1200);
    }
  });
}

/** Eigenes Passwort - erreichbar fuer jeden Angemeldeten, nicht nur den Inhaber. */
export function openMeinPasswort() {
  const root = $('#dialogRoot');
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Mein Passwort" style="max-width:480px">
    <h2>Mein Passwort ändern</h2>
    <p class="small muted">Danach meldest du dich mit dem neuen Passwort an. Niemand sonst sieht es.</p>
    <label class="small" for="mpAlt">Bisheriges Passwort</label>
    <input type="password" id="mpAlt" style="width:100%;box-sizing:border-box;margin:4px 0 10px">
    <label class="small" for="mpNeu">Neues Passwort <span class="muted">(mindestens 8 Zeichen)</span></label>
    <input type="password" id="mpNeu" style="width:100%;box-sizing:border-box;margin:4px 0 12px">
    <div class="dialog-actions">
      <button type="button" class="btn" data-close-dialog>Abbrechen</button>
      <button type="button" class="btn btn-primary" id="mpSetzen">Ändern</button>
    </div>
  </div></div>`;
  $('#mpAlt')?.focus();
  // Der Zuhoerer gehoert an den Dialog, nicht an #dialogRoot: root bleibt
  // bestehen, wenn sein innerHTML ersetzt wird. Beim zweiten Oeffnen haengen
  // sonst zwei Zuhoerer daran - der erste noch mit den Daten des ersten
  // Dialogs. Die anderen Dialoge in dieser Datei binden aus demselben Grund
  // an das <form>, das jedes Mal neu entsteht.
  root.querySelector('.dialog').addEventListener('click', async (e) => {
    if (!e.target.closest('#mpSetzen')) return;
    const alt = $('#mpAlt').value;
    const neu = $('#mpNeu').value;
    if (neu.length < 8) { toast('Das neue Passwort braucht mindestens 8 Zeichen', 'crit'); return; }
    try {
      await orgSchreiben('/api/mein-passwort', { alt, neu });
      root.innerHTML = '';
      toast('Passwort geändert – beim nächsten Anmelden gilt das neue');
    } catch (err) { toast(`Fehler: ${err.message}`, 'crit'); }
  });
}

function openTeamPasswort(kuerzel) {
  const root = $('#dialogRoot');
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Neues Passwort" style="max-width:480px">
    <h2>Neues Passwort für ${esc(kuerzel)}</h2>
    <p class="small muted">Das alte gilt sofort nicht mehr. Gib das neue persönlich weiter.</p>
    <label class="small" for="tmPw2">Neues Passwort <span class="muted">(mindestens 8 Zeichen)</span></label>
    <input type="password" id="tmPw2" style="width:100%;box-sizing:border-box;margin:4px 0 12px">
    <div class="dialog-actions">
      <button type="button" class="btn" data-close-dialog>Abbrechen</button>
      <button type="button" class="btn btn-primary" id="tmPwSetzen">Setzen</button>
    </div>
  </div></div>`;
  $('#tmPw2')?.focus();
  // Siehe openMeinPasswort: an den Dialog binden, nicht an #dialogRoot. Sonst
  // setzt der Inhaber beim zweiten Zugang in Folge das Passwort des ersten
  // gleich mit - der alte Zuhoerer haelt dessen Kuerzel noch fest.
  root.querySelector('.dialog').addEventListener('click', async (e) => {
    if (!e.target.closest('#tmPwSetzen')) return;
    const passwort = $('#tmPw2').value;
    if (passwort.length < 8) { toast('Das Passwort braucht mindestens 8 Zeichen', 'crit'); return; }
    root.innerHTML = '';
    await teamSchreiben({ was: 'passwort', kuerzel, passwort }, 'Passwort gesetzt');
  });
}

/** Team: Zugang anlegen, Passwort setzen, sperren/entsperren. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function teamKlick(e) {
  const tn = e.target.closest('[data-team-neu]');
  if (tn) { e.preventDefault(); openTeamNeu(); return true; }
  const tp = e.target.closest('[data-team-passwort]');
  if (tp) { e.preventDefault(); openTeamPasswort(tp.dataset.teamPasswort); return true; }
  const ts = e.target.closest('[data-team-sperren]');
  if (ts) {
    e.preventDefault();
    const aktiv = ts.dataset.aktiv === 'true';
    teamSchreiben({ was: aktiv ? 'sperren' : 'entsperren', kuerzel: ts.dataset.teamSperren },
      aktiv ? 'Zugang gesperrt' : 'Zugang wieder frei');
    return true;
  }
  return false;
}

/** Team: Rolle aendern. */
export function teamAenderung(e) {
  const tr = e.target.closest('select[data-team-rolle]');
  if (tr) { teamSchreiben({ was: 'rolle', kuerzel: tr.dataset.teamRolle, rolle: tr.value }, 'Rolle geändert'); return true; }
  return false;
}
