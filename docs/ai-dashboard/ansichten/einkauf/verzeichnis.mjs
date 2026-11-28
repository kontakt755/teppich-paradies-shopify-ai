/**
 * "Lieferanten" (#/einkauf?tab=lieferanten): eine Karte je Lieferant mit allem, was man zum
 * Oeffnen und Anrufen braucht - Haendlerportal, Telefon, E-Mail, unsere Kundennummer und was
 * dort offen ist. Ohne Tabellen und Positionen: die stehen eine Seite weiter ("Je Lieferant").
 */
import { esc, plural } from '../../kern/helfer.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { telLink } from '../../lib/einkauf-lieferanten.mjs';
import { einkauf, ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufLieferanten } from './auftragsfluss.mjs';
import { lieferantenListe } from './lieferanten.mjs';

const einmal = werte => [...new Set(werte.filter(Boolean))];

/** Reine Darstellung einer Karte; Ware und Muster teilen sich gleiche Kontakte. */
export function verzeichnisKarte(k) {
  const st = k.stammdaten || {};
  const wege = [st.ware || {}, st.muster || {}];
  const portale = einmal(wege.map(w => w.portalUrl));
  const telefone = einmal(wege.map(w => w.telefon));
  const mails = einmal(wege.map(w => w.mail));
  const offen = [
    k.zahlen?.zuBestellen ? `<span class="badge status warn">${k.zahlen.zuBestellen} Ware zu bestellen</span>` : '',
    k.zahlen?.musterOffen ? `<span class="badge status warn">${k.zahlen.musterOffen} Muster zu bestellen</span>` : '',
    k.ueberfaellig?.stufe ? `<span class="badge status ${k.ueberfaellig.stufe === 'crit' ? 'crit' : 'warn'}">${plural(k.ueberfaellig.auftraege, 'Auftrag', 'Aufträge')} nachfassen</span>` : '',
  ].join('');
  const knoepfe = [
    ...portale.map((u, i) => `<a class="btn${i ? '' : ' btn-primary'}" href="${esc(u)}" target="_blank" rel="noopener">${portale.length > 1 && i ? 'Musterportal' : 'Portal öffnen'} ↗</a>`),
    ...telefone.map(t => `<a class="btn" href="${esc(telLink(t))}">${esc(t)}</a>`),
  ].join('');
  return `<article class="card lv-karte">
    <h3 class="lf-name">${esc(k.name)}</h3>
    ${offen ? `<div class="lv-offen">${offen}</div>` : '<p class="small muted lv-offen">Nichts offen</p>'}
    ${knoepfe ? `<div class="lv-knoepfe">${knoepfe}</div>` : ''}
    <dl class="lf-kv">
      ${mails.length ? `<dt>E-Mail</dt><dd>${mails.map(m => `<a href="mailto:${esc(m)}">${esc(m)}</a>`).join('<br>')}</dd>` : ''}
      ${st.kundennummer ? `<dt>Kundennr.</dt><dd><code class="mono" data-kopiertext="${esc(st.kundennummer)}" title="Klicken zum Kopieren">${esc(st.kundennummer)}</code></dd>` : ''}
    </dl>
    <div class="lv-fuss"><a class="btn btn-sm" href="#/einkauf?${esc(new URLSearchParams({ tab: 'lieferant', lf: k.id }).toString())}">Bestellungen</a><a class="btn btn-sm btn-ghost" href="#/einkauf?lieferant=${esc(encodeURIComponent(k.id))}">Alle Angaben</a></div>
  </article>`;
}

export function viewLieferantenVerzeichnis() {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  ensureEinkaufLieferanten();
  const { bestellungen: b, lieferanten: l } = einkauf;
  if ((!b && einkauf.loadingBestellungen) || (!l && einkauf.loadingLieferanten)) return '<div class="empty">Lade Lieferanten …</div>';
  if (l?.fehler) return stoerungState(l, 'Die Lieferanten');
  const liste = lieferantenListe().filter(k => k.zugeordnet).sort((x, y) => x.name.localeCompare(y.name, 'de'));
  const hinweis = b?.fehler ? '<p class="notice warn">Die Bestellzahlen konnten nicht geladen werden. Kontakte stimmen.</p>' : '';
  if (!liste.length) return hinweis + emptyState('Keine Lieferanten hinterlegt.', l?.hinweis || '');
  return `${hinweis}<div class="lv-raster">${liste.map(verzeichnisKarte).join('')}</div>`;
}
