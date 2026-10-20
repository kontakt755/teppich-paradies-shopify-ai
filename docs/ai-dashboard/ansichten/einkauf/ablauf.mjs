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
import { esc, fmtDate, plural } from '../../kern/helfer.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { auftragsAblauf } from '../../lib/auftrags-ablauf.mjs';
import {
  einkauf, afEintragFuer, aktiveAuftraege, anzeigeWert, kundeUndOrt,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufLieferanten, musterSchrittKnopf,
} from './auftragsfluss.mjs';

function lieferantName(id) {
  const l = (einkauf.lieferanten?.lieferanten || []).find(x => x.id === id);
  return l?.stammdaten?.name || (id === 'UNGEKLAERT' ? 'Lieferant ungeklärt' : `Lieferant ${id}`);
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
function lieferungHtml(a, ab) {
  const lesend = istNurLesend();
  const muster = ab.positionen.filter(x => x.art === 'muster' && x.rang >= 1 && x.rang < 3).map(x => x.pos);
  const ware = ab.unterwegs.filter(x => x.art === 'ware');
  const zeile = x => `<li class="ab-pos"><span>${esc(titelVon(x.pos))}</span>
    ${lesend ? '' : `<button type="button" class="btn btn-sm" data-af-set data-af-order="${esc(x.pos.orderId)}" data-af-item="${esc(x.pos.lineItemId)}" data-af-name="${esc(x.pos.orderName || '')}" data-af-titel="${esc(x.pos.titel || '')}" data-af-farbe="${esc(x.pos.farbe || '')}" data-af-status="geliefert">Ist eingetroffen</button>`}</li>`;
  const musterHtml = muster.length ? `<div class="ab-pos"><span><span class="small muted">${plural(muster.length, 'Muster', 'Muster')}:</span> ${esc(muster.map(titelVon).join(' · '))}</span>${musterSchrittKnopf(muster)}</div>` : '';
  const wareHtml = ware.length ? `<p class="small muted" style="margin:6px 0 0">Ware unterwegs:</p><ul class="ab-liste">${ware.map(zeile).join('')}</ul>` : '';
  const da = ab.beiUns.some(x => x.art === 'ware') ? '<p class="small" style="margin:6px 0 0">Ware liegt bei uns – Termin für Lieferung oder Montage mit dem Kunden ausmachen.</p>' : '';
  return `${musterHtml}${wareHtml}${da}<p class="small" style="margin:8px 0 0"><a href="#/einkauf?tab=lieferant&auftrag=${encodeURIComponent(a.id)}">Alle Artikel dieses Auftrags bearbeiten →</a></p>`;
}

function auftragKarte(a, daten) {
  const ab = auftragsAblauf(a, daten, afEintragFuer);
  const k = kundeUndOrt(a.id);
  const wer = [k.name, k.ort].filter(Boolean).join(' · ');
  const inhalt = ab.jetzt === 'vorbereiten' ? vorbereitenHtml(a, ab)
    : ab.jetzt === 'lieferung' ? lieferungHtml(a, ab)
    : `<p class="small"><a href="#/einkauf?tab=lieferant&auftrag=${encodeURIComponent(a.id)}">Artikel abschließen →</a></p>`;
  const bestellt = ab.bestelltAm && ab.jetzt !== 'vorbereiten' ? `<span class="small muted">bestellt ${esc(fmtDate(ab.bestelltAm))}</span>` : '';
  return `<section class="card ab-karte${ab.ungeklaert.length ? ' ab-mit-problem' : ''}">
    <div class="ab-kopf"><h3><a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener" title="In Shopify öffnen">${esc(a.name)} ↗</a>${wer ? ` <span class="ab-kunde">${esc(wer)}</span>` : ''}</h3>
      <span class="small muted">eingegangen ${esc(fmtDate(a.datum))}</span>${bestellt}</div>
    ${schrittLeiste(ab)}
    <div class="ab-inhalt">${inhalt}</div>
  </section>`;
}

// Reihenfolge: was jetzt bestellt werden muss zuerst, dann was unterwegs ist, dann der Rest.
const REIHE = { vorbereiten: 0, lieferung: 1, erledigt: 2 };

export function viewEinkaufAblauf() {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  ensureEinkaufLieferanten();
  const d = einkauf.bestellungen;
  if (!d && einkauf.loadingBestellungen) return '<div class="empty">Lade Bestellungen …</div>';
  if (d?.fehler) return stoerungState(d, 'Die Bestelldaten');
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const liste = aktiveAuftraege(d)
    .map(a => ({ a, jetzt: auftragsAblauf(a, d, afEintragFuer).jetzt }))
    .sort((x, y) => (REIHE[x.jetzt] ?? 3) - (REIHE[y.jetzt] ?? 3) || String(y.a.datum).localeCompare(String(x.a.datum)));
  if (!liste.length) return emptyState('Keine offenen Kundenbestellungen.', 'Neue Bestellungen aus dem Shop erscheinen hier von selbst.');
  const zuBestellen = liste.filter(x => x.jetzt === 'vorbereiten').length;
  return `<p class="sub ab-einleitung">${plural(liste.length, 'offene Kundenbestellung', 'offene Kundenbestellungen')}${zuBestellen ? ` · <strong>${zuBestellen} jetzt beim Lieferanten zu bestellen</strong>` : ''}. Jede Karte zeigt, in welchem Schritt der Auftrag steht und was als Nächstes zu tun ist.</p>
    <div class="ab-raster">${liste.map(x => auftragKarte(x.a, d)).join('')}</div>`;
}
