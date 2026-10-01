/**
 * Ansicht "Aufgaben" (#/organisation): Liste, Detail, Block auf "Heute" und alles, was
 * dort geklickt, geaendert oder getippt wird. Teilmodule in ansichten/organisation/.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, toast } from '../kern/helfer.mjs';
import { orgSchreiben } from '../kern/api.mjs';
import { navigate } from '../kern/router.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, bandItem } from '../bausteine/karten.mjs';
import {
  org, ORG_BEREICHE, ORG_ANSICHTEN, ORG_ANSICHTEN_HAUPT, ORG_DRINGLICHKEIT, ORG_STATUS_LABEL,
  ORG_PRIO_LABEL, ORG_PRIO_WAHL, ORG_WIEDERHOLUNG_LABEL, ORG_PRUEF_LABEL, orgParams,
  orgEintragOeffnen, ensureOrgListe, ensureOrgKennzahlen, ensureOrgDetail, orgFrisch, orgZeile,
} from './organisation/gemeinsam.mjs';
import { openOrgFuerChatGPT, openOrgSchnell, openOrgListe } from './organisation/dialoge.mjs';

// -- Detailansicht ----------------------------------------------------------

function orgDetailAnsicht(id) {
  ensureOrgDetail(id);
  const zurueck = `<p style="margin:0 0 12px"><a href="#" data-org-zurueck>← Zurück zur Liste</a></p>`;
  const d = org.detailId === id ? org.detail : null;
  if (!d) return zurueck + `<div class="empty">Lade Eintrag …</div>`;
  if (!d.verfuegbar) return zurueck + emptyState('Nicht gefunden.', d.hinweis || '');
  const e = d.eintrag;
  const team = org.liste?.team || [];
  const bereiche = org.liste?.bereiche || [];
  const feld = (label, inhalt) => `<div><span class="small muted">${esc(label)}</span><div>${inhalt}</div></div>`;
  const auswahl = (name, werte, aktiv) => `<select data-org-feld="${name}" data-org-id="${esc(e.id)}">
    ${werte.map(([w, l]) => `<option value="${esc(w)}"${w === aktiv ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

  return zurueck + `
    <div class="page-head"><div>${d.darfAendern
      ? `<input type="text" class="titel-feld" value="${esc(e.titel)}" data-org-feld="titel" data-org-id="${esc(e.id)}" aria-label="Titel ändern">`
      : `<h1>${esc(e.titel)}</h1>`}
      <p class="sub">${esc(e.typ === 'TASK' ? 'Aufgabe' : 'Notiz')}${e.bereich ? ` · ${esc(e.bereich)}` : ''} · angelegt von ${esc(e.besitzer)} am ${esc(fmtDate(e.erstelltAm))}</p></div></div>

    ${d.darfAendern
      // Bisher liess sich ein Tippfehler im Text nie mehr korrigieren, obwohl
      // die Fachlogik titel, beschreibung, erfolgskriterium und wartetAuf
      // ausdruecklich annimmt.
      ? `<section class="card" style="margin-bottom:14px">
          <label class="small muted" for="orgBeschr">Beschreibung – was genau gemeint ist</label>
          <textarea id="orgBeschr" rows="4" style="width:100%;box-sizing:border-box;margin-top:4px"
            data-org-feld="beschreibung" data-org-id="${esc(e.id)}"
            placeholder="Worum geht es, warum steht es an, woran sieht man, dass es fertig ist?">${esc(e.beschreibung || '')}</textarea>
          <label class="small muted" for="orgKrit" style="display:block;margin-top:10px">Woran sieht man, dass es erledigt ist?</label>
          <input type="text" id="orgKrit" style="width:100%;box-sizing:border-box;margin-top:4px"
            data-org-feld="erfolgskriterium" data-org-id="${esc(e.id)}" value="${esc(e.erfolgskriterium || '')}">
        </section>`
      : (e.beschreibung ? `<section class="card" style="margin-bottom:14px"><p style="white-space:pre-wrap">${esc(e.beschreibung)}</p></section>` : '')}

    <section class="card" style="margin-bottom:14px">
      <div class="bq-weitere">
        ${feld('Status', d.darfAendern ? auswahl('status', Object.entries(ORG_STATUS_LABEL), e.status) : esc(ORG_STATUS_LABEL[e.status]))}
        ${feld('Dringlichkeit', d.darfAendern ? auswahl('prioritaet', Object.entries(ORG_PRIO_WAHL), e.prioritaet) : esc(ORG_PRIO_LABEL[e.prioritaet]))}
        ${feld('Verantwortlich', d.darfAendern
          ? auswahl('verantwortlich', [['', 'unzugewiesen'], ...team.map(t => [t.kuerzel, t.name])], e.verantwortlich || '')
          : esc(e.verantwortlich || 'unzugewiesen'))}
        ${feld('Bereich', d.darfAendern
          ? auswahl('bereich', [['', 'keiner'], ...bereiche.map(b => [b, b])], e.bereich || '')
          : esc(e.bereich || '–'))}
        ${feld('Fällig', d.darfAendern
          ? `<input type="date" data-org-feld="faellig" data-org-id="${esc(e.id)}" value="${esc(e.faellig || '')}">`
          : (e.faellig ? esc(fmtDate(e.faellig)) : '–'))}
        ${feld('Wartet auf', d.darfAendern
          ? `<input type="text" data-org-feld="wartetAuf" data-org-id="${esc(e.id)}" value="${esc(e.wartetAuf || '')}" placeholder="z. B. Antwort vom Lieferanten" style="width:100%;box-sizing:border-box">`
          : esc(e.wartetAuf || '–'))}
        ${feld('Prüfart', d.darfAendern ? auswahl('pruefTyp', Object.entries(ORG_PRUEF_LABEL), e.pruefTyp) : esc(ORG_PRUEF_LABEL[e.pruefTyp]))}
        ${feld('Wiederholung', d.darfAendern
          ? auswahl('wiederholungRegel', Object.entries(ORG_WIEDERHOLUNG_LABEL), e.wiederholung?.regel || '')
          : esc(ORG_WIEDERHOLUNG_LABEL[e.wiederholung?.regel || ''] || 'einmalig'))}
        ${e.wartetAuf ? feld('Warten auf', `${esc(e.wartetAuf)}${e.wartetSeit ? ` <span class="small muted">seit ${esc(fmtDate(e.wartetSeit))}</span>` : ''}`) : ''}
        ${e.erledigtAm ? feld('Erledigt am', esc(fmtDateTime(e.erledigtAm))) : ''}
      </div>
      ${e.erfolgskriterium ? `<p class="small" style="margin:10px 0 0"><b>Erfolgskriterium:</b> ${esc(e.erfolgskriterium)}</p>` : ''}
      ${e.verknuepft ? `<p class="small" style="margin:6px 0 0"><b>Gehört zu:</b> ${esc(e.verknuepft.titel || e.verknuepft.id)} (${esc(e.verknuepft.art)})</p>` : ''}
    </section>

    ${e.pruefungen?.length ? `<section class="card" style="margin-bottom:14px"><div class="card-head"><h2>Prüfungen</h2></div>
      <ul style="margin:0;padding-left:20px;line-height:1.9">${e.pruefungen.slice().reverse().map(p => `<li>
        <b>${p.erfuellt === true ? 'erfüllt' : p.erfuellt === false ? 'nicht erfüllt' : 'unklar'}</b>
        · ${esc(fmtDateTime(p.zeit))} · ${esc(p.pruefer)} · ${esc(p.methode)}
        ${p.soll !== null || p.ist !== null ? `<div class="small">Soll: ${esc(p.soll ?? '–')} · Ist: ${esc(p.ist ?? '–')}</div>` : ''}
        ${p.begruendung ? `<div class="small muted">${esc(p.begruendung)}</div>` : ''}</li>`).join('')}</ul></section>` : ''}

    <section class="card" style="margin-bottom:14px"><div class="card-head"><h2>Anhänge</h2></div>
      ${e.anhaenge?.length ? `<ul style="margin:0 0 10px;padding-left:20px;line-height:1.9">${e.anhaenge.map(a => `<li>
        <a href="/api/org/anhang-lesen?${new URLSearchParams({ id: e.id, datei: a.datei })}" target="_blank" rel="noopener">${esc(a.name)}</a>
        <span class="small muted">${esc((a.groesse / 1024).toFixed(0))} KB · ${esc(fmtDate(a.zeit))}</span></li>`).join('')}</ul>`
        : '<p class="small muted">Noch kein Anhang.</p>'}
      ${d.darfAendern ? `<label class="btn btn-sm" style="cursor:pointer">Datei anhängen
        <input type="file" data-org-anhang="${esc(e.id)}" accept="image/*,application/pdf,text/plain,text/csv" hidden>
      </label> <span class="small muted">Bilder, PDF, Text – bis 10 MB</span>` : ''}
    </section>

    <section class="card" style="margin-bottom:14px"><div class="card-head"><h2>Kommentare</h2></div>
      ${e.kommentare?.length ? `<div class="rows">${e.kommentare.map(k => `<div class="row"><div>
        <div class="t">${esc(k.wer)} <span class="small muted">${esc(fmtDateTime(k.zeit))}</span></div>
        <div class="m" style="white-space:pre-wrap">${esc(k.text)}</div></div></div>`).join('')}</div>`
        : '<p class="small muted">Noch kein Kommentar.</p>'}
      <div class="toolbar" style="margin-top:10px">
        <input type="text" placeholder="Kommentar schreiben …" data-org-kommentar-text style="flex:1">
        <button type="button" class="btn" data-org-kommentar="${esc(e.id)}">Hinzufügen</button>
      </div>
    </section>

    <details><summary class="small muted" style="cursor:pointer">Verlauf (${e.verlauf?.length || 0})</summary>
      <ul style="margin:8px 0 0;padding-left:20px;line-height:1.8" class="small">
        ${(e.verlauf ?? []).slice().reverse().map(v => `<li>${esc(fmtDateTime(v.zeit))} · ${esc(v.wer)} · ${esc(v.was)}${v.von || v.zu ? ` <span class="muted">(${esc(v.von ?? '–')} → ${esc(v.zu ?? '–')})</span>` : ''}</li>`).join('')}
      </ul>
    </details>`;
}

// -- Hauptansicht -----------------------------------------------------------

export function viewOrganisation() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Aufgaben &amp; Organisation</h1></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Dieser Bereich enthält interne Aufgaben und Notizen, die nie öffentlich werden. Auf dem Mac starten: npm run dashboard')}`;
  }
  const { bereich, ansicht, gruppe, prioritaet, person, q, id } = orgParams();
  if (id) return orgDetailAnsicht(id);

  ensureOrgListe();
  const d = org.liste;
  const team = d?.team || [];

  const reiter = `<div class="tabs no-print" role="tablist">
    ${ORG_BEREICHE.map(([k, l]) => `<button type="button" class="tab" role="tab" aria-selected="${bereich === k}" data-param="ob" data-value="${k === 'meine-aufgaben' ? '' : k}">${esc(l)}</button>`).join('')}
  </div>`;

  const ansichten = ['meine-aufgaben', 'team-aufgaben'].includes(bereich)
    ? `<div class="chips" style="margin:8px 0"><span class="small muted chip-label">Zeigen:</span>
        ${ORG_ANSICHTEN.filter(([k]) => ORG_ANSICHTEN_HAUPT.includes(k))
          .map(([k, l]) => `<button type="button" class="chip" data-param="oa" data-value="${k === 'offen' ? '' : k}" aria-pressed="${ansicht === k}">${esc(l)}</button>`).join('')}
        <details class="chip-mehr"${ORG_ANSICHTEN_HAUPT.includes(ansicht) ? '' : ' open'}>
          <summary class="chip">Mehr …</summary>
          <div class="chips">
            ${ORG_ANSICHTEN.filter(([k]) => !ORG_ANSICHTEN_HAUPT.includes(k))
              .map(([k, l]) => `<button type="button" class="chip" data-param="oa" data-value="${k}" aria-pressed="${ansicht === k}">${esc(l)}</button>`).join('')}
            <button type="button" class="chip" data-param="oa" data-value="alle" aria-pressed="${ansicht === 'alle'}">Alle</button>
          </div>
        </details>
      </div>
      <div class="org-filterzeile"><label for="orgPrioritaet" class="small muted">Priorität</label>
        <select id="orgPrioritaet" data-param="opf" aria-label="Aufgaben nach Priorität filtern">
          <option value="">Alle Prioritäten</option>
          ${[['URGENT', 'Kostet Geld'], ['HIGH', 'Hat ein Datum'], ['REST', 'Kann warten']]
            .map(([wert, label]) => `<option value="${wert}" ${prioritaet === wert ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
      </div>` : '';

  // Das Team sucht hier Kunden, Bestellungen und kleine Auftraege - alles
  // andere Geschaeftliche steht daneben, aber nicht im Weg.
  // Gruppen mit 0 Treffern bleiben weg - ein Reiter, hinter dem nie etwas ist,
  // kostet am Handy eine Zeile und traegt nichts bei. Die gewaehlte Gruppe
  // bleibt immer stehen, sonst verschwindet der Reiter unter den eigenen Fuessen.
  const gruppenListe = (d?.gruppen || []).filter(g => g.anzahl > 0 || g.key === gruppe);
  const gruppen = gruppenListe.length
    ? `<div class="chips" style="margin:0 0 8px"><span class="small muted chip-label">Worum:</span>
        <button type="button" class="chip" data-param="og" data-value="alles" aria-pressed="${gruppe === 'alles'}">Alles<span class="chip-zahl">${(d?.gruppen || []).reduce((n, g) => n + g.anzahl, 0)}</span></button>
        ${gruppenListe.map(g => `<button type="button" class="chip" data-param="og" data-value="${esc(g.key)}" aria-pressed="${gruppe === g.key}">${esc(g.label)}<span class="chip-zahl">${g.anzahl}</span></button>`).join('')}
      </div>` : '';

  const personen = bereich === 'team-aufgaben'
    ? `<div class="chips" style="margin:0 0 8px"><span class="small muted chip-label">Wer:</span>
        <button type="button" class="chip" data-param="op" data-value="" aria-pressed="${!person}">Alle</button>
        <button type="button" class="chip" data-param="op" data-value="unzugewiesen" aria-pressed="${person === 'unzugewiesen'}">Unzugewiesen</button>
        ${team.map(t => `<button type="button" class="chip" data-param="op" data-value="${esc(t.kuerzel)}" aria-pressed="${person === t.kuerzel}">${esc(t.name)}</button>`).join('')}
      </div>` : '';

  const kopf = `<div class="page-head">
      <div><h1>Aufgaben &amp; Organisation</h1><p class="sub">Alles, was im Betrieb ansteht – getrennt nach dir und dem Team.</p></div>
      <div class="head-actions">
        <button type="button" class="btn" data-nur-inhaber data-org-fuer-chatgpt title="Kopiert den aktuellen Stand, damit ChatGPT weiß, was schon offen ist">Stand für ChatGPT</button>
        <button type="button" class="btn" data-nur-inhaber data-org-liste title="Mehrere Aufgaben auf einmal einfügen – z. B. eine Liste aus ChatGPT">Liste einfügen</button>
        <button type="button" class="btn" data-nur-inhaber data-org-pruefen title="Prüft Aufgaben mit hinterlegtem Erfolgskriterium gegen den echten Shop">Jetzt prüfen</button>
        <button type="button" class="btn btn-primary" data-org-schnell>+ Schnell erfassen</button>
      </div>
    </div>`;

  const suche = `<div class="toolbar search-hero"><input type="search" placeholder="Suchen – Titel, Text, Bereich, Kommentare …" value="${esc(q)}" data-param="oq" aria-label="Aufgaben und Notizen durchsuchen"></div>`;

  if (!d && org.loading) return kopf + reiter + `<div class="empty">Lade …</div>`;
  if (!d || !d.verfuegbar) return kopf + reiter + emptyState('Noch nichts erfasst.', 'Mit „+ Schnell erfassen" anfangen.');

  const sindAufgaben = ['meine-aufgaben', 'team-aufgaben'].includes(bereich);
  const filterAktiv = gruppe !== 'alles' || Boolean(q) || (sindAufgaben && (ansicht !== 'offen' || Boolean(person || prioritaet)));
  const liste = d.eintraege.length
    ? sindAufgaben
      ? ORG_DRINGLICHKEIT.map(([key, titel, hinweis]) => {
        const eintraege = d.eintraege.filter(e => (e.dringlichkeit || 'weitere') === key);
        if (!eintraege.length) return '';
        const sichtbar = eintraege.slice(0, 8);
        const rest = eintraege.slice(8);
        const zeilen = `<div class="rows">${sichtbar.map(e => orgZeile(e, { bereich })).join('')}</div>
          ${rest.length ? `<details class="org-mehr"><summary>${rest.length} weitere ${rest.length === 1 ? 'Aufgabe' : 'Aufgaben'} anzeigen</summary>
            <div class="rows">${rest.map(e => orgZeile(e, { bereich })).join('')}</div></details>` : ''}`;
        const weitereEinklappen = key === 'weitere' && ansicht === 'offen' && !q && gruppe === 'alles'
          && !person && !prioritaet && eintraege.length > 8;
        return `<section class="org-dringlichkeit org-dringlichkeit-${key}" aria-label="${esc(titel)}">
          <div class="org-dringlichkeit-kopf"><h2>${esc(titel)} <span class="org-dringlichkeit-zahl">${eintraege.length}</span></h2><span>${esc(hinweis)}</span></div>
          ${weitereEinklappen ? `<details class="org-mehr org-gruppe-zu"><summary>Aufgaben anzeigen</summary>${zeilen}</details>` : zeilen}
        </section>`;
      }).join('')
      : `<div class="rows">${d.eintraege.map(e => orgZeile(e, { bereich })).join('')}</div>`
    : filterAktiv
      ? emptyState('Keine passenden Einträge.', 'Suche oder Filter anpassen.')
        + '<button type="button" class="btn btn-sm" data-org-reset>Filter zurücksetzen</button>'
      : emptyState(bereich === 'meine-aufgaben' ? 'Nichts offen in dieser Ansicht.' : 'Nichts vorhanden.', 'Mit „+ Schnell erfassen" etwas anlegen.');

  return kopf + reiter + suche + ansichten + gruppen + personen +
    `<p class="small muted" style="margin:0 0 8px">${d.anzahl} ${d.anzahl === 1 ? 'Eintrag' : 'Einträge'}${sindAufgaben ? ' · nach Dringlichkeit geordnet' : ''}</p>` + liste;
}

/** Startseite: zwei kompakte Widgets statt der ganzen Verwaltung. */
export function heuteOrganisation() {
  ensureOrgKennzahlen();
  const k = org.kennzahlen;
  if (!k || !k.verfuegbar) return '';
  const zahl = (n, label, cls, ziel) => n ? bandItem(n, label, cls, `#/organisation?${ziel}`) : '';
  const meine = [
    // "offen" zuerst: ohne sie blieb das Widget leer, solange nichts faellig
    // oder dringend war - obwohl Aufgaben dalagen.
    zahl(k.meine.offen, 'offen', 'plain', 'oa='),
    zahl(k.meine.ueberfaellig, 'überfällig', 'crit', 'oa=ueberfaellig'),
    zahl(k.meine.heute, 'heute fällig', 'warn', 'oa=heute'),
    zahl(k.meine.dringend, 'dringend', 'crit', 'oa=dringend'),
    zahl(k.meine.warten, 'warten auf', 'plain', 'oa=warten'),
    zahl(k.meine.pruefung, 'in Prüfung', 'plain', 'oa=pruefung'),
  ].filter(Boolean);
  const team = [
    zahl(k.team.offen, 'offen im Team', 'plain', 'ob=team-aufgaben&oa=alle'),
    zahl(k.team.heute, 'heute fällig', 'warn', 'ob=team-aufgaben&oa=heute'),
    zahl(k.team.ueberfaellig, 'überfällig', 'crit', 'ob=team-aufgaben&oa=ueberfaellig'),
  ].filter(Boolean);
  if (!meine.length && !team.length && !k.naechste.length) return '';

  return `<h2 class="section-title">Meine Arbeit <span class="section-note"><a href="#/organisation">alles ansehen →</a></span></h2>
    ${meine.length ? `<div class="band">${meine.join('')}</div>` : ''}
    ${k.naechste.length ? `<div class="rows" style="margin-bottom:14px">${k.naechste.map(orgZeile).join('')}</div>` : ''}
    ${team.length ? `<h2 class="section-title">Team</h2><div class="band">${team.join('')}</div>` : ''}`;
}

/** Aufgaben: Filter zuruecksetzen. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function orgKlickZuruecksetzen(e) {
  if (e.target.closest('[data-org-reset]')) {
    const bereich = orgParams().bereich;
    location.hash = bereich === 'meine-aufgaben' ? '#/organisation' : `#/organisation?ob=${encodeURIComponent(bereich)}`;
    return true;
  }
  return false;
}

/** Aufgaben: Schnellerfassung (Knopf in der Kopfzeile). Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function orgKlickSchnell(e) {
  if (e.target.closest('[data-org-schnell]')) { e.preventDefault(); openOrgSchnell(); return true; }
  return false;
}

/** Aufgaben: alles in Liste und Detail. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function orgKlick(e) {
  const zk = e.target.closest('[data-org-zu-kunde]');
  if (zk) { e.preventDefault(); navigate('organisation', { oid: zk.dataset.orgZuKunde }); return true; }
  const ka = e.target.closest('[data-kunde-aufgabe]');
  if (ka) {
    e.preventDefault();
    // Am Telefon notiert man mitten im Gespraech. Der Kundenname steht
    // schon da, und die Aufgabe findet spaeter zum Kunden zurueck.
    openOrgSchnell(`${ka.dataset.kundeName}: `,
      { art: 'kunde', id: ka.dataset.kundeAufgabe, titel: ka.dataset.kundeName });
    return true;
  }
  const ueb = e.target.closest('[data-org-uebernehmen]');
  if (ueb) {
    e.preventDefault(); e.stopPropagation();
    orgSchreiben('/api/org/aendern', { id: ueb.dataset.orgUebernehmen, felder: { verantwortlich: org.liste?.ich || null } })
      .then(() => { toast('Steht jetzt auf deinem Namen'); orgFrisch(); render(); })
      .catch(err => toast(`Fehler: ${err.message}`, 'crit'));
    return true;
  }
  if (e.target.closest('[data-org-fuer-chatgpt]')) { e.preventDefault(); openOrgFuerChatGPT(); return true; }
  if (e.target.closest('[data-org-liste]')) { e.preventDefault(); openOrgListe(); return true; }
  const orgPruef = e.target.closest('[data-org-pruefen]');
  if (orgPruef) {
    e.preventDefault();
    orgPruef.disabled = true; orgPruef.textContent = 'Prüfe …';
    orgSchreiben('/api/org/pruefen', {})
      .then(r => {
        toast(r.geprueft
          ? `${r.geprueft} geprüft · ${r.erfuellt} erfüllt · ${r.offen} offen · ${r.unklar} unklar`
          : 'Keine Aufgabe mit hinterlegter Prüfvorgabe');
        orgFrisch(); render();
      })
      .catch(err => { toast(`Fehler: ${err.message}`, 'crit'); orgPruef.disabled = false; orgPruef.textContent = 'Jetzt prüfen'; });
    return true;
  }
  const orgZurueck = e.target.closest('[data-org-zurueck]');
  if (orgZurueck) { e.preventDefault(); const p = new URLSearchParams(state.route.params); p.delete('oid'); location.hash = `#/organisation?${p}`; return true; }
  const orgFertig = e.target.closest('[data-org-fertig]');
  if (orgFertig) {
    e.preventDefault(); e.stopPropagation();
    orgFertig.disabled = true;
    orgSchreiben('/api/org/aendern', { id: orgFertig.dataset.orgFertig, felder: { status: 'DONE' } })
      .then(() => { toast('Erledigt'); orgFrisch(); render(); })
      .catch(err => { toast(`Fehler: ${err.message}`, 'crit'); orgFertig.disabled = false; });
    return true;
  }
  const zuAufgabe = e.target.closest('[data-org-zuaufgabe]');
  if (zuAufgabe) {
    e.preventDefault(); e.stopPropagation();
    zuAufgabe.disabled = true;
    // Aus der Notiz wird eine Aufgabe: derselbe Eintrag, neuer Typ - so
    // bleiben Text, Kommentare und Verlauf erhalten.
    orgSchreiben('/api/org/aendern', { id: zuAufgabe.dataset.orgZuaufgabe, felder: { typ: 'TASK', status: 'INBOX' } })
      .then(() => { toast('In eine Aufgabe umgewandelt'); orgFrisch(); render(); })
      .catch(err => { toast(`Fehler: ${err.message}`, 'crit'); zuAufgabe.disabled = false; });
    return true;
  }
  const orgKomm = e.target.closest('[data-org-kommentar]');
  if (orgKomm) {
    e.preventDefault();
    const feld = document.querySelector('[data-org-kommentar-text]');
    const text = feld?.value.trim();
    if (!text) { toast('Bitte etwas schreiben', 'crit'); return true; }
    orgKomm.disabled = true;
    orgSchreiben('/api/org/kommentar', { id: orgKomm.dataset.orgKommentar, text })
      .then(() => { toast('Kommentar gespeichert'); org.detail = null; org.detailId = null; render(); })
      .catch(err => { toast(`Fehler: ${err.message}`, 'crit'); orgKomm.disabled = false; });
    return true;
  }
  const orgOpen = e.target.closest('[data-org-open]');
  if (orgOpen && !e.target.closest('button, a, select, input')) {
    e.preventDefault();
    orgEintragOeffnen(orgOpen.dataset.orgOpen);
    return true;
  }
  return false;
}

/** Aufgaben: Anhang hochladen. Gibt true zurueck, wenn eine Datei gewaehlt wurde (das Hochladen laeuft dann weiter). */
export function orgAenderungAnhang(e) {
  const datei = e.target.closest('[data-org-anhang]');
  if (!datei?.files?.length) return false;
  orgAnhangHochladen(datei);
  return true;
}
async function orgAnhangHochladen(datei) {
  const f = datei.files[0];
  if (f.size > 10 * 1024 * 1024) { toast('Datei ist größer als 10 MB', 'crit'); datei.value = ''; return; }
  toast('Lade hoch …');
  try {
    const daten = await new Promise((fertig, schief) => {
      const leser = new FileReader();
      leser.onload = () => fertig(String(leser.result).split(',')[1] || '');
      leser.onerror = () => schief(new Error('Datei nicht lesbar'));
      leser.readAsDataURL(f);
    });
    await orgSchreiben('/api/org/anhang', { id: datei.dataset.orgAnhang, name: f.name, typ: f.type, daten });
    toast('Angehängt');
    org.detail = null; org.detailId = null; render();
  } catch (err) { toast(`Fehler: ${err.message}`, 'crit'); }
  datei.value = '';
}

/** Aufgaben: Feld im Detail geaendert (Status, Verantwortlich, Termin ...). */
export function orgAenderungFeld(e) {
  const org1 = e.target.closest('[data-org-feld]');
  if (org1) {
    const wert = org1.value === '' ? null : org1.value;
    orgSchreiben('/api/org/aendern', { id: org1.dataset.orgId, felder: { [org1.dataset.orgFeld]: wert } })
      .then(() => { toast('Gespeichert'); org.detail = null; org.detailId = null; org.liste = null; org.key = null; render(); })
      .catch(err => toast(`Fehler: ${err.message}`, 'crit'));
  }
}

/** Aufgaben: Enter/Leertaste auf einer fokussierten Zeile. Gibt true zurueck, wenn die Taste damit erledigt ist. */
export function orgTaste(e) {
  const orgRow = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && orgRow?.dataset?.orgOpen) {
    e.preventDefault(); orgEintragOeffnen(orgRow.dataset.orgOpen); return true;
  }
  if ((e.key === 'Enter' || e.key === ' ') && orgRow?.dataset?.orgZuKunde) {
    e.preventDefault(); navigate('organisation', { oid: orgRow.dataset.orgZuKunde }); return true;
  }
  return false;
}
