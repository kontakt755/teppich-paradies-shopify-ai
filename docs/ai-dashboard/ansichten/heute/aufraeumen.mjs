/**
 * "Alte Bestellungen aufräumen" auf der Shop-Uebersicht (Inhaber 2026-10-26, #1698). Nur sichtbar,
 * wenn es Faelle gibt. Regeln: lib/aufraeumen.mjs - der Server haengt `aufraeumen` an jede Zeile
 * von /api/kunden/bestellungen. Die Knoepfe nutzen vorhandene Wege, keinen eigenen Schreibpfad:
 * - "Abschließen": wie "Kunde fertig" (/api/kunden/bestellung-fertig) mit dem Vorschlag als Vermerk;
 *   bucht in Shopify als versendet, ohne Mail an den Kunden (Abschnitt 24 der Architektur). Ohne
 *   belegten Vorschlag (notiz null) heisst er "Abschließen…" und fragt nach dem Grund (#1740).
 * - "Läuft noch": Notiz in der Zeitleiste - eine neue Bewegung, die Liste fragt erst spaeter wieder.
 * Steht eine Bestellung schon rot unter "Probleme", fehlt sie hier; dieselben Knoepfe haengen dann an ihrem
 * Problem-Eintrag (aufraeumenUnterProblem, #1996). Gepackte, nie eingetragene Umschlaege (bis 06.11. nach
 * 3 Tagen hier, #1709) stehen rot in der Packstation und im Musterblock darueber.
 */
import { esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { state } from '../../kern/zustand.mjs';
import { render } from '../../kern/render.mjs';
import { versandRueckmeldung, kundenmailKandidaten } from '../../lib/versand.mjs';
import { kundenmailFrage } from '../../bausteine/kundenmail.mjs';
import { aufraeumListe, aufraeumenAbTagen, AUFRAEUMEN_AB_TAGEN } from '../../lib/aufraeumen.mjs';
import { vorgangsLink } from '../../lib/vorgangslink.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { einkauf, auftragsstatusPositionen } from '../einkauf/auftragsfluss.mjs';

const SICHTBAR = 5;
export const LAEUFT_NOCH_NOTIZ = 'Läuft noch – beim Aufräumen bestätigt';

/** "Abschließen(…)" und "Läuft noch" eines Falls - im Block und am Problem-Eintrag dieselben Knoepfe. */
function knoepfe(z, lesend) {
  const a = z.aufraeumen;
  if (lesend) return '';
  const abschliessen = a.lineItemIds.length ? `<button type="button" class="btn btn-sm" data-aufraeumen-abschliessen="${esc(z.orderId)}" title="Alle offenen Artikel auf „Erledigt“ – in Shopify als versendet gebucht, ohne Mail an den Kunden${a.vorschlag.notiz ? '' : '. Fragt zuerst nach dem Beleg.'}">${a.vorschlag.notiz ? 'Abschließen' : 'Abschließen…'}</button>` : '';
  return `${abschliessen}<button type="button" class="btn btn-sm" data-aufraeumen-laeuft="${esc(z.orderId)}" title="Bleibt offen; die Liste fragt in ${aufraeumenAbTagen(a)} Tagen wieder">Läuft noch</button>`;
}

function zeile(z, lesend) {
  const a = z.aufraeumen;
  const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
    : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
  const art = a.art === 'muster' ? 'Musterbestellung' : 'Warenbestellung';
  return `<div class="heute-bestellzeile" data-aufraeumen="${esc(z.orderId)}"><div>
      <strong>${esc(z.kundenname || 'Kunde nicht hinterlegt')} · ${esc(z.orderName || 'Bestellung')}</strong>
      <p>${esc(art)} · seit ${esc(plural(a.tage, 'Tag', 'Tagen'))} keine Bewegung${a.belege.length ? ` · ${esc(a.belege.join(' · '))}` : ''}</p>
      <p class="aufraeumen-vorschlag">Vorschlag: ${esc(a.vorschlag.text)}</p>
    </div>
    <div class="aufraeumen-knoepfe">${knoepfe(z, lesend)}<a class="btn btn-sm btn-ghost" href="${esc(ziel)}">Ansehen</a></div>
  </div>`;
}

/**
 * Unter einem roten Problem-Eintrag (#1996): die Aufraeumfaelle seiner Bestellungen mit denselben Knoepfen
 * wie im Block. So steht #1049 einmal auf der Seite ("Beim Lieferanten nachfragen" oben), und Abschliessen
 * oder "Läuft noch" bleiben erreichbar. Leer ohne passenden Fall oder fuer die Rolle "lesen".
 * `schonGezeigt` (orderIds): steht eine Bestellung in zwei roten Eintraegen, haengt die Zeile nur am ersten.
 * Traegt das To-do schon eine Tageszahl (`alterTage`), nennt die Zeile das Datum der letzten Bewegung statt
 * einer zweiten Zahl mit anderem Bezug - eine Zahl je Karte.
 * @param {object} todo  To-do mit `orderIds` (lib/todos.mjs)
 */
export function aufraeumenUnterProblem(todo, { daten, lesend = false, schonGezeigt = null } = {}) {
  const ids = todo?.orderIds || [];
  if (!ids.length || !daten?.verfuegbar || lesend) return '';
  const mitZahl = todo.alterTage !== null && todo.alterTage !== undefined;
  const ruhe = z => (mitZahl && z.aufraeumen.seit ? `letzte Bewegung am ${fmtDate(z.aufraeumen.seit)}` : `seit ${plural(z.aufraeumen.tage, 'Tag', 'Tagen')} keine Bewegung`);
  const faelle = aufraeumListe(daten.zeilen).filter(z => ids.includes(z.orderId) && !schonGezeigt?.has(z.orderId));
  for (const z of faelle) schonGezeigt?.add(z.orderId);
  return faelle.map(z => `<div class="heute-todo-aufraeumen" data-aufraeumen="${esc(z.orderId)}">
    <span>${esc(z.orderName || 'Bestellung')}: ${esc(ruhe(z))}</span>${knoepfe(z, lesend)}</div>`).join('');
}

/**
 * Block fuer die Shop-Uebersicht. Leer, solange nichts liegen geblieben ist - eine 0 ist kein Auftrag.
 * @param {Iterable<string>} [ohne]  orderIds, die schon rot unter "Probleme" stehen (zaehlen hier nicht)
 */
export function aufraeumenBlock({ daten, lesend = false, ohne = [] } = {}) {
  if (!daten?.verfuegbar) return '';
  const liste = aufraeumListe(daten.zeilen, { ohne });
  if (!liste.length) return '';
  const oben = liste.slice(0, SICHTBAR);
  const rest = liste.slice(SICHTBAR);
  return `<section class="heute-geschaeft" aria-labelledby="heuteAufraeumen"><div class="heute-geschaeft-kopf">
    <h2 id="heuteAufraeumen">Alte Bestellungen aufräumen · ${liste.length}</h2>
    <p>Hier stehen offene Bestellungen, bei denen sich seit ${AUFRAEUMEN_AB_TAGEN.muster} Tagen (Ware ${AUFRAEUMEN_AB_TAGEN.ware}) nichts getan hat und nichts belegt, dass sie fertig sind. Bitte prüfen.</p></div>
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
  // Ware, die "raus" uebersprungen hat: statt "ohne Mail" fragt der Klick mit vorab angehakter Kundenmail (w-276).
  const kandidaten = kundenmailKandidaten({ ...z.auftrag, id: z.orderId }, await auftragsstatusPositionen() || {}, a.lineItemIds);
  const ohneMail = kandidaten.length ? '' : ' – ohne Mail an den Kunden';
  let notiz = a.vorschlag.notiz;
  let kundeInformieren = false;
  if (!notiz) {
    // Kein belegter Vorschlag: der Grund kommt von dem, der abschliesst - nie ein geratener Text.
    const grund = window.prompt(`${z.orderName}: Woher wissen wir, dass das erledigt ist?\n\nZum Beispiel: „Kundin hat die Muster laut Telefonat“. Der Text steht als Vermerk am Auftrag. In Shopify wird die Bestellung als versendet gebucht${ohneMail}.`, '');
    if (!grund?.trim()) return;
    notiz = `Aufgeräumt: ${grund.trim()}`;
  }
  if (kandidaten.length) {
    const wahl = await kundenmailFrage({ titel: `Abschließen · ${z.orderName}`, kandidaten,
      text: `${plural(a.lineItemIds.length, 'Artikel', 'Artikel')} abschließen. Vermerk: ${notiz}. In Shopify wird die Bestellung als versendet gebucht.` });
    if (wahl === null) return;
    kundeInformieren = wahl;
  } else if (a.vorschlag.notiz) {
    const frage = `${z.orderName}: ${plural(a.lineItemIds.length, 'Artikel', 'Artikel')} abschließen?\n\nVermerk: ${notiz}\n\nIn Shopify wird die Bestellung als versendet gebucht – ohne Mail an den Kunden.`;
    if (!window.confirm(frage)) return;
  }
  knopf.disabled = true;
  try {
    const j = await orgSchreiben('/api/kunden/bestellung-fertig', { orderId: z.orderId, lineItemIds: a.lineItemIds, notiz, kundeInformieren });
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
    toast(`${z.orderName} bleibt offen – die Liste fragt in ${aufraeumenAbTagen(z.aufraeumen)} Tagen wieder`);
  } catch (e) {
    toast(`Nicht gespeichert: ${e.message}`, 'crit', { dauer: 9000 });
    knopf.disabled = false;
    return;
  }
  await ladeNeu();
}

/** Klicks im Block und an Problem-Eintraegen. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function aufraeumenKlick(e) {
  const ab = e.target.closest('[data-aufraeumen-abschliessen]');
  if (ab) { e.preventDefault(); abschliessen(ab); return true; }
  const lf = e.target.closest('[data-aufraeumen-laeuft]');
  if (lf) { e.preventDefault(); laeuftNoch(lf); return true; }
  return false;
}
