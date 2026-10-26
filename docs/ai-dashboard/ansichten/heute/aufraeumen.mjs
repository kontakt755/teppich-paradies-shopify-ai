/**
 * "Alte Bestellungen aufräumen" auf der Shop-Uebersicht (Inhaber 2026-10-26, #1698). Nur sichtbar,
 * wenn es Faelle gibt. Regeln: lib/aufraeumen.mjs - der Server haengt `aufraeumen` an jede Zeile
 * von /api/kunden/bestellungen. Die Knoepfe nutzen vorhandene Wege, keinen eigenen Schreibpfad:
 * - "Abschließen": wie "Kunde fertig" (/api/kunden/bestellung-fertig) mit dem Vorschlag als Vermerk;
 *   bucht in Shopify als versendet, ohne Mail an den Kunden (Abschnitt 24 der Architektur).
 * - "Läuft noch": Notiz in der Zeitleiste - eine neue Bewegung, die Liste fragt erst spaeter wieder.
 */
import { esc, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { state } from '../../kern/zustand.mjs';
import { render } from '../../kern/render.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';
import { aufraeumListe, AUFRAEUMEN_AB_TAGEN } from '../../lib/aufraeumen.mjs';
import { vorgangsLink } from '../../lib/vorgangslink.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { einkauf } from '../einkauf/auftragsfluss.mjs';

const SICHTBAR = 5;
export const LAEUFT_NOCH_NOTIZ = 'Läuft noch – beim Aufräumen bestätigt';

function zeile(z, lesend) {
  const a = z.aufraeumen;
  const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
    : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
  const art = a.art === 'muster' ? 'Musterbestellung' : 'Warenbestellung';
  const abschliessen = !lesend && a.lineItemIds.length
    ? `<button type="button" class="btn btn-sm" data-aufraeumen-abschliessen="${esc(z.orderId)}" title="Alle offenen Artikel auf „Erledigt“ – in Shopify als versendet gebucht, ohne Mail an den Kunden">Abschließen</button>` : '';
  const laeuft = lesend ? '' : `<button type="button" class="btn btn-sm" data-aufraeumen-laeuft="${esc(z.orderId)}" title="Bleibt offen; die Liste fragt in ${AUFRAEUMEN_AB_TAGEN[a.art]} Tagen wieder">Läuft noch</button>`;
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
    <p>Hier stehen offene Bestellungen, bei denen sich seit ${AUFRAEUMEN_AB_TAGEN.muster} Tagen (Ware ${AUFRAEUMEN_AB_TAGEN.ware}) nichts getan hat und nichts belegt, dass sie fertig sind. Bitte prüfen: abschließen oder „Läuft noch“.</p></div>
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
  try {
    await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'schritt', orderId: z.orderId, schritt: 'notiz', notiz: LAEUFT_NOCH_NOTIZ });
    toast(`${z.orderName} bleibt offen – die Liste fragt in ${AUFRAEUMEN_AB_TAGEN[z.aufraeumen?.art || 'muster']} Tagen wieder`);
  } catch (e) {
    toast(`Nicht gespeichert: ${e.message}`, 'crit', { dauer: 9000 });
    knopf.disabled = false;
    return;
  }
  await ladeNeu();
}

/** Klicks im Block. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function aufraeumenKlick(e) {
  const ab = e.target.closest('[data-aufraeumen-abschliessen]');
  if (ab) { e.preventDefault(); abschliessen(ab); return true; }
  const lf = e.target.closest('[data-aufraeumen-laeuft]');
  if (lf) { e.preventDefault(); laeuftNoch(lf); return true; }
  return false;
}
