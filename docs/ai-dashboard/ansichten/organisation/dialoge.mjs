/**
 * Aufgaben & Organisation: Dialoge - Schnellerfassung, Liste einfuegen, Uebergabe an ChatGPT.
 */
import { $, esc, fmtDate, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { navigate } from '../../kern/router.mjs';
import { render } from '../../kern/render.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { org, ORG_STATUS_LABEL, ORG_PRIO_WAHL, orgFrisch } from './gemeinsam.mjs';

/**
 * Der Stand als Text: was schon offen ist, damit ChatGPT nicht dieselben
 * Punkte noch einmal liefert. Zusammen mit der Anweisung ergibt das den
 * Rueckkanal - sonst weiss ChatGPT nur, was es selbst gesagt hat.
 */
export async function openOrgFuerChatGPT() {
  const root = $('#dialogRoot');
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Stand für ChatGPT" style="max-width:720px">
    <h2>Stand für ChatGPT</h2>
    <p class="small muted">Lade …</p></div></div>`;
  const meiner = root.firstElementChild;
  let d;
  try { d = await fetchEinkauf('/api/org/export'); }
  catch (err) { if (meiner.isConnected) root.innerHTML = ''; toast(`Fehler: ${err.message}`, 'crit'); return; }
  if (!meiner.isConnected) return;                 // inzwischen geschlossen

  const gesamt = `${ORG_CHATGPT_PROMPT}\n\n${d.text}`;
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Stand für ChatGPT" style="max-width:720px">
    <h2>Stand für ChatGPT</h2>
    <p class="small muted">Das hier ChatGPT geben: erst die Anweisung, dann der aktuelle Stand
      (${d.anzahl} ${d.anzahl === 1 ? 'offene Aufgabe' : 'offene Aufgaben'}). ChatGPT weiß dann,
      was schon dasteht, und liefert nur Neues – im Format, das „Liste einfügen" versteht.</p>
    <textarea id="orgStandText" rows="14" readonly style="width:100%;box-sizing:border-box">${esc(gesamt)}</textarea>
    <div class="dialog-actions">
      <button type="button" class="btn" data-close-dialog>Schließen</button>
      <button type="button" class="btn btn-primary" id="orgStandKopieren">Alles kopieren</button>
    </div>
  </div></div>`;
  root.addEventListener('click', async (e) => {
    if (!e.target.closest('#orgStandKopieren')) return;
    try { await navigator.clipboard.writeText(gesamt); toast('Kopiert – jetzt bei ChatGPT einfügen'); }
    catch { $('#orgStandText')?.select(); toast('Bitte von Hand kopieren', 'crit'); }
  });
}

/**
 * Anweisung fuer ChatGPT. Das Dashboard kann Listen lesen - aber nur, wenn
 * Titel und Erklaerung getrennt ankommen. Sonst steht spaeter eine Zeile da,
 * die niemand mehr einordnen kann.
 */
const ORG_CHATGPT_PROMPT = `Du sammelst unsere offenen Punkte und gibst sie mir am Ende in einem Format, das ich in mein Dashboard einfuegen kann.

Regeln fuer die Ausgabe:
- Eine Zeile je Aufgabe, beginnend mit "- ".
- Aufbau: - [Bereich] Kurzer Titel :: Was genau gemeint ist
- Der Titel ist knapp (max. 8 Woerter) und beginnt mit einem Verb.
- Nach "::" steht in ein bis drei Saetzen: worum es geht, warum es ansteht und woran man sieht, dass es fertig ist. Schreib es so, dass ich es in vier Wochen noch verstehe, ohne nachzufragen.
- Erlaubte Bereiche: Website & KI, Online-Shop, Kunden, Bestellungen, Angebote / Lexware, Baustelle, Laden, Einkauf, Lieferanten, Marketing, Buchhaltung, Mitarbeiter, Lager, Fahrzeuge, Sonstiges.
- Keine Ueberschriften, keine Nummerierung, keine Leerzeilen, kein Fliesstext davor oder danach - nur die Zeilen.
- Keine Lieferantennamen, keine Kundendaten ueber den Namen hinaus, keine Passwoerter oder Zugangsdaten.
- Was schon erledigt ist, laesst du weg.

Beispiel:
- [Online-Shop] Produktbilder ergaenzen :: 45 Produkte haben noch kein Bild. Ohne Bild bricht die Kaufentscheidung ab. Fertig, wenn die Liste im Dashboard leer ist.
- [Kunden] Frau Meier zurueckrufen :: Sie fragt nach Mustern in Beige. Nummer steht im Angebot. Fertig, wenn Muster raus sind.`;

/**
 * Schnellerfassung: von ueberall erreichbar, ein Feld, fertig. Der Vorschlag
 * (Typ, Person, Bereich, Priorität, Fälligkeit) erscheint erst nach der
 * Eingabe und ist immer aenderbar - er haelt niemanden auf.
 */
/**
 * @param vorbelegt  Text, der schon im Feld steht
 * @param verknuepft {art, id, titel} - woraus die Aufgabe entstanden ist, z. B.
 *   ein Kunde. Damit fuehrt die Aufgabe spaeter wieder dorthin zurueck.
 */
export function openOrgSchnell(vorbelegt = '', verknuepft = null) {
  const root = $('#dialogRoot');
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Schnell erfassen" style="max-width:560px">
    <h2>Schnell erfassen</h2>
    <p class="small muted">Was möchtest du festhalten? Einfach hinschreiben – der Rest kommt als Vorschlag.</p>
    <textarea id="orgText" rows="3" style="width:100%;box-sizing:border-box" placeholder="z. B. „Ben soll morgen prüfen, ob die neuen Teppichmuster angekommen sind."">${esc(vorbelegt)}</textarea>
    <div id="orgVorschlag" class="small" style="margin-top:10px"></div>
    <div class="dialog-actions">
      <button type="button" class="btn" data-close-dialog>Abbrechen</button>
      <button type="button" class="btn btn-primary" id="orgSpeichern">Speichern</button>
    </div>
  </div></div>`;
  const meiner = root.firstElementChild;
  const lebt = () => meiner.isConnected;
  const feld = $('#orgText');
  feld.focus();
  feld.setSelectionRange(feld.value.length, feld.value.length);

  let timer;
  const zeichneVorschlag = () => {
    const v = org.entwurf?.vorschlag;
    const dop = org.entwurf?.doppelgaenger || [];
    const ziel = $('#orgVorschlag');
    if (!ziel || !lebt()) return;
    if (!v) { ziel.innerHTML = ''; return; }
    const team = org.liste?.team || [];
    const bereiche = org.liste?.bereiche || [];
    ziel.innerHTML = `
      ${dop.length ? `<div class="notice warn" style="margin-bottom:10px">
        <b>Gibt es das vielleicht schon?</b>
        <ul style="margin:6px 0 0;padding-left:18px">${dop.map(x => `<li>${esc(x.titel)} <span class="muted">(${esc(ORG_STATUS_LABEL[x.status] || x.status)}, ${x.wert}% ähnlich)</span>
          <button type="button" class="btn btn-sm btn-ghost" data-org-oeffnen="${esc(x.id)}">Öffnen</button></li>`).join('')}</ul>
        <div class="small muted" style="margin-top:6px">Du kannst trotzdem neu anlegen – zusammengeführt wird nie automatisch.</div>
      </div>` : ''}
      <div class="bq-weitere" style="margin:0">
        <div><span class="small muted">Art</span><div><select id="orgTyp">
          <option value="TASK"${v.typ === 'TASK' ? ' selected' : ''}>Aufgabe</option>
          <option value="NOTE"${v.typ === 'NOTE' ? ' selected' : ''}>Notiz</option></select></div></div>
        <div><span class="small muted">Für wen</span><div><select id="orgWer">
          <option value="">unzugewiesen</option>
          ${team.map(t => `<option value="${esc(t.kuerzel)}"${v.verantwortlich === t.kuerzel ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>
        <div><span class="small muted">Bereich</span><div><select id="orgBereich">
          <option value="">keiner</option>
          ${bereiche.map(b => `<option value="${esc(b)}"${v.bereich === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></div></div>
        <div><span class="small muted">Dringlichkeit</span><div><select id="orgPrio">
          ${Object.entries(ORG_PRIO_WAHL).map(([k, l]) => `<option value="${k}"${v.prioritaet === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
        <div><span class="small muted">Fällig</span><div><input type="date" id="orgFaellig" value="${esc(v.faellig || '')}"></div></div>
        <div><span class="small muted">Sichtbar</span><div><select id="orgSicht">
          <option value="PRIVAT"${v.sichtbarkeit === 'PRIVAT' ? ' selected' : ''}>nur ich</option>
          <option value="TEAM"${v.sichtbarkeit === 'TEAM' ? ' selected' : ''}>ganzes Team</option></select></div></div>
      </div>
      ${v.begruendung?.length ? `<p class="small muted" style="margin:8px 0 0">Vorschlag wegen: ${esc(v.begruendung.join(' · '))}</p>` : ''}
      ${!team.length ? `<p class="small muted" style="margin:6px 0 0">Namen im Text werden erkannt, sobald Mitarbeiterzugänge angelegt sind (Schreibtisch: „Mitarbeiter verwalten").</p>` : ''}
      ${v.mehrereAufgaben?.length ? `<div class="notice" style="margin-top:10px"><b>Das klingt nach ${v.mehrereAufgaben.length} Aufgaben.</b>
        <ul style="margin:6px 0 0;padding-left:18px">${v.mehrereAufgaben.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <button type="button" class="btn btn-sm" id="orgTeilen" style="margin-top:6px">Als ${v.mehrereAufgaben.length} einzelne Aufgaben anlegen</button></div>` : ''}`;
  };

  const analysiere = () => {
    if (!lebt()) return;
    const text = feld.value.trim();
    if (text.length < 4) { org.entwurf = null; zeichneVorschlag(); return; }
    orgSchreiben('/api/org/analyse', { text })
      .then(d => { org.entwurf = d; zeichneVorschlag(); })
      .catch(() => { /* ohne Vorschlag speichern geht trotzdem */ });
  };
  feld.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(analysiere, 350); });
  if (vorbelegt) analysiere();

  const lese = () => {
    const v = org.entwurf?.vorschlag || {};
    return {
      typ: $('#orgTyp')?.value || v.typ || 'TASK',
      titel: (org.entwurf?.vorschlag?.titel) || feld.value.trim().split('\n')[0].slice(0, 90),
      beschreibung: feld.value.trim(),
      verantwortlich: $('#orgWer')?.value || null,
      bereich: $('#orgBereich')?.value || null,
      prioritaet: $('#orgPrio')?.value || 'NORMAL',
      faellig: $('#orgFaellig')?.value || null,
      sichtbarkeit: $('#orgSicht')?.value || (($('#orgTyp')?.value || 'TASK') === 'NOTE' ? 'PRIVAT' : 'TEAM'),
      ...(verknuepft ? { verknuepft } : {}),
    };
  };

  const speichern = async (mehrere = null) => {
    const knopf = $('#orgSpeichern');
    if (knopf) { knopf.disabled = true; knopf.textContent = 'Speichere …'; }
    try {
      if (mehrere?.length) {
        const basis = lese();
        for (const titel of mehrere) await orgSchreiben('/api/org/neu', { ...basis, titel, beschreibung: titel });
        toast(`${mehrere.length} Aufgaben angelegt`);
      } else {
        if (!feld.value.trim()) throw new Error('Bitte etwas eintragen');
        await orgSchreiben('/api/org/neu', lese());
        toast('Gespeichert');
      }
      org.entwurf = null;
      $('#dialogRoot').innerHTML = '';
      orgFrisch();
      // Wurde die Aufgabe aus einer Kundenakte heraus angelegt, muss deren
      // Notizliste neu geladen werden - sonst steht die frische Notiz erst
      // nach einem Seitenwechsel dort.
      if (verknuepft?.art === 'kunde') { kunden.notizen = null; kunden.notizenKey = null; }
      render();
    } catch (e) {
      toast(`Fehler: ${e.message}`, 'crit');
      if (knopf) { knopf.disabled = false; knopf.textContent = 'Speichern'; }
    }
  };

  root.addEventListener('click', (e) => {
    if (!lebt()) return;
    if (e.target.closest('#orgSpeichern')) { speichern(); return; }
    if (e.target.closest('#orgTeilen')) { speichern(org.entwurf?.vorschlag?.mehrereAufgaben || []); return; }
    const oeffnen = e.target.closest('[data-org-oeffnen]');
    if (oeffnen) { $('#dialogRoot').innerHTML = ''; navigate('organisation', { oid: oeffnen.dataset.orgOeffnen }); }
  });
  feld.addEventListener('keydown', (e) => {
    // Auf dem Handy und am Rechner: fertig getippt, abschicken.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); speichern(); }
  });
}

/**
 * Liste einfuegen: eine Zeile je Aufgabe. Gedacht fuer Sammlungen aus
 * ChatGPT, aus einer Mail oder von einem Zettel - erst Vorschau mit
 * Duplikatwarnung, dann anlegen. Nichts wird ungefragt gespeichert.
 */
export function openOrgListe() {
  const root = $('#dialogRoot');
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-label="Liste einfügen" style="max-width:720px">
    <h2>Liste einfügen</h2>
    <p class="small muted">Eine Zeile je Aufgabe. Nach <code>::</code> steht, was genau gemeint ist; ein <code>[Bereich]</code> davor setzt den Bereich. Aufzählungszeichen und Überschriften fallen weg.</p>
    <textarea id="orgListeText" rows="8" style="width:100%;box-sizing:border-box" placeholder="- [Online-Shop] Produktbilder ergänzen :: 45 Produkte haben kein Bild, Liste steht im Dashboard&#10;- [Kunden] Frau Meier zurückrufen :: will Muster in Beige, Nummer im Angebot&#10;- [Website & KI] Preisformel prüfen :: nach dem Fix alle Kollektionen gegenprüfen"></textarea>
    <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <input type="checkbox" id="orgListeMir" checked> Alles mir zuweisen (sonst entscheidet der Bereich)
    </label>
    <details style="margin-top:8px"><summary class="small">Anweisung für ChatGPT zum Kopieren</summary>
      <textarea id="orgListePrompt" rows="8" readonly style="width:100%;box-sizing:border-box;margin-top:6px">${esc(ORG_CHATGPT_PROMPT)}</textarea>
      <button type="button" class="btn btn-sm" id="orgListePromptKopieren" style="margin-top:6px">Anweisung kopieren</button>
    </details>
    <div class="toolbar" style="margin-top:8px"><button type="button" class="btn" id="orgListeVorschau">Vorschau</button></div>
    <div id="orgListeErgebnis" class="small" style="margin-top:10px"></div>
    <div class="dialog-actions">
      <button type="button" class="btn" data-close-dialog>Abbrechen</button>
      <button type="button" class="btn btn-primary" id="orgListeSpeichern" disabled>Ausgewählte anlegen</button>
    </div>
  </div></div>`;
  const meiner = root.firstElementChild;      // dieser Dialog, nicht irgendeiner
  const lebt = () => meiner.isConnected;
  $('#orgListeText').focus();
  let vorschlaege = [];

  const zeichne = () => {
    const ziel = $('#orgListeErgebnis');
    if (!ziel || !lebt()) return;             // Dialog inzwischen geschlossen
    if (!vorschlaege.length) { ziel.innerHTML = '<p class="small muted">Noch keine Vorschau.</p>'; $('#orgListeSpeichern').disabled = true; return; }
    ziel.innerHTML = `<p class="small muted">${vorschlaege.length} ${vorschlaege.length === 1 ? 'Zeile' : 'Zeilen'} erkannt – abwählen, was nicht rein soll:</p>
      <div class="rows">${vorschlaege.map((v, i) => `<div class="row">
        <div>
          <div class="t"><label style="display:flex;gap:8px;align-items:flex-start">
            <input type="checkbox" data-org-liste-an="${i}" ${v.doppelgaenger?.length ? '' : 'checked'}>
            <span>${esc(v.titel)}</span></label></div>
          ${v.beschreibung && v.beschreibung !== v.titel ? `<div class="m org-was">${esc(v.beschreibung)}</div>` : ''}
          <div class="m">${esc(v.typ === 'TASK' ? 'Aufgabe' : 'Notiz')}${v.bereich ? ` · ${esc(v.bereich)}` : ''}${v.verantwortlich ? ` · für ${esc(v.verantwortlich)}` : ''}${v.faellig ? ` · fällig ${esc(fmtDate(v.faellig))}` : ''}</div>
          ${v.doppelgaenger?.length ? `<div class="m warnc">Gibt es vielleicht schon: ${v.doppelgaenger.map(d => esc(d.titel)).join(' · ')} – standardmäßig abgewählt</div>` : ''}
        </div>
      </div>`).join('')}</div>`;
    $('#orgListeSpeichern').disabled = false;
  };

  root.addEventListener('click', async (e) => {
    if (!lebt()) return;
    if (e.target.closest('#orgListePromptKopieren')) {
      try { await navigator.clipboard.writeText(ORG_CHATGPT_PROMPT); toast('Anweisung kopiert'); }
      catch { $('#orgListePrompt')?.select(); toast('Bitte von Hand kopieren', 'crit'); }
      return;
    }
    if (e.target.closest('#orgListeVorschau')) {
      const text = $('#orgListeText').value;
      try {
        const d = await orgSchreiben('/api/org/liste-einfuegen', { text, speichern: false });
        vorschlaege = d.vorschlaege || [];
        zeichne();
      } catch (err) { toast(`Fehler: ${err.message}`, 'crit'); }
      return;
    }
    if (e.target.closest('#orgListeSpeichern')) {
      const knopf = $('#orgListeSpeichern');
      const gewaehlt = vorschlaege.filter((_, i) => root.querySelector(`[data-org-liste-an="${i}"]`)?.checked);
      if (!gewaehlt.length) { toast('Nichts ausgewählt', 'crit'); return; }
      const mir = $('#orgListeMir')?.checked ? (org.liste?.ich || null) : null;
      knopf.disabled = true; knopf.textContent = 'Lege an …';
      try {
        const r = await orgSchreiben('/api/org/liste-einfuegen', { speichern: true, zeilen: gewaehlt.map(v => ({
          typ: v.typ, titel: v.titel, beschreibung: v.beschreibung,
          verantwortlich: v.typ === 'TASK' && mir ? mir : v.verantwortlich,
          bereich: v.bereich, prioritaet: v.prioritaet, faellig: v.faellig, sichtbarkeit: v.sichtbarkeit,
        })) });
        toast(`${r.angelegt} ${r.angelegt === 1 ? 'Eintrag' : 'Einträge'} angelegt`);
        root.innerHTML = '';
        orgFrisch(); render();
      } catch (err) {
        toast(`Fehler: ${err.message}`, 'crit');
        knopf.disabled = false; knopf.textContent = 'Ausgewählte anlegen';
      }
    }
  });
}
