/**
 * Ansicht "Noch zu schneiden" (#/zuschnitt, Benutzer 13.11.2026): eigener Punkt ganz oben in der
 * Seitenleiste. Zeigt jede Unterlage (Daemm- oder Antirutschunterlage als Rollenware) aus einer bezahlten,
 * offenen Bestellung: was zu schneiden ist (Breite × Laenge), ob die Rolle im Laden liegt, und auf welchem
 * Weg sie zum Kunden geht - Hersteller direkt, allein als Paeckchen oder mit dem Teppich eingerollt.
 *
 * Regeln und Gruppen: lib/zuschnitt.mjs. Die Knoepfe sind dieselben wie unter "Von uns abschicken"
 * (einkauf/auftragsfluss.mjs selbstKnoepfe), Klicks verteilt ereignisse.mjs ueber data-Attribute.
 * Zeilen und Karten nutzen die Styles der Startseite (stile/heute.css, stile/optik.css).
 */
import { esc } from '../kern/helfer.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { stoerungState } from '../bausteine/karten.mjs';
import { alterText } from '../lib/todos.mjs';
import { selbstStandText, lieferwegVon } from '../lib/lieferweg.mjs';
import { vorgangsLink } from '../lib/vorgangslink.mjs';
import { mengeKurz } from '../lib/bestellinhalt.mjs';
import { schnittMass, zuschnittStand } from '../lib/zuschnitt.mjs';
import { kunden } from './kunden/gemeinsam.mjs';
import { ensureKundenBestellungen } from './kunden/bestellungen.mjs';
import { einkauf, ensureEinkaufAuftragsstatus, selbstKnoepfe, bestellwegKnoepfe } from './einkauf/auftragsfluss.mjs';

const stand = () => zuschnittStand({ daten: kunden.bestellungen, statusAlle: einkauf.auftragsstatus });

/** Zahl am Menuepunkt: nur, was jetzt wirklich zu schneiden ist. null, solange nichts geladen ist. */
export function zuschnittOffen() {
  const s = stand();
  return s.verfuegbar ? s.schneiden.length : null;
}

const BESTELL_STAND = { bestellt: 'Bestellt, noch nicht da', geliefert: 'Eingetroffen' };

/**
 * Abhaken je Zeile (Benutzer 13.11.2026: "Zugeschnitten" allein reichte nicht - eine direkt beim Hersteller
 * bestellte Unterlage liess sich nur als zugeschnitten abhaken):
 *   Jetzt schneiden   "Zugeschnitten" oder "Bestellt – Hersteller schickt direkt"
 *   Nicht schneiden   ohne belegten Weg beide "Bestellt – …"; mit Vermerk "Zurück auf offen…" zum Korrigieren
 *   Geschnitten       "Gepackt", "Verschickt…", "Rückgängig" wie unter "Von uns abschicken"
 */
function knoepfe(x, erste) {
  const { p } = x;
  if (x.selbst === 'zuschneiden') return selbstKnoepfe(p, x.eintrag, { haupt: erste }) + bestellwegKnoepfe(p, { laden: false });
  if (x.selbst) return selbstKnoepfe(p, x.eintrag, { haupt: erste, rueckgaengig: true });
  if (!(x.eintrag?.status && lieferwegVon(p, x.eintrag)?.belegt)) return bestellwegKnoepfe(p, { laden: !p.lagerware });
  return `<button type="button" class="btn btn-sm btn-ghost" data-af-zurueck="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" data-af-name="${esc(p.orderName || '')}" data-af-titel="${esc(p.titel || '')}" data-af-farbe="${esc(p.farbe || '')}" title="Versehentlich vermerkt? Zurück auf „noch offen“">Zurück auf offen…</button>`;
}

function zeile(x, { erste, lesend }) {
  const { z, p } = x;
  const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
    : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bart: 'ware', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
  const mass = schnittMass(p) || [p.farbe, p.kundenmenge ? mengeKurz(p.kundenmenge) : p.menge].filter(Boolean).join(' · ');
  const was = x.selbst
    ? selbstStandText(x.selbst, lieferwegVon(p, x.eintrag)?.weg, x.eintrag)
    : [p.ohneRolle ? 'Keine Rolle im Laden' : null, x.eintrag?.status === 'bestellt' && x.weg?.art !== 'allein' && x.weg?.art !== 'mit' ? 'Bestellt' : BESTELL_STAND[x.eintrag?.status] || 'noch zu bestellen'].filter(Boolean).join(' – ');
  const alter = x.tage === null ? '' : `<span class="heute-alter${x.ton ? ` ${x.ton}` : ''}">${esc(alterText(x.tage, x.selbst && x.selbst !== 'zuschneiden' ? 'hier' : 'kunde'))}</span>`;
  const wahl = lesend ? '' : knoepfe(x, erste);
  return `<div class="heute-bestellzeile selbst-zeile" data-zuschnitt-zeile="${esc(x.weg?.art || '')}"><div>
      <strong class="zuschnitt-mass">${esc(mass || 'Maß nicht hinterlegt')}</strong>
      <p>${esc(String(p.titel || 'Unterlage').replace(/,\s*Rollenware$/i, ''))} · <a href="${esc(ziel)}">${esc(z.orderName || 'Bestellung')}</a> · ${esc(z.kundenname || 'Kunde nicht hinterlegt')}</p>
      ${x.weg ? `<p class="zuschnitt-weg${x.weg.art === 'unklar' ? ' warn' : ''}"><strong>${esc(x.weg.kurz)}</strong> ${esc(x.weg.text)}</p>` : ''}
      <p class="selbst-stand"><span>${esc(was)}</span> ${alter}</p></div>
      ${wahl ? `<div class="selbst-knoepfe">${wahl}</div>` : ''}</div>`;
}

function abschnitt(titel, satz, zeilen, opt) {
  if (!zeilen.length) return '';
  return `<section class="heute-geschaeft selbst-abschicken"><div class="heute-geschaeft-kopf">
    <h2>${esc(titel)} · ${zeilen.length}</h2><p>${esc(satz)}</p></div>
    ${zeilen.map((x, i) => zeile(x, { ...opt, erste: opt.haupt && i === 0 })).join('')}</section>`;
}

export function viewZuschnitt() {
  ensureKundenBestellungen(); ensureEinkaufAuftragsstatus();
  const kopf = `<div class="page-head"><div><h1>Noch zu schneiden</h1>
    <p class="sub">Hier siehst du, welche Unterlagen noch aus der Rolle zu schneiden sind und wie sie zum Kunden gehen.</p></div></div>`;
  const d = kunden.bestellungen;
  if (!d) return `${kopf}<div class="empty">Lade Bestellungen …</div>`;
  if (!d.verfuegbar) return kopf + stoerungState(d, 'Die Bestellungen');
  const s = stand();
  const lesend = istNurLesend();
  // Eine beschaedigte Liste sagt es laut - sonst saehe die Seite aus wie "nichts zu schneiden".
  const fehler = s.fehler ? `<p class="notice crit" role="alert">${esc(s.fehler)} Deshalb steht hier gerade nichts.</p>` : '';
  const leer = !fehler && !s.schneiden.length ? '<div class="empty"><strong>Nichts zu schneiden.</strong> Sobald eine bezahlte Bestellung eine Unterlage aus der Rolle enthält, steht sie hier.</div>' : '';
  return `${kopf}<div class="zuschnitt">${fehler}${leer}
    ${abschnitt('Jetzt schneiden', 'Die Rolle liegt im Laden. Nach dem Schneiden „Zugeschnitten“ drücken. Schickt der Hersteller diese Unterlage doch direkt, das stattdessen abhaken.', s.schneiden, { lesend, haupt: true })}
    ${abschnitt('Geschnitten – noch nicht verschickt', 'Liegt fertig hier. Der Versandweg sagt, ob es allein rausgeht oder auf den Teppich wartet. Falsch abgehakt? „Rückgängig“ bringt die Zeile zurück.', s.hier, { lesend })}
    ${abschnitt('Nicht schneiden', 'Keine Rolle im Laden oder der Hersteller schickt direkt. Hier ist für die Schere nichts zu tun. Ist die Unterlage bestellt, bitte abhaken, wie sie kommt.', s.bestellen, { lesend })}
  </div>`;
}
