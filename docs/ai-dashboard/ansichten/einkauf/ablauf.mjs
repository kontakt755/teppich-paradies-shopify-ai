/**
 * Einkauf, Reiter "Je Auftrag": jede offene Kundenbestellung als Schritt-Liste
 * (eingegangen -> Lieferantenbestellung vorbereiten -> bestellt -> Ware da -> erledigt).
 *
 * Nichts neu gebaut: die Bestellnachricht kommt aus dem vorhandenen Bestellmail-Dialog
 * (/api/einkauf/bestellmail, hier auf den einen Auftrag gefiltert), "abhaken" ist dessen
 * "Als bestellt markieren", "Ist eingetroffen" der bekannte Auftragsfluss-Knopf. Fuer alles
 * Weitere (An Kunden raus, Versand buchen) fuehrt ein Link in die Lieferanten-Ansicht dieses Auftrags.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { orgSchreiben } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { auftragsAblauf, einordnung, kundenNachricht, nachfrageNachricht, VERZUG_WERKTAGE } from '../../lib/auftrags-ablauf.mjs';
import { referenzKnopf } from './referenz.mjs';
import { lieferantName as lieferantAnzeige } from '../../lib/einkauf-lieferanten.mjs';
import {
  einkauf, afEintragFuer, aktiveAuftraege, anzeigeWert, kundeUndOrt,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufLieferanten, musterSchrittKnopf,
} from './auftragsfluss.mjs';

function lieferantName(id) {
  return lieferantAnzeige(id, einkauf.lieferanten?.lieferanten || []);
}

const titelVon = p => [anzeigeWert(p.titel || ''), p.farbe].filter(Boolean).join(' · ');

function schrittLeiste(ab) {
  return `<ol class="ab-schritte">${ab.schritte.map((s, i) => `<li class="ab-schritt ab-${s.stand}"${s.stand === 'jetzt' ? ' aria-current="step"' : ''}><span class="ab-nr" aria-hidden="true">${s.stand === 'fertig' ? '✓' : i + 1}</span><span class="ab-text">${esc(s.label)}</span></li>`).join('')}</ol>`;
}

/** Schritt 2: je Lieferant ein Knopf, der die fertige Bestellnachricht fuer genau diesen Auftrag zeigt. */
function vorbereitenHtml(a, ab) {
  const lesend = istNurLesend();
  const knoepfe = ab.lieferanten.map(g => {
    const n = g.positionen.length;
    const wort = g.art === 'muster' ? 'Muster' : 'Artikel';
    return `<div class="ab-lief">
      <div class="ab-lief-text"><strong>${esc(lieferantName(g.lieferant))}</strong> <span class="small muted">· ${plural(n, wort, wort)}</span>
        <div class="small muted">${esc(g.positionen.map(x => titelVon(x.pos)).join(' · '))}</div></div>
      ${lesend ? '' : `<button type="button" class="btn btn-primary btn-sm" data-lf-mail="${esc(g.lieferant)}" data-lf-art="${g.art}" data-lf-auftrag="${esc(a.id)}">Bestellnachricht zeigen</button>`}
    </div>`;
  }).join('');
  const offen = ab.ungeklaert.length ? `<div class="notice warn ab-ungeklaert"><strong>Ungeklärt – erst klären, nicht raten (${ab.ungeklaert.length}):</strong>
      <ul>${ab.ungeklaert.map(x => `<li>${esc(titelVon(x.pos))} – ${esc(x.fehlt.join(', '))}</li>`).join('')}</ul>
      <span class="small">Fehlende Angaben stehen unter <a href="#/einkauf?tab=produktdaten">Produktdaten</a>.</span></div>` : '';
  const leer = !knoepfe && !offen ? '<p class="small muted">Für diesen Auftrag ist nichts beim Lieferanten zu bestellen.</p>' : '';
  const hinweis = knoepfe ? '<p class="small muted ab-hinweis">Die Nachricht ist fertig ausgefüllt (Artikelnummer, Farbe, Menge, Lieferadresse). Öffnen oder kopieren, selbst abschicken, danach „Als bestellt markieren“ – so ist Schritt 3 abgehakt. Es wird nichts automatisch gesendet.</p>' : '';
  return `${knoepfe ? `<div class="ab-lieferanten">${knoepfe}</div>` : ''}${hinweis}${offen}${leer}`;
}

/**
 * Schritt 4: was unterwegs ist bzw. bei uns liegt. Muster bekommen den gemeinsamen Knopf der
 * Lieferanten-Ansicht ("Alle 3 angekommen" / "Verschicken…"), Ware je Artikel "Ist eingetroffen".
 */
function lieferungHtml(a, ab, e) {
  const lesend = istNurLesend();
  const muster = ab.positionen.filter(x => x.art === 'muster' && x.rang >= 1 && x.rang < 3).map(x => x.pos);
  const ware = ab.unterwegs.filter(x => x.art === 'ware');
  const zeile = x => `<li class="ab-pos"><span>${esc(titelVon(x.pos))}</span>
    ${lesend ? '' : `<button type="button" class="btn btn-sm" data-af-set data-af-order="${esc(x.pos.orderId)}" data-af-item="${esc(x.pos.lineItemId)}" data-af-name="${esc(x.pos.orderName || '')}" data-af-titel="${esc(x.pos.titel || '')}" data-af-farbe="${esc(x.pos.farbe || '')}" data-af-status="geliefert">Ist eingetroffen</button>`}</li>`;
  const musterHtml = muster.length ? `<div class="ab-pos"><span><span class="small muted">${plural(muster.length, 'Muster', 'Muster')}:</span> ${esc(muster.map(titelVon).join(' · '))}</span>${musterSchrittKnopf(muster)}</div>` : '';
  const wareHtml = ware.length ? `<p class="small muted" style="margin:6px 0 0">Ware unterwegs:</p><ul class="ab-liste">${ware.map(zeile).join('')}</ul>` : '';
  return `${verzugHtml(a, ab, e)}${musterHtml}${wareHtml}${informierenHtml(a, e)}${terminHtml(a)}<p class="small" style="margin:8px 0 0"><a href="#/einkauf?tab=lieferant&auftrag=${encodeURIComponent(a.id)}">Alle Artikel dieses Auftrags bearbeiten →</a></p>`;
}

function auftragKarte({ a, ab, e }) {
  const k = kundeUndOrt(a.id);
  const wer = [k.name, k.ort].filter(Boolean).join(' · ');
  const inhalt = ab.jetzt === 'vorbereiten' ? vorbereitenHtml(a, ab)
    : ab.jetzt === 'lieferung' ? lieferungHtml(a, ab, e)
    : `<p class="small"><a href="#/einkauf?tab=lieferant&auftrag=${encodeURIComponent(a.id)}">Artikel abschließen →</a>${ab.jetzt === 'erledigt' ? referenzKnopf(a) : ''}</p>`;
  const bestellt = ab.bestelltAm && ab.jetzt !== 'vorbereiten' ? `<span class="small muted">bestellt ${esc(fmtDate(ab.bestelltAm))}</span>` : '';
  return `<section class="card ab-karte${ab.ungeklaert.length || e.verzug.length ? ' ab-mit-problem' : ''}">
    <div class="ab-kopf"><h3><a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener" title="In Shopify öffnen">${esc(a.name)} ↗</a>${wer ? ` <span class="ab-kunde">${esc(wer)}</span>` : ''}</h3>
      <span class="small muted">eingegangen ${esc(fmtDate(a.datum))}</span>${bestellt}</div>
    ${schrittLeiste(ab)}
    <div class="ab-inhalt">${inhalt}</div>
  </section>`;
}

/**
 * Termin beim Kunden (Lieferung/Verlegung): ein Datumsfeld, sonst nichts. Am Vortag steht auf
 * "Heute" das To-do "Kunde an Termin morgen erinnern" mit fertigem Text (lib/todos.mjs).
 */
function terminHtml(a) {
  const t = einkauf.bestellungen?.kundentermine?.[a.id]?.termin || '';
  // Erst nach "Kunde informiert" - vorher gibt es keinen Termin, und Muster-Karten bleiben ruhig.
  if (!t && !informiertFuer(a.id)) return '';
  if (istNurLesend()) return t ? `<p class="small" style="margin:8px 0 0">Termin: ${esc(fmtDate(t))}</p>` : '';
  return `<p class="small ab-termin" style="margin:8px 0 0"><label>Termin <input type="date" value="${esc(t)}" data-ab-termin="${esc(a.id)}"></label></p>`;
}

const informiertFuer = id => einkauf.bestellungen?.kundeInformiert?.[id] || null;

/** Schritt 4, Ware bei uns: Kunde informieren - fertiger Text, danach abhaken. */
function informierenHtml(a, e) {
  if (!e.wareDa.length) return '';
  const inf = informiertFuer(a.id);
  if (inf) return `<p class="small ab-informiert" style="margin:8px 0 0">✓ Kunde informiert am ${esc(fmtDate(inf.am))}${inf.von ? ` (${esc(inf.von)})` : ''} – Termin für Lieferung, Verlegung oder Abholung abstimmen.${referenzKnopf(a)}</p>`;
  const lesend = istNurLesend();
  return `<div class="notice warn ab-aktion"><strong>Ware ist da – Kunde noch nicht informiert.</strong>
    ${lesend ? '' : `<div class="ab-knoepfe"><button type="button" class="btn btn-primary btn-sm" data-ab-kunde="${esc(a.id)}">Nachricht an Kunde</button>
    <button type="button" class="btn btn-sm" data-ab-informiert="${esc(a.id)}">Kunde informiert</button></div>`}</div>`;
}

/** Bestellt, aber nach mehr als 10 Werktagen (bzw. nach dem bestaetigten Termin) nicht da. */
function verzugHtml(a, ab, e) {
  if (!e.verzug.length) return '';
  const max = Math.max(...e.verzug.map(x => x.werktage));
  return `<div class="notice warn ab-aktion"><strong>Beim Lieferanten nachfragen:</strong> ${plural(e.verzug.length, 'Artikel', 'Artikel')} seit ${max} Werktagen bestellt und noch nicht da.
    ${istNurLesend() ? '' : `<div class="ab-knoepfe"><button type="button" class="btn btn-sm" data-ab-nachfrage="${esc(a.id)}">Nachfrage-Nachricht</button></div>`}</div>`;
}

/** Dialog mit fertigem Text: kopieren oder im Mailprogramm oeffnen - abgeschickt wird nur von Hand. */
function textDialog({ titel, an, telefon, betreff, text, nachher = '' }) {
  const mailto = an ? `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}` : '';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="abTxtTitel" data-dialog>
    <h2 id="abTxtTitel">${esc(titel)}</h2>
    <p class="small">${an ? `An: <b>${esc(an)}</b>` : '<span class="muted">Keine E-Mail-Adresse hinterlegt – Text kopieren.</span>'}${telefon ? ` · Telefon: <a href="tel:${esc(telefon.replace(/[^\d+]/g, ''))}">${esc(telefon)}</a>` : ''}<br>Betreff: ${esc(betreff)}</p>
    <textarea id="abTxt" class="ab-text-feld" rows="12" readonly>${esc(text)}</textarea>
    <p class="small muted">Es wird nichts automatisch gesendet.</p>
    ${nachher}
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button>
      <button type="button" class="btn" data-kopieren="abTxt">Text kopieren</button>
      ${mailto ? `<a class="btn btn-primary" href="${esc(mailto)}">Im Mailprogramm öffnen</a>` : ''}</div>
  </div></div>`;
  $('#dialogRoot [data-kopieren]')?.focus();
}

const echt = v => (v && v !== '–' && v !== 'UNGEKLAERT' ? String(v).trim() : '');

function auftragUndAblauf(id) {
  const d = einkauf.bestellungen;
  const a = (d?.auftraege || []).find(x => String(x.id) === String(id));
  return a ? { a, ab: auftragsAblauf(a, d, afEintragFuer) } : null;
}

function kundeDialog(id) {
  const x = auftragUndAblauf(id); if (!x) return;
  const { a, ab } = x;
  const k = a.details?.kunde || {};
  const { betreff, text } = kundenNachricht({ auftragName: a.name, kundeName: kundeUndOrt(a.id).name, artikel: ab.beiUns.filter(y => y.art === 'ware').map(y => titelVon(y.pos)) });
  textDialog({ titel: `Nachricht an Kunde · ${a.name}`, an: echt(k.email), telefon: echt(k.telefon), betreff, text,
    nachher: `<p class="small">Nachricht verschickt oder angerufen? <button type="button" class="btn btn-sm" data-ab-informiert="${esc(a.id)}">Kunde informiert</button></p>` });
}

function nachfrageDialog(id) {
  const x = auftragUndAblauf(id); if (!x) return;
  const { a, ab } = x;
  const e = einordnung(ab, informiertFuer(a.id));
  // Je Lieferant eine Nachricht; meist ist es einer.
  const je = new Map();
  for (const v of e.verzug) { if (!je.has(v.lieferant)) je.set(v.lieferant, []); je.get(v.lieferant).push(v); }
  const [lief, positionen] = [...je.entries()][0] || [];
  if (!lief) return;
  const st = (einkauf.lieferanten?.lieferanten || []).find(l => l.id === lief)?.stammdaten || {};
  const { betreff, text } = nachfrageNachricht({ auftragName: a.name, positionen });
  textDialog({ titel: `Nachfrage bei ${lieferantName(lief)} · ${a.name}`, an: echt(st.ware?.mail), telefon: echt(st.ware?.telefon), betreff, text,
    nachher: je.size > 1 ? `<p class="small muted">Weitere Lieferanten im Verzug: ${esc([...je.keys()].slice(1).map(lieferantName).join(', '))} – über „Alle Artikel dieses Auftrags bearbeiten“.</p>` : '' });
}

async function markiereInformiert(id, knopf) {
  knopf.disabled = true;
  try {
    const r = await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'schritt', orderId: id, schritt: 'kunde_informiert' });
    const am = new Date().toISOString();
    einkauf.bestellungen.kundeInformiert = { ...(einkauf.bestellungen.kundeInformiert || {}), [id]: { am, von: state.session?.benutzer?.name || null } };
    toast(r?.ok ? 'Kunde informiert – eingetragen' : 'Gespeichert');
    $('#dialogRoot').innerHTML = '';
    render();
  } catch (err) {
    toast(`Nicht gespeichert: ${err.message}`, 'crit');
    knopf.disabled = false;
  }
}

/** Datumsfeld "Termin" (change). true = Ereignis erledigt. */
export function einkaufAenderungAblauf(ev) {
  const f = ev.target.closest?.('[data-ab-termin]');
  if (!f) return false;
  const orderId = f.dataset.abTermin;
  const termin = f.value || '';
  f.disabled = true;
  orgSchreiben('/api/einkauf/kundentermin', { orderId, termin }).then(() => {
    const alle = { ...(einkauf.bestellungen.kundentermine || {}) };
    if (termin) alle[orderId] = { termin }; else delete alle[orderId];
    einkauf.bestellungen.kundentermine = alle;
    toast(termin ? `Termin ${fmtDate(termin)} gespeichert` : 'Termin entfernt');
  }, err => toast(`Nicht gespeichert: ${err.message}`, 'crit')).finally(() => { f.disabled = false; });
  return true;
}

/** Klicks im Reiter "Je Auftrag". true = Ereignis erledigt. */
export function einkaufKlickAblauf(ev) {
  const k = ev.target.closest('[data-ab-kunde]');
  if (k) { kundeDialog(k.dataset.abKunde); return true; }
  const n = ev.target.closest('[data-ab-nachfrage]');
  if (n) { nachfrageDialog(n.dataset.abNachfrage); return true; }
  const i = ev.target.closest('[data-ab-informiert]');
  if (i) { markiereInformiert(i.dataset.abInformiert, i); return true; }
  return false;
}

const GRUND_TEXT = { bestellen: 'bestellen', ungeklaert: 'klären', informieren: 'Kunde informieren', muster_da: 'Muster verschicken', verzug: 'nachfragen' };
// Filter aus den Zahlen auf "Heute" (?ab=…): genau diese Auftraege.
const FILTER = {
  bestellen: { label: 'Zu bestellen', passt: e => e.gruende.includes('bestellen') || e.gruende.includes('ungeklaert') },
  informieren: { label: 'Kunde informieren', passt: e => e.gruende.includes('informieren') },
  verzug: { label: 'Verzug beim Lieferanten', passt: e => e.gruende.includes('verzug') },
};

/** Eingeklappte Gruppe; offen per Parameter, damit ein Neuzeichnen nichts zuklappt. */
function gruppe(key, titel, unter, liste) {
  if (!liste.length) return '';
  const auf = state.route.params.get('abg') === key;
  return `<section class="ab-gruppe">
    <button type="button" class="ab-gruppe-kopf" data-param="abg" data-value="${auf ? '' : key}" aria-expanded="${auf}">
      <span class="ab-pfeil" aria-hidden="true">${auf ? '▾' : '▸'}</span> ${esc(titel)} (${liste.length}) <span class="small muted">${esc(unter)}</span></button>
    ${auf ? `<div class="ab-raster">${liste.map(auftragKarte).join('')}</div>` : ''}
  </section>`;
}

export function viewEinkaufAblauf() {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  ensureEinkaufLieferanten();
  const d = einkauf.bestellungen;
  if (!d && einkauf.loadingBestellungen) return '<div class="empty">Lade Bestellungen …</div>';
  if (d?.fehler) return stoerungState(d, 'Die Bestelldaten');
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  // Aeltestes zuerst: wer am laengsten wartet, ist am dringendsten.
  const liste = aktiveAuftraege(d)
    .map(a => { const ab = auftragsAblauf(a, d, afEintragFuer); return { a, ab, e: einordnung(ab, informiertFuer(a.id)) }; })
    .sort((x, y) => String(x.a.datum).localeCompare(String(y.a.datum)));
  if (!liste.length) return emptyState('Keine offenen Kundenbestellungen.', 'Neue Bestellungen aus dem Shop erscheinen hier von selbst.');
  const f = FILTER[state.route.params.get('ab')];
  if (f) {
    const treffer = liste.filter(x => f.passt(x.e));
    return `<p class="sub ab-einleitung"><strong>${esc(f.label)}: ${treffer.length}</strong> · <a href="#/einkauf">Alle Aufträge zeigen</a></p>
      ${treffer.length ? `<div class="ab-raster">${treffer.map(auftragKarte).join('')}</div>` : '<p class="small muted">Gerade nichts – alles erledigt.</p>'}`;
  }
  const jetzt = liste.filter(x => x.e.gruppe === 'jetzt');
  const zaehl = g => liste.filter(x => x.e.gruende.includes(g)).length;
  const teile = Object.keys(GRUND_TEXT).map(g => [g, zaehl(g)]).filter(([, n]) => n).map(([g, n]) => `${n} ${GRUND_TEXT[g]}`);
  return `<p class="sub ab-einleitung">${jetzt.length ? `<strong>${plural(jetzt.length, 'Auftrag', 'Aufträge')} jetzt zu tun</strong> (${esc(teile.join(' · '))})` : '<strong>Gerade nichts zu tun.</strong>'} · älteste zuerst.</p>
    ${jetzt.length ? `<h2 class="ab-titel">Jetzt zu tun</h2><div class="ab-raster">${jetzt.map(auftragKarte).join('')}</div>` : ''}
    ${gruppe('unterwegs', 'Unterwegs', `beim Lieferanten bestellt, kommt noch – Nachfrage erst nach ${VERZUG_WERKTAGE} Werktagen`, liste.filter(x => x.e.gruppe === 'unterwegs'))}
    ${gruppe('kunde', 'Beim Kunden', 'Kunde informiert oder Ware raus – Termin bzw. Abschluss', liste.filter(x => x.e.gruppe === 'beiKunde'))}`;
}
