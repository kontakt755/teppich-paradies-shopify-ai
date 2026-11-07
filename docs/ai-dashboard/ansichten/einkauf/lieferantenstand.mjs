/**
 * Einkauf: Lieferantenstand je Warenposition - Lieferant angefragt, Bestelldaten, Auftragsbestaetigung (AB)
 * geprueft. Kein eigener Status: die Angaben haengen im Unterobjekt `beschaffung` derselben Position
 * (operations/lib/beschaffung.mjs, setzeLieferantenstand), der Schritt im Auftragsfluss bleibt.
 * Eine AB aus dem Postfach (Reiter "Belege") wird hier nur vorgeschlagen - bestaetigt wird sie erst,
 * wenn ein Mensch Menge, Masse, Lieferweg und Zuschlaege einzeln beantwortet hat.
 */
import { $, esc, toast } from '../../kern/helfer.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { AB_PRUEFPUNKTE, lieferantenStand } from '../../lib/beschaffung.mjs';
import { lieferantName } from '../../lib/einkauf-lieferanten.mjs';
import { lieferwegVon, istLagerware } from '../../lib/lieferweg.mjs';
import { alleAuftraege, afEintragFuer, ladeStandNeu, einkauf } from './auftragsfluss.mjs';
import { belege } from './belege.mjs';

/** Positionen, fuer die ein Lieferantenstand gilt: Ware beim Lieferanten - kein Muster, keine Eigenleistung, keine Lagerware. */
export function mitLieferantenstand(p, eintrag = afEintragFuer(p)) {
  return Boolean(p && !p.istMuster && !p.eigenleistung && !istLagerware(p, eintrag));
}

const datum = iso => String(iso || '').slice(0, 10).split('-').reverse().join('.');
const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
/** "2026-11-06T17:38:00.000Z" -> "2026-11-06T18:38" fuer <input type="datetime-local"> in Ortszeit. */
function ortszeit(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** Stand und Knoepfe in der Positionszeile (Einkauf). Leer fuer Muster, Eigenleistung und Lagerware. */
export function lieferantenstandBlock(p, eintrag = afEintragFuer(p)) {
  if (!mitLieferantenstand(p, eintrag)) return '';
  const st = lieferantenStand(eintrag);
  const status = eintrag?.status || null;
  const zeile = st.text ? `<div class="small${st.ton === 'crit' ? ' wait-crit' : st.ton === 'warn' ? ' wait-warn' : ' muted'}">${esc(st.text)}</div>` : '';
  if (istNurLesend()) return zeile;
  const daten = `data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}"`;
  const knopf = (schritt, text, haupt = false) => `<button type="button" class="btn btn-sm${haupt ? '' : ' btn-ghost'}" data-ls-schritt="${schritt}" ${daten}>${esc(text)}</button>`;
  const knoepfe = !status ? [knopf('anfrage', st.stufe === 'angefragt' ? 'Anfrage ändern…' : 'Lieferant angefragt…')]
    : status === 'bestellt' ? [knopf('ab', eintrag?.beschaffung?.ab ? 'AB ändern…' : 'AB eingegangen…', st.abFehlt), knopf('bestelldaten', 'Bestelldaten…')]
      : [];
  return `${zeile}${knoepfe.length ? `<div class="af-knoepfe" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${knoepfe.join('')}</div>` : ''}`;
}

/** Zahlen fuer das Band oben im Einkauf - dieselbe Ableitung wie die Zeile je Position. */
export function lieferantenstandZahlen(positionen) {
  const z = { angefragt: 0, abFehlt: 0, nachfassen: 0, abweichung: 0, verspaetet: 0 };
  for (const p of positionen || []) {
    const e = afEintragFuer(p);
    if (!mitLieferantenstand(p, e)) continue;
    const st = lieferantenStand(e);
    if (st.stufe === 'angefragt') z.angefragt += 1;
    if (st.abFehlt) z.abFehlt += 1;
    if (st.nachfassen) z.nachfassen += 1;
    if (st.abweichungen.length) z.abweichung += 1;
    if (st.verspaetet) z.verspaetet += 1;
  }
  return z;
}

async function schreiben(payload) {
  const r = await fetch('/api/einkauf/auftragsstatus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion: 'lieferantenstand', ...payload }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Aktion nicht möglich (${r.status})`);
  await ladeStandNeu({ bestellungen: true });
  return j;
}

function positionVon(orderId, lineItemId) {
  return alleAuftraege().flatMap(a => a.positionen || []).find(x => x.orderId === orderId && x.lineItemId === lineItemId) || null;
}

function dialog(titel, p, inhalt, knopfText, { zuruecknehmen = null } = {}) {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="lsTitel" data-dialog>
    <h2 id="lsTitel">${esc(titel)} · ${esc(p.orderName)}</h2><p class="small">${esc(p.titel)}${p.farbe ? ` · ${esc(p.farbe)}` : ''}</p>
    ${inhalt}
    <p data-ls-fehler class="notice crit" role="alert" tabindex="-1" hidden></p>
    <div class="actions">${zuruecknehmen ? `<button type="button" class="btn btn-ghost" data-ls-zurueck="${esc(zuruecknehmen)}">Zurücknehmen…</button>` : ''}<button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${esc(knopfText)}</button></div></form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input, textarea')?.focus();
  return form;
}

function absenden(form, p, schritt, felderAus, meldung) {
  const fehler = msg => { const h = form.querySelector('[data-ls-fehler]'); h.textContent = msg; h.hidden = false; h.focus(); };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    let felder;
    try { felder = felderAus(new FormData(form)); } catch (err) { fehler(err.message); return; }
    btn.disabled = true;
    try { await schreiben({ orderId: p.orderId, lineItemId: p.lineItemId, schritt, felder }); $('#dialogRoot').innerHTML = ''; toast(meldung); }
    catch (err) { fehler(err.message); btn.disabled = false; }
  });
  form.querySelector('[data-ls-zurueck]')?.addEventListener('click', async ev => {
    const s = ev.currentTarget.dataset.lsZurueck;
    if (!window.confirm(s === 'abZurueck' ? 'AB-Vermerk zurücknehmen? Er bleibt im Verlauf der Position.' : 'Anfrage zurücknehmen? Sie bleibt im Verlauf der Position.')) return;
    try { await schreiben({ orderId: p.orderId, lineItemId: p.lineItemId, schritt: s, felder: {} }); $('#dialogRoot').innerHTML = ''; toast(s === 'abZurueck' ? 'AB zurückgenommen' : 'Anfrage zurückgenommen'); }
    catch (err) { fehler(err.message); }
  });
}

function openAnfrage(p) {
  const a = afEintragFuer(p)?.beschaffung?.anfrage;
  const vorschlag = a?.lieferant || (p.lieferant && p.lieferant !== 'UNGEKLAERT' ? lieferantName(p.lieferant, einkauf.lieferanten?.lieferanten || []) : '');
  const form = dialog('Lieferant angefragt', p, `
    <p class="small muted">Preis, Verfügbarkeit oder Konditionen beim Lieferanten angefragt – noch nicht bestellt.</p>
    <div class="field"><label for="lsAm">Angefragt am</label><input id="lsAm" name="am" type="date" required max="${esc(heute())}" value="${esc(a?.am || heute())}"></div>
    <div class="field"><label for="lsLief">Lieferant</label><input id="lsLief" name="lieferant" required maxlength="120" value="${esc(vorschlag)}"></div>
    <div class="field"><label for="lsNotiz">Was wurde gefragt? (optional)</label><textarea id="lsNotiz" name="notiz" rows="2" maxlength="1000">${esc(a?.notiz || '')}</textarea></div>`,
  'Anfrage speichern', { zuruecknehmen: a ? 'anfrageZurueck' : null });
  absenden(form, p, 'anfrage', fd => ({ am: fd.get('am'), lieferant: fd.get('lieferant'), notiz: fd.get('notiz') || null }), 'Lieferant angefragt');
}

function openBestelldaten(p) {
  const e = afEintragFuer(p);
  const best = e?.beschaffung?.bestellung || {};
  const form = dialog('Bestelldaten', p, `
    <div class="field"><label for="lsBAm">Bestellung abgeschickt am</label><input id="lsBAm" name="am" type="datetime-local" required value="${esc(ortszeit(e?.bestelltAm))}"></div>
    <div class="field"><label for="lsRef">Bestellreferenz beim Lieferanten (optional)</label><input id="lsRef" name="referenz" maxlength="200" value="${esc(e?.lieferantBestellnummer || '')}"></div>
    <div class="field"><label for="lsWeg">Lieferweg noch offen? (optional)</label><textarea id="lsWeg" name="lieferwegOffen" rows="2" maxlength="500" placeholder="z. B. bevorzugt direkt zum Kunden, sonst Abholung">${esc(best.lieferwegOffen || '')}</textarea></div>
    <div class="field"><label for="lsBNotiz">Notiz (optional)</label><textarea id="lsBNotiz" name="notiz" rows="2" maxlength="1000">${esc(best.notiz || '')}</textarea></div>
    <p class="small muted">Ändert nur die Angaben zur Bestellung. Der Schritt bleibt „Bestellt“, keine Nachricht, keine Shopify-Änderung.</p>`,
  'Speichern');
  absenden(form, p, 'bestelldaten', fd => {
    const t = new Date(String(fd.get('am') || ''));
    if (Number.isNaN(t.getTime())) throw new Error('Bestellzeitpunkt bitte mit Datum und Uhrzeit angeben.');
    return { am: t.toISOString(), referenz: fd.get('referenz') || null, lieferwegOffen: fd.get('lieferwegOffen') || null, notiz: fd.get('notiz') || null };
  }, 'Bestelldaten gespeichert');
}

/** Hilfen aus dem Mailauszug - nur Hinweise, uebernommen wird davon nichts. */
export function belegHinweise(p, beleg) {
  const text = String(beleg?.auszug || '');
  if (!text) return [];
  const hinweise = [];
  const masse = [...new Set((p.ausfuehrung || []).join(' ').match(/\d{2,4}(?:[.,]\d+)?/g) || [])].filter(n => Number(n.replace(',', '.')) >= 20);
  const fehlen = masse.filter(n => !text.includes(n));
  if (masse.length) hinweise.push(fehlen.length ? `Maße ${fehlen.join(', ')} stehen nicht im Mailauszug – im Anhang prüfen` : 'Unsere Maße stehen im Mailauszug');
  const zuschlag = text.match(/zuschlag|fracht|mindermenge|schnittkosten|verpackung|maut|energie|pauschale/i);
  if (zuschlag) hinweise.push(`Mailauszug nennt „${zuschlag[0]}“ – Zuschläge prüfen`);
  const weg = text.match(/abhol\w*|selbstabhol\w*|direktliefer\w*|lieferadresse|streckengesch\w*/i);
  if (weg) hinweise.push(`Mailauszug nennt „${weg[0]}“ – Lieferweg prüfen`);
  return hinweise;
}

function openAb(p, belegId = null) {
  const e = afEintragFuer(p);
  const ab = e?.beschaffung?.ab || null;
  const beleg = (belegId || ab?.belegId) ? belege.daten?.belege?.find(b => b.id === (belegId || ab?.belegId)) || null : null;
  const lw = lieferwegVon(p, e);
  const offen = e?.beschaffung?.bestellung?.lieferwegOffen;
  const pruefung = ab?.pruefung || {};
  const radio = (k, wert, text) => `<label style="display:inline-flex;align-items:center;gap:4px;margin:0 12px 0 0;font-weight:400"><input type="radio" style="width:auto;margin:0" name="p-${k}" value="${wert}" required ${pruefung[k] === wert ? 'checked' : ''}>${text}</label>`;
  const unsere = [
    ['Menge', p.kundenmenge || p.bestellmenge?.text],
    ['Maße', (p.ausfuehrung || []).join(' · ')],
    ['Lieferweg', [lw?.wort, offen ? `noch offen: ${offen}` : null].filter(Boolean).join(' · ')],
    ['Bestellreferenz', e?.lieferantBestellnummer],
  ].filter(([, v]) => v);
  const hinweise = belegHinweise(p, beleg);
  const form = dialog('Auftragsbestätigung prüfen', p, `
    <div class="notice"><b>Unsere Bestellung</b>${unsere.map(([k, v]) => `<div class="small">${esc(k)}: ${esc(v)}</div>`).join('')}</div>
    ${beleg ? `<div class="notice"><b>Beleg</b> <a href="${esc(beleg.viewUrl || '#')}" target="_blank" rel="noopener noreferrer">${esc(beleg.betreff || 'In Gmail öffnen')}</a><div class="small muted">${esc(String(beleg.auszug || '').slice(0, 600))}</div>${hinweise.map(h => `<div class="small wait-warn">${esc(h)}</div>`).join('')}</div>` : ''}
    <div class="field"><label for="lsNr">AB-Nummer</label><input id="lsNr" name="nummer" required maxlength="80" value="${esc(ab?.nummer || beleg?.refs?.belegnummer || '')}"></div>
    <div class="field"><label for="lsTermin">Bestätigter Liefertermin</label><input id="lsTermin" name="liefertermin" type="date" required value="${esc(e?.beschaffung?.liefertermin || '')}"></div>
    <div class="field"><label for="lsPreis">Preis laut AB (optional)</label><input id="lsPreis" name="preis" maxlength="80" placeholder="z. B. 312,40 € netto" value="${esc(ab?.preis || '')}"></div>
    <div class="field"><label for="lsLink">Gmail-Link oder Beleg (optional)</label><input id="lsLink" name="link" type="url" maxlength="500" value="${esc(ab?.link || beleg?.viewUrl || '')}"></div>
    <fieldset class="field"><legend>Mit unserer Bestellung verglichen</legend>
      ${Object.entries(AB_PRUEFPUNKTE).map(([k, t]) => `<div class="small" style="margin:4px 0;display:flex;flex-wrap:wrap;align-items:center"><b style="display:inline-block;min-width:90px">${esc(t)}</b>${radio(k, 'ok', 'stimmt')}${radio(k, 'abweichung', 'weicht ab')}</div>`).join('')}
    </fieldset>
    <div class="field"><label for="lsAbw">Was weicht ab? (Pflicht bei „weicht ab“)</label><textarea id="lsAbw" name="abweichung" rows="2" maxlength="1000">${esc(ab?.abweichung || '')}</textarea></div>
    <input type="hidden" name="belegId" value="${esc(beleg?.id || ab?.belegId || '')}">
    <p class="small muted">Du bestätigst, dass du die AB gelesen und verglichen hast. Der Schritt bleibt „Bestellt“; keine Nachricht, keine Shopify-Änderung.</p>`,
  'AB bestätigen', { zuruecknehmen: ab ? 'abZurueck' : null });
  absenden(form, p, 'ab', fd => {
    const pr = Object.fromEntries(Object.keys(AB_PRUEFPUNKTE).map(k => [k, fd.get(`p-${k}`)]));
    if (Object.values(pr).some(v => !v)) throw new Error('Bitte Menge, Maße, Lieferweg und Zuschläge einzeln beantworten.');
    if (Object.values(pr).includes('abweichung') && !String(fd.get('abweichung') || '').trim()) throw new Error('Bitte beschreiben, was abweicht.');
    return { nummer: fd.get('nummer'), liefertermin: fd.get('liefertermin'), preis: fd.get('preis') || null, link: fd.get('link') || null,
      belegId: fd.get('belegId') || null, pruefung: pr, abweichung: fd.get('abweichung') || null };
  }, 'AB geprüft und vermerkt');
}

/** Klicks: [data-ls-schritt] an der Position, [data-ls-ab-beleg] im Reiter "Belege". */
export function lieferantenstandKlick(e) {
  const k = e.target.closest('[data-ls-schritt], [data-ls-ab-beleg]');
  if (!k) return false;
  e.preventDefault();
  if (istNurLesend()) return true;
  const { afOrder, afItem, lsSchritt, lsAbBeleg } = k.dataset;
  const oeffne = p => {
    if (!p) { toast('Die Position ist nicht in den aktuellen Daten. Bitte die Bestellungen aktualisieren.', 'crit'); return; }
    const schritt = lsSchritt || 'ab';
    if (schritt === 'anfrage') openAnfrage(p);
    else if (schritt === 'bestelldaten') openBestelldaten(p);
    else openAb(p, lsAbBeleg || null);
  };
  const p = positionVon(afOrder, afItem);
  // Im Reiter "Belege" sind die Bestellungen evtl. noch nicht geladen: einmal nachladen, dann oeffnen.
  if (p) oeffne(p);
  else ladeStandNeu({ bestellungen: true }).then(() => oeffne(positionVon(afOrder, afItem))).catch(err => toast(err.message, 'crit'));
  return true;
}

