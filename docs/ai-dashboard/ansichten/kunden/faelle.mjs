/**
 * Kunden, Reiter "Zu tun": alles offene je Kunde in einem Eintrag. Im Laden
 * denkt niemand in Aufgabenarten ("Bestellungen", "Angebote", "Warenkoerbe"),
 * sondern in Kunden: wer wartet auf was, und was mache ich als Naechstes.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, toast, fmtPreis } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { kunden } from './gemeinsam.mjs';

export function ensureKundenFaelle() {
  if (kunden.faelle || kunden.loadingFaelle) return;
  kunden.loadingFaelle = true;
  fetchEinkauf('/api/kunden/faelle').then(d => {
    kunden.faelle = d; kunden.loadingFaelle = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

const FALL_QUELLE_LABEL = { bestellung: 'Bestellung', angebot: 'Angebot', warenkorb: 'Warenkorb' };
const DRINGEND_LABEL = ['sofort', 'bald', 'wenn Zeit ist'];

function fallKontakt(f) {
  const teile = [];
  if (f.telefon) teile.push(`<a href="tel:${esc(String(f.telefon).replace(/\s/g, ''))}" onclick="event.stopPropagation()">${esc(f.telefon)}</a>`);
  if (f.email) teile.push(`<a href="mailto:${esc(f.email)}" onclick="event.stopPropagation()">${esc(f.email)}</a>`);
  return teile.length ? teile.join(' · ') : '<span class="muted">kein Kontakt hinterlegt</span>';
}

/** Ein Punkt: was der Kunde moechte und was als Naechstes zu tun ist. */
function fallPunkt(p) {
  const produkte = (p.produkte || []).filter(x => x.handle);
  const nachschlagen = produkte.length
    ? ` <a class="small" href="#/lexikon?handle=${encodeURIComponent(produkte[0].handle)}" onclick="event.stopPropagation()">im Lexikon nachschlagen →</a>`
    : '';
  const klasse = p.schritt.dringend === 0 ? 'crit' : p.schritt.dringend === 1 ? 'gap' : 'plain';
  return `<li class="fall-punkt">
    <div><span class="badge ${klasse}">${esc(p.schritt.text)}</span></div>
    <div class="small">${esc(FALL_QUELLE_LABEL[p.quelle] || p.quelle)}${p.bezug ? ` ${esc(p.bezug)}` : ''}${p.tage !== null ? ` · seit ${p.tage === 0 ? 'heute' : `${p.tage} Tagen`}` : ''}${p.betrag ? ` · ${esc(fmtPreis(p.betrag))} ${esc(p.waehrung)}` : ''}</div>
    <div class="small">${p.moechte.length ? esc(p.moechte.join(' · ')) : '<span class="muted">keine Positionen</span>'}${nachschlagen}</div>
    ${p.adminUrl ? `<a class="small" href="${esc(p.adminUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">In Shopify öffnen ↗</a>` : ''}
  </li>`;
}

const FALL_GRUND_LABEL = { erledigt: 'Erledigt', test: 'Kein echter Kunde' };

/**
 * Die Karte hatte bis hierher keinen einzigen Knopf: man konnte einen Fall
 * weder abhaken noch als eigenen Testkauf kennzeichnen. Zwei Testkaeufe
 * standen deshalb mit den groessten Betraegen ueber dem groessten echten Fall.
 * Geloescht wird nichts - die Marke liegt lokal, Shopify bleibt unberuehrt.
 */
export function fallKarte(f, { ausgeblendet = false } = {}) {
  const stufe = DRINGEND_LABEL[f.dringend] || '';
  const aktionen = ausgeblendet
    ? (f.marke?.automatisch
      ? `<span class="small muted">automatisch erkannt (Testadresse)</span>`
      : `<button type="button" class="btn btn-sm" data-fall-marke="${esc(f.schluessel)}" data-grund="">Wieder einblenden</button>`)
    : `<button type="button" class="btn btn-sm" data-fall-marke="${esc(f.schluessel)}" data-grund="erledigt" title="Ist erledigt – aus der Arbeitsliste nehmen">✓ Erledigt</button>
       <button type="button" class="btn btn-sm" data-fall-marke="${esc(f.schluessel)}" data-grund="test" title="Eigener Testkauf, kein Kunde">Kein echter Kunde</button>`;
  return `<section class="card fall${f.dringend === 0 && !ausgeblendet ? ' fall-sofort' : ''}${ausgeblendet ? ' fertig' : ''}" style="margin-bottom:12px">
    <div class="card-head">
      <h3>${esc(f.name)} <span class="small muted">${ausgeblendet ? esc(FALL_GRUND_LABEL[f.marke?.grund] || 'ausgeblendet') : esc(stufe)}</span></h3>
      <span class="small">${f.summe ? `${esc(fmtPreis(f.summe))} €` : ''}</span>
    </div>
    <p class="small" style="margin:0 0 8px">${fallKontakt(f)}${f.ort ? ` · ${esc(f.ort)}` : ''}</p>
    <ul class="fall-punkte">${f.punkte.map(fallPunkt).join('')}</ul>
    <div class="fall-aktionen">${aktionen}</div>
  </section>`;
}

/** Setzt oder loescht eine Marke und laedt die Liste neu. */
export async function fallMarkeSetzen(schluessel, grund) {
  try {
    await orgSchreiben('/api/kunden/fall-marke', { schluessel, grund: grund || null });
    kunden.faelle = null;                 // Liste neu holen, sonst bleibt der Fall stehen
    toast(grund ? `${FALL_GRUND_LABEL[grund]} – aus der Liste genommen` : 'Wieder in der Liste');
    render();
  } catch (err) {
    toast(`Fehler: ${err.message}`, 'crit');
  }
}

export function viewKundenFaelle() {
  ensureKundenFaelle();
  const d = kunden.faelle;
  if (!d && kunden.loadingFaelle) return `<div class="empty">Lade offene Fälle …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die offenen Fälle');
  if (!d || !d.verfuegbar) return emptyState('Keine Daten verfügbar.', d?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  const aus = d.ausgeblendet || [];
  // Ausgeblendetes verschwindet nicht spurlos - sonst sucht man den Fall, den
  // man gerade abgehakt hat, und weiss nicht, wohin er ist.
  const ausBlock = aus.length
    ? `<details style="margin-top:14px"><summary class="small muted" style="cursor:pointer">Ausgeblendet (${aus.length}) – Testkäufe und Abgehaktes</summary>
        <div style="margin-top:10px">${aus.map(f => fallKarte(f, { ausgeblendet: true })).join('')}</div></details>`
    : '';
  if (!d.faelle.length) {
    return emptyState('Nichts offen.', 'Keine Bestellung, kein Angebot und kein Warenkorb wartet gerade auf eine Antwort.') + ausBlock;
  }
  return `
    <p class="small muted" style="margin:0 0 10px">${d.anzahl} ${d.anzahl === 1 ? 'Kunde wartet' : 'Kunden warten'}${d.sofort ? `, davon ${d.sofort} sofort` : ''} · dringendstes zuerst, bei gleicher Stufe das älteste</p>
    ${d.faelle.map(f => fallKarte(f)).join('')}
    ${ausBlock}`;
}

/** Startseite: die drei dringendsten Kunden - der Rest steht im Reiter. */
export function heuteFaelle() {
  ensureKundenFaelle();
  const d = kunden.faelle;
  if (!d || !d.verfuegbar || !d.faelle.length) return '';
  const oben = d.faelle.slice(0, 3);   // ausgeblendete sind hier schon raus
  return `<h2 class="section-title">Wer wartet auf was <span class="section-note">${d.anzahl} ${d.anzahl === 1 ? 'Kunde' : 'Kunden'}${d.sofort ? `, ${d.sofort} sofort` : ''}</span></h2>
    ${oben.map(f => fallKarte(f)).join('')}
    ${d.faelle.length > 3 ? `<p class="small muted" style="margin:-4px 0 0">+${d.faelle.length - 3} weitere – <a href="#/kunden?tab=zutun">alle ansehen →</a></p>` : ''}`;
}
