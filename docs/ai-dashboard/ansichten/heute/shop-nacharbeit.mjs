/** Nacharbeit aus bestehenden Shopdaten. Links lesen oder oeffnen vorhandene Arbeitswege. */
import { esc, plural } from '../../kern/helfer.mjs';
import { musterNachfassen } from '../../lib/muster-nachfassen.mjs';

export function shopNacharbeitBlock({ bestellungen = null, pack = null, nachfassen = null, texte = null } = {}) {
  const zeilen = bestellungen?.verfuegbar ? (bestellungen.zeilen || []).filter(z => !z.testbestellung && !z.storniert) : [];
  const bestellLink = z => `#/kunden?tab=bestellungen&bfilter=alle&bq=${encodeURIComponent(z.orderName || '')}`;
  const versandPruefen = zeilen.filter(z => z.shopifyVersandVermerk === 'nachholen' || z.versandHinweis);
  const unterwegs = zeilen.filter(z => {
    const raus = z.fulfillmentstatus === 'FULFILLED' || (z.fortschritt?.minStufe || 0) >= 3;
    const empfang = (z.verlauf || []).some(s => s.schritt === 'kunde_hat_muster' && s.zustand === 'erledigt');
    const tracking = z.auftrag?.sendungen || [];
    const zugestellt = tracking.length && tracking.every(s => String(s.status).toUpperCase() === 'DELIVERED');
    return raus && !empfang && !zugestellt && !z.zeitleisteAbgeschlossen;
  });
  const stopp = new Map((texte?.abgemeldet || []).map(e => [String(e.email || '').toLowerCase(), { am: e.am }]));
  const nach = nachfassen || (bestellungen?.verfuegbar && texte ? musterNachfassen(zeilen, { abgemeldet: stopp }) : null);
  const faelle = liste => liste.slice(0, 3).map(z => `<li><a href="${esc(bestellLink(z))}">${esc(z.orderName || 'Bestellung')} prüfen</a></li>`).join('');
  const fehlt = (daten, label) => !daten ? `<p role="status">${label} werden geladen …</p>` : daten.fehler || daten.verfuegbar === false ? `<p class="notice warn">${label} sind nicht verfügbar. Bitte die zugehörige Arbeitsliste prüfen.</p>` : '';
  const quellfehler = fehlt(bestellungen, 'Bestellungen');
  return `<section class="shop-nacharbeit" aria-labelledby="shopNacharbeit"><h2 id="shopNacharbeit">Versand &amp; Kunden nachfassen</h2>
    ${quellfehler || (versandPruefen.length ? `<div class="notice warn"><strong>${plural(versandPruefen.length, 'Versandbuchung braucht', 'Versandbuchungen brauchen')} Prüfung.</strong><ul>${faelle(versandPruefen)}</ul><a href="#/kunden?tab=bestellungen&amp;bfilter=pruefen">Alle Versandkontrollen →</a></div>` : '')}
    ${unterwegs.length ? `<details class="shop-nacharbeit-zeile"><summary>${plural(unterwegs.length, 'Bestellung ist', 'Bestellungen sind')} versandt, Empfang noch nicht belegt</summary><ul>${faelle(unterwegs)}</ul><p><a href="#/kunden?tab=bestellungen&amp;bfilter=fertig">Versandte Bestellungen ansehen →</a></p></details>` : ''}
    <div class="shop-nacharbeit-zeile">${fehlt(bestellungen, 'Nachfassgrundlagen') || fehlt(texte, 'Nachfassdaten') || `<p>${nach ? plural(nach.offen?.length || 0, 'Nachfrage ist', 'Nachfragen sind') + ' fällig.' : 'Nachfassstand noch nicht verfügbar.'} <a href="#/heute?mn=1">Nachfassliste öffnen →</a></p>`}
      ${texte?.versand?.letzterLauf?.fehler ? '<p class="notice warn">Der letzte Nachfasslauf meldet Fehler. Den vorhandenen Versandlauf prüfen.</p>' : ''}
    </div>
    <details class="shop-nacharbeit-zeile"><summary>Bewertungen: bestehenden Ablauf prüfen</summary><p>Für Warenbestellungen gibt es bereits einen Bewertungsablauf. Sein aktueller Live- und Versandstatus wird hier nicht geprüft. Gepackt und Porto vorbereitet sind noch kein Versandnachweis. Bewertungsbitten benötigen den passenden vorhandenen Ablauf und einen belegten Anlass.</p><a href="#/kunden?tab=bestellungen&amp;bfilter=fertig&amp;bart=ware">Abgeschlossene Warenbestellungen prüfen →</a></details>
  </section>`;
}
