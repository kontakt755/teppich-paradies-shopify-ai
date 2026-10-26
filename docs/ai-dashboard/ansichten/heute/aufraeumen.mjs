/**
 * "Alte Bestellungen aufräumen" auf der Shop-Uebersicht (Inhaber 2026-10-26, #1698). Nur sichtbar,
 * wenn es Faelle gibt. Regeln: lib/aufraeumen.mjs - der Server haengt `aufraeumen` an jede Zeile
 * von /api/kunden/bestellungen. Die Knoepfe nutzen vorhandene Wege, keinen eigenen Schreibpfad:
 * - "Abschließen": wie "Kunde fertig" (/api/kunden/bestellung-fertig) mit dem Vorschlag als Vermerk;
 *   bucht in Shopify als versendet, ohne Mail an den Kunden (Abschnitt 24 der Architektur).
 * - "Läuft noch": Notiz in der Zeitleiste - eine neue Bewegung, die Liste fragt erst spaeter wieder.
 * Gepackter Umschlag ohne Versandvermerk (#1709) statt dessen:
 * - "Ist verschickt…": der Versanddialog wie an der Zeitleiste, Versandmail vorab aus (der Kunde hat
 *   die Muster meist schon); danach laeuft das Nachfassen normal weiter.
 * - "Liegt noch hier": Notiz wie "Läuft noch", die Liste fragt nach drei Tagen wieder.
 */
import { esc, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { state } from '../../kern/zustand.mjs';
import { render } from '../../kern/render.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';
import { aufraeumListe, aufraeumenAbTagen, AUFRAEUMEN_AB_TAGEN, GEPACKT_OHNE_VERSAND_AB_TAGEN } from '../../lib/aufraeumen.mjs';
import { vorgangsLink } from '../../lib/vorgangslink.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { einkauf } from '../einkauf/auftragsfluss.mjs';
import { oeffneVersandDialog } from '../einkauf/versand.mjs';

const SICHTBAR = 5;
export const LAEUFT_NOCH_NOTIZ = 'Läuft noch – beim Aufräumen bestätigt';
export const LIEGT_NOCH_NOTIZ = 'Umschlag liegt noch hier – beim Aufräumen bestätigt';

function zeile(z, lesend) {
  const a = z.aufraeumen;
  const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
    : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
  const art = a.art === 'muster' ? 'Musterbestellung' : 'Warenbestellung';
  const gepackt = a.grund === 'gepackt';
  const abschliessen = lesend ? ''
    : gepackt ? `<button type="button" class="btn btn-sm" data-aufraeumen-verschickt="${esc(z.orderId)}" title="Versand eintragen und in Shopify buchen – Versandmail vorab aus">Ist verschickt…</button>`
    : a.lineItemIds.length ? `<button type="button" class="btn btn-sm" data-aufraeumen-abschliessen="${esc(z.orderId)}" title="Alle offenen Artikel auf „Erledigt“ – in Shopify als versendet gebucht, ohne Mail an den Kunden">Abschließen</button>` : '';
  const laeuft = lesend ? '' : `<button type="button" class="btn btn-sm" data-aufraeumen-laeuft="${esc(z.orderId)}" title="Bleibt offen; die Liste fragt in ${aufraeumenAbTagen(a)} Tagen wieder">${gepackt ? 'Liegt noch hier' : 'Läuft noch'}</button>`;
  return `<div class="heute-bestellzeile" data-aufraeumen="${esc(z.orderId)}"><div>
      <strong>${esc(z.kundenname || 'Kunde nicht hinterlegt')} · ${esc(z.orderName || 'Bestellung')}</strong>
      <p>${esc(art)} · seit ${esc(plural(a.tage, 'Tag', 'Tagen'))} keine Bewegung${a.belege.length ? ` · ${esc(a.belege.join(' · '))}` : ''}</p>
      <p class="aufraeumen-vorschlag">Vorschlag: ${esc(a.vorschlag.text)}</p>
    </div>
    <div class="aufraeumen-knoepfe">${abschliessen}${laeuft}<a class="btn btn-sm btn-ghost" href="${esc(ziel)}">Ansehen</a></div>
  </div>`;
}

/** Block fuer die Shop-Uebersicht. Leer, solange nichts liegen geblieben ist - eine 0 ist kein Auftrag. */
export function aufraeumenBlock({ daten, lesend = false } = {}) {
  if (!daten?.verfuegbar) return '';
  const liste = aufraeumListe(daten.zeilen);
  if (!liste.length) return '';
  const oben = liste.slice(0, SICHTBAR);
  const rest = liste.slice(SICHTBAR);
  return `<section class="heute-geschaeft" aria-labelledby="heuteAufraeumen"><div class="heute-geschaeft-kopf">
    <h2 id="heuteAufraeumen">Alte Bestellungen aufräumen · ${liste.length}</h2>
    <p>Hier stehen offene Bestellungen, bei denen sich seit ${AUFRAEUMEN_AB_TAGEN.muster} Tagen (Ware ${AUFRAEUMEN_AB_TAGEN.ware}) nichts getan hat und nichts belegt, dass sie fertig sind, und gepackte Umschläge, die nach ${GEPACKT_OHNE_VERSAND_AB_TAGEN} Tagen noch nicht als verschickt eingetragen sind. Bitte prüfen.</p></div>
    ${oben.map(z => zeile(z, lesend)).join('')}
    ${rest.length ? `<details class="heute-rest"><summary>Alle anzeigen (+${rest.length})</summary>${rest.map(z => zeile(z, lesend)).join('')}</details>` : ''}
  </section>`;
}

/** Bestellliste frisch holen und erst dann tauschen - so springt die Seite nicht auf "Lade …". */
async function ladeNeu() {
  einkauf.auftragsstatus = null;
  const d = await fetchEinkauf('/api/kunden/bestellungen');
  if (d?.verfuegbar) kunden.bestellungen = d;
  if (['heute', 'kunden'].includes(state.route.view)) render();
}

async function abschliessen(knopf) {
  const z = (kunden.bestellungen?.zeilen || []).find(x => x.orderId === knopf.dataset.aufraeumenAbschliessen);
  const a = z?.aufraeumen;
  if (!a?.lineItemIds?.length || istNurLesend()) return;
  const frage = `${z.orderName}: ${plural(a.lineItemIds.length, 'Artikel', 'Artikel')} abschließen?\n\nVermerk: ${a.vorschlag.notiz}\n\nIn Shopify wird die Bestellung als versendet gebucht – ohne Mail an den Kunden.`;
  if (!window.confirm(frage)) return;
  knopf.disabled = true;
  try {
    const j = await orgSchreiben('/api/kunden/bestellung-fertig', { orderId: z.orderId, lineItemIds: a.lineItemIds, notiz: a.vorschlag.notiz });
    const r = versandRueckmeldung(`${z.orderName} abgeschlossen`, j.shopify);
    toast(r.text, r.ton, r.ton ? { dauer: 9000 } : {});
  } catch (e) {
    toast(`Nicht abgeschlossen: ${e.message}`, 'crit', { dauer: 9000 });
    knopf.disabled = false;
    return;
  }
  await ladeNeu();
}

async function laeuftNoch(knopf) {
  const z = (kunden.bestellungen?.zeilen || []).find(x => x.orderId === knopf.dataset.aufraeumenLaeuft);
  if (!z || istNurLesend()) return;
  knopf.disabled = true;
  const gepackt = z.aufraeumen?.grund === 'gepackt';
  try {
    await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'schritt', orderId: z.orderId, schritt: 'notiz', notiz: gepackt ? LIEGT_NOCH_NOTIZ : LAEUFT_NOCH_NOTIZ });
    toast(`${z.orderName} bleibt offen – die Liste fragt in ${aufraeumenAbTagen(z.aufraeumen)} Tagen wieder`);
  } catch (e) {
    toast(`Nicht gespeichert: ${e.message}`, 'crit', { dauer: 9000 });
    knopf.disabled = false;
    return;
  }
  await ladeNeu();
}

function verschickt(knopf) {
  const z = (kunden.bestellungen?.zeilen || []).find(x => x.orderId === knopf.dataset.aufraeumenVerschickt);
  if (!z || istNurLesend()) return;
  oeffneVersandDialog(z.orderId, { notiz: z.aufraeumen?.vorschlag?.notiz || null, mailVorab: false, danach: ladeNeu });
}

/** Klicks im Block. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function aufraeumenKlick(e) {
  const vs = e.target.closest('[data-aufraeumen-verschickt]');
  if (vs) { e.preventDefault(); verschickt(vs); return true; }
  const ab = e.target.closest('[data-aufraeumen-abschliessen]');
  if (ab) { e.preventDefault(); abschliessen(ab); return true; }
  const lf = e.target.closest('[data-aufraeumen-laeuft]');
  if (lf) { e.preventDefault(); laeuftNoch(lf); return true; }
  return false;
}
