import { oeffneKettelversand } from '../einkauf/kettelversand.mjs';
/**
 * Kunden: Zeitleiste je Auftrag mit genau einem naechsten Schritt.
 *
 * Oben die Karte "Naechster Schritt" mit einem Hauptknopf, darunter der Verlauf
 * (erledigt mit Datum und Person, aktueller Schritt hervorgehoben, kommende grau),
 * dann "Worum es geht" und der Kontakt. Was der naechste Schritt ist, rechnet der
 * Server (operations/lib/auftragsverlauf.mjs) - hier wird nur gezeichnet und der
 * Klick an POST /api/einkauf/auftragsstatus (aktion "schritt") gereicht.
 * Gestaltung: stile/zeitleiste.css.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { einkauf, setzeZurueckAufOffen, setzeMusterHerkunft, kundeUndOrt, ladeStandNeu, MUSTER_HERKUNFT_LABEL } from '../einkauf/auftragsfluss.mjs';
import { oeffneVersandDialog } from '../einkauf/versand.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';
import { musterKurz, fuelleText, mailtoLink, NICHT_VERFUEGBAR_VORLAGE } from '../../lib/muster-nachfassen.mjs';
import { kunden } from './gemeinsam.mjs';

const WER_TEXT = { wir: 'wir', lieferant: 'Lieferant', kunde: 'Kunde' };
const ART_TEXT = { muster: 'Musterbestellung', ware: 'Bestellung' };
// Was "Etwas anderes ist passiert ..." anbietet - Reihenfolge wie der Ablauf.
const WAHL = {
  muster: [['bestellt', 'Muster beim Lieferanten bestellt'], ['geliefert', 'Muster sind bei uns angekommen'], ['raus', 'Gelabelt und an den Kunden verschickt'],
    ['kunde_hat_muster', 'Kunde hat die Muster'], ['nachgefasst', 'Nachgefasst'], ['kunde_hat_bestellt', 'Ergebnis: Kunde hat bestellt'], ['kein_interesse', 'Ergebnis: kein Interesse'],
    ['muster_nicht_verfuegbar', 'Muster nicht verfügbar – Kunde informiert']],
  ware: [['bestellt', 'Ware beim Lieferanten bestellt'], ['geliefert', 'Ware ist bei uns angekommen'], ['raus', 'An den Kunden raus'], ['erledigt', 'Erledigt – Auftrag abschließen']],
};
// Hinweiszeile unter einer Wahl (Inhaber 2026-10-16).
const WAHL_HINWEIS = { muster_nicht_verfuegbar: 'Der Kunde meldet sich und bestellt neue Muster; der Auftrag ist damit abgeschlossen.' };
// Ergebnisse, die nur am Auftrag haengen - der letzte davon laesst sich zuruecknehmen.
const ERGEBNISSE = ['kunde_hat_bestellt', 'kein_interesse', 'muster_nicht_verfuegbar'];
const ERGEBNIS_WAHL = [['kunde_hat_bestellt', 'Kunde hat bestellt'], ['kein_interesse', 'Kein Interesse'], ['nachgefasst', 'Nochmal nachgefasst – er überlegt noch']];
// Rueckmeldung nimmt das Wort des Knopfs auf.
const GESETZT_TEXT = {
  bestellt: 'Als bestellt eingetragen', geliefert: 'Als angekommen eingetragen', raus: 'Als verschickt eingetragen', erledigt: 'Abgeschlossen',
  kunde_hat_muster: 'Kunde hat Muster – eingetragen', nachgefasst: 'Nachgefasst – eingetragen', kunde_hat_bestellt: 'Ergebnis: Kunde hat bestellt',
  kein_interesse: 'Ergebnis: kein Interesse', muster_nicht_verfuegbar: 'Ergebnis: Muster nicht verfügbar', notiz: 'Notiz gespeichert', zurueck: 'Schritt zurückgenommen',
};

const tagMonat = iso => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
const gesetzt = v => v !== null && v !== undefined && v !== '' && v !== '–' && v !== 'UNGEKLAERT';

function verlaufZeile(s, naechster) {
  const teile = [];
  if (s.zustand === 'erledigt') {
    if (s.am) teile.push(esc(tagMonat(s.am)));
    if (s.von) teile.push(esc(s.von));
    if (s.automatisch) teile.push(`<span class="zl-auto" title="${esc(`Quelle: ${s.quelle || 'Bestelldaten'}`)}">automatisch erkannt</span>`);
    if (s.anzahl > 1) teile.push(`${s.anzahl}-mal`);
    if (s.hinweis) teile.push(esc(s.hinweis));
  } else if (s.zustand === 'aktuell') {
    teile.push(`jetzt dran: ${esc(WER_TEXT[naechster?.wer] || 'wir')}`);
    if (s.teil) teile.push(`${s.teil.erledigt} von ${s.teil.gesamt} Artikeln`);
  } else if (s.zustand === 'uebersprungen') {
    teile.push('nicht eingetragen');
  }
  return `<li class="${esc(s.zustand)}"><span class="zl-punkt" aria-hidden="true"></span><b>${esc(s.label)}</b>
    ${teile.length ? `<span class="zl-wann">${teile.join(' · ')}</span>` : ''}
    ${s.notiz && s.zustand === 'erledigt' ? `<span class="zl-wann">„${esc(s.notiz)}“</span>` : ''}</li>`;
}

/**
 * Versand in Shopify gescheitert (Recht fehlt, Netz, zurueckgehalten ...): der Schritt "raus"
 * steht, aber der Kunde hat keine Versandmail. Sichtbar bleiben, bis es nachgeholt ist.
 */
function versandZeile(a, lesend) {
  const v = a.versandNachholen;
  if (!v) return '';
  return `<div class="zl-versand" role="status">
    <p><b>${v.unklar ? 'Versand in Shopify unklar' : v.ausstehend ? 'Versand noch nicht in Shopify gebucht' : 'Versand nicht in Shopify gebucht'}</b> – ${esc(v.meldung)}</p>
    ${lesend ? '' : `<button type="button" class="btn btn-sm no-print" data-versand-nachholen="${esc(a.id)}">In Shopify buchen</button>`}
  </div>`;
}

function naechsterKarte(a, kunde, lesend) {
  const n = a.naechsterSchritt;
  if (!n) {
    return `<div class="zl-next warten"><p class="zl-titel">Stand</p><h4 class="zl-fertig">${a.storniert ? 'Storniert' : 'Abgeschlossen – nichts mehr zu tun'}</h4>${versandZeile(a, lesend)}</div>`;
  }
  const titel = n.stufe === 'warten' ? `Wartet auf ${n.wer === 'lieferant' ? 'den Lieferanten' : 'den Kunden'}` : 'Nächster Schritt';
  const tel = gesetzt(kunde?.telefon) ? String(kunde.telefon).replace(/[^0-9+]/g, '') : '';
  // Beim Nachfassen ist der Anruf die eigentliche Arbeit - der Knopf dafuer steht direkt daneben.
  const anruf = n.aktion === 'nachgefasst' && n.stufe === 'faellig' && tel ? `<a class="btn" href="tel:${esc(tel)}">Kunden anrufen</a>` : '';
  // Muster noch beim Lieferanten zu bestellen? Oft liegen sie hier - dann gar nicht bestellen.
  const haben = a.auftragsart === 'muster' && n.aktion === 'bestellt' ? `<button type="button" class="btn" data-muster-herkunft="${esc(a.id)}" title="Muster/Katalog selbst vorrätig: verschicken oder vorbeibringen">Haben wir da…</button>` : '';
  const knoepfe = lesend ? '' : `
    ${n.href === '#/heute?mn=1' ? `<div class="zl-knoepfe no-print"><a class="btn" href="${esc(n.href)}">${esc(n.knopf || 'Nachfragen prüfen')}</a></div>` : n.aktion ? `<div class="zl-knoepfe no-print">
      <button type="button" class="btn ${n.stufe === 'warten' ? '' : 'btn-primary'}" data-zl-schritt="${esc(n.aktion)}" data-zl-order="${esc(a.id)}">${esc(n.knopf)}</button>${anruf}${haben}
    </div>` : ''}
    <button type="button" class="zl-anders no-print" data-zl-anders="${esc(a.id)}">Etwas anderes ist passiert …</button>`;
  return `<div class="zl-next ${esc(n.stufe)}">
    <p class="zl-titel">${esc(titel)}</p>
    <h4>${esc(n.text)}</h4>
    ${n.detail ? `<p>${esc(n.detail)}</p>` : ''}
    ${versandZeile(a, lesend)}
    ${knoepfe}
  </div>`;
}

function worumKarte(a) {
  const zeilen = (a.positionen || []).map(p => {
    const artikel = p.handle && !p.istMuster ? `<a href="#/lexikon?${new URLSearchParams({ handle: p.handle })}">${esc(p.titel)}</a>` : esc(p.titel);
    const menge = p.kundenmenge || p.menge;
    return `<dl>
      <dt>Artikel</dt><dd>${artikel}${gesetzt(p.farbe) ? ` · ${esc(p.farbe)}` : ''}${gesetzt(menge) ? ` <span class="small muted">(${esc(menge)})</span>` : ''}</dd>
      ${p.eigenleistung ? '<dt>Einkauf</dt><dd>Eigenleistung – nichts beim Lieferanten</dd>' : `<dt>Lieferant</dt><dd>${gesetzt(p.lieferant) ? `Lieferant ${esc(p.lieferant)}` : '<span class="zl-fehlt">nicht zugeordnet</span>'}</dd>
      <dt>Art.-Nr.</dt><dd>${gesetzt(p.grosshaendlerId) ? esc(p.grosshaendlerId) : '<span class="zl-fehlt">fehlt</span>'}</dd>`}
    </dl>`;
  });
  return `<div class="card zl-worum"><p class="zl-titel">Worum es geht</p>${zeilen.join('') || '<p class="small muted">Keine Positionen.</p>'}</div>`;
}

/** Anrufen-/Mail-Knoepfe (tel:/mailto:) - gross genug fuer den Daumen. */
export function kontaktKnoepfe(kunde) {
  const tel = gesetzt(kunde?.telefon) ? String(kunde.telefon).replace(/[^0-9+]/g, '') : '';
  const mail = gesetzt(kunde?.email) ? String(kunde.email) : '';
  if (!tel && !mail) return '<p class="small muted">Kein Kontakt hinterlegt.</p>';
  return `<div class="zl-kontakt no-print">
    ${tel ? `<a class="btn" href="tel:${esc(tel)}">Anrufen</a>` : ''}
    ${mail ? `<a class="btn" href="mailto:${esc(mail)}">E-Mail</a>` : ''}
  </div>`;
}

function kontaktKarte(kunde) {
  return `<div class="card"><p class="zl-titel">Kontakt</p>${kontaktKnoepfe(kunde)}
    <p class="zl-kontakt-zeile">${[kunde?.name, gesetzt(kunde?.telefon) ? kunde.telefon : null, gesetzt(kunde?.email) ? kunde.email : null].filter(gesetzt).map(esc).join(' · ')}</p></div>`;
}

/**
 * Zeitleisten-Block eines Auftrags.
 * @param {object} a  Auftrag samt der Felder auftragsart, verlauf, verlaufNotizen, naechsterSchritt
 *                    (aus /api/kunden/detail bzw. zusammengesetzt aus einer Zeile von /api/kunden/bestellungen)
 * @param {object} [opt]
 * @param {boolean} [opt.kontakt]  Kontaktkarte mitzeichnen (im Bestelldetail; die Kundenakte hat den Kontakt oben)
 */
export function zeitleisteBlock(a, { kontakt = false } = {}) {
  if (!a?.verlauf?.length) return '';
  const kunde = a.details?.kunde || null;
  const lesend = istNurLesend();
  const notizen = a.verlaufNotizen || [];
  return `<section class="zl" data-zl="${esc(a.id)}" aria-label="Stand von ${esc(a.name)}">
    <div class="zl-kopf"><h3>${esc(a.name)} <span class="zl-art">${esc(ART_TEXT[a.auftragsart] || 'Bestellung')} vom ${esc(fmtDate(a.datum))}</span>${a.testbestellung ? ' <span class="badge plain">Testbestellung</span>' : ''}</h3></div>
    <div class="zl-raster">
      <div class="zl-spalte">
        ${naechsterKarte(a, kunde, lesend)}
        ${a.auftragsart === 'ware' ? `<p><button type="button" class="btn" data-kettelversand="${esc(a.id)}">Kettler & Versand</button></p>` : ''}
        <div class="card zl-verlauf"><p class="zl-titel">Verlauf</p>
          <ol class="zl-liste">${a.verlauf.map(s => verlaufZeile(s, a.naechsterSchritt)).join('')}</ol>
          ${notizen.length ? `<div class="zl-notizen">${notizen.map(n => `<p><span class="muted">${esc(tagMonat(n.am))}${n.von ? ` · ${esc(n.von)}` : ''}:</span> ${esc(n.text)}</p>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="zl-spalte">
        ${worumKarte(a)}
        ${kontakt ? kontaktKarte(kunde) : ''}
      </div>
    </div>
  </section>`;
}

/** Den Auftrag zu einer Bestell-ID aus dem finden, was gerade geladen ist (Akte oder Bestellliste). */
function findeAuftrag(orderId) {
  const ausAkte = kunden.detail?.kunde?.auftraege?.find(a => a.id === orderId);
  if (ausAkte) return ausAkte;
  const z = kunden.bestellungen?.zeilen?.find(x => x.orderId === orderId);
  return z ? auftragAusZeile(z) : null;
}

/** Zeile der Bestellliste -> Auftrag mit Zeitleisten-Feldern (die Liste traegt sie an der Zeile). */
export function auftragAusZeile(z) {
  return { ...z.auftrag, auftragsart: z.auftragsart, verlauf: z.verlauf, verlaufNotizen: z.verlaufNotizen, naechsterSchritt: z.naechsterSchritt, versandNachholen: z.versandNachholen || null };
}

/** Nach einer Aenderung alles neu holen, was den Stand zeigt - ohne dass die Seite auf "Lade ..." springt. */
async function ladeNeu() {
  einkauf.auftragsstatus = null;   // Einkauf zeigt denselben Positionsstatus
  kunden.faelle = null;
  const aufgaben = [];
  if (kunden.detailKey && kunden.detail) {
    const key = kunden.detailKey;
    aufgaben.push(fetchEinkauf(`/api/kunden/detail?${new URLSearchParams({ key })}`).then(d => { if (kunden.detailKey === key && d?.verfuegbar) kunden.detail = d; }));
  }
  if (kunden.bestellungen) {
    aufgaben.push(fetchEinkauf('/api/kunden/bestellungen').then(d => { if (d?.verfuegbar) kunden.bestellungen = d; }));
  }
  await Promise.all(aufgaben);
  if (['kunden', 'heute'].includes(state.route.view)) render();
}

async function setzeSchritt(orderId, schritt, { notiz = null, bezug = null, muster = null } = {}) {
  let antwort;
  try {
    antwort = await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'schritt', orderId, schritt, notiz, bezug, ...(muster ? { muster } : {}) });
  } catch (e) {
    toast(`Nicht gespeichert: ${e.message}`, 'crit');
    return false;
  }
  // "Kunde hat Muster" bei Mustern aus eigenem Bestand setzt "raus" mit und bucht in Shopify -
  // was dabei herauskam, gehoert in dieselbe Rueckmeldung.
  const r = versandRueckmeldung(GESETZT_TEXT[schritt] || 'Gespeichert', antwort?.shopify);
  // "Muster nicht verfuegbar": was im Shop gesperrt wurde (oder warum nicht) gehoert dazu.
  const sp = antwort?.mustersperre;
  if (sp?.meldung) {
    r.text = `${r.text} · ${sp.meldung}`;
    if (['offen', 'teilweise'].includes(sp.status)) r.ton = r.ton || 'warn';
  }
  toast(r.text, r.ton, r.ton ? { dauer: 9000 } : {});
  await ladeNeu();
  return true;
}

// Textvorschlag "Muster nicht verfuegbar": einmal je Sitzung vom Server (Vorlage des Inhabers oder eingebauter Vorschlag).
let nvVorlage = null;
const nvText = (a, positionen) => fuelleText(nvVorlage || NICHT_VERFUEGBAR_VORLAGE, {
  kundenname: gesetzt(a.details?.kunde?.name) ? a.details.kunde.name : null,
  absender: state.session?.benutzer?.name || null,
  farben: musterKurz(positionen),
});

/**
 * Zusatz fuer "Muster nicht verfuegbar" (Inhaber 2026-10-16): welche Muster betroffen sind (alle
 * vorausgewaehlt) - sie werden im Shop gesperrt -, und der Mailtext zum Kopieren. Sichtbar nur,
 * wenn die Wahl getroffen ist; gesendet wird nichts.
 */
function nichtVerfuegbarBlock(a, muster) {
  const mail = nvText(a, muster);
  const email = gesetzt(a.details?.kunde?.email) ? a.details.kunde.email : null;
  return `<div class="zl-nv" data-zl-nv hidden>
    ${muster.length ? `<fieldset class="zl-nv-farben"><legend>Welche Muster sind nicht verfügbar?</legend>
      ${muster.map(p => `<label><input type="checkbox" name="nvMuster" value="${esc(p.lineItemId)}" checked> ${esc(musterKurz([p])[0] || p.titel)}</label>`).join('')}
      <p class="small muted">Die angekreuzten Farben stehen in der Notiz und werden im Shop sofort gesperrt („kein Muster verfügbar“). Wieder freigeben: Einkauf › Musterlager.</p>
    </fieldset>` : ''}
    <details class="zl-nv-mail">
      <summary>Textvorschlag für die Mail an den Kunden</summary>
      <p class="small"><span class="muted">Betreff:</span> <span data-zl-nv-betreff>${esc(mail?.betreff || '')}</span></p>
      <label class="visually-hidden" for="zlNvText">Text der E-Mail</label>
      <textarea id="zlNvText" readonly rows="9">${esc(mail?.text || '')}</textarea>
      <div class="zl-nv-knoepfe"><button type="button" class="btn btn-sm" data-kopieren="zlNvText">Text kopieren</button>
        ${email ? `<a class="btn btn-sm" data-zl-nv-mailto href="${esc(mailtoLink(email, mail || {}))}">E-Mail öffnen</a>` : ''}</div>
    </details>
  </div>`;
}

/** Zusatz ein-/ausblenden und den Mailtext den angekreuzten Farben nachfuehren. */
function nichtVerfuegbarVerdrahten(form, a) {
  const box = form.querySelector('[data-zl-nv]');
  const label = form.querySelector('[data-zl-notiz-label]');
  const aktualisiere = () => {
    const gewaehlt = new Set([...form.querySelectorAll('input[name=nvMuster]:checked')].map(i => i.value));
    const mail = nvText(a, (a.positionen || []).filter(p => gewaehlt.has(p.lineItemId)));
    form.querySelector('#zlNvText').value = mail?.text || '';
    form.querySelector('[data-zl-nv-betreff]').textContent = mail?.betreff || '';
    const link = form.querySelector('[data-zl-nv-mailto]');
    if (link) link.href = mailtoLink(a.details.kunde.email, mail || {});
  };
  form.addEventListener('change', ev => {
    if (ev.target.name === 'schritt') {
      const an = ev.target.value === 'muster_nicht_verfuegbar';
      box.hidden = !an;
      label.textContent = an ? 'Notiz (z. B. was der Kunde gesagt hat)' : 'Notiz (optional)';
    }
    if (ev.target.name === 'nvMuster') aktualisiere();
  });
  if (!nvVorlage) {
    fetchEinkauf('/api/kunden/muster-texte').then(d => {
      if (d?.nichtVerfuegbar?.text) { nvVorlage = d.nichtVerfuegbar; if (form.isConnected) aktualisiere(); }
    }).catch(() => { /* eingebauter Vorschlag bleibt */ });
  }
}

/** Dialog: "Etwas anderes ist passiert ..." (alle Schritte + Notiz) bzw. "Ergebnis eintragen ..." (nur die Ergebnisse). */
function oeffneDialog(orderId, { nurErgebnis = false } = {}) {
  const a = findeAuftrag(orderId);
  if (!a) return;
  const art = a.auftragsart === 'muster' ? 'muster' : 'ware';
  // Zuruecknehmen laesst sich der letzte Schritt, der nur am Auftrag haengt (nicht an den Positionen).
  const letzter = [...(a.verlauf || [])].reverse().find(s => s.zustand === 'erledigt' && !s.automatisch
    && (['kunde_hat_muster', 'nachgefasst'].includes(s.schritt) || (s.schritt === 'ergebnis' && ERGEBNISSE.includes(s.ergebnis))));
  const letzterWert = letzter ? (letzter.schritt === 'ergebnis' ? letzter.ergebnis : letzter.schritt) : null;
  const wahl = nurErgebnis ? ERGEBNIS_WAHL : WAHL[art];
  // "Zurueck auf offen" nur, wenn eine Position schon einen Schritt hat.
  const positionen = (a.positionen || []).filter(p => p.lineItemId);
  const hatSchritte = positionen.some(p => einkauf.auftragsstatus?.positionen?.[`${a.id}::${p.lineItemId}`]?.status)
    || (a.verlauf || []).some(s => ['bestellt', 'geliefert', 'raus', 'erledigt'].includes(s.schritt) && (s.zustand === 'erledigt' && !s.automatisch || s.teil));
  const ort = kundeUndOrt(a.id);
  const herkunftJetzt = (a.positionen || []).find(p => p.istMuster)?.musterHerkunft || 'lieferant';
  const radio = (wert, text, extra = '') => (WAHL_HINWEIS[wert]
    ? `<label${extra}><input type="radio" name="schritt" value="${esc(wert)}" required><span class="zl-wahl-text"><span>${esc(text)}</span><span class="small muted">${esc(WAHL_HINWEIS[wert])}</span></span></label>`
    : `<label${extra}><input type="radio" name="schritt" value="${esc(wert)}" required> ${esc(text)}</label>`);
  const muster = (a.positionen || []).filter(p => p.istMuster && p.lineItemId);
  const nichtVerfuegbar = !nurErgebnis && art === 'muster' ? nichtVerfuegbarBlock(a, muster) : '';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="zlTitel" data-dialog>
    <h2 id="zlTitel">${nurErgebnis ? 'Ergebnis eintragen' : 'Etwas anderes ist passiert'} · ${esc(a.name)}</h2>
    <fieldset class="zl-wahl"><legend>Was ist passiert?</legend>
      ${wahl.map(([w, t]) => radio(w, t)).join('')}
      ${nurErgebnis ? '' : radio('notiz', 'Nur eine Notiz festhalten', ' class="zl-wahl-trenner"')}
      ${!nurErgebnis && letzterWert ? radio(`zurueck:${letzterWert}`, `„${letzter.label}“ zurücknehmen (war ein Versehen)`) : ''}
      ${!nurErgebnis && hatSchritte ? radio('zurueckAufOffen', 'Alles zurück auf „noch zu bestellen“ (z. B. versehentlich „bestellt“ geklickt)') : ''}
    </fieldset>
    ${!nurErgebnis && art === 'muster' ? `<fieldset class="zl-wahl"><legend>Woher kommen die Muster?${ort.name || ort.ort ? ` <span class="muted small">${esc([ort.name, ort.ort].filter(Boolean).join(' · '))}</span>` : ''}</legend>
      ${Object.entries(MUSTER_HERKUNFT_LABEL).map(([w, t]) => radio(`herkunft:${w}`, `${t}${w === herkunftJetzt ? ' (aktuell)' : ''}`)).join('')}
    </fieldset>` : ''}
    ${nichtVerfuegbar}
    <div class="field"><label for="zlNotiz" data-zl-notiz-label>Notiz (optional)</label><textarea id="zlNotiz" name="notiz" maxlength="2000" placeholder="z. B. Kunde meldet sich nach dem Urlaub"></textarea></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Eintragen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input[type=radio]')?.focus();
  if (nichtVerfuegbar) nichtVerfuegbarVerdrahten(form, a);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const daten = new FormData(form);
    const wert = String(daten.get('schritt') || '');
    const notiz = String(daten.get('notiz') || '').trim() || null;
    if (wert === 'notiz' && !notiz) { toast('Bitte die Notiz eintragen', 'warn'); form.querySelector('textarea').focus(); return; }
    // Die angekreuzten Farben stehen in der Notiz; ohne Farbe muss der Freitext sie nennen.
    const nvMuster = wert === 'muster_nicht_verfuegbar' ? daten.getAll('nvMuster').map(String) : null;
    if (nvMuster && !nvMuster.length && !notiz) { toast('Bitte die betroffenen Farben ankreuzen oder in der Notiz nennen', 'warn'); form.querySelector('textarea').focus(); return; }
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    if (wert === 'zurueckAufOffen' || wert.startsWith('herkunft:')) {
      let fertig;
      if (wert === 'zurueckAufOffen') {
        const n = await setzeZurueckAufOffen(positionen.map(p => ({ orderId: a.id, lineItemId: p.lineItemId })), notiz);
        toast(n ? `${n} Artikel zurück auf offen` : 'Nichts zurückzusetzen – alles ist schon offen.');
        fertig = n > 0;
        if (fertig) await ladeStandNeu();
      } else fertig = await setzeMusterHerkunft({ orderId, herkunft: wert.slice('herkunft:'.length), notiz });
      if (fertig) $('#dialogRoot').innerHTML = ''; else knopf.disabled = false;
      return;
    }
    // "raus" bucht in Shopify und schickt die Versandmail - dafuer gibt es den eigenen Dialog.
    if (wert === 'raus') { oeffneVersandDialog(orderId, { notiz }); return; }
    const ok = wert.startsWith('zurueck:')
      ? await setzeSchritt(orderId, 'zurueck', { bezug: wert.slice('zurueck:'.length), notiz })
      : await setzeSchritt(orderId, wert, { notiz, muster: nvMuster });
    if (ok) $('#dialogRoot').innerHTML = ''; else knopf.disabled = false;
  });
}

/** Klicks der Zeitleiste. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function zeitleisteKlick(e) {
  const kettler=e.target.closest('[data-kettelversand]');
  if(kettler){e.preventDefault();void oeffneKettelversand(kettler.dataset.kettelversand);return true;}
  const haupt = e.target.closest('[data-zl-schritt]');
  if (haupt) {
    e.preventDefault();
    if (haupt.dataset.zlSchritt === 'ergebnis') { oeffneDialog(haupt.dataset.zlOrder, { nurErgebnis: true }); return true; }
    if (haupt.dataset.zlSchritt === 'raus') { oeffneVersandDialog(haupt.dataset.zlOrder); return true; }
    haupt.disabled = true;   // gegen den Doppelklick - nach dem Neuladen steht ohnehin der naechste Schritt da
    setzeSchritt(haupt.dataset.zlOrder, haupt.dataset.zlSchritt).then(ok => { if (!ok) haupt.disabled = false; });
    return true;
  }
  const anders = e.target.closest('[data-zl-anders]');
  if (anders) { e.preventDefault(); oeffneDialog(anders.dataset.zlAnders); return true; }
  return false;
}
