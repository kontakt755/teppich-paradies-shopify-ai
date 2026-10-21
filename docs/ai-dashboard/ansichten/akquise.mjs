/**
 * Ansicht "Akquise" (#/akquise, Inhaber und Mitarbeiter, Issue #1447): Verlegeauftraege bei
 * Wohnungsgenossenschaften und Hausverwaltungen gewinnen. Gefuehrt statt Liste: oben
 * erklaert ein Kasten den Ablauf, darunter steht genau EINE Firma "Als Naechstes" mit
 * grossen Knoepfen; die ganze Liste liegt zugeklappt darunter. Firmenliste und Vorlage
 * liegen privat, der Stand im Privatordner (/api/akquise/*). Versendet wird nichts -
 * "E-Mail oeffnen" oeffnet nur das Mailprogramm, "Text kopieren" die Zwischenablage.
 */
import { state } from '../kern/zustand.mjs';
import { $, esc, fmtDate, fmtDateTime, toast } from '../kern/helfer.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import {
  AKQUISE_LABEL, WIEDERVORLAGE_TAGE, SPAETER_TAGE, faelligeWiedervorlagen, nachrichtFuer,
  naechsteFirmen, akquiseFortschritt, warumInteressant, kontaktTeile, mailtoLink, tageBis, plusTage,
  titelKurz, richtpreisZeile, angebotsEntwurf, angeschriebenVon,
} from '../lib/akquise.mjs';

// gewaehlt: Firma, die der Nutzer aus der Liste nach oben geholt hat; antwort: offenes Antwort-Feld.
export const akquise = { daten: null, laedt: false, gewaehlt: '', antwort: '' };

const heute = () => new Date().toLocaleDateString('sv-SE');
const TYP_LABEL = { genossenschaft: 'Genossenschaft', kommunal: 'kommunal', landeseigen: 'landeseigen', verwaltung: 'Hausverwaltung' };
const typText = t => TYP_LABEL[String(t || '').toLowerCase()] || t || '';
const webKurz = u => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Laedt Firmen, Stand und Ausschreibungen - auch fuer das To-do auf "Heute". */
export function ensureAkquise(neu = false) {
  if (akquise.laedt || (akquise.daten && !neu)) return;
  akquise.laedt = true;
  fetchEinkauf('/api/akquise/liste').then(d => {
    akquise.daten = d; akquise.laedt = false;
    if (['heute', 'akquise'].includes(state.route.view)) render();
  });
}

/** Faellige Wiedervorlagen fuer die To-dos auf "Heute". */
export function akquiseFaellig() {
  const d = akquise.daten;
  return d?.verfuegbar ? faelligeWiedervorlagen(d.firmen, heute()) : [];
}

function erklaerung(firmen) {
  const p = akquiseFortschritt(firmen);
  const wer = angeschriebenVon(firmen);
  return `<section class="card akq-erklaer">
    <p>Hier gewinnen wir <b>Verlegeaufträge bei Wohnungsgenossenschaften und Hausverwaltungen</b>. Die haben laufend Wohnungswechsel, bei denen neuer Boden rein muss.</p>
    <ol class="akq-schritte"><li>Firma anschreiben</li><li>nach 2 Wochen nachfassen</li><li>bei Interesse Termin oder Angebot</li></ol>
    <p class="akq-stand"><b>${p.angeschrieben}</b> von ${p.gesamt} angeschrieben · <b>${p.antworten}</b> ${p.antworten === 1 ? 'Antwort' : 'Antworten'} · <b>${p.auftraege}</b> ${p.auftraege === 1 ? 'Auftrag' : 'Aufträge'}${wer.length ? `<br><span class="small muted">angeschrieben von ${wer.map(([n, z]) => `${esc(n)} ${z}`).join(' · ')}</span>` : ''}</p>
  </section>`;
}

/** Was auf der Karte zu tun ist - je nach Stand der Firma. */
function aufgabe(f, faellig) {
  const st = f.status || 'neu';
  if (st === 'neu') return { titel: 'Anschreiben', text: 'Schicken Sie unser Anschreiben per E-Mail – oder rufen Sie an und fragen nach dem Ansprechpartner für Wohnungswechsel.' };
  if (st === 'angeschrieben') return { titel: f.nachgefasst ? 'Noch einmal nachfassen' : 'Nachfassen', text: `Angeschrieben${f.letzteAktion ? ` am ${fmtDate(f.letzteAktion)}` : ''}, bisher keine Antwort. Kurz anrufen oder eine freundliche Erinnerung schicken.` };
  if (st === 'termin') return { titel: 'Termin nachhalten', text: 'Ein Termin ist vereinbart. Wie ist es gelaufen?' };
  return { titel: faellig ? 'Antwort nachhalten' : 'Antwort', text: 'Die Firma hat geantwortet. Bitte den nächsten Schritt erledigen: Termin vereinbaren oder Angebot schicken.' };
}

function karte(f, d, faellig, restZahl) {
  const k = kontaktTeile(f.kontakt);
  const nachricht = d.vorlage ? nachrichtFuer(d.vorlage, f.name) : '';
  const st = f.status || 'neu';
  const a = aufgabe(f, faellig);
  const meta = [f.ort, typText(f.typ), f.wohnungen ? `${f.wohnungen} Wohnungen` : ''].filter(Boolean).map(esc).join(' · ');
  const kontakt = k.email || k.telefon
    ? `<div class="akq-kontakt">${k.email ? `<span>${esc(k.email)}</span>` : ''}${k.telefon ? `<span>${esc(k.telefon)}</span>` : ''}${f.website ? `<a href="${esc(f.website)}" target="_blank" rel="noopener">${esc(webKurz(f.website))}</a>` : ''}</div>`
    : `<p class="akq-fehlt">Kontakt fehlt – ${f.website ? `<a href="${esc(f.website)}" target="_blank" rel="noopener">Website ansehen</a> und dort E-Mail oder Telefon suchen.` : 'bitte im Internet nach der Firma suchen.'}</p>`;
  const kontaktKnoepfe = [
    k.email && nachricht && ['neu', 'angeschrieben'].includes(st) ? `<a class="btn btn-lg" href="${esc(mailtoLink(k.email, nachricht))}">E-Mail öffnen</a>` : '',
    nachricht && ['neu', 'angeschrieben'].includes(st) ? `<button type="button" class="btn btn-lg" data-akq-kopieren="${esc(f.id)}">Text kopieren</button>` : '',
    k.telLink ? `<a class="btn btn-lg" href="tel:${esc(k.telLink)}">Anrufen</a>` : '',
  ].filter(Boolean).join('');
  const id = esc(f.id);
  const lesend = istNurLesend();
  const knopf = (aktion, text, cls = '') => `<button type="button" class="btn btn-lg ${cls}" data-akq-aktion="${aktion}" data-akq-id="${id}">${text}</button>`;
  const erledigt = st === 'neu'
    ? knopf('angeschrieben', 'Erledigt: angeschrieben', 'btn-primary')
    : st === 'angeschrieben' ? knopf('nachgefasst', 'Nachgefasst', 'btn-primary') + knopf('antwort-offen', 'Antwort bekommen')
      : knopf('antwort-offen', 'Neue Rückmeldung eintragen', 'btn-primary') + knopf('auftrag', 'Auftrag bekommen');
  const antwortFeld = akquise.antwort === f.id ? `<div class="akq-antwort">
      <label for="akq-was">Was wurde gesagt?</label>
      <textarea id="akq-was" rows="3" placeholder="z. B. Frau Muster, Technik – meldet sich bei der nächsten Wohnung">${esc(f.notiz || '')}</textarea>
      <p class="small muted">Wie geht es weiter?</p>
      <div class="akq-knoepfe">${knopf('termin', 'Termin vereinbaren', 'btn-primary')}${knopf('angebot', 'Angebot schicken')}${knopf('antwort-zu', 'Abbrechen', 'btn-ghost')}</div>
    </div>` : '';
  return `<section class="card akq-naechste" aria-labelledby="akq-naechste-titel">
    <div class="akq-naechste-kopf"><h2 id="akq-naechste-titel">Als Nächstes: ${esc(a.titel)}</h2>${restZahl ? `<span class="small muted">danach noch ${restZahl}</span>` : ''}</div>
    <div class="akq-firma-name">${esc(f.name)}</div>
    ${meta ? `<div class="small muted">${meta}</div>` : ''}
    <p class="akq-warum">${esc(warumInteressant(f))}</p>
    ${kontakt}
    ${f.notiz ? `<p class="akq-notiz-text"><span class="muted">Notiz:</span> ${esc(f.notiz)}</p>` : ''}
    <p class="akq-tun">${esc(a.text)}</p>
    ${kontaktKnoepfe ? `<div class="akq-knoepfe">${kontaktKnoepfe}</div>` : ''}
    ${richtpreisHtml(f, d)}
    ${lesend ? '' : `<div class="akq-knoepfe akq-erledigt">${erledigt}${knopf('kein-interesse', 'Kein Interesse', 'btn-ghost')}${knopf('spaeter', 'Später', 'btn-ghost')}</div>`}
    ${antwortFeld}
    ${st === 'neu' ? `<p class="small muted akq-fuss">Nach „Erledigt: angeschrieben“ erscheint die Firma in ${WIEDERVORLAGE_TAGE} Tagen wieder zum Nachfassen. „Später“ legt sie ${SPAETER_TAGE} Tage zurück.</p>` : ''}
  </section>`;
}

/**
 * Nach "Antwort bekommen" (Antwort/Termin): unser Richtpreis - nur, wenn die private Datei
 * existiert - und der Knopf "Angebotsentwurf" (Text zum Kopieren, nichts geht an Lexware).
 */
function richtpreisHtml(f, d) {
  if (!['antwort', 'termin'].includes(f.status || 'neu')) return '';
  const z = richtpreisZeile(d.richtpreise);
  const zeile = !z ? '' : z.freigegeben ? `<p class="small akq-richtpreis"><span class="muted">Unser Richtpreis:</span> ${esc(z.text)}</p>`
    : `<p class="small muted akq-richtpreis">${esc(z.text)}</p>`;
  const knopf = istNurLesend() ? '' : `<button type="button" class="btn btn-sm" data-akq-angebot="${esc(f.id)}">Angebotsentwurf</button>`;
  return zeile || knopf ? `<div class="akq-preis">${zeile}${knopf}</div>` : '';
}

function angebotDialog(f) {
  const text = angebotsEntwurf(f.name, akquise.daten?.richtpreise);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="akqAngTitel" data-dialog>
    <h2 id="akqAngTitel">Angebotsentwurf · ${esc(f.name)}</h2>
    ${akquise.daten?.richtpreise?.freigegeben === true ? '' : '<p class="small muted">Richtpreis noch nicht freigegeben (Inhaber) – Preise stehen als „nach Aufmaß“ drin.</p>'}
    <textarea id="akqAngText" class="ab-text-feld" rows="14" readonly>${esc(text)}</textarea>
    <p class="small muted">Nur ein Entwurf zum Kopieren – es wird nichts gesendet und nichts in Lexware angelegt.</p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button><button type="button" class="btn btn-primary" data-kopieren="akqAngText">Text kopieren</button></div>
  </div></div>`;
  $('#dialogRoot [data-kopieren]')?.focus();
}

/** Gemerkte Referenzen (aus dem Einkauf, Schritt "Erledigt") - zugeklappt. */
function referenzen(d) {
  const r = d.referenzen || [];
  if (!r.length) return '';
  return `<details class="card akq-alle"><summary><b>Referenzen (${r.length})</b> <span class="small muted">erledigte Aufträge zum Vorzeigen</span></summary>
    <ul class="akq-ref-liste">${r.map(x => `<li><b>${esc(x.auftrag || x.orderId)}</b> <span class="small muted">${esc(fmtDate(x.am))}${x.von ? ` · ${esc(x.von)}` : ''}</span><div class="small">${esc(x.notiz)}</div></li>`).join('')}</ul>
  </details>`;
}

function statusChip(f, faellig) {
  const st = f.status || 'neu';
  const cls = faellig ? 'freigabe' : st === 'auftrag' ? 'fertig' : ['antwort', 'termin'].includes(st) ? 'review' : '';
  return `<span class="badge status ${cls}">${esc(faellig ? 'nachfassen' : AKQUISE_LABEL[st] || st)}</span>`;
}

/** Alle Firmen: zugeklappt, kompakt; bearbeitet wird ueber "Oben zeigen" auf der Karte. */
function alleFirmen(d, faelligIds) {
  const zeilen = [...d.firmen].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(f => {
    const k = kontaktTeile(f.kontakt);
    return `<tr>
      <td><b>${esc(f.name)}</b><div class="small muted">${esc(f.ort || '')}${!k.email && !k.telefon ? ' · <span class="akq-fehlt-kurz">Kontakt fehlt</span>' : ''}</div>${f.notiz ? `<div class="small akq-notiz-zeile">${esc(f.notiz)}</div>` : ''}</td>
      <td>${statusChip(f, faelligIds.has(f.id))}</td>
      <td class="small">${f.wiedervorlage ? esc(fmtDate(f.wiedervorlage)) : ''}</td>
      <td>${istNurLesend() ? '' : `<button type="button" class="btn btn-sm" data-akq-zeigen="${esc(f.id)}">Oben zeigen</button>`}</td>
    </tr>`;
  }).join('');
  return `<details class="card akq-alle"><summary><b>Alle Firmen (${d.firmen.length})</b> <span class="small muted">Stand, wieder melden am, Notizen</span></summary>
    <div class="table-scroll"><table class="tasks akq-tabelle"><thead><tr><th>Firma</th><th>Stand</th><th>Wieder melden am</th><th></th></tr></thead><tbody>${zeilen}</tbody></table></div>
  </details>`;
}

function ausschreibungen(a, tag) {
  const kopf = `<div class="card-head"><h2>Öffentliche Ausschreibungen</h2>${a ? `<span class="small muted">geprüft ${esc(fmtDateTime(a.geprueftAm))}</span>` : ''}</div>
    <p class="small">Öffentliche Aufträge für Bodenbeläge – meist zu groß für uns. <b>Nur ansehen</b>, die Abgabe macht der Inhaber.</p>`;
  if (!a) return `<section class="card akq-aus">${kopf}<p class="small muted">Die wöchentliche Suche ist noch nicht gelaufen.</p></section>`;
  const t = [...(a.treffer || [])].sort((x, y) => String(x.frist || '9').localeCompare(String(y.frist || '9')));
  if (!t.length) return `<section class="card akq-aus">${kopf}<p class="small muted">Zurzeit keine passenden Ausschreibungen im Umkreis.</p></section>`;
  const neu = new Set((a.neu || []).map(x => x.id || x));
  return `<section class="card akq-aus">${kopf}<ul class="akq-aus-liste">${t.map(x => {
    const n = tageBis(x.frist, tag);
    const [ampel, hinweis] = n === null ? ['', 'Frist unbekannt – in der Bekanntmachung nachsehen'] : n <= 7 ? ['crit', `noch ${n} ${n === 1 ? 'Tag' : 'Tage'} – zu knapp, nur zur Kenntnis`] : n <= 21 ? ['warn', `noch ${n} Tage – dem Inhaber zeigen`] : ['', `noch ${n} Tage – Zeit genug`];
    return `<li><span class="akq-ampel ${ampel}" aria-hidden="true"></span><div>
      <div><b>${esc(titelKurz(x.titel))}</b>${neu.has(x.id) ? ' <span class="badge status freigabe">neu</span>' : ''}</div>
      <div class="small muted">${[x.auftraggeber, x.ort].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="small">${esc(hinweis)}${x.link ? ` · <a href="${esc(x.link)}" target="_blank" rel="noopener">Bekanntmachung</a>` : ''}</div></div></li>`;
  }).join('')}</ul></section>`;
}

export function viewAkquise() {
  ensureAkquise();
  const kopf = `<div class="page-head"><div><h1>Genossenschaften &amp; Hausverwaltungen</h1></div></div>`;
  const d = akquise.daten;
  if (!d && akquise.laedt) return kopf + `<div class="empty">Lade Firmenliste …</div>`;
  if (!d || !d.verfuegbar) return kopf + emptyState(d?.hinweis || 'Die Firmenliste ist nicht erreichbar.', d?.befehl || '');
  const tag = heute();
  const faelligIds = new Set(faelligeWiedervorlagen(d.firmen, tag).map(f => f.id));
  const reihe = naechsteFirmen(d.firmen, tag);
  const gewaehlt = akquise.gewaehlt && d.firmen.find(f => f.id === akquise.gewaehlt);
  const f = gewaehlt || reihe[0];
  const rest = reihe.filter(x => x.id !== f?.id).length;
  const haupt = f ? karte(f, d, faelligIds.has(f.id), rest)
    : `<section class="card akq-naechste"><h2>Für heute ist alles erledigt</h2><p>Alle Firmen sind angeschrieben, und keine Firma muss heute wieder angeschrieben werden. Die nächste Firma erscheint hier, sobald ihr Termin zum Nachfassen erreicht ist.</p></section>`;
  return kopf + erklaerung(d.firmen) + haupt + alleFirmen(d, faelligIds) + referenzen(d) + ausschreibungen(d.ausschreibungen, tag);
}

async function speichere(id, eingabe, meldung) {
  try {
    const r = await orgSchreiben('/api/akquise/aendern', { id, ...eingabe });
    const f = akquise.daten?.firmen?.find(x => x.id === id);
    if (f) Object.assign(f, r.firma);
    akquise.gewaehlt = ''; akquise.antwort = '';
    toast(meldung(r.firma || {}), 'ok');
  } catch (e) {
    toast(`Nicht gespeichert: ${e.message}`, 'crit');
  }
  render();
  window.scrollTo?.({ top: 0 });
}

const am = w => (w ? ` – wieder dran am ${fmtDate(w)}` : '');

/** Notiz aus dem Antwort-Feld vor den naechsten Schritt setzen. */
function mitNotiz(f, schritt) {
  const was = document.getElementById('akq-was')?.value.trim() || '';
  const alt = f.notiz || '';
  const basis = was && was !== alt ? was : alt;
  return `${basis}${basis ? '\n' : ''}Nächster Schritt: ${schritt}`.slice(0, 2000);
}

/** Klicks: Kopieren, Karten-Knoepfe, "Oben zeigen". */
export function akquiseKlick(ev) {
  const z = ev.target.closest('[data-akq-zeigen]');
  if (z) {
    akquise.gewaehlt = z.dataset.akqZeigen; akquise.antwort = '';
    render(); window.scrollTo?.({ top: 0 });
    return true;
  }
  const ang = ev.target.closest('[data-akq-angebot]');
  if (ang) {
    const f = akquise.daten?.firmen?.find(x => x.id === ang.dataset.akqAngebot);
    if (f) angebotDialog(f);
    return true;
  }
  const k = ev.target.closest('[data-akq-kopieren]');
  if (k) {
    const f = akquise.daten?.firmen?.find(x => x.id === k.dataset.akqKopieren);
    if (!f || !akquise.daten.vorlage) { toast('Keine Vorlage gefunden.', 'crit'); return true; }
    navigator.clipboard.writeText(nachrichtFuer(akquise.daten.vorlage, f.name)).then(
      () => { k.textContent = 'Kopiert'; setTimeout(() => { k.textContent = 'Text kopieren'; }, 1800); },
      () => toast('Kopieren fehlgeschlagen – Browser erlaubt die Zwischenablage nicht.', 'crit'),
    );
    return true;
  }
  const b = ev.target.closest('[data-akq-aktion]');
  if (!b) return false;
  const id = b.dataset.akqId;
  const f = akquise.daten?.firmen?.find(x => x.id === id);
  if (!f) return true;
  const tag = heute();
  switch (b.dataset.akqAktion) {
    case 'antwort-offen': akquise.antwort = id; render(); document.getElementById('akq-was')?.focus(); break;
    case 'antwort-zu': akquise.antwort = ''; render(); break;
    case 'angeschrieben': speichere(id, { status: 'angeschrieben' }, r => `Gespeichert: angeschrieben${am(r.wiedervorlage)}`); break;
    case 'nachgefasst': speichere(id, { aktion: 'nachgefasst' }, r => `Gespeichert: nachgefasst${am(r.wiedervorlage)}`); break;
    case 'termin': speichere(id, { status: 'termin', notiz: mitNotiz(f, 'Termin vereinbaren'), wiedervorlage: plusTage(tag, SPAETER_TAGE) }, r => `Gespeichert: Termin vereinbaren${am(r.wiedervorlage)}`); break;
    case 'angebot': speichere(id, { status: 'antwort', notiz: mitNotiz(f, 'Angebot schicken'), wiedervorlage: plusTage(tag, SPAETER_TAGE) }, r => `Gespeichert: Angebot schicken${am(r.wiedervorlage)}`); break;
    case 'auftrag': speichere(id, { status: 'auftrag' }, () => 'Gespeichert: Auftrag bekommen'); break;
    case 'kein-interesse': speichere(id, { status: 'kein-interesse' }, () => 'Gespeichert: kein Interesse'); break;
    case 'spaeter': speichere(id, { wiedervorlage: plusTage(tag, SPAETER_TAGE) }, r => `Später${am(r.wiedervorlage)}`); break;
    default: return true;
  }
  return true;
}

/** Keine Formularfelder mehr ausserhalb der Karte - change bleibt fuer Kompatibilitaet. */
export function akquiseAenderung() { return false; }
